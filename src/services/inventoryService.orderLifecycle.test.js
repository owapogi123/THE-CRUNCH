"use strict";

const assert = require("node:assert/strict");

const state = {
  orderStatus: "Queued",
  paymentStatus: "Paid",
  stockDeducted: 0,
  inventoryStock: 10,
  inventoryUpdates: 0,
  commits: 0,
  rollbacks: 0,
};

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const connection = {
  async beginTransaction() {},
  async commit() { state.commits += 1; },
  async rollback() { state.rollbacks += 1; },
  release() {},
  async query(sql) {
    const query = String(sql).replace(/\s+/g, " ").trim();
    if (query.includes("FROM orders") && query.endsWith("FOR UPDATE")) {
      return [[{
        orderId: 55,
        orderStatus: state.orderStatus,
        paymentStatus: state.paymentStatus,
        stockDeducted: state.stockDeducted,
      }]];
    }
    if (query.includes("FROM order_item")) {
      return [[{
        productId: 5,
        quantity: 2,
        product_name: "Chicken Meal",
        manual_override: 0,
        manual_status: "Available",
        item_type: "menu_item",
      }]];
    }
    if (query.startsWith("SELECT i.Product_ID AS productId")) {
      return [[{ productId: 21, mainStock: state.inventoryStock }]];
    }
    if (query.startsWith("SELECT Product_ID FROM Menu")) {
      return [[{ Product_ID: 21 }]];
    }
    if (query.startsWith("UPDATE Inventory SET Stock")) {
      state.inventoryStock -= 1;
      state.inventoryUpdates += 1;
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith("UPDATE orders SET stock_deducted = 1")) {
      if (state.stockDeducted === 1) return [{ affectedRows: 0 }];
      state.stockDeducted = 1;
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  },
};

mockModule("../config/db", {
  async getConnection() { return connection; },
});
mockModule("../utils/menuAvailability", {
  async fetchMenuIngredients() {
    return new Map([[5, [{
      product_id: 21,
      product_name: "Chicken",
      item_type: "stock_item",
      quantity_required: 0.5,
      stock: state.inventoryStock,
    }]]]);
  },
  isAutoMenuMissingIngredients() { return false; },
});
mockModule("../utils/productItemType", {
  MENU_ITEM: "menu_item",
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "p.item_type"; },
});
mockModule("./orderItemService", {
  normalizeOrderItems(items) { return items; },
});

const { deductStockForPaidOrder } = require("./inventoryService");

(async () => {
  assert.equal(await deductStockForPaidOrder(55), true);
  assert.equal(state.inventoryUpdates, 1, "accepted queued paid order must deduct");
  assert.equal(state.inventoryStock, 9);
  assert.equal(state.stockDeducted, 1);

  assert.equal(await deductStockForPaidOrder(55), false);
  assert.equal(state.inventoryUpdates, 1, "repeat acceptance must not double-deduct");

  state.stockDeducted = 0;
  state.orderStatus = "Queued";
  state.paymentStatus = "Pending Payment";
  assert.equal(await deductStockForPaidOrder(55), false);
  assert.equal(state.inventoryUpdates, 1, "unpaid acceptance must not deduct");

  state.paymentStatus = "Paid";
  state.orderStatus = "Preparing";
  assert.equal(await deductStockForPaidOrder(55), false);
  assert.equal(state.inventoryUpdates, 1);

  state.orderStatus = "Ready for Pickup";
  assert.equal(await deductStockForPaidOrder(55), false);
  assert.equal(state.inventoryUpdates, 1, "ready transition must not deduct");

  state.orderStatus = "Completed";
  assert.equal(await deductStockForPaidOrder(55), false);
  assert.equal(state.inventoryUpdates, 1, "completion must not deduct");
  assert.equal(state.rollbacks, 0);

  console.log("Paid queue-acceptance inventory deduction tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
