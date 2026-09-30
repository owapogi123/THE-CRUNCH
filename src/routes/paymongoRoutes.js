const router = require("express").Router();
const db = require("../config/db");
const {
  isPayMongoEnabled,
  issueBypassCheckout,
  verifyBypassCheckout,
} = require("../services/paymongoMode");
const { loadAuthoritativeOrderItems } = require("../services/orderItemService");
const { requireAuthenticatedUser } = require("../middleware/cookViewAccess");
const { normalizeRole } = require("../middleware/roleAccess");
const {
  createCheckoutContextToken,
  payMongoRequest,
  verifyPayMongoCheckoutSession,
} = require("../services/paymongoCheckoutService");

function getPayMongoSuccessUrl() {
  return String(process.env.PAYMONGO_SUCCESS_URL || "").trim();
}

function getPayMongoCancelUrl() {
  return String(process.env.PAYMONGO_CANCEL_URL || "").trim();
}

function requireCustomerCheckoutActor(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (role === "customer" || role === "user") return next();
  return res.status(403).json({ message: "Customer checkout access required" });
}

async function loadBillingSettings() {
  try {
    const [rows] = await db.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'restaurant_settings'
        LIMIT 1`,
    );
    if (!rows.length || !rows[0].settings_json) {
      return { taxRate: 0, serviceCharge: 0 };
    }
    const parsed = JSON.parse(rows[0].settings_json);
    return {
      taxRate: Math.max(
        0,
        Number(
          parsed?.taxRate ??
            0,
        ) || 0,
      ),
      serviceCharge: Math.max(
        0,
        Number(
          parsed?.serviceCharge ??
            0,
        ) || 0,
      ),
    };
  } catch {
    return { taxRate: 0, serviceCharge: 0 };
  }
}

function calculateBillingTotals(items, settings) {
  const subtotal = (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const price = Number(item?.price || 0);
    const quantity = Number(item?.qty || item?.quantity || 1);
    return sum + Math.max(0, price) * Math.max(1, quantity);
  }, 0);
  const taxAmount = subtotal * (Number(settings.taxRate || 0) / 100);
  const serviceChargeAmount =
    subtotal * (Number(settings.serviceCharge || 0) / 100);
  const grandTotal = subtotal + taxAmount + serviceChargeAmount;
  return { subtotal, taxAmount, serviceChargeAmount, grandTotal };
}

async function createCheckoutHandler(req, res) {
  try {
    const { items, customerName, customerEmail } = req.body || {};
    const customerUserId = Number(req.user?.userId);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const authoritativeItems = await loadAuthoritativeOrderItems(db, items);
    const billingSettings = await loadBillingSettings();
    const totals = calculateBillingTotals(authoritativeItems, billingSettings);
    const totalPesos = totals.grandTotal;
    const totalAmount = Math.round(totalPesos * 100);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res
        .status(400)
        .json({ message: "A valid total amount is required" });
    }

    if (!isPayMongoEnabled()) {
      const bypassCheckout = issueBypassCheckout({
        customerUserId,
        items: authoritativeItems,
      });
      return res.json({
        ...bypassCheckout,
        checkoutUrl: null,
        status: "paid",
        paid: true,
        bypassed: true,
        message: "Local test payment completed",
      });
    }

    const successUrl = getPayMongoSuccessUrl();
    const cancelUrl = getPayMongoCancelUrl();
    if (!successUrl || !cancelUrl) {
      return res.status(500).json({
        message:
          "PAYMONGO_SUCCESS_URL and PAYMONGO_CANCEL_URL must be configured",
      });
    }

    if (totalPesos < 20) {
      return res.status(400).json({
        message:
          "PayMongo QRPh minimum test amount is ₱20. Please use at least ₱20 for online payment testing.",
      });
    }

    const lineItems = authoritativeItems.map((item) => ({
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
    const billingAdjustment = totalAmount - productLineTotal;
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

    const paymentContext = createCheckoutContextToken({
      customerUserId,
      items: authoritativeItems,
      expectedAmountCentavos: totalAmount,
    });
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
          success_url: process.env.PAYMONGO_SUCCESS_URL,
          cancel_url: process.env.PAYMONGO_CANCEL_URL,
          metadata: {
            payment_context: paymentContext,
          },
        },
      },
    };

    const session = await payMongoRequest("/checkout_sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const attributes = session?.data?.attributes || {};
    return res.json({
      checkoutSessionId: session?.data?.id,
      checkoutUrl: attributes.checkout_url,
      status: attributes.status,
    });
  } catch (err) {
    console.error("POST /api/paymongo/create-checkout error:", err.message);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to create PayMongo checkout session",
      error: err.payload || null,
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

    if (!isPayMongoEnabled()) {
      return res.json(
        verifyBypassCheckout(checkoutSessionId, {
          customerUserId: Number(req.user?.userId),
        }),
      );
    }

    return res.json(
      await verifyPayMongoCheckoutSession(checkoutSessionId, {
        customerUserId: Number(req.user?.userId),
      }),
    );
  } catch (err) {
    console.error(
      "GET /api/paymongo/verify/:checkoutSessionId error:",
      err.message,
    );
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to verify PayMongo checkout session",
      error: err.payload || null,
    });
  }
}

router.get(
  "/verify/:checkoutSessionId",
  requireAuthenticatedUser,
  requireCustomerCheckoutActor,
  verifyCheckoutHandler,
);

router.get("/methods", async (req, res) => {
  try {
    if (!isPayMongoEnabled()) {
      return res.json({
        paymongoEnabled: false,
        bypassed: true,
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
      error: err.payload || null,
    });
  }
});

module.exports = router;
module.exports.createCheckoutHandler = createCheckoutHandler;
module.exports.requireCustomerCheckoutActor = requireCustomerCheckoutActor;
module.exports.verifyCheckoutHandler = verifyCheckoutHandler;
