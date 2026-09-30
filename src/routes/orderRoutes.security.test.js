const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "order-route-test-secret";
process.env.DISCOUNT_AUTH_CODE = "test-only-discount-code";

const state = {
  writes: [],
  commits: 0,
  rollbacks: 0,
  receipts: [],
  deductions: 0,
};

function resetState() {
  state.writes = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.receipts = [];
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
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalizedSql)) {
      state.writes.push({ sql: normalizedSql, params });
    }
    if (normalizedSql.includes("LEFT JOIN system_settings settings")) {
      const discountId = Number(params[0]);
      const isDiscounted = discountId === 2;
      return [[{
        settings_json: "{}",
        discount_id: discountId > 0 ? discountId : null,
        discount_name: discountId > 0 ? (isDiscounted ? "PWD" : "Regular customer") : null,
        discount_percentage: isDiscounted ? 20 : 0,
      }]];
    }
    if (normalizedSql.includes("FROM (SELECT ? AS requestedId) requested")) {
      return [[{ cashierId: Number(params[0]), recordedByAdminId: Number(params[0]) }]];
    }
    if (normalizedSql.startsWith("INSERT INTO orders")) {
      return [{ insertId: 700 + state.commits }];
    }
    return [[]];
  },
};

const db = {
  async getConnection() { return connection; },
  async query(sql, params = []) {
    if (String(sql).includes("FROM discount_types")) {
      const discountId = Number(params[0]);
      return discountId === 2
        ? [[{ discount_id: 2, name: "PWD", percentage: 20 }]]
        : [[]];
    }
    if (String(sql).includes("FROM users")) {
      return [[{
        role: "customer",
        email_verified: 1,
        username: "Customer",
        email: "customer@example.test",
      }]];
    }
    return [[]];
  },
};

mockModule("../config/db", db);
mockModule("../services/inventoryService", {
  async deductPrevalidatedStockForPaidOrder() { state.deductions += 1; },
  async deductStockForPaidOrder() {},
  async prepareOrderItemsAndStock(_conn, items) {
    return {
      authoritativeItems: items.map((item) => ({
        product_id: item.product_id,
        qty: item.qty,
        name: `Product ${item.product_id}`,
        price: 50,
        subtotal: 50 * item.qty,
      })),
      deductions: [],
    };
  },
  async restoreStockForRefundedOrder() {},
});
mockModule("../services/orderIdentifierService", {
  async allocateOrderIdentifiers() {
    return {
      transactionId: "TSN-TEST",
      orderNumber: "ORD-TEST",
      orderNumberValue: 1,
      businessDate: "2026-10-01",
    };
  },
  formatOrderNumber: () => "ORD-TEST",
  formatTransactionId: () => "TSN-TEST",
  getBusinessDateParts: () => ({ businessDate: "2026-10-01" }),
});
mockModule("../services/receiptSnapshotService", {
  collectOrderItemNotes: () => new Map(),
  async createReceiptSnapshot(_conn, payload) {
    state.receipts.push(payload);
    return payload;
  },
  async loadReceiptDto() { return null; },
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
const createLayer = router.stack.find(
  (layer) => layer.route?.path === "/" && layer.route.methods?.post,
);
assert.ok(createLayer, "POST /orders route was not found");
const createHandlers = createLayer.route.stack.map((layer) => layer.handle);
const authorizationLayer = router.stack.find(
  (layer) => layer.route?.path === "/discount-authorization" && layer.route.methods?.post,
);
assert.ok(authorizationLayer, "POST /orders/discount-authorization route was not found");
const authorizationHandlers = authorizationLayer.route.stack.map((layer) => layer.handle);

async function invokeHandlers(handlers, { token, body }) {
  const req = {
    headers: { authorization: `Bearer ${token}` },
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

const invokeOrder = (request) => invokeHandlers(createHandlers, request);
const invokeAuthorization = (request) => invokeHandlers(authorizationHandlers, request);

const cashierToken = jwt.sign(
  { userId: 10, role: "cashier" },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);
const customerToken = jwt.sign(
  { userId: 20, role: "customer" },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);
const baseStaffBody = {
  items: [{ product_id: 1, qty: 2 }],
  order_type: "dine-in",
  payment_method: "cash",
  discount_id: 1,
  discount_name: "Regular customer",
  cashierId: 999,
};

(async () => {
  resetState();
  const insufficient = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 99.99 },
  });
  assert.equal(insufficient.statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.deductions, 0);
  assert.equal(state.commits, 0);
  assert.equal(state.rollbacks, 1);

  resetState();
  const exact = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 100 },
  });
  assert.equal(exact.statusCode, 200);
  assert.equal(state.receipts[0].cashTendered, 100);
  assert.equal(state.receipts[0].changeAmount, 0);
  const exactOrderWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(exactOrderWrite.params[2], 10, "JWT cashier ID must override the body value");
  assert.equal(state.deductions, 1);

  resetState();
  const wrongAuthorization = await invokeAuthorization({
    token: cashierToken,
    body: {
      discount_id: 2,
      authorization_code: "wrong-code",
      items: baseStaffBody.items,
    },
  });
  assert.equal(wrongAuthorization.statusCode, 403);
  assert.equal(wrongAuthorization.body.message, "Discount authorization failed");

  const approvedAuthorization = await invokeAuthorization({
    token: cashierToken,
    body: {
      discount_id: 2,
      authorization_code: "test-only-discount-code",
      items: baseStaffBody.items,
    },
  });
  assert.equal(approvedAuthorization.statusCode, 200);
  assert.ok(approvedAuthorization.body.approvalToken);

  resetState();
  const missingApproval = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      discount_id: 2,
      discount_name: "PWD",
      cash_tendered: 100,
    },
  });
  assert.equal(missingApproval.statusCode, 403);
  assert.equal(state.writes.length, 0);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.deductions, 0);

  resetState();
  const approvedDiscountOrder = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      discount_id: 2,
      discount_name: "PWD",
      discount_authorization: approvedAuthorization.body.approvalToken,
      cash_tendered: 100,
    },
  });
  assert.equal(approvedDiscountOrder.statusCode, 200);
  assert.equal(state.receipts[0].discountRate, 20);
  assert.equal(state.receipts[0].total, 80);
  assert.equal(state.receipts[0].changeAmount, 20);

  resetState();
  const excess = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 150 },
  });
  assert.equal(excess.statusCode, 200);
  assert.equal(state.receipts[0].changeAmount, 50);

  resetState();
  const online = await invokeOrder({
    token: customerToken,
    body: {
      items: [{ product_id: 1, qty: 2 }],
      customerUserId: 999,
      order_type: "take-out",
      payment_method: "cash_on_pickup",
      payment_status: "Pending Payment",
    },
  });
  assert.equal(online.statusCode, 200);
  const onlineOrderWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(onlineOrderWrite.params[2], null);
  assert.equal(onlineOrderWrite.params[4], "Awaiting Cashier Review");
  assert.equal(
    onlineOrderWrite.params[5],
    20,
    "JWT customer ID must override a forged body customerUserId",
  );
  assert.equal(state.deductions, 0);

  console.log("Order route security integration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
