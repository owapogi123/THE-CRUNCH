"use strict";

const crypto = require("crypto");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function intentError(message, statusCode = 400, code = "PAYMONGO_INTENT_INVALID") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function money(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw intentError(`${label} must be a valid non-negative amount`);
  }
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function cleanText(value, maxLength) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeSnapshotItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw intentError("Checkout intent requires authoritative items");
  }
  return items.map((item) => {
    const productId = Number(item?.product_id ?? item?.productId);
    const selectedFlavorProductId = Number(
      item?.selected_flavor_product_id ?? item?.selectedFlavorProductId,
    );
    const quantity = Number(item?.qty ?? item?.quantity);
    const price = money(item?.price, `Price for product ${productId}`);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw intentError("Checkout intent contains an invalid product ID");
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 999) {
      throw intentError(`Checkout intent contains an invalid quantity for product ${productId}`);
    }
    return {
      product_id: productId,
      qty: quantity,
      name: cleanText(item?.name, 255) || `Product #${productId}`,
      price,
      subtotal: money(price * quantity, `Subtotal for product ${productId}`),
      note: cleanText(item?.note, 2000),
      ...(Number.isSafeInteger(selectedFlavorProductId) && selectedFlavorProductId > 0
        ? {
            selected_flavor_product_id: selectedFlavorProductId,
            selected_flavor_name: cleanText(
              item?.selected_flavor_name ?? item?.selectedFlavorName,
              255,
            ),
          }
        : {}),
    };
  });
}

function parseItemsJson(value) {
  let parsed = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw intentError("Stored checkout intent items are invalid", 500, "PAYMONGO_INTENT_CORRUPT");
    }
  }
  return normalizeSnapshotItems(parsed);
}

function mapIntentRow(row) {
  if (!row) return null;
  return {
    intentId: String(row.intentId || row.intent_id || "").trim(),
    checkoutRequestId: String(row.checkoutRequestId || row.checkout_request_id || "").trim(),
    customerUserId: Number(row.customerUserId ?? row.customer_user_id),
    items: parseItemsJson(row.itemsJson ?? row.items_json),
    subtotal: Number(row.subtotal),
    taxRate: Number(row.taxRate ?? row.tax_rate),
    taxAmount: Number(row.taxAmount ?? row.tax_amount),
    serviceChargeRate: Number(row.serviceChargeRate ?? row.service_charge_rate),
    serviceChargeAmount: Number(row.serviceChargeAmount ?? row.service_charge_amount),
    totalAmount: Number(row.totalAmount ?? row.total_amount),
    amountCentavos: Number(row.amountCentavos ?? row.amount_centavos),
    currency: String(row.currency || "").trim().toUpperCase(),
    orderType: String(row.orderType || row.order_type || "take-out").trim(),
    customerType: cleanText(row.customerType ?? row.customer_type, 100),
    orderNote: cleanText(row.orderNote ?? row.order_note, 2000),
    paymentContextToken: String(row.paymentContextToken || row.payment_context_token || ""),
    checkoutSessionId: cleanText(row.checkoutSessionId ?? row.checkout_session_id, 100),
    checkoutUrl: cleanText(row.checkoutUrl ?? row.checkout_url, 2048),
    paymentReference: cleanText(row.paymentReference ?? row.payment_reference, 255),
    providerStatus: cleanText(row.providerStatus ?? row.provider_status, 50),
    livemode: row.livemode == null ? null : Boolean(Number(row.livemode)),
    status: String(row.status || "").trim(),
    verifiedAt: row.verifiedAt ?? row.verified_at ?? null,
    finalizedOrderId: Number(row.finalizedOrderId ?? row.finalized_order_id) || null,
    finalizedAt: row.finalizedAt ?? row.finalized_at ?? null,
    finalizationAttempts: Number(row.finalizationAttempts ?? row.finalization_attempts) || 0,
    reconciliationCode: cleanText(row.reconciliationCode ?? row.reconciliation_code, 100),
    reconciliationMessage: cleanText(row.reconciliationMessage ?? row.reconciliation_message, 500),
  };
}

const SELECT_INTENT = `SELECT
  intent_id AS intentId,
  checkout_request_id AS checkoutRequestId,
  customer_user_id AS customerUserId,
  items_json AS itemsJson,
  subtotal,
  tax_rate AS taxRate,
  tax_amount AS taxAmount,
  service_charge_rate AS serviceChargeRate,
  service_charge_amount AS serviceChargeAmount,
  total_amount AS totalAmount,
  amount_centavos AS amountCentavos,
  currency,
  order_type AS orderType,
  customer_type AS customerType,
  order_note AS orderNote,
  payment_context_token AS paymentContextToken,
  checkout_session_id AS checkoutSessionId,
  checkout_url AS checkoutUrl,
  payment_reference AS paymentReference,
  provider_status AS providerStatus,
  livemode,
  status,
  verified_at AS verifiedAt,
  finalized_order_id AS finalizedOrderId,
  finalized_at AS finalizedAt,
  finalization_attempts AS finalizationAttempts,
  reconciliation_code AS reconciliationCode,
  reconciliation_message AS reconciliationMessage
FROM paymongo_checkout_intents`;

