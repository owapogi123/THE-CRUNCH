"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const state = {
  batch: { batch_id: 9, product_id: 21, quantity: 100, remaining_qty: 70 },
  inventoryStock: 70,
  mirrorCredits: 0,
  commits: 0,
  rollbacks: 0,
  failProductMirror: false,
  transactionSnapshot: null,
};

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const connection = {
  async beginTransaction() {
    state.transactionSnapshot = {
      batch: { ...state.batch },
      inventoryStock: state.inventoryStock,
      mirrorCredits: state.mirrorCredits,
    };
  },
  async commit() {
    state.commits += 1;
    state.transactionSnapshot = null;
  },
  async rollback() {
    state.rollbacks += 1;
    if (state.transactionSnapshot) {
      state.batch = { ...state.transactionSnapshot.batch };
      state.inventoryStock = state.transactionSnapshot.inventoryStock;
      state.mirrorCredits = state.transactionSnapshot.mirrorCredits;
      state.transactionSnapshot = null;
    }
  },
  release() {},
  async query(sql, params = []) {
    const query = String(sql).replace(/\s+/g, " ").trim();
    if (query === "SELECT * FROM batches WHERE batch_id = ? FOR UPDATE") {
      return [[{ ...state.batch }]];
    }
    if (query.startsWith("UPDATE batches SET remaining_qty")) {
      state.batch.remaining_qty += Number(params[0]);
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith("UPDATE Inventory SET Stock")) {
      state.inventoryStock += Number(params[0]);
      state.mirrorCredits += 1;
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith("UPDATE Menu SET Stock")) {
      state.mirrorCredits += 1;
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith("UPDATE products SET quantity")) {
      if (state.failProductMirror) return [{ affectedRows: 0 }];
      state.mirrorCredits += 1;
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  },
};

mockModule("../config/db", {
  async getConnection() { return connection; },
  async query() { return [[]]; },
});
mockModule("../utils/productItemType", {
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "p.item_type"; },
  async assertProductsMatchItemType() {},
});
mockModule("../services/schemaAssertions", {
  async assertTableColumns() {},
});

const router = require("./batches");
const returnRoute = router.stack.find(
  (entry) => entry.route?.path === "/return" && entry.route.methods?.post,
);
assert.ok(returnRoute, "POST /batches/return route missing");
const returnHandler = returnRoute.route.stack.at(-1).handle;

async function invoke(returnQty) {
  const result = { statusCode: 200, body: null };
  await returnHandler(
    { body: { batch_id: 9, return_qty: returnQty } },
    {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; },
    },
  );
  return result;
}

(async () => {
  const tooLarge = await invoke(31);
  assert.equal(tooLarge.statusCode, 400);
  assert.match(tooLarge.body.error, /exceeds withdrawn amount/i);
  assert.equal(state.batch.remaining_qty, 70);
  assert.equal(state.mirrorCredits, 0);

  state.failProductMirror = true;
  const failedMirror = await invoke(30);
  assert.equal(failedMirror.statusCode, 500);
  assert.equal(state.batch.remaining_qty, 70);
  assert.equal(state.inventoryStock, 70);
  assert.equal(state.mirrorCredits, 0, "partial mirror writes must roll back");
  state.failProductMirror = false;

  const valid = await invoke(30);
  assert.equal(valid.statusCode, 200);
  assert.equal(state.batch.remaining_qty, 100);
  assert.equal(state.inventoryStock, 100);
  assert.equal(state.mirrorCredits, 3);
  assert.equal(state.commits, 1);

  const duplicate = await invoke(1);
  assert.equal(duplicate.statusCode, 400);
  assert.equal(state.batch.remaining_qty, 100);
  assert.equal(state.inventoryStock, 100);
  assert.equal(state.mirrorCredits, 3, "repeat return must not credit stock twice");

  const batchSource = fs.readFileSync(path.join(__dirname, "batches.js"), "utf8");
  const inventorySource = fs.readFileSync(
    path.join(__dirname, "inventoryRoutes.js"),
    "utf8",
  );
  assert.match(
    batchSource,
    /FROM batches[\s\S]*?remaining_qty > 0[\s\S]*?FOR UPDATE/,
    "FIFO withdrawal must lock selected storage batches",
  );
  assert.match(
    batchSource,
    /getKitchenBatchById\(conn, kitchenBatchId, \{\s*lock: true/,
    "kitchen mutations must lock their batch row",
  );
  assert.match(
    inventorySource,
    /SELECT product_id, quantity, remaining_qty[\s\S]*?FOR UPDATE/,
    "legacy return compatibility route must lock and bound the batch return",
  );

  console.log("Stock movement bounds and locking tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
