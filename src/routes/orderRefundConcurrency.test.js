const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "refund-concurrency-test-secret";

const state = {
  order: {
    status: "Queued",
    orderType: "dine-in",
    customerUserId: null,
    queuedAt: new Date("2026-10-23T00:00:00Z"),
    prepStartedAt: null,
    startedAt: null,
    readyAt: null,
    dueAt: null,
    estimatedPrepMinutes: 10,
    transactionId: "TSN-RACE",
    orderNumberValue: 1,
    businessDate: "2026-10-23",
    paymentStatus: "Paid",
    paymentRecordStatus: "Completed",
    stockDeducted: 1,
  },
  lockHeld: false,
  waiters: [],
  restorations: 0,
};

function acquireOrderLock() {
  if (!state.lockHeld) {
    state.lockHeld = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => state.waiters.push(resolve));
}

function releaseOrderLock() {
  const next = state.waiters.shift();
  if (next) next();
  else state.lockHeld = false;
}

function createConnection() {
  let ownsOrderLock = false;
  return {
    async beginTransaction() {},
    async commit() {
      if (ownsOrderLock) {
        ownsOrderLock = false;
        releaseOrderLock();
      }
    },
    async rollback() {
      if (ownsOrderLock) {
        ownsOrderLock = false;
        releaseOrderLock();
      }
    },
    release() {},
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.includes("SELECT Status AS status")) {
        assert.match(normalized, /FOR UPDATE$/i);
        await acquireOrderLock();
        ownsOrderLock = true;
        return [[{ ...state.order }]];
      }
      if (normalized.startsWith("UPDATE orders SET")) {
        const nextStatus = params[0];
        state.order.status = nextStatus;
        if (nextStatus === "Preparing") {
          state.order.prepStartedAt = new Date();
          state.order.startedAt = state.order.prepStartedAt;
        }
        if (nextStatus === "Refunded") state.order.paymentStatus = "Refunded";
        return [{ affectedRows: 1 }];
      }
      if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalized)) {
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async getConnection() { return createConnection(); },
  async query() { return [[]]; },
});
mockModule("../services/inventoryService", {
  async deductPrevalidatedStockForPaidOrder() {},
  async deductStockForPaidOrder() {},
  async prepareOrderItemsAndStock() { return { authoritativeItems: [], deductions: [] }; },
  async restoreStockForRefundedOrder() {
    state.restorations += 1;
    return true;
  },
});
mockModule("../services/orderIdentifierService", {
  async allocateOrderIdentifiers() {},
  formatOrderNumber: () => "ORD-RACE",
  formatTransactionId: () => "TSN-RACE",
  getBusinessDateParts: () => ({ businessDate: "2026-10-23" }),
});
mockModule("../services/receiptSnapshotService", {
  collectOrderItemNotes: () => new Map(),
  async createReceiptSnapshot() {},
  async loadReceiptDto() {},
});
mockModule("../services/emailService", { async sendCustomerOrderReceiptEmail() {} });
mockModule("../services/applicationEvents", {
  publishOrderMutation() {},
  publishRefundRequestMutation() {},
});
mockModule("../services/requestTiming", {
  isDevelopmentTimingEnabled: () => false,
  runWithDbQueryTiming: (callback) => callback({ queries: [] }),
});

const router = require("./orderRoutes");
const layer = router.stack.find(
  (entry) => entry.route?.path === "/:id" && entry.route.methods?.patch,
);
assert.ok(layer);
const handlers = layer.route.stack.map((entry) => entry.handle);

function tokenFor(role, userId) {
  return jwt.sign({ role, userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function invoke(role, userId, body) {
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
    if (!handlers[index]) return;
    await handlers[index](req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return result;
}

(async () => {
  const [startPreparing, refund] = await Promise.all([
    invoke("cashier", 10, { status: "Preparing" }),
    invoke("administrator", 30, { status: "Refunded" }),
  ]);

  const successes = [startPreparing, refund].filter((result) => result.statusCode === 200);
  const rejections = [startPreparing, refund].filter((result) => result.statusCode >= 400);
  assert.equal(successes.length, 1, "only one competing state change may succeed");
  assert.equal(rejections.length, 1, "the request that loses the row lock must revalidate and fail");
  assert.ok(["Preparing", "Refunded"].includes(state.order.status));
  assert.equal(
    state.restorations,
    refund.statusCode === 200 ? 1 : 0,
    "inventory is restored exactly once and only when the refund wins",
  );

  state.order = {
    ...state.order,
    status: "Queued",
    prepStartedAt: null,
    startedAt: null,
    readyAt: null,
    paymentStatus: "Paid",
    stockDeducted: 1,
  };
  state.restorations = 0;
  const duplicateResults = await Promise.all([
    invoke("administrator", 30, { status: "Refunded" }),
    invoke("administrator", 31, { status: "Refunded" }),
  ]);
  assert.equal(
    duplicateResults.filter((result) => result.statusCode === 200).length,
    1,
    "only one concurrent duplicate refund may succeed",
  );
  assert.equal(
    duplicateResults.filter((result) => result.statusCode >= 400).length,
    1,
  );
  assert.equal(state.restorations, 1, "concurrent duplicate refunds restore inventory once");

  state.order = {
    ...state.order,
    status: "Queued",
    prepStartedAt: null,
    startedAt: null,
    readyAt: null,
    paymentStatus: "Pending Payment",
    paymentRecordStatus: "Pending",
    stockDeducted: 0,
  };
  state.restorations = 0;
  const [startUnpaidPreparation, cancel] = await Promise.all([
    invoke("cashier", 10, { status: "Preparing" }),
    invoke("administrator", 30, { status: "Cancelled" }),
  ]);
  const cancellationRace = [startUnpaidPreparation, cancel];
  assert.equal(
    cancellationRace.filter((result) => result.statusCode === 200).length,
    1,
    "only kitchen start or cancellation may win the row lock",
  );
  assert.equal(
    cancellationRace.filter((result) => result.statusCode >= 400).length,
    1,
    "the losing cancellation race must revalidate and fail",
  );
  assert.ok(["Preparing", "Cancelled"].includes(state.order.status));

  console.log("Concurrent refund serialization tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
