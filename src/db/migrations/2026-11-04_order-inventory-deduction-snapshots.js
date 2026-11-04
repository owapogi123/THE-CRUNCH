"use strict";

const VERSION = "2026-11-04_order-inventory-deduction-snapshots";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS order_inventory_deductions (
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity DECIMAL(14,4) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (order_id, product_id),
    CONSTRAINT fk_order_inventory_deductions_order
      FOREIGN KEY (order_id) REFERENCES orders(Order_ID)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_order_inventory_deductions_quantity
      CHECK (quantity > 0)
  ) ENGINE=InnoDB
`;

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = ?
      LIMIT 1`,
    [String(tableName).toLowerCase()],
  );
  return rows.length > 0;
}

async function up(connection, { log = console } = {}) {
  if (await tableExists(connection, "order_inventory_deductions")) return;
  if (!(await tableExists(connection, "orders"))) {
    const error = new Error(
      "orders table is missing; deduction-snapshot migration requires manual review.",
    );
    error.code = "DB_MIGRATION_REVIEW_REQUIRED";
    throw error;
  }

  await connection.query(CREATE_TABLE_SQL);
  log.log("Migration: added immutable order inventory deduction snapshots.");
}

module.exports = {
  CREATE_TABLE_SQL,
  VERSION,
  up,
};
