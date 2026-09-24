const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  isSuperuserRole,
  canAccessRoles,
} = require("./roleAccess");
const { requireCookViewAccess } = require("./cookViewAccess");

function runCookViewMiddleware(role) {
  const token = jwt.sign(
    { userId: 1, role },
    process.env.JWT_SECRET || "secretkey",
  );
  const result = { nextCalled: false, status: null, body: null };
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };

  requireCookViewAccess(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

test("administrator is the superuser without changing its role", () => {
  assert.equal(isSuperuserRole("administrator"), true);
  assert.equal(isSuperuserRole("cashier"), false);
  assert.equal(canAccessRoles("administrator", ["inventory_manager"]), true);
  assert.equal(canAccessRoles("administrator", ["cashier"]), true);
});

test("non-admin roles retain their own allowed-role boundaries", () => {
  assert.equal(canAccessRoles("cashier", ["cashier"]), true);
  assert.equal(canAccessRoles("cashier", ["inventory_manager"]), false);
  assert.equal(canAccessRoles("inventory_manager", ["cashier"]), false);
  assert.equal(canAccessRoles("customer", ["cashier", "inventory_manager"]), false);
  assert.equal(canAccessRoles("", ["cashier"]), false);
});

test("guarded staff APIs accept Admin and retain customer denial", () => {
  assert.equal(runCookViewMiddleware("administrator").nextCalled, true);
  assert.equal(runCookViewMiddleware("cashier").nextCalled, true);
  assert.equal(runCookViewMiddleware("inventory_manager").nextCalled, true);

  const customerResult = runCookViewMiddleware("customer");
  assert.equal(customerResult.nextCalled, false);
  assert.equal(customerResult.status, 403);
});
