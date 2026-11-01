const assert = require("node:assert/strict");

const state = { inventory: {}, commits: 0, rollbacks: 0, connections: 0 };

function reset() {
  state.inventory = {
    Inventory_ID: 10,
    Product_ID: 7,
    Stock: 5,
    Reorder_Point: 20,
    Critical_Point: 5,
    use_default_thresholds: 1,
    low_stock_threshold: null,
    critical_stock_threshold: null,
  };
  state.commits = 0;
  state.rollbacks = 0;
  state.connections = 0;
}

function makeConnection() {
  return {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() { state.rollbacks += 1; },
    release() {},
    async query(sql, params = []) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.startsWith("SELECT Product_ID AS productId") && query.endsWith("FOR UPDATE")) {
        return [[{ productId: state.inventory.Product_ID }]];
      }
      if (query.startsWith("UPDATE Inventory SET")) {
        let index = 0;
        if (query.includes("Reorder_Point = ?")) state.inventory.Reorder_Point = Number(params[index++]);
        if (query.includes("Critical_Point = ?")) state.inventory.Critical_Point = Number(params[index++]);
        if (query.includes("use_default_thresholds = ?")) state.inventory.use_default_thresholds = Number(params[index++]);
        if (query.includes("low_stock_threshold = ?")) state.inventory.low_stock_threshold = params[index++];
        if (query.includes("critical_stock_threshold = ?")) state.inventory.critical_stock_threshold = params[index++];
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("SELECT * FROM Inventory")) return [[{ ...state.inventory }]];
      return [[]];
    },
  };
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async query(sql) {
    const query = String(sql).replace(/\s+/g, " ").trim();
    if (query.startsWith("SELECT Product_ID AS productId")) {
      return [[{
        productId: state.inventory.Product_ID,
        reorderPoint: state.inventory.Reorder_Point,
        criticalPoint: state.inventory.Critical_Point,
        useDefaultThresholds: state.inventory.use_default_thresholds,
        lowStockThreshold: state.inventory.low_stock_threshold,
        criticalStockThreshold: state.inventory.critical_stock_threshold,
      }]];
    }
    return [[]];
  },
  async getConnection() {
    state.connections += 1;
    return makeConnection();
  },
});

const router = require("./inventoryRoutes");
const route = router.stack.find(
  (entry) => entry.route?.path === "/:inventory_id" && entry.route.methods?.put,
);
assert.ok(route, "PUT /inventory/:inventory_id route missing");
const handler = route.route.stack.at(-1).handle;
const legacyBatchCreateRoute = router.stack.find(
  (entry) => entry.route?.path === "/batches" && entry.route.methods?.post,
);
assert.ok(legacyBatchCreateRoute, "POST /inventory/batches route missing");
const legacyBatchCreateHandler = legacyBatchCreateRoute.route.stack.at(-1).handle;

async function invoke(body) {
  const req = { params: { inventory_id: "10" }, body };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(value) { result.body = value; return this; },
  };
  await handler(req, res);
  return result;
}

(async () => {
  const forbiddenFields = [
    "stock", "Stock", "quantity", "mainStock", "main_stock", "currentStock",
    "daily_withdrawn", "dailyWithdrawn", "returned", "wasted",
  ];

  for (const field of forbiddenFields) {
    reset();
    const rejected = await invoke({ [field]: 9.5 });
    assert.equal(rejected.statusCode, 400, `${field} should be rejected`);
    assert.equal(rejected.body.code, "DIRECT_STOCK_UPDATE_NOT_ALLOWED");
    assert.deepEqual(rejected.body.fields, [field]);
    assert.equal(state.inventory.Stock, 5);
    assert.equal(state.connections, 0, `${field} must be rejected before a transaction`);
  }

  reset();
  const directReceipt = { statusCode: 200, body: null };
  await legacyBatchCreateHandler(
    { body: { productId: 7, quantity: 10 } },
    {
      status(code) { directReceipt.statusCode = code; return this; },
      json(value) { directReceipt.body = value; return this; },
    },
  );
  assert.equal(directReceipt.statusCode, 400);
  assert.equal(directReceipt.body.code, "STOCK_RECEIPT_REQUIRES_PURCHASE_ORDER");
  assert.equal(state.connections, 0);

  reset();
  const updated = await invoke({
    reorderPoint: 25,
    criticalPoint: 4,
    useDefaultThresholds: false,
    lowStockThreshold: 12,
    criticalStockThreshold: 3,
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(state.inventory.Stock, 5, "metadata editing must not change stock");
  assert.equal(state.inventory.Reorder_Point, 25);
  assert.equal(state.inventory.Critical_Point, 4);
  assert.equal(state.inventory.use_default_thresholds, 0);
  assert.equal(state.inventory.low_stock_threshold, 12);
  assert.equal(state.inventory.critical_stock_threshold, 3);
  assert.equal(state.commits, 1);

  console.log("Inventory stock-overwrite protection tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
