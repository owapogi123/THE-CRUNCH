"use strict";

const assert = require("node:assert/strict");

const state = {
  order: { status: "Pending", paymentStatus: "Paid", stockDeducted: 0 },
  inventory: new Map([[21, 10], [22, 8]]),
  snapshots: new Map(),
  commits: 0,
  rollbacks: 0,
  recipeReads: 0,
  failDeduction: false,
  failRestoration: false,
  missingMirror: null,
  transaction: null,
};

function cloneState() {
  return {
    order: { ...state.order },
    inventory: new Map(state.inventory),
    snapshots: new Map(state.snapshots),
  };
}

function restoreTransaction() {
  if (!state.transaction) return;
  state.order = { ...state.transaction.order };
  state.inventory = new Map(state.transaction.inventory);
  state.snapshots = new Map(state.transaction.snapshots);
  state.transaction = null;
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const connection = {
  async beginTransaction() { state.transaction = cloneState(); },
  async commit() { state.transaction = null; state.commits += 1; },
  async rollback() { restoreTransaction(); state.rollbacks += 1; },
  release() {},
  async query(sql, params = []) {
    const query = String(sql).replace(/\s+/g, " ").trim();
    if (query.startsWith("INSERT INTO order_inventory_deductions")) {
      for (let index = 0; index < params.length; index += 3) {
        const key = `${Number(params[index])}:${Number(params[index + 1])}`;
        if (state.snapshots.has(key)) {
          const error = new Error("duplicate snapshot");
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        state.snapshots.set(key, Number(params[index + 2]));
      }
      return [{ affectedRows: params.length / 3 }];
    }
    if (query.startsWith("UPDATE Inventory i INNER JOIN Menu")) {
      if (state.failDeduction) throw new Error("simulated stock update failure");
      const entries = [...state.snapshots.entries()].filter(([key]) => key.startsWith("201:"));
      for (const [key, quantity] of entries) {
        const productId = Number(key.split(":")[1]);
        state.inventory.set(productId, state.inventory.get(productId) - quantity);
      }
      return [{ affectedRows: entries.length }];
    }
    if (query.startsWith("UPDATE orders SET stock_deducted = 1")) {
      if (state.order.stockDeducted === 1) return [{ affectedRows: 0 }];
      state.order.stockDeducted = 1;
      return [{ affectedRows: 1 }];
    }
    if (query.includes("FROM orders") && query.endsWith("FOR UPDATE")) {
      return [[{
        orderId: 201,
        orderStatus: state.order.status,
        paymentStatus: state.order.paymentStatus,
        stockDeducted: state.order.stockDeducted,
      }]];
    }
    if (query.includes("FROM order_inventory_deductions d")) {
      const orderId = Number(params[0]);
      return [[...state.snapshots.entries()]
        .filter(([key]) => Number(key.split(":")[0]) === orderId)
        .map(([key, quantity]) => {
          const productId = Number(key.split(":")[1]);
          const mirrorsPresent = state.missingMirror !== productId;
          return {
            productId,
            quantity,
            inventoryProductId: mirrorsPresent ? productId : null,
            menuProductId: mirrorsPresent ? productId : null,
            productMirrorId: mirrorsPresent ? productId : null,
          };
        })];
    }
    if (query.startsWith("SELECT Admin_ID")) return [[{ Admin_ID: 30 }]];
    if (query.startsWith("UPDATE Inventory i LEFT JOIN Menu")) {
      const entries = [...state.snapshots.entries()].filter(([key]) => key.startsWith("201:"));
      for (const [key, quantity] of entries) {
        const productId = Number(key.split(":")[1]);
        state.inventory.set(productId, state.inventory.get(productId) + quantity);
      }
      if (state.failRestoration) throw new Error("simulated restoration failure");
      return [{ affectedRows: entries.length }];
    }
    if (query.startsWith("UPDATE orders SET stock_deducted = 0")) {
      if (state.order.stockDeducted !== 1) return [{ affectedRows: 0 }];
      state.order.stockDeducted = 0;
      return [{ affectedRows: 1 }];
    }
    if (/^(INSERT|UPDATE)/i.test(query)) return [{ affectedRows: 1 }];
    return [[]];
  },
};

mockModule("../config/db", { async getConnection() { return connection; } });
mockModule("../utils/menuAvailability", {
  async fetchMenuIngredients() { state.recipeReads += 1; return new Map(); },
  isAutoMenuMissingIngredients() { return false; },
});
mockModule("../utils/productItemType", {
  MENU_ITEM: "menu_item",
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "p.item_type"; },
});
mockModule("./orderItemService", { normalizeOrderItems(items) { return items; } });

const {
  deductPrevalidatedStockForPaidOrder,
  restoreStockForRefundedOrder,
} = require("./inventoryService");

const originalDeductions = new Map([
  [21, { requiredQty: 1.1255, name: "Shared Chicken" }],
  [22, { requiredQty: 0.375, name: "Shared Oil" }],
]);

(async () => {
  await connection.beginTransaction();
  await deductPrevalidatedStockForPaidOrder(
    201, "Paid", originalDeductions, 30, connection,
  );
  await connection.commit();
  assert.deepEqual([...state.snapshots.entries()], [
    ["201:21", 1.1255],
    ["201:22", 0.375],
  ]);
  assert.equal(state.inventory.get(21), 8.8745);
  assert.equal(state.inventory.get(22), 7.625);
  assert.equal(state.order.stockDeducted, 1);

  const stockBeforeDuplicate = new Map(state.inventory);
  await assert.rejects(
    deductPrevalidatedStockForPaidOrder(
      201, "Paid", originalDeductions, 30, connection,
    ),
    (error) => error?.code === "ORDER_DEDUCTION_SNAPSHOT_CONFLICT",
  );
  assert.deepEqual(state.inventory, stockBeforeDuplicate);
  assert.equal(state.snapshots.size, 2, "duplicate deduction must not add snapshot rows");

  state.order.status = "Refunded";
  const restored = await restoreStockForRefundedOrder(201, 30);
  assert.equal(restored, true);
  assert.equal(state.inventory.get(21), 10);
  assert.equal(state.inventory.get(22), 8);
  assert.equal(state.order.stockDeducted, 0);
  assert.equal(state.snapshots.size, 2, "refunds must preserve the immutable snapshot");
  assert.equal(state.recipeReads, 0, "refund restoration must never read the current recipe");
  assert.equal(await restoreStockForRefundedOrder(201, 30), false);
  assert.equal(state.inventory.get(21), 10, "duplicate refund must not restore twice");

  state.order.stockDeducted = 1;
  state.snapshots.clear();
  await assert.rejects(
    restoreStockForRefundedOrder(201, 30),
    (error) =>
      error?.statusCode === 409 &&
      error?.code === "REFUND_INVENTORY_RECONCILIATION_REQUIRED" &&
      /Manual inventory review/i.test(error.message),
  );
  assert.equal(state.order.stockDeducted, 1);

  state.snapshots.set("201:21", 1.1255);
  state.missingMirror = 21;
  await assert.rejects(
    restoreStockForRefundedOrder(201, 30),
    (error) => error?.code === "REFUND_INVENTORY_RECONCILIATION_REQUIRED",
  );
  state.missingMirror = null;

  state.inventory.set(21, 8.8745);
  state.failRestoration = true;
  const rollbackCount = state.rollbacks;
  await assert.rejects(restoreStockForRefundedOrder(201, 30), /simulated restoration failure/);
  assert.equal(state.rollbacks, rollbackCount + 1);
  assert.equal(state.inventory.get(21), 8.8745, "failed restoration must roll back stock");
  assert.equal(state.order.stockDeducted, 1);
  state.failRestoration = false;

  state.order = { status: "Pending", paymentStatus: "Paid", stockDeducted: 0 };
  state.inventory = new Map([[21, 10], [22, 8]]);
  state.snapshots.clear();
  state.failDeduction = true;
  await connection.beginTransaction();
  await assert.rejects(
    deductPrevalidatedStockForPaidOrder(201, "Paid", originalDeductions, 30, connection),
    /simulated stock update failure/,
  );
  await connection.rollback();
  assert.equal(state.snapshots.size, 0, "failed deduction must roll back its snapshot");
  assert.equal(state.order.stockDeducted, 0);

  console.log("Exact refund deduction snapshot tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
