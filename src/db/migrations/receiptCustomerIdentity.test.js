"use strict";

const assert = require("node:assert/strict");
const { COLUMNS, VERSION, up } = require("./2026-11-06_receipt-customer-identity");

(async () => {
  const existing = new Set();
  const alters = [];
  const connection = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        return [[...existing].map((column_name) => ({ column_name }))];
      }
      const match = normalized.match(/ADD COLUMN `([^`]+)`/i);
      if (match) {
        existing.add(match[1].toLowerCase());
        alters.push(normalized);
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
  assert.equal(VERSION, "2026-11-06_receipt-customer-identity");
  assert.deepEqual(COLUMNS, {
    sold_to_name: "VARCHAR(150) NULL",
    cashier_name: "VARCHAR(150) NULL",
  });
  await up(connection, { log: { log() {} } });
  assert.equal(alters.length, Object.keys(COLUMNS).length);
  assert.equal(alters.length, 2);
  assert.doesNotMatch(alters.join("\n"), /customer_tin|customer_address|merchant_tin|merchant_registration_details/i);
  await up(connection, { log: { log() {} } });
  assert.equal(alters.length, Object.keys(COLUMNS).length, "migration must be idempotent");
  console.log("Receipt customer identity migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
