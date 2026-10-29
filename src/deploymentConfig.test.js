"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const packageJson = require("../package.json");

assert.equal(packageJson.scripts.start, "node src/server.js");
assert.equal(packageJson.scripts["db:setup"], "node src/db/setup.js");
assert.equal(packageJson.scripts["db:migrate"], "node src/db/migrate.js");
assert.match(serverSource, /process\.env\.PORT/);
assert.match(serverSource, /process\.env\.HOST \|\| "0\.0\.0\.0"/);
assert.match(serverSource, /app\.listen\(PORT, HOST/);
assert.match(serverSource, /verifySchemaCompatibility/);
assert.doesNotMatch(serverSource, /db\/setup|applyMigrations/);

assert.match(appSource, /app\.get\("\/health\/live"/);
assert.match(appSource, /app\.get\("\/health", readinessHandler\)/);
assert.match(appSource, /app\.get\("\/health\/ready", readinessHandler\)/);
assert.match(appSource, /await db\.query\("SELECT 1 AS ready"\)/);
assert.match(appSource, /res\.status\(503\)/);
assert.match(appSource, /https:\/\/thecrunch\.site/);
assert.match(appSource, /https:\/\/www\.thecrunch\.site/);
assert.match(appSource, /https:\/\/the-crunch\.pages\.dev/);
assert.doesNotMatch(appSource, /origin:\s*["']\*["']/);

console.log("Backend deployment configuration tests passed.");
