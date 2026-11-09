"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";
process.env.JWT_SECRET = "redesigned-paymongo-test-secret";

const {
  finalizePayMongoCheckoutIntent,
} = require("./paymongoOrderFinalizationService");

const intentId = "11111111-1111-4111-8111-111111111111";
const sessionId = "cs_redesigned_order";
const items = [{
  product_id: 10,
  qty: 1,
  name: "1PCS Chicken",
  price: 100,
  subtotal: 100,
  selected_flavor_product_id: 20,
  selected_flavor_name: "Dynamic Flavor",
}];
const state = {
  intent: {
    intentId,
    checkoutRequestId: "22222222-2222-4222-8222-222222222222",
    customerUserId: 7,
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
    orderNote: null,
    paymentContextToken: "signed",
    checkoutSessionId: sessionId,
    checkoutUrl: "https://example.test",
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
  writes: [],
  deductionCalls: 0,
  published: null,
};

function intentRows() {
  return [[{ ...state.intent }]];
}

function createConnection() {
  return {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.includes("FROM paymongo_checkout_intents")) return intentRows();
      if (normalized.startsWith("SELECT GET_LOCK")) return [[{ acquired: 1 }]];
      if (normalized.startsWith("SELECT RELEASE_LOCK")) return [[{ released: 1 }]];
      if (normalized.startsWith("SELECT order_id AS Order_ID")) return [[]];
      if (normalized.includes("FROM users")) {
        return [[{ id: 7, username: "Customer", email: "customer@example.test", role: "customer", email_verified: 1 }]];
      }
      if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalized)) {
        state.writes.push({ sql: normalized, params });
      }
      if (normalized.includes("SET payment_reference = ?")) {
        state.intent.paymentReference = params[0];
        state.intent.status = "payment_verified";
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith("INSERT INTO orders")) return [{ insertId: 300 }];
      if (normalized.includes("SET status = ?, finalized_order_id = ?")) {
        state.intent.status = params[0];
        state.intent.finalizedOrderId = Number(params[1]);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };
}

const pool = {
  async getConnection() { return createConnection(); },
  async query(sql) {
    if (String(sql).includes("FROM paymongo_checkout_intents")) return intentRows();
    return [{ affectedRows: 1 }];
  },
};

(async () => {
  const result = await finalizePayMongoCheckoutIntent(
    { checkoutSessionId: sessionId, customerUserId: 7, items },
    {
      pool,
      async verifyPayMongoCheckoutSession() {
        return {
          paid: true,
          checkoutSessionId: sessionId,
          customerUserId: 7,
          expectedAmountCentavos: 10000,
          currency: "PHP",
          paymentReference: "payment-redesigned-1",
          livemode: false,
        };
      },
      async prepareOrderItemsAndStock() {
        return { authoritativeItems: items, deductions: new Map([[3, { requiredQty: 1 }]]) };
      },
      async deductPrevalidatedStockForPaidOrder() { state.deductionCalls += 1; },
      async allocateOrderIdentifiers() {
        return {
          transactionId: "010110926001",
          orderNumber: "#1000",
          orderNumberValue: 1000,
          businessDate: "2026-11-09",
        };
      },
      async loadCashierOrderConfiguration() {
        return {
          receiptSettings: {
            restaurantName: "The Crunch",
            tagline: null,
            email: null,
            phone: null,
            address: null,
            timezone: "Asia/Manila",
          },
        };
      },
      async createReceiptSnapshot(_connection, values) { return { id: values.orderId }; },
      async loadReceiptDto() { return null; },
      publishOrderMutation(event) { state.published = event; },
      async sendCustomerOrderReceiptEmail() {},
    },
  );

  assert.equal(result.orderId, 300);
  assert.equal(state.deductionCalls, 0, "payment finalization must not deduct redesigned inventory");
  const orderWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  const itemWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO order_items"));
  const paymentWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO payments"));
  assert.ok(orderWrite && !orderWrite.sql.includes("Total_Amount"));
  assert.ok(itemWrite.sql.includes("selected_option_product_id"));
  assert.equal(itemWrite.params[6], 20);
  assert.ok(paymentWrite.sql.includes("external_reference"));
  assert.equal(state.published.inventoryChanged, false);

  console.log("Redesigned PayMongo order finalization tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
