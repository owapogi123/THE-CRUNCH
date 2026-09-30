const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET ||= "inventory-alert-test-only-secret";
const { requireRoleAccess } = require("./cookViewAccess");

const secret = process.env.JWT_SECRET;
const middleware = requireRoleAccess([
  "administrator",
  "inventory_manager",
]);

function run(role) {
  const token = jwt.sign({ role, userId: 1 }, secret, { expiresIn: "5m" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let statusCode = 200;
  let body = null;
  let calledNext = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  middleware(req, res, () => {
    calledNext = true;
  });
  return { statusCode, body, calledNext };
}

assert.equal(run("administrator").calledNext, true);
assert.equal(run("inventory_manager").calledNext, true);
assert.equal(run("cashier").statusCode, 403);
assert.equal(run("cashier").calledNext, false);

console.log("inventory alert access tests passed");
