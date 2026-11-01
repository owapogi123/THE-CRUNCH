"use strict";

const assert = require("node:assert/strict");

const state = {
  dailyWithdrawn: 10,
  wasted: 1,
  notifications: new Map(),
  statusRows: [],
  commits: 0,
  rollbacks: 0,
  failInventoryUpdate: false,
  failNotificationInsert: false,
};

function resetOperation({ preserveNotifications = false } = {}) {
  state.dailyWithdrawn = 10;
  state.wasted = 1;
  state.statusRows = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.failInventoryUpdate = false;
  state.failNotificationInsert = false;
  if (!preserveNotifications) state.notifications = new Map();
}

function createConnection() {
  let snapshot;
  return {
    async beginTransaction() {
      snapshot = {
        dailyWithdrawn: state.dailyWithdrawn,
        wasted: state.wasted,
        statusRows: [...state.statusRows],
        notifications: new Map(state.notifications),
      };
    },
    async commit() {
      state.commits += 1;
      snapshot = null;
    },
    async rollback() {
      state.rollbacks += 1;
      if (snapshot) {
        state.dailyWithdrawn = snapshot.dailyWithdrawn;
        state.wasted = snapshot.wasted;
        state.statusRows = snapshot.statusRows;
        state.notifications = snapshot.notifications;
      }
      snapshot = null;
    },
    release() {},
    async query(sql, params = []) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.startsWith("INSERT INTO Inventory")) {
        return [{ affectedRows: 0 }];
      }
      if (query.startsWith("SELECT COALESCE(i.Daily_Withdrawn")) {
        return [[{
          dailyWithdrawn: state.dailyWithdrawn,
          wasted: state.wasted,
          productName: "Chicken Breast",
          unit: "kg",
        }]];
      }
      if (query.startsWith("INSERT INTO Stock_Status")) {
        const statusId = 71;
        state.statusRows.push({ statusId, params: [...params] });
        return [{ insertId: statusId, affectedRows: 1 }];
      }
      if (query.startsWith("SELECT kitchen_batch_id")) return [[]];
      if (query.startsWith("UPDATE Inventory SET Daily_Withdrawn")) {
        if (state.failInventoryUpdate) throw new Error("simulated inventory write failure");
        state.dailyWithdrawn = Math.max(0, state.dailyWithdrawn - Number(params[0]));
        state.wasted += Number(params[1]);
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("INSERT INTO staff_notifications")) {
        if (state.failNotificationInsert) throw new Error("simulated notification failure");
        const dedupeKey = String(params[0]);
        if (state.notifications.has(dedupeKey)) {
          return [{ insertId: 0, affectedRows: 0 }];
        }
        state.notifications.set(dedupeKey, { sql: query, params: [...params] });
        return [{ insertId: state.notifications.size, affectedRows: 1 }];
      }
      throw new Error(`Unexpected stock-status query: ${query}`);
    },
  };
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async getConnection() {
    return createConnection();
  },
  async query() {
    return [[]];
  },
});
mockModule("../utils/productItemType", {
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "'stock_item'"; },
  async assertProductsMatchItemType() {},
});
mockModule("../services/schemaAssertions", {
  async assertTableColumns() {},
});

const router = require("./stockStatusRoutes");
const spoilageRoute = router.stack.find(
  (entry) => entry.route?.path === "/spoilage" && entry.route.methods?.post,
);
assert.ok(spoilageRoute, "POST /stock-status/spoilage route missing");
const spoilageHandler = spoilageRoute.route.stack.at(-1).handle;

async function invoke() {
  const req = {
    user: { userId: 9, username: "Stock Manager", role: "inventory_manager" },
    body: { product_id: 7, quantity: 1.5, recorded_by: 9 },
  };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(value) { result.body = value; return this; },
  };
  await spoilageHandler(req, res);
  return result;
}

async function invokeExpectedFailure() {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await invoke();
  } finally {
    console.error = originalError;
  }
}

(async () => {
  resetOperation();
  const success = await invoke();
  assert.equal(success.statusCode, 201);
  assert.equal(success.body.stockStatusId, 71);
  assert.equal(state.dailyWithdrawn, 8.5);
  assert.equal(state.wasted, 2.5);
  assert.equal(state.commits, 1);
  assert.equal(state.notifications.size, 1);
  const notification = state.notifications.get("inventory_change:spoilage:71");
  assert.ok(notification, "notification must use the persisted Stock_Status ID");
  assert.equal(notification.params[1], "inventory_change");
  assert.equal(notification.params[2], "inventory.spoilage");
  assert.equal(notification.params[3], "71");
  assert.equal(notification.params[4], "administrator");
  assert.equal(notification.params[5], 9);
  assert.match(notification.params[6], /Chicken Breast/);
  assert.match(notification.params[7], /1\.5 kg.*Stock Manager/);
  assert.equal(notification.params[8], "Completed");
  assert.deepEqual(JSON.parse(notification.params[9]), {
    actionType: "spoilage_write_off",
    stockStatusId: 71,
    productId: 7,
    productName: "Chicken Breast",
    quantity: 1.5,
    unit: "kg",
    actorUserId: 9,
    actorName: "Stock Manager",
    targetTab: "alerts",
  });

  resetOperation();
  state.failInventoryUpdate = true;
  const failedInventory = await invokeExpectedFailure();
  assert.equal(failedInventory.statusCode, 500);
  assert.equal(state.notifications.size, 0);
  assert.equal(state.dailyWithdrawn, 10);
  assert.equal(state.wasted, 1);
  assert.equal(state.rollbacks, 1);

  resetOperation();
  state.failNotificationInsert = true;
  const failedNotification = await invokeExpectedFailure();
  assert.equal(failedNotification.statusCode, 500);
  assert.equal(state.notifications.size, 0);
  assert.equal(state.dailyWithdrawn, 10, "notification failure must roll back spoilage");
  assert.equal(state.wasted, 1);
  assert.equal(state.rollbacks, 1);

  resetOperation();
  await invoke();
  resetOperation({ preserveNotifications: true });
  await invoke();
  assert.equal(state.notifications.size, 1, "duplicate operation notifications must be ignored");

  console.log("Spoilage Administrator notification transaction tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
