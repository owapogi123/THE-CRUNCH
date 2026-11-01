"use strict";

const VERSION = "2026-11-01_purchase-order-delivery-date-nullable";
const MIGRATION_SQL =
  "ALTER TABLE `purchase_orders` MODIFY COLUMN `delivery_date` DATE NULL DEFAULT NULL";

function migrationReviewError(message, details = {}) {
  const error = new Error(message);
  error.code = "DB_MIGRATION_REVIEW_REQUIRED";
  error.details = details;
  return error;
}

async function up(connection, { log = console } = {}) {
  const [rows] = await connection.query(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = 'purchase_orders'
        AND LOWER(COLUMN_NAME) = 'delivery_date'
      LIMIT 1`,
  );
  const column = rows[0];
  if (!column) {
    throw migrationReviewError(
      "purchase_orders.delivery_date is missing and requires manual review.",
      { table: "purchase_orders", column: "delivery_date" },
    );
  }
  if (String(column.DATA_TYPE || "").toLowerCase() !== "date") {
    throw migrationReviewError(
      "purchase_orders.delivery_date is not a DATE column and requires manual review.",
      { columnType: column.COLUMN_TYPE },
    );
  }
  if (String(column.IS_NULLABLE || "").toUpperCase() === "YES") return;

  await connection.query(MIGRATION_SQL);
  log.log("Migration: purchase_orders.delivery_date now permits NULL.");
}

module.exports = {
  MIGRATION_SQL,
  VERSION,
  migrationReviewError,
  up,
};
