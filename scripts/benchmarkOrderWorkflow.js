const { performance } = require("node:perf_hooks");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "order-workflow-test-only-secret";
const databaseName = `the_crunch_workflow_benchmark_${Date.now()}_${process.pid}`;
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

function summarizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function patchJson(port, token, orderId, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const startedAt = performance.now();
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: `/api/orders/${orderId}`,
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({
          status: response.statusCode,
          body: parsed,
          durationMs: performance.now() - startedAt,
        });
      });
    });
    request.once("error", reject);
    request.end(payload);
  });
}

async function dropDatabase() {
  if (!/^the_crunch_workflow_benchmark_\d+_\d+$/.test(databaseName)) {
    throw new Error(`Refusing to drop unexpected database ${databaseName}`);
  }
  const connection = await mysql.createConnection(serverConfig());
  try {
    const [rows] = await connection.query("SHOW DATABASES LIKE ?", [databaseName]);
    if (rows.length === 1) {
      await connection.query(`DROP DATABASE \`${databaseName}\``);
      console.error(`Dropped disposable workflow benchmark database ${databaseName}`);
    }
  } finally {
    await connection.end();
  }
}

async function main() {
  const { setup } = require("../src/db/setup");
  await setup({ log: { log() {}, error: console.error } });
  const db = require("../src/config/db");
  const { ensureProductSchema } = require("../src/services/productSchemaService");
  const { initializeStockManagerSchema } = require("../src/services/stockManagerSchemaService");
  await ensureProductSchema(db);
  await initializeStockManagerSchema(db);

  await db.query(
    `INSERT INTO Admin (Admin_ID, UserName, Email, Password)
     VALUES (1, 'Workflow Admin', 'workflow-admin@example.invalid', 'unused')`,
  );
  await db.query(
    `INSERT INTO users (id, username, email, password_hash, role, email_verified)
     VALUES (1, 'workflow-admin', 'workflow-user@example.invalid', 'unused', 'administrator', 1)`,
  );
  await db.query(
    `INSERT INTO Cashier (Cashier_ID, UserName, Password)
     VALUES (1, 'workflow-admin', 'unused')`,
  );
  await db.query(
    `INSERT INTO Menu (Product_ID, Product_Name, Price, Stock, manual_override, manual_status)
     VALUES
       (1, 'Workflow Meal', 100, 100, 0, 'Available'),
       (2, 'Workflow Chicken', 10, 10, 0, 'Available'),
       (3, 'Workflow Oil', 10, 5, 0, 'Available')`,
  );
  await db.query(
    `INSERT INTO products (id, name, price, quantity, item_type)
     VALUES
       (1, 'Workflow Meal', 100, 100, 'menu_item'),
       (2, 'Workflow Chicken', 10, 10, 'stock_item'),
       (3, 'Workflow Oil', 10, 5, 'stock_item')`,
  );
  await db.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased, unit)
     VALUES
       (2, 10, 10, 'Workflow Chicken', 'kg'),
       (3, 5, 5, 'Workflow Oil', 'L')`,
  );
  await db.query(
    `INSERT INTO menu_item_ingredients
       (menu_product_id, product_id, quantity_required)
     VALUES
       (1, 2, 0.7),
       (1, 3, 0.15)`,
  );

  const {
    deductPrevalidatedStockForPaidOrder,
    prepareOrderItemsAndStock,
  } = require("../src/services/inventoryService");
  async function createDeductedOrder(quantity) {
    const connection = await db.getConnection();
    let orderId;
    try {
      await connection.beginTransaction();
      const { deductions } = await prepareOrderItemsAndStock(
        connection,
        [{ product_id: 1, qty: quantity }],
      );
      const [orderResult] = await connection.query(
        `INSERT INTO orders
           (Total_Amount, Cashier_ID, Order_Type, Status, payment_status,
            payment_method, stock_deducted, queuedAt)
         VALUES (?, 1, 'dine-in', 'Pending', 'Paid', 'Cash', 0, NOW())`,
        [100 * quantity],
      );
      orderId = orderResult.insertId;
      await connection.query(
        `INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal)
         VALUES (?, 1, ?, ?)`,
        [orderId, quantity, 100 * quantity],
      );
      await deductPrevalidatedStockForPaidOrder(
        orderId,
        "Paid",
        deductions,
        1,
        connection,
      );
      await connection.commit();
      return orderId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function resetDecimalTest(orderId) {
    await db.query("DELETE FROM Stock_Status WHERE Product_ID IN (2, 3)");
    await db.query("DELETE FROM order_item WHERE Order_ID = ?", [orderId]);
    await db.query("DELETE FROM orders WHERE Order_ID = ?", [orderId]);
    await db.query(
      `UPDATE Inventory
       SET Quantity = CASE Product_ID WHEN 2 THEN 10 ELSE 5 END,
           Stock = CASE Product_ID WHEN 2 THEN 10 ELSE 5 END
       WHERE Product_ID IN (2, 3)`,
    );
    await db.query(
      `UPDATE Menu
       SET Stock = CASE Product_ID WHEN 2 THEN 10 ELSE 5 END
       WHERE Product_ID IN (2, 3)`,
    );
    await db.query(
      `UPDATE products
       SET quantity = CASE id WHEN 2 THEN 10 ELSE 5 END
       WHERE id IN (2, 3)`,
    );
  }

  const decimalTestOrderId = await createDeductedOrder(1);

  const [[decimalDeduction]] = await db.query(
    `SELECT
       i.Stock AS inventoryStock,
       m.Stock AS menuStock,
       p.quantity AS productStock,
       (
         SELECT ss.Quantity
         FROM Stock_Status ss
         WHERE ss.Product_ID = 2 AND ss.Type = 'Stock Out'
         ORDER BY ss.Status_ID DESC
         LIMIT 1
       ) AS movementQuantity
     FROM Inventory i
     JOIN Menu m ON m.Product_ID = i.Product_ID
     JOIN products p ON p.id = i.Product_ID
     WHERE i.Product_ID = 2`,
  );
  assert.equal(Number(decimalDeduction.inventoryStock), 9.3);
  assert.equal(Number(decimalDeduction.menuStock), 9.3);
  assert.equal(Number(decimalDeduction.productStock), 9.3);
  assert.equal(Number(decimalDeduction.movementQuantity), 0.7);

  const [[secondIngredientDeduction]] = await db.query(
    `SELECT i.Stock AS inventoryStock, m.Stock AS menuStock,
            p.quantity AS productStock, i.unit
     FROM Inventory i
     JOIN Menu m ON m.Product_ID = i.Product_ID
     JOIN products p ON p.id = i.Product_ID
     WHERE i.Product_ID = 3`,
  );
  assert.equal(Number(secondIngredientDeduction.inventoryStock), 4.85);
  assert.equal(Number(secondIngredientDeduction.menuStock), 4.85);
  assert.equal(Number(secondIngredientDeduction.productStock), 4.85);
  assert.equal(secondIngredientDeduction.unit, "L");
  await resetDecimalTest(decimalTestOrderId);

  const threeConsumptionOrderId = await createDeductedOrder(3);
  const [threeConsumptionRows] = await db.query(
    `SELECT Product_ID AS productId, Stock AS stock, unit
     FROM Inventory
     WHERE Product_ID IN (2, 3)
     ORDER BY Product_ID`,
  );
  assert.equal(Number(threeConsumptionRows[0].stock), 7.9);
  assert.equal(threeConsumptionRows[0].unit, "kg");
  assert.equal(Number(threeConsumptionRows[1].stock), 4.55);
  assert.equal(threeConsumptionRows[1].unit, "L");
  await resetDecimalTest(threeConsumptionOrderId);

  const rollbackConnection = await db.getConnection();
  let rollbackVerified = false;
  try {
    await rollbackConnection.beginTransaction();
    await prepareOrderItemsAndStock(
      rollbackConnection,
      [{ product_id: 1, qty: 100 }],
    );
    throw new Error("Expected insufficient stock validation to fail");
  } catch (error) {
    await rollbackConnection.rollback();
    assert.match(String(error.message), /Insufficient stock/i);
    rollbackVerified = true;
  } finally {
    rollbackConnection.release();
  }
  const [postRollbackRows] = await db.query(
    `SELECT Product_ID AS productId, Stock AS stock
     FROM Inventory
     WHERE Product_ID IN (2, 3)
     ORDER BY Product_ID`,
  );
  assert.deepEqual(postRollbackRows.map((row) => Number(row.stock)), [10, 5]);

  async function seedOrder(status, prepared, ready = false, paymentStatus = "Paid") {
    const [result] = await db.query(
      `INSERT INTO orders
         (Total_Amount, Cashier_ID, Order_Type, Status, payment_status,
          payment_method, stock_deducted, queuedAt, prepStartedAt, startedAt, readyAt)
       VALUES (100, 1, 'dine-in', ?, ?, 'Cash', 1, NOW(),
               ${prepared ? "NOW()" : "NULL"}, ${prepared ? "NOW()" : "NULL"},
               ${ready ? "NOW()" : "NULL"})`,
      [status, paymentStatus],
    );
    await db.query(
      `INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal)
       VALUES (?, 1, 1, 100)`,
      [result.insertId],
    );
    await db.query(
      `INSERT INTO payments (Order_ID, Payment_Type, Payment_Status, ProcessBy)
       VALUES (?, 'Cash', ?, 1)`,
      [result.insertId, paymentStatus === "Paid" ? "Completed" : "Pending"],
    );
    return result.insertId;
  }

  const orderIds = {
    coldStart: await seedOrder("Pending", false),
    warmStart: await seedOrder("Pending", false),
    complete: await seedOrder("Preparing", true),
    queuedRefund: await seedOrder("Pending", false),
    preparedRefund: await seedOrder("Preparing", true),
    readyRefund: await seedOrder("Ready for Pickup", true, true),
    completedRefund: await seedOrder("Completed", true, true),
    cancellation: await seedOrder("Pending", false, false, "Pending"),
  };

  const originalPoolQuery = db.query.bind(db);
  const originalGetConnection = db.getConnection.bind(db);
  let currentStatements = null;
  db.query = async (...args) => {
    const startedAt = performance.now();
    try {
      return await originalPoolQuery(...args);
    } finally {
      if (currentStatements) currentStatements.push({
        sql: summarizeSql(args[0]),
        durationMs: performance.now() - startedAt,
        source: "pool",
      });
    }
  };
  db.getConnection = async () => {
    const connection = await originalGetConnection();
    for (const method of ["query", "beginTransaction", "commit", "rollback"]) {
      const raw = connection[method].bind(connection);
      connection[method] = async (...args) => {
        const startedAt = performance.now();
        try {
          return await raw(...args);
        } finally {
          if (currentStatements) currentStatements.push({
            sql: method === "query" ? summarizeSql(args[0]) : method.toUpperCase(),
            durationMs: performance.now() - startedAt,
            source: "transaction",
          });
        }
      };
    }
    return connection;
  };

  const app = require("../src/app");
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const port = server.address().port;
  const token = jwt.sign(
    { id: 1, userId: 1, role: "administrator", username: "workflow-admin" },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );
  const workflowEvents = [];
  const { subscribe } = require("../src/services/applicationEvents");
  const unsubscribeEvents = subscribe({
    audience: "staff",
    onEvent: (event) => workflowEvents.push(event),
  });

  async function measure(name, requests) {
    currentStatements = [];
    const startedAt = performance.now();
    const responses = [];
    for (const request of requests) {
      responses.push(await patchJson(port, token, request.orderId, request.body));
    }
    const durationMs = performance.now() - startedAt;
    const statements = currentStatements;
    currentStatements = null;
    for (const response of responses) {
      if (response.status !== 200) {
        throw new Error(`${name} failed: ${response.status} ${JSON.stringify(response.body)}`);
      }
    }
    return {
      name,
      durationMs: Number(durationMs.toFixed(1)),
      requestDurationsMs: responses.map((response) => Number(response.durationMs.toFixed(1))),
      responseBodies: responses.map((response) => response.body),
      statementCount: statements.length,
      dbTimeMs: Number(statements.reduce((sum, item) => sum + item.durationMs, 0).toFixed(1)),
      slowest: statements.reduce(
        (slowest, item) => !slowest || item.durationMs > slowest.durationMs ? item : slowest,
        null,
      ),
      statements: statements.map((item) => ({
        ...item,
        durationMs: Number(item.durationMs.toFixed(1)),
      })),
    };
  }

  try {
    const results = [];
    results.push(await measure("Start Order (first action)", [
      { orderId: orderIds.coldStart, body: { status: "preparing" } },
    ]));
    results.push(await measure("Start Order (warm)", [
      { orderId: orderIds.warmStart, body: { status: "preparing" } },
    ]));
    results.push(await measure("Complete Order (dine-in, atomic PATCH)", [
      {
        orderId: orderIds.complete,
        body: { status: "Completed", completeFromPreparing: true },
      },
    ]));
    results.push(await measure("Refund before Start", [
      { orderId: orderIds.queuedRefund, body: { status: "Refunded" } },
    ]));
    results.push(await measure("Refund after Start", [
      { orderId: orderIds.preparedRefund, body: { status: "Refunded" } },
    ]));
    results.push(await measure("Refund from Ready", [
      { orderId: orderIds.readyRefund, body: { status: "Refunded" } },
    ]));
    results.push(await measure("Refund from Completed", [
      { orderId: orderIds.completedRefund, body: { status: "Refunded" } },
    ]));
    results.push(await measure("Cancel queued order", [
      { orderId: orderIds.cancellation, body: { status: "Cancelled" } },
    ]));
    assert.equal(results[7].responseBodies[0].status, "Cancelled");

    const [[refundState]] = await db.query(
      `SELECT
         i.Stock AS inventoryStock,
         m.Stock AS menuStock,
         p.quantity AS productStock,
         (SELECT stock_deducted FROM orders WHERE Order_ID = ?) AS queuedRefundDeducted,
         (SELECT stock_deducted FROM orders WHERE Order_ID = ?) AS preparedRefundDeducted,
         (SELECT stock_deducted FROM orders WHERE Order_ID = ?) AS readyRefundDeducted,
         (SELECT stock_deducted FROM orders WHERE Order_ID = ?) AS completedRefundDeducted,
         (
           SELECT COUNT(*)
           FROM Stock_Status ss
           WHERE ss.Product_ID = 2
             AND ss.Type = 'Stock In'
             AND ss.Quantity = 0.7
         ) AS fractionalRestorationCount
       FROM Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
       WHERE i.Product_ID = 2`,
      [
        orderIds.queuedRefund,
        orderIds.preparedRefund,
        orderIds.readyRefund,
        orderIds.completedRefund,
      ],
    );
    assert.equal(results[3].responseBodies[0].inventoryRestored, true);
    assert.equal(results[4].responseBodies[0].inventoryRestored, false);
    assert.equal(results[5].responseBodies[0].inventoryRestored, false);
    assert.equal(results[6].responseBodies[0].inventoryRestored, false);
    assert.equal(Number(refundState.inventoryStock), 10.7);
    assert.equal(Number(refundState.menuStock), 10.7);
    assert.equal(Number(refundState.productStock), 10.7);
    assert.equal(Number(refundState.queuedRefundDeducted), 0);
    assert.equal(Number(refundState.preparedRefundDeducted), 1);
    assert.equal(Number(refundState.readyRefundDeducted), 1);
    assert.equal(Number(refundState.completedRefundDeducted), 1);
    assert.equal(Number(refundState.fractionalRestorationCount), 1);

    const [[secondIngredientRefundState]] = await db.query(
      `SELECT i.Stock AS inventoryStock, m.Stock AS menuStock,
              p.quantity AS productStock,
              (
                SELECT COUNT(*)
                FROM Stock_Status ss
                WHERE ss.Product_ID = 3
                  AND ss.Type = 'Stock In'
                  AND ss.Quantity = 0.15
              ) AS fractionalRestorationCount
       FROM Inventory i
       JOIN Menu m ON m.Product_ID = i.Product_ID
       JOIN products p ON p.id = i.Product_ID
       WHERE i.Product_ID = 3`,
    );
    assert.equal(Number(secondIngredientRefundState.inventoryStock), 5.15);
    assert.equal(Number(secondIngredientRefundState.menuStock), 5.15);
    assert.equal(Number(secondIngredientRefundState.productStock), 5.15);
    assert.equal(Number(secondIngredientRefundState.fractionalRestorationCount), 1);

    const [decimalColumns] = await db.query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND (
           (TABLE_NAME = 'Inventory' AND COLUMN_NAME IN ('Quantity', 'Stock'))
           OR (TABLE_NAME = 'Menu' AND COLUMN_NAME = 'Stock')
           OR (TABLE_NAME = 'products' AND COLUMN_NAME = 'quantity')
           OR (TABLE_NAME = 'Stock_Status' AND COLUMN_NAME = 'Quantity')
           OR (TABLE_NAME = 'menu_item_ingredients' AND COLUMN_NAME = 'quantity_required')
         )`,
    );
    assert.equal(decimalColumns.length, 6);
    assert.ok(decimalColumns.every((column) => column.columnType === "decimal(14,4)"));
    assert.equal(
      workflowEvents.filter((event) => event.topic === "orders.changed").length,
      8,
    );
    assert.equal(
      workflowEvents.filter((event) => event.topic === "payments.changed").length,
      5,
    );
    assert.equal(
      workflowEvents.filter((event) => event.topic === "inventory.changed").length,
      1,
    );
    assert(workflowEvents.some((event) => event.reason === "order.status_updated"));
    assert(workflowEvents.some((event) => event.reason === "order.refunded"));
    assert(workflowEvents.some((event) => event.reason === "order.cancelled"));

    console.log(JSON.stringify({
      databaseName,
      verification: {
        fractionalDeduction: decimalDeduction,
        secondIngredientDeduction,
        threeConsumptions: threeConsumptionRows,
        rollbackVerified,
        refundState,
        secondIngredientRefundState,
        decimalColumns,
        eventCoverage: {
          orderEvents: 8,
          paymentEvents: 5,
          inventoryEvents: 1,
          reasons: [...new Set(workflowEvents.map((event) => event.reason))],
        },
      },
      results,
    }, null, 2));
  } finally {
    unsubscribeEvents();
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
