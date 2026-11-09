"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const state = {
  menuCategories: [
    { category_id: 1, name: "Menu Food", system_key: "menu_food", display_order: 1, is_active: 1 },
    { category_id: 2, name: "Chicken Flavors", system_key: "chicken_flavors", display_order: 2, is_active: 1 },
    { category_id: 3, name: "Seasonal", system_key: null, display_order: 3, is_active: 1 },
    { category_id: 4, name: "Drinks", system_key: null, display_order: 4, is_active: 1 },
  ],
  inventoryCategories: [
    { category_id: 10, name: "Raw Materials", system_key: "raw_materials", is_active: 1 },
    { category_id: 11, name: "Supplies", system_key: null, is_active: 1 },
  ],
  products: [
    { product_id: 101, product_type: "menu_item", menu_category_id: 1, inventory_category_id: null },
    { product_id: 102, product_type: "selection_option", menu_category_id: 2, inventory_category_id: null },
    { product_id: 103, product_type: "stock_item", menu_category_id: null, inventory_category_id: 10 },
  ],
  began: 0,
  committed: 0,
  rolledBack: 0,
  released: 0,
  sql: [],
};

function categoryTable(sql) {
  if (sql.includes("inventory_categories")) return state.inventoryCategories;
  if (sql.includes("menu_categories")) return state.menuCategories;
  return null;
}

function findCategory(table, id) {
  return table.find((row) => Number(row.category_id) === Number(id));
}

function snapshot() {
  return {
    menuCategories: structuredClone(state.menuCategories),
    inventoryCategories: structuredClone(state.inventoryCategories),
  };
}

function restore(saved) {
  state.menuCategories = saved.menuCategories;
  state.inventoryCategories = saved.inventoryCategories;
}

