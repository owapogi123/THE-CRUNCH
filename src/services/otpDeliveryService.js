const emailService = require("./emailService");

const OTP_PURPOSES = Object.freeze({
  SIGNUP_VERIFICATION: "Signup Verification",
  PASSWORD_RESET: "Password Reset",
});

function getOtpDeliveryMode() {
  return String(process.env.OTP_DELIVERY_MODE || "")
    .trim()
    .toLowerCase() === "console"
    ? "console"
    : "email";
}

function sanitizeLogValue(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function formatExpiration(expiresAt) {
  const expiration = expiresAt instanceof Date
    ? expiresAt
    : new Date(expiresAt);

  if (Number.isNaN(expiration.getTime())) {
    throw new Error("A valid OTP expiration is required");
  }

  return expiration.toISOString();
}

function logOtpToConsole({ email, otp, purpose, expiresAt }) {
  console.log(
    [
      "========================================",
      "\u{1F510} OTP TEST MODE",
      `Purpose: ${sanitizeLogValue(purpose)}`,
      `Email: ${sanitizeLogValue(email)}`,
      `OTP: ${sanitizeLogValue(otp)}`,
      `Expires: ${formatExpiration(expiresAt)}`,
      "========================================",
    ].join("\n"),
  );
}

async function deliverOtp({
  email,
  otp,
  purpose,
  expiresAt,
  customerName,
}) {
  const recipient = String(email || "").trim();
  const code = String(otp || "").trim();

  if (!recipient) {
    throw new Error("Recipient email is required for OTP delivery");
  }

  if (!code) {
    throw new Error("Generated OTP code is missing");
  }

  if (!Object.values(OTP_PURPOSES).includes(purpose)) {
    throw new Error("Unsupported OTP purpose");
  }

  if (getOtpDeliveryMode() === "console") {
    logOtpToConsole({
      email: recipient,
      otp: code,
      purpose,
      expiresAt,
    });

    return {
      provider: "console",
      to: recipient,
    };
  }

  if (purpose === OTP_PURPOSES.SIGNUP_VERIFICATION) {
    return emailService.sendVerificationEmail({
      to: recipient,
      code,
      customerName,
    });
  }

  return emailService.sendPasswordResetEmail({
    to: recipient,
    code,
    customerName,
  });
}

module.exports = {
  OTP_PURPOSES,
  deliverOtp,
  getOtpDeliveryMode,
};
