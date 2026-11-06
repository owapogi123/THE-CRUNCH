"use strict";

const assert = require("node:assert/strict");
const { VERSION, up } = require("./2026-11-06_po-receipt-quantities-and-shelf-life-months");

function fakeConnection(initial = []) {
  const columns = new Set(initial.map(([table, column]) => `${table}.${column}`.toLowerCase()));
  const alters = [];
  return {
    alters,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        return [columns.has(`${params[0]}.${params[1]}`.toLowerCase()) ? [{ present: 1 }] : []];
      }
      if (/^ALTER TABLE/i.test(normalized)) {
        alters.push(normalized);
        if (/purchase_order_items/i.test(normalized)) columns.add("purchase_order_items.received_quantity");
        if (/`batches`/i.test(normalized)) columns.add("batches.shelf_life_months");
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
}

(async () => {
  assert.equal(VERSION, "2026-11-06_po-receipt-quantities-and-shelf-life-months");
  const connection = fakeConnection();
  await up(connection, { log: { log() {} } });
  assert.equal(connection.alters.length, 2);
  assert.match(connection.alters[0], /received_quantity.*DECIMAL\(10,2\).*NULL/i);
  assert.match(connection.alters[1], /shelf_life_months.*INT NULL/i);
  await up(connection, { log: { log() {} } });
  assert.equal(connection.alters.length, 2, "migration must be idempotent");
  console.log("PO receipt quantity and shelf-life months migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
