const crypto = require("crypto");
const router = require("express").Router();
const db = require("../config/db");
const { isPayMongoEnabled } = require("../services/paymongoMode");
const {
  getOrderItemIdentity,
  loadAuthoritativeOrderItems,
} = require("../services/orderItemService");
const {
  prepareRedesignedOrderItemsAndStock,
} = require("../services/inventoryService");
const {
  getSchemaProfile,
  REDESIGNED_SCHEMA_PROFILE,
} = require("../db/schemaProfile");
const { requireAuthenticatedUser } = require("../middleware/cookViewAccess");
const { isSuperuserRole, normalizeRole } = require("../middleware/roleAccess");
const {
  createCheckoutContextToken,
  payMongoRequest,
  verifyPayMongoCheckoutSession,
} = require("../services/paymongoCheckoutService");
const { processPayMongoWebhook } = require("../services/paymongoWebhookService");
const {
  attachCheckoutSession,
  createOrLoadCheckoutIntent,
  getCheckoutIntent,
} = require("../services/paymongoCheckoutIntentService");
const {
  finalizePayMongoCheckoutIntent,
} = require("../services/paymongoOrderFinalizationService");
const {
  calculateBillingTotals,
  loadCashierOrderConfiguration,
} = require("../services/orderConfigurationService");
const { collectOrderItemNotes } = require("../services/receiptSnapshotService");

const CHECKOUT_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getPayMongoSuccessUrl() {
  return String(process.env.PAYMONGO_SUCCESS_URL || "").trim();
}

function getPayMongoCancelUrl() {
  return String(process.env.PAYMONGO_CANCEL_URL || "").trim();
}

function validateReturnUrl(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    const error = new Error(`${variableName} must be a valid absolute URL`);
    error.statusCode = 500;
    throw error;
  }
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && (process.env.NODE_ENV === "production" || !localHost)) {
    const error = new Error(`${variableName} must use HTTPS`);
    error.statusCode = 500;
    throw error;
  }
  if (process.env.NODE_ENV === "production" && localHost) {
    const error = new Error(`${variableName} cannot use localhost in production`);
    error.statusCode = 500;
    throw error;
  }
  return url.toString();
}

function requireCustomerCheckoutActor(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (role === "customer" || role === "user") return next();
  return res.status(403).json({ message: "Customer checkout access required" });
}

