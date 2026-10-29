"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  EXPECTED_TABLES,
  EXPECTED_TRIGGERS,
} = require("../services/schemaCompatibilityService");

const setupSource = fs.readFileSync(path.join(__dirname, "setup.js"), "utf8");
const migrationSource = fs.readFileSync(path.join(__dirname, "migrate.js"), "utf8");
const schemaSources = `${setupSource}\n${migrationSource}`;

for (const table of EXPECTED_TABLES) {
  assert.match(
    schemaSources,
    new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+[\\x60]?${table}[\\x60]?`, "i"),
    `fresh setup must define ${table}`,
  );
}
for (const trigger of Object.keys(EXPECTED_TRIGGERS)) {
  assert.match(setupSource, new RegExp(`CREATE\\s+TRIGGER\\s+${trigger}`, "i"));
}

assert.match(setupSource, /if \(shouldReset\) \{\s*await connection\.query\(dropStatements\)/);
assert.match(setupSource, /seedInitialSystemSettings\(connection\)/);
assert.match(setupSource, /ensureInitialAdministrator\(connection/);
assert.match(setupSource, /applyMigrations\(connection/);
assert.doesNotMatch(
  setupSource,
  /knownOrderItemOrphans|approvedLegacyOrderItemCounts|\b17 inherited\b/i,
);

console.log("Fresh database setup contract tests passed.");
