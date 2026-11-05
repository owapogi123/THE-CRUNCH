"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

process.env.JWT_SECRET = "auth-recovery-test-secret-at-least-32-characters";

const router = require("./authRoutes");
const {
  PASSWORD_RESET_CODE_TTL_MS,
  consumePasswordResetRateLimit,
  getPasswordResetDigest,
  passwordResetCodeMatches,
  resetRateLimitsForTests,
} = router.recoveryPolicy;

assert.equal(PASSWORD_RESET_CODE_TTL_MS, 10 * 60 * 1000);

const digest = getPasswordResetDigest("User@Example.com", "123456");
assert.match(digest, /^[a-f0-9]{64}$/);
assert.notEqual(digest, "123456");
assert.equal(passwordResetCodeMatches(digest, "user@example.com", "123456"), true);
assert.equal(passwordResetCodeMatches(digest, "user@example.com", "654321"), false);
assert.equal(passwordResetCodeMatches("123456", "user@example.com", "123456"), true);

resetRateLimitsForTests();
assert.equal(consumePasswordResetRateLimit("request:email", "user@example.com", 2, 1000).allowed, true);
assert.equal(consumePasswordResetRateLimit("request:email", "user@example.com", 2, 1001).allowed, true);
const limited = consumePasswordResetRateLimit("request:email", "user@example.com", 2, 1002);
assert.equal(limited.allowed, false);
assert.ok(limited.retryAfterSeconds > 0);

const source = fs.readFileSync(__filename.replace("authRecoverySecurity.test.js", "authRoutes.js"), "utf8");
assert.match(source, /password_reset_expires >= CURRENT_TIMESTAMP/);
assert.match(source, /Number\(updated\?\.affectedRows \|\| 0\) !== 1/);
assert.match(source, /If that email is registered, a reset code has been sent/);
assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*resetCode/);

console.log("Account-recovery security tests passed");
