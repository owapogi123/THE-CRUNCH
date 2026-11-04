"use strict";

const assert = require("node:assert/strict");
const {
  CREATE_TABLE_SQL,
  up,
} = require("./2026-11-04_order-inventory-deduction-snapshots");

function createDatabase({ orders = true, snapshots = false } = {}) {
  const state = { orders, snapshots, statements: [] };
  return {
    state,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.TABLES/i.test(normalized)) {
        const table = String(params[0] || "").toLowerCase();
        return [[state[table === "orders" ? "orders" : "snapshots"] ? { 1: 1 } : undefined]
          .filter(Boolean)];
      }
      if (/^CREATE TABLE IF NOT EXISTS order_inventory_deductions/i.test(normalized)) {
        state.snapshots = true;
        state.statements.push(normalized);
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected migration query: ${normalized}`);
    },
  };
}

(async () => {
  assert.match(CREATE_TABLE_SQL, /PRIMARY KEY \(order_id, product_id\)/i);
  assert.match(CREATE_TABLE_SQL, /quantity DECIMAL\(14,4\) NOT NULL/i);
  assert.match(CREATE_TABLE_SQL, /CHECK \(quantity > 0\)/i);
  assert.match(CREATE_TABLE_SQL, /REFERENCES orders\(Order_ID\)/i);
  assert.doesNotMatch(CREATE_TABLE_SQL, /DELETE FROM|TRUNCATE|DROP TABLE/i);

  const database = createDatabase();
  await up(database, { log: { log() {} } });
  assert.equal(database.state.snapshots, true);
  assert.equal(database.state.statements.length, 1);
  await up(database, { log: { log() {} } });
  assert.equal(database.state.statements.length, 1, "migration must be idempotent");

  await assert.rejects(
    () => up(createDatabase({ orders: false }), { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );

  console.log("Order inventory deduction snapshot migration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
