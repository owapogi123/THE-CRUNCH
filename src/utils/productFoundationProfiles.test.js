"use strict";

const assert = require("node:assert/strict");
const {
  MENU_ITEM,
  SELECTION_OPTION,
  STOCK_ITEM,
  assertProductsMatchItemType,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
  normalizeItemType,
} = require("./productItemType");
const {
  LEGACY_PRODUCT_SCHEMA_CONTRACT,
  REDESIGNED_PRODUCT_SCHEMA_CONTRACT,
  ensureProductSchema,
  getProductSchemaContract,
} = require("../services/productSchemaService");
const {
  REDESIGNED_AVAILABILITY_SCHEMA_CONTRACT,
  ensureMenuAvailabilitySchema,
  fetchMenuIngredients,
  replaceMenuIngredients,
} = require("./menuAvailability");

const originalProfile = process.env.DB_SCHEMA_PROFILE;

function useProfile(profile) {
  process.env.DB_SCHEMA_PROFILE = profile;
}

function rowsForContract(contract) {
  return Object.entries(contract).flatMap(([tableName, columns]) =>
    columns.map((columnName) => ({
      TABLE_NAME: tableName,
      COLUMN_NAME: columnName,
    })),
  );
}

function schemaOnlyDb(contract, calls = []) {
  return {
    async query(sql, params) {
      calls.push({ sql, params });
      assert.match(sql, /information_schema\.COLUMNS/i);
      return [rowsForContract(contract)];
    },
  };
}

async function testProductTypeProfiles() {
  assert.equal(normalizeItemType("menu_item"), MENU_ITEM);
  assert.equal(normalizeItemType("stock_item"), STOCK_ITEM);
  assert.equal(normalizeItemType("selection_option"), SELECTION_OPTION);

  useProfile("legacy");
  assert.match(getProductItemTypeExpression(true, "p", "m"), /p\.item_type/);
  assert.match(getProductItemTypeExpression(true, "p", "m"), /m\.Product_ID/);
  await ensureProductsItemTypeSchema(
    schemaOnlyDb({ products: ["id", "item_type"] }),
  );

  const legacyCalls = [];
  const legacyDb = {
    async query(sql, params) {
      legacyCalls.push({ sql, params });
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [rowsForContract({ products: ["id", "item_type"] })];
      }
      return [[{
        id: 10,
        effective_item_type: "menu_item",
        promo: "",
        category_name: "Menu Food",
      }]];
    },
  };
  await assertProductsMatchItemType(legacyDb, [10], MENU_ITEM, "Menu");
  assert.match(legacyCalls.at(-1).sql, /LEFT JOIN Menu/);

  useProfile("redesigned");
  assert.equal(
    getProductItemTypeExpression(true, "product", "ignored"),
    "LOWER(TRIM(product.product_type))",
  );
  await ensureProductsItemTypeSchema(
    schemaOnlyDb({ products: ["product_id", "product_type"] }),
  );

  const redesignedCalls = [];
  const redesignedDb = {
    async query(sql, params) {
      redesignedCalls.push({ sql, params });
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [rowsForContract({ products: ["product_id", "product_type"] })];
      }
      return [[{
        id: 20,
        effective_item_type: "selection_option",
        selling_price: null,
        category_system_key: "chicken_flavors",
        balance_product_id: null,
      }]];
    },
  };
  await assertProductsMatchItemType(
    redesignedDb,
    [20],
    SELECTION_OPTION,
    "Chicken Flavor",
  );
  assert.match(redesignedCalls.at(-1).sql, /p\.product_id/);
  assert.match(redesignedCalls.at(-1).sql, /menu_categories/);
  assert.doesNotMatch(redesignedCalls.at(-1).sql, /\bMenu\b/);

  const invalidFlavorDb = {
    async query(sql) {
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [rowsForContract({ products: ["product_id", "product_type"] })];
      }
      return [[{
        id: 21,
        effective_item_type: "selection_option",
        selling_price: null,
        category_system_key: "chicken_flavors",
        balance_product_id: 21,
      }]];
    },
  };
  await assert.rejects(
    assertProductsMatchItemType(
      invalidFlavorDb,
      [21],
      SELECTION_OPTION,
      "Chicken Flavor",
    ),
    /cannot have an inventory balance/i,
  );
}

async function testProductSchemaProfiles() {
  useProfile("legacy");
  assert.equal(getProductSchemaContract(), LEGACY_PRODUCT_SCHEMA_CONTRACT);
  await ensureProductSchema(schemaOnlyDb(LEGACY_PRODUCT_SCHEMA_CONTRACT));

  useProfile("redesigned");
  assert.equal(getProductSchemaContract(), REDESIGNED_PRODUCT_SCHEMA_CONTRACT);
  await ensureProductSchema(schemaOnlyDb(REDESIGNED_PRODUCT_SCHEMA_CONTRACT));
  assert.deepEqual(
    REDESIGNED_PRODUCT_SCHEMA_CONTRACT.product_recipes,
    ["parent_product_id", "ingredient_product_id", "quantity_required", "unit_id"],
  );
}

