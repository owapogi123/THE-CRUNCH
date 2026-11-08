"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const REFUND_AUTHORIZATION_KEY = "refund_authorization";
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const refundPasswordAttempts = new Map();

function authorizationError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// In-process throttle; if running multiple Railway replicas, use a shared
// backing store for cross-instance rate limiting.
function consumeRefundPasswordAttempt(userId) {
  const now = Date.now();
  const key = String(userId);
  const previous = refundPasswordAttempts.get(key);
  const current =
    !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + ATTEMPT_WINDOW_MS }
      : previous;
  if (current.count >= MAX_ATTEMPTS) {
    throw authorizationError(
      "Too many refund authorization attempts. Try again later.",
      429,
    );
  }
  current.count += 1;
  refundPasswordAttempts.set(key, current);
}

async function getStoredRefundPasswordHash() {
  const [rows] = await db.query(
    `SELECT settings_json
       FROM system_settings
      WHERE setting_key = ?
      LIMIT 1`,
    [REFUND_AUTHORIZATION_KEY],
  );
  if (!rows.length || !rows[0].settings_json) return null;
  try {
    const parsed =
      typeof rows[0].settings_json === "string"
        ? JSON.parse(rows[0].settings_json)
        : rows[0].settings_json;
    const passwordHash = String(parsed?.passwordHash || "").trim();
    if (!passwordHash) throw new Error("Missing refund password hash");
    return passwordHash;
  } catch {
    throw authorizationError("Refund authorization is unavailable", 503);
  }
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest();
}

async function verifyRefundAuthorizationPassword(candidate, userId) {
  const numericUserId = Number(userId);
  if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
    throw authorizationError("Invalid authenticated staff user", 401);
  }
  const password = typeof candidate === "string" ? candidate : "";

  // Database setting has priority. An optional distinct Railway environment
  // secret allows rollout before the Admin Settings frontend is deployed.
  const storedHash = await getStoredRefundPasswordHash();
  const fallbackSecret = String(process.env.REFUND_AUTH_CODE || "").trim();
  const fallbackLength = Buffer.byteLength(fallbackSecret, "utf8");
  if (!storedHash && (fallbackLength < 8 || fallbackLength > 72)) {
    throw authorizationError(
      "Refund authorization is not configured. Set the refund password in Administrator Settings.",
      503,
    );
  }

  consumeRefundPasswordAttempt(numericUserId);
  let valid = false;
  if (password.length > 0 && Buffer.byteLength(password, "utf8") <= 72) {
    if (storedHash) {
      valid = await bcrypt.compare(password, storedHash);
    } else {
      valid = crypto.timingSafeEqual(
        sha256Bytes(password),
        sha256Bytes(fallbackSecret),
      );
    }
  }

  if (!valid) {
    throw authorizationError(
      "Refund authorization password is incorrect.",
      403,
    );
  }

  refundPasswordAttempts.delete(String(numericUserId));
  return true;
}

module.exports = {
  verifyRefundAuthorizationPassword,
};
