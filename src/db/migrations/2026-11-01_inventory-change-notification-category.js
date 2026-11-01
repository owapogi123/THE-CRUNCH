"use strict";

const VERSION = "2026-11-01_inventory-change-notification-category";
const REQUIRED_EXISTING_CATEGORIES = ["refund_request", "purchase_order"];
const INVENTORY_CHANGE_CATEGORY = "inventory_change";
const MIGRATION_SQL =
  "ALTER TABLE `staff_notifications` MODIFY COLUMN `category` " +
  "ENUM('refund_request','purchase_order','inventory_change') NOT NULL";

function migrationReviewError(message, details = {}) {
  const error = new Error(message);
  error.code = "DB_MIGRATION_REVIEW_REQUIRED";
  error.details = details;
  return error;
}

function parseEnumValues(columnType) {
  const source = String(columnType || "").trim();
  if (!/^enum\(/i.test(source) || !/\)$/i.test(source)) return null;
  const values = [];
  const valuePattern = /'((?:''|[^'])*)'/g;
  let match;
  while ((match = valuePattern.exec(source)) !== null) {
    values.push(match[1].replace(/''/g, "'"));
  }
  return values.length > 0 ? values : null;
}

function quoteEnumValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function up(connection, { log = console } = {}) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = 'staff_notifications'
        AND LOWER(COLUMN_NAME) = 'category'
      LIMIT 1`,
  );
  const column = rows[0];
  if (!column) {
    throw migrationReviewError(
      "staff_notifications.category is missing; create the canonical notification tables before applying this migration.",
      { table: "staff_notifications", column: "category" },
    );
  }

  const currentCategories = parseEnumValues(column.COLUMN_TYPE);
  if (!currentCategories) {
    throw migrationReviewError(
      "staff_notifications.category is not an ENUM and requires manual review.",
      { table: "staff_notifications", column: "category", columnType: column.COLUMN_TYPE },
    );
  }
  for (const requiredCategory of REQUIRED_EXISTING_CATEGORIES) {
    if (!currentCategories.includes(requiredCategory)) {
      throw migrationReviewError(
        `staff_notifications.category is missing required value ${requiredCategory}.`,
        { table: "staff_notifications", column: "category", currentCategories },
      );
    }
  }
  if (currentCategories.includes(INVENTORY_CHANGE_CATEGORY)) return;

  const nextCategories = [...currentCategories, INVENTORY_CHANGE_CATEGORY];
  await connection.query(
    `ALTER TABLE \`staff_notifications\`
       MODIFY COLUMN \`category\` ENUM(${nextCategories.map(quoteEnumValue).join(",")}) NOT NULL`,
  );
  log.log("Migration: added inventory_change to staff_notifications.category.");
}

module.exports = {
  INVENTORY_CHANGE_CATEGORY,
  MIGRATION_SQL,
  VERSION,
  migrationReviewError,
  parseEnumValues,
  up,
};
