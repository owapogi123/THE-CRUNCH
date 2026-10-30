const assert = require("node:assert/strict");

const state = {
  products: [],
  menu: [],
  inventory: [],
  ingredients: [],
  commits: 0,
  rollbacks: 0,
  failInventoryInsert: false,
};

function reset() {
  state.products = [];
  state.menu = [];
  state.inventory = [];
  state.ingredients = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.failInventoryInsert = false;
}

function snapshot() {
  return JSON.parse(
    JSON.stringify({
      products: state.products,
      menu: state.menu,
      inventory: state.inventory,
      ingredients: state.ingredients,
    }),
  );
}

function restore(saved) {
  state.products = saved.products;
  state.menu = saved.menu;
  state.inventory = saved.inventory;
  state.ingredients = saved.ingredients;
}

function connection() {
  let saved;
  return {
    async beginTransaction() {
      saved = snapshot();
    },
    async commit() {
      state.commits += 1;
      saved = null;
    },
    async rollback() {
      state.rollbacks += 1;
      if (saved) restore(saved);
      saved = null;
    },
    release() {},
    async query(sql, params = []) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.startsWith("SELECT id FROM products")) {
        const requested = String(params[0]).trim().toLowerCase();
        return [
          state.products.filter(
            (product) =>
              product.name.toLowerCase() === requested &&
              (params[1] == null || product.id !== Number(params[1])),
          ),
        ];
      }
      if (query.startsWith("INSERT INTO products")) {
        const id = state.products.length + 1;
        state.products.push({ id, name: params[0] });
        return [{ insertId: id, affectedRows: 1 }];
      }
      if (query.startsWith("UPDATE products SET menu_code")) {
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("INSERT INTO Menu")) {
        state.menu.push({ productId: params[0], name: params[1] });
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("INSERT INTO Inventory")) {
        if (state.failInventoryInsert) {
          throw new Error("simulated inventory insert failure");
        }
        state.inventory.push({ productId: params[0], stock: params[2] });
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("DELETE FROM menu_item_ingredients")) {
        state.ingredients = state.ingredients.filter(
          (ingredient) => ingredient.menuProductId !== Number(params[0]),
        );
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("INSERT INTO menu_item_ingredients")) {
        state.ingredients.push({
          menuProductId: params[0],
          productId: params[1],
          quantity: params[2],
        });
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const dbMock = {
  async query(sql, params = []) {
    return connection().query(sql, params);
  },
  async getConnection() {
    return connection();
  },
};

mockModule("../config/db", dbMock);
mockModule("../services/productSchemaService", {
  async ensureProductSchema() {
    return true;
  },
});
mockModule("../utils/productItemType", {
  MENU_ITEM: "menu_item",
  STOCK_ITEM: "stock_item",
  getProductItemTypeExpression() {
    return "p.item_type";
  },
  normalizeItemType(value, fallback) {
    return value || fallback;
  },
  async assertProductsMatchItemType() {},
});

const router = require("./productRoutes");
const createLayer = router.stack.find(
  (entry) => entry.route?.path === "/" && entry.route.methods?.post,
);
assert.ok(createLayer, "POST /products route missing");
const createHandler = createLayer.route.stack.at(-1).handle;

async function invoke(body) {
  const req = { body };
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
  await createHandler(req, res);
  return result;
}

function validProduct(overrides = {}) {
  return {
    name: "Chicken Bowl",
    item_type: "menu_item",
    price: 99.5,
    quantity: 0,
    category: "Meals",
    ingredients: [],
    override_mode: "Auto",
    ...overrides,
  };
}

(async () => {
  reset();
  const created = await invoke(validProduct());
  assert.equal(created.statusCode, 201);
  assert.equal(state.commits, 1);
  assert.equal(state.products.length, 1);
  assert.equal(state.menu.length, 1);
  assert.equal(state.inventory.length, 1);

  reset();
  state.failInventoryInsert = true;
  const partialFailure = await invoke(validProduct());
  assert.equal(partialFailure.statusCode, 500);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.products.length, 0);
  assert.equal(state.menu.length, 0);
  assert.equal(state.inventory.length, 0);

  reset();
  const forceAvailable = await invoke(
    validProduct({ override_mode: "Force Available" }),
  );
  assert.equal(forceAvailable.statusCode, 400);
  assert.match(forceAvailable.body.message, /no longer supported/i);
  assert.equal(state.products.length, 0);

  reset();
  state.products.push({ id: 7, name: "Chicken Bowl" });
  const duplicate = await invoke(validProduct());
  assert.equal(duplicate.statusCode, 409);
  assert.equal(state.products.length, 1);

  console.log("Product data-entry transaction tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
