const {
  ensureMenuAvailabilitySchema,
} = require("../utils/menuAvailability");
const {
  ensureProductsItemTypeSchema,
} = require("../utils/productItemType");
const { ensureInventoryUnitColumn } = require("../utils/inventorySchema");

let productSchemaReady = false;
let productSchemaPromise = null;

async function hasColumn(db, tableName, columnName) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [
    columnName,
  ]);
  return rows.length > 0;
}

async function ensureColumn(db, tableName, columnName, definition) {
  if (!(await hasColumn(db, tableName, columnName))) {
    await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

async function ensureMenuManagementColumns(db) {
  await ensureColumn(db, "products", "image", "image LONGTEXT NULL");
  await db.query(
    `UPDATE products
     SET image = '/img/placeholder.jpg'
     WHERE image IS NOT NULL
       AND TRIM(image) <> ''
       AND image LIKE 'data:image%'`,
  );
  await ensureProductsItemTypeSchema(db);

  await ensureColumn(db, "products", "menu_code", "menu_code VARCHAR(20) NULL");
  await ensureColumn(
    db,
    "products",
    "availability_status",
    "availability_status VARCHAR(20) DEFAULT 'Available'",
  );
  await ensureColumn(
    db,
    "products",
    "is_promotional",
    "is_promotional TINYINT(1) DEFAULT 0",
  );
  await ensureColumn(db, "products", "promo_price", "promo_price DECIMAL(10,2) NULL");
  await ensureColumn(db, "products", "promo_label", "promo_label VARCHAR(100) NULL");

  await db.query(
    `UPDATE products
     SET menu_code = CONCAT('M-', LPAD(id, 3, '0'))
     WHERE menu_code IS NULL OR TRIM(menu_code) = ''`,
  );
  await db.query(
    `UPDATE products
     SET availability_status = 'Available'
     WHERE availability_status IS NULL OR TRIM(availability_status) = ''`,
  );
  await db.query(
    `UPDATE products
     SET is_promotional = 0
     WHERE is_promotional IS NULL`,
  );
}

async function ensureInventoryThresholdColumns(db) {
  await ensureColumn(
    db,
    "Inventory",
    "Reorder_Point",
    "Reorder_Point DECIMAL(10,2) DEFAULT 20",
  );
  await ensureColumn(
    db,
    "Inventory",
    "Critical_Point",
    "Critical_Point DECIMAL(10,2) DEFAULT 5",
  );
  await ensureColumn(
    db,
    "Inventory",
    "use_default_thresholds",
    "use_default_thresholds TINYINT(1) NOT NULL DEFAULT 1",
  );
  await ensureColumn(
    db,
    "Inventory",
    "low_stock_threshold",
    "low_stock_threshold INT NULL",
  );
  await ensureColumn(
    db,
    "Inventory",
    "critical_stock_threshold",
    "critical_stock_threshold INT NULL",
  );
  await ensureInventoryUnitColumn(db);
}

async function ensureProductSchema(db) {
  if (productSchemaReady) return true;
  if (productSchemaPromise) return productSchemaPromise;

  productSchemaPromise = (async () => {
    await ensureMenuManagementColumns(db);
    await ensureMenuAvailabilitySchema(db);
    await ensureProductsItemTypeSchema(db);
    await ensureInventoryThresholdColumns(db);
    productSchemaReady = true;
    return true;
  })();

  try {
    return await productSchemaPromise;
  } catch (error) {
    productSchemaPromise = null;
    throw error;
  }
}

module.exports = {
  ensureProductSchema,
};
