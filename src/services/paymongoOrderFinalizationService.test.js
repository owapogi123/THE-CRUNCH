"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "paymongo-finalization-test-secret";
process.env.PAYMONGO_ENABLED = "true";
process.env.PAYMONGO_SECRET_KEY = "sk_test_not-real";

const {
  finalizePayMongoCheckoutIntent,
} = require("./paymongoOrderFinalizationService");

const INTENT_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "cs_browser_close_test";
const EVENT_ID = "evt_browser_close_test";

function cloneState(state) {
  return {
    intent: { ...state.intent, itemsJson: JSON.stringify(JSON.parse(state.intent.itemsJson)) },
    events: new Set(state.events),
    orders: new Map([...state.orders].map(([key, value]) => [key, { ...value }])),
    nextOrderId: state.nextOrderId,
    nextOrderNumber: state.nextOrderNumber,
    orderItems: state.orderItems,
    payments: state.payments,
    deductions: state.deductions,
    stock: state.stock,
    receipts: state.receipts.map((entry) => ({ ...entry })),
  };
}

function restoreState(state, snapshot) {
  Object.assign(state, snapshot);
}

function createHarness({ failStock = false, failDatabase = false, providerError = null } = {}) {
  const items = [{
    product_id: 7,
    qty: 2,
    name: "Chicken",
    price: 50,
    subtotal: 100,
    note: "Extra crispy",
  }];
  const state = {
    intent: {
      intentId: INTENT_ID,
      checkoutRequestId: REQUEST_ID,
      customerUserId: 21,
      itemsJson: JSON.stringify(items),
      subtotal: "100.00",
      taxRate: "0.0000",
      taxAmount: "0.00",
      serviceChargeRate: "0.0000",
      serviceChargeAmount: "0.00",
      totalAmount: "100.00",
      amountCentavos: 10000,
      currency: "PHP",
      orderType: "take-out",
      customerType: "Regular",
      orderNote: "Call when ready",
      paymentContextToken: "signed-context",
      checkoutSessionId: SESSION_ID,
      checkoutUrl: "https://checkout.paymongo.test/session",
      paymentReference: null,
      providerStatus: "active",
      livemode: 0,
      status: "awaiting_payment",
      verifiedAt: null,
      finalizedOrderId: null,
      finalizedAt: null,
      finalizationAttempts: 0,
      reconciliationCode: null,
      reconciliationMessage: null,
    },
    events: new Set(),
    orders: new Map(),
    nextOrderId: 501,
    nextOrderNumber: 1000,
    orderItems: 0,
    payments: 0,
    deductions: 0,
    stock: 10,
    receipts: [],
    published: 0,
    emailed: 0,
  };

  let lockTail = Promise.resolve();
  function matchesIntent(params) {
    return params.includes(INTENT_ID) || params.includes(SESSION_ID) || params.includes(REQUEST_ID);
  }
  function intentRows(params) {
    return matchesIntent(params) ? [[{ ...state.intent }]] : [[]];
  }
  function createConnection() {
    let releaseLock = null;
    let snapshot = null;
    return {
      async beginTransaction() {
        const prior = lockTail;
        lockTail = new Promise((resolve) => {
          releaseLock = resolve;
        });
        await prior;
        snapshot = cloneState(state);
      },
      async commit() {
        snapshot = null;
        releaseLock?.();
        releaseLock = null;
      },
      async rollback() {
        if (snapshot) restoreState(state, snapshot);
        snapshot = null;
        releaseLock?.();
        releaseLock = null;
      },
      release() {},
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, " ").trim();
        if (/FROM paymongo_checkout_intents/i.test(normalized)) return intentRows(params);
        if (/SELECT GET_LOCK/i.test(normalized)) return [[{ acquired: 1 }]];
        if (/SELECT RELEASE_LOCK/i.test(normalized)) return [[{ released: 1 }]];
        if (/INSERT IGNORE INTO paymongo_webhook_events/i.test(normalized)) {
          const eventId = String(params[0]);
          const duplicate = state.events.has(eventId);
          state.events.add(eventId);
          return [{ affectedRows: duplicate ? 0 : 1 }];
        }
        if (/SET payment_reference = \?/i.test(normalized)) {
          state.intent.paymentReference = params[0];
          state.intent.providerStatus = "paid";
          state.intent.status = "payment_verified";
          state.intent.verifiedAt = new Date();
          state.intent.reconciliationCode = null;
          state.intent.reconciliationMessage = null;
          return [{ affectedRows: 1 }];
        }
        if (/FROM users/i.test(normalized)) {
          return [[{
            id: 21,
            username: "Juan Dela Cruz",
            email: "juan@example.test",
            role: "customer",
            email_verified: 1,
          }]];
        }
        if (/INSERT INTO orders/i.test(normalized)) {
          if (failDatabase) {
            const error = new Error("simulated database insert failure");
            error.code = "ER_SIMULATED";
            throw error;
          }
          const orderId = state.nextOrderId++;
          state.orders.set(orderId, {
            orderId,
            transactionId: params[3],
            orderNumberValue: params[4],
            businessDate: params[5],
            trackingStatus: "Awaiting Cashier Review",
          });
          return [{ insertId: orderId, affectedRows: 1 }];
        }
        if (/INSERT INTO order_item/i.test(normalized)) {
          state.orderItems += 1;
          return [{ affectedRows: 1 }];
        }
        if (/INSERT INTO payments/i.test(normalized)) {
          state.payments += 1;
          return [{ affectedRows: 1 }];
        }
        if (/SET status = \?, finalized_order_id = \?/i.test(normalized)) {
          if (state.intent.finalizedOrderId) return [{ affectedRows: 0 }];
          state.intent.status = params[0];
          state.intent.finalizedOrderId = Number(params[1]);
          state.intent.finalizedAt = new Date();
          state.intent.finalizationAttempts += 1;
          return [{ affectedRows: 1 }];
        }
        if (/FROM orders/i.test(normalized)) {
          const order = state.orders.get(Number(params[0]));
          return [order ? [order] : []];
        }
        throw new Error(`Unhandled finalization SQL: ${normalized}`);
      },
    };
  }

  const pool = {
    async getConnection() {
      return createConnection();
    },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM paymongo_checkout_intents/i.test(normalized)) return intentRows(params);
      if (/SET status = \?, finalization_attempts/i.test(normalized)) {
        if (state.intent.finalizedOrderId) return [{ affectedRows: 0 }];
        state.intent.status = params[0];
        state.intent.finalizationAttempts += 1;
        state.intent.reconciliationCode = params[1];
        state.intent.reconciliationMessage = params[2];
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unhandled pool SQL: ${normalized}`);
    },
  };

  const proof = {
    checkoutSessionId: SESSION_ID,
    intentId: INTENT_ID,
    checkoutRequestId: REQUEST_ID,
    expectedAmountCentavos: 10000,
    paidAmountCentavos: 10000,
    currency: "PHP",
    paid: true,
    status: "paid",
    paymentReference: `TC-${REQUEST_ID}`,
    livemode: false,
  };
  const overrides = {
    pool,
    async verifyPayMongoCheckoutSession() {
      if (providerError) throw providerError;
      return { ...proof };
    },
    async prepareOrderItemsAndStock(_connection, preparedItems) {
      if (failStock) {
        const error = new Error("Insufficient stock for Chicken");
        error.statusCode = 409;
        error.code = "INSUFFICIENT_STOCK";
        throw error;
      }
      return {
        authoritativeItems: preparedItems,
        deductions: new Map([[7, { requiredQty: 2, name: "Chicken" }]]),
      };
    },
    async deductPrevalidatedStockForPaidOrder() {
      if (state.stock < 2) throw new Error("stock underflow");
      state.stock -= 2;
      state.deductions += 1;
    },
    async allocateOrderIdentifiers() {
      const value = state.nextOrderNumber++;
      return {
        transactionId: `010110626${String(value - 999).padStart(3, "0")}`,
        orderNumberValue: value,
        orderNumber: `#${value}`,
        businessDate: "2026-11-06",
      };
    },
    async loadCashierOrderConfiguration() {
      return {
        receiptSettings: {
          restaurantName: "The Crunch",
          tagline: "",
          email: "",
          phone: "",
          address: "",
          currency: "PHP",
          timezone: "Asia/Manila",
        },
      };
    },
    async createReceiptSnapshot(_connection, values) {
      state.receipts.push(values);
      return { id: values.orderId, customer: { soldTo: values.soldToName } };
    },
    async loadReceiptDto(_connection, orderId) {
      return { id: Number(orderId) };
    },
    publishOrderMutation() {
      state.published += 1;
    },
    async sendCustomerOrderReceiptEmail() {
      state.emailed += 1;
    },
  };
  const webhookOptions = {
    checkoutSessionId: SESSION_ID,
    webhookVerification: proof,
    providerEvent: {
      eventId: EVENT_ID,
      eventType: "checkout_session.payment.paid",
      liveMode: false,
      providerCreatedAt: 1793952000,
    },
  };
  return { items, overrides, pool, proof, state, webhookOptions };
}

