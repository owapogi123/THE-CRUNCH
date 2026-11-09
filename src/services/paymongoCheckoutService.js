const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("./jwtConfig");
const { normalizeOrderItems } = require("./orderItemService");
const { isPayMongoEnabled } = require("./paymongoMode");

const CHECKOUT_CONTEXT_PURPOSE = "paymongo_checkout";
const CHECKOUT_CONTEXT_ISSUER = "the-crunch-pos";
const CHECKOUT_CONTEXT_AUDIENCE = "paymongo-checkout";
const CHECKOUT_CONTEXT_TTL_SECONDS = 24 * 60 * 60;

const fetchFn = (...args) =>
  (typeof fetch === "function"
    ? fetch(...args)
    : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args)));

function createCheckoutError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getPayMongoSecretKey() {
  return String(
    process.env.PAYMONGO_SECRET_KEY || process.env.PAYMONGO_SK || "",
  ).trim();
}

function getPayMongoBaseUrl() {
  return String(
    process.env.PAYMONGO_API_BASE_URL || "https://api.paymongo.com/v1",
  ).replace(/\/+$/, "");
}

function fingerprintItems(items) {
  const canonical = normalizeOrderItems(items)
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
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function createCheckoutContextToken({
  customerUserId,
  items,
  expectedAmountCentavos,
  intentId = null,
  checkoutRequestId = null,
}) {
  const userId = Number(customerUserId);
  const amount = Number(expectedAmountCentavos);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw createCheckoutError("A valid authenticated customer is required", 401);
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createCheckoutError("A valid authoritative checkout amount is required");
  }

  return jwt.sign(
    {
      purpose: CHECKOUT_CONTEXT_PURPOSE,
      itemsHash: fingerprintItems(items),
      expectedAmountCentavos: amount,
      ...(intentId ? { intentId: String(intentId) } : {}),
      ...(checkoutRequestId ? { checkoutRequestId: String(checkoutRequestId) } : {}),
      nonce: crypto.randomUUID(),
    },
    getJwtSecret(),
    {
      algorithm: "HS256",
      subject: String(userId),
      issuer: CHECKOUT_CONTEXT_ISSUER,
      audience: CHECKOUT_CONTEXT_AUDIENCE,
      expiresIn: CHECKOUT_CONTEXT_TTL_SECONDS,
    },
  );
}

function verifyCheckoutContextToken(token) {
  if (!token) {
    throw createCheckoutError("Checkout is missing its trusted payment context", 403);
  }

  let claims;
  try {
    claims = jwt.verify(String(token), getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: CHECKOUT_CONTEXT_ISSUER,
      audience: CHECKOUT_CONTEXT_AUDIENCE,
    });
  } catch {
    throw createCheckoutError("Checkout payment context is invalid or expired", 403);
  }

  if (claims.purpose !== CHECKOUT_CONTEXT_PURPOSE) {
    throw createCheckoutError("Checkout payment context is invalid", 403);
  }
  return claims;
}

function getPaymentStatus(payment) {
  return String(payment?.attributes?.status || payment?.status || "")
    .trim()
    .toLowerCase();
}

function hasPaidCheckout(attributes) {
  const checkoutStatus = String(attributes?.status || "").trim().toLowerCase();
  return (
    checkoutStatus === "paid" ||
    checkoutStatus === "completed" ||
    (Array.isArray(attributes?.payments) &&
      attributes.payments.some((payment) =>
        ["paid", "completed"].includes(getPaymentStatus(payment)),
      ))
  );
}

function getPaidAmountCentavos(attributes) {
  const paidPayments = Array.isArray(attributes?.payments)
    ? attributes.payments.filter((payment) =>
        ["paid", "completed"].includes(getPaymentStatus(payment)),
      )
    : [];
  if (paidPayments.length > 0) {
    const amounts = paidPayments.map((payment) =>
      Number(payment?.attributes?.amount ?? payment?.amount),
    );
    if (amounts.every((amount) => Number.isSafeInteger(amount) && amount > 0)) {
      return amounts.reduce((sum, amount) => sum + amount, 0);
    }
  }

  const checkoutAmount = Number(
    attributes?.amount ?? attributes?.total_amount ?? attributes?.totalAmount,
  );
  return Number.isSafeInteger(checkoutAmount) && checkoutAmount > 0
    ? checkoutAmount
    : null;
}

