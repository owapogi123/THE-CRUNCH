"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const mutationCalls = [];
const mutationServiceId = require.resolve("./redesignedInventoryMutationService");
require.cache[mutationServiceId] = {
  id: mutationServiceId,
  filename: mutationServiceId,
  loaded: true,
  exports: {
    async applyRedesignedInventoryMutation(_connection, input) {
      mutationCalls.push(input);
      return { onHand: 5 };
    },
    async executeRedesignedInventoryMutation() {},
  },
};

const {
  deductRedesignedStockForCompletedPaidOrder,
  prepareRedesignedOrderItemsAndStock,
} = require("./inventoryService");

function productRows({ withRecipe = true } = {}) {
  return [
    {
      productId: 10,
      productName: "1PCS Chicken",
      productType: "menu_item",
      sellingPrice: "99.00",
      lifecycleStatus: "active",
      availabilityOverride: "auto",
      categorySystemKey: "menu_food",
      ingredientProductId: withRecipe ? 3 : null,
      quantityRequired: withRecipe ? "1.5000" : null,
      ingredientName: withRecipe ? "Raw Chicken" : null,
      ingredientProductType: withRecipe ? "stock_item" : null,
      ingredientLifecycleStatus: withRecipe ? "active" : null,
      availableStock: withRecipe ? "10.0000" : null,
    },
    {
      productId: 20,
      productName: "Dynamic Flavor",
      productType: "selection_option",
      sellingPrice: null,
      lifecycleStatus: "active",
      availabilityOverride: "auto",
      categorySystemKey: "chicken_flavors",
      ingredientProductId: null,
      quantityRequired: null,
      ingredientName: null,
      ingredientProductType: null,
      ingredientLifecycleStatus: null,
      availableStock: null,
    },
  ];
}

(async () => {
  const sqlSeen = [];
  const prepareConnection = {
    async query(sql) {
      sqlSeen.push(String(sql));
      return [productRows()];
    },
  };
  const plan = await prepareRedesignedOrderItemsAndStock(
    prepareConnection,
    [{ product_id: 10, qty: 2, selected_flavor_product_id: 20 }],
    { requireChickenFlavorForMenuFood: true },
  );
  assert.equal(plan.authoritativeItems[0].subtotal, 198);
  assert.equal(plan.authoritativeItems[0].selected_flavor_product_id, 20);
  assert.equal(plan.authoritativeItems[0].selected_flavor_name, "Dynamic Flavor");
  assert.deepEqual([...plan.deductions.keys()], [3]);
  assert.equal(plan.deductions.get(3).requiredQty, 3);
  assert.ok(sqlSeen.every((sql) => !/\b(Menu|Inventory|order_item)\b/.test(sql)));

  await assert.rejects(
    () =>
      prepareRedesignedOrderItemsAndStock(
        { async query() { return [productRows({ withRecipe: false })]; } },
        [{ product_id: 10, qty: 1, selected_flavor_product_id: 20 }],
      ),
    (error) => error.code === "ORDER_RECIPE_MISSING",
  );

  const deductionSql = [];
  const deductionConnection = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      deductionSql.push(normalized);
      if (normalized.includes("FROM orders") && normalized.includes("FOR UPDATE")) {
        return [[{ order_id: 77, status: "Completed", payment_status: "Paid", stock_deducted: 0 }]];
      }
      if (normalized.includes("FROM order_items item")) {
        return [[
          {
            menuProductId: 10,
            orderQuantity: 2,
            ingredientProductId: 3,
            quantityRequired: "1.5000",
            ingredientProductType: "stock_item",
          },
        ]];
      }
      if (normalized.startsWith("UPDATE orders")) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    },
  };
  const deducted = await deductRedesignedStockForCompletedPaidOrder(
    77,
    5,
    deductionConnection,
  );
  assert.equal(deducted, true);
  assert.equal(mutationCalls.length, 1);
  assert.deepEqual(
    {
      productId: mutationCalls[0].productId,
      movementType: mutationCalls[0].movementType,
      quantity: mutationCalls[0].quantity,
      idempotencyKey: mutationCalls[0].idempotencyKey,
    },
    {
      productId: 3,
      movementType: "sale",
      quantity: 3,
      idempotencyKey: "order:77:product:3",
    },
  );
  assert.ok(deductionSql.some((sql) => sql.startsWith("INSERT INTO order_inventory_deductions")));
  assert.ok(deductionSql.some((sql) => sql.includes("SET stock_deducted = 1")));

  const callsBeforeReplay = mutationCalls.length;
  const replayResult = await deductRedesignedStockForCompletedPaidOrder(
    77,
    5,
    {
      async query(sql) {
        assert.ok(String(sql).includes("FROM orders"));
        return [[{
          order_id: 77,
          status: "Completed",
          payment_status: "Paid",
          stock_deducted: 1,
        }]];
      },
    },
  );
  assert.equal(replayResult, false);
  assert.equal(mutationCalls.length, callsBeforeReplay);

  console.log("Redesigned order inventory integration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
