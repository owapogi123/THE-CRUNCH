"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const state = {
  nextId: 1,
  products: [],
  balances: new Map(),
  recipes: [],
  dependencies: false,
  commits: 0,
  rollbacks: 0,
  sql: [],
};

const menuCategories = [
  { category_id: 1, name: "Menu Food", system_key: "menu_food", is_active: 1, display_order: 1 },
  { category_id: 2, name: "Chicken Flavors", system_key: "chicken_flavors", is_active: 1, display_order: 2 },
];
const inventoryCategories = [
  { category_id: 3, name: "Raw Materials", system_key: "raw_materials", is_active: 1 },
];
const units = [
  { unit_id: 4, name: "Piece", abbreviation: "pc", system_key: "piece", is_active: 1 },
  { unit_id: 5, name: "Kilogram", abbreviation: "kg", system_key: "kilogram", is_active: 1 },
];

function reset() {
  state.nextId = 1;
  state.products = [];
  state.balances = new Map();
  state.recipes = [];
  state.dependencies = false;
  state.commits = 0;
  state.rollbacks = 0;
  state.sql = [];
}

function snapshot() {
  return {
    nextId: state.nextId,
    products: structuredClone(state.products),
    balances: new Map(structuredClone(Array.from(state.balances.entries()))),
    recipes: structuredClone(state.recipes),
  };
}

function restore(saved) {
  state.nextId = saved.nextId;
  state.products = saved.products;
  state.balances = saved.balances;
  state.recipes = saved.recipes;
}

function categoryFor(product) {
  return product.product_type === "stock_item"
    ? inventoryCategories.find((row) => row.category_id === product.inventory_category_id)
    : menuCategories.find((row) => row.category_id === product.menu_category_id);
}

function responseRow(product) {
  const category = categoryFor(product);
  const unit = units.find((row) => row.unit_id === product.unit_id);
  const balance = state.balances.get(product.product_id);
  return {
    id: product.product_id,
    product_id: product.product_id,
    name: product.name,
    price: product.selling_price,
    quantity: product.product_type === "stock_item" ? Number(balance?.on_hand ?? 0) : 0,
    description: product.description,
    image: product.image_url,
    menu_code: `M-${String(product.product_id).padStart(3, "0")}`,
    availability_status: product.lifecycle_status === "archived" ? "Hidden" : "Available",
    is_promotional: 0,
    promo_price: null,
    promo_label: null,
    item_type: product.product_type,
    product_type: product.product_type,
    category: category?.name,
    category_system_key: product.product_type === "stock_item" ? null : category?.system_key,
    inventoryPromo: null,
    unit: unit?.abbreviation ?? "piece",
    stock: Number(balance?.on_hand ?? 0),
    dailyWithdrawn: 0,
    remainingStock: product.product_type === "stock_item" ? Number(balance?.on_hand ?? 0) : 0,
    manual_override: product.availability_override === "unavailable" ? 1 : 0,
    manual_status: product.availability_override === "unavailable" ? "Out of Stock" : "Available",
    use_default_thresholds: 0,
    low_stock_threshold: balance?.reorder_point ?? null,
    critical_stock_threshold: balance?.critical_point ?? null,
    tracking_method: product.tracking_method,
    shelf_life_days: product.shelf_life_days,
    lifecycle_status: product.lifecycle_status,
    availability_override: product.availability_override,
  };
}

