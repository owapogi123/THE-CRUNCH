"use strict";

const VERSION = "2026-11-07_chicken-flavor-selection";

async function getColumns(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT LOWER(COLUMN_NAME) AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = LOWER(?)`,
    [tableName],
  );
  return new Set(rows.map((row) => String(row.column_name).toLowerCase()));
}

async function addColumnIfMissing(connection, tableName, columnName, definition, log) {
  const columns = await getColumns(connection, tableName);
  if (columns.has(columnName.toLowerCase())) return;
  await connection.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
  log.log(`Migration: added ${tableName}.${columnName}.`);
}

async function addIndexIfMissing(connection, tableName, indexName, definition, log) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = LOWER(?)
        AND LOWER(INDEX_NAME) = LOWER(?)
      LIMIT 1`,
    [tableName, indexName],
  );
  if (rows.length) return;
  await connection.query(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  log.log(`Migration: added ${tableName}.${indexName}.`);
}

async function up(connection, { log = console } = {}) {
  await addColumnIfMissing(
    connection,
    "menu_categories",
    "system_key",
    "VARCHAR(64) NULL AFTER `name`",
    log,
  );
  await addIndexIfMissing(
    connection,
    "menu_categories",
    "uq_menu_categories_system_key",
    "UNIQUE INDEX `uq_menu_categories_system_key` (`system_key`)",
    log,
  );

  await connection.query(
    `UPDATE menu_categories
        SET system_key = 'menu_food'
      WHERE system_key IS NULL
        AND LOWER(TRIM(name)) = 'menu food'`,
  );
  await connection.query(
    `INSERT INTO menu_categories (name, system_key, display_order, is_active)
     SELECT 'Menu Food', 'menu_food', 1, TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM menu_categories WHERE system_key = 'menu_food'
      )`,
  );

  await connection.query(
    `UPDATE menu_categories
        SET system_key = 'chicken_flavors'
      WHERE system_key IS NULL
        AND LOWER(TRIM(name)) = 'chicken flavors'`,
  );
  await connection.query(
    `INSERT INTO menu_categories (name, system_key, display_order, is_active)
     SELECT 'Chicken Flavors', 'chicken_flavors',
            COALESCE((SELECT MAX(existing.display_order) + 1 FROM menu_categories existing), 1),
            TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM menu_categories WHERE system_key = 'chicken_flavors'
      )`,
  );
  await connection.query(
    `UPDATE menu_categories
        SET name = 'Chicken Flavors', is_active = TRUE
      WHERE system_key = 'chicken_flavors'`,
  );

  await addColumnIfMissing(
    connection,
    "order_item",
    "selected_flavor_product_id",
    "INT NULL AFTER `Subtotal`",
    log,
  );
  await addColumnIfMissing(
    connection,
    "order_item",
    "selected_flavor_name",
    "VARCHAR(255) NULL AFTER `selected_flavor_product_id`",
    log,
  );
  await addIndexIfMissing(
    connection,
    "order_item",
    "idx_order_item_selected_flavor",
    "INDEX `idx_order_item_selected_flavor` (`selected_flavor_product_id`)",
    log,
  );

  await addColumnIfMissing(
    connection,
    "receipt_snapshot_items",
    "selected_flavor_product_id",
    "INT NULL AFTER `original_product_id`",
    log,
  );
  await addColumnIfMissing(
    connection,
    "receipt_snapshot_items",
    "selected_flavor_name",
    "VARCHAR(255) NULL AFTER `product_name`",
    log,
  );
}

module.exports = { VERSION, up };
