const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "settings-permissions-test-secret";

const router = require("./settingsRoutes");
const {
  DEFAULT_ROLE_PERMISSIONS,
  mergePermissionRoleLocks,
  mergePermissionsPayload,
  normalizePermissionsPayload,
} = router.permissionPolicy;

const EXPECTED = {
  administrator: {
    overview: true,
    orders: true,
    menuManagement: true,
    menus: true,
    stockManager: true,
    userAccounts: true,
    salesReports: true,
    settings: true,
  },
  cashier: {
    overview: true,
    orders: true,
    menuManagement: false,
    menus: true,
    stockManager: false,
    userAccounts: false,
    salesReports: true,
    settings: false,
  },
  inventory_manager: {
    overview: true,
    orders: true,
    menuManagement: true,
    menus: false,
    stockManager: true,
    userAccounts: false,
    salesReports: false,
    settings: false,
  },
};

test("backend defaults match the documented current-role matrix", () => {
  for (const [role, permissions] of Object.entries(EXPECTED)) {
    assert.deepEqual(DEFAULT_ROLE_PERMISSIONS[role], permissions);
  }
});

test("missing legacy permissions fall back without replacing saved values", () => {
  const normalized = normalizePermissionsPayload({
    cashier: { salesReports: false },
  });
  assert.equal(normalized.cashier.salesReports, false);
  assert.equal(normalized.cashier.menus, true);
  assert.equal(normalized.inventory_manager.menuManagement, true);
});

test("partial saves preserve unrelated customized permissions", () => {
  const current = normalizePermissionsPayload(DEFAULT_ROLE_PERMISSIONS);
  current.cashier.salesReports = false;
  current.inventory_manager.overview = false;

  const merged = mergePermissionsPayload(current, {
    cashier: { menus: false },
  });
  assert.equal(merged.cashier.menus, false);
  assert.equal(merged.cashier.salesReports, false);
  assert.equal(merged.inventory_manager.overview, false);
});

test("administrator remains a superuser and legacy stock-manager labels merge canonically", () => {
  const merged = mergePermissionsPayload(DEFAULT_ROLE_PERMISSIONS, {
    administrator: { settings: false, salesReports: false },
    "Stock Manager": { menus: true },
    inventory_manager: { menus: false },
  });
  assert.equal(merged.administrator.settings, true);
  assert.equal(merged.administrator.salesReports, true);
  assert.equal(merged.inventory_manager.menus, false);

  const locks = mergePermissionRoleLocks(
    { inventory_manager: false },
    { inventory_manager: false, StockManager: true },
  );
  assert.equal(locks.inventory_manager, false);
});

test("permission reads require an authenticated staff role", () => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === "/permissions" && entry.route.methods?.get,
  );
  assert.ok(layer);
  const authorize = layer.route.stack[0].handle;

  function run(role) {
    const token = jwt.sign({ role, userId: 1 }, process.env.JWT_SECRET);
    const result = { status: 200, nextCalled: false };
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {
      status(code) { result.status = code; return this; },
      json() { return this; },
    };
    authorize(req, res, () => { result.nextCalled = true; });
    return result;
  }

  assert.equal(run("customer").status, 403);
  assert.equal(run("customer").nextCalled, false);
  assert.equal(run("cashier").nextCalled, true);
  assert.equal(run("Inventory Manager").nextCalled, true);
  assert.equal(run("administrator").nextCalled, true);
});
