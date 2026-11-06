"use strict";

const assert = require("node:assert/strict");
const { VERSION, up } = require("./2026-11-06_paymongo-checkout-intents");

(async () => {
  const statements = [];
  const connection = {
    async query(sql) {
      statements.push(String(sql).replace(/\s+/g, " ").trim());
      return [{ affectedRows: 0 }];
    },
  };
  assert.equal(VERSION, "2026-11-06_paymongo-checkout-intents");
  await up(connection, { log: { log() {} } });
  await up(connection, { log: { log() {} } });
  assert.equal(statements.length, 2);
  for (const sql of statements) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS paymongo_checkout_intents/i);
    assert.match(sql, /intent_id CHAR\(36\).*PRIMARY KEY/i);
    assert.match(sql, /items_json JSON NOT NULL/i);
    assert.match(sql, /amount_centavos BIGINT UNSIGNED NOT NULL/i);
    assert.match(sql, /uq_paymongo_intents_checkout_request/i);
    assert.match(sql, /uq_paymongo_intents_checkout_session/i);
    assert.match(sql, /finalized_order_id INT NULL/i);
    assert.match(sql, /reconciliation_message VARCHAR\(500\) NULL/i);
  }
  console.log("PayMongo checkout intent migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
