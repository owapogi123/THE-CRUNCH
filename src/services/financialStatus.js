const FINALIZED_ORDER_STATUSES = new Set(["completed", "picked up"]);
const PAID_PAYMENT_STATUSES = new Set(["paid", "completed"]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isPaidPaymentStatus(value) {
  return PAID_PAYMENT_STATUSES.has(normalize(value));
}

function isFinalizedSale(order) {
  return (
    FINALIZED_ORDER_STATUSES.has(normalize(order?.status)) &&
    isPaidPaymentStatus(order?.paymentStatus)
  );
}

function getFinalizedSaleSql(orderAlias = "o") {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(orderAlias)) {
    throw new Error("Invalid SQL alias for finalized-sale predicate");
  }

  return `LOWER(TRIM(COALESCE(${orderAlias}.Status, ''))) IN ('completed', 'picked up')
           AND LOWER(TRIM(COALESCE(${orderAlias}.payment_status, ''))) IN ('paid', 'completed')`;
}

module.exports = {
  getFinalizedSaleSql,
  isFinalizedSale,
  isPaidPaymentStatus,
};