async function query(sql, params = []) {
  const normalized = String(sql).replace(/\s+/g, " ").trim();
  state.sql.push(normalized);

  if (/^SELECT product_id FROM products WHERE LOWER/i.test(normalized)) {
    const name = String(params[0]).trim().toLowerCase();
    return [state.products.filter(
      (product) =>
        product.name.toLowerCase() === name &&
        (params[1] == null || product.product_id !== Number(params[1])),
    )];
  }
  if (/^SELECT category_id, name, system_key, is_active FROM menu_categories/i.test(normalized)) {
    const name = String(params[0]).trim().toLowerCase();
    return [[...menuCategories].filter((row) => row.name.toLowerCase() === name).slice(0, 1)];
  }
  if (/^SELECT category_id, name, system_key, is_active FROM inventory_categories/i.test(normalized)) {
    const name = String(params[0]).trim().toLowerCase();
    return [[...inventoryCategories].filter((row) => row.name.toLowerCase() === name).slice(0, 1)];
  }
  if (/^SELECT unit_id, name, abbreviation, system_key, is_active FROM units/i.test(normalized)) {
    const value = String(params[0]).trim().toLowerCase();
    return [[...units].filter((row) =>
      [row.name, row.abbreviation, row.system_key].some(
        (candidate) => String(candidate).toLowerCase() === value,
      ),
    ).slice(0, 1)];
  }
  if (/^INSERT INTO products/i.test(normalized)) {
    const product = {
      product_id: state.nextId++,
      name: params[0],
      product_type: params[1],
      menu_category_id: params[2],
      inventory_category_id: params[3],
      unit_id: params[4],
      selling_price: params[5],
      description: params[6],
      image_url: params[7],
      lifecycle_status: "active",
      availability_override: params[8],
      tracking_method: params[9],
      shelf_life_days: params[10],
    };
    state.products.push(product);
    return [{ insertId: product.product_id, affectedRows: 1 }];
  }
  if (/^INSERT INTO inventory_balances/i.test(normalized)) {
    state.balances.set(Number(params[0]), {
      on_hand: 0,
      reorder_point: Number(params[1]),
      critical_point: Number(params[2]),
    });
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT product_type FROM products WHERE product_id/i.test(normalized)) {
    const product = state.products.find((row) => row.product_id === Number(params[0]));
    return [product ? [{ product_type: product.product_type }] : []];
  }
  if (/^SELECT product_id, product_type, unit_id FROM products WHERE product_id IN/i.test(normalized)) {
    const ids = new Set(params[0].map(Number));
    return [state.products.filter((row) => ids.has(row.product_id)).map((row) => ({
      product_id: row.product_id,
      product_type: row.product_type,
      unit_id: row.unit_id,
    }))];
  }
  if (/^DELETE FROM product_recipes/i.test(normalized)) {
    state.recipes = state.recipes.filter((row) => row.parent_product_id !== Number(params[0]));
    return [{ affectedRows: 1 }];
  }
  if (/^INSERT INTO product_recipes/i.test(normalized)) {
    state.recipes.push({
      parent_product_id: Number(params[0]),
      ingredient_product_id: Number(params[1]),
      quantity_required: Number(params[2]),
      unit_id: Number(params[3]),
    });
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT recipe\.parent_product_id AS menu_product_id/i.test(normalized)) {
    const ids = new Set(params[0].map(Number));
    return [state.recipes.filter((recipe) => ids.has(recipe.parent_product_id)).map((recipe) => {
      const ingredient = state.products.find((row) => row.product_id === recipe.ingredient_product_id);
      const unit = units.find((row) => row.unit_id === recipe.unit_id);
      const balance = state.balances.get(recipe.ingredient_product_id);
      return {
        menu_product_id: recipe.parent_product_id,
        product_id: recipe.ingredient_product_id,
        quantity_required: recipe.quantity_required,
        product_name: ingredient.name,
        item_type: ingredient.product_type,
        unit: unit.abbreviation,
        daily_withdrawn: balance?.on_hand ?? 0,
        stock: balance?.on_hand ?? 0,
        usable_batch_stock: balance?.on_hand ?? 0,
      };
    })];
  }
  if (/^SELECT p\.product_id AS id,/i.test(normalized)) {
    let products = [...state.products];
    if (/WHERE p\.product_type IN \(\?, \?\)/i.test(normalized)) {
      const types = new Set(params.slice(0, 2));
      products = products.filter((row) => types.has(row.product_type));
    } else if (/WHERE p\.product_type = \?/i.test(normalized)) {
      products = products.filter((row) => row.product_type === params[0]);
    }
    if (/WHERE p\.product_id = \?/i.test(normalized)) {
      products = products.filter((row) => row.product_id === Number(params[0]));
    }
    return [products.map(responseRow)];
  }
  if (/^SELECT p\.\*, balance\.product_id AS balance_product_id/i.test(normalized)) {
    const product = state.products.find((row) => row.product_id === Number(params[0]));
    if (!product) return [[]];
    const balance = state.balances.get(product.product_id) ?? {};
    const category = categoryFor(product);
    const unit = units.find((row) => row.unit_id === product.unit_id);
    return [[{
      ...product,
      ...balance,
      balance_product_id: state.balances.has(product.product_id)
        ? product.product_id
        : null,
      menu_category_name: product.product_type === "stock_item" ? null : category?.name,
      menu_category_system_key: product.product_type === "stock_item" ? null : category?.system_key,
      inventory_category_name: product.product_type === "stock_item" ? category?.name : null,
      unit_name: unit?.name,
      unit_abbreviation: unit?.abbreviation,
    }]];
  }
  if (/^UPDATE products SET name =/i.test(normalized)) {
    const product = state.products.find((row) => row.product_id === Number(params[10]));
    Object.assign(product, {
      name: params[0],
      menu_category_id: params[1],
      inventory_category_id: params[2],
      unit_id: params[3],
      selling_price: params[4],
      description: params[5],
      image_url: params[6],
      availability_override: params[7],
      tracking_method: params[8],
      shelf_life_days: params[9],
    });
    return [{ affectedRows: 1 }];
  }
  if (/^UPDATE inventory_balances SET reorder_point/i.test(normalized)) {
    const balance = state.balances.get(Number(params[2]));
    balance.reorder_point = Number(params[0]);
    balance.critical_point = Number(params[1]);
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT product_id, product_type, lifecycle_status FROM products/i.test(normalized)) {
    const product = state.products.find((row) => row.product_id === Number(params[0]));
    return [product ? [product] : []];
  }
  if (/^UPDATE products SET lifecycle_status/i.test(normalized)) {
    const product = state.products.find((row) => row.product_id === Number(params[1]));
    product.lifecycle_status = params[0];
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT product_id, product_type FROM products/i.test(normalized)) {
    const product = state.products.find((row) => row.product_id === Number(params[0]));
    return [product ? [product] : []];
  }
  if (/^SELECT EXISTS\(SELECT 1 FROM inventory_batches/i.test(normalized)) {
    return [[state.dependencies ? { has_order_items: 1 } : { has_order_items: 0 }]];
  }
  if (/^DELETE FROM inventory_balances/i.test(normalized)) {
    state.balances.delete(Number(params[0]));
    return [{ affectedRows: 1 }];
  }
  if (/^DELETE FROM products WHERE product_id/i.test(normalized)) {
    const index = state.products.findIndex((row) => row.product_id === Number(params[0]));
    if (index < 0) return [{ affectedRows: 0 }];
    state.products.splice(index, 1);
    return [{ affectedRows: 1 }];
  }
  throw new Error(`Unhandled SQL in redesigned product test: ${normalized}`);
}

function connection() {
  let saved;
  return {
    query,
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
  };
}

const dbMock = {
  query,
  async getConnection() {
    return connection();
  },
};

const dbId = require.resolve("../config/db");
require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: dbMock };
const assertionsId = require.resolve("../services/schemaAssertions");
require.cache[assertionsId] = {
  id: assertionsId,
  filename: assertionsId,
  loaded: true,
  exports: { async assertTableColumns() { return true; } },
};
const handlers = require("./redesignedProductHandlers");

