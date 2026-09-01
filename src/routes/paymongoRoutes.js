const router = require("express").Router();
const db = require("../config/db");
const {
  isPayMongoEnabled,
  issueBypassCheckout,
  verifyBypassCheckout,
} = require("../services/paymongoMode");

const fetchFn = (...args) =>
  typeof fetch === "function"
    ? fetch(...args)
    : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));

function getPayMongoSecretKey() {
  return String(process.env.PAYMONGO_SECRET_KEY || "").trim();
}

function getPayMongoSuccessUrl() {
  return String(process.env.PAYMONGO_SUCCESS_URL || "").trim();
}

function getPayMongoCancelUrl() {
  return String(process.env.PAYMONGO_CANCEL_URL || "").trim();
}

function getPayMongoBaseUrl() {
  return String(
    process.env.PAYMONGO_API_BASE_URL || "https://api.paymongo.com/v1",
  ).replace(/\/+$/, "");
}

function hasPaidCheckout(attributes) {
  const checkoutStatus = String(attributes?.status || "")
    .toLowerCase()
    .trim();
  const paymentStatus = String(
    attributes?.payments?.[0]?.attributes?.status ||
      attributes?.payments?.[0]?.status ||
      "",
  )
    .toLowerCase()
    .trim();

  return (
    checkoutStatus === "paid" ||
    checkoutStatus === "completed" ||
    paymentStatus === "paid" ||
    paymentStatus === "completed"
  );
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

async function payMongoRequest(path, options = {}) {
  if (!isPayMongoEnabled()) {
    const error = new Error("PayMongo provider requests are disabled");
    error.statusCode = 503;
    throw error;
  }

  const secretKey = getPayMongoSecretKey();
  if (!secretKey) {
    const error = new Error("PAYMONGO_SECRET_KEY is not configured");
    error.statusCode = 500;
    throw error;
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    ...options.headers,
  };

  const response = await fetchFn(`${getPayMongoBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ||
      payload?.errors?.[0]?.code ||
      payload?.message ||
      `PayMongo request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

router.post("/create-checkout", async (req, res) => {
  try {
    const { items, total, customerUserId, customerName, customerEmail } =
      req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const billingSettings = await loadBillingSettings();
    const totals = calculateBillingTotals(items, billingSettings);
    const totalPesos = totals.grandTotal;
    const totalAmount = Math.round(totalPesos * 100);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res
        .status(400)
        .json({ message: "A valid total amount is required" });
    }

    if (!isPayMongoEnabled()) {
      const bypassCheckout = issueBypassCheckout({ customerUserId, items });
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

    if (totalPesos < 1) {
      return res.status(400).json({
        message:
          "PayMongo QRPh minimum test amount is ₱20. Please use at least ₱20 for online payment testing.",
      });
    }

    items.forEach((item) => {
      console.log("PAYMONGO DEBUG", {
        itemName: item.name,
        itemPricePesos: Number(item.price),
        amountSentCentavos: Math.round(Number(item.price) * 100),
        quantity: Number(item.qty || item.quantity || 1),
      });
    });

    const lineItems = items.map((item) => ({
      amount: Math.round(Number(item.price || 0) * 100),
      currency: "PHP",
      description: item.name,
      name: item.name,
      quantity: Math.max(1, Number(item.qty || item.quantity || 1)),
    }));
    if (totals.taxAmount > 0) {
      lineItems.push({
        amount: Math.round(totals.taxAmount * 100),
        currency: "PHP",
        description: "Tax",
        name: "Tax",
        quantity: 1,
      });
    }
    if (totals.serviceChargeAmount > 0) {
      lineItems.push({
        amount: Math.round(totals.serviceChargeAmount * 100),
        currency: "PHP",
        description: "Service Charge",
        name: "Service Charge",
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
          success_url: process.env.PAYMONGO_SUCCESS_URL,
          cancel_url: process.env.PAYMONGO_CANCEL_URL,
          metadata: {
            customerUserId: customerUserId ? String(customerUserId) : "",
            submittedTotal: String(total || 0),
            subtotal: String(totals.subtotal),
            taxAmount: String(totals.taxAmount),
            serviceChargeAmount: String(totals.serviceChargeAmount),
            grandTotal: String(totals.grandTotal),
          },
        },
      },
    };

    console.log("PayMongo payload:", JSON.stringify(payload, null, 2));

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
});

router.get("/verify/:checkoutSessionId", async (req, res) => {
  try {
    const checkoutSessionId = String(req.params.checkoutSessionId || "").trim();
    if (!checkoutSessionId) {
      return res.status(400).json({ message: "checkoutSessionId is required" });
    }

    if (!isPayMongoEnabled()) {
      return res.json(verifyBypassCheckout(checkoutSessionId));
    }

    const session = await payMongoRequest(
      `/checkout_sessions/${checkoutSessionId}`,
      {
        method: "GET",
      },
    );
    const attributes = session?.data?.attributes || {};
    const paid = hasPaidCheckout(attributes);

    return res.json({
      checkoutSessionId,
      paid,
      status: paid ? "paid" : attributes.status || "active",
      paymentReference:
        attributes.reference_number ||
        attributes.payments?.[0]?.id ||
        checkoutSessionId,
      checkoutUrl: attributes.checkout_url || null,
    });
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
});

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
