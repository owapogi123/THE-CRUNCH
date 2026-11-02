"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_PERMISSION_ROLE_LOCKS,
  DEFAULT_RESTAURANT_SETTINGS,
  DEFAULT_ROLE_PERMISSIONS,
} = require("./settingsDefaults");
const { seedInitialSystemSettings } = require("./initialDataService");
const {
  sanitizeSettingsPayload,
} = require("../routes/settingsRoutes").permissionPolicy;

(async () => {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      return [{ affectedRows: 1 }];
    },
  };

  await seedInitialSystemSettings(connection);

  const permissionCount = Object.values(DEFAULT_ROLE_PERMISSIONS).reduce(
    (total, permissions) => total + Object.keys(permissions).length,
    0,
  );
  assert.equal(calls.length, permissionCount + 2);
  assert.match(calls[0].sql, /WHERE NOT EXISTS/i);
  assert.deepEqual(JSON.parse(calls[0].params[1]), DEFAULT_RESTAURANT_SETTINGS);
  assert.deepEqual(
    JSON.parse(calls[1].params[1]),
    DEFAULT_PERMISSION_ROLE_LOCKS,
  );
  assert.ok(
    calls.slice(2).every((call) =>
      /ON DUPLICATE KEY UPDATE id = id/i.test(call.sql),
    ),
  );
  assert.ok(
    calls.every((call) => !/UPDATE settings_json = VALUES/i.test(call.sql)),
    "fresh defaults must not overwrite existing settings",
  );
  assert.deepEqual(sanitizeSettingsPayload({}), DEFAULT_RESTAURANT_SETTINGS);
  assert.equal(
    sanitizeSettingsPayload({ lowStockAlertsEnabled: false })
      .lowStockAlertsEnabled,
    false,
    "the saved low-stock notification preference must not be discarded",
  );

  console.log("Initial system setting seed tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