function createConnection() {
  let saved;
  return {
    async beginTransaction() {
      state.began += 1;
      saved = snapshot();
    },
    async commit() {
      state.committed += 1;
      saved = null;
    },
    async rollback() {
      state.rolledBack += 1;
      if (saved) restore(saved);
      saved = null;
    },
    release() {
      state.released += 1;
    },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      state.sql.push(normalized);
      assert.doesNotMatch(
        normalized,
        /\bMenu\b|\bp\.id\b|\bp\.item_type\b/,
        `redesigned category operation used legacy SQL: ${normalized}`,
      );

      const table = categoryTable(normalized);
      if (/^SELECT name(?:, system_key)? FROM (?:menu|inventory)_categories/i.test(normalized)) {
        const row = findCategory(table, params[0]);
        return [row ? [{ name: row.name, system_key: row.system_key ?? null }] : []];
      }
      if (/^SELECT category_id FROM menu_categories/i.test(normalized)) {
        const [name, excludedId] = params;
        const duplicate = state.menuCategories.find(
          (row) =>
            row.name.toLowerCase() === String(name).toLowerCase() &&
            Number(row.category_id) !== Number(excludedId),
        );
        return [duplicate ? [{ category_id: duplicate.category_id }] : []];
      }
      if (/^UPDATE menu_categories SET/i.test(normalized)) {
        const row = findCategory(state.menuCategories, params.at(-1));
        if (!row) return [{ affectedRows: 0 }];
        let index = 0;
        if (/\bname = \?/i.test(normalized)) row.name = String(params[index++]);
        if (/\bdisplay_order = \?/i.test(normalized)) row.display_order = Number(params[index++]);
        if (/\bis_active = \?/i.test(normalized)) row.is_active = Number(params[index++]);
        return [{ affectedRows: 1 }];
      }
      if (/^SELECT category_id, name, system_key, display_order, is_active/i.test(normalized)) {
        const row = findCategory(state.menuCategories, params[0]);
        return [row ? [{ ...row, created_at: null, updated_at: null }] : []];
      }
      if (/^SELECT p\.product_id FROM products p WHERE p\.menu_category_id = \?/i.test(normalized)) {
        return [state.products
          .filter((product) => Number(product.menu_category_id) === Number(params[0]))
          .map((product) => ({ product_id: product.product_id }))];
      }
      if (/^SELECT p\.product_id FROM products p WHERE p\.inventory_category_id = \?/i.test(normalized)) {
        return [state.products
          .filter((product) => Number(product.inventory_category_id) === Number(params[0]))
          .map((product) => ({ product_id: product.product_id }))];
      }
      if (/^DELETE FROM (?:menu|inventory)_categories WHERE category_id = \?/i.test(normalized)) {
        const index = table.findIndex(
          (row) => Number(row.category_id) === Number(params[0]),
        );
        if (index < 0) return [{ affectedRows: 0 }];
        table.splice(index, 1);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected redesigned category SQL: ${normalized}`);
    },
  };
}

const dbMock = {
  async getConnection() {
    return createConnection();
  },
  async query() {
    throw new Error("Direct database query was not expected in this focused test");
  },
};

const dbId = require.resolve("../config/db");
require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: dbMock };
const router = require("./settingsRoutes");

function routeHandler(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(path, method, id, body = {}) {
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
  await routeHandler(path, method)(
    { params: { id: String(id) }, body },
    res,
  );
  return result;
}

(async () => {
  const renamed = await invoke(
    "/menu-categories/:id",
    "patch",
    1,
    { name: "Meals" },
  );
  assert.equal(renamed.statusCode, 200);
  assert.equal(findCategory(state.menuCategories, 1).name, "Meals");
  assert.equal(state.products[0].menu_category_id, 1);

  const duplicate = await invoke(
    "/menu-categories/:id",
    "patch",
    1,
    { name: "dRiNkS" },
  );
  assert.equal(duplicate.statusCode, 409);
  assert.equal(findCategory(state.menuCategories, 1).name, "Meals");

  const protectedRename = await invoke(
    "/menu-categories/:id",
    "patch",
    2,
    { name: "Sauce Choices" },
  );
  assert.equal(protectedRename.statusCode, 409);
  assert.equal(protectedRename.body.code, "SYSTEM_CATEGORY_PROTECTED");

  const protectedDisable = await invoke(
    "/menu-categories/:id",
    "patch",
    2,
    { is_active: false },
  );
  assert.equal(protectedDisable.statusCode, 409);
  assert.equal(findCategory(state.menuCategories, 2).is_active, 1);

  const protectedDelete = await invoke(
    "/menu-categories/:id",
    "delete",
    2,
  );
  assert.equal(protectedDelete.statusCode, 409);
  assert.equal(protectedDelete.body.code, "SYSTEM_CATEGORY_PROTECTED");

  const usedMenuDelete = await invoke(
    "/menu-categories/:id",
    "delete",
    1,
  );
  assert.equal(usedMenuDelete.statusCode, 409);
  assert.equal(usedMenuDelete.body.code, "CATEGORY_IN_USE");
  assert.equal(usedMenuDelete.body.dependency_count, 1);

  const unusedMenuDelete = await invoke(
    "/menu-categories/:id",
    "delete",
    3,
  );
  assert.equal(unusedMenuDelete.statusCode, 200);
  assert.equal(findCategory(state.menuCategories, 3), undefined);

  const usedInventoryDelete = await invoke(
    "/inventory-categories/:id",
    "delete",
    10,
  );
  assert.equal(usedInventoryDelete.statusCode, 409);
  assert.equal(usedInventoryDelete.body.dependency_count, 1);

  const unusedInventoryDelete = await invoke(
    "/inventory-categories/:id",
    "delete",
    11,
  );
  assert.equal(unusedInventoryDelete.statusCode, 200);
  assert.equal(findCategory(state.inventoryCategories, 11), undefined);

  assert.equal(state.began, state.committed + state.rolledBack);
  assert.equal(state.released, state.began);
  assert.equal(
    state.sql.some((sql) => /FROM products p WHERE p\.menu_category_id = \? FOR UPDATE/i.test(sql)),
    true,
  );
  assert.equal(
    state.sql.some((sql) => /FROM products p WHERE p\.inventory_category_id = \? FOR UPDATE/i.test(sql)),
    true,
  );

  console.log("redesigned category rename and deletion compatibility tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
