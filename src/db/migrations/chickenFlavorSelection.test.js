"use strict";

const assert = require("node:assert/strict");
const migration = require("./2026-11-07_chicken-flavor-selection");

const columns = new Map([
  ["menu_categories", new Set(["category_id", "name"])],
  ["order_item", new Set(["order_item_id", "subtotal"])],
  ["receipt_snapshot_items", new Set(["receipt_item_id", "original_product_id", "product_name"])],
]);
const indexes = new Map();
const statements = [];

const connection = {
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    statements.push(normalized);
    if (normalized.includes("information_schema.COLUMNS")) {
      return [[...(columns.get(String(params[0]).toLowerCase()) || [])]
        .map((column_name) => ({ column_name }))];
    }
    if (normalized.includes("information_schema.STATISTICS")) {
      return [indexes.get(`${String(params[0]).toLowerCase()}:${String(params[1]).toLowerCase()}`)
        ? [{ found: 1 }]
        : []];
    }
    const addColumn = normalized.match(/^ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/i);
    if (addColumn) {
      columns.get(addColumn[1].toLowerCase()).add(addColumn[2].toLowerCase());
      return [{ affectedRows: 0 }];
    }
    const addIndex = normalized.match(/^ALTER TABLE `([^`]+)` ADD (?:UNIQUE )?INDEX `([^`]+)`/i);
    if (addIndex) {
      indexes.set(`${addIndex[1].toLowerCase()}:${addIndex[2].toLowerCase()}`, true);
      return [{ affectedRows: 0 }];
    }
    return [{ affectedRows: 1 }];
  },
};

(async () => {
  await migration.up(connection, { log: { log() {} } });
  await migration.up(connection, { log: { log() {} } });
  assert.ok(columns.get("menu_categories").has("system_key"));
  assert.ok(columns.get("order_item").has("selected_flavor_product_id"));
  assert.ok(columns.get("order_item").has("selected_flavor_name"));
  assert.ok(columns.get("receipt_snapshot_items").has("selected_flavor_name"));
  assert.ok(indexes.get("menu_categories:uq_menu_categories_system_key"));
  assert.ok(indexes.get("order_item:idx_order_item_selected_flavor"));
  assert.ok(statements.some((sql) => sql.includes("'Chicken Flavors', 'chicken_flavors'")));
  console.log("Chicken flavor schema migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
