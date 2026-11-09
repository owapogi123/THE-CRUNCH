"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const calls = {
  mutations: [],
  alertRefreshes: 0,
  notifications: [],
  dbQueries: 0,
};

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async query(sql) {
    calls.dbQueries += 1;
    assert.match(String(sql), /FROM stock_movements movement/);
    return [[{
      status_id: 51,
      product_id: 7,
      product_name: "Chicken Breast",
      type: "adjustment",
      quantity: 2,
      signed_quantity: -2,
      unit: "kg",
    }]];
  },
});

mockModule("../services/inventoryService", {
  async executeRedesignedInventoryMutation(_db, input, options = {}) {
    calls.mutations.push({ ...input });
    if (input.note === "conflict") {
      throw Object.assign(new Error("Only 1.0000 is available"), {
        statusCode: 409,
        code: "INSUFFICIENT_STOCK",
      });
    }
    const result = {
      idempotent: input.idempotencyKey === "already-done",
      productId: Number(input.productId),
      productName: "Chicken Breast",
      unit: "kg",
      movementType: input.movementType,
      signedQuantity: input.movementType === "spoilage"
        ? -Number(input.quantity)
        : Number(input.signedQuantity ?? input.quantity),
      stockMovementId: 51,
      onHand: 8,
    };
    if (options.beforeCommit) {
      await options.beforeCommit({ query: async () => [{ insertId: 1 }] }, result);
    }
    return result;
  },
  async refreshRedesignedInventoryAlerts() {
    calls.alertRefreshes += 1;
  },
});

mockModule("../services/staffNotificationService", {
  STAFF_NOTIFICATION_AUDIENCES: { ADMINISTRATOR: "administrator" },
  async createStaffNotification(_connection, payload) {
    calls.notifications.push(payload);
  },
});

const router = require("./stockStatusRoutes");

function routeHandler(path, method) {
  const entry = router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods?.[method],
  );
  assert.ok(entry, `${method.toUpperCase()} ${path} route missing`);
  return entry.route.stack.at(-1).handle;
}

async function invoke(handler, { body = {}, user, headers = {} } = {}) {
  const result = { statusCode: 200, body: null };
  await handler(
    {
      body,
      user: user || { userId: 9, username: "Stock Manager", role: "inventory_manager" },
      get(name) { return headers[String(name).toLowerCase()] || null; },
    },
    {
      status(code) { result.statusCode = code; return this; },
      json(value) { result.body = value; return this; },
    },
  );
  return result;
}

(async () => {
  const today = await invoke(routeHandler("/today", "get"));
  assert.equal(today.statusCode, 200);
  assert.equal(today.body[0].status_id, 51);

  const adjusted = await invoke(routeHandler("/", "post"), {
    body: {
      product_id: 7,
      type: "adjustment",
      quantity: -2,
      unit: "kg",
      reason: "cycle count",
    },
    headers: { "idempotency-key": "adjustment-7-1" },
  });
  assert.equal(adjusted.statusCode, 201);
  assert.equal(adjusted.body.type, "adjustment");
  assert.equal(adjusted.body.signed_quantity, -2);
  assert.equal(calls.mutations[0].idempotencyKey, "adjustment-7-1");
  assert.equal(calls.alertRefreshes, 1);

  const retired = await invoke(routeHandler("/", "post"), {
    body: { product_id: 7, type: "supplementary", quantity: 1 },
  });
  assert.equal(retired.statusCode, 410);
  assert.equal(retired.body.code, "WITHDRAWN_STOCK_WORKFLOW_RETIRED");

  const receipt = await invoke(routeHandler("/", "post"), {
    body: { product_id: 7, type: "receive", quantity: 1 },
  });
  assert.equal(receipt.statusCode, 409);
  assert.equal(receipt.body.code, "STOCK_RECEIPT_REQUIRES_PURCHASE_ORDER");

  const spoiled = await invoke(routeHandler("/spoilage", "post"), {
    body: {
      product_id: 7,
      quantity: 1.5,
      batch_id: 3,
      reason: "expired",
    },
    headers: { "idempotency-key": "spoilage-7-1" },
  });
  assert.equal(spoiled.statusCode, 201);
  assert.equal(spoiled.body.stockMovementId, 51);
  assert.equal(spoiled.body.dailyWithdrawn, 0);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0].eventType, "inventory.spoilage");
  assert.equal(calls.notifications[0].metadata.stockMovementId, 51);

  const conflict = await invoke(routeHandler("/", "post"), {
    body: {
      product_id: 7,
      type: "adjustment",
      quantity: -2,
      reason: "conflict",
    },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.code, "INSUFFICIENT_STOCK");

  assert.equal(calls.dbQueries, 1, "only the read endpoint should query the mocked pool directly");
  console.log("Redesigned stock-status route tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
