function createCashValidationError() {
  const error = new Error("Cash tendered must cover the order total");
  error.statusCode = 400;
  return error;
}

function validateCashTender(cashTendered, authoritativeTotal) {
  const tendered = Number(cashTendered);
  const total = Number(authoritativeTotal);
  if (
    !Number.isFinite(tendered) ||
    !Number.isFinite(total) ||
    total < 0 ||
    tendered < total
  ) {
    throw createCashValidationError();
  }

  return {
    cashTendered: tendered,
    change: Math.max(0, tendered - total),
  };
}

module.exports = {
  validateCashTender,
};
