function isPayMongoEnabled() {
  const configured = String(process.env.PAYMONGO_ENABLED ?? "false")
    .trim()
    .toLowerCase();
  return !["false", "0", "off", "no"].includes(configured);
}

module.exports = {
  isPayMongoEnabled,
};
