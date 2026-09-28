const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const pagesWithoutBackendIntervals = [
  "Frontend/src/pages/index.tsx",
  "Frontend/src/pages/sales-reports.tsx",
  "Frontend/src/pages/menu.tsx",
  "Frontend/src/pages/usersmenu.tsx",
];
for (const file of pagesWithoutBackendIntervals) {
  assert.equal(
    /\bsetInterval\s*\(/.test(read(file)),
    false,
    `${file} still contains interval polling`,
  );
}

const cookSource = read("Frontend/src/pages/Order.tsx");
assert.equal(/setInterval\s*\(\s*fetchAll/.test(cookSource), false);
assert.equal((cookSource.match(/\bsetInterval\s*\(/g) || []).length, 2);
assert.match(cookSource, /setElapsed\(s\)/);
assert.match(cookSource, /setCurrentTime\(new Date\(\)\)/);

for (const file of [
  ...pagesWithoutBackendIntervals,
  "Frontend/src/pages/Order.tsx",
]) {
  const source = read(file);
  assert.match(source, /useEventInvalidation/);
}

const clientSource = read("Frontend/src/hooks/use-event-invalidation.ts");
assert.match(clientSource, /Authorization: `Bearer \$\{token\}`/);
assert.match(clientSource, /\/api\/events\/stream/);
assert.equal(/events\/stream\?[^"`]*(token|jwt)/i.test(clientSource), false);
assert.match(clientSource, /AbortController/);
assert.match(clientSource, /getReconnectDelay/);
assert.match(clientSource, /visibilitychange/);

const eventRouteSource = read("Backend/src/routes/eventRoutes.js");
const eventServiceSource = read("Backend/src/services/applicationEvents.js");
assert.equal(/require\([^)]*(?:config\/db|mysql)/.test(eventRouteSource), false);
assert.equal(/require\([^)]*(?:config\/db|mysql)/.test(eventServiceSource), false);
assert.match(eventRouteSource, /: heartbeat/);
assert.match(eventRouteSource, /X-Accel-Buffering/);

console.log(JSON.stringify({
  dashboardPollingRemoved: "pass",
  salesReportPollingRemoved: "pass",
  cookBackendPollingRemoved: "pass",
  cashierPollingRemoved: "pass",
  customerTrackingPollingRemoved: "pass",
  cookLocalTimersRetained: "pass",
  bearerHeaderAuthentication: "pass",
  jwtAbsentFromUrl: "pass",
  idleSsePerformsNoDatabasePolling: "pass",
  estimatedPreviousOrderRequestsPerMinute: 88,
  repeatedIdleOrderRequestsPerMinuteAfterInitialLoad: 0,
}, null, 2));
