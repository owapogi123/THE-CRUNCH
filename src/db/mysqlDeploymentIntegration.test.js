"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = 3306;
const EXPECTED_DATABASE = "the_crunch_integration_test";
const EXPECTED_USER = "the_crunch_test_runner";
const TEST_ENV_PATH = path.resolve(__dirname, "../../.env.test.local");

const ALLOWED_TABLES = new Set([
  "admin",
  "batches",
  "inventory",
  "menu",
  "menu_item_ingredients",
  "order_inventory_deductions",
  "order_item",
  "orders",
  "paymongo_checkout_intents",
  "paymongo_webhook_events",
  "products",
  "schema_migrations",
  "stock_status",
]);

function loadIsolatedConfig() {
  assert.ok(fs.existsSync(TEST_ENV_PATH), ".env.test.local is required");
  const parsed = dotenv.parse(fs.readFileSync(TEST_ENV_PATH));
  const config = {
    host: String(parsed.INTEGRATION_DB_HOST || "").trim(),
    port: Number(parsed.INTEGRATION_DB_PORT),
    database: String(parsed.INTEGRATION_DB_NAME || "").trim(),
    user: String(parsed.INTEGRATION_DB_USER || "").trim(),
    password: String(parsed.INTEGRATION_DB_PASSWORD || ""),
  };

  assert.equal(config.host, EXPECTED_HOST, "integration host must be local");
  assert.equal(config.port, EXPECTED_PORT, "integration port must be 3306");
  assert.equal(
    config.database,
    EXPECTED_DATABASE,
    "integration database name must match exactly",
  );
  assert.equal(config.user, EXPECTED_USER, "unexpected integration database user");
  assert.ok(config.password, "integration password is required");
  return config;
}

function normalizeTableName(row) {
  return String(Object.values(row)[0] || "").toLowerCase();
}

async function verifyIsolation(pool, config) {
  const [[identity]] = await pool.query(
    `SELECT
       CURRENT_USER() AS currentUser,
       USER() AS connectedUser,
       VERSION() AS version,
       @@port AS port,
       DATABASE() AS databaseName,
       @@read_only AS readOnly`,
  );

  assert.equal(Number(identity.port), EXPECTED_PORT);
  assert.equal(identity.databaseName, EXPECTED_DATABASE);
  assert.match(String(identity.version), /^8\.0\.44(?:[-+.]|$)/);
  assert.match(
    String(identity.currentUser).toLowerCase(),
    /^the_crunch_test_runner@(localhost|127\.0\.0\.1)$/,
  );
  assert.equal(Number(identity.readOnly), 0);

  const [grantRows] = await pool.query("SHOW GRANTS");
  const grants = grantRows.map((row) => String(Object.values(row)[0] || ""));
  assert.ok(grants.length > 0, "SHOW GRANTS returned no grants");
  for (const grant of grants) {
    assert.doesNotMatch(grant, /WITH GRANT OPTION/i);
    assert.doesNotMatch(
      grant,
      /\b(?:SUPER|FILE|PROCESS|SHUTDOWN|CREATE USER|SYSTEM_USER|ROLE_ADMIN|REPLICATION|BACKUP_ADMIN)\b/i,
    );
    if (/ ON \*\.\*/i.test(grant)) {
      assert.match(grant, /^GRANT USAGE ON \*\.\*/i);
    } else if (/\bON\b/i.test(grant)) {
      assert.match(
        grant,
        new RegExp("ON `" + EXPECTED_DATABASE + "`\\.\\*", "i"),
        `grant escaped the disposable schema: ${grant.replace(/IDENTIFIED BY.*/i, "<redacted>")}`,
      );
    }
  }

  const [databaseRows] = await pool.query("SHOW DATABASES");
  const allowedDatabases = new Set([
    EXPECTED_DATABASE,
    "information_schema",
    "performance_schema",
    "sys",
  ]);
  const visibleDatabases = databaseRows.map((row) =>
    String(Object.values(row)[0] || "").toLowerCase(),
  );
  assert.ok(visibleDatabases.includes(EXPECTED_DATABASE));
  assert.deepEqual(
    visibleDatabases.filter((name) => !allowedDatabases.has(name)),
    [],
    "test user can see an unexpected database",
  );

  const [tables] = await pool.query("SHOW TABLES");
  const unexpectedTables = tables
    .map(normalizeTableName)
    .filter((name) => !ALLOWED_TABLES.has(name));
  assert.deepEqual(
    unexpectedTables,
    [],
    "disposable schema contains unexpected tables; refusing destructive test setup",
  );

  return {
    currentUser: identity.currentUser,
    version: identity.version,
    visibleDatabases,
    grantCount: grants.length,
    tableCount: tables.length,
    config,
  };
}

