"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const {
  REDESIGNED_EXPECTED_TABLES,
  verifyRedesignedSchemaCompatibility,
} = require("../services/redesignedSchemaCompatibilityService");

const TEST_ENV_PATH = path.resolve(__dirname, "../../.env.test.local");
const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = 3306;
const EXPECTED_DATABASE = "the_crunch_integration_test";
const EXPECTED_USER = "the_crunch_test_runner";
const ALLOWED_TABLES = new Set(REDESIGNED_EXPECTED_TABLES);
const TEST_REFUND_PASSWORD = "LocalRefund#Only2026";

function loadConfig() {
  assert.ok(fs.existsSync(TEST_ENV_PATH), ".env.test.local is required");
  const parsed = dotenv.parse(fs.readFileSync(TEST_ENV_PATH));
  const config = {
    host: String(parsed.INTEGRATION_DB_HOST || "").trim(),
    port: Number(parsed.INTEGRATION_DB_PORT),
    database: String(parsed.INTEGRATION_DB_NAME || "").trim(),
    user: String(parsed.INTEGRATION_DB_USER || "").trim(),
    password: String(parsed.INTEGRATION_DB_PASSWORD || ""),
  };
  assert.equal(config.host, EXPECTED_HOST);
  assert.equal(config.port, EXPECTED_PORT);
  assert.equal(config.database, EXPECTED_DATABASE);
  assert.equal(config.user, EXPECTED_USER);
  assert.ok(config.password);
  return config;
}

function tableName(row) {
  return String(Object.values(row)[0] || "").toLowerCase();
}

async function assertIsolation(connection) {
  const [[identity]] = await connection.query(
    `SELECT CURRENT_USER() AS currentUser, DATABASE() AS databaseName,
            @@port AS port, @@read_only AS readOnly`,
  );
  assert.equal(identity.databaseName, EXPECTED_DATABASE);
  assert.equal(Number(identity.port), EXPECTED_PORT);
  assert.equal(Number(identity.readOnly), 0);
  assert.match(
    String(identity.currentUser).toLowerCase(),
    /^the_crunch_test_runner@(localhost|127\.0\.0\.1)$/,
  );

  const [grants] = await connection.query("SHOW GRANTS");
  for (const row of grants) {
    const grant = String(Object.values(row)[0] || "");
    assert.doesNotMatch(grant, /WITH GRANT OPTION/i);
    if (/\bON\b/i.test(grant) && !/^GRANT USAGE ON \*\.\*/i.test(grant)) {
      assert.match(grant, new RegExp("ON `" + EXPECTED_DATABASE + "`\\.\\*", "i"));
    }
  }

  const [databases] = await connection.query("SHOW DATABASES");
  const allowed = new Set([
    EXPECTED_DATABASE,
    "information_schema",
    "performance_schema",
    "sys",
  ]);
  assert.deepEqual(
    databases
      .map((row) => String(Object.values(row)[0] || "").toLowerCase())
      .filter((name) => !allowed.has(name)),
    [],
    "The disposable user can see an unexpected database",
  );
}

async function clearDisposableDatabase(connection) {
  const [tables] = await connection.query("SHOW TABLES");
  const names = tables.map(tableName);
  assert.deepEqual(
    names.filter((name) => !ALLOWED_TABLES.has(name)),
    [],
    "Disposable database contains unexpected tables; refusing cleanup",
  );
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const name of names) {
      assert.match(name, /^[a-z0-9_]+$/);
      await connection.query(`DROP TABLE IF EXISTS \`${name}\``);
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

function captureResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    response: {
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    },
  };
}

