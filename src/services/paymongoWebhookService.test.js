"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.JWT_SECRET = "paymongo-webhook-jwt-test-secret";
process.env.PAYMONGO_SECRET_KEY = "sk_test_not-a-real-key";
process.env.PAYMONGO_WEBHOOK_SECRET = "whsec_test_not-a-real-secret";
process.env.PAYMONGO_WEBHOOK_TOLERANCE_SECONDS = "300";

const { createCheckoutContextToken } = require("./paymongoCheckoutService");
const {
  processPayMongoWebhook,
  verifyPayMongoSignature,
} = require("./paymongoWebhookService");

const now = Math.floor(Date.now() / 1000);
const items = [{ product_id: 1, qty: 2 }];
const intentId = "11111111-1111-4111-8111-111111111111";
const checkoutRequestId = "22222222-2222-4222-8222-222222222222";

function payload(overrides = {}) {
  const amount = overrides.amount ?? 10000;
  return {
    data: {
      id: overrides.eventId || "evt_checkout_paid_1",
      type: "event",
      attributes: {
        type: overrides.eventType || "checkout_session.payment.paid",
        livemode: overrides.livemode ?? false,
        created_at: now,
        data: {
          id: overrides.checkoutSessionId || "cs_checkout_paid_1",
          type: "checkout_session",
          attributes: {
            status: overrides.status || "active",
            metadata: {
              payment_context: createCheckoutContextToken({
                customerUserId: 21,
                items,
                expectedAmountCentavos: 10000,
                intentId,
                checkoutRequestId,
              }),
            },
            payments: overrides.payments ?? [{
              id: "pay_checkout_paid_1",
              attributes: {
                status: "paid",
                amount,
                currency: overrides.currency || "PHP",
              },
            }],
          },
        },
      },
    },
  };
}

function signedBody(value, timestamp = now) {
  const rawBody = Buffer.from(JSON.stringify(value), "utf8");
  const signature = crypto
    .createHmac("sha256", process.env.PAYMONGO_WEBHOOK_SECRET)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), rawBody]))
    .digest("hex");
  return {
    rawBody,
    signatureHeader: `t=${timestamp},te=${signature},li=`,
  };
}

function fakeFinalizer() {
  const seen = new Set();
  const finalize = async (options) => {
      const eventId = String(options.providerEvent.eventId);
      const duplicateEvent = seen.has(eventId);
      if (!duplicateEvent) {
        seen.add(eventId);
        finalize.calls += 1;
      }
      return {
        duplicateEvent,
        orderId: 501,
        intentId,
        alreadyFinalized: duplicateEvent,
      };
  };
  finalize.calls = 0;
  return finalize;
}

test("valid paid webhook is accepted once and duplicate delivery is idempotent", async () => {
  const finalizeCheckoutIntent = fakeFinalizer();
  const signed = signedBody(payload());
  const first = await processPayMongoWebhook({ ...signed, connection: {}, finalizeCheckoutIntent });
  const duplicate = await processPayMongoWebhook({ ...signed, connection: {}, finalizeCheckoutIntent });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(finalizeCheckoutIntent.calls, 1);
});

test("forged webhook signature is rejected before persistence", async () => {
  const finalizeCheckoutIntent = fakeFinalizer();
  const signed = signedBody(payload());
  signed.signatureHeader = `t=${now},te=${"0".repeat(64)},li=`;
  await assert.rejects(
    processPayMongoWebhook({ ...signed, connection: {}, finalizeCheckoutIntent }),
    (error) => error?.statusCode === 401,
  );
  assert.equal(finalizeCheckoutIntent.calls, 0);
});

test("stale webhook timestamp is rejected as a replay", () => {
  const signed = signedBody(payload(), now - 301);
  assert.throws(
    () => verifyPayMongoSignature(signed.rawBody, signed.signatureHeader, now),
    (error) => error?.statusCode === 401,
  );
});

test("test credentials reject a live-mode event", async () => {
  const finalizeCheckoutIntent = fakeFinalizer();
  const signed = signedBody(payload({ livemode: true }));
  await assert.rejects(
    processPayMongoWebhook({ ...signed, connection: {}, finalizeCheckoutIntent }),
    (error) => error?.statusCode === 409,
  );
  assert.equal(finalizeCheckoutIntent.calls, 0);
});

test("unpaid, wrong-amount, and wrong-currency paid events are rejected", async () => {
  for (const candidate of [
    payload({ payments: [], status: "expired" }),
    payload({ eventId: "evt_wrong_amount", amount: 9999 }),
    payload({ eventId: "evt_wrong_currency", currency: "USD" }),
  ]) {
    const finalizeCheckoutIntent = fakeFinalizer();
    await assert.rejects(
      processPayMongoWebhook({ ...signedBody(candidate), connection: {}, finalizeCheckoutIntent }),
      (error) => error?.statusCode === 409,
    );
    assert.equal(finalizeCheckoutIntent.calls, 0);
  }
});

test("unsubscribed event types are acknowledged and ignored", async () => {
  const finalizeCheckoutIntent = fakeFinalizer();
  const result = await processPayMongoWebhook({
    ...signedBody(payload({ eventType: "payment.failed" })),
    connection: {},
    finalizeCheckoutIntent,
  });
  assert.equal(result.ignored, true);
  assert.equal(finalizeCheckoutIntent.calls, 0);
});
