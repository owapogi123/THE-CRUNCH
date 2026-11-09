"use strict";

const assert = require("node:assert/strict");
const {
  REDESIGNED_CRITICAL_COLUMNS,
  REDESIGNED_EXPECTED_TABLES,
  REDESIGNED_PRIMARY_KEYS,
  REDESIGNED_REQUIRED_FOREIGN_KEYS,
  REDESIGNED_REQUIRED_UNIQUE_INDEXES,
  verifyRedesignedSchemaCompatibility,
} = require("./redesignedSchemaCompatibilityService");
const {
  verifySchemaCompatibility,
} = require("./schemaCompatibilityService");

function columnRows() {
  return Object.entries(REDESIGNED_CRITICAL_COLUMNS).flatMap(
    ([table, columns]) =>
      Object.entries(columns).map(([column, [type, nullable]]) => ({
        TABLE_NAME: table,
        COLUMN_NAME: column,
        COLUMN_TYPE: type,
        IS_NULLABLE: nullable ? "YES" : "NO",
      })),
  );
}

function indexRows() {
  const rows = [];
  for (const [table, columns] of Object.entries(REDESIGNED_PRIMARY_KEYS)) {
    columns.split(",").forEach((column, index) => {
      rows.push({
        TABLE_NAME: table,
        INDEX_NAME: "PRIMARY",
        NON_UNIQUE: 0,
        SEQ_IN_INDEX: index + 1,
        COLUMN_NAME: column,
      });
    });
  }
  REDESIGNED_REQUIRED_UNIQUE_INDEXES.forEach((signature, signatureIndex) => {
    const [table, columns] = signature.split("|");
    columns.split(",").forEach((column, index) => {
      rows.push({
        TABLE_NAME: table,
        INDEX_NAME: "uq_test_" + signatureIndex,
        NON_UNIQUE: 0,
        SEQ_IN_INDEX: index + 1,
        COLUMN_NAME: column,
      });
    });
  });
  return rows;
}

function foreignKeyRows() {
  return REDESIGNED_REQUIRED_FOREIGN_KEYS.map((signature) => {
    const [table, column, parentTable, parentColumn, remove] =
      signature.split("|");
    return {
      TABLE_NAME: table,
      COLUMN_NAME: column,
      REFERENCED_TABLE_NAME: parentTable,
      REFERENCED_COLUMN_NAME: parentColumn,
      DELETE_RULE: remove.toUpperCase(),
    };
  });
}

function createFake({ missingTable = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      calls.push(normalized);
      assert.match(normalized, /^SELECT\b/i, "compatibility check must be read-only");
      if (/SELECT DATABASE\(\)/i.test(normalized)) {
        return [[{
          database_name: "redesigned_test",
          server_version: "8.0.44",
        }]];
      }
      if (/FROM information_schema\.TABLES/i.test(normalized)) {
        return [REDESIGNED_EXPECTED_TABLES
          .filter((table) => table !== missingTable)
          .map((table) => ({
            TABLE_NAME: table,
            TABLE_TYPE: "BASE TABLE",
          }))];
      }
      if (/FROM information_schema\.ROUTINES/i.test(normalized)) return [[]];
      if (/FROM information_schema\.EVENTS/i.test(normalized)) return [[]];
      if (/FROM information_schema\.TRIGGERS/i.test(normalized)) return [[]];
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        return [columnRows()];
      }
      if (/FROM information_schema\.STATISTICS/i.test(normalized)) {
        return [indexRows()];
      }
      if (/FROM information_schema\.KEY_COLUMN_USAGE/i.test(normalized)) {
        return [foreignKeyRows()];
      }
      if (/AS protected_menu_categories/i.test(normalized)) {
        return [[{
          protected_menu_categories: 2,
          protected_inventory_categories: 1,
          system_units: 8,
          required_settings: 2,
          required_permissions: 24,
          required_discounts: 3,
          administrators: 1,
        }]];
      }
      throw new Error("Unexpected SQL: " + normalized);
    },
  };
}

(async () => {
  const database = createFake();
  const result = await verifyRedesignedSchemaCompatibility(
    database,
    "redesigned_test",
  );
  assert.equal(result.tableCount, REDESIGNED_EXPECTED_TABLES.length);
  assert.equal(
    result.foreignKeyCount,
    REDESIGNED_REQUIRED_FOREIGN_KEYS.length,
  );
  assert.ok(database.calls.every((sql) => /^SELECT\b/i.test(sql)));

  const dispatched = await verifySchemaCompatibility(
    createFake(),
    "redesigned_test",
    { profile: "redesigned" },
  );
  assert.equal(dispatched.tableCount, REDESIGNED_EXPECTED_TABLES.length);

  await assert.rejects(
    verifyRedesignedSchemaCompatibility(
      createFake({ missingTable: "products" }),
      "redesigned_test",
    ),
    (error) =>
      error.code === "DB_SCHEMA_INCOMPATIBLE" &&
      Array.isArray(error.details?.missing) &&
      error.details.missing.includes("products"),
  );

  console.log("Redesigned schema compatibility tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
