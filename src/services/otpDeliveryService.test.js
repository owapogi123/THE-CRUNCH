const assert = require("node:assert/strict");
const emailService = require("./emailService");
const {
  OTP_PURPOSES,
  deliverOtp,
  getOtpDeliveryMode,
} = require("./otpDeliveryService");

const originalEnvironment = {
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  NODE_ENV: process.env.NODE_ENV,
  OTP_DELIVERY_MODE: process.env.OTP_DELIVERY_MODE,
};
const originalConsoleLog = console.log;
const originalSendVerificationEmail = emailService.sendVerificationEmail;
const originalSendPasswordResetEmail = emailService.sendPasswordResetEmail;

function restoreEnvironmentVariable(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

async function run() {
  const expiration = new Date("2026-10-01T12:34:56.000Z");
  const emailCalls = [];
  const consoleMessages = [];

  emailService.sendVerificationEmail = async (payload) => {
    emailCalls.push({ type: "verification", payload });
    return { provider: "resend" };
  };
  emailService.sendPasswordResetEmail = async (payload) => {
    emailCalls.push({ type: "password-reset", payload });
    return { provider: "resend" };
  };
  console.log = (message) => {
    consoleMessages.push(message);
  };

  process.env.OTP_DELIVERY_MODE = "console";
  await deliverOtp({
    email: "user@example.com",
    otp: "123456",
    purpose: OTP_PURPOSES.SIGNUP_VERIFICATION,
    expiresAt: expiration,
    customerName: "Test User",
  });

  assert.equal(getOtpDeliveryMode(), "console");
  assert.equal(emailCalls.length, 0);
  assert.equal(
    consoleMessages[0],
    [
      "========================================",
      "\u{1F510} OTP TEST MODE",
      "Purpose: Signup Verification",
      "Email: user@example.com",
      "OTP: [REDACTED]",
      "Expires: 2026-10-01T12:34:56.000Z",
      "========================================",
    ].join("\n"),
  );

  await deliverOtp({
    email: "user@example.com",
    otp: "654321",
    purpose: OTP_PURPOSES.PASSWORD_RESET,
    expiresAt: expiration,
    customerName: "Test User",
  });

  assert.equal(emailCalls.length, 0);
  assert.equal(
    consoleMessages[1],
    [
      "========================================",
      "\u{1F510} OTP TEST MODE",
      "Purpose: Password Reset",
      "Email: user@example.com",
      "OTP: [REDACTED]",
      "Expires: 2026-10-01T12:34:56.000Z",
      "========================================",
    ].join("\n"),
  );

  process.env.OTP_DELIVERY_MODE = "email";
  await deliverOtp({
    email: "user@example.com",
    otp: "222333",
    purpose: OTP_PURPOSES.SIGNUP_VERIFICATION,
    expiresAt: expiration,
    customerName: "Test User",
  });

  assert.equal(getOtpDeliveryMode(), "email");
  assert.equal(emailCalls[0].type, "verification");

  delete process.env.OTP_DELIVERY_MODE;
  process.env.NODE_ENV = "development";
  process.env.EMAIL_PROVIDER = "console";
  await deliverOtp({
    email: "user@example.com",
    otp: "654321",
    purpose: OTP_PURPOSES.PASSWORD_RESET,
    expiresAt: expiration,
    customerName: "Test User",
  });

  assert.equal(getOtpDeliveryMode(), "email");
  assert.deepEqual(emailCalls[1], {
    type: "password-reset",
    payload: {
      to: "user@example.com",
      code: "654321",
      customerName: "Test User",
    },
  });

  process.env.OTP_DELIVERY_MODE = "unexpected-value";
  await deliverOtp({
    email: "user@example.com",
    otp: "111222",
    purpose: OTP_PURPOSES.SIGNUP_VERIFICATION,
    expiresAt: expiration,
    customerName: "Test User",
  });

  assert.equal(getOtpDeliveryMode(), "email");
  assert.equal(emailCalls[2].type, "verification");
}

run()
  .then(() => {
    originalConsoleLog("OTP delivery tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreEnvironmentVariable(
      "OTP_DELIVERY_MODE",
      originalEnvironment.OTP_DELIVERY_MODE,
    );
    restoreEnvironmentVariable("NODE_ENV", originalEnvironment.NODE_ENV);
    restoreEnvironmentVariable(
      "EMAIL_PROVIDER",
      originalEnvironment.EMAIL_PROVIDER,
    );
    console.log = originalConsoleLog;
    emailService.sendVerificationEmail = originalSendVerificationEmail;
    emailService.sendPasswordResetEmail = originalSendPasswordResetEmail;
  });