async function getCheckoutIntent(connection, { intentId, checkoutSessionId, checkoutRequestId, forUpdate = false }) {
  const selectors = [
    ["intent_id", intentId],
    ["checkout_session_id", checkoutSessionId],
    ["checkout_request_id", checkoutRequestId],
  ].filter(([, value]) => String(value || "").trim());
  if (selectors.length !== 1) {
    throw intentError("Exactly one checkout intent selector is required", 500);
  }
  const [column, value] = selectors[0];
  const [rows] = await connection.query(
    `${SELECT_INTENT} WHERE ${column} = ? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [String(value).trim()],
  );
  return mapIntentRow(rows[0]);
}

function sameItems(left, right) {
  return JSON.stringify(normalizeSnapshotItems(left)) === JSON.stringify(normalizeSnapshotItems(right));
}

async function createOrLoadCheckoutIntent(connection, values) {
  const intentId = String(values.intentId || crypto.randomUUID()).trim();
  const checkoutRequestId = String(values.checkoutRequestId || "").trim();
  const customerUserId = Number(values.customerUserId);
  const amountCentavos = Number(values.amountCentavos);
  const currency = String(values.currency || "PHP").trim().toUpperCase();
  const items = normalizeSnapshotItems(values.items);
  if (!UUID_PATTERN.test(intentId) || !UUID_PATTERN.test(checkoutRequestId)) {
    throw intentError("Checkout intent and request IDs must be valid UUIDs");
  }
  if (!Number.isSafeInteger(customerUserId) || customerUserId <= 0) {
    throw intentError("Checkout intent requires an authenticated customer", 401);
  }
  if (!Number.isSafeInteger(amountCentavos) || amountCentavos <= 0 || currency !== "PHP") {
    throw intentError("Checkout intent amount or currency is invalid");
  }
  const paymentContextToken = String(values.paymentContextToken || "").trim();
  if (!paymentContextToken) throw intentError("Checkout intent payment context is required", 500);

  await connection.query(
    `INSERT INTO paymongo_checkout_intents
       (intent_id, checkout_request_id, customer_user_id, items_json,
        subtotal, tax_rate, tax_amount, service_charge_rate,
        service_charge_amount, total_amount, amount_centavos, currency,
        order_type, customer_type, order_note, payment_context_token, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'take-out', ?, ?, ?, 'pending_session')
     ON DUPLICATE KEY UPDATE intent_id = paymongo_checkout_intents.intent_id`,
    [
      intentId,
      checkoutRequestId,
      customerUserId,
      JSON.stringify(items),
      money(values.subtotal, "Checkout subtotal"),
      Number(values.taxRate || 0),
      money(values.taxAmount || 0, "Checkout tax"),
      Number(values.serviceChargeRate || 0),
      money(values.serviceChargeAmount || 0, "Checkout service charge"),
      money(values.totalAmount, "Checkout total"),
      amountCentavos,
      currency,
      cleanText(values.customerType, 100),
      cleanText(values.orderNote, 2000),
      paymentContextToken,
    ],
  );
  const intent = await getCheckoutIntent(connection, { checkoutRequestId });
  if (!intent) throw intentError("Checkout intent could not be persisted", 500);
  if (
    intent.customerUserId !== customerUserId ||
    intent.amountCentavos !== amountCentavos ||
    intent.currency !== currency ||
    !sameItems(intent.items, items)
  ) {
    throw intentError(
      "Checkout request ID was already used for different order details",
      409,
      "PAYMONGO_INTENT_MISMATCH",
    );
  }
  return intent;
}

async function attachCheckoutSession(connection, intentId, session) {
  const checkoutSessionId = String(session?.checkoutSessionId || "").trim();
  const checkoutUrl = String(session?.checkoutUrl || "").trim();
  if (!checkoutSessionId || !checkoutUrl) {
    throw intentError("PayMongo did not return a valid checkout session", 502);
  }
  const [result] = await connection.query(
    `UPDATE paymongo_checkout_intents
        SET checkout_session_id = ?, checkout_url = ?, provider_status = ?,
            status = 'awaiting_payment'
      WHERE intent_id = ?
        AND (checkout_session_id IS NULL OR checkout_session_id = ?)`,
    [checkoutSessionId, checkoutUrl, cleanText(session.status, 50), intentId, checkoutSessionId],
  );
  if (Number(result?.affectedRows || 0) !== 1) {
    throw intentError("Checkout intent is already bound to another session", 409, "PAYMONGO_SESSION_MISMATCH");
  }
  return getCheckoutIntent(connection, { intentId });
}

module.exports = {
  UUID_PATTERN,
  attachCheckoutSession,
  createOrLoadCheckoutIntent,
  getCheckoutIntent,
  mapIntentRow,
  normalizeSnapshotItems,
};
