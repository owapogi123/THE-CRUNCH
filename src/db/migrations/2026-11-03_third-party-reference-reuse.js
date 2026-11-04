"use strict";

const VERSION = "2026-11-03_third-party-reference-reuse";
const DROP_GLOBAL_UNIQUE_INDEX_SQL =
  "ALTER TABLE `orders` DROP INDEX `uq_orders_payment_reference`";
const CREATE_LOOKUP_INDEX_SQL =
  "CREATE INDEX `idx_orders_payment_reference` ON `orders` (`payment_reference`)";

async function up(connection, { log = console } = {}) {
  const [tables] = await connection.query(
    `SELECT 1
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = 'orders'
      LIMIT 1`,
  );
  if (tables.length === 0) {
    const error = new Error("orders table is missing and requires manual review.");
    error.code = "DB_MIGRATION_REVIEW_REQUIRED";
    throw error;
  }

  const [indexes] = await connection.query("SHOW INDEX FROM `orders`");
  const hasGlobalUniqueIndex = indexes.some(
    (index) =>
      String(index.Key_name || "").toLowerCase() ===
      "uq_orders_payment_reference",
  );
  const hasLookupIndex = indexes.some(
    (index) =>
      String(index.Key_name || "").toLowerCase() ===
      "idx_orders_payment_reference",
  );

  if (!hasLookupIndex) {
    await connection.query(CREATE_LOOKUP_INDEX_SQL);
    log.log("Migration: added the payment-reference lookup index.");
  }
  if (hasGlobalUniqueIndex) {
    await connection.query(DROP_GLOBAL_UNIQUE_INDEX_SQL);
    log.log(
      "Migration: removed global uniqueness from third-party platform references.",
    );
  }
}

module.exports = {
  CREATE_LOOKUP_INDEX_SQL,
  DROP_GLOBAL_UNIQUE_INDEX_SQL,
  VERSION,
  up,
};
