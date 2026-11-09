"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";
process.env.JWT_SECRET = "redesigned-order-test-secret";

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const state = {
  writes: [],
  commits: 0,
  rollbacks: 0,
  deductions: 0,
  deductionError: null,
  alertRefreshes: 0,
  receiptValues: null,
  readSql: [],
  readRows: [],
  existingOrder: null,
};

const connection = {
  async beginTransaction() {},
  async commit() { state.commits += 1; },
  async rollback() { state.rollbacks += 1; },
  release() {},
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT id, username FROM users")) {
      return [[{ id: 9, username: "Cashier Nine" }]];
    }
    if (normalized.startsWith("SELECT o.order_id AS id")) {
      return [[state.existingOrder || {
        id: 91,
        status: "Ready for Pickup",
        orderType: "dine-in",
        customerUserId: null,
        cashierUserId: 9,
        queuedAt: new Date(),
        prepStartedAt: new Date(),
        readyAt: new Date(),
        dueAt: null,
        estimatedPrepMinutes: 10,
        transactionId: "100110926001",
        orderNumberValue: 1001,
        businessDate: "2026-11-09",
        paymentStatus: "Paid",
        paymentRecordStatus: "Completed",
        stockDeducted: 0,
        hasPendingRefundRequest: 0,
      }]];
    }
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalized)) {
      state.writes.push({ sql: normalized, params });
    }
    if (normalized.startsWith("INSERT INTO orders")) return [{ insertId: 91 }];
    return [{ affectedRows: 1 }];
  },
};

mockModule("../config/db", {
  async getConnection() { return connection; },
  async query(sql) {
    state.readSql.push(String(sql).replace(/\s+/g, " ").trim());
    return [state.readRows];
  },
});
mockModule("../services/inventoryService", {
  async prepareRedesignedOrderItemsAndStock() {
    return {
      authoritativeItems: [{
        product_id: 10,
        qty: 1,
        name: "1PCS Chicken",
        price: 100,
        subtotal: 100,
        selected_flavor_product_id: 20,
        selected_flavor_name: "Dynamic Flavor",
      }],
      deductions: new Map([[3, { requiredQty: 1 }]]),
    };
  },
  async prepareOrderItemsAndStock() { throw new Error("legacy preparation must not run"); },
  async deductPrevalidatedStockForPaidOrder() { throw new Error("creation must not deduct"); },
  async deductStockForPaidOrder() { throw new Error("queue acceptance must not deduct"); },
  async restoreStockForRefundedOrder() {},
  async deductRedesignedStockForCompletedPaidOrder() {
    if (state.deductionError) throw state.deductionError;
    state.deductions += 1;
    return true;
  },
  async refreshRedesignedInventoryAlerts() { state.alertRefreshes += 1; },
});
mockModule("../services/orderIdentifierService", {
  async allocateOrderIdentifiers() {
    return {
      transactionId: "100110926001",
      orderNumber: "#1001",
      orderNumberValue: 1001,
      businessDate: "2026-11-09",
    };
  },
  formatOrderNumber(value) { return `#${value}`; },
  formatTransactionId(value) { return value; },
  getBusinessDateParts() { return { businessDate: "2026-11-09" }; },
});
mockModule("../services/orderConfigurationService", {
  calculateBillingTotals(subtotal) {
    return {
      subtotal,
      discountAmount: 0,
      taxAmount: 0,
      serviceChargeAmount: 0,
      grandTotal: subtotal,
    };
  },
  async loadCashierOrderConfiguration() {
    return {
      billingSettings: { taxRate: 0, serviceCharge: 0 },
      discount: { discountId: null, discountName: "", discountRate: 0 },
      receiptSettings: {
        currency: "PHP",
        restaurantName: "The Crunch",
        tagline: null,
        email: null,
        phone: null,
        address: null,
        timezone: "Asia/Manila",
      },
    };
  },
});
mockModule("../services/receiptSnapshotService", {
  collectOrderItemNotes() { return new Map(); },
  async createReceiptSnapshot(_connection, values) {
    state.receiptValues = values;
    return { id: values.orderId, items: values.items };
  },
  async loadReceiptDto() { return null; },
});
mockModule("../services/applicationEvents", {
  publishOrderMutation() {},
  publishRefundRequestMutation() {},
});
mockModule("../services/emailService", {
  async sendCustomerOrderReceiptEmail() {},
});

const router = require("./orderRoutes");

function finalHandler(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

function responseCapture() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    response: {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; },
    },
  };
}

