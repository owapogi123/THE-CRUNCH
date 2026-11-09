"use strict";

const db = require("../config/db");
const { sendCustomerOrderReceiptEmail } = require("./emailService");
const {
  deductPrevalidatedStockForPaidOrder,
  prepareRedesignedOrderItemsAndStock,
  prepareOrderItemsAndStock,
} = require("./inventoryService");
const {
  getSchemaProfile,
  REDESIGNED_SCHEMA_PROFILE,
} = require("../db/schemaProfile");
const { publishOrderMutation } = require("./applicationEvents");
const {
  allocateOrderIdentifiers,
  formatOrderNumber,
} = require("./orderIdentifierService");
const {
  calculateBillingTotals,
  loadCashierOrderConfiguration,
} = require("./orderConfigurationService");
const {
  getOrderItemIdentity,
  normalizeOrderItems,
} = require("./orderItemService");
const {
  getCheckoutIntent,
} = require("./paymongoCheckoutIntentService");
const {
  verifyPayMongoCheckoutSession,
} = require("./paymongoCheckoutService");
const {
  findProtectedPaymentReference,
  getProtectedPaymentReferenceLockName,
} = require("./paymentReferencePolicy");
const {
  createReceiptSnapshot,
  loadReceiptDto,
} = require("./receiptSnapshotService");

const FINALIZED = "finalized";
const RECONCILIATION_REQUIRED = "reconciliation_required";

function finalizationError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanErrorCode(error) {
  const candidate = String(error?.code || "PAYMONGO_FINALIZATION_FAILED")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_");
  return candidate.slice(0, 100) || "PAYMONGO_FINALIZATION_FAILED";
}

function cleanErrorMessage(error) {
  return String(error?.message || "Paid checkout requires manual reconciliation")
    .trim()
    .slice(0, 500);
}

function itemFingerprint(items) {
  return normalizeOrderItems(items)
    .sort((left, right) =>
      left.product_id - right.product_id ||
      Number(left.selected_flavor_product_id || 0) -
        Number(right.selected_flavor_product_id || 0),
    )
    .map(
      (item) =>
        `${item.product_id}:${item.qty}:${item.selected_flavor_product_id || 0}`,
    )
    .join("|");
}

function validateIntentBinding(intent, {
  checkoutSessionId,
  customerUserId,
  intentId,
  amountCentavos,
  currency,
  items,
}) {
  if (!intent) {
    throw finalizationError(
      "PayMongo checkout intent was not found",
      404,
      "PAYMONGO_INTENT_NOT_FOUND",
    );
  }
  if (intentId && intent.intentId !== String(intentId)) {
    throw finalizationError("PayMongo intent binding does not match", 409, "PAYMONGO_INTENT_MISMATCH");
  }
  if (checkoutSessionId && intent.checkoutSessionId !== String(checkoutSessionId)) {
    throw finalizationError("PayMongo session binding does not match", 409, "PAYMONGO_SESSION_MISMATCH");
  }
  if (customerUserId != null && intent.customerUserId !== Number(customerUserId)) {
    throw finalizationError("PayMongo customer binding does not match", 403, "PAYMONGO_CUSTOMER_MISMATCH");
  }
  if (amountCentavos != null && intent.amountCentavos !== Number(amountCentavos)) {
    throw finalizationError("PayMongo amount binding does not match", 409, "PAYMONGO_AMOUNT_MISMATCH");
  }
  if (currency && intent.currency !== String(currency).trim().toUpperCase()) {
    throw finalizationError("PayMongo currency binding does not match", 409, "PAYMONGO_CURRENCY_MISMATCH");
  }
  if (items && itemFingerprint(intent.items) !== itemFingerprint(items)) {
    throw finalizationError("PayMongo cart binding does not match", 409, "PAYMONGO_CART_MISMATCH");
  }
}

