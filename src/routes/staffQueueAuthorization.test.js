const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "staff-queue-test-only-secret";

const queueRows = [{
  id: 41,
  status: "Queued",
  orderType: "dine-in",
  transactionId: "TSN-QUEUE-41",
  orderNumberValue: 41,
  businessDate: "2026-11-06",
  customerUserId: null,
  paymentStatus: "Paid",
  paymentRecordStatus: "Completed",
  createdAt: "2026-11-06T10:00:00.000Z",
  queuedAt: "2026-11-06T10:00:00.000Z",
  estimatedPrepMinutes: 10,
  quantity: 1,
  productName: "Chicken Meal",
  orderNote: "Extra spicy please\nKeep sauce separate",
  itemNote: null,
}];
const dbPath = require.resolve("../config/db");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    async query(sql) {
      if (String(sql).includes("FROM orders o") && String(sql).includes("receipt_snapshots")) {
        return [queueRows];
      }
      return [[]];
    },
  },
};
const router = require("./orderRoutes");

function findQueueRoute(path) {
  return router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods?.get,
  )?.route;
}

async function runBoundary(route, role, authenticated = true) {
  const token = authenticated
    ? jwt.sign({ userId: 8, role }, process.env.JWT_SECRET, { expiresIn: "5m" })
    : null;
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const result = { statusCode: 200, reachedHandler: false };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
  const guards = route.stack.slice(0, -1).map((layer) => layer.handle);

  async function dispatch(index) {
    if (index >= guards.length) {
      result.reachedHandler = true;
      return;
    }
    await guards[index](req, res, () => dispatch(index + 1));
  }

  await dispatch(0);
  return result;
}

for (const path of ["/new-online", "/ready-pickup", "/delivery-handover"]) {
  test(`GET ${path} rejects public/customer reads and permits staff`, async () => {
    const route = findQueueRoute(path);
    assert.ok(route, `${path} route was not found`);
    assert.equal((await runBoundary(route, "", false)).statusCode, 401);
    assert.equal((await runBoundary(route, "customer")).statusCode, 403);
    assert.equal((await runBoundary(route, "cashier")).reachedHandler, true);
    assert.equal((await runBoundary(route, "cook")).statusCode, 403);
    assert.equal((await runBoundary(route, "administrator")).reachedHandler, true);
  });
}

test("GET /queue returns persisted notes on initial load and refresh without sensitive fields", async () => {
  const route = findQueueRoute("/queue");
  assert.ok(route, "/queue route was not found");

  async function loadQueue() {
    const token = jwt.sign(
      { userId: 8, role: "cashier" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const result = { statusCode: 200, body: null };
    const res = {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; },
    };
    const handlers = route.stack.map((layer) => layer.handle);
    async function dispatch(index) {
      if (!handlers[index]) return;
      await handlers[index](req, res, () => dispatch(index + 1));
    }
    await dispatch(0);
    return result;
  }

  for (const response of [await loadQueue(), await loadQueue()]) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].orderNote, "Extra spicy please\nKeep sauce separate");
    assert.equal(response.body[0].items[0].name, "Chicken Meal");
    assert.equal("customerName" in response.body[0], false);
    assert.equal("paymentReference" in response.body[0], false);
  }
});
