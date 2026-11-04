"use strict";

const assert = require("node:assert/strict");

function createLock() {
  let held = false;
  const waiters = [];
  return {
    async acquire() {
      if (!held) {
        held = true;
        return;
      }
      await new Promise((resolve) => waiters.push(resolve));
    },
    release() {
      const next = waiters.shift();
      if (next) next();
      else held = false;
    },
  };
}

const state = {
  inventoryStock: 192,
  inventoryUpdates: 0,
  snapshots: new Map(),
  orders: new Map(),
  orderLocks: new Map(),
  inventoryLock: createLock(),
};

function resetState(requirementA = 192, requirementB = 50) {
  state.inventoryStock = 192;
  state.inventoryUpdates = 0;
  state.snapshots = new Map();
  state.orders = new Map([
    [101, { status: "Queued", paymentStatus: "Paid", stockDeducted: 0, quantity: requirementA }],
    [102, { status: "Queued", paymentStatus: "Paid", stockDeducted: 0, quantity: requirementB }],
  ]);
  state.orderLocks = new Map();
  state.inventoryLock = createLock();
}

function getOrderLock(orderId) {
  if (!state.orderLocks.has(orderId)) state.orderLocks.set(orderId, createLock());
  return state.orderLocks.get(orderId);
}

function createConnection() {
  const heldLocks = [];
  let activeOrderId = null;
  const releaseLocks = () => {
    while (heldLocks.length) heldLocks.pop().release();
  };
  return {
    async beginTransaction() {},
    async commit() { releaseLocks(); },
    async rollback() { releaseLocks(); },
    release() { releaseLocks(); },
    async query(sql, params = []) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.includes("FROM orders") && query.endsWith("FOR UPDATE")) {
        activeOrderId = Number(params[0]);
        const lock = getOrderLock(activeOrderId);
        await lock.acquire();
        heldLocks.push(lock);
        const order = state.orders.get(activeOrderId);
        return [[{
          orderId: activeOrderId,
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
          stockDeducted: order.stockDeducted,
        }]];
      }
      if (query.includes("FROM order_item")) {
        const order = state.orders.get(Number(params[0]));
        return [[{
          productId: 5,
          quantity: order.quantity,
          product_name: "Chicken Meal",
          item_type: "menu_item",
        }]];
      }
      if (query.startsWith("SELECT i.Product_ID AS productId")) {
        await state.inventoryLock.acquire();
        heldLocks.push(state.inventoryLock);
        return [[{ productId: 21, mainStock: state.inventoryStock }]];
      }
      if (query.startsWith("SELECT Product_ID FROM Menu")) {
        return [[{ Product_ID: 21 }]];
      }
      if (query.startsWith("SELECT Admin_ID")) return [[]];
      if (query.startsWith("INSERT INTO order_inventory_deductions")) {
        for (let index = 0; index < params.length; index += 3) {
          const orderId = Number(params[index]);
          const productId = Number(params[index + 1]);
          const key = `${orderId}:${productId}`;
          if (state.snapshots.has(key)) {
            const error = new Error("duplicate snapshot");
            error.code = "ER_DUP_ENTRY";
            throw error;
          }
          state.snapshots.set(key, Number(params[index + 2]));
        }
        return [{ affectedRows: params.length / 3 }];
      }
      if (query.startsWith("UPDATE Inventory SET Stock")) {
        const quantity = Number(params[0]);
        if (state.inventoryStock < quantity) return [{ affectedRows: 0 }];
        state.inventoryStock -= quantity;
        state.inventoryUpdates += 1;
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("UPDATE orders SET stock_deducted = 1")) {
        const order = state.orders.get(Number(params[0]));
        if (order.stockDeducted === 1) return [{ affectedRows: 0 }];
        order.stockDeducted = 1;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async getConnection() { return createConnection(); },
});
mockModule("../utils/menuAvailability", {
  async fetchMenuIngredients() {
    return new Map([[5, [{
      product_id: 21,
      product_name: "Chicken",
      item_type: "stock_item",
      quantity_required: 1,
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
  resetState();
  assert.equal(await deductStockForPaidOrder(101), true);
  await assert.rejects(
    deductStockForPaidOrder(102),
    /Insufficient stock/,
  );
  assert.equal(state.inventoryStock, 0, "A first must consume all 192 units");
  assert.equal(state.orders.get(102).stockDeducted, 0);
  assert.deepEqual([...state.snapshots.entries()], [["101:21", 192]]);

  resetState();
  assert.equal(await deductStockForPaidOrder(102), true);
  await assert.rejects(
    deductStockForPaidOrder(101),
    /Insufficient stock/,
  );
  assert.equal(state.inventoryStock, 142, "B first must leave 142 units");
  assert.equal(state.orders.get(101).stockDeducted, 0);
  assert.deepEqual([...state.snapshots.entries()], [["102:21", 50]]);

  resetState();
  const concurrent = await Promise.allSettled([
    deductStockForPaidOrder(101),
    deductStockForPaidOrder(102),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  assert.equal(state.inventoryUpdates, 1, "concurrent acceptance must perform one deduction");
  assert.equal(state.snapshots.size, 1, "only the accepted order may retain a snapshot");

  resetState(50, 50);
  const duplicate = await Promise.all([
    deductStockForPaidOrder(101),
    deductStockForPaidOrder(101),
  ]);
  assert.deepEqual(duplicate.sort(), [false, true]);
  assert.equal(state.inventoryStock, 142);
  assert.equal(state.inventoryUpdates, 1, "duplicate acceptance must not double-deduct");
  assert.deepEqual([...state.snapshots.entries()], [["101:21", 50]]);

  console.log("Online acceptance stock serialization tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
