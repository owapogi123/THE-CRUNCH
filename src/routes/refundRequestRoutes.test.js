const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "refund-request-route-test-secret";

const state = {
  order: null,
  existingRequest: null,
  writes: [],
  connectionCount: 0,
  commits: 0,
  rollbacks: 0,
  events: [],
};

function resetState() {
  state.order = {
    id: 55,
    cashierId: 10,
    status: "Completed",
    orderNumberValue: 1,
    paymentStatus: "Paid",
    requesterName: "Cashier Ten",
    requesterRole: "cashier",
  };
  state.existingRequest = null;
  state.writes = [];
  state.connectionCount = 0;
  state.commits = 0;
  state.rollbacks = 0;
  state.events = [];
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
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.includes("FROM orders o") && normalized.includes("FOR UPDATE")) {
      return [state.order ? [state.order] : []];
    }
    if (normalized.includes("FROM refund_requests") && normalized.includes("FOR UPDATE")) {
      return [state.existingRequest ? [state.existingRequest] : []];
    }
    if (normalized.startsWith("INSERT INTO refund_requests")) {
      state.writes.push({ sql: normalized, params });
      return [{ insertId: 901, affectedRows: 1 }];
    }
    if (normalized.startsWith("UPDATE refund_requests")) {
      state.writes.push({ sql: normalized, params });
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
mockModule("../services/orderIdentifierService", {
  formatOrderNumber: (_value, id) => `ORD-${String(id).padStart(3, "0")}`,
});
mockModule("../services/applicationEvents", {
  publishRefundRequestMutation(payload) { state.events.push(payload); },
});

const router = require("./refundRequestRoutes");

function handlersFor(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route was not found`);
  return layer.route.stack.map((entry) => entry.handle);
}

const createHandlers = handlersFor("/", "post");
const listHandlers = handlersFor("/", "get");
const ignoreHandlers = handlersFor("/:id/ignore", "patch");

function tokenFor(role, userId) {
  return jwt.sign({ role, userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function invoke(handlers, { role, userId, body = {}, params = {}, query = {} }) {
  const req = {
    headers: { authorization: `Bearer ${tokenFor(role, userId)}` },
    body,
    params,
    query,
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
  resetState();
  const customerCreate = await invoke(createHandlers, {
    role: "customer",
    userId: 20,
    body: { orderId: 55 },
  });
  assert.equal(customerCreate.statusCode, 403);
  assert.equal(state.connectionCount, 0);

  resetState();
  const created = await invoke(createHandlers, {
    role: "cashier",
    userId: 10,
    body: {
      orderId: 55,
      requesterId: 999,
      cashierId: 999,
      role: "administrator",
      status: "Actioned",
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.request.status, "Pending");
  assert.deepEqual(state.writes[0].params, [55, "ORD-055", 10, "Cashier Ten", "cashier"]);
  assert.equal(state.writes.some((write) => /UPDATE (orders|payments)/i.test(write.sql)), false);
  assert.equal(state.commits, 1);
  assert.equal(state.events.length, 1);

  resetState();
  state.existingRequest = { id: 901, status: "Pending" };
  const duplicate = await invoke(createHandlers, {
    role: "cashier",
    userId: 10,
    body: { orderId: 55 },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.match(duplicate.body.message, /already pending/i);
  assert.equal(state.writes.length, 0);

  resetState();
  state.order.cashierId = 11;
  const otherCashierOrder = await invoke(createHandlers, {
    role: "cashier",
    userId: 10,
    body: { orderId: 55 },
  });
  assert.equal(otherCashierOrder.statusCode, 403);
  assert.equal(state.writes.length, 0);

  resetState();
  const cashierList = await invoke(listHandlers, {
    role: "cashier",
    userId: 10,
  });
  assert.equal(cashierList.statusCode, 403);

  resetState();
  const cashierIgnore = await invoke(ignoreHandlers, {
    role: "cashier",
    userId: 10,
    params: { id: "901" },
  });
  assert.equal(cashierIgnore.statusCode, 403);
  assert.equal(state.connectionCount, 0);

  resetState();
  state.existingRequest = { id: 901, status: "Pending" };
  const ignored = await invoke(ignoreHandlers, {
    role: "administrator",
    userId: 30,
    params: { id: "901" },
  });
  assert.equal(ignored.statusCode, 200);
  assert.equal(ignored.body.status, "Ignored");
  assert.match(state.writes[0].sql, /^UPDATE refund_requests/);
  assert.deepEqual(state.writes[0].params, [30, 901]);
  assert.equal(state.writes.some((write) => /UPDATE (orders|payments)/i.test(write.sql)), false);

  console.log("Refund request authorization and mutation tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
