"use strict";

const assert = require("node:assert/strict");

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../utils/productItemType", {
  MENU_ITEM: "menu_item",
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "item_type"; },
});
mockModule("../utils/menuAvailability", {
  async fetchMenuIngredients() {
    return new Map([
      [10, [
        { product_id: 100, quantity_required: 2, item_type: "stock_item", product_name: "Chicken" },
        { product_id: 101, quantity_required: 1, item_type: "stock_item", product_name: "Rice" },
      ]],
      [20, [
        { product_id: 100, quantity_required: 0.5, item_type: "stock_item", product_name: "Chicken" },
        { product_id: 102, quantity_required: 0.25, item_type: "stock_item", product_name: "Seasoning" },
      ]],
    ]);
  },
  isAutoMenuMissingIngredients() { return false; },
});

const { getOrderIngredientDeductions } = require("./inventoryService");

(async () => {
  let orderItemQueryCount = 0;
  const connection = {
    async query(sql) {
      if (String(sql).includes("FROM order_item oi")) {
        orderItemQueryCount += 1;
        return [[
          { productId: 10, quantity: 2, product_name: "2PCS Meal", item_type: "menu_item" },
        ]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const deductions = await getOrderIngredientDeductions(77, connection, {
    enforceAutoRecipe: true,
  });
  assert.equal(orderItemQueryCount, 1, "meal and flavor rows must be loaded in one deduction plan");
  assert.equal(deductions.get(100).requiredQty, 4, "the base meal recipe must remain intact");
  assert.equal(deductions.get(101).requiredQty, 2);
  assert.equal(deductions.has(102), false, "flavor recipe ingredients must not be deducted");
  assert.equal(deductions.size, 2);
  console.log("Selection-only chicken flavor deduction tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