function response() {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  return { result, res };
}

async function invoke(handler, req, ...args) {
  const { result, res } = response();
  await handler(req, res, ...args);
  return result;
}

(async () => {
  reset();
  const ingredient = await invoke(handlers.createProduct, {
    body: {
      name: "Chicken Fillet",
      item_type: "stock_item",
      category: "Raw Materials",
      unit: "kg",
      quantity: 0,
      low_stock_threshold: 10,
      critical_stock_threshold: 2,
    },
  });
  assert.equal(ingredient.statusCode, 201);
  assert.equal(state.products[0].product_type, "stock_item");
  assert.equal(state.balances.get(1).on_hand, 0);

  const menuItem = await invoke(handlers.createProduct, {
    body: {
      name: "Chicken Meal",
      item_type: "menu_item",
      category: "Menu Food",
      price: 99,
      ingredients: [{ product_id: 1, quantity_required: 0.25 }],
      override_mode: "Auto",
    },
  });
  assert.equal(menuItem.statusCode, 201);
  assert.deepEqual(state.recipes, [{
    parent_product_id: 2,
    ingredient_product_id: 1,
    quantity_required: 0.25,
    unit_id: 5,
  }]);

  const flavor = await invoke(handlers.createProduct, {
    body: {
      name: "Dynamic Flavor",
      item_type: "menu_item",
      category: "Chicken Flavors",
      price: 0,
    },
  });
  assert.equal(flavor.statusCode, 201);
  assert.equal(state.products[2].product_type, "selection_option");
  assert.equal(state.products[2].selling_price, null);
  assert.equal(state.balances.has(3), false);
  assert.equal(state.recipes.some((row) => row.parent_product_id === 3), false);

  const menuList = await invoke(handlers.listProducts, {
    query: { item_type: "menu_item" },
  });
  assert.equal(menuList.statusCode, 200);
  assert.deepEqual(menuList.body.map((row) => row.name), ["Chicken Meal", "Dynamic Flavor"]);
  assert.equal(menuList.body[0].availability_status, "Out of Stock");
  assert.equal(menuList.body[1].item_type, "menu_item");
  assert.equal(menuList.body[1].product_type, "selection_option");
  assert.equal(
    state.sql.some((sql) => /\bMenu\b|\bInventory\b/.test(sql)),
    false,
    "redesigned handlers must not query legacy Menu or Inventory tables",
  );

  const updateFlavor = await invoke(handlers.updateProduct, {
    params: { id: "3" },
    body: {
      name: "Renamed Flavor",
      item_type: "menu_item",
      category: "Chicken Flavors",
      price: 0,
    },
  });
  assert.equal(updateFlavor.statusCode, 200);
  assert.equal(state.products[2].product_type, "selection_option");
  assert.equal(state.products[2].name, "Renamed Flavor");

  const archived = await invoke(handlers.setArchiveState, {
    params: { id: "3" },
  }, true);
  assert.equal(archived.statusCode, 200);
  assert.equal(state.products[2].lifecycle_status, "archived");

  state.dependencies = true;
  const protectedDelete = await invoke(handlers.deleteProduct, {
    params: { id: "3" },
    body: {},
  });
  assert.equal(protectedDelete.statusCode, 409);
  assert.equal(protectedDelete.body.code, "PRODUCT_HAS_PROTECTED_HISTORY");
  assert.equal(protectedDelete.body.canArchive, true);

  state.dependencies = false;
  const deleted = await invoke(handlers.deleteProduct, {
    params: { id: "3" },
    body: {},
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(state.products.some((row) => row.product_id === 3), false);

  const unsupportedPromotion = await invoke(handlers.createProduct, {
    body: {
      name: "Promo Meal",
      item_type: "menu_item",
      category: "Menu Food",
      price: 100,
      is_promotional: true,
      promo_price: 80,
    },
  });
  assert.equal(unsupportedPromotion.statusCode, 409);
  assert.match(unsupportedPromotion.body.message, /not represented/i);

  const duplicate = await invoke(handlers.createProduct, {
    body: {
      name: "Chicken Meal",
      item_type: "menu_item",
      category: "Menu Food",
      price: 120,
      ingredients: [],
    },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(state.rollbacks > 0, true);

  console.log("redesigned product CRUD handler tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
