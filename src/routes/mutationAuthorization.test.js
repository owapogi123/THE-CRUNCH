const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "mutation-authorization-test-only-secret";

const routeCases = [
  [require("./productRoutes"), "post", "/", "inventory_manager", "product writes"],
  [require("./inventoryRoutes"), "put", "/:inventory_id", "inventory_manager", "inventory updates"],
  [require("./inventoryRoutes"), "post", "/batches", "inventory_manager", "inventory batch writes"],
  [require("./inventoryRoutes"), "patch", "/daily-usage/:id/finalize", "inventory_manager", "daily usage finalization"],
  [require("./kitchenUsageRoutes"), "put", "/today", "cook", "legacy kitchen usage writes"],
  [require("./kitchenUsageRoutes"), "patch", "/:reportId/finalize", "inventory_manager", "legacy kitchen usage finalization"],
  [require("./Purchaseorders"), "post", "/", "inventory_manager", "purchase order writes"],
  [require("./batches"), "post", "/", "inventory_manager", "storage batch writes"],
  [require("./batches"), "post", "/kitchen", "cook", "kitchen batch writes"],
  [require("./stockStatusRoutes"), "post", "/", "inventory_manager", "stock-status writes"],
  [require("./suppliersRoutes"), "post", "/", "inventory_manager", "supplier writes"],
  [require("./settingsRoutes"), "post", "/", "administrator", "settings writes"],
  [require("./settingsRoutes"), "put", "/permissions", "administrator", "permission writes"],
  [require("./settingsRoutes"), "post", "/inventory-categories", "administrator", "category writes"],
  [require("./settingsRoutes"), "post", "/discount-types", "administrator", "discount writes"],
  [require("./settingsRoutes"), "post", "/inventory-units", "administrator", "unit writes"],
];

function findRoute(router, method, path) {
  return router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods?.[method],
  )?.route;
}

async function runBoundary(route, role, { authenticated = true } = {}) {
  const token = authenticated
    ? jwt.sign({ userId: 44, role }, process.env.JWT_SECRET, { expiresIn: "5m" })
    : null;
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const result = { statusCode: 200, reachedHandler: false };
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
  const boundaryHandlers = route.stack.slice(0, -1).map((layer) => layer.handle);

  async function dispatch(index) {
    if (index >= boundaryHandlers.length) {
      result.reachedHandler = true;
      return;
    }
    await boundaryHandlers[index](req, res, () => dispatch(index + 1));
  }

  await dispatch(0);
  return result;
}

for (const [router, method, path, allowedRole, label] of routeCases) {
  test(`${label}: authentication and role checks run before business logic`, async () => {
    const route = findRoute(router, method, path);
    assert.ok(route, `${method.toUpperCase()} ${path} was not found`);
    assert.ok(route.stack.length >= 2, `${label} has no authorization boundary`);

    const unauthenticated = await runBoundary(route, "", { authenticated: false });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(unauthenticated.reachedHandler, false);

    const unauthorized = await runBoundary(route, "cashier");
    assert.equal(unauthorized.statusCode, 403);
    assert.equal(unauthorized.reachedHandler, false);

    const authorized = await runBoundary(route, allowedRole);
    assert.equal(authorized.reachedHandler, true);

    const administrator = await runBoundary(route, "administrator");
    assert.equal(administrator.reachedHandler, true);
  });
}

test("cashier does not inherit Inventory Manager mutation access", async () => {
  const route = findRoute(require("./productRoutes"), "post", "/");
  const result = await runBoundary(route, "cashier");
  assert.equal(result.statusCode, 403);
  assert.equal(result.reachedHandler, false);
});

test("product image upload authenticates before Multer writes a file", async () => {
  const route = findRoute(require("./uploadProductImageRoutes"), "post", "/");
  assert.ok(route);
  assert.equal(route.stack[0].handle.name, "roleAccessMiddleware");

  const unauthenticated = await runBoundary(
    { stack: route.stack.slice(0, 2) },
    "",
    { authenticated: false },
  );
  assert.equal(unauthenticated.statusCode, 401);

  const unauthorized = await runBoundary(
    { stack: route.stack.slice(0, 2) },
    "cashier",
  );
  assert.equal(unauthorized.statusCode, 403);

  const authorized = await runBoundary(
    { stack: route.stack.slice(0, 2) },
    "inventory_manager",
  );
  assert.equal(authorized.reachedHandler, true);

  const administrator = await runBoundary(
    { stack: route.stack.slice(0, 2) },
    "administrator",
  );
  assert.equal(administrator.reachedHandler, true);
});

test("legacy kitchen usage actor IDs come from JWT identity", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "kitchenUsageRoutes.js"), "utf8");
  assert.match(source, /const preparedBy = Number\(req\.user\?\.userId\)/);
  assert.match(source, /const finalizedBy = Number\(req\.user\?\.userId\)/);
  assert.doesNotMatch(source, /req\.body\.(?:prepared_by|finalized_by)/);
});
