"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const calls = [];
const dbMock = {
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    calls.push({ sql: normalized, params });
    if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
      return [[
        { TABLE_NAME: "products", COLUMN_NAME: "id" },
        { TABLE_NAME: "products", COLUMN_NAME: "item_type" },
      ]];
    }
    if (/FROM Menu m LEFT JOIN products p/i.test(normalized)) {
      return [[{
        product_id: 7,
        category_name: "Legacy Meals",
        product_name: "Legacy Chicken",
        price: "88.00",
        description: "Legacy response",
        promo_label: "",
        image: "",
        availability_status: "Available",
      }]];
    }
    if (/FROM products p LEFT JOIN Menu m/i.test(normalized)) {
      return [[]];
    }
    if (/WHERE p\.product_type = \? AND p\.lifecycle_status = 'active' ORDER BY category\.display_order/i.test(normalized)) {
      if (/category\.system_key = \?/i.test(normalized)) {
        return [[{
          id: 44,
          product_id: 44,
          name: "Database Flavor",
          description: "Dynamic label",
          image: "/uploads/flavor.webp",
        }]];
      }
      return [[{
        product_id: 9,
        category_name: "Menu Food",
        product_name: "Chicken Meal",
        price: "99.00",
        description: "Meal description",
        promo_label: "",
        image: "/uploads/meal.webp",
        availability_status: "Available",
      }]];
    }
    throw new Error(`Unexpected content SQL: ${normalized}`);
  },
};

const dbId = require.resolve("../config/db");
require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: dbMock };
const router = require("./contentRoutes");

function handler(path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.get,
  );
  assert.ok(layer, `GET ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(path) {
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
  await handler(path)({}, res);
  return result;
}

(async () => {
  const flavors = await invoke("/flavors");
  assert.equal(flavors.statusCode, 200);
  assert.deepEqual(flavors.body.map((row) => row.name), ["Database Flavor"]);
  assert.equal(flavors.body[0].product_id, 44);
  assert.equal(calls[0].params[0], "chicken_flavors");
  assert.equal(calls[0].params[1], "selection_option");

  const sections = await invoke("/menu-sections");
  assert.equal(sections.statusCode, 200);
  assert.equal(sections.body.length, 1);
  assert.equal(sections.body[0].items[0].name, "Chicken Meal");

  const callsBeforePromos = calls.length;
  const promos = await invoke("/promos");
  assert.equal(promos.statusCode, 200);
  assert.deepEqual(promos.body, []);
  assert.equal(calls.length, callsBeforePromos);

  assert.equal(
    calls.some((call) => /\bMenu\b|\bInventory\b/.test(call.sql)),
    false,
    "redesigned content routes must not query legacy tables",
  );

  process.env.DB_SCHEMA_PROFILE = "legacy";
  const callsBeforeLegacyFlavors = calls.length;
  const legacyFlavors = await invoke("/flavors");
  assert.equal(legacyFlavors.statusCode, 200);
  assert.equal(legacyFlavors.body.length > 0, true);
  assert.equal(calls.length, callsBeforeLegacyFlavors);

  const legacySections = await invoke("/menu-sections");
  assert.equal(legacySections.statusCode, 200);
  assert.equal(legacySections.body[0].items[0].name, "Legacy Chicken");
  assert.equal(
    calls.some((call) => /FROM Menu m LEFT JOIN products p/i.test(call.sql)),
    true,
    "legacy profile must retain the existing Menu-backed query",
  );

  console.log("content route legacy and redesigned profile tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