test("successful browser return finalizes a paid order once", async () => {
  const harness = createHarness();
  const result = await finalizePayMongoCheckoutIntent({
    checkoutSessionId: SESSION_ID,
    customerUserId: 21,
    items: harness.items,
  }, harness.overrides);
  assert.equal(result.orderId, 501);
  assert.equal(harness.state.intent.status, "finalized");
  assert.equal(harness.state.deductions, 1);
  assert.equal(harness.state.stock, 8);
});

test("paid webhook finalizes with the browser closed", async () => {
  const harness = createHarness();
  const result = await finalizePayMongoCheckoutIntent(
    harness.webhookOptions,
    harness.overrides,
  );
  assert.equal(result.orderId, 501);
  assert.equal(harness.state.orders.size, 1);
  assert.equal(harness.state.events.size, 1);
  assert.equal(harness.state.deductions, 1);
});

test("webhook before browser return retrieves the existing order", async () => {
  const harness = createHarness();
  const webhook = await finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides);
  const browser = await finalizePayMongoCheckoutIntent({
    checkoutSessionId: SESSION_ID,
    customerUserId: 21,
    items: harness.items,
  }, harness.overrides);
  assert.equal(browser.orderId, webhook.orderId);
  assert.equal(browser.alreadyFinalized, true);
  assert.equal(harness.state.orders.size, 1);
  assert.equal(harness.state.deductions, 1);
});

