function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    const error = new Error("JWT authentication is not configured");
    error.code = "JWT_SECRET_MISSING";
    throw error;
  }
  return secret;
}

function assertJwtSecretConfigured() {
  getJwtSecret();
}

module.exports = {
  assertJwtSecretConfigured,
  getJwtSecret,
};
