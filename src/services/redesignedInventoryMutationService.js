"use strict";

const ALLOWED_MOVEMENT_TYPES = new Set([
  "receive",
  "return_in",
  "return_to_supplier",
  "spoilage",
  "adjustment",
]);

const DEPLETABLE_BATCH_STATUSES = Object.freeze([
  "active",
  "expired",
  "quarantined",
]);

function mutationError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function requiredPositiveQuantity(value, label = "quantity") {
  const quantity = roundQuantity(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw mutationError(400, "INVALID_QUANTITY", `${label} must be greater than 0`);
  }
  return quantity;
}

function normalizeProductId(value) {
  const productId = Number(value);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw mutationError(400, "INVALID_PRODUCT_ID", "product_id must be a positive integer");
  }
  return productId;
}

function normalizeOptionalPositiveId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw mutationError(400, `INVALID_${label.toUpperCase()}`, `${label} must be a positive integer`);
  }
  return id;
}

function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null || value === "") return null;
  const key = String(value).trim();
  if (!/^[A-Za-z0-9._:-]{1,170}$/.test(key) || /:part:\d+$/i.test(key)) {
    throw mutationError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "idempotency_key must contain only letters, numbers, dots, underscores, colons, or hyphens, be at most 170 characters, and not use the reserved :part:N suffix",
    );
  }
  return key;
}

function normalizeOptionalText(value, maximumLength, label) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (text.length > maximumLength) {
    throw mutationError(400, `INVALID_${label.toUpperCase()}`, `${label} is too long`);
  }
  return text || null;
}

function normalizeDate(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw mutationError(400, `MISSING_${label.toUpperCase()}`, `${label} is required`);
    }
    return null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw mutationError(400, `INVALID_${label.toUpperCase()}`, `${label} must be a valid date`);
  }
  return date;
}

function normalizeMovement(input) {
  const movementType = String(input.movementType || input.movement_type || "")
    .trim()
    .toLowerCase();
  if (!ALLOWED_MOVEMENT_TYPES.has(movementType)) {
    throw mutationError(400, "UNSUPPORTED_MOVEMENT_TYPE", "Unsupported stock movement type");
  }

  let signedQuantity;
  if (movementType === "adjustment") {
    signedQuantity = roundQuantity(
      input.signedQuantity ?? input.signed_quantity ?? input.quantity,
    );
    if (!Number.isFinite(signedQuantity) || signedQuantity === 0) {
      throw mutationError(
        400,
        "INVALID_QUANTITY",
        "Adjustment quantity must be a non-zero signed number",
      );
    }
  } else {
    const quantity = requiredPositiveQuantity(input.quantity);
    signedQuantity = ["spoilage", "return_to_supplier"].includes(movementType)
      ? -quantity
      : quantity;
  }

  return {
    productId: normalizeProductId(input.productId ?? input.product_id),
    movementType,
    signedQuantity,
    batchId: normalizeOptionalPositiveId(input.batchId ?? input.batch_id, "batch_id"),
    unit: input.unitId ?? input.unit_id ?? input.unit ?? null,
    idempotencyKey: normalizeIdempotencyKey(
      input.idempotencyKey ?? input.idempotency_key,
    ),
    sourceType: normalizeOptionalText(input.sourceType ?? input.source_type, 50, "source_type"),
    sourceId: normalizeOptionalText(input.sourceId ?? input.source_id, 100, "source_id"),
    note: normalizeOptionalText(input.note ?? input.reason, 500, "note"),
    actorUserId: normalizeOptionalPositiveId(
      input.actorUserId ?? input.actor_user_id,
      "actor_user_id",
    ),
    purchaseOrderItemId: normalizeOptionalPositiveId(
      input.purchaseOrderItemId ?? input.purchase_order_item_id,
      "purchase_order_item_id",
    ),
    deliveryBatchReference: normalizeOptionalText(
      input.deliveryBatchReference ?? input.delivery_batch_reference,
      100,
      "delivery_batch_reference",
    ),
    receivedAt: input.receivedAt ?? input.received_at,
    trackingStartAt: input.trackingStartAt ?? input.tracking_start_at,
    expiryAt: input.expiryAt ?? input.expiry_at,
  };
}

