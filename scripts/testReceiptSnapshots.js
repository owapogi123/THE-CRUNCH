const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "receipt-snapshot-test-only-secret";
const databaseName = `the_crunch_receipt_verify_${Date.now()}_${process.pid}`;
process.env.DB_NAME = databaseName;

function serverConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306),
    ...(process.env.DB_SSL_CA_PATH ? { ssl: {
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA_PATH), "utf8"),
      rejectUnauthorized: true,
    } } : {}),
  };
}

async function dropDatabase() {
  if (!/^the_crunch_receipt_verify_\d+_\d+$/.test(databaseName)) {
    throw new Error(`Refusing to drop unexpected database ${databaseName}`);
  }
  const connection = await mysql.createConnection(serverConfig());
  try {
    const [rows] = await connection.query("SHOW DATABASES LIKE ?", [databaseName]);
    if (rows.length) await connection.query(`DROP DATABASE \`${databaseName}\``);
  } finally {
    await connection.end();
  }
}

function requestJson(port, method, route, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: route,
      method,
      headers: {
        ...(payload ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

function cashPayload(overrides = {}) {
  return {
    items: [{ product_id: 1, qty: 2, note: "No onions" }],
    total: 99999,
    order_type: "dine-in",
    payment_method: "cash",
    customer_type: "PWD",
    discount_name: "PWD",
    cashierId: 1,
    table_id: 7,
    table_number: 12,
    cash_tendered: 250,
    change_amount: 99999,
    order_note: "Serve together",
    customerUserId: 101,
    ...overrides,
  };
}

async function main() {
  const { setup } = require("../src/db/setup");
  await setup({ log: { log() {}, error: console.error } });
  await setup({ log: { log() {}, error: console.error } });
  const db = require("../src/config/db");
  const { ensureProductSchema } = require("../src/services/productSchemaService");
  const { initializeStockManagerSchema } = require("../src/services/stockManagerSchemaService");
  await ensureProductSchema(db);
  await initializeStockManagerSchema(db);

  await db.query("INSERT INTO Admin (Admin_ID, UserName, Email, Password) VALUES (1, 'Receipt Admin', 'receipt-admin@example.invalid', 'unused')");
  await db.query("INSERT INTO users (id, username, email, password_hash, role, email_verified) VALUES (1, 'receipt-admin', 'receipt-user@example.invalid', 'unused', 'administrator', 1)");
  await db.query("INSERT INTO users (id, username, email, password_hash, role, email_verified) VALUES (101, 'receipt-customer', 'receipt-customer@example.invalid', 'unused', 'customer', 1)");
  await db.query("INSERT INTO Cashier (Cashier_ID, UserName, Password) VALUES (1, 'receipt-admin', 'unused')");
  await db.query(
    `INSERT INTO system_settings (setting_key, settings_json)
     VALUES ('restaurant_settings', ?)
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
    [JSON.stringify({
      restaurantName: "The Crunch", tagline: "Snapshot test",
      email: "original@example.invalid", phone: "1234",
      address: "Original Address", currency: "PHP", timezone: "Asia/Manila",
      taxRate: "12", serviceCharge: "5",
    })],
  );
  await db.query("INSERT INTO Menu (Product_ID, Product_Name, Price, Availability, Stock, manual_override, manual_status) VALUES (1, 'Burger', 100, TRUE, 20, 0, 'Available')");
  await db.query("INSERT INTO products (id, name, price, quantity, item_type) VALUES (1, 'Burger', 100, 20, 'menu_item')");
  await db.query("INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased) VALUES (1, 20, 20, 'Burger')");

  const app = require("../src/app");
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const port = server.address().port;
  const secret = process.env.JWT_SECRET;
  const adminToken = jwt.sign(
    { id: 1, userId: 1, role: "administrator", username: "receipt-admin" },
    secret,
    { expiresIn: "10m" },
  );
  const cookToken = jwt.sign(
    { id: 2, userId: 2, role: "cook", username: "receipt-cook" },
    secret,
    { expiresIn: "10m" },
  );
  const {
    subscribe,
  } = require("../src/services/applicationEvents");
  const staffEvents = [];
  const customerEvents = [];
  const unrelatedCustomerEvents = [];
  const unsubscribeEvents = [
    subscribe({ audience: "staff", onEvent: (event) => staffEvents.push(event) }),
    subscribe({ audience: "customer", userId: 101, onEvent: (event) => customerEvents.push(event) }),
    subscribe({ audience: "customer", userId: 202, onEvent: (event) => unrelatedCustomerEvents.push(event) }),
  ];

  try {
    const cash = await requestJson(port, "POST", "/api/orders", cashPayload());
    assert.equal(cash.status, 200);
    assert.equal(cash.body.id, cash.body.orderId);
    assert.equal(cash.body.orderNumber, "#1000");
    assert.match(cash.body.transactionId, /^100\d{6}001$/);
    assert.equal(cash.body.receipt.transactionId, cash.body.transactionId);
    assert.equal(cash.body.receipt.orderNumber, "#1000");
    assert.deepEqual(cash.body.receipt.items[0], {
      productName: "Burger", quantity: 2, unitPrice: 100,
      subtotal: 200, note: "No onions",
    });
    assert.equal(cash.body.receipt.subtotal, 200);
    assert.deepEqual(cash.body.receipt.discount, { name: "PWD", rate: 20, amount: 40 });
    assert.deepEqual(cash.body.receipt.tax, { rate: 12, amount: 24 });
    assert.deepEqual(cash.body.receipt.serviceCharge, { rate: 5, amount: 10 });
    assert.equal(cash.body.receipt.total, 194);
    assert.equal(cash.body.receipt.amountPaid, 194);
    assert.equal(cash.body.receipt.cashTendered, 250);
    assert.equal(cash.body.receipt.change, 56);
    assert.equal(cash.body.receipt.tableNumber, "12");
    assert.equal(cash.body.receipt.orderNote, "Serve together");
    assert.equal(cash.body.receipt.currency, "PHP");
    assert.equal(cash.body.receipt.isLegacyReceipt, false);
    assert.deepEqual(
      staffEvents.map((event) => event.topic),
      ["orders.changed", "payments.changed", "inventory.changed"],
    );
    assert.deepEqual(customerEvents.map((event) => event.topic), ["orders.changed"]);
    assert.equal(unrelatedCustomerEvents.length, 0);

    const receiptRoute = `/api/orders/${cash.body.orderId}/receipt`;
    assert.equal((await requestJson(port, "GET", receiptRoute)).status, 401);
    assert.equal((await requestJson(port, "GET", receiptRoute, undefined, cookToken)).status, 403);
    const originalReceiptResponse = await requestJson(port, "GET", receiptRoute, undefined, adminToken);
    assert.equal(originalReceiptResponse.status, 200);
    const originalReceipt = originalReceiptResponse.body;

    const onsite = await requestJson(port, "POST", "/api/orders", cashPayload({
      items: [{ product_id: 1, qty: 1 }],
      payment_method: "gcash_onsite", payment_status: "Paid",
      payment_reference: "RECEIPT-GCASH-1",
      proof_image_url: "/uploads/payment-proofs/receipt-test.jpg",
      customer_type: "Regular customer", discount_name: "Regular customer",
      table_id: null, table_number: undefined, cash_tendered: undefined,
      change_amount: undefined, order_note: undefined,
    }));
    assert.equal(onsite.status, 200);
    assert.equal(onsite.body.orderNumber, "#1001");
    assert.equal(onsite.body.receipt.paymentMethod, "Onsite GCash / E-Payment");
    assert.equal(onsite.body.receipt.cashTendered, null);
    assert.equal(onsite.body.receipt.change, null);
    assert.equal("proofImageUrl" in onsite.body.receipt, false);

    const [beforeFailureRows] = await db.query(
      `SELECT (SELECT COUNT(*) FROM orders) AS ordersCount,
              (SELECT COUNT(*) FROM order_item) AS orderItemsCount,
              (SELECT COUNT(*) FROM payments) AS paymentsCount,
              (SELECT COUNT(*) FROM receipt_snapshots) AS snapshotsCount,
              (SELECT COUNT(*) FROM receipt_snapshot_items) AS snapshotItemsCount`,
    );
    const [[beforeFailureStock]] = await db.query("SELECT Stock FROM Inventory WHERE Product_ID = 1");
    const eventCountsBeforeFailure = [
      staffEvents.length,
      customerEvents.length,
      unrelatedCustomerEvents.length,
    ];
    await db.query("CREATE TRIGGER fail_receipt_snapshot_item BEFORE INSERT ON receipt_snapshot_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced receipt rollback'");
    const failed = await requestJson(port, "POST", "/api/orders", cashPayload({
      items: [{ product_id: 1, qty: 1 }], customer_type: "Regular customer",
      discount_name: "Regular customer", cash_tendered: 120,
    }));
    assert.equal(failed.status, 500);
    await db.query("DROP TRIGGER fail_receipt_snapshot_item");
    const [afterFailureRows] = await db.query(
      `SELECT (SELECT COUNT(*) FROM orders) AS ordersCount,
              (SELECT COUNT(*) FROM order_item) AS orderItemsCount,
              (SELECT COUNT(*) FROM payments) AS paymentsCount,
              (SELECT COUNT(*) FROM receipt_snapshots) AS snapshotsCount,
              (SELECT COUNT(*) FROM receipt_snapshot_items) AS snapshotItemsCount`,
    );
    assert.deepEqual(afterFailureRows[0], beforeFailureRows[0]);
    const [[afterFailureStock]] = await db.query("SELECT Stock FROM Inventory WHERE Product_ID = 1");
    assert.equal(Number(afterFailureStock.Stock), Number(beforeFailureStock.Stock));
    assert.deepEqual(
      [staffEvents.length, customerEvents.length, unrelatedCustomerEvents.length],
      eventCountsBeforeFailure,
      "rolled-back order creation must not emit an invalidation",
    );

    const afterRollback = await requestJson(port, "POST", "/api/orders", cashPayload({
      items: [{ product_id: 1, qty: 1 }], customer_type: "Regular customer",
      discount_name: "Regular customer", cash_tendered: 120,
    }));
    assert.equal(afterRollback.status, 200);
    assert.equal(afterRollback.body.orderNumber, "#1002");
    assert.match(afterRollback.body.transactionId, /^100\d{6}003$/);

    const pendingPayment = await requestJson(port, "POST", "/api/orders", cashPayload({
      items: [{ product_id: 1, qty: 1 }],
      payment_method: "card",
      payment_status: "Pending",
      customer_type: "Regular customer",
      discount_name: "Regular customer",
      cash_tendered: undefined,
    }));
    assert.equal(pendingPayment.status, 200);
    const eventsBeforePaymentConfirmation = staffEvents.length;
    const paymentConfirmation = await requestJson(
      port,
      "PATCH",
      `/api/orders/${pendingPayment.body.orderId}`,
      { payment_status: "Paid", cashierId: 1 },
      adminToken,
    );
    assert.equal(paymentConfirmation.status, 200);
    assert.deepEqual(
      staffEvents.slice(eventsBeforePaymentConfirmation).map((event) => event.topic),
      ["orders.changed", "payments.changed", "inventory.changed"],
    );
    assert.equal(staffEvents.at(-3)?.reason, "order.payment_updated");

    const pendingCancellation = await requestJson(port, "POST", "/api/orders", cashPayload({
      items: [{ product_id: 1, qty: 1 }],
      payment_method: "card",
      payment_status: "Pending",
      customer_type: "Regular customer",
      discount_name: "Regular customer",
      cash_tendered: undefined,
    }));
    assert.equal(pendingCancellation.status, 200);
    const eventsBeforeCancellation = staffEvents.length;
    const cancellation = await requestJson(
      port,
      "PATCH",
      `/api/orders/${pendingCancellation.body.orderId}`,
      { status: "Cancelled", cashierId: 1 },
      adminToken,
    );
    assert.equal(cancellation.status, 200);
    assert.deepEqual(
      staffEvents.slice(eventsBeforeCancellation).map((event) => event.topic),
      ["orders.changed"],
    );
    assert.equal(staffEvents.at(-1)?.reason, "order.cancelled");

    await db.query("UPDATE Menu SET Product_Name = 'Burger Deluxe', Price = 120 WHERE Product_ID = 1");
    await db.query("UPDATE products SET name = 'Burger Deluxe', price = 120 WHERE id = 1");
    const renamed = await requestJson(port, "GET", receiptRoute, undefined, adminToken);
    assert.equal(renamed.body.items[0].productName, "Burger");
    assert.equal(renamed.body.items[0].unitPrice, 100);
    await db.query("DELETE FROM products WHERE id = 1");
    const removed = await requestJson(port, "GET", receiptRoute, undefined, adminToken);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.items[0].productName, "Burger");
    assert.equal(removed.body.items[0].unitPrice, 100);

    const [legacyOrder] = await db.query("INSERT INTO orders (Total_Amount, Cashier_ID, Order_Type, Status, payment_status, payment_method) VALUES (100, 1, 'dine-in', 'Completed', 'Paid', 'Cash')");
    await db.query("INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal) VALUES (?, 1, 1, 100)", [legacyOrder.insertId]);
    const legacy = await requestJson(port, "GET", `/api/orders/${legacyOrder.insertId}/receipt`, undefined, adminToken);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.isLegacyReceipt, true);
    assert.equal(legacy.body.transactionId, null);
    assert.equal(legacy.body.orderNumber, `#${legacyOrder.insertId}`);
    assert.equal(legacy.body.items[0].productName, "Burger Deluxe");
    assert.equal(legacy.body.items[0].unitPrice, 100);
    assert.equal(legacy.body.discount.amount, null);
    assert.equal(legacy.body.tax.amount, null);
    assert.equal(legacy.body.serviceCharge.amount, null);
    assert.equal(legacy.body.cashTendered, null);
    assert.equal(legacy.body.currency, null);
    assert(legacy.body.missingHistoricalFields.includes("discount"));

    const eventsBeforeRefund = staffEvents.length;
    const refund = await requestJson(port, "PATCH", `/api/orders/${cash.body.orderId}`, { status: "Refunded" }, adminToken);
    assert.equal(refund.status, 200);
    const refundedResponse = await requestJson(port, "GET", receiptRoute, undefined, adminToken);
    assert.equal(refundedResponse.status, 200);
    assert.equal(refundedResponse.body.currentStatus, "Refunded");
    for (const field of [
      "transactionId", "orderNumber", "items", "subtotal", "discount", "tax",
      "serviceCharge", "total", "paymentMethod", "amountPaid", "cashTendered", "change",
    ]) assert.deepEqual(refundedResponse.body[field], originalReceipt[field]);
    assert.deepEqual(
      staffEvents.slice(eventsBeforeRefund).map((event) => event.topic),
      ["orders.changed", "payments.changed", "inventory.changed"],
    );
    assert.equal(customerEvents.at(-1)?.reason, "order.refunded");
    assert.equal(unrelatedCustomerEvents.length, 0);

    console.log(JSON.stringify({
      cashReceipt: "pass", onsiteGcashReceiptSeparateFromProof: "pass",
      authorization: "pass", productRenameAndRemoval: "pass",
      legacyReceipt: "pass", refundImmutability: "pass",
      rollbackNoOrphans: "pass", stage1Identifiers: "pass",
      postCommitEvents: "pass", rollbackEmitsNoEvent: "pass",
      refundEvents: "pass", customerEventTargeting: "pass",
      paymentConfirmationEvents: "pass", cancellationEvents: "pass",
    }, null, 2));
  } finally {
    unsubscribeEvents.forEach((unsubscribe) => unsubscribe());
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}).finally(dropDatabase);
