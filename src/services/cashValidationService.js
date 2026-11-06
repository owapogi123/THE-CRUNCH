const MAX_CASH_TENDERED_CENTS = 100_000 * 100;

function createCashValidationError() {
  const error = new Error(
    "Cash tendered must be from 0 to 100,000 with up to two decimal places and cover the order total",
  );
  error.statusCode = 400;
  return error;
}

function parseCashTenderToCents(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;

  const [wholePart, decimalPart = ""] = raw.split(".");
  const cents = (BigInt(wholePart) * 100n) + BigInt(decimalPart.padEnd(2, "0"));
  if (cents > BigInt(MAX_CASH_TENDERED_CENTS)) return null;
  return Number(cents);
}

function validateCashTender(cashTendered, authoritativeTotal) {
  const total = Number(authoritativeTotal);
  const tenderedCents = parseCashTenderToCents(cashTendered);
  if (
    tenderedCents === null ||
    !Number.isFinite(total) ||
    total < 0
  ) {
    throw createCashValidationError();
  }

  const totalCents = Math.round(total * 100);
  if (!Number.isSafeInteger(totalCents) || tenderedCents < totalCents) {
    throw createCashValidationError();
  }

  return {
    cashTendered: tenderedCents / 100,
    change: (tenderedCents - totalCents) / 100,
  };
}

module.exports = {
  validateCashTender,
};
