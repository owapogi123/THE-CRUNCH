"use strict";

const assert = require("node:assert/strict");
const baseline = require("./migrations/2026-11-08_redesigned-baseline");
const {
  MIGRATIONS,
  REDESIGNED_MIGRATIONS,
  applyMigrations,
  getMigrationsForProfile,
  prepareRedesignedDatabase,
} = require("./migrate");
const {
  LEGACY_SCHEMA_PROFILE,
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("./schemaProfile");

function createMigrationFake() {
  const versions = new Map();
  const tables = new Set();
  const statements = [];
  return {
    versions,
    tables,
    statements,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      statements.push(normalized);
      const create = normalized.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
      if (create) {
        tables.add(create[1].toLowerCase());
        return [{ affectedRows: 0 }];
      }
      if (
        normalized.includes("information_schema.COLUMNS") &&
        normalized.includes("schema_migrations")
      ) {
        return [[{ COLUMN_NAME: "checksum" }]];
      }
      if (normalized === "SELECT version, checksum FROM schema_migrations") {
        return [[...versions].map(([version, checksum]) => ({
          version,
          checksum,
        }))];
      }
      if (
        normalized ===
        "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)"
      ) {
        versions.set(String(params[0]), String(params[1]));
        return [{ affectedRows: 1 }];
      }
      throw new Error("Unexpected SQL: " + normalized);
    },
  };
}

(async () => {
  assert.equal(getSchemaProfile({}), LEGACY_SCHEMA_PROFILE);
  assert.equal(
    getSchemaProfile({ DB_SCHEMA_PROFILE: "REDESIGNED" }),
    REDESIGNED_SCHEMA_PROFILE,
  );
  assert.throws(
    () => getSchemaProfile({ DB_SCHEMA_PROFILE: "unknown" }),
    (error) => error.code === "DB_CONFIG_ERROR",
  );
  assert.equal(getMigrationsForProfile(LEGACY_SCHEMA_PROFILE), MIGRATIONS);
  assert.equal(
    getMigrationsForProfile(REDESIGNED_SCHEMA_PROFILE),
    REDESIGNED_MIGRATIONS,
  );
  assert.equal(REDESIGNED_MIGRATIONS.length, 1);
  assert.equal(baseline.CHECKSUM.length, 64);
  assert.ok(baseline.STATEMENTS.length >= 30);
  assert.ok(
    baseline.STATEMENTS.every(
      (sql) => !/^\s*(?:DROP|TRUNCATE|DELETE)\b/i.test(sql),
    ),
  );

  const legacyBoundaryCalls = [];
  await assert.rejects(
    prepareRedesignedDatabase({
      async query(sql) {
        const normalized = String(sql).replace(/\s+/g, " ").trim();
        legacyBoundaryCalls.push(normalized);
        if (/FROM information_schema\.TABLES/i.test(normalized)) {
          return [[
            { TABLE_NAME: "users" },
            { TABLE_NAME: "Menu" },
            { TABLE_NAME: "Inventory" },
          ]];
        }
        throw new Error("Redesigned preflight mutated a legacy database.");
      },
    }),
    (error) => error.code === "DB_SCHEMA_PROFILE_MISMATCH",
  );
  assert.ok(legacyBoundaryCalls.every((sql) => /^SELECT\b/i.test(sql)));

  const connection = createMigrationFake();
  await applyMigrations(connection, {
    profile: REDESIGNED_SCHEMA_PROFILE,
    log: { log() {} },
  });
  assert.equal(connection.versions.size, 1);
  assert.equal(
    connection.versions.get(baseline.VERSION),
    baseline.CHECKSUM,
  );
  assert.ok(connection.tables.has("products"));
  assert.ok(connection.tables.has("inventory_balances"));
  assert.ok(connection.tables.has("stock_movements"));
  assert.equal(connection.tables.has("menu"), false);
  assert.equal(connection.tables.has("inventory"), false);

  const firstStatementCount = connection.statements.length;
  await applyMigrations(connection, {
    profile: REDESIGNED_SCHEMA_PROFILE,
    log: { log() {} },
  });
  const rerunStatements = connection.statements.slice(firstStatementCount);
  assert.equal(
    rerunStatements.some((sql) => /^CREATE TABLE IF NOT EXISTS products/i.test(sql)),
    false,
  );
  assert.equal(connection.versions.size, 1);

  connection.versions.set(baseline.VERSION, "0".repeat(64));
  await assert.rejects(
    applyMigrations(connection, {
      profile: REDESIGNED_SCHEMA_PROFILE,
      log: { log() {} },
    }),
    (error) => error.code === "DB_MIGRATION_CHECKSUM_MISMATCH",
  );

  console.log("Redesigned migration runner tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
