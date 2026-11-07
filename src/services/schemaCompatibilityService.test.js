"use strict";

const assert = require("node:assert/strict");
const {
  CRITICAL_COLUMNS,
  EXPECTED_FOREIGN_KEYS,
  EXPECTED_INDEXES,
  EXPECTED_TABLES,
  EXPECTED_TRIGGERS,
  normalizeTriggerSql,
  verifySchemaCompatibility,
} = require("./schemaCompatibilityService");

function indexRows({ legacyUniquePaymentReferenceIndex = false } = {}) {
  return EXPECTED_INDEXES.flatMap((signature) => {
    const [table, index, unique, columns] = signature.split("|");
    const useLegacyPaymentReferenceIndex =
      legacyUniquePaymentReferenceIndex &&
      table === "orders" &&
      columns === "payment_reference";
    return columns.split(",").map((column, offset) => ({
      TABLE_NAME: table,
      INDEX_NAME: useLegacyPaymentReferenceIndex
        ? "uq_orders_payment_reference"
        : index === "primary"
          ? "PRIMARY"
          : index,
      NON_UNIQUE: useLegacyPaymentReferenceIndex ? 0 : unique === "1" ? 0 : 1,
      SEQ_IN_INDEX: offset + 1,
      COLUMN_NAME: column,
    }));
  });
}

function foreignKeyRows() {
  return EXPECTED_FOREIGN_KEYS.flatMap((signature) => {
    const [table, constraint, children, parentTable, parents, update, remove] =
      signature.split("|");
    const childColumns = children.split(",");
    const parentColumns = parents.split(",");
    return childColumns.map((column, offset) => ({
      TABLE_NAME: table,
      CONSTRAINT_NAME: constraint,
      COLUMN_NAME: column,
      REFERENCED_TABLE_NAME: parentTable,
      REFERENCED_COLUMN_NAME: parentColumns[offset],
      ORDINAL_POSITION: offset + 1,
      UPDATE_RULE: update.toUpperCase(),
      DELETE_RULE: remove.toUpperCase(),
    }));
  });
}

function columnRows() {
  return Object.entries(CRITICAL_COLUMNS).flatMap(([table, columns]) =>
    Object.entries(columns).map(([column, [type, nullable]]) => ({
      TABLE_NAME: table,
      COLUMN_NAME: column,
      COLUMN_TYPE: type,
      IS_NULLABLE: nullable ? "YES" : "NO",
    })),
  );
}

function triggerRows() {
  return Object.entries(EXPECTED_TRIGGERS).map(([name, trigger]) => ({
    TRIGGER_NAME: name,
    EVENT_OBJECT_TABLE: trigger.table,
    ACTION_TIMING: trigger.timing.toUpperCase(),
    EVENT_MANIPULATION: trigger.event.toUpperCase(),
    ACTION_STATEMENT: trigger.action,
  }));
}

function createReadOnlyFakeDb({
  orderItemOrphans = 0,
  legacyUniquePaymentReferenceIndex = false,
} = {}) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      calls.push(normalized);
      assert.match(normalized, /^SELECT\b/i, `non-read-only query: ${normalized}`);

      if (/SELECT DATABASE\(\)/i.test(normalized)) {
        return [[{ database_name: "thecrunch_updated_local", server_version: "8.0.44" }]];
      }
      if (/FROM information_schema\.TABLES/i.test(normalized)) {
        return [EXPECTED_TABLES.map((table) => ({
          TABLE_NAME: table,
          TABLE_TYPE: "BASE TABLE",
        }))];
      }
      if (/FROM information_schema\.ROUTINES/i.test(normalized)) return [[]];
      if (/FROM information_schema\.EVENTS/i.test(normalized)) return [[]];
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) return [columnRows()];
      if (/FROM information_schema\.STATISTICS/i.test(normalized)) {
        return [indexRows({ legacyUniquePaymentReferenceIndex })];
      }
      if (/FROM information_schema\.KEY_COLUMN_USAGE/i.test(normalized)) {
        return [foreignKeyRows()];
      }
      if (/FROM information_schema\.TRIGGERS/i.test(normalized)) return [triggerRows()];
      if (/COUNT\(\*\) AS orphan_count/i.test(normalized)) {
        const knownOrphanQuery =
          /FROM `order_item` c/i.test(normalized) &&
          /c\.`product_id` IS NOT NULL/i.test(normalized) &&
          /LEFT JOIN `menu` p/i.test(normalized);
        return [[{ orphan_count: knownOrphanQuery ? orderItemOrphans : 0 }]];
      }
      throw new Error(`Unexpected test query: ${normalized}`);
    },
  };
}

(async () => {
  assert.equal(EXPECTED_TABLES.length, 49);
  assert.equal(EXPECTED_INDEXES.length, 108);
  assert.equal(EXPECTED_FOREIGN_KEYS.length, 33);
  assert.equal(Object.keys(EXPECTED_TRIGGERS).length, 2);

  const formattedTrigger = "BEGIN\n  INSERT INTO t VALUES (1);\nEND";
  assert.equal(
    normalizeTriggerSql(formattedTrigger),
    normalizeTriggerSql("begin insert into `t` values(1); end"),
  );

  const db = createReadOnlyFakeDb();
  const result = await verifySchemaCompatibility(db, "thecrunch_updated_local");
  assert.equal(result.tableCount, 49);
  assert.equal(result.indexCount, 108);
  assert.equal(result.foreignKeyCount, 33);
  assert.equal(result.triggerCount, 2);
  assert.equal(result.orphanCount, 0);
  assert.deepEqual(result.warnings, []);
  assert.ok(db.calls.every((sql) => /^SELECT\b/i.test(sql)));

  const legacyIndexResult = await verifySchemaCompatibility(
    createReadOnlyFakeDb({ legacyUniquePaymentReferenceIndex: true }),
    "thecrunch_updated_local",
  );
  assert.equal(legacyIndexResult.warnings.length, 1);
  assert.match(legacyIndexResult.warnings[0], /third-party reference reuse migration/i);

  await assert.rejects(
    verifySchemaCompatibility(
      createReadOnlyFakeDb({ orderItemOrphans: 1 }),
      "thecrunch_updated_local",
    ),
    (error) =>
      error.code === "DB_SCHEMA_INCOMPATIBLE" &&
      /orphans are not permitted/i.test(error.message),
  );

  console.log("Read-only schema compatibility tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