function validateRequestedUnit(product, requestedUnit) {
  if (requestedUnit === undefined || requestedUnit === null || requestedUnit === "") return;
  const numericUnit = Number(requestedUnit);
  if (Number.isSafeInteger(numericUnit) && String(requestedUnit).trim() !== "") {
    if (numericUnit !== Number(product.unit_id)) {
      throw mutationError(
        409,
        "UNIT_MISMATCH",
        `Stock movement unit must match ${product.unit_name}`,
      );
    }
    return;
  }

  const normalized = String(requestedUnit).trim().toLowerCase();
  const matches = [product.unit_name, product.unit_abbreviation]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === normalized);
  if (!matches) {
    throw mutationError(
      409,
      "UNIT_MISMATCH",
      `Stock movement unit must match ${product.unit_name}`,
    );
  }
}

async function lockProductAndBalance(connection, movement) {
  const [productRows] = await connection.query(
    `SELECT
       p.product_id,
       p.name AS product_name,
       p.product_type,
       p.lifecycle_status,
       p.unit_id,
       p.tracking_method,
       p.shelf_life_days,
       unit.name AS unit_name,
       unit.abbreviation AS unit_abbreviation,
       unit.is_active AS unit_active
     FROM products p
     JOIN units unit ON unit.unit_id = p.unit_id
     WHERE p.product_id = ?
     FOR UPDATE`,
    [movement.productId],
  );
  if (!productRows.length) {
    throw mutationError(404, "PRODUCT_NOT_FOUND", "Stock product was not found");
  }
  const product = productRows[0];
  if (String(product.product_type).toLowerCase() !== "stock_item") {
    throw mutationError(409, "NOT_STOCK_ITEM", "Inventory mutations require a stock_item product");
  }
  if (String(product.lifecycle_status).toLowerCase() === "archived") {
    throw mutationError(409, "PRODUCT_ARCHIVED", "Archived stock items cannot be mutated");
  }
  validateRequestedUnit(product, movement.unit);

  const [balanceRows] = await connection.query(
    `SELECT product_id, on_hand, reorder_point, critical_point, version
       FROM inventory_balances
      WHERE product_id = ?
      FOR UPDATE`,
    [movement.productId],
  );
  if (!balanceRows.length) {
    throw mutationError(
      409,
      "INVENTORY_BALANCE_MISSING",
      "Stock item has no inventory balance; repair the product record before changing stock",
    );
  }
  return { product, balance: balanceRows[0] };
}

async function findIdempotentReplay(connection, movement) {
  if (!movement.idempotencyKey) return null;
  const [rows] = await connection.query(
    `SELECT
       MIN(product_id) AS product_id,
       MIN(movement_type) AS movement_type,
       SUM(signed_quantity) AS signed_quantity,
       MIN(stock_movement_id) AS stock_movement_id,
       COUNT(*) AS movement_count
     FROM stock_movements
     WHERE idempotency_key = ?
        OR LEFT(idempotency_key, CHAR_LENGTH(?) + 6) = CONCAT(?, ':part:')
     HAVING COUNT(*) > 0`,
    [
      movement.idempotencyKey,
      movement.idempotencyKey,
      movement.idempotencyKey,
    ],
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (
    Number(row.product_id) !== movement.productId ||
    String(row.movement_type) !== movement.movementType ||
    Math.abs(roundQuantity(row.signed_quantity) - movement.signedQuantity) > 0.0001
  ) {
    throw mutationError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "The idempotency key was already used for a different stock mutation",
    );
  }
  return {
    stockMovementId: Number(row.stock_movement_id),
    movementCount: Number(row.movement_count),
  };
}

async function validatePurchaseOrderItem(connection, movement, product) {
  if (!movement.purchaseOrderItemId) return;
  const [rows] = await connection.query(
    `SELECT purchase_order_item_id, product_id, unit_id
       FROM purchase_order_items
      WHERE purchase_order_item_id = ?
      FOR UPDATE`,
    [movement.purchaseOrderItemId],
  );
  if (!rows.length) {
    throw mutationError(404, "PURCHASE_ORDER_ITEM_NOT_FOUND", "Purchase-order item was not found");
  }
  if (
    Number(rows[0].product_id) !== movement.productId ||
    Number(rows[0].unit_id) !== Number(product.unit_id)
  ) {
    throw mutationError(
      409,
      "PURCHASE_ORDER_ITEM_MISMATCH",
      "Purchase-order item does not match the stock product and unit",
    );
  }
}

