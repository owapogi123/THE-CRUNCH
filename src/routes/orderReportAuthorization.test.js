"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "order-report-authorization-test-secret";

const db = require("../config/db");
const router = require("./orderRoutes");

function findRoute(method, path) {
  const route = router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods?.[method],
  )?.route;
  assert.ok(route, `${method.toUpperCase()} ${path} route was not found`);
  return route;
}

function bearerFor(role, userId = 17) {
  return `Bearer ${jwt.sign({ role, userId }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  })}`;
}

async function runGuards(route, authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  const result = { statusCode: 200, body: null, reachedHandler: false };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
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

test("detailed order history honors salesReports without restricting operational routes", async () => {
  const originalQuery = db.query;
  const permissionQueries = [];
  db.query = async (sql, params = []) => {
    if (/FROM role_permissions/i.test(String(sql))) {
      permissionQueries.push({ sql: String(sql), params });
      const role = String(params[0] || "");
      return [[{ enabled: role === "cashier" ? 1 : 0 }]];
    }
    throw new Error(`Unexpected query: ${String(sql)}`);
  };

  try {
    const reportFeed = findRoute("get", "/");
    assert.equal((await runGuards(reportFeed)).statusCode, 401);
    assert.equal((await runGuards(reportFeed, bearerFor("customer"))).statusCode, 403);

    const denied = await runGuards(reportFeed, bearerFor("inventory_manager"));
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.reachedHandler, false);
    assert.match(denied.body.message, /Sales Report access required/i);

    assert.equal(
      (await runGuards(reportFeed, bearerFor("cashier"))).reachedHandler,
      true,
    );
    assert.equal(
      (await runGuards(reportFeed, bearerFor("administrator"))).reachedHandler,
      true,
    );
    assert.deepEqual(
      permissionQueries.map((query) => query.params),
      [["inventory_manager"], ["cashier"]],
    );

    const protectedReceipt = findRoute("get", "/:id/receipt");
    assert.equal(
      (await runGuards(protectedReceipt, bearerFor("inventory_manager"))).statusCode,
      403,
    );

    for (const [method, path, role] of [
      ["get", "/queue", "inventory_manager"],
      ["get", "/new-online", "cashier"],
      ["get", "/ready-pickup", "cashier"],
      ["get", "/delivery-handover", "cashier"],
      ["get", "/shift", "cashier"],
      ["post", "/", "cashier"],
      ["patch", "/:id", "inventory_manager"],
    ]) {
      const operational = await runGuards(findRoute(method, path), bearerFor(role));
      assert.equal(
        operational.reachedHandler,
        true,
        `${method.toUpperCase()} ${path} must remain operational for ${role}`,
      );
    }
  } finally {
    db.query = originalQuery;
  }
});