async function createCheckoutHandler(req, res) {
  try {
    const {
      items,
      checkoutRequestId,
      customerType,
      customer_type,
      orderNote,
      order_note,
    } = req.body || {};
    const customerUserId = Number(req.user?.userId);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }
    if (!CHECKOUT_REQUEST_ID_PATTERN.test(String(checkoutRequestId || ""))) {
      return res.status(400).json({ message: "A valid checkout request ID is required" });
    }

    const [customerRows] = await db.query(
      `SELECT username, email, email_verified
         FROM users
        WHERE id = ?
          AND role IN ('customer', 'user')
        LIMIT 1`,
      [customerUserId],
    );
    if (!customerRows.length) {
      return res.status(404).json({ message: "Customer account not found" });
    }
    if (Number(customerRows[0].email_verified) !== 1) {
      return res.status(403).json({
        message: "Please verify your email before placing an order.",
      });
    }
    const customerName = String(customerRows[0].username || "").trim();
    const customerEmail = String(customerRows[0].email || "").trim().toLowerCase();

    const notesByProduct = collectOrderItemNotes(items);
    const loadedItems =
      getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE
        ? (
            await prepareRedesignedOrderItemsAndStock(db, items, {
              requireChickenFlavorForMenuFood: true,
            })
          ).authoritativeItems
        : await loadAuthoritativeOrderItems(db, items);
    const authoritativeItems = loadedItems.map((item) => ({
      ...item,
      note:
        notesByProduct.get(
          getOrderItemIdentity(
            item.product_id,
            item.selected_flavor_product_id ?? null,
          ),
        ) || null,
    }));
    const configuration = await loadCashierOrderConfiguration(db, "", null);
    const subtotal = authoritativeItems.reduce(
      (sum, item) => sum + Number(item.subtotal || 0),
      0,
    );
    const totals = calculateBillingTotals(subtotal, configuration.billingSettings);
    const totalPesos = totals.grandTotal;
    const totalAmount = Math.round(totalPesos * 100);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res
        .status(400)
        .json({ message: "A valid total amount is required" });
    }

    if (!isPayMongoEnabled()) {
      return res.status(503).json({
        message: "PayMongo checkout is not enabled",
      });
    }

    const configuredSuccessUrl = getPayMongoSuccessUrl();
    const configuredCancelUrl = getPayMongoCancelUrl();
    if (!configuredSuccessUrl || !configuredCancelUrl) {
      return res.status(500).json({
        message:
          "PAYMONGO_SUCCESS_URL and PAYMONGO_CANCEL_URL must be configured",
      });
    }
    const successUrl = validateReturnUrl(configuredSuccessUrl, "PAYMONGO_SUCCESS_URL");
    const cancelUrl = validateReturnUrl(configuredCancelUrl, "PAYMONGO_CANCEL_URL");

    if (totalPesos < 20) {
      return res.status(400).json({
        message:
          "PayMongo QRPh requires an order total of at least PHP 20.00.",
      });
    }

    const intentId = crypto.randomUUID();
    const paymentContext = createCheckoutContextToken({
      customerUserId,
      items: authoritativeItems,
      expectedAmountCentavos: totalAmount,
      intentId,
      checkoutRequestId,
    });
    const intent = await createOrLoadCheckoutIntent(db, {
      intentId,
      checkoutRequestId,
      customerUserId,
      items: authoritativeItems,
      subtotal: totals.subtotal,
      taxRate: configuration.billingSettings.taxRate,
      taxAmount: totals.taxAmount,
      serviceChargeRate: configuration.billingSettings.serviceCharge,
      serviceChargeAmount: totals.serviceChargeAmount,
      totalAmount: totals.grandTotal,
      amountCentavos: totalAmount,
      currency: "PHP",
      customerType: customer_type || customerType,
      orderNote: order_note || orderNote,
      paymentContextToken: paymentContext,
    });
    if (intent.checkoutSessionId && intent.checkoutUrl) {
      return res.json({
        checkoutSessionId: intent.checkoutSessionId,
        checkoutUrl: intent.checkoutUrl,
        status: intent.providerStatus || intent.status,
        intentId: intent.intentId,
        orderId: intent.finalizedOrderId,
      });
    }

    const lineItems = intent.items.map((item) => ({
      amount: Math.round(Number(item.price || 0) * 100),
      currency: "PHP",
      description: item.name,
      name: item.name,
      quantity: Math.max(1, Number(item.qty || item.quantity || 1)),
    }));
    const productLineTotal = lineItems.reduce(
      (sum, lineItem) => sum + lineItem.amount * lineItem.quantity,
      0,
    );
    const billingAdjustment = intent.amountCentavos - productLineTotal;
    if (billingAdjustment < 0) {
      return res.status(409).json({
        message: "Authoritative checkout line items do not match the order total",
      });
    }
    if (billingAdjustment > 0) {
      lineItems.push({
        amount: billingAdjustment,
        currency: "PHP",
        description: "Tax and service charge",
        name: "Tax and service charge",
        quantity: 1,
      });
    }

    const payload = {
      data: {
        attributes: {
          billing: {
            name: customerName || "The Crunch Customer",
            email: customerEmail || "customer@example.com",
          },
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: "The Crunch pickup order",
          line_items: lineItems,
          payment_method_types: ["qrph"],
          success_url: successUrl,
          cancel_url: cancelUrl,
          reference_number: `TC-${checkoutRequestId}`,
          metadata: {
            payment_context: intent.paymentContextToken,
          },
        },
      },
    };

    const session = await payMongoRequest("/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `tc-checkout:${customerUserId}:${checkoutRequestId}`,
      },
      body: JSON.stringify(payload),
    });

    const attributes = session?.data?.attributes || {};
    if (!session?.data?.id || !attributes.checkout_url) {
      const error = new Error("PayMongo did not return a valid checkout session");
      error.statusCode = 502;
      throw error;
    }
    const attachedIntent = await attachCheckoutSession(db, intent.intentId, {
      checkoutSessionId: session.data.id,
      checkoutUrl: attributes.checkout_url,
      status: attributes.status,
    });
    return res.json({
      checkoutSessionId: attachedIntent.checkoutSessionId,
      checkoutUrl: attachedIntent.checkoutUrl,
      status: attachedIntent.providerStatus || attachedIntent.status,
      intentId: attachedIntent.intentId,
    });
  } catch (err) {
    console.error("POST /api/paymongo/create-checkout error:", err.message);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to create PayMongo checkout session",
    });
  }
}

