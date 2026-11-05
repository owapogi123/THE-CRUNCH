"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EXPECTED_INDEXES } = require("../../services/schemaCompatibilityService");
const { up } = require("./2026-10-30_deployment-schema-alignment");
const { applyMigrations } = require("../migrate");

function expectedIndexRows() {
  return EXPECTED_INDEXES.flatMap((signature) => {
    const [table, index, unique, columns] = signature.split("|");
    return columns.split(",").map((column, offset) => ({
      TABLE_NAME: table,
      INDEX_NAME: index === "primary" ? "PRIMARY" : index,
      NON_UNIQUE: unique === "1" ? 0 : 1,
      SEQ_IN_INDEX: offset + 1,
      COLUMN_NAME: column,
    }));
  });
}

function canonicalForeignKey(parentTable, parentColumn, constraintName) {
  return {
    CONSTRAINT_NAME: constraintName,
    REFERENCED_TABLE_NAME: parentTable,
    REFERENCED_COLUMN_NAME: parentColumn,
    UPDATE_RULE: "RESTRICT",
    DELETE_RULE: "RESTRICT",
  };
}

function createExistingSchemaDb({ nullBatchCount = 0 } = {}) {
  const calls = [];
  const appliedMigrations = new Set();
  let batchForeignKey = canonicalForeignKey(
    "Menu",
    "Product_ID",
    "batches_ibfk_1",
  );
  let notificationCategoryType = "enum('refund_request','purchase_order')";
  let purchaseOrderDeliveryNullable = "NO";
  let hasUniquePaymentReferenceIndex = true;
  let hasPaymentReferenceLookupIndex = false;
  let hasOrderInventoryDeductions = false;
  let passwordResetCodeLength = 10;

  return {
    calls,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });

      if (/^CREATE TABLE IF NOT EXISTS schema_migrations/i.test(normalized)) {
        return [{ affectedRows: 0 }];
      }
      if (/^SELECT version FROM schema_migrations/i.test(normalized)) {
        return [[...appliedMigrations].map((version) => ({ version }))];
      }
      if (/^INSERT INTO schema_migrations/i.test(normalized)) {
        appliedMigrations.add(String(params[0]));
        return [{ affectedRows: 1 }];
      }
      if (
        /FROM information_schema\.TABLES/i.test(normalized) &&
        /LOWER\(TABLE_NAME\) = 'orders'/i.test(normalized)
      ) {
        return [[{ 1: 1 }]];
      }
      if (
        /FROM information_schema\.TABLES/i.test(normalized) &&
        String(params[0] || "").toLowerCase() === "order_inventory_deductions"
      ) {
        return [hasOrderInventoryDeductions ? [{ 1: 1 }] : []];
      }
      if (
        /FROM information_schema\.TABLES/i.test(normalized) &&
        String(params[0] || "").toLowerCase() === "orders"
      ) {
        return [[{ 1: 1 }]];
      }
      if (/^SHOW INDEX FROM `orders`/i.test(normalized)) {
        return [[
          ...(hasUniquePaymentReferenceIndex
            ? [{ Key_name: "uq_orders_payment_reference", Non_unique: 0 }]
            : []),
          ...(hasPaymentReferenceLookupIndex
            ? [{ Key_name: "idx_orders_payment_reference", Non_unique: 1 }]
            : []),
        ]];
      }

      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        if (String(params[0]).toLowerCase() === "inventory") return [[]];
        if (String(params[0]).toLowerCase() === "batches") {
          return [[{
            COLUMN_TYPE: "int",
            IS_NULLABLE: "YES",
            COLUMN_DEFAULT: null,
          }]];
        }
        if (/LOWER\(TABLE_NAME\) = 'staff_notifications'/i.test(normalized)) {
          return [[{
            COLUMN_TYPE: notificationCategoryType,
            IS_NULLABLE: "NO",
          }]];
        }
        if (/LOWER\(TABLE_NAME\) = 'purchase_orders'/i.test(normalized)) {
          return [[{
            DATA_TYPE: "date",
            COLUMN_TYPE: "date",
            IS_NULLABLE: purchaseOrderDeliveryNullable,
          }]];
        }
        if (
          /LOWER\(TABLE_NAME\) = 'users'/i.test(normalized) &&
          /LOWER\(COLUMN_NAME\) = 'password_reset_code'/i.test(normalized)
        ) {
          return [[{
            DATA_TYPE: "varchar",
            CHARACTER_MAXIMUM_LENGTH: passwordResetCodeLength,
            IS_NULLABLE: "YES",
          }]];
        }
      }
      if (/SELECT COUNT\(\*\) AS invalid_count FROM batches WHERE product_id IS NULL/i.test(normalized)) {
        return [[{ invalid_count: nullBatchCount }]];
      }
      if (/SELECT COUNT\(\*\) AS invalid_count/i.test(normalized)) {
        return [[{ invalid_count: 0 }]];
      }
      if (/FROM information_schema\.STATISTICS/i.test(normalized)) {
        return [expectedIndexRows()];
      }
      if (/FROM information_schema\.KEY_COLUMN_USAGE/i.test(normalized)) {
        const table = String(params[0]).toLowerCase();
        const column = String(params[1]).toLowerCase();
        if (table === "batches" && column === "product_id") {
          return [batchForeignKey ? [batchForeignKey] : []];
        }
        if (table === "kitchen_batches" && column === "storage_batch_id") {
          return [[canonicalForeignKey(
            "batches",
            "batch_id",
            "fk_kitchen_batches_storage_batch",
          )]];
        }
        if (table === "kitchen_batches" && column === "product_id") {
          return [[canonicalForeignKey(
            "products",
            "id",
            "fk_kitchen_batches_product",
          )]];
        }
      }
      if (/DROP FOREIGN KEY `batches_ibfk_1`/i.test(normalized)) {
        batchForeignKey = null;
        return [{ affectedRows: 0 }];
      }
      if (/ADD CONSTRAINT `fk_batches_product`/i.test(normalized)) {
        batchForeignKey = canonicalForeignKey(
          "products",
          "id",
          "fk_batches_product",
        );
        return [{ affectedRows: 0 }];
      }
      if (/^ALTER TABLE `staff_notifications`/i.test(normalized)) {
        notificationCategoryType =
          "enum('refund_request','purchase_order','inventory_change')";
        return [{ affectedRows: 0 }];
      }
      if (/^ALTER TABLE `purchase_orders`/i.test(normalized)) {
        purchaseOrderDeliveryNullable = "YES";
        return [{ affectedRows: 0 }];
      }
      if (/DROP INDEX `uq_orders_payment_reference`/i.test(normalized)) {
        hasUniquePaymentReferenceIndex = false;
        return [{ affectedRows: 0 }];
      }
      if (/CREATE INDEX `idx_orders_payment_reference`/i.test(normalized)) {
        hasPaymentReferenceLookupIndex = true;
        return [{ affectedRows: 0 }];
      }
      if (/^CREATE TABLE IF NOT EXISTS order_inventory_deductions/i.test(normalized)) {
        hasOrderInventoryDeductions = true;
        return [{ affectedRows: 0 }];
      }
      if (/^ALTER TABLE `users` MODIFY COLUMN `password_reset_code` VARCHAR\(64\) NULL/i.test(normalized)) {
        passwordResetCodeLength = 64;
        return [{ affectedRows: 0 }];
      }
      if (/^(ALTER TABLE|INSERT INTO products)/i.test(normalized)) {
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected migration query: ${normalized}`);
    },
  };
}

(async () => {
  const setupSource = fs.readFileSync(path.join(__dirname, "..", "setup.js"), "utf8");
  assert.match(
    setupSource,
    /CREATE TABLE IF NOT EXISTS batches[\s\S]*?product_id INT NOT NULL[\s\S]*?REFERENCES products\(id\)/i,
  );
  assert.match(
    setupSource,
    /CREATE TABLE IF NOT EXISTS kitchen_batches[\s\S]*?REFERENCES batches\(batch_id\)[\s\S]*?REFERENCES products\(id\)/i,
  );
  assert.match(setupSource, /await applyMigrations\(connection, \{ log \}\)/);

  const db = createExistingSchemaDb();
  await applyMigrations(db, { log: { log() {} } });
  const sql = db.calls.map((call) => call.sql).join("\n");
  assert.match(sql, /ADD COLUMN `unit` VARCHAR\(30\) NOT NULL DEFAULT 'piece'/i);
  assert.match(sql, /MODIFY COLUMN `product_id` INT NOT NULL/i);
  assert.match(sql, /DROP FOREIGN KEY `batches_ibfk_1`/i);
  assert.match(sql, /ADD CONSTRAINT `fk_batches_product`/i);
  assert.doesNotMatch(sql, /DELETE FROM|DROP TABLE|TRUNCATE/i);
  assert.match(sql, /INSERT INTO schema_migrations/);

  const firstRunCallCount = db.calls.length;
  await applyMigrations(db, { log: { log() {} } });
  const secondRunSql = db.calls
    .slice(firstRunCallCount)
    .map((call) => call.sql)
    .join("\n");
  assert.doesNotMatch(secondRunSql, /ALTER TABLE|INSERT INTO products/);

  const unsafeDb = createExistingSchemaDb({ nullBatchCount: 2 });
  await assert.rejects(
    () => up(unsafeDb, { log: { log() {} } }),
    (error) =>
      error?.code === "DB_MIGRATION_REVIEW_REQUIRED" &&
      error?.details?.invalidCount === 2,
  );
  const unsafeSql = unsafeDb.calls.map((call) => call.sql).join("\n");
  assert.doesNotMatch(unsafeSql, /MODIFY COLUMN `product_id`|DROP FOREIGN KEY/i);

  console.log("Deployment schema alignment migration tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
