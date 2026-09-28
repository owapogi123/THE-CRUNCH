const assert = require("node:assert/strict");
const db = require("../src/config/db");
const {
  allocateOrderIdentifiers,
  formatOrderNumber,
  getBusinessDateParts,
} = require("../src/services/orderIdentifierService");

const TEST_DATES = Object.freeze([
  "2099-12-24",
  "2099-12-25",
  "2099-12-26",
  "2099-12-27",
  "2099-12-28",
  "2099-12-29",
]);

async function cleanupTestCounters() {
  const placeholders = TEST_DATES.map(() => "?").join(", ");
  await db.query(
    `DELETE FROM order_daily_counters
     WHERE business_date IN (${placeholders})
       AND counter_scope IN ('GLOBAL', '001', '010', '100')`,
    TEST_DATES,
  );
}

function serverDateForBusinessDate(date) {
  return new Date(`${date}T04:00:00.000Z`);
}

async function allocateAndCommit(orderType, date) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const identifiers = await allocateOrderIdentifiers(
      connection,
      orderType,
      serverDateForBusinessDate(date),
    );
    await connection.commit();
    return identifiers;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function testSequentialSameType() {
  const first = await allocateAndCommit("dine-in", TEST_DATES[0]);
  const second = await allocateAndCommit("dine-in", TEST_DATES[0]);
  assert.equal(first.transactionId, "100122499001");
  assert.equal(first.orderNumber, "#1000");
  assert.equal(second.transactionId, "100122499002");
  assert.equal(second.orderNumber, "#1001");
}

async function testMixedTypes() {
  const results = [];
  for (const type of ["dine-in", "take-out", "delivery", "dine-in"]) {
    results.push(await allocateAndCommit(type, TEST_DATES[1]));
  }
  assert.deepEqual(
    results.map(({ transactionId, orderNumber }) => ({ transactionId, orderNumber })),
    [
      { transactionId: "100122599001", orderNumber: "#1000" },
      { transactionId: "010122599001", orderNumber: "#1001" },
      { transactionId: "001122599001", orderNumber: "#1002" },
      { transactionId: "100122599002", orderNumber: "#1003" },
    ],
  );
}

async function testDailyReset() {
  const dineIn = await allocateAndCommit("dine-in", TEST_DATES[2]);
  const delivery = await allocateAndCommit("delivery", TEST_DATES[2]);
  assert.equal(dineIn.transactionId, "100122699001");
  assert.equal(dineIn.orderNumber, "#1000");
  assert.equal(delivery.transactionId, "001122699001");
  assert.equal(delivery.orderNumber, "#1001");
}

async function testConcurrentAllocation() {
  const types = Array.from({ length: 30 }, (_, index) =>
    ["dine-in", "take-out", "delivery"][index % 3],
  );
  const results = await Promise.all(
    types.map((type) => allocateAndCommit(type, TEST_DATES[3])),
  );
  assert.equal(new Set(results.map((result) => result.transactionId)).size, 30);
  assert.equal(new Set(results.map((result) => result.orderNumber)).size, 30);
  assert.deepEqual(
    [...results.map((result) => result.orderNumberValue)].sort((a, b) => a - b),
    Array.from({ length: 30 }, (_, index) => 1000 + index),
  );
  for (const typeCode of ["100", "010", "001"]) {
    const sequences = results
      .filter((result) => result.typeCode === typeCode)
      .map((result) => result.transactionSequence)
      .sort((a, b) => a - b);
    assert.deepEqual(sequences, Array.from({ length: 10 }, (_, index) => index + 1));
  }
}

async function testRollbackReleasesAllocation() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const rolledBack = await allocateOrderIdentifiers(
      connection,
      "dine-in",
      serverDateForBusinessDate(TEST_DATES[4]),
    );
    assert.equal(rolledBack.orderNumber, "#1000");
    await connection.rollback();

    await connection.beginTransaction();
    const reused = await allocateOrderIdentifiers(
      connection,
      "dine-in",
      serverDateForBusinessDate(TEST_DATES[4]),
    );
    assert.equal(reused.orderNumber, "#1000");
    assert.equal(reused.transactionSequence, 1);
    await connection.rollback();
  } finally {
    connection.release();
  }
}

async function testSequenceExhaustion() {
  await db.query(
    `INSERT INTO order_daily_counters (business_date, counter_scope, counter_value)
     VALUES (?, 'GLOBAL', 1000), (?, '100', 999)`,
    [TEST_DATES[5], TEST_DATES[5]],
  );
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assert.rejects(
      () =>
        allocateOrderIdentifiers(
          connection,
          "dine-in",
          serverDateForBusinessDate(TEST_DATES[5]),
        ),
      (error) =>
        error?.statusCode === 409 &&
        error?.code === "ORDER_TRANSACTION_SEQUENCE_EXHAUSTED",
    );
    await connection.rollback();
  } finally {
    connection.release();
  }
  const [rows] = await db.query(
    `SELECT counter_scope, counter_value
     FROM order_daily_counters
     WHERE business_date = ?
     ORDER BY counter_scope`,
    [TEST_DATES[5]],
  );
  assert.deepEqual(
    rows.map((row) => [row.counter_scope, Number(row.counter_value)]),
    [
      ["100", 999],
      ["GLOBAL", 1000],
    ],
  );
}

async function run() {
  const beforeMidnight = getBusinessDateParts("2026-09-27T15:59:59.000Z");
  const atMidnight = getBusinessDateParts("2026-09-27T16:00:00.000Z");
  assert.equal(beforeMidnight.businessDate, "2026-09-27");
  assert.equal(atMidnight.businessDate, "2026-09-28");
  assert.equal(atMidnight.compactDate, "092826");
  assert.equal(formatOrderNumber(null, 57), "#57");

  await cleanupTestCounters();
  try {
    await testSequentialSameType();
    await testMixedTypes();
    await testDailyReset();
    await testConcurrentAllocation();
    await testRollbackReleasesAllocation();
    await testSequenceExhaustion();
  } finally {
    await cleanupTestCounters();
    await db.end();
  }
  console.log("Order identifier tests passed");
}

run().catch(async (error) => {
  console.error(error);
  try {
    await cleanupTestCounters();
    await db.end();
  } catch (_) {
    // Preserve the original test failure.
  }
  process.exit(1);
});
