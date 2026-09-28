const BUSINESS_TIME_ZONE = "Asia/Manila";
const GLOBAL_ORDER_SCOPE = "GLOBAL";
const FIRST_ORDER_NUMBER = 1000;
const MAX_TRANSACTION_SEQUENCE = 999;

const ORDER_TYPE_CODES = Object.freeze({
  delivery: "001",
  "dine-in": "100",
  "take-out": "010",
});

function normalizeIdentifierOrderType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "delivery") return "delivery";
  if (normalized === "take-out" || normalized === "takeout") return "take-out";
  return "dine-in";
}

function getBusinessDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("A valid server date is required to allocate order identifiers");
    error.statusCode = 500;
    throw error;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = values.year;
  const month = values.month;
  const day = values.day;

  return {
    businessDate: `${year}-${month}-${day}`,
    compactDate: `${month}${day}${year.slice(-2)}`,
  };
}

async function allocateCounter(connection, businessDate, scope, firstValue) {
  await connection.query(
    `INSERT INTO order_daily_counters
       (business_date, counter_scope, counter_value)
     VALUES (?, ?, LAST_INSERT_ID(?))
     ON DUPLICATE KEY UPDATE
       counter_value = LAST_INSERT_ID(counter_value + 1)`,
    [businessDate, scope, firstValue],
  );
  const [rows] = await connection.query(
    "SELECT LAST_INSERT_ID() AS allocatedValue",
  );
  const allocatedValue = Number(rows[0]?.allocatedValue);
  if (!Number.isSafeInteger(allocatedValue) || allocatedValue < firstValue) {
    const error = new Error(`Failed to allocate the daily ${scope} order counter`);
    error.statusCode = 500;
    throw error;
  }
  return allocatedValue;
}

async function allocateOrderIdentifiers(connection, orderType, now = new Date()) {
  if (!connection || typeof connection.query !== "function") {
    const error = new Error("A transactional database connection is required");
    error.statusCode = 500;
    throw error;
  }

  const normalizedOrderType = normalizeIdentifierOrderType(orderType);
  const typeCode = ORDER_TYPE_CODES[normalizedOrderType];
  const { businessDate, compactDate } = getBusinessDateParts(now);

  // Always lock/allocate the global scope first. A consistent lock order avoids
  // deadlocks between mixed order types while preserving a global daily order sequence.
  const orderNumberValue = await allocateCounter(
    connection,
    businessDate,
    GLOBAL_ORDER_SCOPE,
    FIRST_ORDER_NUMBER,
  );
  const transactionSequence = await allocateCounter(
    connection,
    businessDate,
    typeCode,
    1,
  );

  if (transactionSequence > MAX_TRANSACTION_SEQUENCE) {
    const error = new Error(
      `The daily transaction sequence for ${normalizedOrderType} orders on ${businessDate} has been exhausted`,
    );
    error.statusCode = 409;
    error.code = "ORDER_TRANSACTION_SEQUENCE_EXHAUSTED";
    throw error;
  }

  const transactionId = `${typeCode}${compactDate}${String(transactionSequence).padStart(3, "0")}`;
  return {
    businessDate,
    orderNumberValue,
    orderNumber: `#${orderNumberValue}`,
    transactionId,
    transactionSequence,
    typeCode,
  };
}

function formatOrderNumber(orderNumberValue, internalOrderId) {
  const numericOrderNumber = Number(orderNumberValue);
  if (Number.isSafeInteger(numericOrderNumber) && numericOrderNumber >= FIRST_ORDER_NUMBER) {
    return `#${numericOrderNumber}`;
  }
  const numericInternalId = Number(internalOrderId);
  return Number.isSafeInteger(numericInternalId) && numericInternalId > 0
    ? `#${numericInternalId}`
    : "";
}

function formatTransactionId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

module.exports = {
  BUSINESS_TIME_ZONE,
  FIRST_ORDER_NUMBER,
  GLOBAL_ORDER_SCOPE,
  MAX_TRANSACTION_SEQUENCE,
  ORDER_TYPE_CODES,
  allocateOrderIdentifiers,
  formatOrderNumber,
  formatTransactionId,
  getBusinessDateParts,
  normalizeIdentifierOrderType,
};
