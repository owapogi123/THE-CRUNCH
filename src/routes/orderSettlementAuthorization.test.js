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
  restoreError: null,
  deductions: 0,
  deductionError: null,
  transactionEvents: [],
  lockingReads: 0,
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
    hasPendingRefundRequest: 0,
    ...order,
  };
  state.connectionCount = 0;
  state.writes = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.restoreActors = [];
  state.restoreError = null;
  state.deductions = 0;
  state.deductionError = null;
  state.transactionEvents = [];
  state.lockingReads = 0;
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const connection = {
  async beginTransaction() { state.transactionEvents.push("begin"); },
  async commit() { state.commits += 1; state.transactionEvents.push("commit"); },
  async rollback() { state.rollbacks += 1; state.transactionEvents.push("rollback"); },
  release() {},
  async query(sql, params = []) {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
    if (normalizedSql.includes("SELECT Status AS status")) {
      assert.match(normalizedSql, /FOR UPDATE$/i);
      state.lockingReads += 1;
      state.transactionEvents.push("locked-read");
      return [[state.existingOrder]];
    }
    if (normalizedSql.includes("FROM (SELECT ? AS requestedId) requested")) {
      return [[{
        cashierId: Number(params[0]),
        recordedByAdminId: Number(params[0]),
      }]];
    }
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalizedSql)) {
      state.writes.push({ sql: normalizedSql, params });
      if (normalizedSql.startsWith("UPDATE orders SET") && normalizedSql.includes("Status = ?")) {
        state.existingOrder.status = params[0];
        if (params[0] === "Preparing") {
          state.existingOrder.prepStartedAt = new Date();
          state.existingOrder.startedAt = state.existingOrder.prepStartedAt;
        }
      }
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
  async deductStockForPaidOrder() {
    state.deductions += 1;
    if (state.deductionError) throw state.deductionError;
  },
  async prepareOrderItemsAndStock() { return { authoritativeItems: [], deductions: [] }; },
  async restoreStockForRefundedOrder(_orderId, actorId) {
    state.restoreActors.push(actorId);
    if (state.restoreError) throw state.restoreError;
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

function refundRequestUpdate() {
  return state.writes.find((write) => write.sql.startsWith("UPDATE refund_requests"));
}

function paymentUpdate() {
  return state.writes.find((write) => write.sql.startsWith("UPDATE payments"));
}

(async () => {
  for (const [role, field] of [
    ["cook", "paymentStatus"],
    ["inventory_manager", "payment_status"],
  ]) {
    resetState({
      status: "Queued",
      paymentStatus: "Pending Payment",
      paymentRecordStatus: "Pending",
      stockDeducted: 0,
    });
    const forgedPayment = await invokePatch({
      role,
      userId: role === "cook" ? 40 : 20,
      body: { [field]: "Paid" },
    });
    assert.equal(forgedPayment.statusCode, 403, `${role} cannot forge Paid`);
    assert.equal(state.connectionCount, 0);
    assert.equal(state.writes.length, 0);
    assert.equal(state.deductions, 0);

    const mixedUpdate = await invokePatch({
      role,
      userId: role === "cook" ? 40 : 20,
      body: { status: "Preparing", [field]: "Paid" },
    });
    assert.equal(mixedUpdate.statusCode, 403, `${role} mixed update must be rejected`);
    assert.equal(state.connectionCount, 0);
    assert.equal(state.writes.length, 0);
  }

  resetState({ paymentStatus: "Pending Payment", paymentRecordStatus: "Pending" });
  const customerForge = await invokePatch({
    role: "customer",
    userId: 50,
    body: { paymentStatus: "Paid" },
  });
  assert.equal(customerForge.statusCode, 403);
  assert.equal(state.connectionCount, 0);
  assert.equal(state.writes.length, 0);

  resetState();
  const alternativePaymentField = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Preparing", payment_reference: "FORGED" },
  });
  assert.equal(alternativePaymentField.statusCode, 400);
  assert.equal(state.connectionCount, 0);
  assert.equal(state.writes.length, 0);

  for (const [role, userId] of [
    ["cashier", 10],
    ["administrator", 30],
  ]) {
    resetState({
      status: "Awaiting Cashier Review",
      orderType: "take-out",
      customerUserId: 77,
      paymentStatus: "Pending Payment",
      paymentRecordStatus: "Pending",
      stockDeducted: 0,
    });
    const confirmedPayment = await invokePatch({
      role,
      userId,
      body: {
        status: "Queued",
        paymentStatus: "Paid",
        cashierId: 999,
      },
    });
    assert.equal(confirmedPayment.statusCode, 200, `${role} can confirm online pickup payment`);
    assert.equal(confirmedPayment.body.paymentStatus, "Paid");
    assert.equal(orderUpdate().sql.includes("payment_status = ?"), true);
    assert.equal(orderUpdate().params.includes(userId), true, "JWT actor must be persisted as cashier");
    assert.equal(orderUpdate().params.includes(999), false, "body cashier ID must not be trusted");
    assert.deepEqual(paymentUpdate().params, ["Completed", "55"]);
    assert.equal(
      state.deductions,
      1,
      "online acceptance must deduct stock atomically",
    );
  }

  resetState({
    status: "Awaiting Cashier Review",
    orderType: "take-out",
    customerUserId: 77,
    paymentStatus: "Pending Payment",
    paymentRecordStatus: "Pending",
    stockDeducted: 0,
  });
  const insufficientStockError = new Error(
    'Insufficient stock for "Chicken". Required 50, available 0.',
  );
  insufficientStockError.statusCode = 409;
  state.deductionError = insufficientStockError;
  const rejectedAcceptance = await invokePatch({
    role: "cashier",
    userId: 10,
    body: { status: "Queued", paymentStatus: "Paid" },
  });
  assert.equal(rejectedAcceptance.statusCode, 409);
  assert.match(rejectedAcceptance.body.message, /Insufficient stock/);
  assert.equal(state.deductions, 1, "acceptance must perform the locked stock check");
  assert.equal(state.commits, 0, "failed acceptance must not commit order or payment changes");
  assert.equal(state.rollbacks, 1, "failed acceptance must roll back the entire transaction");
  assert.deepEqual(
    state.transactionEvents.filter((event) => event === "commit" || event === "rollback"),
    ["rollback"],
  );

  resetState({
    status: "Queued",
    paymentStatus: "Pending Payment",
    paymentRecordStatus: "Pending",
    stockDeducted: 0,
  });
  const invalidCashierPayment = await invokePatch({
    role: "cashier",
    userId: 10,
    body: { status: "Preparing", paymentStatus: "Paid" },
  });
  assert.equal(invalidCashierPayment.statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.deductions, 0);

  resetState({
    status: "Preparing",
    paymentStatus: "Pending Payment",
    paymentRecordStatus: "Pending",
    stockDeducted: 0,
  });
  const cookCompletion = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Completed", completeFromPreparing: true },
  });
  assert.equal(cookCompletion.statusCode, 200);
  assert.equal(cookCompletion.body.status, "Completed");
  assert.equal(orderUpdate().sql.includes("payment_status"), false);
  assert.equal(paymentUpdate(), undefined, "kitchen completion must not mutate payment records");
  assert.equal(state.deductions, 0);

  resetState({
    status: "Preparing",
    paymentStatus: "Paid",
    paymentRecordStatus: "Completed",
    stockDeducted: 0,
  });
  const paidCompletion = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Completed", completeFromPreparing: true },
  });
  assert.equal(paidCompletion.statusCode, 200);
  assert.equal(paidCompletion.body.status, "Completed");
  assert.equal(
    state.deductions,
    0,
    "completion must not trigger a stock deduction",
  );

  resetState({
    status: "Ready for Pickup",
    orderType: "delivery",
    paymentStatus: "Paid",
    paymentRecordStatus: "Completed",
  });
  const deliveryHandover = await invokePatch({
    role: "cashier",
    userId: 10,
    body: {
      status: "Completed",
      cashierId: 999,
      riderName: "Test Rider",
    },
  });
  assert.equal(deliveryHandover.statusCode, 200);
  assert.equal(deliveryHandover.body.status, "Completed");
  assert.equal(orderUpdate().sql.includes("handoverTimestamp = ?"), true);
  assert.equal(orderUpdate().sql.includes("riderName = ?"), true);
  assert.equal(orderUpdate().sql.includes("verified_by = ?"), true);
  assert.equal(orderUpdate().params.includes(10), true, "authenticated handover staff must be recorded");
  assert.equal(orderUpdate().params.includes(999), false, "body cashier ID must not identify the handover staff");
  assert.equal(paymentUpdate(), undefined, "delivery handover must not rewrite settled payment records");
  assert.equal(state.deductions, 0, "delivery handover must not deduct stock again");

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
  assert.equal(refundRequestUpdate(), undefined);

  resetState();
  const stockManagerRefund = await invokePatch({
    role: "inventory_manager",
    userId: 20,
    body: { status: "Refunded", cashierId: 999 },
  });
  assert.equal(stockManagerRefund.statusCode, 403);
  assert.equal(state.connectionCount, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(state.restoreActors.length, 0);

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
  assert.deepEqual(refundRequestUpdate().params, [30, "55"]);

  resetState();
  state.restoreError = Object.assign(
    new Error(
      "Original inventory deduction records are missing. Manual inventory review is required before refunding this order.",
    ),
    {
      statusCode: 409,
      code: "REFUND_INVENTORY_RECONCILIATION_REQUIRED",
    },
  );
  const legacyRefund = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Refunded" },
  });
  assert.equal(legacyRefund.statusCode, 409);
  assert.equal(legacyRefund.body.code, "REFUND_INVENTORY_RECONCILIATION_REQUIRED");
  assert.match(legacyRefund.body.message, /Manual inventory review/i);
  assert.equal(state.commits, 0);
  assert.equal(state.rollbacks, 1, "legacy refund must roll back order and payment changes");

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
  assert.equal(invalidVoid.statusCode, 409);
  assert.equal(state.writes.length, 0);

  resetState({ paymentStatus: "Pending Payment", paymentRecordStatus: "Pending", stockDeducted: 0 });
  const invalidRefund = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Refunded" },
  });
  assert.equal(invalidRefund.statusCode, 409);
  assert.equal(state.writes.length, 0);
  assert.equal(state.restoreActors.length, 0);

  resetState({ prepStartedAt: new Date("2026-10-01T00:05:00Z") });
  const preparedRefund = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Refunded" },
  });
  assert.equal(preparedRefund.statusCode, 409);
  assert.match(preparedRefund.body.message, /preparation has already started/i);
  assert.equal(state.restoreActors.length, 0);

  for (const status of ["Preparing", "Ready for Pickup", "Completed"]) {
    resetState({ status });
    const blocked = await invokePatch({
      role: "administrator",
      userId: 30,
      body: { status: "Refunded" },
    });
    assert.equal(blocked.statusCode, 409, `${status} refund must be rejected`);
    assert.equal(state.writes.length, 0);
    assert.equal(state.restoreActors.length, 0);
  }

  for (const order of [
    { status: "Preparing", prepStartedAt: new Date("2026-10-01T00:05:00Z") },
    { status: "Ready for Pickup", readyAt: new Date("2026-10-01T00:15:00Z") },
    { status: "Queued", prepStartedAt: new Date("2026-10-01T00:05:00Z") },
  ]) {
    resetState({
      ...order,
      paymentStatus: "Pending Payment",
      paymentRecordStatus: "Pending",
      stockDeducted: 0,
    });
    const blocked = await invokePatch({
      role: "administrator",
      userId: 30,
      body: { status: "Cancelled" },
    });
    assert.equal(blocked.statusCode, 409, `${order.status} cancellation must be rejected`);
    assert.equal(blocked.body.reason, "preparation_started");
    assert.equal(state.writes.length, 0);
  }

  for (const status of ["Refunded", "Cancelled"]) {
    resetState({ status });
    const repeated = await invokePatch({
      role: "administrator",
      userId: 30,
      body: { status: "Refunded" },
    });
    assert.equal(repeated.statusCode, 409, `${status} cannot be refunded again`);
    assert.equal(state.writes.length, 0);
    assert.equal(state.restoreActors.length, 0);
  }

  resetState();
  const firstRefund = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Refunded" },
  });
  const duplicateRefund = await invokePatch({
    role: "administrator",
    userId: 30,
    body: { status: "Refunded" },
  });
  assert.equal(firstRefund.statusCode, 200);
  assert.equal(duplicateRefund.statusCode, 409);
  assert.deepEqual(state.restoreActors, [30], "inventory restoration must run exactly once");

  for (const [role, userId] of [
    ["cashier", 10],
    ["cook", 40],
    ["customer", 50],
  ]) {
    resetState();
    const blockedRefund = await invokePatch({
      role,
      userId,
      body: { status: "Refunded" },
    });
    assert.equal(blockedRefund.statusCode, 403, `${role} cannot execute a refund`);
    assert.equal(state.connectionCount, 0);
    assert.equal(state.writes.length, 0);

    resetState({
      paymentStatus: "Pending Payment",
      paymentRecordStatus: "Pending",
      stockDeducted: 0,
    });
    const blockedCancellation = await invokePatch({
      role,
      userId,
      body: { status: "Cancelled" },
    });
    assert.equal(blockedCancellation.statusCode, 403, `${role} cannot execute a cancellation`);
    assert.equal(state.connectionCount, 0);
    assert.equal(state.writes.length, 0);
  }

  resetState();
  state.existingOrder.hasPendingRefundRequest = 1;
  const pendingRefundKitchenStart = await invokePatch({
    role: "cashier",
    userId: 10,
    body: { status: "Preparing" },
  });
  assert.equal(pendingRefundKitchenStart.statusCode, 409);
  assert.equal(pendingRefundKitchenStart.body.code, "REFUND_REQUEST_PENDING");
  assert.equal(state.writes.length, 0);

  resetState();
  const kitchenTransition = await invokePatch({
    role: "cashier",
    userId: 10,
    body: { status: "Preparing" },
  });
  assert.equal(kitchenTransition.statusCode, 200);
  assert.equal(kitchenTransition.body.status, "Preparing");
  assert.equal(refundRequestUpdate(), undefined);
  assert.deepEqual(state.transactionEvents.slice(0, 2), ["begin", "locked-read"]);

  console.log("Order settlement authorization tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
