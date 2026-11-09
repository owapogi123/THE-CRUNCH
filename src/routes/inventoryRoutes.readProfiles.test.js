"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const calls = {
  redesignedInventory: 0,
  redesignedAlerts: 0,
  reconciledItems: null,
  legacySql: [],
  thresholdUpdates: 0,
  alertRefreshes: 0,
};

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const redesignedInventoryRow = {
  inventory_id: 21,
  product_id: 21,
  product_name: "Chicken Fillet",
  category: "Raw Materials",
  unit: "kg",
  mainStock: "4.0000",
  quantity: "4.0000",
  stock: "4.0000",
  item_type: "stock_item",
  availability_status: "Available",
};

mockModule("../services/inventoryService", {
  async deductStockForOrder() {},
  async listRedesignedInventoryRows() {
    calls.redesignedInventory += 1;
    return [redesignedInventoryRow];
  },
  async listRedesignedInventoryAlertRows() {
    calls.redesignedAlerts += 1;
    return [{
      inventory_id: 22,
      product_id: 22,
      product_name: "Cooking Oil",
      category: "Raw Materials",
      unit: "L",
      mainStock: 2,
      useDefaultThresholds: 0,
      lowStockThreshold: 0,
      criticalStockThreshold: 0,
      item_type: "stock_item",
    }];
  },
  async refreshRedesignedInventoryAlerts() {
    calls.alertRefreshes += 1;
  },
});

mockModule("../utils/menuAvailability", {
  async fetchMenuIngredients() {
    return new Map([[31, [{ product_id: 44, quantity_required: 1 }]]]);
  },
});

mockModule("../utils/productItemType", {
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "p.item_type"; },
  async assertProductsMatchItemType() {},
});

mockModule("../services/inventoryNotificationService", {
  getVisibleInventoryAlertSeverities() {
    return ["low", "critical", "out"];
  },
  async reconcileInventoryAlerts(_db, items) {
    calls.reconciledItems = items;
  },
  async listInventoryNotifications() {
    return { notifications: [], unreadCount: 0 };
  },
  async markAllInventoryNotificationsRead() { return 0; },
  async markInventoryNotificationRead() { return true; },
});

const dbMock = {
  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (/FROM system_settings/i.test(normalized)) {
      return [[{
        settings_json: JSON.stringify({
          defaultLowStockThreshold: 10,
          defaultCriticalStockThreshold: 5,
        }),
      }]];
    }
    if (/FROM Inventory i/i.test(normalized)) {
      calls.legacySql.push(normalized);
      return [[{
        inventory_id: 31,
        product_id: 31,
        product_name: "Legacy Stock",
        category: "Legacy Materials",
        unit: "piece",
        mainStock: 8,
        quantity: 8,
        stock: 8,
        item_type: "stock_item",
        availability_status: "Available",
      }]];
    }
    throw new Error(`Unexpected inventory route SQL: ${normalized}`);
  },
  async getConnection() {
    return {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, " ").trim();
        if (normalized.startsWith("SELECT p.product_id")) {
          return [[{
            product_id: 22,
            product_type: "stock_item",
            on_hand: 2,
            reorder_point: 10,
            critical_point: 5,
            version: 3,
          }]];
        }
        if (normalized.startsWith("UPDATE inventory_balances")) {
          calls.thresholdUpdates += 1;
          assert.deepEqual(params, [12, 4, 22, 3]);
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected threshold SQL: ${normalized}`);
      },
    };
  },
};
mockModule("../config/db", dbMock);

const router = require("./inventoryRoutes");

function routeHandler(path, method = "get") {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(
  path,
  { method = "get", query = {}, params = {}, body = {}, user = null } = {},
) {
  const result = { statusCode: 200, body: null, headers: {} };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    set(name, value) {
      result.headers[name] = value;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };
  await routeHandler(path, method)({ query, params, body, user }, res);
  return result;
}

(async () => {
  const redesignedList = await invoke("/");
  assert.equal(redesignedList.statusCode, 200);
  assert.equal(redesignedList.body[0].product_name, "Chicken Fillet");
  assert.deepEqual(redesignedList.body[0].ingredients, []);
  assert.equal(calls.redesignedInventory, 1);
  assert.equal(calls.legacySql.length, 0);

  const redesignedAlerts = await invoke("/alerts", {
    user: { userId: 7, role: "inventory_manager" },
  });
  assert.equal(redesignedAlerts.statusCode, 200);
  assert.equal(calls.redesignedAlerts, 1);
  assert.equal(redesignedAlerts.body.summary.normal, 1);
  assert.equal(redesignedAlerts.body.items.length, 0);
  assert.equal(calls.reconciledItems[0].thresholds.low, 0);
  assert.equal(calls.reconciledItems[0].thresholds.critical, 0);

  const thresholdUpdate = await invoke("/:inventory_id", {
    method: "put",
    params: { inventory_id: "22" },
    body: { reorderPoint: 12, criticalPoint: 4 },
  });
  assert.equal(thresholdUpdate.statusCode, 200);
  assert.equal(thresholdUpdate.body.reorderPoint, 12);
  assert.equal(thresholdUpdate.body.criticalPoint, 4);
  assert.equal(thresholdUpdate.body.version, 4);
  assert.equal(calls.thresholdUpdates, 1);
  assert.equal(calls.alertRefreshes, 1);

  const unsupportedDailyUsage = await invoke("/daily-usage");
  assert.equal(unsupportedDailyUsage.statusCode, 501);
  assert.equal(
    unsupportedDailyUsage.body.code,
    "DAILY_USAGE_NOT_AVAILABLE_IN_REDESIGNED_SCHEMA",
  );

  const unsupportedDailyUsageWrite = await invoke("/daily-usage", {
    method: "post",
    body: { items: [] },
  });
  assert.equal(unsupportedDailyUsageWrite.statusCode, 501);
  assert.equal(
    unsupportedDailyUsageWrite.body.code,
    "DAILY_USAGE_NOT_AVAILABLE_IN_REDESIGNED_SCHEMA",
  );

  const unsupportedDailyUsageFinalize = await invoke(
    "/daily-usage/:id/finalize",
    { method: "patch", params: { id: "1" }, body: {} },
  );
  assert.equal(unsupportedDailyUsageFinalize.statusCode, 501);

  const retiredBatchReturn = await invoke("/batches/:batchId/return", {
    method: "post",
    params: { batchId: "3" },
    body: { quantity: 1 },
  });
  assert.equal(retiredBatchReturn.statusCode, 410);
  assert.equal(retiredBatchReturn.body.code, "WITHDRAWN_STOCK_WORKFLOW_RETIRED");

  process.env.DB_SCHEMA_PROFILE = "legacy";
  const legacyList = await invoke("/");
  assert.equal(legacyList.statusCode, 200);
  assert.equal(legacyList.body[0].product_name, "Legacy Stock");
  assert.deepEqual(legacyList.body[0].ingredients, [
    { product_id: 44, quantity_required: 1 },
  ]);
  assert.equal(calls.legacySql.length, 1);
  assert.match(calls.legacySql[0], /FROM Inventory i/i);

  console.log("inventory route legacy and redesigned read-profile tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