function getPaidCurrency(attributes) {
  const paidPayments = Array.isArray(attributes?.payments)
    ? attributes.payments.filter((payment) =>
        ["paid", "completed"].includes(getPaymentStatus(payment)),
      )
    : [];
  const currencies = paidPayments
    .map((payment) =>
      String(payment?.attributes?.currency ?? payment?.currency ?? "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
  if (currencies.length > 0 && currencies.every((currency) => currency === currencies[0])) {
    return currencies[0];
  }
  const checkoutCurrency = String(attributes?.currency || "").trim().toUpperCase();
  return currencies.length === 0 ? checkoutCurrency || null : null;
}

function getPaymentReference(attributes, checkoutSessionId) {
  return (
    attributes?.reference_number ||
    attributes?.payments?.[0]?.id ||
    checkoutSessionId
  );
}

function verifyCheckoutAttributes(
  checkoutSessionId,
  attributes,
  { customerUserId, items, expectedAmountCentavos, intentId } = {},
) {
  const metadata = attributes?.metadata || {};
  const claims = verifyCheckoutContextToken(
    metadata.payment_context || metadata.paymentContext,
  );
  const authenticatedUserId = Number(customerUserId);
  if (
    !Number.isSafeInteger(authenticatedUserId) ||
    authenticatedUserId <= 0 ||
    Number(claims.sub) !== authenticatedUserId
  ) {
    throw createCheckoutError(
      "Checkout does not belong to the authenticated customer",
      403,
    );
  }
  if (items !== undefined && claims.itemsHash !== fingerprintItems(items)) {
    throw createCheckoutError("Checkout does not match the submitted cart", 409);
  }
  if (intentId !== undefined && String(claims.intentId || "") !== String(intentId)) {
    throw createCheckoutError("Checkout does not match the persisted intent", 409);
  }

  const boundAmount = Number(claims.expectedAmountCentavos);
  if (
    !Number.isSafeInteger(boundAmount) ||
    boundAmount <= 0 ||
    (expectedAmountCentavos !== undefined &&
      boundAmount !== Number(expectedAmountCentavos))
  ) {
    throw createCheckoutError(
      "Checkout amount does not match the authoritative order total",
      409,
    );
  }

  const paid = hasPaidCheckout(attributes);
  if (paid && getPaidAmountCentavos(attributes) !== boundAmount) {
    throw createCheckoutError(
      "Paid checkout amount does not match the authoritative order total",
      409,
    );
  }
  if (paid && getPaidCurrency(attributes) !== "PHP") {
    throw createCheckoutError("Paid checkout currency must be PHP", 409);
  }

  return {
    checkoutSessionId,
    intentId: claims.intentId || null,
    checkoutRequestId: claims.checkoutRequestId || null,
    expectedAmountCentavos: boundAmount,
    currency: paid ? "PHP" : null,
    paid,
    status: paid ? "paid" : attributes?.status || "active",
    paymentReference: getPaymentReference(attributes, checkoutSessionId),
    checkoutUrl: attributes?.checkout_url || null,
    livemode: typeof attributes?.livemode === "boolean" ? attributes.livemode : null,
  };
}

function verifyPaidWebhookCheckout(checkoutSessionId, attributes) {
  const metadata = attributes?.metadata || {};
  const claims = verifyCheckoutContextToken(
    metadata.payment_context || metadata.paymentContext,
  );
  const customerUserId = Number(claims.sub);
  const expectedAmountCentavos = Number(claims.expectedAmountCentavos);
  if (!Number.isSafeInteger(customerUserId) || customerUserId <= 0) {
    throw createCheckoutError("Webhook checkout customer is invalid", 403);
  }
  if (!claims.itemsHash || !Number.isSafeInteger(expectedAmountCentavos) || expectedAmountCentavos <= 0) {
    throw createCheckoutError("Webhook checkout context is invalid", 403);
  }
  if (!hasPaidCheckout(attributes)) {
    throw createCheckoutError("Webhook checkout is not paid", 409);
  }
  const paidAmountCentavos = getPaidAmountCentavos(attributes);
  if (paidAmountCentavos !== expectedAmountCentavos) {
    throw createCheckoutError(
      "Webhook paid amount does not match the trusted checkout amount",
      409,
    );
  }
  const currency = getPaidCurrency(attributes);
  if (currency !== "PHP") {
    throw createCheckoutError("Webhook paid currency must be PHP", 409);
  }
  return {
    checkoutSessionId: String(checkoutSessionId || "").trim(),
    intentId: claims.intentId || null,
    checkoutRequestId: claims.checkoutRequestId || null,
    customerUserId,
    expectedAmountCentavos,
    paidAmountCentavos,
    currency,
    paymentReference: getPaymentReference(attributes, checkoutSessionId),
  };
}

async function payMongoRequest(path, options = {}) {
  if (!isPayMongoEnabled()) {
    throw createCheckoutError("PayMongo provider requests are disabled", 503);
  }
  const secretKey = getPayMongoSecretKey();
  if (!secretKey) {
    throw createCheckoutError("PAYMONGO_SECRET_KEY is not configured", 500);
  }

  const response = await fetchFn(`${getPayMongoBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      ...options.headers,
    },
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ||
      payload?.errors?.[0]?.code ||
      payload?.message ||
      `PayMongo request failed with HTTP ${response.status}`;
    const error = createCheckoutError(message, response.status);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function verifyPayMongoCheckoutSession(checkoutSessionId, context) {
  const normalizedId = String(checkoutSessionId || "").trim();
  if (!normalizedId) {
    throw createCheckoutError("checkoutSessionId is required");
  }
  const session = await payMongoRequest(`/checkout_sessions/${normalizedId}`, {
    method: "GET",
  });
  if (!session?.data?.id) {
    throw createCheckoutError("PayMongo checkout session was not found", 404);
  }
  return verifyCheckoutAttributes(
    normalizedId,
    session.data.attributes || {},
    context,
  );
}

module.exports = {
  CHECKOUT_CONTEXT_TTL_SECONDS,
  createCheckoutContextToken,
  fingerprintItems,
  getPaidAmountCentavos,
  getPaidCurrency,
  hasPaidCheckout,
  payMongoRequest,
  verifyCheckoutAttributes,
  verifyPaidWebhookCheckout,
  verifyPayMongoCheckoutSession,
};
