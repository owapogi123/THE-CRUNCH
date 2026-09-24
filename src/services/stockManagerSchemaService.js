"use strict";

let schemaReady = false;
let schemaPromise = null;

async function hasColumn(db, tableName, columnName) {
  const [rows] = await db.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function ensureColumn(db, tableName, columnName, definition) {
  if (await hasColumn(db, tableName, columnName)) return;
  await db.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
}

async function ensureStockManagerCompatibilityColumns(db) {
  await ensureColumn(db, "batches", "delivery_batch_id", "VARCHAR(50) NULL");
  await ensureColumn(db, "batches", "shelf_life_days", "INT DEFAULT NULL");
  await ensureColumn(db, "batches", "shelf_life_hours", "INT DEFAULT NULL");
  await ensureColumn(db, "batches", "usable_until", "DATETIME DEFAULT NULL");

  await ensureColumn(
    db,
    "Suppliers",
    "Delivery_Schedule",
    "VARCHAR(100) NULL",
  );
  await ensureColumn(db, "Suppliers", "Email", "VARCHAR(255) NULL");
  await ensureColumn(db, "Suppliers", "Products_Supplied", "TEXT NULL");
  await ensureColumn(db, "Suppliers", "Product_ID", "INT NULL");
}

async function syncMissingStockInventoryRows(db) {
  await db.query(
    `INSERT INTO Inventory (
       Product_ID,
       Quantity,
       Stock,
       Item_Purchased,
       Reorder_Point,
       Critical_Point,
       use_default_thresholds,
       low_stock_threshold,
       critical_stock_threshold
     )
     SELECT
       m.Product_ID,
       m.Stock,
       m.Stock,
       m.Product_Name,
       20,
       5,
       1,
       NULL,
       NULL
     FROM Menu m
     JOIN products p ON p.id = m.Product_ID
     LEFT JOIN Inventory i ON i.Product_ID = m.Product_ID
     WHERE i.Inventory_ID IS NULL
       AND LOWER(TRIM(COALESCE(p.item_type, 'stock_item'))) = 'stock_item'`,
  );
}

async function initializeStockManagerSchema(db) {
  if (schemaReady) return true;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await ensureStockManagerCompatibilityColumns(db);
    await syncMissingStockInventoryRows(db);
    schemaReady = true;
    return true;
  })();

  try {
    return await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

module.exports = {
  initializeStockManagerSchema,
};
