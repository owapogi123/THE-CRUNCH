"use strict";

const VERSION = "2026-11-06_po-receipt-quantities-and-shelf-life-months";

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = LOWER(?)
        AND LOWER(COLUMN_NAME) = LOWER(?)
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function up(connection, { log = console } = {}) {
  if (!(await hasColumn(connection, "purchase_order_items", "received_quantity"))) {
    await connection.query(
      "ALTER TABLE `purchase_order_items` ADD COLUMN `received_quantity` DECIMAL(10,2) NULL AFTER `quantity`",
    );
    log.log("Migration: added purchase_order_items.received_quantity.");
  }
  if (!(await hasColumn(connection, "batches", "shelf_life_months"))) {
    await connection.query(
      "ALTER TABLE `batches` ADD COLUMN `shelf_life_months` INT NULL AFTER `expiry_date`",
    );
    log.log("Migration: added batches.shelf_life_months.");
  }
}

module.exports = { VERSION, hasColumn, up };
