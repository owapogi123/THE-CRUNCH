"use strict";

const assert = require("node:assert/strict");

const { allocateOrderIdentifiers } = require("./orderIdentifierService");

async function run(profile) {
  process.env.DB_SCHEMA_PROFILE = profile;
  const sql = [];
  let allocation = profile === "redesigned" ? 1000 : 1000;
  const connection = {
    async query(statement) {
      const normalized = String(statement).replace(/\s+/g, " ").trim();
      sql.push(normalized);
      if (normalized.startsWith("SELECT LAST_INSERT_ID")) {
        const value = allocation;
        allocation = allocation === 1000 ? 1 : allocation + 1;
        return [[{ allocatedValue: value }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  const result = await allocateOrderIdentifiers(
    connection,
    "dine-in",
    new Date("2026-11-09T00:00:00+08:00"),
  );
  assert.equal(result.orderNumber, "#1000");
  return sql;
}

(async () => {
  const redesignedSql = await run("redesigned");
  assert.ok(redesignedSql.some((sql) => sql.includes("INSERT INTO business_counters")));
  assert.ok(redesignedSql.every((sql) => !sql.includes("order_daily_counters")));

  const legacySql = await run("legacy");
  assert.ok(legacySql.some((sql) => sql.includes("INSERT INTO order_daily_counters")));
  assert.ok(legacySql.every((sql) => !sql.includes("business_counters")));

  console.log("Order identifier profile tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