async function loadFinalizedOrder(connection, intent, loadReceipt = loadReceiptDto) {
  const redesigned = getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
  const [rows] = await connection.query(
    `SELECT ${redesigned ? "order_id" : "Order_ID"} AS orderId, transaction_id AS transactionId,
            order_number AS orderNumberValue, business_date AS businessDate,
            ${redesigned ? "status" : "Status"} AS trackingStatus
       FROM orders
      WHERE ${redesigned ? "order_id" : "Order_ID"} = ?
      LIMIT 1`,
    [intent.finalizedOrderId],
  );
  if (!rows.length) {
    throw finalizationError(
      "Checkout intent references a missing finalized order",
      500,
      "PAYMONGO_FINALIZED_ORDER_MISSING",
    );
  }
  const order = rows[0];
  return {
    message: "Order already finalized",
    orderId: Number(order.orderId),
    id: Number(order.orderId),
    transactionId: order.transactionId,
    orderNumber: formatOrderNumber(order.orderNumberValue, order.orderId),
    businessDate: order.businessDate,
    trackingStatus: order.trackingStatus,
    receipt: await loadReceipt(connection, order.orderId),
    alreadyFinalized: true,
  };
}

async function persistVerifiedPayment(pool, intent, proof, providerEvent = null) {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const locked = await getCheckoutIntent(connection, {
      intentId: intent.intentId,
      forUpdate: true,
    });
    validateIntentBinding(locked, {
      intentId: intent.intentId,
      checkoutSessionId: proof.checkoutSessionId,
      customerUserId: proof.customerUserId,
      amountCentavos: proof.expectedAmountCentavos,
      currency: proof.currency,
    });

    let duplicateEvent = false;
    if (providerEvent) {
      const [eventResult] = await connection.query(
        `INSERT IGNORE INTO paymongo_webhook_events
           (event_id, event_type, checkout_session_id, customer_user_id,
            payment_reference, expected_amount_centavos, paid_amount_centavos,
            currency, livemode, provider_created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          providerEvent.eventId,
          providerEvent.eventType,
          proof.checkoutSessionId,
          proof.customerUserId,
          proof.paymentReference,
          proof.expectedAmountCentavos,
          proof.paidAmountCentavos ?? proof.expectedAmountCentavos,
          proof.currency,
          providerEvent.liveMode ? 1 : 0,
          providerEvent.providerCreatedAt,
        ],
      );
      duplicateEvent = Number(eventResult?.affectedRows || 0) === 0;
    }

    if (!locked.finalizedOrderId) {
      await connection.query(
        `UPDATE paymongo_checkout_intents
            SET payment_reference = ?, provider_status = 'paid',
                livemode = ?, status = 'payment_verified', verified_at = NOW(),
                reconciliation_code = NULL, reconciliation_message = NULL
          WHERE intent_id = ? AND finalized_order_id IS NULL`,
        [
          proof.paymentReference,
          proof.livemode == null ? providerEvent?.liveMode ?? null : proof.livemode ? 1 : 0,
          locked.intentId,
        ],
      );
    }
    await connection.commit();
    transactionStarted = false;
    return { duplicateEvent, finalizedOrderId: locked.finalizedOrderId };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordReconciliation(pool, intentId, error) {
  const [result] = await pool.query(
    `UPDATE paymongo_checkout_intents
        SET status = ?, finalization_attempts = finalization_attempts + 1,
            reconciliation_code = ?, reconciliation_message = ?
      WHERE intent_id = ? AND finalized_order_id IS NULL`,
    [RECONCILIATION_REQUIRED, cleanErrorCode(error), cleanErrorMessage(error), intentId],
  );
  return Number(result?.affectedRows || 0) > 0;
}

async function createPaidOrder(pool, intent, proof, dependencies) {
  const redesigned = getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let paymentReferenceLockName = null;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const locked = await getCheckoutIntent(connection, {
      intentId: intent.intentId,
      forUpdate: true,
    });
    validateIntentBinding(locked, {
      intentId: intent.intentId,
      checkoutSessionId: proof.checkoutSessionId,
      customerUserId: proof.customerUserId,
      amountCentavos: proof.expectedAmountCentavos,
      currency: proof.currency,
    });
    if (locked.finalizedOrderId) {
      const existing = await loadFinalizedOrder(
        connection,
        locked,
        dependencies.loadReceiptDto,
      );
      await connection.commit();
      transactionStarted = false;
      return { ...existing, created: false, intent: locked };
    }
    if (!["payment_verified", RECONCILIATION_REQUIRED].includes(locked.status)) {
      throw finalizationError(
        "Checkout intent does not contain a durable verified payment",
        409,
        "PAYMONGO_PAYMENT_NOT_VERIFIED",
      );
    }

    paymentReferenceLockName = getProtectedPaymentReferenceLockName(
      proof.paymentReference,
    );
    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK(?, 10) AS acquired",
      [paymentReferenceLockName],
    );
    if (Number(lockRow?.acquired) !== 1) {
      throw finalizationError(
        "Payment confirmation is already being processed; please retry",
        409,
        "PAYMONGO_PAYMENT_LOCK_TIMEOUT",
      );
    }
    const existingReference = await findProtectedPaymentReference(
      connection,
      proof.paymentReference,
    );
    if (existingReference) {
      const [existingRows] = await connection.query(
        `SELECT customer_user_id AS customerUserId, payment_status AS paymentStatus
           FROM orders WHERE ${redesigned ? "order_id" : "Order_ID"} = ? LIMIT 1`,
        [existingReference.Order_ID],
      );
      const existingOrder = existingRows[0];
      if (
        !existingOrder ||
        Number(existingOrder.customerUserId) !== locked.customerUserId ||
        String(existingOrder.paymentStatus || "").trim().toLowerCase() !== "paid"
      ) {
        throw finalizationError(
          "This payment reference is already assigned to another order",
          409,
          "PAYMONGO_PAYMENT_REFERENCE_REUSED",
        );
      }
      await connection.query(
        `UPDATE paymongo_checkout_intents
            SET status = ?, finalized_order_id = ?, finalized_at = NOW(),
                reconciliation_code = NULL, reconciliation_message = NULL
          WHERE intent_id = ? AND finalized_order_id IS NULL`,
        [FINALIZED, existingReference.Order_ID, locked.intentId],
      );
      const linkedIntent = {
        ...locked,
        status: FINALIZED,
        finalizedOrderId: Number(existingReference.Order_ID),
      };
      const existing = await loadFinalizedOrder(
        connection,
        linkedIntent,
        dependencies.loadReceiptDto,
      );
      await connection.commit();
      transactionStarted = false;
      return { ...existing, created: false, intent: linkedIntent };
    }

    const [customerRows] = await connection.query(
      `SELECT id, username, email, role, email_verified
         FROM users
        WHERE id = ? AND role IN ('customer', 'user')
        LIMIT 1`,
      [locked.customerUserId],
    );
    if (!customerRows.length) {
      throw finalizationError("Checkout customer account was not found", 404, "PAYMONGO_CUSTOMER_NOT_FOUND");
    }
    const customer = customerRows[0];
    if (Number(customer.email_verified) !== 1) {
      throw finalizationError(
        "Checkout customer email is not verified",
        403,
        "PAYMONGO_CUSTOMER_UNVERIFIED",
      );
    }
    const stockPlan = await dependencies.prepareOrderItemsAndStock(
      connection,
      locked.items,
    );
    if (itemFingerprint(stockPlan.authoritativeItems) !== itemFingerprint(locked.items)) {
      throw finalizationError("Stored checkout items no longer match inventory products", 409, "PAYMONGO_CART_MISMATCH");
    }

    const snapshotSubtotal = Math.round(
      locked.items.reduce((sum, item) => sum + Number(item.subtotal), 0) * 100,
    ) / 100;
    const storedTotals = calculateBillingTotals(snapshotSubtotal, {
      taxRate: locked.taxRate,
      serviceCharge: locked.serviceChargeRate,
    });
    const storedAmountCentavos = Math.round(storedTotals.grandTotal * 100);
    if (
      storedAmountCentavos !== locked.amountCentavos ||
      storedAmountCentavos !== proof.expectedAmountCentavos ||
      Math.abs(storedTotals.taxAmount - locked.taxAmount) > 0.009 ||
      Math.abs(storedTotals.serviceChargeAmount - locked.serviceChargeAmount) > 0.009
    ) {
      throw finalizationError("Stored checkout totals do not match the verified payment", 409, "PAYMONGO_AMOUNT_MISMATCH");
    }

    const configuration = await dependencies.loadCashierOrderConfiguration(connection, "", null);
    const identifiers = await dependencies.allocateOrderIdentifiers(connection, "take-out");
    const [orderResult] = await connection.query(
      redesigned
        ? `INSERT INTO orders
             (transaction_id, business_date, order_number, customer_user_id,
              customer_name_snapshot, order_type, status, subtotal, tax_rate,
              tax_amount, service_charge_rate, service_charge_amount,
              total_amount, currency, customer_type, order_note,
              payment_reference, payment_status, payment_method, verified_at)
           VALUES (?, ?, ?, ?, ?, 'take-out', 'Awaiting Cashier Review', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'GCash', NOW())`
        : `INSERT INTO orders
             (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status,
              customer_user_id, payment_reference, payment_status, payment_method,
              proof_image_url, verified_by, verified_at, transaction_id,
              order_number, business_date)
           VALUES (?, NULL, NULL, 'take-out', 'Awaiting Cashier Review', ?, ?,
                   'Paid', 'GCash', NULL, NULL, NOW(), ?, ?, ?)`,
      redesigned
        ? [
            identifiers.transactionId,
            identifiers.businessDate,
            identifiers.orderNumberValue,
            locked.customerUserId,
            String(customer.username || "").trim() || null,
            storedTotals.subtotal,
            locked.taxRate,
            locked.taxAmount,
            locked.serviceChargeRate,
            locked.serviceChargeAmount,
            locked.totalAmount,
            locked.currency,
            locked.customerType,
            locked.orderNote,
            proof.paymentReference,
          ]
        : [
            locked.totalAmount,
            locked.customerUserId,
            proof.paymentReference,
            identifiers.transactionId,
            identifiers.orderNumberValue,
            identifiers.businessDate,
          ],
    );
    const orderId = Number(orderResult.insertId);
    const storedItemsByIdentity = new Map(
      locked.items.map((item) => [
        getOrderItemIdentity(
          item.product_id,
          item.selected_flavor_product_id ?? null,
        ),
        item,
      ]),
    );
    const finalItems = stockPlan.authoritativeItems.map((item) => ({
      ...item,
      note:
        storedItemsByIdentity.get(
          getOrderItemIdentity(
            item.product_id,
            item.selected_flavor_product_id ?? null,
          ),
        )?.note || null,
    }));
    const itemPlaceholders = finalItems
      .map(() => redesigned ? "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" : "(?, ?, ?, ?)")
      .join(", ");
    await connection.query(
      redesigned
        ? `INSERT INTO order_items
             (order_id, product_id, product_name_snapshot, unit_price, quantity,
              line_subtotal, selected_option_product_id,
              selected_option_name_snapshot, item_note, sort_order)
           VALUES ${itemPlaceholders}`
        : `INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal)
           VALUES ${itemPlaceholders}`,
      finalItems.flatMap((item, index) =>
        redesigned
          ? [
              orderId,
              item.product_id,
              item.name,
              item.price,
              item.qty,
              item.subtotal,
              item.selected_flavor_product_id ?? null,
              item.selected_flavor_name ?? null,
              item.note || null,
              index,
            ]
          : [orderId, item.product_id, item.qty, item.subtotal],
      ),
    );
    await connection.query(
      redesigned
        ? `INSERT INTO payments
             (order_id, payment_method, payment_status, amount,
              external_reference, processed_by_user_id, paid_at)
           VALUES (?, 'GCash', 'Completed', ?, ?, NULL, NOW())`
        : `INSERT INTO payments (Order_ID, Payment_Type, Payment_Status, ProcessBy)
           VALUES (?, 'GCash', 'Completed', NULL)`,
      redesigned
        ? [orderId, locked.totalAmount, proof.paymentReference]
        : [orderId],
    );
    const receipt = await dependencies.createReceiptSnapshot(connection, {
      orderId,
      transactionId: identifiers.transactionId,
      orderNumberValue: identifiers.orderNumberValue,
      orderType: "take-out",
      currentStatus: "Awaiting Cashier Review",
      currentPaymentStatus: "Paid",
      paymentMethod: "GCash",
      subtotal: storedTotals.subtotal,
      discountName: null,
      discountRate: 0,
      discountAmount: 0,
      taxRate: locked.taxRate,
      taxAmount: locked.taxAmount,
      serviceChargeRate: locked.serviceChargeRate,
      serviceChargeAmount: locked.serviceChargeAmount,
      total: locked.totalAmount,
      amountPaid: locked.totalAmount,
      cashTendered: null,
      changeAmount: null,
      customerType: locked.customerType,
      soldToName: String(customer.username || "").trim() || null,
      cashierName: null,
      tableNumber: null,
      orderNote: locked.orderNote,
      currency: locked.currency,
      merchantName: configuration.receiptSettings.restaurantName,
      merchantTagline: configuration.receiptSettings.tagline,
      merchantEmail: configuration.receiptSettings.email,
      merchantPhone: configuration.receiptSettings.phone,
      merchantAddress: configuration.receiptSettings.address,
      timezone: configuration.receiptSettings.timezone,
      items: finalItems,
    });
    if (!redesigned) {
      await dependencies.deductPrevalidatedStockForPaidOrder(
        orderId,
        "Paid",
        stockPlan.deductions,
        null,
        connection,
      );
    }
    const [intentUpdate] = await connection.query(
      `UPDATE paymongo_checkout_intents
          SET status = ?, finalized_order_id = ?, finalized_at = NOW(),
              finalization_attempts = finalization_attempts + 1,
              reconciliation_code = NULL, reconciliation_message = NULL
        WHERE intent_id = ? AND finalized_order_id IS NULL`,
      [FINALIZED, orderId, locked.intentId],
    );
    if (Number(intentUpdate?.affectedRows || 0) !== 1) {
      throw finalizationError("Checkout intent was finalized concurrently", 409, "PAYMONGO_FINALIZATION_CONFLICT");
    }
    await connection.commit();
    transactionStarted = false;

    const response = {
      message: "Order placed",
      orderId,
      id: orderId,
      transactionId: identifiers.transactionId,
      orderNumber: identifiers.orderNumber,
      businessDate: identifiers.businessDate,
      trackingStatus: "Awaiting Cashier Review",
      receipt,
      alreadyFinalized: false,
      created: true,
      intent: { ...locked, finalizedOrderId: orderId, status: FINALIZED },
      customer,
      items: locked.items,
      totals: storedTotals,
    };
    return response;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    if (paymentReferenceLockName) {
      await connection
        .query("SELECT RELEASE_LOCK(?)", [paymentReferenceLockName])
        .catch(() => undefined);
    }
    connection.release();
  }
}

async function finalizePayMongoCheckoutIntent(options, overrides = {}) {
  const dependencies = {
    pool: overrides.pool || db,
    verifyPayMongoCheckoutSession:
      overrides.verifyPayMongoCheckoutSession || verifyPayMongoCheckoutSession,
    prepareOrderItemsAndStock:
      overrides.prepareOrderItemsAndStock ||
      (getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE
        ? prepareRedesignedOrderItemsAndStock
        : prepareOrderItemsAndStock),
    deductPrevalidatedStockForPaidOrder:
      overrides.deductPrevalidatedStockForPaidOrder || deductPrevalidatedStockForPaidOrder,
    allocateOrderIdentifiers:
      overrides.allocateOrderIdentifiers || allocateOrderIdentifiers,
    loadCashierOrderConfiguration:
      overrides.loadCashierOrderConfiguration || loadCashierOrderConfiguration,
    createReceiptSnapshot:
      overrides.createReceiptSnapshot || createReceiptSnapshot,
    loadReceiptDto: overrides.loadReceiptDto || loadReceiptDto,
    publishOrderMutation: overrides.publishOrderMutation || publishOrderMutation,
    sendCustomerOrderReceiptEmail:
      overrides.sendCustomerOrderReceiptEmail || sendCustomerOrderReceiptEmail,
  };
  const pool = dependencies.pool;
  const selector = options.intentId
    ? { intentId: options.intentId }
    : { checkoutSessionId: options.checkoutSessionId };
  const intent = await getCheckoutIntent(pool, selector);
  validateIntentBinding(intent, {
    intentId: options.webhookVerification?.intentId || options.intentId,
    checkoutSessionId: options.checkoutSessionId || intent?.checkoutSessionId,
    customerUserId: options.webhookVerification?.customerUserId ?? options.customerUserId,
    amountCentavos: options.webhookVerification?.expectedAmountCentavos,
    currency: options.webhookVerification?.currency,
    items: options.items,
  });
  const checkoutSessionId = options.checkoutSessionId || intent.checkoutSessionId;

  let eventPersistence = { duplicateEvent: false };
  if (options.webhookVerification) {
    eventPersistence = await persistVerifiedPayment(
      pool,
      intent,
      options.webhookVerification,
      options.providerEvent,
    );
  }

  let providerProof;
  try {
    providerProof = await dependencies.verifyPayMongoCheckoutSession(checkoutSessionId, {
      customerUserId: intent.customerUserId,
      items: intent.items,
      expectedAmountCentavos: intent.amountCentavos,
      intentId: intent.intentId,
    });
    if (!providerProof.paid) {
      throw finalizationError("PayMongo checkout is not paid", 409, "PAYMONGO_CHECKOUT_UNPAID");
    }
    providerProof = {
      ...providerProof,
      customerUserId: intent.customerUserId,
      paidAmountCentavos: intent.amountCentavos,
    };
    if (
      options.webhookVerification?.paymentReference &&
      providerProof.paymentReference !== options.webhookVerification.paymentReference
    ) {
      throw finalizationError(
        "Webhook and PayMongo API payment references do not match",
        409,
        "PAYMONGO_REFERENCE_MISMATCH",
      );
    }
    if (!options.webhookVerification) {
      eventPersistence = await persistVerifiedPayment(pool, intent, providerProof);
    }
  } catch (error) {
    if (options.webhookVerification) {
      error.reconciliationRecorded = await recordReconciliation(pool, intent.intentId, error)
        .catch(() => false);
      error.intentId = intent.intentId;
    }
    throw error;
  }

  let result;
  try {
    result = await createPaidOrder(pool, intent, providerProof, dependencies);
  } catch (error) {
    error.reconciliationRecorded = await recordReconciliation(pool, intent.intentId, error)
      .catch(() => false);
    error.intentId = intent.intentId;
    throw error;
  }

  if (result.created) {
    dependencies.publishOrderMutation({
      reason: "order.created",
      customerUserId: intent.customerUserId,
      paymentChanged: true,
      inventoryChanged: getSchemaProfile() !== REDESIGNED_SCHEMA_PROFILE,
    });
    const email = String(result.customer?.email || "").trim().toLowerCase();
    if (email) {
      try {
        await dependencies.sendCustomerOrderReceiptEmail({
          to: email,
          customerName: String(result.customer?.username || "").trim() || "Customer",
          order: {
            orderNumber: result.orderNumber,
            transactionId: result.transactionId,
            orderType: "take-out",
            paymentMethod: "GCash",
            paymentStatus: "Paid",
            subtotal: result.totals.subtotal,
            taxAmount: result.totals.taxAmount,
            serviceChargeAmount: result.totals.serviceChargeAmount,
            total: result.intent.totalAmount,
            items: result.items,
            note: "Your payment has been verified. We are preparing your order.",
          },
        });
      } catch (error) {
        console.error("Customer receipt email failed", error?.message || error);
      }
    }
  }

  return {
    ...result,
    duplicateEvent: eventPersistence.duplicateEvent,
    intentId: intent.intentId,
  };
}

module.exports = {
  FINALIZED,
  RECONCILIATION_REQUIRED,
  finalizePayMongoCheckoutIntent,
  validateIntentBinding,
};