(async () => {
  const createCapture = responseCapture();
  await finalHandler("/", "post")(
    {
      user: { userId: 9, role: "cashier" },
      body: {
        items: [{ product_id: 10, qty: 1, selected_flavor_product_id: 20 }],
        order_type: "dine-in",
        payment_method: "cash",
        cash_tendered: 100,
      },
    },
    createCapture.response,
  );
  assert.equal(createCapture.result.statusCode, 200);
  assert.equal(createCapture.result.body.orderId, 91);
  assert.equal(state.deductions, 0, "paid creation must not deduct redesigned stock");
  const orderWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  const itemWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO order_items"));
  const paymentWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO payments"));
  assert.ok(orderWrite.sql.includes("transaction_id"));
  assert.ok(!orderWrite.sql.includes("Total_Amount"));
  assert.ok(itemWrite.sql.includes("selected_option_product_id"));
  assert.ok(paymentWrite.sql.includes("processed_by_user_id"));
  assert.equal(state.receiptValues.items[0].selected_flavor_name, "Dynamic Flavor");

  const updateCapture = responseCapture();
  await finalHandler("/:id", "patch")(
    {
      params: { id: "91" },
      user: { userId: 9, role: "cashier" },
      body: { status: "Completed" },
    },
    updateCapture.response,
  );
  assert.equal(updateCapture.result.statusCode, 200);
  assert.equal(state.deductions, 1, "Completed + Paid must deduct exactly once");
  assert.equal(state.alertRefreshes, 1);
  assert.ok(
    state.writes.some(
      (write) => write.sql.startsWith("UPDATE orders SET status = ?") && write.params[0] === "Completed",
    ),
  );

  state.existingOrder = {
    id: 93,
    status: "Awaiting Cashier Review",
    orderType: "take-out",
    customerUserId: 7,
    cashierUserId: null,
    queuedAt: null,
    prepStartedAt: null,
    readyAt: null,
    dueAt: null,
    estimatedPrepMinutes: 10,
    transactionId: "010110926002",
    orderNumberValue: 1002,
    businessDate: "2026-11-09",
    paymentStatus: "Pending Payment",
    paymentRecordStatus: "Pending",
    stockDeducted: 0,
    hasPendingRefundRequest: 0,
  };
  const acceptanceCapture = responseCapture();
  await finalHandler("/:id", "patch")(
    {
      params: { id: "93" },
      user: { userId: 9, role: "cashier" },
      body: { status: "Queued", paymentStatus: "Paid" },
    },
    acceptanceCapture.response,
  );
  assert.equal(acceptanceCapture.result.statusCode, 200);
  assert.equal(state.deductions, 1, "payment/queue acceptance must not deduct stock");
  assert.equal(state.alertRefreshes, 1);
  assert.ok(
    state.writes.some(
      (write) =>
        write.sql.startsWith("UPDATE orders SET status = ?") &&
        write.params.includes("Paid") &&
        write.params.includes(9),
    ),
  );

  const queueCapture = responseCapture();
  state.readRows = [{
    id: 91,
    transactionId: "100110926001",
    orderNumberValue: 1001,
    businessDate: "2026-11-09",
    orderType: "dine-in",
    status: "Queued",
    paymentStatus: "Paid",
    createdAt: new Date("2026-11-09T01:00:00Z"),
    queuedAt: new Date("2026-11-09T01:00:00Z"),
    estimatedPrepMinutes: 10,
    itemId: 1,
    productName: "1PCS Chicken",
    quantity: 1,
    price: 100,
    selectedFlavorProductId: 20,
    selectedFlavorName: "Dynamic Flavor",
  }];
  await finalHandler("/queue", "get")({}, queueCapture.response);
  assert.equal(queueCapture.result.statusCode, 200);
  assert.equal(queueCapture.result.body.length, 1);
  assert.equal(queueCapture.result.body[0].items[0].selectedFlavorName, "Dynamic Flavor");
  assert.ok(state.readSql.some((sql) => sql.includes("LEFT JOIN order_items item")));
  assert.ok(state.readSql.every((sql) => !/\bJOIN Menu\b|\bFROM order_item\b/i.test(sql)));

  const commitsBeforeFailure = state.commits;
  const rollbacksBeforeFailure = state.rollbacks;
  state.deductionError = Object.assign(new Error("Only 0.5000 is available"), {
    statusCode: 409,
    code: "INSUFFICIENT_STOCK",
  });
  const failedCompletion = responseCapture();
  state.existingOrder = null;
  await finalHandler("/:id", "patch")(
    {
      params: { id: "92" },
      user: { userId: 9, role: "cashier" },
      body: { status: "Completed" },
    },
    failedCompletion.response,
  );
  assert.equal(failedCompletion.result.statusCode, 409);
  assert.equal(failedCompletion.result.body.code, "INSUFFICIENT_STOCK");
  assert.equal(state.commits, commitsBeforeFailure);
  assert.equal(state.rollbacks, rollbacksBeforeFailure + 1);

  console.log("Redesigned order route compatibility tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
