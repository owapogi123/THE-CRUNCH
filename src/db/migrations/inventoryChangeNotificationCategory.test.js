"use strict";

const assert = require("node:assert/strict");
const {
  MIGRATION_SQL,
  parseEnumValues,
  up,
} = require("./2026-11-01_inventory-change-notification-category");

function createDatabase(initialColumnType) {
  const state = { columnType: initialColumnType, alters: [] };
  return {
    state,
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        if (state.columnType == null) return [[]];
        return [[{ COLUMN_TYPE: state.columnType, IS_NULLABLE: "NO" }]];
      }
      if (/^ALTER TABLE `staff_notifications`/i.test(normalized)) {
        state.alters.push(normalized);
        const enumStart = normalized.indexOf("ENUM(");
        const enumEnd = normalized.lastIndexOf(") NOT NULL");
        state.columnType = normalized.slice(enumStart, enumEnd + 1).toLowerCase();
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected migration query: ${normalized}`);
    },
  };
}

(async () => {
  assert.deepEqual(
    parseEnumValues("enum('refund_request','purchase_order')"),
    ["refund_request", "purchase_order"],
  );
  assert.match(MIGRATION_SQL, /inventory_change/);
  assert.doesNotMatch(MIGRATION_SQL, /DROP|DELETE|TRUNCATE/i);

  const existing = createDatabase("enum('refund_request','purchase_order')");
  await up(existing, { log: { log() {} } });
  assert.equal(existing.state.alters.length, 1);
  assert.match(existing.state.alters[0], /'refund_request','purchase_order','inventory_change'/i);
  assert.doesNotMatch(existing.state.alters[0], /DROP|DELETE|TRUNCATE/i);

  await up(existing, { log: { log() {} } });
  assert.equal(existing.state.alters.length, 1, "the migration must be idempotent");

  const futureCompatible = createDatabase(
    "enum('refund_request','purchase_order','future_category')",
  );
  await up(futureCompatible, { log: { log() {} } });
  assert.match(
    futureCompatible.state.alters[0],
    /'refund_request','purchase_order','future_category','inventory_change'/i,
  );

  await assert.rejects(
    () => up(createDatabase("varchar(50)"), { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );
  await assert.rejects(
    () => up(createDatabase(null), { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );

  console.log("Inventory-change notification category migration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
