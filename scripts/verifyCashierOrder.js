const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

process.env.NODE_ENV = "test";
const databaseName = `the_crunch_cashier_verify_${Date.now()}_${process.pid}`;
process.env.DB_NAME = databaseName;

function serverConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306),
    ...(process.env.DB_SSL_CA_PATH
      ? {
          ssl: {
            ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA_PATH), "utf8"),
            rejectUnauthorized: true,
          },
        }
      : {}),
  };
}

async function dropDatabase() {
  if (!/^the_crunch_cashier_verify_\d+_\d+$/.test(databaseName)) {
    throw new Error(`Refusing to drop unexpected database ${databaseName}`);
  }
  const connection = await mysql.createConnection(serverConfig());
  try {
    const [rows] = await connection.query("SHOW DATABASES LIKE ?", [databaseName]);
    if (rows.length === 1) {
      await connection.query(`DROP DATABASE \`${databaseName}\``);
      console.error(`Dropped disposable verification database ${databaseName}`);
    }
  } finally {
    await connection.end();
  }
}

function postJson(port, route, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    request.once("error", reject);
    request.end(payload);
  });
}

function cashPayload(items, overrides = {}) {
  return {
    items,
    total: 99999,
    order_type: "dine-in",
    payment_method: "cash",
    customer_type: "Regular customer",
    discount_name: "Regular customer",
    cashierId: 1,
    cash_tendered: 99999,
    change_amount: 0,
    ...overrides,
  };
}

