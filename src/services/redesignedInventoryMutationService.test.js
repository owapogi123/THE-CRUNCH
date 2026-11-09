"use strict";

const assert = require("node:assert/strict");
const {
  executeRedesignedInventoryMutation,
} = require("./redesignedInventoryMutationService");

function clone(value) {
  return structuredClone(value);
}

function createHarness(overrides = {}) {
  const state = {
    product: {
      product_id: 7,
      product_name: "Chicken Breast",
      product_type: "stock_item",
      lifecycle_status: "active",
      unit_id: 2,
      tracking_method: "none",
      shelf_life_days: null,
      unit_name: "Kilograms",
      unit_abbreviation: "kg",
      unit_active: 1,
      ...overrides.product,
    },
    balance: {
      product_id: 7,
      on_hand: 0,
      reorder_point: 10,
      critical_point: 5,
      version: 0,
      ...overrides.balance,
    },
    batches: clone(overrides.batches || []),
    movements: clone(overrides.movements || []),
    nextBatchId: 100,
    nextMovementId: 500,
    commits: 0,
    rollbacks: 0,
    failMovementNumber: overrides.failMovementNumber || null,
    failVersionUpdate: Boolean(overrides.failVersionUpdate),
    failProductLock: Boolean(overrides.failProductLock),
    productLockSql: null,
  };

  let snapshot = null;
  const connection = {
    async beginTransaction() {
      snapshot = clone({
        balance: state.balance,
        batches: state.batches,
        movements: state.movements,
        nextBatchId: state.nextBatchId,
        nextMovementId: state.nextMovementId,
      });
    },
    async commit() {
      state.commits += 1;
      snapshot = null;
    },
    async rollback() {
      state.rollbacks += 1;
      if (snapshot) {
        state.balance = snapshot.balance;
        state.batches = snapshot.batches;
        state.movements = snapshot.movements;
        state.nextBatchId = snapshot.nextBatchId;
        state.nextMovementId = snapshot.nextMovementId;
      }
      snapshot = null;
    },
    release() {},
    async query(sql, params = []) {
      const query = String(sql).replace(/\s+/g, " ").trim();
      if (query.startsWith("SELECT p.product_id") && query.includes("FROM products p")) {
        state.productLockSql = query;
        if (/\bunit\.active\b/i.test(query)) {
          const error = new Error("Unknown column 'unit.active' in 'field list'");
          error.code = "ER_BAD_FIELD_ERROR";
          throw error;
        }
        assert.match(query, /\bunit\.is_active AS unit_active\b/i);
        if (state.failProductLock) {
          const error = new Error("simulated product lock failure");
          error.code = "ER_BAD_FIELD_ERROR";
          throw error;
        }
        return [[{ ...state.product }]];
      }
      if (query.startsWith("SELECT product_id, on_hand")) {
        return [[{ ...state.balance }]];
      }
      if (query.startsWith("SELECT MIN(product_id) AS product_id")) {
        const key = params[0];
        const matched = state.movements.filter(
          (movement) =>
            movement.idempotency_key === key ||
            String(movement.idempotency_key || "").startsWith(`${key}:part:`),
        );
        if (!matched.length) return [[]];
        return [[{
          product_id: Math.min(...matched.map((movement) => movement.product_id)),
          movement_type: [...matched.map((movement) => movement.movement_type)].sort()[0],
          signed_quantity: matched.reduce(
            (sum, movement) => sum + movement.signed_quantity,
            0,
          ),
          stock_movement_id: Math.min(
            ...matched.map((movement) => movement.stock_movement_id),
          ),
          movement_count: matched.length,
        }]];
      }
      if (query.startsWith("INSERT INTO inventory_batches")) {
        const batch = {
          batch_id: state.nextBatchId++,
          product_id: Number(params[0]),
          purchase_order_item_id: params[1],
          delivery_batch_reference: params[2],
          received_quantity: Number(params[3]),
          remaining_quantity: Number(params[4]),
          returned_quantity: 0,
          unit_id: Number(params[5]),
          received_at: params[6],
          tracking_start_at: params[7],
          expiry_at: params[8],
          usable_until: params[9],
          status: "active",
          notes: params[10],
        };
        state.batches.push(batch);
        return [{ insertId: batch.batch_id, affectedRows: 1 }];
      }
      if (query.startsWith("SELECT batch_id, product_id, received_quantity")) {
        if (query.includes("WHERE batch_id = ?")) {
          const batch = state.batches.find((item) => item.batch_id === Number(params[0]));
          return [batch ? [{ ...batch }] : []];
        }
        return [[...state.batches]
          .filter(
            (batch) =>
              batch.product_id === Number(params[0]) &&
              batch.remaining_quantity > 0 &&
              ["active", "expired", "quarantined"].includes(batch.status),
          )
          .sort((a, b) => a.batch_id - b.batch_id)
          .map((batch) => ({ ...batch }))];
      }
      if (query.startsWith("SELECT batch_id FROM inventory_batches")) {
        return [[...state.batches]
          .filter((batch) => batch.product_id === Number(params[0]))
          .map((batch) => ({ batch_id: batch.batch_id }))];
      }
      if (query.startsWith("UPDATE inventory_batches") && query.includes("returned_quantity = returned_quantity")) {
        const batch = state.batches.find((item) => item.batch_id === Number(params[3]));
        batch.remaining_quantity = Number(params[0]);
        batch.returned_quantity += Number(params[1]);
        batch.status = params[2];
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("UPDATE inventory_batches") && query.includes("SET remaining_quantity = ?") && !query.includes("returned_quantity")) {
        const batch = state.batches.find((item) => item.batch_id === Number(params[2]));
        batch.remaining_quantity = Number(params[0]);
        batch.status = params[1];
        return [{ affectedRows: 1 }];
      }
      if (query.startsWith("INSERT INTO stock_movements")) {
        const nextNumber = state.movements.length + 1;
        if (state.failMovementNumber === nextNumber) {
          throw new Error("simulated movement insert failure");
        }
        const movement = {
          stock_movement_id: state.nextMovementId++,
          product_id: Number(params[0]),
          batch_id: params[1] == null ? null : Number(params[1]),
          movement_type: params[2],
          signed_quantity: Number(params[3]),
          unit_id: Number(params[4]),
          idempotency_key: params[7],
        };
        state.movements.push(movement);
        return [{ insertId: movement.stock_movement_id, affectedRows: 1 }];
      }
      if (query.startsWith("UPDATE inventory_balances")) {
        if (state.failVersionUpdate || Number(params[2]) !== state.balance.version) {
          return [{ affectedRows: 0 }];
        }
        state.balance.on_hand = Number(params[0]);
        state.balance.version += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    },
  };

  return {
    state,
    database: { async getConnection() { return connection; } },
  };
}

(async () => {
  const stagingAdjustmentHarness = createHarness({
    product: { product_id: 3 },
    balance: { product_id: 3 },
  });
  const stagingAdjustment = await executeRedesignedInventoryMutation(
    stagingAdjustmentHarness.database,
    {
      product_id: 3,
      movement_type: "adjustment",
      quantity: 5,
      idempotency_key: "staging-adjustment-product-3-unique",
    },
  );
  assert.equal(stagingAdjustment.onHand, 5);
  assert.equal(stagingAdjustmentHarness.state.balance.on_hand, 5);
  assert.equal(stagingAdjustmentHarness.state.movements.length, 1);
  assert.match(
    stagingAdjustmentHarness.state.productLockSql,
    /unit\.is_active AS unit_active/i,
  );
  assert.equal(stagingAdjustmentHarness.state.commits, 1);
  assert.equal(stagingAdjustmentHarness.state.rollbacks, 0);

  const productLockFailureHarness = createHarness({ failProductLock: true });
  await assert.rejects(
    executeRedesignedInventoryMutation(productLockFailureHarness.database, {
      product_id: 7,
      movement_type: "adjustment",
      quantity: 5,
      idempotency_key: "failed-product-lock",
    }),
    (error) =>
      error.code === "ER_BAD_FIELD_ERROR" &&
      error.message === "simulated product lock failure",
  );
  assert.equal(productLockFailureHarness.state.rollbacks, 1);
  assert.equal(productLockFailureHarness.state.balance.on_hand, 0);
  assert.equal(productLockFailureHarness.state.batches.length, 0);
  assert.equal(productLockFailureHarness.state.movements.length, 0);

  const expiryHarness = createHarness({
    product: { tracking_method: "expiry" },
  });
  const received = await executeRedesignedInventoryMutation(
    expiryHarness.database,
    {
      productId: 7,
      movementType: "receive",
      quantity: 10,
      unit: "kg",
      receivedAt: "2026-11-09T01:00:00Z",
      expiryAt: "2026-12-09T01:00:00Z",
      idempotencyKey: "po-receipt-1",
    },
  );
  assert.equal(received.onHand, 10);
  assert.equal(expiryHarness.state.balance.on_hand, 10);
  assert.equal(expiryHarness.state.batches.length, 1);
  assert.equal(expiryHarness.state.batches[0].remaining_quantity, 10);
  assert.equal(expiryHarness.state.movements[0].movement_type, "receive");
  assert.equal(expiryHarness.state.commits, 1);

  const replay = await executeRedesignedInventoryMutation(
    expiryHarness.database,
    {
      productId: 7,
      movementType: "receive",
      quantity: 10,
      unit: 2,
      receivedAt: "2026-11-09T01:00:00Z",
      expiryAt: "2026-12-09T01:00:00Z",
      idempotencyKey: "po-receipt-1",
    },
  );
  assert.equal(replay.idempotent, true);
  assert.equal(expiryHarness.state.balance.on_hand, 10);
  assert.equal(expiryHarness.state.batches.length, 1, "receipt replay must not add a batch");
  assert.equal(expiryHarness.state.movements.length, 1, "receipt replay must not add a movement");

  const spoilageHarness = createHarness({
    balance: { on_hand: 15 },
    batches: [
      {
        batch_id: 1,
        product_id: 7,
        received_quantity: 5,
        remaining_quantity: 5,
        returned_quantity: 0,
        unit_id: 2,
        status: "active",
      },
      {
        batch_id: 2,
        product_id: 7,
        received_quantity: 10,
        remaining_quantity: 10,
        returned_quantity: 0,
        unit_id: 2,
        status: "active",
      },
    ],
  });
  const spoiled = await executeRedesignedInventoryMutation(
    spoilageHarness.database,
    {
      productId: 7,
      movementType: "spoilage",
      quantity: 7,
      idempotencyKey: "spoilage-1",
    },
  );
  assert.equal(spoiled.onHand, 8);
  assert.equal(spoilageHarness.state.batches[0].remaining_quantity, 0);
  assert.equal(spoilageHarness.state.batches[0].status, "depleted");
  assert.equal(spoilageHarness.state.batches[1].remaining_quantity, 8);
  assert.deepEqual(
    spoilageHarness.state.movements.map((movement) => movement.signed_quantity),
    [-5, -2],
  );

  const saleHarness = createHarness({
    balance: { on_hand: 4 },
    batches: [{
      batch_id: 3,
      product_id: 7,
      received_quantity: 4,
      remaining_quantity: 4,
      returned_quantity: 0,
      unit_id: 2,
      status: "active",
    }],
  });
  const sale = await executeRedesignedInventoryMutation(
    saleHarness.database,
    {
      productId: 7,
      movementType: "sale",
      quantity: 1.5,
      idempotencyKey: "order:77:product:7",
      sourceType: "order",
      sourceId: "77",
    },
  );
  assert.equal(sale.onHand, 2.5);
  assert.equal(saleHarness.state.batches[0].remaining_quantity, 2.5);
  assert.equal(saleHarness.state.movements[0].movement_type, "sale");
  assert.equal(saleHarness.state.movements[0].signed_quantity, -1.5);

  const supplierReturnHarness = createHarness({
    balance: { on_hand: 10 },
    batches: [{
      batch_id: 8,
      product_id: 7,
      received_quantity: 10,
      remaining_quantity: 10,
      returned_quantity: 0,
      unit_id: 2,
      status: "active",
    }],
  });
  const supplierReturn = await executeRedesignedInventoryMutation(
    supplierReturnHarness.database,
    {
      productId: 7,
      movementType: "return_to_supplier",
      quantity: 4,
      batchId: 8,
      idempotencyKey: "supplier-return-1",
    },
  );
  assert.equal(supplierReturn.onHand, 6);
  assert.equal(supplierReturnHarness.state.batches[0].remaining_quantity, 6);
  assert.equal(supplierReturnHarness.state.batches[0].returned_quantity, 4);

  const stockReturnHarness = createHarness({
    balance: { on_hand: 6 },
    batches: [{
      batch_id: 9,
      product_id: 7,
      received_quantity: 10,
      remaining_quantity: 6,
      returned_quantity: 0,
      unit_id: 2,
      status: "active",
    }],
  });
  const stockReturn = await executeRedesignedInventoryMutation(
    stockReturnHarness.database,
    {
      productId: 7,
      movementType: "return_in",
      quantity: 2,
      batchId: 9,
      idempotencyKey: "stock-return-1",
    },
  );
  assert.equal(stockReturn.onHand, 8);
  assert.equal(stockReturnHarness.state.batches[0].remaining_quantity, 8);

  const rollbackHarness = createHarness({
    balance: { on_hand: 15 },
    batches: clone(spoilageHarness.state.batches).map((batch, index) => ({
      ...batch,
      remaining_quantity: index === 0 ? 5 : 10,
      status: "active",
    })),
    failMovementNumber: 2,
  });
  await assert.rejects(
    executeRedesignedInventoryMutation(rollbackHarness.database, {
      productId: 7,
      movementType: "spoilage",
      quantity: 7,
      idempotencyKey: "spoilage-rollback",
    }),
    /simulated movement insert failure/,
  );
  assert.equal(rollbackHarness.state.rollbacks, 1);
  assert.equal(rollbackHarness.state.balance.on_hand, 15);
  assert.deepEqual(
    rollbackHarness.state.batches.map((batch) => batch.remaining_quantity),
    [5, 10],
    "partial batch changes must roll back",
  );
  assert.equal(rollbackHarness.state.movements.length, 0);

  const insufficientHarness = createHarness({ balance: { on_hand: 2 } });
  await assert.rejects(
    executeRedesignedInventoryMutation(insufficientHarness.database, {
      productId: 7,
      movementType: "adjustment",
      signedQuantity: -3,
    }),
    (error) => error.code === "INSUFFICIENT_STOCK" && error.statusCode === 409,
  );
  assert.equal(insufficientHarness.state.rollbacks, 1);

  const unitHarness = createHarness();
  await assert.rejects(
    executeRedesignedInventoryMutation(unitHarness.database, {
      productId: 7,
      movementType: "adjustment",
      signedQuantity: 1,
      unit: "liters",
    }),
    (error) => error.code === "UNIT_MISMATCH" && error.statusCode === 409,
  );

  const shelfLifeHarness = createHarness({
    product: { tracking_method: "shelf_life", shelf_life_days: 5 },
  });
  await assert.rejects(
    executeRedesignedInventoryMutation(shelfLifeHarness.database, {
      productId: 7,
      movementType: "receive",
      quantity: 2,
      receivedAt: "2026-11-09T01:00:00Z",
    }),
    (error) => error.code === "TRACKING_START_REQUIRED",
  );
  const shelfReceipt = await executeRedesignedInventoryMutation(
    shelfLifeHarness.database,
    {
      productId: 7,
      movementType: "receive",
      quantity: 2,
      receivedAt: "2026-11-09T01:00:00Z",
      trackingStartAt: "2026-11-08T01:00:00Z",
    },
  );
  assert.equal(shelfReceipt.onHand, 2);
  assert.equal(
    shelfLifeHarness.state.batches[0].usable_until.toISOString(),
    "2026-11-13T01:00:00.000Z",
  );

  const conflictHarness = createHarness({ failVersionUpdate: true });
  await assert.rejects(
    executeRedesignedInventoryMutation(conflictHarness.database, {
      productId: 7,
      movementType: "adjustment",
      signedQuantity: 1,
    }),
    (error) => error.code === "INVENTORY_CONFLICT" && error.statusCode === 409,
  );
  assert.equal(conflictHarness.state.rollbacks, 1);
  assert.equal(conflictHarness.state.movements.length, 0);

  console.log("Redesigned inventory mutation transaction tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
