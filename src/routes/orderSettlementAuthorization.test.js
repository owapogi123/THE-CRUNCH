const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "settlement-route-test-secret";

const state = {
  existingOrder: null,
  connectionCount: 0,
  writes: [],
  commits: 0,
  rollbacks: 0,
  restoreActors: [],
  deductions: 0,
};

function resetState(order) {
  state.existingOrder = {
    status: "Queued",
    orderType: "dine-in",
    customerUserId: null,
    queuedAt: new Date("2026-10-01T00:00:00Z"),
    prepStartedAt: null,
    startedAt: null,
    readyAt: null,
    dueAt: null,
    estimatedPrepMinutes: 10,
    transactionId: "TSN-TEST",
    orderNumberValue: 1,
    businessDate: "2026-10-01",
    paymentStatus: "Paid",
    paymentRecordStatus: "Completed",
    stockDeducted: 1,
    ...order,
  };
  state.connectionCount = 0;
  state.writes = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.restoreActors = [];
  state.deductions = 0;
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const connection = {
  async beginTransaction() {},
  async commit() { state.commits += 1; },
  async rollback() { state.rollbacks += 1; },
  release() {},
  async query(sql, params = []) {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
    if (normalizedSql.includes("SELECT Status AS status")) {
      return [[state.existingOrder]];
    }
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalizedSql)) {
      state.writes.push({ sql: normalizedSql, params });
      return [{ affectedRows: 1 }];
    }
    return [[]];
  },
};

mockModule("../config/db", {
  async getConnection() {
    state.connectionCount += 1;
    return connection;
  },
  async query() { return [[]]; },
});
mockModule("../services/inventoryService", {
  async deductPrevalidatedStockForPaidOrder() {},
  async deductStockForPaidOrder() { state.deductions += 1; },
  async prepareOrderItemsAndStock() { return { authoritativeItems: [], deductions: [] }; },
  async restoreStockForRefundedOrder(_orderId, actorId) {
    state.restoreActors.push(actorId);
    return true;
  },
});
mockModule("../services/orderIdentifierService", {
  async allocateOrderIdentifiers() {},
  formatOrderNumber: () => "ORD-TEST",
  formatTransactionId: () => "TSN-TEST",
  getBusinessDateParts: () => ({ businessDate: "2026-10-01" }),
});
mockModule("../services/receiptSnapshotService", {
  collectOrderItemNotes: () => new Map(),
  async createReceiptSnapshot() {},
  async loadReceiptDto() {},
});
mockModule("../services/emailService", {
  async sendCustomerOrderReceiptEmail() {},
});
mockModule("../services/applicationEvents", {
  publishOrderMutation() {},
});
mockModule("../services/requestTiming", {
  isDevelopmentTimingEnabled: () => false,
  runWithDbQueryTiming: (callback) => callback({ queries: [] }),
});

const router = require("./orderRoutes");
const patchLayer = router.stack.find(
  (layer) => layer.route?.path === "/:id" && layer.route.methods?.patch,
);
assert.ok(patchLayer, "PATCH /orders/:id route was not found");
const handlers = patchLayer.route.stack.map((layer) => layer.handle);

function tokenFor(role, userId) {
  return jwt.sign({ role, userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function invokePatch({ role, userId, body }) {
  const req = {
    headers: { authorization: `Bearer ${tokenFor(role, userId)}` },
    params: { id: "55" },
    body,
  };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(payload) { result.body = payload; return this; },
  };

  async function dispatch(index) {
    const handler = handlers[index];
    if (!handler) return;
    await handler(req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return result;
}

function orderUpdate() {
  return state.writes.find((write) => write.sql.startsWith("UPDATE orders SET"));
}

(async () => {
  resetState({ paymentStatus: "Pending Payment", paymentRecordStatus: "Pending", stockDeducted: 0 });
  const cashierVoid = await invokePatch({
    role: "cashier",
    userId: 10,
    body: {
      status: "Cancelled",
      cashierId: 999,
      userId: 30,
      role: "administrator",
    },
  });
  assert.equal(cashierVoid.statusCode, 403);
  assert.equal(state.connectionCount, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(state.restoreActors.length, 0);

  resetState();
  const cashierRefund = await invokePatch({
    role: "cashier",
    userId: 10,
    body: {
      status: "Refunded",
      cashierId: 999,
      userId: 30,
      role: "administrator",
    },
  });
  assert.equal(cashierRefund.statusCode, 403);
  assert.equal(state.connectionCount, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(state.restoreActors.length, 0);

  resetState({ paymentStatus: "Pending Payment", paymentRecordStatus: "Pending", stockDeducted: 0 });
  const stockManagerVoid = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Cancelled", cashierId: 999 },
  });
  assert.equal(stockManagerVoid.statusCode, 200);
  assert.equal(stockManagerVoid.body.status, "Cancelled");
  assert.equal(orderUpdate().params.includes("Cancelled"), true);
  assert.equal(orderUpdate().sql.includes("Cashier_ID"), false);

  resetState();
  const stockManagerRefund = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Refunded", cashierId: 999 },
  });
  assert.equal(stockManagerRefund.statusCode, 200);
  assert.equal(stockManagerRefund.body.status, "Refunded");
  assert.deepEqual(state.restoreActors, [20]);
  assert.equal(orderUpdate().sql.includes("Cashier_ID"), false);

  resetState({ paymentStatus: "Pending Payment", paymentRecordStatus: "Pending", stockDeducted: 0 });
  const adminVoid = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Cancelled" },
  });
  assert.equal(adminVoid.statusCode, 200);
  assert.equal(adminVoid.body.status, "Cancelled");

  resetState();
  const adminRefund = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Refunded" },
  });
  assert.equal(adminRefund.statusCode, 200);
  assert.deepEqual(state.restoreActors, [30]);

  resetState({
    status: "Completed",
    paymentStatus: "Pending Payment",
    paymentRecordStatus: "Pending",
    stockDeducted: 0,
  });
  const invalidVoid = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Cancelled" },
  });
  assert.equal(invalidVoid.statusCode, 400);
  assert.equal(state.writes.length, 0);

  resetState({ paymentStatus: "Pending Payment", paymentRecordStatus: "Pending", stockDeducted: 0 });
  const invalidRefund = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Refunded" },
  });
  assert.equal(invalidRefund.statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.restoreActors.length, 0);

  resetState({ prepStartedAt: new Date("2026-10-01T00:05:00Z") });
  const preparedRefund = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Refunded" },
  });
  assert.equal(preparedRefund.statusCode, 200);
  assert.equal(preparedRefund.body.inventoryRestored, false);
  assert.equal(state.restoreActors.length, 0);

  resetState();
  const kitchenTransition = await invokePatch({
    role: "cashier",
    userId: 10,
    body: { status: "Preparing" },
  });
  assert.equal(kitchenTransition.statusCode, 200);
  assert.equal(kitchenTransition.body.status, "Preparing");

  console.log("Order settlement authorization tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
