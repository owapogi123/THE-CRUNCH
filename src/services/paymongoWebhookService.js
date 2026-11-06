"use strict";

const crypto = require("crypto");
const { verifyPaidWebhookCheckout } = require("./paymongoCheckoutService");
const {
  finalizePayMongoCheckoutIntent,
} = require("./paymongoOrderFinalizationService");

const DEFAULT_TOLERANCE_SECONDS = 300;

function webhookError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getExpectedLiveMode() {
  const secretKey = String(
    process.env.PAYMONGO_SECRET_KEY || process.env.PAYMONGO_SK || "",
  ).trim();
  if (secretKey.startsWith("sk_live_")) return true;
  if (secretKey.startsWith("sk_test_")) return false;
  throw webhookError("PayMongo secret-key mode is not configured", 500);
}

function getWebhookSecret() {
  const secret = String(process.env.PAYMONGO_WEBHOOK_SECRET || "").trim();
  if (!secret) throw webhookError("PAYMONGO_WEBHOOK_SECRET is not configured", 500);
  return secret;
}

function parseSignatureHeader(value) {
  const parts = new Map();
  for (const segment of String(value || "").split(",")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    parts.set(segment.slice(0, separator).trim(), segment.slice(separator + 1).trim());
  }
  return parts;
}

function getToleranceSeconds() {
  const configured = Number(process.env.PAYMONGO_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(configured) && configured >= 60 && configured <= 3600
    ? Math.floor(configured)
    : DEFAULT_TOLERANCE_SECONDS;
}

function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left || "")) || !/^[a-f0-9]{64}$/i.test(String(right || ""))) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(String(left).toLowerCase(), "hex"),
    Buffer.from(String(right).toLowerCase(), "hex"),
  );
}

function verifyPayMongoSignature(rawBody, signatureHeader, nowSeconds = Date.now() / 1000) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw webhookError("PayMongo webhook raw body is required", 400);
  }
  const parts = parseSignatureHeader(signatureHeader);
  const timestamp = Number(parts.get("t"));
  const liveMode = getExpectedLiveMode();
  const providedSignature = parts.get(liveMode ? "li" : "te");
  if (!Number.isSafeInteger(timestamp) || !providedSignature) {
    throw webhookError("PayMongo webhook signature is malformed", 401);
  }
  if (Math.abs(Math.floor(nowSeconds) - timestamp) > getToleranceSeconds()) {
    throw webhookError("PayMongo webhook timestamp is outside the replay window", 401);
  }
  const expectedSignature = crypto
    .createHmac("sha256", getWebhookSecret())
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), rawBody]))
    .digest("hex");
  if (!safeHexEqual(expectedSignature, providedSignature)) {
    throw webhookError("PayMongo webhook signature is invalid", 401);
  }
  return { liveMode, timestamp };
}

function extractEvent(payload) {
  const envelope = payload?.data || {};
  const attributes = envelope.attributes || {};
  const liveModeValue = attributes.livemode ?? envelope.livemode;
  const eventType = String(
    attributes.type || (envelope.type !== "event" ? envelope.type : "") || "",
  ).trim();
  const resource = attributes.data || envelope.data || null;
  return {
    eventId: String(envelope.id || payload?.id || "").trim(),
    eventType,
    liveMode: typeof liveModeValue === "boolean" ? liveModeValue : null,
    providerCreatedAt: Number(attributes.created_at ?? envelope.created_at) || null,
    resource,
  };
}

async function processPayMongoWebhook({
  rawBody,
  signatureHeader,
  connection,
  finalizeCheckoutIntent = finalizePayMongoCheckoutIntent,
}) {
  const signature = verifyPayMongoSignature(rawBody, signatureHeader);
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw webhookError("PayMongo webhook JSON is invalid", 400);
  }
  const event = extractEvent(payload);
  if (event.liveMode !== signature.liveMode) {
    throw webhookError("PayMongo webhook mode does not match the configured API key", 409);
  }
  if (event.eventType !== "checkout_session.payment.paid") {
    return { received: true, ignored: true, duplicate: false };
  }
  if (!/^evt_[A-Za-z0-9_-]+$/.test(event.eventId)) {
    throw webhookError("PayMongo webhook event ID is invalid", 400);
  }
  const checkoutSessionId = String(event.resource?.id || "").trim();
  if (!/^cs_[A-Za-z0-9_-]+$/.test(checkoutSessionId)) {
    throw webhookError("PayMongo checkout session ID is invalid", 400);
  }
  const verified = verifyPaidWebhookCheckout(
    checkoutSessionId,
    event.resource?.attributes || {},
  );
  if (!verified.intentId) {
    throw webhookError(
      "Paid checkout is not bound to a persisted checkout intent",
      409,
    );
  }
  const result = await finalizeCheckoutIntent({
    checkoutSessionId,
    webhookVerification: verified,
    providerEvent: {
      eventId: event.eventId,
      eventType: event.eventType,
      liveMode: event.liveMode,
      providerCreatedAt: event.providerCreatedAt,
    },
  }, { pool: connection });
  return {
    received: true,
    ignored: false,
    duplicate: Boolean(result.duplicateEvent),
    orderId: result.orderId,
    intentId: result.intentId,
    alreadyFinalized: Boolean(result.alreadyFinalized),
  };
}

module.exports = {
  extractEvent,
  processPayMongoWebhook,
  verifyPayMongoSignature,
};
