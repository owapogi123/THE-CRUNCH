"use strict";

const {
  DEFAULT_PERMISSION_ROLE_LOCKS,
  DEFAULT_RESTAURANT_SETTINGS,
  DEFAULT_ROLE_PERMISSIONS,
} = require("./settingsDefaults");

const MENU_CATEGORY_DEFAULTS = Object.freeze([
  Object.freeze({
    name: "Menu Food",
    systemKey: "menu_food",
    displayOrder: 1,
  }),
  Object.freeze({
    name: "Chicken Flavors",
    systemKey: "chicken_flavors",
    displayOrder: 2,
  }),
]);

const INVENTORY_CATEGORY_DEFAULTS = Object.freeze([
  Object.freeze({
    name: "Raw Materials",
    systemKey: "raw_materials",
  }),
]);

const UNIT_DEFAULTS = Object.freeze([
  Object.freeze({ name: "Kilogram", abbreviation: "kg", systemKey: "kilogram" }),
  Object.freeze({ name: "Gram", abbreviation: "g", systemKey: "gram" }),
  Object.freeze({ name: "Liter", abbreviation: "L", systemKey: "liter" }),
  Object.freeze({ name: "Milliliter", abbreviation: "ml", systemKey: "milliliter" }),
  Object.freeze({ name: "Piece", abbreviation: "pc", systemKey: "piece" }),
  Object.freeze({ name: "Pack", abbreviation: "pack", systemKey: "pack" }),
  Object.freeze({ name: "Bottle", abbreviation: "bottle", systemKey: "bottle" }),
  Object.freeze({ name: "Case", abbreviation: "case", systemKey: "case" }),
]);

const DISCOUNT_DEFAULTS = Object.freeze([
  Object.freeze({ name: "Regular customer", percentage: 0 }),
  Object.freeze({ name: "PWD", percentage: 20 }),
  Object.freeze({ name: "Senior Citizen", percentage: 20 }),
]);

const SYSTEM_SETTING_DEFAULTS = Object.freeze([
  Object.freeze({
    key: "restaurant_settings",
    value: DEFAULT_RESTAURANT_SETTINGS,
  }),
  Object.freeze({
    key: "role_permission_locks",
    value: DEFAULT_PERMISSION_ROLE_LOCKS,
  }),
]);

async function seedRedesignedSystemDefaults(connection) {
  for (const category of MENU_CATEGORY_DEFAULTS) {
    await connection.query(
      "INSERT INTO menu_categories " +
        "(name, system_key, display_order, is_system, is_active) " +
        "VALUES (?, ?, ?, 1, 1) " +
        "ON DUPLICATE KEY UPDATE " +
        "name = VALUES(name), system_key = VALUES(system_key), " +
        "display_order = VALUES(display_order), " +
        "is_system = 1, is_active = 1",
      [category.name, category.systemKey, category.displayOrder],
    );
  }

  for (const category of INVENTORY_CATEGORY_DEFAULTS) {
    await connection.query(
      "INSERT INTO inventory_categories " +
        "(name, system_key, is_system, is_active) " +
        "VALUES (?, ?, 1, 1) " +
        "ON DUPLICATE KEY UPDATE " +
        "name = VALUES(name), system_key = VALUES(system_key), " +
        "is_system = 1, is_active = 1",
      [category.name, category.systemKey],
    );
  }

  for (const unit of UNIT_DEFAULTS) {
    await connection.query(
      "INSERT INTO units " +
        "(name, abbreviation, system_key, is_system, is_active) " +
        "VALUES (?, ?, ?, 1, 1) " +
        "ON DUPLICATE KEY UPDATE " +
        "name = VALUES(name), abbreviation = VALUES(abbreviation), " +
        "system_key = VALUES(system_key), " +
        "is_system = 1, is_active = 1",
      [unit.name, unit.abbreviation, unit.systemKey],
    );
  }

  for (const discount of DISCOUNT_DEFAULTS) {
    await connection.query(
      "INSERT INTO discount_types (name, percentage, is_active) " +
        "VALUES (?, ?, 1) " +
        "ON DUPLICATE KEY UPDATE " +
        "percentage = VALUES(percentage), is_active = 1",
      [discount.name, discount.percentage],
    );
  }

  for (const setting of SYSTEM_SETTING_DEFAULTS) {
    await connection.query(
      "INSERT INTO system_settings " +
        "(setting_key, settings_json, schema_version) VALUES (?, ?, 1) " +
        "ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)",
      [setting.key, JSON.stringify(setting.value)],
    );
  }

  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const [permissionKey, enabled] of Object.entries(permissions)) {
      await connection.query(
        "INSERT INTO role_permissions (role, permission_key, enabled) " +
          "VALUES (?, ?, ?) " +
          "ON DUPLICATE KEY UPDATE role = VALUES(role)",
        [role, permissionKey, enabled ? 1 : 0],
      );
    }
  }
}

module.exports = {
  DISCOUNT_DEFAULTS,
  INVENTORY_CATEGORY_DEFAULTS,
  MENU_CATEGORY_DEFAULTS,
  SYSTEM_SETTING_DEFAULTS,
  UNIT_DEFAULTS,
  seedRedesignedSystemDefaults,
};