router.post(
  "/create-checkout",
  requireAuthenticatedUser,
  requireCustomerCheckoutActor,
  createCheckoutHandler,
);

async function verifyCheckoutHandler(req, res) {
  try {
    const checkoutSessionId = String(req.params.checkoutSessionId || "").trim();
    if (!checkoutSessionId) {
      return res.status(400).json({ message: "checkoutSessionId is required" });
    }

    const customerUserId = Number(req.user?.userId);
    const intent = await getCheckoutIntent(db, { checkoutSessionId });
    if (intent && intent.customerUserId !== customerUserId) {
      return res.status(403).json({ message: "Checkout does not belong to the authenticated customer" });
    }
    const verification = await verifyPayMongoCheckoutSession(checkoutSessionId, {
      customerUserId,
      ...(intent
        ? {
            items: intent.items,
            expectedAmountCentavos: intent.amountCentavos,
            intentId: intent.intentId,
          }
        : {}),
    });
    return res.json({
      ...verification,
      intentId: intent?.intentId || verification.intentId || null,
      intentStatus: intent?.status || null,
      orderId: intent?.finalizedOrderId || null,
      finalized: Boolean(intent?.finalizedOrderId),
    });
  } catch (err) {
    console.error(
      "GET /api/paymongo/verify/:checkoutSessionId error:",
      err.message,
    );
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to verify PayMongo checkout session",
    });
  }
}

function requirePayMongoReconciliationActor(req, res, next) {
  if (isSuperuserRole(normalizeRole(req.user?.role))) return next();
  return res.status(403).json({ message: "Administrator access required" });
}

async function reconcileCheckoutHandler(req, res) {
  try {
    const intentId = String(req.params.intentId || "").trim();
    const result = await finalizePayMongoCheckoutIntent({ intentId });
    return res.json(result);
  } catch (err) {
    console.error("POST /api/paymongo/reconcile/:intentId error:", err.message);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Unable to reconcile PayMongo checkout",
      intentId: err.intentId || String(req.params.intentId || "").trim() || null,
      reconciliationRecorded: Boolean(err.reconciliationRecorded),
    });
  }
}

router.get(
  "/verify/:checkoutSessionId",
  requireAuthenticatedUser,
  requireCustomerCheckoutActor,
  verifyCheckoutHandler,
);

router.post(
  "/reconcile/:intentId",
  requireAuthenticatedUser,
  requirePayMongoReconciliationActor,
  reconcileCheckoutHandler,
);

async function webhookHandler(req, res) {
  try {
    const result = await processPayMongoWebhook({
      rawBody: req.body,
      signatureHeader: req.get("Paymongo-Signature"),
      connection: db,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("POST /api/paymongo/webhook rejected:", err.message);
    const statusCode = err.reconciliationRecorded ? 500 : err.statusCode || 500;
    return res.status(statusCode).json({
      message: err.statusCode === 401
        ? "Invalid PayMongo webhook signature"
        : err.reconciliationRecorded
          ? "Verified payment was recorded but order finalization requires retry"
          : err.message || "Unable to process PayMongo webhook",
      intentId: err.intentId || null,
      reconciliationRecorded: Boolean(err.reconciliationRecorded),
    });
  }
}

router.get("/methods", async (req, res) => {
  try {
    if (!isPayMongoEnabled()) {
      return res.json({
        paymongoEnabled: false,
        paymentMethods: [],
      });
    }

    const payload = await payMongoRequest(
      "/merchants/capabilities/payment_methods",
      { method: "GET" },
    );
    return res.json(payload);
  } catch (err) {
    console.error("GET /api/paymongo/methods error:", err.message);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to fetch PayMongo payment methods",
    });
  }
});

module.exports = router;
module.exports.createCheckoutHandler = createCheckoutHandler;
module.exports.requireCustomerCheckoutActor = requireCustomerCheckoutActor;
module.exports.verifyCheckoutHandler = verifyCheckoutHandler;
module.exports.webhookHandler = webhookHandler;
module.exports.reconcileCheckoutHandler = reconcileCheckoutHandler;