function prepareReceiptDates(product, movement) {
  const receivedAt = normalizeDate(movement.receivedAt, "received_at", { required: true });
  const trackingMethod = String(product.tracking_method || "none").toLowerCase();
  let trackingStartAt = normalizeDate(movement.trackingStartAt, "tracking_start_at");
  let expiryAt = normalizeDate(movement.expiryAt, "expiry_at");
  let usableUntil = null;

  if (trackingMethod === "expiry") {
    if (!expiryAt) {
      throw mutationError(400, "EXPIRY_DATE_REQUIRED", "expiry_at is required for this material");
    }
    if (expiryAt <= receivedAt) {
      throw mutationError(400, "INVALID_EXPIRY_DATE", "expiry_at must be after received_at");
    }
    trackingStartAt = null;
  } else if (trackingMethod === "shelf_life") {
    if (!trackingStartAt) {
      throw mutationError(
        400,
        "TRACKING_START_REQUIRED",
        "tracking_start_at is required for shelf-life stock",
      );
    }
    const shelfLifeDays = Number(product.shelf_life_days);
    if (!Number.isSafeInteger(shelfLifeDays) || shelfLifeDays <= 0) {
      throw mutationError(
        409,
        "INVALID_SHELF_LIFE_CONFIGURATION",
        "The material has no valid shelf-life duration",
      );
    }
    if (trackingStartAt > receivedAt) {
      throw mutationError(
        400,
        "INVALID_TRACKING_START",
        "tracking_start_at cannot be after received_at",
      );
    }
    usableUntil = new Date(trackingStartAt.getTime());
    usableUntil.setUTCDate(usableUntil.getUTCDate() + shelfLifeDays);
    if (usableUntil <= receivedAt) {
      throw mutationError(
        400,
        "SHELF_LIFE_ELAPSED",
        "The calculated usable_until date must be after received_at",
      );
    }
    expiryAt = null;
  } else {
    if (trackingStartAt || expiryAt) {
      throw mutationError(
        400,
        "DATE_TRACKING_NOT_ENABLED",
        "This material does not use expiry or shelf-life tracking",
      );
    }
    trackingStartAt = null;
    expiryAt = null;
  }

  return { receivedAt, trackingStartAt, expiryAt, usableUntil };
}