async function resetDisposableSchema(pool) {
  const [rows] = await pool.query("SHOW TABLES");
  const tables = rows.map(normalizeTableName);
  const unexpected = tables.filter((name) => !ALLOWED_TABLES.has(name));
  assert.deepEqual(unexpected, []);

  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    await pool.query("DROP TRIGGER IF EXISTS fail_inventory_update");
    for (const table of tables) {
      await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  } finally {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

async function createBaseSchema(pool) {
  await pool.query(`
    CREATE TABLE orders (
      Order_ID INT NOT NULL AUTO_INCREMENT,
      Status VARCHAR(50) NULL,
      payment_status VARCHAR(50) NULL,
      payment_reference VARCHAR(255) NULL,
      payment_method VARCHAR(50) NULL,
      stock_deducted TINYINT(1) NOT NULL DEFAULT 0,
      Order_Date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (Order_ID),
      UNIQUE KEY uq_orders_payment_reference (payment_reference)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

async function applyPendingMigrations(pool) {
  const migrations = [
    require("./migrations/2026-11-03_third-party-reference-reuse"),
    require("./migrations/2026-11-04_order-inventory-deduction-snapshots"),
    require("./migrations/2026-11-06_paymongo-checkout-intents"),
    require("./migrations/2026-11-06_paymongo-webhook-events"),
  ];
  const [rows] = await pool.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => String(row.version)));
  for (const migration of migrations) {
    if (applied.has(migration.VERSION)) continue;
    await migration.up(pool, { log: { log() {} } });
    await pool.query("INSERT INTO schema_migrations (version) VALUES (?)", [
      migration.VERSION,
    ]);
    applied.add(migration.VERSION);
  }
}

async function testMigrations(pool) {
  await applyPendingMigrations(pool);
  await applyPendingMigrations(pool);

  const migrationModules = [
    require("./migrations/2026-11-03_third-party-reference-reuse"),
    require("./migrations/2026-11-04_order-inventory-deduction-snapshots"),
    require("./migrations/2026-11-06_paymongo-checkout-intents"),
    require("./migrations/2026-11-06_paymongo-webhook-events"),
  ];
  for (const migration of migrationModules) {
    await migration.up(pool, { log: { log() {} } });
  }

  const [versions] = await pool.query(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  assert.deepEqual(
    versions.map((row) => row.version),
    [
      "2026-11-03_third-party-reference-reuse",
      "2026-11-04_order-inventory-deduction-snapshots",
      "2026-11-06_paymongo-checkout-intents",
      "2026-11-06_paymongo-webhook-events",
    ],
  );

  const [indexes] = await pool.query("SHOW INDEX FROM orders");
  assert.equal(
    indexes.some((row) => row.Key_name === "uq_orders_payment_reference"),
    false,
  );
  assert.equal(
    indexes.filter((row) => row.Key_name === "idx_orders_payment_reference").length,
    1,
  );

  const [[quantityColumn]] = await pool.query(
    `SELECT COLUMN_TYPE AS columnType
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_inventory_deductions'
        AND COLUMN_NAME = 'quantity'`,
  );
  assert.equal(String(quantityColumn.columnType).toLowerCase(), "decimal(14,4)");

  const [[itemsJsonColumn]] = await pool.query(
    `SELECT DATA_TYPE AS dataType
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'paymongo_checkout_intents'
        AND COLUMN_NAME = 'items_json'`,
  );
  assert.equal(String(itemsJsonColumn.dataType).toLowerCase(), "json");
  const [intentIndexes] = await pool.query("SHOW INDEX FROM paymongo_checkout_intents");
  assert.equal(
    intentIndexes.some(
      (row) =>
        row.Key_name === "uq_paymongo_intents_checkout_session" &&
        Number(row.Non_unique) === 0,
    ),
    true,
  );

  const [foreignKeys] = await pool.query(
    `SELECT REFERENCED_TABLE_NAME AS referencedTable,
            REFERENCED_COLUMN_NAME AS referencedColumn
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_inventory_deductions'
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  assert.deepEqual(foreignKeys, [
    { referencedTable: "orders", referencedColumn: "Order_ID" },
  ]);
}

async function attemptProtectedReference(pool, reference, method) {
  const {
    findProtectedPaymentReference,
    getProtectedPaymentReferenceLockName,
  } = require("../services/paymentReferencePolicy");
  const connection = await pool.getConnection();
  const lockName = getProtectedPaymentReferenceLockName(reference);
  let lockHeld = false;
  let transactionOpen = false;
  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(?, 5) AS acquired",
      [lockName],
    );
    assert.equal(Number(lock.acquired), 1);
    lockHeld = true;
    await connection.beginTransaction();
    transactionOpen = true;
    const duplicate = await findProtectedPaymentReference(connection, reference);
    if (duplicate) {
      const error = new Error("duplicate protected payment reference");
      error.code = "DUPLICATE_PAYMENT_REFERENCE";
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
    await connection.query(
      `INSERT INTO orders
         (Status, payment_status, payment_reference, payment_method)
       VALUES ('Queued', 'Paid', ?, ?)`,
      [reference, method],
    );
    await connection.commit();
    transactionOpen = false;
    return true;
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    throw error;
  } finally {
    if (lockHeld) {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    }
    connection.release();
  }
}

async function testPaymentReferences(pool) {
  const {
    getProtectedPaymentReferenceLockName,
  } = require("../services/paymentReferencePolicy");
  assert.equal(
    getProtectedPaymentReferenceLockName("GCASH-AbC123"),
    getProtectedPaymentReferenceLockName("  gcash-abc123  "),
  );

  for (const [left, right, method] of [
    ["GCASH-AbC123", "gcash-abc123", "GCash"],
    ["PAYMONGO-XyZ789", "paymongo-xyz789", "PayMongo"],
    ["GCASH-EXACT-900", "GCASH-EXACT-900", "GCash"],
    ["PAYMONGO-EXACT-901", "PAYMONGO-EXACT-901", "PayMongo"],
  ]) {
    const results = await Promise.allSettled([
      attemptProtectedReference(pool, left, method),
      attemptProtectedReference(pool, right, method),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(
      results.find((result) => result.status === "rejected").reason.code,
      "DUPLICATE_PAYMENT_REFERENCE",
    );
  }

  for (const method of ["GrabFood", "foodpanda"]) {
    await pool.query(
      `INSERT INTO orders
         (Status, payment_status, payment_reference, payment_method)
       VALUES ('Queued', 'Paid', 'REUSABLE-REF-77', ?)`,
      [method],
    );
    await pool.query(
      `INSERT INTO orders
         (Status, payment_status, payment_reference, payment_method)
       VALUES ('Queued', 'Paid', 'REUSABLE-REF-77', ?)`,
      [method],
    );
  }
  const [[reuseCount]] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM orders
      WHERE payment_reference = 'REUSABLE-REF-77'`,
  );
  assert.equal(Number(reuseCount.count), 4);
}

async function createInventorySchema(pool) {
  await pool.query(`
    CREATE TABLE products (
      id INT NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(12,2) NOT NULL DEFAULT 0,
      quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
      description TEXT NULL,
      item_type VARCHAR(20) NOT NULL
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE Menu (
      Product_ID INT NOT NULL PRIMARY KEY,
      Product_Name VARCHAR(255) NOT NULL,
      Price DECIMAL(12,2) NOT NULL DEFAULT 0,
      Stock DECIMAL(14,4) NOT NULL DEFAULT 0,
      Promo VARCHAR(100) NULL,
      Category_Name VARCHAR(100) NULL,
      manual_override TINYINT(1) NOT NULL DEFAULT 0,
      manual_status VARCHAR(20) NOT NULL DEFAULT 'Available'
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE Inventory (
      Product_ID INT NOT NULL PRIMARY KEY,
      Quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
      Stock DECIMAL(14,4) NOT NULL DEFAULT 0,
      Item_Purchased VARCHAR(255) NULL,
      Last_Update DATETIME NULL
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE order_item (
      Order_Item_ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Order_ID INT NOT NULL,
      Product_ID INT NOT NULL,
      Quantity INT NOT NULL,
      Subtotal DECIMAL(12,2) NULL
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE menu_item_ingredients (
      menu_ingredient_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      menu_product_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity_required DECIMAL(14,4) NOT NULL,
      UNIQUE KEY uniq_menu_ingredient (menu_product_id, product_id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE batches (
      batch_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      unit VARCHAR(50) NULL
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE Stock_Status (
      Stock_ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Product_ID INT NOT NULL,
      Type VARCHAR(50) NOT NULL,
      Quantity DECIMAL(14,4) NOT NULL,
      Status_Date DATETIME NOT NULL,
      RecordedBy INT NULL
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE admin (
      Admin_ID INT NOT NULL PRIMARY KEY
    ) ENGINE=InnoDB
  `);
}

function installRealDatabaseService(pool) {
  const modulePath = require.resolve("../config/db");
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: pool,
  };
  delete require.cache[require.resolve("../services/inventoryService")];
  return require("../services/inventoryService");
}

async function clearInventoryFixtures(pool) {
  await pool.query("DELETE FROM Stock_Status");
  await pool.query("DELETE FROM order_inventory_deductions");
  await pool.query("DELETE FROM order_item");
  await pool.query("DELETE FROM menu_item_ingredients");
  await pool.query("DELETE FROM Inventory");
  await pool.query("DELETE FROM batches");
  await pool.query("DELETE FROM products");
  await pool.query("DELETE FROM Menu");
  await pool.query("DELETE FROM admin");
  await pool.query("DELETE FROM orders");
}

async function seedIngredient(pool, id, name, stock) {
  await pool.query(
    `INSERT INTO products (id, name, price, quantity, item_type)
     VALUES (?, ?, 0, ?, 'stock_item')`,
    [id, name, stock],
  );
  await pool.query(
    `INSERT INTO Menu
       (Product_ID, Product_Name, Price, Stock, Promo, Category_Name)
     VALUES (?, ?, 0, ?, 'raw_material', 'raw materials')`,
    [id, name, stock],
  );
  await pool.query(
    `INSERT INTO Inventory
       (Product_ID, Quantity, Stock, Item_Purchased, Last_Update)
     VALUES (?, ?, ?, ?, NOW())`,
    [id, stock, stock, name],
  );
}

async function seedMenuItem(pool, id, name, ingredientId, quantityRequired) {
  await pool.query(
    `INSERT INTO products (id, name, price, quantity, item_type)
     VALUES (?, ?, 100, 0, 'menu_item')`,
    [id, name],
  );
  await pool.query(
    `INSERT INTO Menu
       (Product_ID, Product_Name, Price, Stock, Promo, Category_Name)
     VALUES (?, ?, 100, 0, 'MENU FOOD', 'menu food')`,
    [id, name],
  );
  await pool.query(
    `INSERT INTO menu_item_ingredients
       (menu_product_id, product_id, quantity_required)
     VALUES (?, ?, ?)`,
    [id, ingredientId, quantityRequired],
  );
}

async function seedOrder(pool, orderId, menuProductId, quantity) {
  await pool.query(
    `INSERT INTO orders
       (Order_ID, Status, payment_status, stock_deducted)
     VALUES (?, 'Awaiting Cashier Review', 'Paid', 0)`,
    [orderId],
  );
  await pool.query(
    `INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal)
     VALUES (?, ?, ?, 0)`,
    [orderId, menuProductId, quantity],
  );
}

async function acceptOnlineOrder(pool, inventoryService, orderId) {
  const connection = await pool.getConnection();
  let open = false;
  try {
    await connection.beginTransaction();
    open = true;
    const [rows] = await connection.query(
      `SELECT Status, stock_deducted
         FROM orders
        WHERE Order_ID = ?
        FOR UPDATE`,
      [orderId],
    );
    assert.equal(rows.length, 1);
    if (String(rows[0].Status) !== "Awaiting Cashier Review") {
      await connection.rollback();
      open = false;
      return false;
    }
    await connection.query(
      "UPDATE orders SET Status = 'Queued' WHERE Order_ID = ?",
      [orderId],
    );
    const deducted = await inventoryService.deductStockForPaidOrder(
      orderId,
      null,
      connection,
    );
    assert.equal(deducted, true);
    await connection.commit();
    open = false;
    return true;
  } catch (error) {
    if (open) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveRefund(pool, inventoryService, orderId) {
  const connection = await pool.getConnection();
  let open = false;
  try {
    await connection.beginTransaction();
    open = true;
    const [rows] = await connection.query(
      `SELECT Status, stock_deducted
         FROM orders
        WHERE Order_ID = ?
        FOR UPDATE`,
      [orderId],
    );
    assert.equal(rows.length, 1);
    if (String(rows[0].Status) === "Refunded") {
      await connection.rollback();
      open = false;
      return false;
    }
    await connection.query(
      "UPDATE orders SET Status = 'Refunded' WHERE Order_ID = ?",
      [orderId],
    );
    const restored = await inventoryService.restoreStockForRefundedOrder(
      orderId,
      null,
      connection,
    );
    assert.equal(restored, true);
    await connection.commit();
    open = false;
    return true;
  } catch (error) {
    if (open) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function readStock(pool, productId) {
  const [[row]] = await pool.query(
    `SELECT i.Stock AS inventoryStock,
            m.Stock AS menuStock,
            p.quantity AS productStock
       FROM Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
      WHERE i.Product_ID = ?`,
    [productId],
  );
  return {
    inventory: Number(row.inventoryStock),
    menu: Number(row.menuStock),
    product: Number(row.productStock),
  };
}

async function seedStockRace(pool) {
  await clearInventoryFixtures(pool);
  await seedIngredient(pool, 2001, "Chicken", 192);
  await seedMenuItem(pool, 1001, "Order A", 2001, 1);
  await seedMenuItem(pool, 1002, "Order B", 2001, 1);
  await seedOrder(pool, 101, 1001, 192);
  await seedOrder(pool, 102, 1002, 50);
}

async function assertFailedOrderAwaiting(pool, orderId) {
  const [[row]] = await pool.query(
    "SELECT Status, stock_deducted FROM orders WHERE Order_ID = ?",
    [orderId],
  );
  assert.equal(row.Status, "Awaiting Cashier Review");
  assert.equal(Number(row.stock_deducted), 0);
  const [[snapshot]] = await pool.query(
    "SELECT COUNT(*) AS count FROM order_inventory_deductions WHERE order_id = ?",
    [orderId],
  );
  assert.equal(Number(snapshot.count), 0);
}

async function testOnlineAcceptance(pool, inventoryService) {
  await seedStockRace(pool);
  assert.equal(await acceptOnlineOrder(pool, inventoryService, 101), true);
  await assert.rejects(
    acceptOnlineOrder(pool, inventoryService, 102),
    /Insufficient stock/,
  );
  assert.deepEqual(await readStock(pool, 2001), {
    inventory: 0,
    menu: 0,
    product: 0,
  });
  await assertFailedOrderAwaiting(pool, 102);

  await seedStockRace(pool);
  assert.equal(await acceptOnlineOrder(pool, inventoryService, 102), true);
  await assert.rejects(
    acceptOnlineOrder(pool, inventoryService, 101),
    /Insufficient stock/,
  );
  assert.deepEqual(await readStock(pool, 2001), {
    inventory: 142,
    menu: 142,
    product: 142,
  });
  await assertFailedOrderAwaiting(pool, 101);

  await seedStockRace(pool);
  const concurrent = await Promise.allSettled([
    acceptOnlineOrder(pool, inventoryService, 101),
    acceptOnlineOrder(pool, inventoryService, 102),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  const stock = await readStock(pool, 2001);
  assert.ok(stock.inventory === 0 || stock.inventory === 142);
  assert.equal(stock.inventory, stock.menu);
  assert.equal(stock.inventory, stock.product);
  const [[deductedCount]] = await pool.query(
    "SELECT COUNT(*) AS count FROM orders WHERE stock_deducted = 1",
  );
  assert.equal(Number(deductedCount.count), 1);

  await seedStockRace(pool);
  const duplicate = await Promise.all([
    acceptOnlineOrder(pool, inventoryService, 102),
    acceptOnlineOrder(pool, inventoryService, 102),
  ]);
  assert.deepEqual(duplicate.sort(), [false, true]);
  assert.deepEqual(await readStock(pool, 2001), {
    inventory: 142,
    menu: 142,
    product: 142,
  });
  const [[snapshotCount]] = await pool.query(
    "SELECT COUNT(*) AS count FROM order_inventory_deductions WHERE order_id = 102",
  );
  assert.equal(Number(snapshotCount.count), 1);
}

async function testRollbackAndSnapshots(pool, inventoryService) {
  await clearInventoryFixtures(pool);
  await seedIngredient(pool, 2101, "Rollback Ingredient", 10);
  await seedMenuItem(pool, 1101, "Rollback Meal", 2101, 2);
  await seedOrder(pool, 301, 1101, 1);
  await pool.query(`
    ALTER TABLE Inventory
    ADD CONSTRAINT fail_inventory_update CHECK (Stock <> 8.0000)
  `);
  await assert.rejects(
    acceptOnlineOrder(pool, inventoryService, 301),
    (error) => error?.code === "ER_CHECK_CONSTRAINT_VIOLATED",
  );
  await pool.query(
    "ALTER TABLE Inventory DROP CHECK fail_inventory_update",
  );
  await assertFailedOrderAwaiting(pool, 301);
  assert.deepEqual(await readStock(pool, 2101), {
    inventory: 10,
    menu: 10,
    product: 10,
  });
  const [[movements]] = await pool.query(
    "SELECT COUNT(*) AS count FROM Stock_Status",
  );
  assert.equal(Number(movements.count), 0);

  await pool.query(
    `INSERT INTO order_inventory_deductions (order_id, product_id, quantity)
     VALUES (301, 2101, 0.1234)`,
  );
  const [[decimalRow]] = await pool.query(
    `SELECT CAST(quantity AS CHAR) AS quantity
       FROM order_inventory_deductions
      WHERE order_id = 301 AND product_id = 2101`,
  );
  assert.equal(decimalRow.quantity, "0.1234");
  await assert.rejects(
    pool.query(
      `INSERT INTO order_inventory_deductions (order_id, product_id, quantity)
       VALUES (999999, 2101, 1)`,
    ),
    (error) => error?.code === "ER_NO_REFERENCED_ROW_2",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO order_inventory_deductions (order_id, product_id, quantity)
       VALUES (301, 2101, 1)`,
    ),
    (error) => error?.code === "ER_DUP_ENTRY",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO order_inventory_deductions (order_id, product_id, quantity)
       VALUES (301, 2102, 0)`,
    ),
    (error) => error?.code === "ER_CHECK_CONSTRAINT_VIOLATED",
  );
}

async function testRefundSnapshot(pool, inventoryService) {
  await clearInventoryFixtures(pool);
  await seedIngredient(pool, 2201, "Original Chicken", 10);
  await seedIngredient(pool, 2202, "Original Oil", 8);
  await seedIngredient(pool, 2203, "Replacement Ingredient", 6);
  await seedMenuItem(pool, 1201, "Snapshot Meal", 2201, 1.1255);
  await pool.query(
    `INSERT INTO menu_item_ingredients
       (menu_product_id, product_id, quantity_required)
     VALUES (1201, 2202, 0.3750)`,
  );
  await seedOrder(pool, 401, 1201, 1);
  assert.equal(await acceptOnlineOrder(pool, inventoryService, 401), true);
  assert.deepEqual(await readStock(pool, 2201), {
    inventory: 8.8745,
    menu: 8.8745,
    product: 8.8745,
  });
  assert.deepEqual(await readStock(pool, 2202), {
    inventory: 7.625,
    menu: 7.625,
    product: 7.625,
  });

  await pool.query("DELETE FROM menu_item_ingredients WHERE menu_product_id = 1201");
  await pool.query(
    `INSERT INTO menu_item_ingredients
       (menu_product_id, product_id, quantity_required)
     VALUES (1201, 2203, 9.0000)`,
  );

  const refunds = await Promise.all([
    approveRefund(pool, inventoryService, 401),
    approveRefund(pool, inventoryService, 401),
  ]);
  assert.deepEqual(refunds.sort(), [false, true]);
  assert.deepEqual(await readStock(pool, 2201), {
    inventory: 10,
    menu: 10,
    product: 10,
  });
  assert.deepEqual(await readStock(pool, 2202), {
    inventory: 8,
    menu: 8,
    product: 8,
  });
  assert.deepEqual(await readStock(pool, 2203), {
    inventory: 6,
    menu: 6,
    product: 6,
  });
  const [[snapshotCount]] = await pool.query(
    "SELECT COUNT(*) AS count FROM order_inventory_deductions WHERE order_id = 401",
  );
  assert.equal(Number(snapshotCount.count), 2);

  await clearInventoryFixtures(pool);
  await seedIngredient(pool, 2301, "Restore Rollback", 12);
  await seedMenuItem(pool, 1301, "Restore Rollback Meal", 2301, 2);
  await seedOrder(pool, 501, 1301, 1);
  assert.equal(await acceptOnlineOrder(pool, inventoryService, 501), true);
  await pool.query(`
    ALTER TABLE Inventory
    ADD CONSTRAINT fail_inventory_update CHECK (Stock <> 12.0000)
  `);
  await assert.rejects(
    approveRefund(pool, inventoryService, 501),
    (error) => error?.code === "ER_CHECK_CONSTRAINT_VIOLATED",
  );
  await pool.query(
    "ALTER TABLE Inventory DROP CHECK fail_inventory_update",
  );
  const [[order]] = await pool.query(
    "SELECT Status, stock_deducted FROM orders WHERE Order_ID = 501",
  );
  assert.equal(order.Status, "Queued");
  assert.equal(Number(order.stock_deducted), 1);
  assert.deepEqual(await readStock(pool, 2301), {
    inventory: 10,
    menu: 10,
    product: 10,
  });
  const [[snapshot]] = await pool.query(
    "SELECT COUNT(*) AS count FROM order_inventory_deductions WHERE order_id = 501",
  );
  assert.equal(Number(snapshot.count), 1);
}

async function main() {
  const config = loadIsolatedConfig();
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
    multipleStatements: false,
  });
  let isolation;
  let stateChangesStarted = false;
  try {
    isolation = await verifyIsolation(pool, config);
    console.log(
      `Isolation verified: ${isolation.currentUser}, MySQL ${isolation.version}, ` +
        `${isolation.visibleDatabases.length} visible system/test schemas, ` +
        `${isolation.grantCount} grant statements, ${isolation.tableCount} existing test tables.`,
    );
    if (process.argv.includes("--safety-only")) return;

    stateChangesStarted = true;
    await resetDisposableSchema(pool);
    await createBaseSchema(pool);
    await testMigrations(pool);
    await testPaymentReferences(pool);
    await createInventorySchema(pool);
    const inventoryService = installRealDatabaseService(pool);
    await testOnlineAcceptance(pool, inventoryService);
    await testRollbackAndSnapshots(pool, inventoryService);
    await testRefundSnapshot(pool, inventoryService);
    console.log("Real MySQL deployment integration tests passed.");
  } finally {
    if (stateChangesStarted) {
      await resetDisposableSchema(pool).catch((error) => {
        console.error("Disposable schema cleanup failed:", error.message);
      });
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error("MySQL integration test failed:", {
    code: error?.code || "UNKNOWN_ERROR",
    message: error?.message || String(error),
  });
  process.exitCode = 1;
});
