const assert = require("node:assert/strict");

const state = {
  inventory: { Inventory_ID: 10, Product_ID: 7, Stock: 5 },
  menuStock: 5,
  productQuantity: 5,
  commits: 0,
  rollbacks: 0,
  failProductUpdate: false,
};

function reset() {
  state.inventory = { Inventory_ID: 10, Product_ID: 7, Stock: 5 };
  state.menuStock = 5;
  state.productQuantity = 5;
  state.commits = 0;
  state.rollbacks = 0;
  state.failProductUpdate = false;
}

function makeConnection() {
  let saved;
  return {
    async beginTransaction() {
      saved = JSON.parse(
        JSON.stringify({
          inventory: state.inventory,
          menuStock: state.menuStock,
          productQuantity: state.productQuantity,
        }),
      );
    },
    async commit() {
      state.commits += 1;
      saved = null;
    },
    async rollback() {
      state.rollbacks += 1;
      if (saved) {
        state.inventory = saved.inventory;
        state.menuStock = saved.menuStock;
        state.productQuantity = saved.productQuantity;
      }
      saved = null;
    },
    release() {},
    async query(sql, params = []) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.startsWith("SELECT Product_ID AS productId") && query.endsWith("FOR UPDATE")) {
        return [[{ productId: state.inventory.Product_ID }]];
      }
      if (query.startsWith("UPDATE Inventory SET")) {
        state.inventory.Stock = Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("UPDATE Menu SET Stock")) {
        state.menuStock = Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("UPDATE products SET quantity")) {
        if (state.failProductUpdate) throw new Error("simulated mirror failure");
        state.productQuantity = Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("SELECT * FROM Inventory")) {
        return [[{ ...state.inventory }]];
      }
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
        reorderPoint: 20,
        criticalPoint: 5,
        useDefaultThresholds: 1,
        lowStockThreshold: null,
        criticalStockThreshold: null,
      }]];
    }
    return [[]];
  },
  async getConnection() {
    return makeConnection();
  },
});

const router = require("./inventoryRoutes");
const route = router.stack.find(
  (entry) => entry.route?.path === "/:inventory_id" && entry.route.methods?.put,
);
assert.ok(route, "PUT /inventory/:inventory_id route missing");
const handler = route.route.stack.at(-1).handle;

async function invoke(stock) {
  const req = { params: { inventory_id: "10" }, body: { stock } };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };
  await handler(req, res);
  return result;
}

(async () => {
  reset();
  const updated = await invoke(7.1255);
  assert.equal(updated.statusCode, 200);
  assert.equal(state.inventory.Stock, 7.1255);
  assert.equal(state.menuStock, 7.1255);
  assert.equal(state.productQuantity, 7.1255);
  assert.equal(state.commits, 1);

  reset();
  const invalidPrecision = await invoke(1.00001);
  assert.equal(invalidPrecision.statusCode, 400);
  assert.equal(state.inventory.Stock, 5);

  reset();
  state.failProductUpdate = true;
  const failed = await invoke(9.5);
  assert.equal(failed.statusCode, 500);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.inventory.Stock, 5);
  assert.equal(state.menuStock, 5);
  assert.equal(state.productQuantity, 5);

  console.log("Inventory mirror transaction tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
