const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "staff-queue-test-only-secret";
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
    assert.equal((await runBoundary(route, "cook")).reachedHandler, true);
    assert.equal((await runBoundary(route, "administrator")).reachedHandler, true);
  });
}
