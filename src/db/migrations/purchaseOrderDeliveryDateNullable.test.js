"use strict";

const assert = require("node:assert/strict");
const {
  MIGRATION_SQL,
  up,
} = require("./2026-11-01_purchase-order-delivery-date-nullable");

function createDatabase({ exists = true, dataType = "date", nullable = "NO" } = {}) {
  const state = { exists, dataType, nullable, alters: [] };
  return {
    state,
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        if (!state.exists) return [[]];
        return [[{
          DATA_TYPE: state.dataType,
          COLUMN_TYPE: state.dataType,
          IS_NULLABLE: state.nullable,
        }]];
      }
      if (/^ALTER TABLE `purchase_orders`/i.test(normalized)) {
        state.alters.push(normalized);
        state.nullable = "YES";
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected migration query: ${normalized}`);
    },
  };
}

(async () => {
  assert.match(MIGRATION_SQL, /delivery_date` DATE NULL DEFAULT NULL/i);
  assert.doesNotMatch(MIGRATION_SQL, /DROP|DELETE|TRUNCATE/i);

  const database = createDatabase();
  await up(database, { log: { log() {} } });
  assert.equal(database.state.alters.length, 1);
  await up(database, { log: { log() {} } });
  assert.equal(database.state.alters.length, 1, "migration must be idempotent");

  const alreadyNullable = createDatabase({ nullable: "YES" });
  await up(alreadyNullable, { log: { log() {} } });
  assert.equal(alreadyNullable.state.alters.length, 0);

  await assert.rejects(
    () => up(createDatabase({ exists: false }), { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );
  await assert.rejects(
    () => up(createDatabase({ dataType: "datetime" }), { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );

  console.log("Purchase-order nullable delivery-date migration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
