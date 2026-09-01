const crypto = require("crypto");

const BYPASS_PREFIX = "PAYMONGO_BYPASS-";
const BYPASS_TTL_MS = 15 * 60 * 1000;
const bypassCheckouts = new Map();

function createModeError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPayMongoEnabled() {
  const configured = String(process.env.PAYMONGO_ENABLED ?? "true")
    .trim()
    .toLowerCase();
  return !["false", "0", "off", "no"].includes(configured);
}

function isBypassCheckoutId(value) {
  return String(value || "").startsWith(BYPASS_PREFIX);
}

function normalizeCustomerUserId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function fingerprintItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createModeError("Order items are required for a bypass checkout");
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item?.product_id ?? item?.productId ?? item?.id);
    const quantity = Number(item?.qty ?? item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw createModeError("A valid product ID is required for bypass checkout");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw createModeError("A valid item quantity is required for bypass checkout");
    }
    quantities.set(productId, Number(quantities.get(productId) || 0) + quantity);
  }

  return Array.from(quantities.entries())
    .sort(([left], [right]) => left - right)
    .map(([productId, quantity]) => `${productId}:${quantity}`)
    .join("|");
}

function pruneExpiredBypassCheckouts() {
  const now = Date.now();
  for (const [checkoutId, checkout] of bypassCheckouts.entries()) {
    if (checkout.expiresAt <= now) bypassCheckouts.delete(checkoutId);
  }
}

function issueBypassCheckout({ customerUserId, items }) {
  if (isPayMongoEnabled()) {
    throw createModeError("PayMongo bypass is disabled", 403);
  }

  const normalizedCustomerUserId = normalizeCustomerUserId(customerUserId);
  if (!normalizedCustomerUserId) {
    throw createModeError("A customer account is required for bypass checkout");
  }

  pruneExpiredBypassCheckouts();
  const checkoutSessionId = `${BYPASS_PREFIX}${crypto.randomUUID()}`;
  bypassCheckouts.set(checkoutSessionId, {
    customerUserId: normalizedCustomerUserId,
    itemFingerprint: fingerprintItems(items),
    expiresAt: Date.now() + BYPASS_TTL_MS,
    state: "issued",
  });

  return {
    checkoutSessionId,
    paymentReference: checkoutSessionId,
    expiresInSeconds: BYPASS_TTL_MS / 1000,
  };
}

function getBypassCheckout(checkoutSessionId) {
  if (isPayMongoEnabled()) {
    throw createModeError("Local test payment is unavailable while PayMongo is enabled", 403);
  }

  const normalizedId = String(checkoutSessionId || "").trim();
  if (!isBypassCheckoutId(normalizedId)) {
    throw createModeError("A valid PayMongo bypass checkout is required");
  }

  pruneExpiredBypassCheckouts();
  const checkout = bypassCheckouts.get(normalizedId);
  if (!checkout) {
    throw createModeError("PayMongo bypass checkout is invalid or expired");
  }
  return { checkoutSessionId: normalizedId, checkout };
}

function verifyBypassCheckout(checkoutSessionId, context = {}) {
  const { checkoutSessionId: normalizedId, checkout } =
    getBypassCheckout(checkoutSessionId);

  if (checkout.state === "consumed") {
    throw createModeError("PayMongo bypass checkout has already been used", 409);
  }

  if (context.customerUserId !== undefined) {
    const customerUserId = normalizeCustomerUserId(context.customerUserId);
    if (!customerUserId || customerUserId !== checkout.customerUserId) {
      throw createModeError("PayMongo bypass checkout does not belong to this customer", 403);
    }
  }

  if (context.items !== undefined) {
    if (fingerprintItems(context.items) !== checkout.itemFingerprint) {
      throw createModeError("Order items do not match the PayMongo bypass checkout");
    }
  }

  return {
    checkoutSessionId: normalizedId,
    paymentReference: normalizedId,
    paid: true,
    status: "paid",
    bypassed: true,
  };
}

function claimBypassCheckout(checkoutSessionId, context) {
  const result = verifyBypassCheckout(checkoutSessionId, context);
  const checkout = bypassCheckouts.get(result.checkoutSessionId);
  if (!checkout || checkout.state !== "issued") {
    throw createModeError("PayMongo bypass checkout is already being used", 409);
  }
  checkout.state = "claimed";
  return result;
}

function releaseBypassCheckout(checkoutSessionId) {
  const checkout = bypassCheckouts.get(String(checkoutSessionId || "").trim());
  if (checkout?.state === "claimed") checkout.state = "issued";
}

function consumeBypassCheckout(checkoutSessionId) {
  const normalizedId = String(checkoutSessionId || "").trim();
  const checkout = bypassCheckouts.get(normalizedId);
  if (!checkout || checkout.state !== "claimed") return false;
  checkout.state = "consumed";
  return true;
}

module.exports = {
  claimBypassCheckout,
  consumeBypassCheckout,
  isBypassCheckoutId,
  isPayMongoEnabled,
  issueBypassCheckout,
  releaseBypassCheckout,
  verifyBypassCheckout,
};
