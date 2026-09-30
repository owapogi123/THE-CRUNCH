const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("./jwtConfig");
const { requireAuthenticatedUser } = require("../middleware/cookViewAccess");

const originalSecret = process.env.JWT_SECRET;

function invokeAuthentication(token) {
  const result = { statusCode: 200, body: null, nextCalled: false };
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
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
  requireAuthenticatedUser(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

test.after(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

test("missing JWT_SECRET fails closed without revealing a secret", () => {
  delete process.env.JWT_SECRET;
  assert.throws(
    () => getJwtSecret(),
    (error) =>
      error?.code === "JWT_SECRET_MISSING" &&
      !String(error.message).includes("secretkey"),
  );
  assert.equal(invokeAuthentication("not-a-token").statusCode, 401);
});

test("a token signed by the configured JWT_SECRET is accepted", () => {
  process.env.JWT_SECRET = "jwt-config-test-only-secret";
  const token = jwt.sign({ userId: 12, role: "customer" }, getJwtSecret());
  const result = invokeAuthentication(token);
  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test("a token signed with a different secret is rejected", () => {
  process.env.JWT_SECRET = "jwt-config-test-only-secret";
  const forged = jwt.sign(
    { userId: 12, role: "administrator" },
    "forged-test-only-secret",
  );
  const result = invokeAuthentication(forged);
  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
});
