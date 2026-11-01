"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const packageJson = require("../package.json");

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return /\.(?:js|cjs|mjs)$/.test(entry.name) ? [entryPath] : [];
  });
}

function pathExistsWithExactCase(candidate, projectRoot) {
  const relative = path.relative(projectRoot, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return relative === "";
  }

  let current = projectRoot;
  for (const segment of relative.split(path.sep)) {
    if (!fs.readdirSync(current).includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

function assertRelativeImportsMatchFilesystemCase() {
  const projectRoot = path.resolve(__dirname, "..");
  const sourceRoots = [path.join(projectRoot, "src"), path.join(projectRoot, "scripts")]
    .filter((directory) => fs.existsSync(directory));
  const mismatches = [];

  for (const file of sourceRoots.flatMap(listJavaScriptFiles)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const request = match[1];
      const resolved = path.resolve(path.dirname(file), request);
      const candidates = [
        resolved,
        `${resolved}.js`,
        `${resolved}.json`,
        path.join(resolved, "index.js"),
      ];
      if (!candidates.some((candidate) => pathExistsWithExactCase(candidate, projectRoot))) {
        mismatches.push(`${path.relative(projectRoot, file)} -> ${request}`);
      }
    }
  }

  assert.deepEqual(
    mismatches,
    [],
    `Relative imports must match filesystem casing for Linux:\n${mismatches.join("\n")}`,
  );
}

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
assert.match(appSource, /http:\/\/localhost:5173/);
assert.match(
  appSource,
  /require\("\.\/routes\/purchaseOrders"\)/,
  "the purchase-order route import must match the Git filename on Linux",
);
assert.doesNotMatch(appSource, /origin:\s*["']\*["']/);
assertRelativeImportsMatchFilesystemCase();

console.log("Backend deployment configuration tests passed.");
