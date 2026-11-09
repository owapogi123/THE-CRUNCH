"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const sqlCalls = [];

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    sqlCalls.push(normalized);
    assert.match(normalized, /inventory_batches/);
    assert.doesNotMatch(normalized, /\bFROM batches\b|\bJOIN Menu\b|\bInventory\b/);
    return [[{
      batch_id: 3,
      product_id: 7,
      quantity: 10,
      remaining_qty: 8,
      returned_qty: 0,
      unit: "kg",
      product_name: "Chicken Breast",
    }]];
  },
});

mockModule("../utils/productItemType", {
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "p.item_type"; },
  async assertProductsMatchItemType() {},
});
mockModule("../services/schemaAssertions", {
  async assertTableColumns() {
    throw new Error("redesigned batch reads must not validate legacy batch tables");
  },
});

const router = require("./batches");

function routeHandler(path, method = "get") {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(handler, request = {}) {
  const result = { statusCode: 200, body: null };
  await handler(
    { params: {}, body: {}, ...request },
    {
      status(code) { result.statusCode = code; return this; },
      json(value) { result.body = value; return this; },
    },
  );
  return result;
}

(async () => {
  const productBatches = await invoke(routeHandler("/product/:product_id"), {
    params: { product_id: "7" },
  });
  assert.equal(productBatches.statusCode, 200);
  assert.equal(productBatches.body[0].batch_id, 3);

  const active = await invoke(routeHandler("/active"));
  assert.equal(active.statusCode, 200);
  assert.equal(active.body[0].remaining_qty, 8);

  const returned = await invoke(routeHandler("/returned/yesterday"));
  assert.equal(returned.statusCode, 200);
  assert.equal(returned.body[0].product_name, "Chicken Breast");

  const blocked = await invoke(routeHandler("/withdraw", "post"), {
    body: { product_id: 7, qty_needed: 1 },
  });
  assert.equal(blocked.statusCode, 410);
  assert.equal(blocked.body.code, "WITHDRAWN_STOCK_WORKFLOW_RETIRED");

  assert.equal(sqlCalls.length, 3);
  console.log("Redesigned inventory batch route tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
