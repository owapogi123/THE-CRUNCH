"use strict";

const {
  DEFAULT_PERMISSION_ROLE_LOCKS,
  DEFAULT_RESTAURANT_SETTINGS,
  DEFAULT_ROLE_PERMISSIONS,
} = require("./settingsDefaults");

async function insertSettingIfMissing(connection, settingKey, value) {
  await connection.query(
    `INSERT INTO system_settings (setting_key, settings_json)
     SELECT ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM system_settings WHERE setting_key = ?
      )`,
    [settingKey, JSON.stringify(value), settingKey],
  );
}

async function seedInitialSystemSettings(connection) {
  await insertSettingIfMissing(
    connection,
    "restaurant_settings",
    DEFAULT_RESTAURANT_SETTINGS,
  );
  await insertSettingIfMissing(
    connection,
    "role_permission_locks",
    DEFAULT_PERMISSION_ROLE_LOCKS,
  );

  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const [permissionKey, enabled] of Object.entries(permissions)) {
      await connection.query(
        `INSERT INTO role_permissions (role, permission_key, enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [role, permissionKey, enabled ? 1 : 0],
      );
    }
  }
}

module.exports = {
  insertSettingIfMissing,
  seedInitialSystemSettings,
};
