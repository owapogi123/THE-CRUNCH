const assert = require("node:assert/strict");

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../utils/productItemType", {
  MENU_ITEM: "menu_item",
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() {
    return true;
  },
  getProductItemTypeExpression() {
    return "item_type";
  },
});

const { prepareOrderItemsAndStock } = require("./inventoryService");

function connectionFor(rows) {
  return {
    async query(sql) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.startsWith("SELECT p.id AS productId")) return [rows];
      return [{ affectedRows: 0 }];
    },
  };
}

function productRow(overrides = {}) {
  return {
    productId: 7,
    productName: "Chicken Bowl",
    currentPrice: 99,
    manualOverride: 0,
    manualStatus: "Available",
    itemType: "menu_item",
    ingredientProductId: 21,
    ingredientQuantityRequired: 2,
    stockProductName: "Chicken",
    stockItemType: "stock_item",
    inventoryProductId: 21,
    availableStock: 10,
    ...overrides,
  };
}

(async () => {
  const valid = await prepareOrderItemsAndStock(connectionFor([productRow()]), [
    { product_id: 7, qty: 2 },
  ]);
  assert.equal(valid.authoritativeItems[0].subtotal, 198);
  assert.equal(valid.deductions.get(21).requiredQty, 4);

  const mealWithFlavor = await prepareOrderItemsAndStock(
    connectionFor([
      productRow({ categorySystemKey: "menu_food" }),
      productRow({
        productId: 30,
        productName: "Dynamic Test Flavor",
        currentPrice: 15,
        categorySystemKey: "chicken_flavors",
        ingredientQuantityRequired: 0.5,
      }),
    ]),
    [{ product_id: 7, qty: 2, selected_flavor_product_id: 30 }],
    { requireChickenFlavorForMenuFood: true },
  );
  assert.equal(mealWithFlavor.authoritativeItems.length, 1);
  assert.equal(mealWithFlavor.authoritativeItems[0].subtotal, 198);
  assert.equal(mealWithFlavor.authoritativeItems[0].selected_flavor_product_id, 30);
  assert.equal(mealWithFlavor.authoritativeItems[0].selected_flavor_name, "Dynamic Test Flavor");
  assert.equal(
    mealWithFlavor.deductions.get(21).requiredQty,
    4,
    "selection-only flavor recipes must not change the base meal deduction",
  );

  await assert.rejects(
    () => prepareOrderItemsAndStock(
      connectionFor([productRow({ categorySystemKey: "menu_food" })]),
      [{ product_id: 7, qty: 1 }],
      { requireChickenFlavorForMenuFood: true },
    ),
    /Choose one chicken flavor/i,
  );

  const sharedDecimalIngredient = await prepareOrderItemsAndStock(
    connectionFor([
      productRow({ ingredientQuantityRequired: 0.1255 }),
      productRow({
        productId: 8,
        productName: "Chicken Wrap",
        currentPrice: 75,
        ingredientQuantityRequired: 0.25,
      }),
    ]),
    [
      { product_id: 7, qty: 2 },
      { product_id: 8, qty: 3 },
    ],
  );
  assert.equal(
    sharedDecimalIngredient.deductions.get(21).requiredQty,
    1.001,
    "shared decimal ingredients must be aggregated once before snapshotting",
  );

  await assert.rejects(
    () =>
      prepareOrderItemsAndStock(
        connectionFor([
          productRow({ manualOverride: 1, manualStatus: "Out of Stock" }),
        ]),
        [{ product_id: 7, qty: 1 }],
      ),
    /unavailable/i,
  );

  await assert.rejects(
    () =>
      prepareOrderItemsAndStock(
        connectionFor([productRow({ availableStock: 1 })]),
        [{ product_id: 7, qty: 1 }],
      ),
    /Insufficient stock/i,
  );

  // A legacy Force Available row is evaluated as Auto: sufficient stock is
  // orderable, but the legacy override cannot bypass ingredient stock checks.
  const legacyAuto = await prepareOrderItemsAndStock(
    connectionFor([
      productRow({ manualOverride: 1, manualStatus: "Available" }),
    ]),
    [{ product_id: 7, qty: 1 }],
  );
  assert.equal(legacyAuto.authoritativeItems.length, 1);

  await assert.rejects(
    () =>
      prepareOrderItemsAndStock(
        connectionFor([
          productRow({
            manualOverride: 1,
            manualStatus: "Available",
            availableStock: 0,
          }),
        ]),
        [{ product_id: 7, qty: 1 }],
      ),
    /Insufficient stock/i,
  );

  console.log("Order availability API enforcement tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
