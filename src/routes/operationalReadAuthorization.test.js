"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "operational-read-authorization-test-secret";

const reportsRouter = require("./reportsRoutes");
const suppliersRouter = require("./suppliersRoutes");
const batchesRouter = require("./batches");
const stockStatusRouter = require("./stockStatusRoutes");
const feedbackRouter = require("./feedbackRoutes");

const INVENTORY_READ_ROLES = ["inventory_manager", "administrator"];

const privateReads = [
  { router: reportsRouter, method: "get", path: "/", roles: INVENTORY_READ_ROLES },
  { router: reportsRouter, method: "get", path: "/weekly", roles: INVENTORY_READ_ROLES },
  { router: reportsRouter, method: "get", path: "/monthly", roles: INVENTORY_READ_ROLES },
  { router: suppliersRouter, method: "get", path: "/", roles: INVENTORY_READ_ROLES },
  { router: suppliersRouter, method: "get", path: "/history", roles: INVENTORY_READ_ROLES },
  { router: batchesRouter, method: "get", path: "/kitchen", roles: INVENTORY_READ_ROLES },
  { router: batchesRouter, method: "get", path: "/kitchen/today", roles: INVENTORY_READ_ROLES },
  { router: batchesRouter, method: "get", path: "/product/:product_id", roles: INVENTORY_READ_ROLES },
  { router: batchesRouter, method: "get", path: "/returned/yesterday", roles: INVENTORY_READ_ROLES },
  { router: batchesRouter, method: "get", path: "/active", roles: INVENTORY_READ_ROLES },
  { router: stockStatusRouter, method: "get", path: "/today", roles: INVENTORY_READ_ROLES },
  { router: feedbackRouter, method: "get", path: "/", roles: ["administrator"] },
];

function findRoute(router, method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route is missing`);
  assert.ok(
    layer.route.stack.length >= 2,
    `${method.toUpperCase()} ${path} must authorize before its handler`,
  );
  return layer;
}

function invoke(middleware, authorization) {
  const result = { statusCode: 200, body: null, nextCalled: false };
  const req = { headers: authorization ? { authorization } : {} };
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
  middleware(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

function bearerFor(role) {
  return `Bearer ${jwt.sign({ role, userId: 17 }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  })}`;
}

test("every operational GET route in scope has an explicit authorization guard", () => {
  const expectedByRouter = new Map([
    [reportsRouter, ["/", "/monthly", "/weekly"]],
    [suppliersRouter, ["/", "/history"]],
    [batchesRouter, ["/active", "/kitchen", "/kitchen/today", "/product/:product_id", "/returned/yesterday"]],
    [stockStatusRouter, ["/today"]],
    [feedbackRouter, ["/"]],
  ]);

  for (const [router, expectedPaths] of expectedByRouter) {
    const actualPaths = router.stack
      .filter((entry) => entry.route?.methods?.get)
      .map((entry) => entry.route.path)
      .sort();
    assert.deepEqual(actualPaths, [...expectedPaths].sort());
  }

  for (const route of privateReads) {
    findRoute(route.router, route.method, route.path);
  }
});

test("operational reads reject missing and invalid tokens before database handlers", () => {
  for (const route of privateReads) {
    const middleware = findRoute(route.router, route.method, route.path).route.stack[0].handle;
    const missing = invoke(middleware);
    assert.equal(missing.statusCode, 401, `${route.method} ${route.path} missing token`);
    assert.equal(missing.nextCalled, false);

    const invalid = invoke(middleware, "Bearer not-a-valid-jwt");
    assert.equal(invalid.statusCode, 401, `${route.method} ${route.path} invalid token`);
    assert.equal(invalid.nextCalled, false);
  }
});

test("inventory operational reads allow Inventory Manager and Administrator only", () => {
  for (const route of privateReads.filter((entry) => entry.router !== feedbackRouter)) {
    const middleware = findRoute(route.router, route.method, route.path).route.stack[0].handle;
    for (const role of route.roles) {
      const allowed = invoke(middleware, bearerFor(role));
      assert.equal(allowed.nextCalled, true, `${role} should access ${route.path}`);
    }
    for (const role of ["cashier", "customer"]) {
      const denied = invoke(middleware, bearerFor(role));
      assert.equal(denied.statusCode, 403, `${role} should be denied ${route.path}`);
      assert.equal(denied.nextCalled, false);
    }
  }
});

test("feedback listing is Administrator-only", () => {
  const route = findRoute(feedbackRouter, "get", "/");
  const middleware = route.route.stack[0].handle;
  assert.equal(invoke(middleware, bearerFor("administrator")).nextCalled, true);
  for (const role of ["inventory_manager", "cashier", "customer"]) {
    const denied = invoke(middleware, bearerFor(role));
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.nextCalled, false);
  }
});

test("authenticated customer feedback submission remains available", () => {
  const route = findRoute(feedbackRouter, "post", "/");
  const middleware = route.route.stack[0].handle;

  assert.equal(invoke(middleware).statusCode, 401);
  assert.equal(invoke(middleware, "Bearer invalid").statusCode, 401);
  assert.equal(invoke(middleware, bearerFor("customer")).nextCalled, true);
});
