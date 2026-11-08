"use strict";

const assert = require("node:assert/strict");
const {
  DISCOUNT_DEFAULTS,
  INVENTORY_CATEGORY_DEFAULTS,
  MENU_CATEGORY_DEFAULTS,
  SYSTEM_SETTING_DEFAULTS,
  UNIT_DEFAULTS,
  seedRedesignedSystemDefaults,
} = require("./redesignedSystemSeed");
const {
  DEFAULT_ROLE_PERMISSIONS,
} = require("./settingsDefaults");

function createSeedFake() {
  const state = {
    menuCategories: new Map(),
    inventoryCategories: new Map(),
    units: new Map(),
    discounts: new Map(),
    settings: new Map(),
    permissions: new Map(),
    statements: [],
  };

  return {
    state,
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      state.statements.push(normalized);
      if (normalized.startsWith("INSERT INTO menu_categories")) {
        state.menuCategories.set(params[1], params);
      } else if (normalized.startsWith("INSERT INTO inventory_categories")) {
        state.inventoryCategories.set(params[1], params);
      } else if (normalized.startsWith("INSERT INTO units")) {
        state.units.set(params[2], params);
      } else if (normalized.startsWith("INSERT INTO discount_types")) {
        state.discounts.set(params[0], params);
      } else if (normalized.startsWith("INSERT INTO system_settings")) {
        state.settings.set(params[0], params);
      } else if (normalized.startsWith("INSERT INTO role_permissions")) {
        state.permissions.set(params[0] + "|" + params[1], params);
      } else {
        throw new Error("Unexpected SQL: " + normalized);
      }
      return [{ affectedRows: 1 }];
    },
  };
}

(async () => {
  const connection = createSeedFake();
  await seedRedesignedSystemDefaults(connection);
  await seedRedesignedSystemDefaults(connection);

  assert.equal(
    connection.state.menuCategories.size,
    MENU_CATEGORY_DEFAULTS.length,
  );
  assert.equal(
    connection.state.inventoryCategories.size,
    INVENTORY_CATEGORY_DEFAULTS.length,
  );
  assert.equal(connection.state.units.size, UNIT_DEFAULTS.length);
  assert.equal(connection.state.discounts.size, DISCOUNT_DEFAULTS.length);
  assert.equal(connection.state.settings.size, SYSTEM_SETTING_DEFAULTS.length);

  const permissionCount = Object.values(DEFAULT_ROLE_PERMISSIONS).reduce(
    (total, permissions) => total + Object.keys(permissions).length,
    0,
  );
  assert.equal(connection.state.permissions.size, permissionCount);
  assert.ok(connection.state.menuCategories.has("menu_food"));
  assert.ok(connection.state.menuCategories.has("chicken_flavors"));
  assert.ok(connection.state.inventoryCategories.has("raw_materials"));

  const allSql = connection.state.statements.join("\n").toLowerCase();
  assert.doesNotMatch(allSql, /insert into products/);
  assert.doesNotMatch(allSql, /insert into suppliers/);
  assert.doesNotMatch(allSql, /insert into orders/);
  assert.doesNotMatch(allSql, /insert into inventory_balances/);

  console.log("Redesigned system seed tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