async function main() {
  const { setup } = require("../src/db/setup");
  const quietLog = { log() {}, error: console.error };
  await setup({ log: quietLog });
  await setup({ log: quietLog });

  const db = require("../src/config/db");
  const { ensureProductSchema } = require("../src/services/productSchemaService");
  const { initializeStockManagerSchema } = require("../src/services/stockManagerSchemaService");
  await ensureProductSchema(db);
  await initializeStockManagerSchema(db);

  const [orderColumns] = await db.query("SHOW COLUMNS FROM orders");
  const orderColumnNames = new Set(orderColumns.map((column) => column.Field));
  for (const required of [
    "payment_reference",
    "payment_status",
    "payment_method",
    "stock_deducted",
  ]) {
    assert(orderColumnNames.has(required), `missing startup column ${required}`);
  }
  const [paymentIndexes] = await db.query(
    "SHOW INDEX FROM orders WHERE Key_name = 'uq_orders_payment_reference'",
  );
  assert(paymentIndexes.length > 0, "unique payment-reference index was not created");

  await db.query(
    `INSERT INTO Admin (Admin_ID, UserName, Email, Password)
     VALUES (1, 'Verify Admin', 'verify-admin@example.invalid', 'not-used')`,
  );
  await db.query(
    `INSERT INTO users (id, username, email, password_hash, role, email_verified)
     VALUES (1, 'verify-admin', 'verify-user@example.invalid', 'not-used', 'administrator', 1)`,
  );
  await db.query(
    `INSERT INTO Cashier (Cashier_ID, UserName, Password)
     VALUES (1, 'verify-admin', 'not-used')`,
  );

  const products = [
    [1, "Direct Item", 50, 5, "menu_item", 0, "Available"],
    [2, "Unavailable Item", 60, 5, "menu_item", 1, "Unavailable"],
    [3, "Zero Item", 70, 0, "menu_item", 0, "Available"],
    [4, "Recipe A", 100, 20, "menu_item", 0, "Available"],
    [5, "Flour", 10, 10, "stock_item", 0, "Available"],
    [6, "Sauce", 10, 6, "stock_item", 0, "Available"],
    [7, "Recipe B", 80, 20, "menu_item", 0, "Available"],
    [8, "Unrelated Stock", 10, 9, "stock_item", 0, "Available"],
  ];
  for (const [id, name, price, stock, itemType, override, status] of products) {
    await db.query(
      `INSERT INTO Menu
         (Product_ID, Product_Name, Price, Availability, Stock, manual_override, manual_status)
       VALUES (?, ?, ?, TRUE, ?, ?, ?)`,
      [id, name, price, stock, override, status],
    );
    await db.query(
      `INSERT INTO products (id, name, price, quantity, item_type)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, price, stock, itemType],
    );
    await db.query(
      `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
       VALUES (?, ?, ?, ?)`,
      [id, stock, stock, name],
    );
  }
  await db.query(
    `INSERT INTO menu_item_ingredients
       (menu_product_id, product_id, quantity_required)
     VALUES (4, 5, 2), (4, 6, 3), (7, 5, 1)`,
  );

  let payMongoRequests = 0;
  global.fetch = async () => {
    payMongoRequests += 1;
    throw new Error("Unexpected external fetch during verification");
  };

  const app = require("../src/app");
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const port = server.address().port;
  const results = [];
  const record = (name, response) => {
    results.push({ name, status: response.status, message: response.body?.message });
  };

  try {
    let response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 1, qty: 1 },
    ]));
    assert.equal(response.status, 200);
    record("valid cash", response);
    let [rows] = await db.query(
      `SELECT i.Stock AS inventoryStock, m.Stock AS menuStock, p.quantity AS productStock
       FROM Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
       WHERE i.Product_ID = 1`,
    );
    assert.deepEqual(
      rows.map((row) => [Number(row.inventoryStock), Number(row.menuStock), Number(row.productStock)]),
      [[4, 4, 4]],
    );

    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 1, qty: 0 },
    ]));
    assert.equal(response.status, 400);
    record("invalid quantity", response);

    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 2, qty: 1 },
    ]));
    assert.equal(response.status, 409);
    record("unavailable product", response);

    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 3, qty: 1 },
    ]));
    assert.equal(response.status, 409);
    record("zero stock", response);

    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 4, qty: 3 },
    ]));
    assert.equal(response.status, 409);
    record("insufficient ingredient stock", response);

    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 4, qty: 2 },
      { product_id: 7, qty: 3 },
    ]));
    assert.equal(response.status, 200);
    record("multi-item aggregated ingredients", response);
    [rows] = await db.query(
      `SELECT Product_ID AS id, Stock
       FROM Inventory
       WHERE Product_ID IN (1, 5, 6, 8)
       ORDER BY Product_ID`,
    );
    assert.deepEqual(
      rows.map((row) => [Number(row.id), Number(row.Stock)]),
      [[1, 4], [5, 3], [6, 0], [8, 9]],
    );
    const [multiItems] = await db.query(
      `SELECT Product_ID AS id, Quantity AS quantity
       FROM order_item
       WHERE Order_ID = ?
       ORDER BY Product_ID`,
      [response.body.orderId],
    );
    assert.deepEqual(
      multiItems.map((row) => [Number(row.id), Number(row.quantity)]),
      [[4, 2], [7, 3]],
    );

    await db.query(
      `UPDATE Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
       SET i.Stock = 4, m.Stock = 4, p.quantity = 4
       WHERE i.Product_ID = 1`,
    );
    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 1, qty: 4 },
    ]));
    assert.equal(response.status, 200);
    record("exact available quantity", response);
    [rows] = await db.query("SELECT Stock FROM Inventory WHERE Product_ID = 1");
    assert.equal(Number(rows[0].Stock), 0);

    await db.query(
      `UPDATE Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
       SET i.Stock = 5, m.Stock = 5, p.quantity = 5
       WHERE i.Product_ID = 1`,
    );
    const [beforeCounts] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM orders) AS ordersCount,
         (SELECT COUNT(*) FROM order_item) AS itemsCount,
         (SELECT COUNT(*) FROM payments) AS paymentsCount,
         (SELECT COUNT(*) FROM Stock_Status) AS stockStatusCount`,
    );
    await db.query(
      `CREATE TRIGGER benchmark_fail_stock_status
       BEFORE INSERT ON Stock_Status
       FOR EACH ROW
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced rollback verification'`,
    );
    response = await postJson(port, "/api/orders", cashPayload([
      { product_id: 1, qty: 1 },
    ]));
    assert.equal(response.status, 500);
    record("forced transactional failure", response);
    await db.query("DROP TRIGGER benchmark_fail_stock_status");
    const [afterCounts] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM orders) AS ordersCount,
         (SELECT COUNT(*) FROM order_item) AS itemsCount,
         (SELECT COUNT(*) FROM payments) AS paymentsCount,
         (SELECT COUNT(*) FROM Stock_Status) AS stockStatusCount`,
    );
    assert.deepEqual(afterCounts[0], beforeCounts[0]);
    [rows] = await db.query(
      `SELECT i.Stock AS inventoryStock, m.Stock AS menuStock, p.quantity AS productStock
       FROM Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
       WHERE i.Product_ID = 1`,
    );
    assert.deepEqual(
      [Number(rows[0].inventoryStock), Number(rows[0].menuStock), Number(rows[0].productStock)],
      [5, 5, 5],
    );

    const onsitePayload = cashPayload(
      [{ product_id: 1, qty: 1 }],
      {
        payment_method: "gcash_onsite",
        payment_status: "Paid",
        payment_reference: "VERIFY-DUPLICATE-REFERENCE",
        proof_image_url: "/uploads/payment-proofs/verify.jpg",
      },
    );
    response = await postJson(port, "/api/orders", onsitePayload);
    assert.equal(response.status, 200);
    record("unique payment reference first use", response);
    response = await postJson(port, "/api/orders", onsitePayload);
    assert.equal(response.status, 409);
    record("duplicate payment reference", response);

    response = await postJson(port, "/api/orders", cashPayload(
      [{ product_id: 1, qty: 1 }],
      { payment_method: "invalid-test-method" },
    ));
    // This is legacy behavior: cashier-side non-cash methods are accepted as
    // paid. The performance change deliberately does not redefine that rule.
    assert.equal(response.status, 200);
    record("legacy unknown payment method behavior", response);

    assert.equal(payMongoRequests, 0, "cashier orders unexpectedly called PayMongo");
    console.log(JSON.stringify({
      database: databaseName,
      repeatedStartup: "pass",
      schemaAndUniqueIndex: "pass",
      payMongoRequests,
      results,
      rollback: "no partial rows or stock mutations",
    }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  }
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(dropDatabase);
