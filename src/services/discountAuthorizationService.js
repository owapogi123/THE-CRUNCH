const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("./jwtConfig");

const APPROVAL_PURPOSE = "discount_authorization";
const APPROVAL_ISSUER = "the-crunch-pos";
const APPROVAL_AUDIENCE = "discount-authorization";
const APPROVAL_TTL_SECONDS = 5 * 60;
const consumedApprovals = new Map();

function createAuthorizationError(
  message = "Discount authorization is required",
  statusCode = 403,
) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getConfiguredAuthorizationCode() {
  const code = String(process.env.DISCOUNT_AUTH_CODE || "").trim();
  if (!code) {
    throw createAuthorizationError(
      "Discount authorization is unavailable",
      503,
    );
  }
  return code;
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function verifyAuthorizationCode(candidate) {
  const expected = getConfiguredAuthorizationCode();
  const provided = String(candidate || "");
  return crypto.timingSafeEqual(hashSecret(provided), hashSecret(expected));
}

function getApprovalSigningKey() {
  const jwtSecret = getJwtSecret();
  return crypto
    .createHmac("sha256", jwtSecret)
    .update("the-crunch-discount-approval-v1")
    .digest();
}

function normalizeDiscountRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.max(0, rate).toFixed(4) : "0.0000";
}

function buildOrderFingerprint(items) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: Number(item?.product_id ?? item?.productId ?? item?.id),
      quantity: Number(item?.qty ?? item?.quantity),
    }))
    .sort((left, right) => left.productId - right.productId);

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedItems))
    .digest("hex");
}

function cleanupConsumedApprovals(now = Date.now()) {
  for (const [approvalId, expiresAt] of consumedApprovals.entries()) {
    if (expiresAt <= now) consumedApprovals.delete(approvalId);
  }
}

function issueDiscountApproval({
  userId,
  discountId,
  discountRate,
  items,
  expiresInSeconds = APPROVAL_TTL_SECONDS,
}) {
  const normalizedUserId = Number(userId);
  const normalizedDiscountId = Number(discountId);
  if (
    !Number.isSafeInteger(normalizedUserId) ||
    normalizedUserId <= 0 ||
    !Number.isSafeInteger(normalizedDiscountId) ||
    normalizedDiscountId <= 0 ||
    Number(discountRate) <= 0
  ) {
    throw createAuthorizationError("Discount authorization failed");
  }

  return jwt.sign(
    {
      purpose: APPROVAL_PURPOSE,
      discountId: normalizedDiscountId,
      discountRate: normalizeDiscountRate(discountRate),
      orderFingerprint: buildOrderFingerprint(items),
    },
    getApprovalSigningKey(),
    {
      algorithm: "HS256",
      subject: String(normalizedUserId),
      issuer: APPROVAL_ISSUER,
      audience: APPROVAL_AUDIENCE,
      expiresIn: expiresInSeconds,
      jwtid: crypto.randomUUID(),
    },
  );
}

function verifyDiscountApproval({
  token,
  userId,
  discountId,
  discountRate,
  items,
}) {
  if (!token) throw createAuthorizationError();

  let claims;
  try {
    claims = jwt.verify(String(token), getApprovalSigningKey(), {
      algorithms: ["HS256"],
      subject: String(Number(userId)),
      issuer: APPROVAL_ISSUER,
      audience: APPROVAL_AUDIENCE,
    });
  } catch {
    throw createAuthorizationError("Discount authorization is invalid or expired");
  }

  if (
    claims?.purpose !== APPROVAL_PURPOSE ||
    Number(claims?.discountId) !== Number(discountId) ||
    claims?.discountRate !== normalizeDiscountRate(discountRate) ||
    claims?.orderFingerprint !== buildOrderFingerprint(items) ||
    !claims?.jti
  ) {
    throw createAuthorizationError("Discount authorization is invalid or expired");
  }

  cleanupConsumedApprovals();
  if (consumedApprovals.has(claims.jti)) {
    throw createAuthorizationError("Discount authorization is invalid or expired");
  }

  return {
    approvalId: claims.jti,
    expiresAt: Number(claims.exp || 0) * 1000,
  };
}

function claimDiscountApproval(approval) {
  cleanupConsumedApprovals();
  if (!approval?.approvalId || consumedApprovals.has(approval.approvalId)) {
    throw createAuthorizationError("Discount authorization is invalid or expired");
  }
  consumedApprovals.set(approval.approvalId, approval.expiresAt || Date.now());
}

function releaseDiscountApproval(approvalId) {
  if (approvalId) consumedApprovals.delete(approvalId);
}

function resetConsumedApprovalsForTests() {
  consumedApprovals.clear();
}

module.exports = {
  APPROVAL_TTL_SECONDS,
  buildOrderFingerprint,
  claimDiscountApproval,
  issueDiscountApproval,
  releaseDiscountApproval,
  resetConsumedApprovalsForTests,
  verifyAuthorizationCode,
  verifyDiscountApproval,
};
