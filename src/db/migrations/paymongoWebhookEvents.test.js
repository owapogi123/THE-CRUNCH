"use strict";

const assert = require("node:assert/strict");
const { VERSION, up } = require("./2026-11-06_paymongo-webhook-events");

(async () => {
  const statements = [];
  const connection = {
    async query(sql) {
      statements.push(String(sql).replace(/\s+/g, " ").trim());
      return [{ affectedRows: 0 }];
    },
  };
  assert.equal(VERSION, "2026-11-06_paymongo-webhook-events");
  await up(connection, { log: { log() {} } });
  await up(connection, { log: { log() {} } });
  assert.equal(statements.length, 2);
  for (const sql of statements) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS paymongo_webhook_events/i);
    assert.match(sql, /event_id VARCHAR\(100\).*PRIMARY KEY/i);
    assert.match(sql, /checkout_session_id VARCHAR\(100\)/i);
    assert.match(sql, /idx_paymongo_webhook_checkout_session/i);
  }
  console.log("PayMongo webhook event migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