async function createReceiptBatch(connection, movement, product) {
  await validatePurchaseOrderItem(connection, movement, product);
  const dates = prepareReceiptDates(product, movement);
  const quantity = movement.signedQuantity;
  const [result] = await connection.query(
    `INSERT INTO inventory_batches
       (product_id, purchase_order_item_id, delivery_batch_reference,
        received_quantity, remaining_quantity, returned_quantity, unit_id,
        received_at, tracking_start_at, expiry_at, usable_until, status, notes)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      movement.productId,
      movement.purchaseOrderItemId,
      movement.deliveryBatchReference,
      quantity,
      quantity,
      product.unit_id,
      dates.receivedAt,
      dates.trackingStartAt,
      dates.expiryAt,
      dates.usableUntil,
      movement.note,
    ],
  );
  return Number(result.insertId);
}

async function lockOneBatch(connection, movement, product) {
  const [rows] = await connection.query(
    `SELECT
       batch_id, product_id, received_quantity, remaining_quantity,
       returned_quantity, unit_id, status, received_at, expiry_at, usable_until
     FROM inventory_batches
     WHERE batch_id = ?
     FOR UPDATE`,
    [movement.batchId],
  );
  if (!rows.length) {
    throw mutationError(404, "BATCH_NOT_FOUND", "Inventory batch was not found");
  }
  const batch = rows[0];
  if (Number(batch.product_id) !== movement.productId) {
    throw mutationError(409, "BATCH_PRODUCT_MISMATCH", "Batch belongs to a different product");
  }
  if (Number(batch.unit_id) !== Number(product.unit_id)) {
    throw mutationError(409, "BATCH_UNIT_MISMATCH", "Batch unit does not match the product unit");
  }
  return batch;
}

async function lockDepletableBatches(connection, movement) {
  const placeholders = DEPLETABLE_BATCH_STATUSES.map(() => "?").join(", ");
  const [rows] = await connection.query(
    `SELECT
       batch_id, product_id, received_quantity, remaining_quantity,
       returned_quantity, unit_id, status, received_at, expiry_at, usable_until
     FROM inventory_batches
     WHERE product_id = ?
       AND status IN (${placeholders})
       AND remaining_quantity > 0
     ORDER BY
       CASE WHEN expiry_at IS NULL AND usable_until IS NULL THEN 1 ELSE 0 END,
       COALESCE(expiry_at, usable_until),
       received_at,
       batch_id
     FOR UPDATE`,
    [movement.productId, ...DEPLETABLE_BATCH_STATUSES],
  );
  return rows;
}

async function lockAllProductBatches(connection, productId) {
  const [rows] = await connection.query(
    `SELECT batch_id
       FROM inventory_batches
      WHERE product_id = ?
      ORDER BY batch_id
      FOR UPDATE`,
    [productId],
  );
  return rows;
}

async function allocateBatchChanges(connection, movement, product) {
  if (movement.movementType === "receive") {
    const batchId = await createReceiptBatch(connection, movement, product);
    return [{ batchId, signedQuantity: movement.signedQuantity }];
  }

  if (movement.signedQuantity > 0) {
    if (!movement.batchId) {
      const existingBatches = await lockAllProductBatches(
        connection,
        movement.productId,
      );
      if (existingBatches.length > 0) {
        throw mutationError(
          409,
          "BATCH_REQUIRED",
          "A source batch is required when increasing stock for a product that has batch history",
        );
      }
      if (String(product.tracking_method).toLowerCase() !== "none") {
        throw mutationError(
          409,
          "BATCH_REQUIRED",
          "A batch is required when increasing date-tracked stock",
        );
      }
      return [{ batchId: null, signedQuantity: movement.signedQuantity }];
    }
    const batch = await lockOneBatch(connection, movement, product);
    const capacity = roundQuantity(
      Number(batch.received_quantity) -
        Number(batch.returned_quantity) -
        Number(batch.remaining_quantity),
    );
    if (movement.signedQuantity > capacity) {
      throw mutationError(
        409,
        "BATCH_CAPACITY_EXCEEDED",
        `Return quantity exceeds the batch's ${capacity.toFixed(4)} available capacity`,
      );
    }
    const nextRemaining = roundQuantity(
      Number(batch.remaining_quantity) + movement.signedQuantity,
    );
    const currentStatus = String(batch.status || "active").toLowerCase();
    const trackingEnd = batch.expiry_at || batch.usable_until;
    const nextStatus = ["expired", "quarantined"].includes(currentStatus)
      ? currentStatus
      : trackingEnd && new Date(trackingEnd) <= new Date()
        ? "expired"
        : "active";
    await connection.query(
      `UPDATE inventory_batches
          SET remaining_quantity = ?,
              status = ?
        WHERE batch_id = ?`,
      [nextRemaining, nextStatus, batch.batch_id],
    );
    return [{ batchId: Number(batch.batch_id), signedQuantity: movement.signedQuantity }];
  }

  const quantityNeeded = Math.abs(movement.signedQuantity);
  const batches = movement.batchId
    ? [await lockOneBatch(connection, movement, product)]
    : await lockDepletableBatches(connection, movement);

  if (!batches.length) {
    if (String(product.tracking_method).toLowerCase() !== "none") {
      throw mutationError(
        409,
        "BATCH_STOCK_MISSING",
        "Date-tracked stock has no eligible inventory batch",
      );
    }
    return [{ batchId: null, signedQuantity: -quantityNeeded }];
  }

  const batchAvailable = roundQuantity(
    batches.reduce((total, batch) => total + Number(batch.remaining_quantity), 0),
  );
  if (batchAvailable + 0.0001 < quantityNeeded) {
    throw mutationError(
      409,
      "INSUFFICIENT_BATCH_STOCK",
      `Only ${batchAvailable.toFixed(4)} is available in eligible batches`,
    );
  }

  let remaining = quantityNeeded;
  const allocations = [];
  for (const batch of batches) {
    if (remaining <= 0.0001) break;
    const available = roundQuantity(batch.remaining_quantity);
    const used = roundQuantity(Math.min(available, remaining));
    if (used <= 0) continue;
    const nextRemaining = roundQuantity(available - used);
    const returnedIncrement =
      movement.movementType === "return_to_supplier" ? used : 0;
    const nextStatus = nextRemaining <= 0
      ? movement.movementType === "return_to_supplier"
        ? "returned"
        : "depleted"
      : String(batch.status) === "active"
        ? "active"
        : batch.status;
    await connection.query(
      `UPDATE inventory_batches
          SET remaining_quantity = ?,
              returned_quantity = returned_quantity + ?,
              status = ?
        WHERE batch_id = ?`,
      [nextRemaining, returnedIncrement, nextStatus, batch.batch_id],
    );
    allocations.push({ batchId: Number(batch.batch_id), signedQuantity: -used });
    remaining = roundQuantity(remaining - used);
  }
  return allocations;
}

