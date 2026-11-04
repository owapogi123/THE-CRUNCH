"use strict";

const assert = require("node:assert/strict");
const {
  CREATE_LOOKUP_INDEX_SQL,
  DROP_GLOBAL_UNIQUE_INDEX_SQL,
  up,
} = require("./2026-11-03_third-party-reference-reuse");

function createDatabase({ tableExists = true, unique = true, lookup = false } = {}) {
  const state = { tableExists, unique, lookup, statements: [] };
  return {
    state,
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.TABLES/i.test(normalized)) {
        return [state.tableExists ? [{ 1: 1 }] : []];
      }
      if (/^SHOW INDEX FROM `orders`/i.test(normalized)) {
        return [[
          ...(state.unique
            ? [{ Key_name: "uq_orders_payment_reference", Non_unique: 0 }]
            : []),
          ...(state.lookup
            ? [{ Key_name: "idx_orders_payment_reference", Non_unique: 1 }]
            : []),
        ]];
      }
      if (/DROP INDEX `uq_orders_payment_reference`/i.test(normalized)) {
        state.unique = false;
        state.statements.push(normalized);
        return [{ affectedRows: 0 }];
      }
      if (/CREATE INDEX `idx_orders_payment_reference`/i.test(normalized)) {
        state.lookup = true;
        state.statements.push(normalized);
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected migration query: ${normalized}`);
    },
  };
}

(async () => {
  assert.match(DROP_GLOBAL_UNIQUE_INDEX_SQL, /DROP INDEX/i);
  assert.match(CREATE_LOOKUP_INDEX_SQL, /CREATE INDEX/i);
  assert.doesNotMatch(
    `${DROP_GLOBAL_UNIQUE_INDEX_SQL} ${CREATE_LOOKUP_INDEX_SQL}`,
    /DELETE|TRUNCATE|DROP TABLE/i,
  );

  const database = createDatabase();
  await up(database, { log: { log() {} } });
  assert.equal(database.state.unique, false);
  assert.equal(database.state.lookup, true);
  assert.equal(database.state.statements.length, 2);
  assert.match(database.state.statements[0], /CREATE INDEX/i);
  assert.match(database.state.statements[1], /DROP INDEX/i);
  await up(database, { log: { log() {} } });
  assert.equal(database.state.statements.length, 2, "migration must be idempotent");

  await assert.rejects(
    () => up(createDatabase({ tableExists: false }), { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );

  console.log("Third-party payment-reference reuse migration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
