"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const { loadAuthoritativeOrderItems } = require("./orderItemService");

(async () => {
  const sqlSeen = [];
  const connection = {
    async query(sql) {
      sqlSeen.push(String(sql));
      return [[
        {
          productId: 10,
          productName: "1PCS Chicken",
          currentPrice: "99.00",
          productType: "menu_item",
          lifecycleStatus: "active",
          availabilityOverride: "auto",
          categorySystemKey: "menu_food",
        },
        {
          productId: 20,
          productName: "Dynamic Flavor",
          currentPrice: null,
          productType: "selection_option",
          lifecycleStatus: "active",
          availabilityOverride: "auto",
          categorySystemKey: "chicken_flavors",
        },
      ]];
    },
  };
  const items = await loadAuthoritativeOrderItems(connection, [
    { product_id: 10, qty: 2, selected_flavor_product_id: 20 },
  ]);
  assert.deepEqual(items, [{
    product_id: 10,
    qty: 2,
    name: "1PCS Chicken",
    price: 99,
    subtotal: 198,
    selected_flavor_product_id: 20,
    selected_flavor_name: "Dynamic Flavor",
  }]);
  assert.ok(sqlSeen[0].includes("p.product_id"));
  assert.ok(!sqlSeen[0].includes("LEFT JOIN Menu"));

  await assert.rejects(
    () => loadAuthoritativeOrderItems(connection, [{ product_id: 10, qty: 1 }]),
    /Choose one chicken flavor/i,
  );

  console.log("Redesigned authoritative order-item tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