async function insertMovementRows(connection, movement, product, allocations) {
  const movementIds = [];
  for (let index = 0; index < allocations.length; index += 1) {
    const allocation = allocations[index];
    const idempotencyKey = movement.idempotencyKey
      ? index === 0
        ? movement.idempotencyKey
        : `${movement.idempotencyKey}:part:${index + 1}`
      : null;
    try {
      const [result] = await connection.query(
        `INSERT INTO stock_movements
           (product_id, batch_id, movement_type, signed_quantity, unit_id,
            source_type, source_id, idempotency_key, actor_user_id, occurred_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          movement.productId,
          allocation.batchId,
          movement.movementType,
          allocation.signedQuantity,
          product.unit_id,
          movement.sourceType,
          movement.sourceId,
          idempotencyKey,
          movement.actorUserId,
          movement.note,
        ],
      );
      movementIds.push(Number(result.insertId));
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY" && movement.idempotencyKey) {
        throw mutationError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "The stock mutation was already processed concurrently",
        );
      }
      throw error;
    }
  }
  return movementIds;
}

async function applyRedesignedInventoryMutation(connection, rawInput) {
  const movement = normalizeMovement(rawInput);
  const { product, balance } = await lockProductAndBalance(connection, movement);
  const replay = await findIdempotentReplay(connection, movement);
  if (replay) {
    return {
      idempotent: true,
      productId: movement.productId,
      productName: product.product_name,
      unitId: Number(product.unit_id),
      unit: product.unit_abbreviation || product.unit_name,
      movementType: movement.movementType,
      signedQuantity: movement.signedQuantity,
      stockMovementId: replay.stockMovementId,
      movementIds: [replay.stockMovementId],
      movementCount: replay.movementCount,
      onHand: roundQuantity(balance.on_hand),
      version: Number(balance.version),
    };
  }

  const nextOnHand = roundQuantity(Number(balance.on_hand) + movement.signedQuantity);
  if (nextOnHand < -0.0001) {
    throw mutationError(
      409,
      "INSUFFICIENT_STOCK",
      `Only ${roundQuantity(balance.on_hand).toFixed(4)} is available`,
    );
  }

  const allocations = await allocateBatchChanges(connection, movement, product);
  const movementIds = await insertMovementRows(
    connection,
    movement,
    product,
    allocations,
  );
  const [updateResult] = await connection.query(
    `UPDATE inventory_balances
        SET on_hand = ?,
            version = version + 1
      WHERE product_id = ?
        AND version = ?`,
    [Math.max(0, nextOnHand), movement.productId, Number(balance.version)],
  );
  if (Number(updateResult?.affectedRows) !== 1) {
    throw mutationError(
      409,
      "INVENTORY_CONFLICT",
      "Inventory changed concurrently; retry the stock mutation",
    );
  }

  return {
    idempotent: false,
    productId: movement.productId,
    productName: product.product_name,
    unitId: Number(product.unit_id),
    unit: product.unit_abbreviation || product.unit_name,
    movementType: movement.movementType,
    signedQuantity: movement.signedQuantity,
    stockMovementId: movementIds[0],
    movementIds,
    movementCount: movementIds.length,
    batchIds: allocations.map((allocation) => allocation.batchId).filter(Boolean),
    onHand: Math.max(0, nextOnHand),
    version: Number(balance.version) + 1,
  };
}

async function executeRedesignedInventoryMutation(database, input, options = {}) {
  const connection = await database.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await applyRedesignedInventoryMutation(connection, input);
    if (typeof options.beforeCommit === "function") {
      await options.beforeCommit(connection, result);
    }
    await connection.commit();
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ALLOWED_MOVEMENT_TYPES,
  applyRedesignedInventoryMutation,
  executeRedesignedInventoryMutation,
  mutationError,
};