async function testAvailabilitySchemaProfiles() {
  useProfile("redesigned");
  const redesignedCalls = [];
  await ensureMenuAvailabilitySchema(
    schemaOnlyDb(REDESIGNED_AVAILABILITY_SCHEMA_CONTRACT, redesignedCalls),
  );
  assert.equal(redesignedCalls.length, 1);
  assert.doesNotMatch(redesignedCalls[0].sql, /ALTER TABLE|CREATE TABLE/i);

  useProfile("legacy");
  const legacyCalls = [];
  await ensureMenuAvailabilitySchema({
    async query(sql, params) {
      legacyCalls.push({ sql, params });
      if (/SHOW COLUMNS/i.test(sql)) return [[]];
      return [{ affectedRows: 0 }];
    },
  });
  assert.ok(legacyCalls.some(({ sql }) => /ALTER TABLE Menu/i.test(sql)));
  assert.ok(
    legacyCalls.some(({ sql }) => /CREATE TABLE IF NOT EXISTS menu_item_ingredients/i.test(sql)),
  );
}

async function testIngredientReadsByProfile() {
  useProfile("redesigned");
  const redesignedCalls = [];
  const redesigned = await fetchMenuIngredients({
    async query(sql, params) {
      redesignedCalls.push({ sql, params });
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [rowsForContract({ products: ["product_id", "product_type"] })];
      }
      return [[{
        menu_product_id: 10,
        product_id: 30,
        quantity_required: "2.5000",
        product_name: "Chicken",
        item_type: "stock_item",
        unit: "pc",
        daily_withdrawn: "8.0000",
        stock: "8.0000",
        usable_batch_stock: "8.0000",
      }]];
    },
  }, [10]);
  assert.equal(redesigned.get(10)[0].stock, 8);
  const redesignedSql = redesignedCalls.at(-1).sql;
  assert.match(redesignedSql, /FROM product_recipes/);
  assert.match(redesignedSql, /inventory_balances/);
  assert.match(redesignedSql, /inventory_batches/);
  assert.match(redesignedSql, /INNER JOIN units/);
  assert.match(redesignedSql, /parent\.product_type = 'menu_item'/);

  useProfile("legacy");
  const legacyCalls = [];
  const legacy = await fetchMenuIngredients({
    async query(sql, params) {
      legacyCalls.push({ sql, params });
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [rowsForContract({ products: ["id", "item_type"] })];
      }
      return [[{
        menu_product_id: 11,
        product_id: 31,
        quantity_required: 1,
        product_name: "Rice",
        item_type: "stock_item",
        unit: "cup",
        daily_withdrawn: 4,
        stock: 4,
      }]];
    },
  }, [11]);
  assert.equal(legacy.get(11)[0].stock, 4);
  assert.match(legacyCalls.at(-1).sql, /FROM menu_item_ingredients/);
  assert.match(legacyCalls.at(-1).sql, /LEFT JOIN Inventory/);
}

async function testIngredientWritesByProfile() {
  useProfile("redesigned");
  const calls = [];
  const requestedIngredients = [{ productId: 30, quantityRequired: 2.5 }];
  await replaceMenuIngredients({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT product_type\s+FROM products/i.test(sql)) {
        return [[{ product_type: "menu_item" }]];
      }
      if (/SELECT product_id, product_type, unit_id/i.test(sql)) {
        return [[{ product_id: 30, product_type: "stock_item", unit_id: 7 }]];
      }
      return [{ affectedRows: 1 }];
    },
  }, 10, requestedIngredients);
  const insert = calls.find(({ sql }) => /INSERT INTO product_recipes/i.test(sql));
  assert.deepEqual(insert.params, [10, 30, 2.5, 7]);
  assert.deepEqual(requestedIngredients, [
    { productId: 30, quantityRequired: 2.5 },
  ]);

  const rejectedCalls = [];
  await assert.rejects(
    replaceMenuIngredients({
      async query(sql, params) {
        rejectedCalls.push({ sql, params });
        return [[{ product_type: "selection_option" }]];
      },
    }, 20, [{ productId: 30, quantityRequired: 1 }]),
    /cannot have ingredient mappings/i,
  );
  assert.equal(
    rejectedCalls.some(({ sql }) => /DELETE FROM product_recipes/i.test(sql)),
    false,
  );

  useProfile("legacy");
  const legacyCalls = [];
  await replaceMenuIngredients({
    async query(sql, params) {
      legacyCalls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  }, 12, [{ productId: 32, quantityRequired: 1 }]);
  assert.match(legacyCalls[0].sql, /DELETE FROM menu_item_ingredients/);
  assert.match(legacyCalls[1].sql, /INSERT INTO menu_item_ingredients/);
}

(async () => {
  try {
    await testProductTypeProfiles();
    await testProductSchemaProfiles();
    await testAvailabilitySchemaProfiles();
    await testIngredientReadsByProfile();
    await testIngredientWritesByProfile();
    console.log("product foundation profile tests passed");
  } finally {
    if (originalProfile === undefined) delete process.env.DB_SCHEMA_PROFILE;
    else process.env.DB_SCHEMA_PROFILE = originalProfile;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