function finalHandler(router, routePath, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${routePath} route is missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(handler, request = {}) {
  const capture = captureResponse();
  await handler(
    {
      body: {},
      params: {},
      query: {},
      headers: {},
      ...request,
    },
    capture.response,
  );
  return capture.result;
}

async function scalar(connection, sql, params = []) {
  const [[row]] = await connection.query(sql, params);
  return Number(Object.values(row)[0]);
}

async function seedUser(connection, role, suffix) {
  const passwordHash = await bcrypt.hash(`Local#${role}#${suffix}`, 4);
  const [result] = await connection.query(
    `INSERT INTO users
       (username, email, password_hash, role, email_verified, is_active)
     VALUES (?, ?, ?, ?, 1, 1)`,
    [
      `${role}_${suffix}`,
      `${role}-${suffix}@example.test`,
      passwordHash,
      role,
    ],
  );
  return Number(result.insertId);
}

async function seedCatalog(connection) {
  const [[menuFood]] = await connection.query(
    "SELECT category_id FROM menu_categories WHERE system_key = 'menu_food'",
  );
  const [[flavors]] = await connection.query(
    "SELECT category_id FROM menu_categories WHERE system_key = 'chicken_flavors'",
  );
  const [[rawMaterials]] = await connection.query(
    "SELECT category_id FROM inventory_categories WHERE system_key = 'raw_materials'",
  );
  const [[kilogram]] = await connection.query(
    "SELECT unit_id FROM units WHERE system_key = 'kilogram'",
  );

  const [ingredientResult] = await connection.query(
    `INSERT INTO products
       (name, product_type, inventory_category_id, unit_id,
        lifecycle_status, availability_override, tracking_method)
     VALUES ('Integration Chicken', 'stock_item', ?, ?, 'active', 'auto', 'none')`,
    [rawMaterials.category_id, kilogram.unit_id],
  );
  const ingredientId = Number(ingredientResult.insertId);
  const [mealResult] = await connection.query(
    `INSERT INTO products
       (name, product_type, menu_category_id, selling_price,
        lifecycle_status, availability_override)
     VALUES ('Integration 1PCS Meal', 'menu_item', ?, 100.00, 'active', 'auto')`,
    [menuFood.category_id],
  );
  const mealId = Number(mealResult.insertId);
  const [flavorResult] = await connection.query(
    `INSERT INTO products
       (name, product_type, menu_category_id, selling_price,
        lifecycle_status, availability_override)
     VALUES ('Integration Flavor', 'selection_option', ?, NULL, 'active', 'auto')`,
    [flavors.category_id],
  );
  const flavorId = Number(flavorResult.insertId);

  await connection.query(
    `INSERT INTO product_recipes
       (parent_product_id, ingredient_product_id, quantity_required, unit_id)
     VALUES (?, ?, 1.5000, ?)`,
    [mealId, ingredientId, kilogram.unit_id],
  );
  await connection.query(
    `INSERT INTO inventory_balances
       (product_id, on_hand, reorder_point, critical_point)
     VALUES (?, 20.0000, 5.0000, 2.0000)`,
    [ingredientId],
  );
  const [batchResult] = await connection.query(
    `INSERT INTO inventory_batches
       (product_id, received_quantity, remaining_quantity, returned_quantity,
        unit_id, received_at, status, notes)
     VALUES (?, 20.0000, 20.0000, 0, ?, NOW(), 'active', 'isolated opening stock')`,
    [ingredientId, kilogram.unit_id],
  );
  await connection.query(
    `INSERT INTO stock_movements
       (product_id, batch_id, movement_type, signed_quantity, unit_id,
        source_type, source_id, idempotency_key, note)
     VALUES (?, ?, 'opening_balance', 20.0000, ?, 'integration_test',
             'opening', 'integration:opening:chicken', 'isolated opening stock')`,
    [ingredientId, batchResult.insertId, kilogram.unit_id],
  );
  return { ingredientId, mealId, flavorId, unitId: Number(kilogram.unit_id) };
}

async function orderState(connection, orderId) {
  const [[row]] = await connection.query(
    `SELECT status, payment_status AS paymentStatus, stock_deducted AS stockDeducted
       FROM orders WHERE order_id = ?`,
    [orderId],
  );
  return {
    status: row.status,
    paymentStatus: row.paymentStatus,
    stockDeducted: Number(row.stockDeducted),
  };
}

async function inventoryState(connection, ingredientId) {
  const [[row]] = await connection.query(
    `SELECT
       balance.on_hand AS onHand,
       COALESCE((SELECT SUM(batch.remaining_quantity)
                   FROM inventory_batches batch
                  WHERE batch.product_id = balance.product_id), 0) AS batchRemaining,
       COALESCE((SELECT SUM(movement.signed_quantity)
                   FROM stock_movements movement
                  WHERE movement.product_id = balance.product_id), 0) AS ledgerTotal
     FROM inventory_balances balance
     WHERE balance.product_id = ?`,
    [ingredientId],
  );
  return {
    onHand: Number(row.onHand),
    batchRemaining: Number(row.batchRemaining),
    ledgerTotal: Number(row.ledgerTotal),
  };
}

async function advanceToReady(updateHandler, orderId, actor) {
  const preparing = await invoke(updateHandler, {
    params: { id: String(orderId) },
    user: actor,
    body: { status: "Preparing" },
  });
  assert.equal(preparing.statusCode, 200, JSON.stringify(preparing.body));
  const ready = await invoke(updateHandler, {
    params: { id: String(orderId) },
    user: actor,
    body: { status: "Ready for Pickup" },
  });
  assert.equal(ready.statusCode, 200, JSON.stringify(ready.body));
}

(async () => {
  const config = loadConfig();
  const control = await mysql.createConnection({ ...config, multipleStatements: false });
  let applicationDb = null;
  try {
    await assertIsolation(control);
    await clearDisposableDatabase(control);

    const environment = {
      ...process.env,
      DB_HOST: config.host,
      DB_PORT: String(config.port),
      DB_NAME: config.database,
      DB_USER: config.user,
      DB_PASSWORD: config.password,
      DB_SCHEMA_PROFILE: "redesigned",
      BOOTSTRAP_ADMIN_USERNAME: "integration_admin",
      BOOTSTRAP_ADMIN_EMAIL: "integration-admin@example.test",
      BOOTSTRAP_ADMIN_PASSWORD: "LocalOnly#Bootstrap2026",
      REFUND_AUTH_CODE: TEST_REFUND_PASSWORD,
    };
    Object.assign(process.env, environment);

    const { migrate } = require("./migrate");
    await migrate({
      connection: control,
      env: environment,
      profile: "redesigned",
      log: { log() {}, error() {} },
    });
    const compatibility = await verifyRedesignedSchemaCompatibility(
      control,
      config.database,
    );
    assert.equal(compatibility.tableCount, REDESIGNED_EXPECTED_TABLES.length);

    const cashierId = await seedUser(control, "cashier", "one");
    const secondCashierId = await seedUser(control, "cashier", "two");
    const inventoryManagerId = await seedUser(control, "inventory_manager", "one");
    const customerId = await seedUser(control, "customer", "one");
    const catalog = await seedCatalog(control);

    const emailServiceId = require.resolve("../services/emailService");
    require.cache[emailServiceId] = {
      id: emailServiceId,
      filename: emailServiceId,
      loaded: true,
      exports: { async sendCustomerOrderReceiptEmail() {} },
    };
    applicationDb = require("../config/db");
    const orderRouter = require("../routes/orderRoutes");
    const refundRouter = require("../routes/refundRequestRoutes");
    const {
      executeRedesignedInventoryMutation,
    } = require("../services/redesignedInventoryMutationService");
    const {
      finalizePayMongoCheckoutIntent,
    } = require("../services/paymongoOrderFinalizationService");

    const createOrder = finalHandler(orderRouter, "/", "post");
    const updateOrder = finalHandler(orderRouter, "/:id", "patch");
    const queueOrders = finalHandler(orderRouter, "/queue", "get");
    const customerOrders = finalHandler(
      orderRouter,
      "/customer/:customerUserId",
      "get",
    );
    const shiftOrders = finalHandler(orderRouter, "/shift", "get");
    const loadReceipt = finalHandler(orderRouter, "/:id/receipt", "get");
    const createRefundRequest = finalHandler(refundRouter, "/", "post");

    const cashierActor = { userId: cashierId, role: "cashier" };
    const secondCashierActor = { userId: secondCashierId, role: "cashier" };
    const customerActor = { userId: customerId, role: "customer" };
    const inventoryActor = {
      userId: inventoryManagerId,
      role: "inventory_manager",
    };
    const orderItems = [{
      product_id: catalog.mealId,
      qty: 2,
      selected_flavor_product_id: catalog.flavorId,
      note: "Integration note",
    }];

    const created = await invoke(createOrder, {
      user: cashierActor,
      body: {
        items: orderItems,
        order_type: "dine-in",
        payment_method: "cash",
        cash_tendered: 200,
      },
    });
    assert.equal(created.statusCode, 200, JSON.stringify(created.body));
    const firstOrderId = Number(created.body.orderId);
    assert.deepEqual(await inventoryState(control, catalog.ingredientId), {
      onHand: 20,
      batchRemaining: 20,
      ledgerTotal: 20,
    });
    assert.deepEqual(await orderState(control, firstOrderId), {
      status: "Pending",
      paymentStatus: "Paid",
      stockDeducted: 0,
    });
    const [[persistedItem]] = await control.query(
      `SELECT selected_option_product_id AS flavorId,
              selected_option_name_snapshot AS flavorName,
              item_note AS itemNote
         FROM order_items WHERE order_id = ?`,
      [firstOrderId],
    );
    assert.equal(Number(persistedItem.flavorId), catalog.flavorId);
    assert.equal(persistedItem.flavorName, "Integration Flavor");
    assert.equal(persistedItem.itemNote, "Integration note");
    assert.equal(
      await scalar(
        control,
        "SELECT COUNT(*) FROM inventory_balances WHERE product_id = ?",
        [catalog.flavorId],
      ),
      0,
    );

    const queuedBeforePreparation = await invoke(queueOrders);
    assert.equal(queuedBeforePreparation.statusCode, 200);
    assert.ok(
      queuedBeforePreparation.body.some(
        (order) => Number(order.id) === firstOrderId &&
          order.items[0].selectedFlavorName === "Integration Flavor",
      ),
    );

    const preparing = await invoke(updateOrder, {
      params: { id: String(firstOrderId) },
      user: cashierActor,
      body: { status: "Preparing" },
    });
    assert.equal(preparing.statusCode, 200, JSON.stringify(preparing.body));
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 20);
    const ready = await invoke(updateOrder, {
      params: { id: String(firstOrderId) },
      user: cashierActor,
      body: { status: "Ready for Pickup" },
    });
    assert.equal(ready.statusCode, 200, JSON.stringify(ready.body));
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 20);

    const completed = await invoke(updateOrder, {
      params: { id: String(firstOrderId) },
      user: cashierActor,
      body: { status: "Completed" },
    });
    assert.equal(completed.statusCode, 200, JSON.stringify(completed.body));
    assert.deepEqual(await inventoryState(control, catalog.ingredientId), {
      onHand: 17,
      batchRemaining: 17,
      ledgerTotal: 17,
    });
    assert.equal(
      await scalar(
        control,
        `SELECT COUNT(*) FROM stock_movements
          WHERE movement_type = 'sale' AND source_id = ?`,
        [String(firstOrderId)],
      ),
      1,
    );
    assert.equal(
      await scalar(
        control,
        "SELECT quantity FROM order_inventory_deductions WHERE order_id = ?",
        [firstOrderId],
      ),
      3,
    );

    const repeated = await invoke(updateOrder, {
      params: { id: String(firstOrderId) },
      user: cashierActor,
      body: { status: "Completed" },
    });
    assert.equal(repeated.statusCode, 200, JSON.stringify(repeated.body));
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 17);
    assert.equal(
      await scalar(
        control,
        `SELECT COUNT(*) FROM stock_movements
          WHERE movement_type = 'sale' AND source_id = ?`,
        [String(firstOrderId)],
      ),
      1,
    );

    const onlineCreated = await invoke(createOrder, {
      user: customerActor,
      body: {
        items: [{
          product_id: catalog.mealId,
          qty: 1,
          selected_flavor_product_id: catalog.flavorId,
        }],
        order_type: "take-out",
        payment_method: "cash_on_pickup",
      },
    });
    assert.equal(onlineCreated.statusCode, 200, JSON.stringify(onlineCreated.body));
    const onlineOrderId = Number(onlineCreated.body.orderId);
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 17);
    const accepted = await invoke(updateOrder, {
      params: { id: String(onlineOrderId) },
      user: cashierActor,
      body: { status: "Queued", paymentStatus: "Paid" },
    });
    assert.equal(accepted.statusCode, 200, JSON.stringify(accepted.body));
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 17);
    const [[acceptedOwner]] = await control.query(
      "SELECT cashier_user_id FROM orders WHERE order_id = ?",
      [onlineOrderId],
    );
    assert.equal(Number(acceptedOwner.cashier_user_id), cashierId);

    const unpaidCreated = await invoke(createOrder, {
      user: customerActor,
      body: {
        items: [{
          product_id: catalog.mealId,
          qty: 1,
          selected_flavor_product_id: catalog.flavorId,
        }],
        order_type: "take-out",
        payment_method: "cash_on_pickup",
      },
    });
    assert.equal(unpaidCreated.statusCode, 200, JSON.stringify(unpaidCreated.body));
    const unpaidOrderId = Number(unpaidCreated.body.orderId);
    await control.query(
      "UPDATE orders SET status = 'Ready for Pickup' WHERE order_id = ?",
      [unpaidOrderId],
    );
    const unpaidCompletion = await invoke(updateOrder, {
      params: { id: String(unpaidOrderId) },
      user: cashierActor,
      body: { status: "Completed" },
    });
    assert.equal(unpaidCompletion.statusCode, 400);
    assert.match(unpaidCompletion.body.message, /payment/i);
    assert.deepEqual(await orderState(control, unpaidOrderId), {
      status: "Ready for Pickup",
      paymentStatus: "Pending Payment",
      stockDeducted: 0,
    });

    const concurrentCreated = await invoke(createOrder, {
      user: cashierActor,
      body: {
        items: [{
          product_id: catalog.mealId,
          qty: 1,
          selected_flavor_product_id: catalog.flavorId,
        }],
        order_type: "dine-in",
        payment_method: "cash",
        cash_tendered: 100,
      },
    });
    assert.equal(concurrentCreated.statusCode, 200, JSON.stringify(concurrentCreated.body));
    const concurrentOrderId = Number(concurrentCreated.body.orderId);
    await advanceToReady(updateOrder, concurrentOrderId, cashierActor);
    const concurrentResults = await Promise.all([
      invoke(updateOrder, {
        params: { id: String(concurrentOrderId) },
        user: cashierActor,
        body: { status: "Completed" },
      }),
      invoke(updateOrder, {
        params: { id: String(concurrentOrderId) },
        user: secondCashierActor,
        body: { status: "Completed" },
      }),
    ]);
    assert.deepEqual(
      concurrentResults.map((result) => result.statusCode).sort(),
      [200, 200],
    );
    assert.equal(
      await scalar(
        control,
        `SELECT COUNT(*) FROM stock_movements
          WHERE movement_type = 'sale' AND source_id = ?`,
        [String(concurrentOrderId)],
      ),
      1,
    );
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 15.5);

    const insufficientCreated = await invoke(createOrder, {
      user: cashierActor,
      body: {
        items: [{
          product_id: catalog.mealId,
          qty: 1,
          selected_flavor_product_id: catalog.flavorId,
        }],
        order_type: "dine-in",
        payment_method: "cash",
        cash_tendered: 100,
      },
    });
    assert.equal(insufficientCreated.statusCode, 200, JSON.stringify(insufficientCreated.body));
    const insufficientOrderId = Number(insufficientCreated.body.orderId);
    await advanceToReady(updateOrder, insufficientOrderId, cashierActor);
    await executeRedesignedInventoryMutation(applicationDb, {
      productId: catalog.ingredientId,
      movementType: "adjustment",
      signedQuantity: -15.5,
      idempotencyKey: "integration:deplete:before-completion",
      sourceType: "integration_test",
      sourceId: "deplete",
      actorUserId: inventoryManagerId,
    });
    assert.equal((await inventoryState(control, catalog.ingredientId)).onHand, 0);
    const insufficientCompletion = await invoke(updateOrder, {
      params: { id: String(insufficientOrderId) },
      user: cashierActor,
      body: { status: "Completed" },
    });
    assert.equal(insufficientCompletion.statusCode, 409);
    assert.equal(insufficientCompletion.body.code, "INSUFFICIENT_STOCK");
    assert.deepEqual(await orderState(control, insufficientOrderId), {
      status: "Ready for Pickup",
      paymentStatus: "Paid",
      stockDeducted: 0,
    });
    assert.equal(
      await scalar(
        control,
        "SELECT COUNT(*) FROM order_inventory_deductions WHERE order_id = ?",
        [insufficientOrderId],
      ),
      0,
    );

    await executeRedesignedInventoryMutation(applicationDb, {
      productId: catalog.ingredientId,
      movementType: "receive",
      quantity: 5,
      receivedAt: new Date(),
      deliveryBatchReference: "integration-replenishment",
      idempotencyKey: "integration:receive:rollback-test",
      sourceType: "integration_test",
      sourceId: "replenish",
      actorUserId: inventoryManagerId,
    });
    const rollbackCreated = await invoke(createOrder, {
      user: cashierActor,
      body: {
        items: [{
          product_id: catalog.mealId,
          qty: 1,
          selected_flavor_product_id: catalog.flavorId,
        }],
        order_type: "dine-in",
        payment_method: "cash",
        cash_tendered: 100,
      },
    });
    assert.equal(rollbackCreated.statusCode, 200, JSON.stringify(rollbackCreated.body));
    const rollbackOrderId = Number(rollbackCreated.body.orderId);
    await advanceToReady(updateOrder, rollbackOrderId, cashierActor);
    const stateBeforeForcedFailure = await inventoryState(
      control,
      catalog.ingredientId,
    );
    // The deliberately unknown actor passes the route's role check but violates
    // the stock_movements actor FK after the batch allocation is attempted. This
    // proves the surrounding order transaction rolls every write back without
    // requiring elevated TRIGGER/SUPER privileges for the isolated test user.
    const forcedFailure = await invoke(updateOrder, {
      params: { id: String(rollbackOrderId) },
      user: { userId: 999999, role: "Cashier" },
      body: { status: "Completed" },
    });
    assert.equal(forcedFailure.statusCode, 500);
    assert.deepEqual(
      await inventoryState(control, catalog.ingredientId),
      stateBeforeForcedFailure,
    );
    assert.deepEqual(await orderState(control, rollbackOrderId), {
      status: "Ready for Pickup",
      paymentStatus: "Paid",
      stockDeducted: 0,
    });
    assert.equal(
      await scalar(
        control,
        "SELECT COUNT(*) FROM order_inventory_deductions WHERE order_id = ?",
        [rollbackOrderId],
      ),
      0,
    );
    const completedAfterFailure = await invoke(updateOrder, {
      params: { id: String(rollbackOrderId) },
      user: cashierActor,
      body: { status: "Completed" },
    });
    assert.equal(completedAfterFailure.statusCode, 200, JSON.stringify(completedAfterFailure.body));

    const refundCandidate = await invoke(createOrder, {
      user: cashierActor,
      body: {
        items: [{
          product_id: catalog.mealId,
          qty: 1,
          selected_flavor_product_id: catalog.flavorId,
        }],
        order_type: "dine-in",
        payment_method: "cash",
        cash_tendered: 100,
      },
    });
    assert.equal(refundCandidate.statusCode, 200, JSON.stringify(refundCandidate.body));
    const refundOrderId = Number(refundCandidate.body.orderId);
    const refundRequested = await invoke(createRefundRequest, {
      user: cashierActor,
      body: { orderId: refundOrderId, reason: "Isolated refund integration" },
    });
    assert.equal(refundRequested.statusCode, 201, JSON.stringify(refundRequested.body));
    const unauthorizedRefund = await invoke(updateOrder, {
      params: { id: String(refundOrderId) },
      user: inventoryActor,
      body: {
        status: "Refunded",
        refundAuthorizationPassword: TEST_REFUND_PASSWORD,
      },
    });
    assert.equal(unauthorizedRefund.statusCode, 403);
    const authorizedRefund = await invoke(updateOrder, {
      params: { id: String(refundOrderId) },
      user: cashierActor,
      body: {
        status: "Refunded",
        refundAuthorizationPassword: TEST_REFUND_PASSWORD,
      },
    });
    assert.equal(authorizedRefund.statusCode, 200, JSON.stringify(authorizedRefund.body));
    assert.deepEqual(await orderState(control, refundOrderId), {
      status: "Refunded",
      paymentStatus: "Refunded",
      stockDeducted: 0,
    });
    const [[reviewedRequest]] = await control.query(
      "SELECT status FROM refund_requests WHERE order_id = ?",
      [refundOrderId],
    );
    assert.equal(reviewedRequest.status, "actioned");
    const completedRefundAttempt = await invoke(updateOrder, {
      params: { id: String(firstOrderId) },
      user: cashierActor,
      body: {
        status: "Refunded",
        refundAuthorizationPassword: TEST_REFUND_PASSWORD,
      },
    });
    assert.equal(completedRefundAttempt.statusCode, 409);
    assert.equal(completedRefundAttempt.body.code, "SETTLEMENT_INELIGIBLE");

    const checkoutIntentId = crypto.randomUUID();
    const checkoutRequestId = crypto.randomUUID();
    const checkoutSessionId = "cs_isolated_redesigned_order";
    const checkoutItems = [{
      product_id: catalog.mealId,
      qty: 1,
      name: "Integration 1PCS Meal",
      price: 100,
      subtotal: 100,
      selected_flavor_product_id: catalog.flavorId,
      selected_flavor_name: "Integration Flavor",
      note: "PayMongo integration note",
    }];
    await control.query(
      `INSERT INTO paymongo_checkout_intents
         (intent_id, checkout_request_id, customer_user_id, items_json,
          subtotal, tax_rate, tax_amount, service_charge_rate,
          service_charge_amount, total_amount, amount_centavos, currency,
          order_type, customer_type, order_note, payment_context_token,
          checkout_session_id, status)
       VALUES (?, ?, ?, ?, 100, 0, 0, 0, 0, 100, 10000, 'PHP',
               'take-out', 'Regular', NULL, 'isolated-context', ?, 'awaiting_payment')`,
      [
        checkoutIntentId,
        checkoutRequestId,
        customerId,
        JSON.stringify(checkoutItems),
        checkoutSessionId,
      ],
    );
    const stockBeforePayMongo = (await inventoryState(control, catalog.ingredientId)).onHand;
    const payMongoOrder = await finalizePayMongoCheckoutIntent(
      {
        checkoutSessionId,
        customerUserId: customerId,
        items: checkoutItems,
      },
      {
        pool: applicationDb,
        async verifyPayMongoCheckoutSession() {
          return {
            paid: true,
            checkoutSessionId,
            customerUserId: customerId,
            expectedAmountCentavos: 10000,
            paidAmountCentavos: 10000,
            currency: "PHP",
            paymentReference: "isolated-paymongo-payment-1",
            livemode: false,
          };
        },
        publishOrderMutation() {},
        async sendCustomerOrderReceiptEmail() {},
      },
    );
    assert.equal(payMongoOrder.trackingStatus, "Awaiting Cashier Review");
    assert.equal(
      (await inventoryState(control, catalog.ingredientId)).onHand,
      stockBeforePayMongo,
    );
    const [[payMongoItem]] = await control.query(
      `SELECT selected_option_product_id AS flavorId,
              selected_option_name_snapshot AS flavorName,
              item_note AS itemNote
         FROM order_items WHERE order_id = ?`,
      [payMongoOrder.orderId],
    );
    assert.equal(Number(payMongoItem.flavorId), catalog.flavorId);
    assert.equal(payMongoItem.flavorName, "Integration Flavor");
    assert.equal(payMongoItem.itemNote, "PayMongo integration note");
    const payMongoAccepted = await invoke(updateOrder, {
      params: { id: String(payMongoOrder.orderId) },
      user: secondCashierActor,
      body: { status: "Queued" },
    });
    assert.equal(payMongoAccepted.statusCode, 200, JSON.stringify(payMongoAccepted.body));
    assert.equal(
      (await inventoryState(control, catalog.ingredientId)).onHand,
      stockBeforePayMongo,
    );

    const receipt = await invoke(loadReceipt, {
      params: { id: String(firstOrderId) },
    });
    assert.equal(receipt.statusCode, 200, JSON.stringify(receipt.body));
    assert.equal(receipt.body.items[0].selectedFlavorName, "Integration Flavor");
    assert.equal(receipt.body.items[0].note, "Integration note");
    const customerHistory = await invoke(customerOrders, {
      params: { customerUserId: String(customerId) },
      user: customerActor,
    });
    assert.equal(customerHistory.statusCode, 200, JSON.stringify(customerHistory.body));
    assert.ok(
      [...customerHistory.body.activeOrders, ...customerHistory.body.historyOrders]
        .some((order) => Number(order.id) === payMongoOrder.orderId),
    );
    const cashierHistory = await invoke(shiftOrders, { user: cashierActor });
    assert.equal(cashierHistory.statusCode, 200, JSON.stringify(cashierHistory.body));
    assert.ok(cashierHistory.body.some((order) => Number(order.id) === firstOrderId));

    await assert.rejects(
      control.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name_snapshot, unit_price,
            quantity, line_subtotal, sort_order)
         VALUES (?, 999999, 'Invalid FK', 1, 1, 1, 99)`,
        [firstOrderId],
      ),
      (error) => error.code === "ER_NO_REFERENCED_ROW_2",
    );

    const reconciled = await inventoryState(control, catalog.ingredientId);
    assert.ok(Math.abs(reconciled.onHand - reconciled.ledgerTotal) < 0.0001);
    assert.ok(Math.abs(reconciled.onHand - reconciled.batchRemaining) < 0.0001);
    assert.equal(
      await scalar(
        control,
        `SELECT COUNT(*) FROM stock_movements
          WHERE product_id = ? AND movement_type = 'sale'`,
        [catalog.flavorId],
      ),
      0,
    );

    console.log(
      "Redesigned order lifecycle MySQL integration tests passed:",
      JSON.stringify({
        database: EXPECTED_DATABASE,
        host: EXPECTED_HOST,
        finalOnHand: reconciled.onHand,
        ledgerTotal: reconciled.ledgerTotal,
        batchRemaining: reconciled.batchRemaining,
      }),
    );
  } finally {
    if (applicationDb && typeof applicationDb.end === "function") {
      await applicationDb.end().catch(() => undefined);
    }
    await assertIsolation(control);
    await clearDisposableDatabase(control);
    await control.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