test("browser return before webhook leaves the webhook idempotent", async () => {
  const harness = createHarness();
  const browser = await finalizePayMongoCheckoutIntent({
    checkoutSessionId: SESSION_ID,
    customerUserId: 21,
    items: harness.items,
  }, harness.overrides);
  const webhook = await finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides);
  assert.equal(webhook.orderId, browser.orderId);
  assert.equal(harness.state.orders.size, 1);
  assert.equal(harness.state.deductions, 1);
});

test("concurrent webhook and browser finalization create one order and deduction", async () => {
  const harness = createHarness();
  const [webhook, browser] = await Promise.all([
    finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides),
    finalizePayMongoCheckoutIntent({
      checkoutSessionId: SESSION_ID,
      customerUserId: 21,
      items: harness.items,
    }, harness.overrides),
  ]);
  assert.equal(webhook.orderId, browser.orderId);
  assert.equal(harness.state.orders.size, 1);
  assert.equal(harness.state.deductions, 1);
});

test("duplicate webhook delivery is recorded once and returns the existing order", async () => {
  const harness = createHarness();
  await finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides);
  const duplicate = await finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides);
  assert.equal(duplicate.duplicateEvent, true);
  assert.equal(duplicate.alreadyFinalized, true);
  assert.equal(harness.state.events.size, 1);
  assert.equal(harness.state.deductions, 1);
});

test("provider amount mismatch is preserved for reconciliation without an order", async () => {
  const error = new Error("Paid checkout amount does not match the authoritative order total");
  error.statusCode = 409;
  error.code = "PAYMONGO_AMOUNT_MISMATCH";
  const harness = createHarness({ providerError: error });
  await assert.rejects(
    finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides),
    (candidate) => candidate?.code === "PAYMONGO_AMOUNT_MISMATCH" && candidate.reconciliationRecorded,
  );
  assert.equal(harness.state.intent.status, "reconciliation_required");
  assert.equal(harness.state.orders.size, 0);
  assert.equal(harness.state.events.size, 1);
});

test("insufficient stock preserves verified payment for safe retry", async () => {
  const harness = createHarness({ failStock: true });
  await assert.rejects(
    finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides),
    (error) => error?.code === "INSUFFICIENT_STOCK" && error.reconciliationRecorded,
  );
  assert.equal(harness.state.intent.status, "reconciliation_required");
  assert.equal(harness.state.orders.size, 0);
  assert.equal(harness.state.deductions, 0);
});

test("database failure rolls back order data and preserves reconciliation", async () => {
  const harness = createHarness({ failDatabase: true });
  await assert.rejects(
    finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides),
    (error) => error?.code === "ER_SIMULATED" && error.reconciliationRecorded,
  );
  assert.equal(harness.state.intent.status, "reconciliation_required");
  assert.equal(harness.state.orders.size, 0);
  assert.equal(harness.state.deductions, 0);
});

test("registered identity and captured notes survive webhook finalization", async () => {
  const harness = createHarness();
  await finalizePayMongoCheckoutIntent(harness.webhookOptions, harness.overrides);
  assert.equal(harness.state.receipts.length, 1);
  assert.equal(harness.state.receipts[0].soldToName, "Juan Dela Cruz");
  assert.equal(harness.state.receipts[0].orderNote, "Call when ready");
  assert.equal(harness.state.receipts[0].items[0].note, "Extra crispy");
});
