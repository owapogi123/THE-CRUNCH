const router = require("express").Router();
const db = require("../config/db");
const {
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
  assertProductsMatchItemType,
} = require("../utils/productItemType");
const { requireInventoryManagerAccess } = require("../middleware/staffAccess");
const { assertTableColumns } = require("../services/schemaAssertions");
const {
  STAFF_NOTIFICATION_AUDIENCES,
  createStaffNotification,
} = require("../services/staffNotificationService");
const {
  executeRedesignedInventoryMutation,
  refreshRedesignedInventoryAlerts,
} = require("../services/inventoryService");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("../db/schemaProfile");

function isRedesignedProfile() {
  return getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
}

function requestIdempotencyKey(req) {
  return String(
    req.get?.("Idempotency-Key") || req.body?.idempotency_key || "",
  ).trim() || null;
}

function stockMutationErrorResponse(res, error) {
  const statusCode = Number(error?.statusCode) || 500;
  return res.status(statusCode).json({
    code: error?.code || (statusCode === 500 ? "INVENTORY_MUTATION_FAILED" : undefined),
    message: statusCode === 500 ? "DB error" : error.message,
    error: error.message,
  });
}

async function refreshAlertsAfterCommittedMutation() {
  try {
    await refreshRedesignedInventoryAlerts(db);
    return true;
  } catch (error) {
    console.error("Stock mutation committed but alert refresh failed:", error);
    return false;
  }
}

function normaliseRecordedBy(recorded_by) {
  if (recorded_by == null) return null;
  const n = Number(recorded_by);
  return Number.isFinite(n) ? n : String(recorded_by);
}

async function ensureKitchenBatchesTable(conn = db) {
  await assertTableColumns(
    conn,
    {
      kitchen_batches: [
        "kitchen_batch_id", "storage_batch_id", "product_id",
        "withdrawn_qty", "used_qty", "returned_qty", "unit", "expiry_date",
        "withdrawn_at", "status", "created_at", "updated_at",
      ],
    },
    "Kitchen-batch schema",
  );
}

async function applySpoilageToKitchenBatches(conn, product_id, qty) {
  await ensureKitchenBatchesTable(conn);

  const [rows] = await conn.query(
    `SELECT
       kitchen_batch_id,
       COALESCE(withdrawn_qty, 0) AS withdrawn_qty,
       COALESCE(used_qty, 0) AS used_qty,
       COALESCE(returned_qty, 0) AS returned_qty
     FROM kitchen_batches
     WHERE product_id = ?
       AND DATE(withdrawn_at) = CURDATE()
     ORDER BY withdrawn_at ASC, kitchen_batch_id ASC
     FOR UPDATE`,
    [product_id],
  );

  let remaining = qty;

  for (const row of rows) {
    if (remaining <= 0) break;

    const withdrawnQty = Number(row.withdrawn_qty) || 0;
    const usedQty = Number(row.used_qty) || 0;
    const returnedQty = Number(row.returned_qty) || 0;
    const available = Math.max(0, withdrawnQty - usedQty - returnedQty);

    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const nextUsedQty = +(usedQty + take).toFixed(2);
    const nextStatus =
      nextUsedQty + returnedQty >= withdrawnQty ? "reconciled" : "active";

    await conn.query(
      `UPDATE kitchen_batches
       SET used_qty = ?,
           status = ?
       WHERE kitchen_batch_id = ?`,
      [nextUsedQty, nextStatus, row.kitchen_batch_id],
    );

    remaining = +(remaining - take).toFixed(2);
  }
}

async function ensureInventoryRow(conn, product_id, hasItemTypeColumn = true) {
  const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
  await conn.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT m.Product_ID, m.Stock, m.Stock, m.Stock
     FROM Menu m
     JOIN products p ON p.id = m.Product_ID
     WHERE m.Product_ID = ?
       AND ${itemTypeExpr} = ?
       AND NOT EXISTS (SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID)`,
    [product_id, STOCK_ITEM],
  );
}

// GET /api/stock-status/today
router.get("/today", requireInventoryManagerAccess, async (req, res) => {
  try {
    if (isRedesignedProfile()) {
      const [rows] = await db.query(
        `SELECT
           movement.stock_movement_id AS status_id,
           movement.product_id,
           product.name AS product_name,
           movement.movement_type AS type,
           ABS(movement.signed_quantity) AS quantity,
           movement.signed_quantity,
           movement.occurred_at AS status_date,
           movement.actor_user_id AS recorded_by,
           movement.batch_id,
           COALESCE(NULLIF(TRIM(unit.abbreviation), ''), unit.name) AS unit
         FROM stock_movements movement
         JOIN products product ON product.product_id = movement.product_id
         JOIN units unit ON unit.unit_id = movement.unit_id
         WHERE movement.occurred_at >= CURDATE()
           AND movement.occurred_at < CURDATE() + INTERVAL 1 DAY
           AND product.product_type = 'stock_item'
         ORDER BY movement.occurred_at DESC, movement.stock_movement_id DESC`,
      );
      return res.json(rows);
    }
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
    const [rows] = await db.query(
      `SELECT
         ss.Status_ID                              AS status_id,
         ss.Product_ID                             AS product_id,
         COALESCE(m.Product_Name, 'Unknown')       AS product_name,
         LOWER(COALESCE(ss.Type, 'initial'))       AS type,
         COALESCE(ss.Quantity, 0)                  AS quantity,
         ss.Status_Date                            AS status_date,
         ss.RecordedBy                             AS recorded_by
       FROM Stock_Status ss
       LEFT JOIN Menu m ON m.Product_ID = ss.Product_ID
       LEFT JOIN products p ON p.id = ss.Product_ID
       WHERE DATE(ss.Status_Date) = CURDATE()
         AND ${itemTypeExpr} = ?
       ORDER BY ss.Status_Date DESC, ss.Status_ID DESC`,
      [STOCK_ITEM],
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /stock-status/today error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /api/stock-status
// Handles: initial, supplementary (withdrawal) and return
router.post("/", requireInventoryManagerAccess, async (req, res) => {
  let conn;
  try {
    const { product_id, type, quantity, recorded_by } = req.body;
    const typeLow = String(type || "").toLowerCase();

    if (isRedesignedProfile()) {
      const actorUserId = Number(req.user?.userId);
      if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
        return res.status(401).json({ message: "Invalid authenticated user" });
      }
      if (["initial", "supplementary", "return"].includes(typeLow)) {
        return res.status(410).json({
          code: "WITHDRAWN_STOCK_WORKFLOW_RETIRED",
          message:
            "The withdrawn-stock workflow is not part of the redesigned inventory model.",
        });
      }
      if (typeLow === "receive") {
        return res.status(409).json({
          code: "STOCK_RECEIPT_REQUIRES_PURCHASE_ORDER",
          message: "Stock receiving must be completed through an approved purchase order.",
        });
      }
      const movementType = typeLow === "supplier_return"
        ? "return_to_supplier"
        : typeLow;
      if (!["adjustment", "return_in", "return_to_supplier"].includes(movementType)) {
        return res.status(400).json({ message: "Unsupported stock movement type" });
      }

      const result = await executeRedesignedInventoryMutation(db, {
        productId: product_id,
        movementType,
        quantity,
        signedQuantity: req.body.signed_quantity ?? quantity,
        batchId: req.body.batch_id,
        unit: req.body.unit_id ?? req.body.unit,
        actorUserId,
        sourceType: "manual_inventory",
        sourceId: req.body.source_id,
        idempotencyKey: requestIdempotencyKey(req),
        note: req.body.note ?? req.body.reason,
      });
      const alertsUpdated = await refreshAlertsAfterCommittedMutation();
      return res.status(result.idempotent ? 200 : 201).json({
        status_id: result.stockMovementId,
        product_id: result.productId,
        product_name: result.productName,
        type: result.movementType,
        quantity: Math.abs(result.signedQuantity),
        signed_quantity: result.signedQuantity,
        recorded_by: actorUserId,
        unit: result.unit,
        on_hand: result.onHand,
        idempotent: result.idempotent,
        alerts_updated: alertsUpdated,
      });
    }

    const qty = Number(quantity) || 0;

    if (!Number.isFinite(Number(product_id)) || qty <= 0 || !typeLow) {
      return res
        .status(400)
        .json({ message: "product_id, type, and quantity are required" });
    }

    if (["initial", "supplementary", "return"].includes(typeLow)) {
      return res.status(409).json({
        code: "BATCH_STOCK_MOVEMENT_REQUIRED",
        message:
          "Use the batch withdrawal or kitchen return workflow so inventory and batch quantities remain synchronized.",
      });
    }
    return res.status(400).json({ message: "Unsupported stock movement type" });

    const recordedByValue = normaliseRecordedBy(recorded_by);

    conn = await db.getConnection();
    await conn.beginTransaction();
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(conn);
    await assertProductsMatchItemType(conn, [product_id], STOCK_ITEM, "Stock");

    // 1. Log to Stock_Status
    const [result] = await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, ?, ?, NOW(), ?)`,
      [product_id, typeLow, qty, recordedByValue],
    );

    // 2. Ensure Inventory row exists
    await ensureInventoryRow(conn, product_id);

    if (typeLow === "return") {
      // Return → mainStock goes UP, dailyWithdrawn goes DOWN (wala na to pero sa ngayon wag muna)
      await conn.query(
        `UPDATE Inventory
         SET Stock           = COALESCE(Stock, 0) + ?,
             Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
             Returned        = COALESCE(Returned, 0) + ?,
             Last_Update     = NOW()
         WHERE Product_ID = ?`,
        [qty, qty, qty, product_id],
      );
      await conn.query(
        "UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?",
        [qty, product_id],
      );
    } else {
      // Withdrawal (initial / supplementary)
      // → mainStock goes DOWN, dailyWithdrawn goes UP (tatanggalin to pero sa ngayon wag muna)
      await conn.query(
        `UPDATE Inventory
         SET Stock           = GREATEST(COALESCE(Stock, 0) - ?, 0),
             Daily_Withdrawn = COALESCE(Daily_Withdrawn, 0) + ?,
             Last_Update     = NOW()
         WHERE Product_ID = ?`,
        [qty, qty, product_id],
      );
      await conn.query(
        "UPDATE Menu SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0) WHERE Product_ID = ?",
        [qty, product_id],
      );
    }

    await conn.commit();

    // Return the created record
    const createdRowItemTypeExpr = getProductItemTypeExpression(
      hasItemTypeColumn,
      "p",
      "m",
    );
    const [createdRows] = await db.query(
      `SELECT
         ss.Status_ID                              AS status_id,
         ss.Product_ID                             AS product_id,
         COALESCE(m.Product_Name, 'Unknown')       AS product_name,
         LOWER(COALESCE(ss.Type, 'initial'))       AS type,
         COALESCE(ss.Quantity, 0)                  AS quantity,
         ss.Status_Date                            AS status_date,
         ss.RecordedBy                             AS recorded_by
       FROM Stock_Status ss
       LEFT JOIN Menu m ON m.Product_ID = ss.Product_ID
       LEFT JOIN products p ON p.id = ss.Product_ID
       WHERE ss.Status_ID = ?
         AND ${createdRowItemTypeExpr} = ?`,
      [result.insertId, STOCK_ITEM],
    );

    res.status(201).json(createdRows[0]);
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err?.statusCode) console.error("POST /stock-status error:", err);
    if (isRedesignedProfile()) {
      return stockMutationErrorResponse(res, err);
    }
    const errorMessage = String(err?.message || "Unknown error");
    const isClientError = /must be stock_item|was not found/i.test(errorMessage);
    res
      .status(isClientError ? 400 : 500)
      .json({ message: isClientError ? errorMessage : "DB error", error: errorMessage });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/stock-status/spoilage
router.post("/spoilage", requireInventoryManagerAccess, async (req, res) => {
  let conn;
  try {
    const { product_id, quantity, recorded_by } = req.body;
    const qty = Number(quantity) || 0;
    const actorUserId = Number(req.user?.userId);
    const actorName =
      String(req.user?.username || "").trim() ||
      (Number.isSafeInteger(actorUserId) && actorUserId > 0
        ? `Staff #${actorUserId}`
        : "Authorized staff member");

    if (!Number.isFinite(Number(product_id)) || qty <= 0) {
      return res
        .status(400)
        .json({ message: "product_id and quantity are required" });
    }
    if (!Number.isSafeInteger(actorUserId) || actorUserId <= 0) {
      return res.status(401).json({ message: "Invalid authenticated user" });
    }

    if (isRedesignedProfile()) {
      const result = await executeRedesignedInventoryMutation(
        db,
        {
          productId: product_id,
          movementType: "spoilage",
          quantity: qty,
          batchId: req.body.batch_id,
          unit: req.body.unit_id ?? req.body.unit,
          actorUserId,
          sourceType: "manual_spoilage",
          sourceId: req.body.source_id,
          idempotencyKey: requestIdempotencyKey(req),
          note: req.body.reason ?? req.body.note,
        },
        {
          beforeCommit: async (transaction, mutation) => {
            if (mutation.idempotent) return;
            await createStaffNotification(transaction, {
              dedupeKey: `inventory_change:spoilage:${mutation.stockMovementId}`,
              category: "inventory_change",
              eventType: "inventory.spoilage",
              entityId: mutation.stockMovementId,
              audience: STAFF_NOTIFICATION_AUDIENCES.ADMINISTRATOR,
              actorUserId,
              title: `Inventory write-off · ${mutation.productName}`,
              message: `${qty} ${mutation.unit} of ${mutation.productName} written off by ${actorName}.`,
              status: "Completed",
              metadata: {
                actionType: "spoilage_write_off",
                stockMovementId: mutation.stockMovementId,
                productId: mutation.productId,
                productName: mutation.productName,
                quantity: qty,
                unit: mutation.unit,
                actorUserId,
                actorName,
                targetTab: "alerts",
              },
            });
          },
        },
      );
      const alertsUpdated = await refreshAlertsAfterCommittedMutation();
      return res.status(result.idempotent ? 200 : 201).json({
        success: true,
        product_id: result.productId,
        quantity: qty,
        stockStatusId: result.stockMovementId,
        stockMovementId: result.stockMovementId,
        dailyWithdrawn: 0,
        wasted: qty,
        on_hand: result.onHand,
        idempotent: result.idempotent,
        alerts_updated: alertsUpdated,
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(conn);
    await assertProductsMatchItemType(conn, [product_id], STOCK_ITEM, "Stock");

    await ensureInventoryRow(conn, product_id, hasItemTypeColumn);

    const [inventoryRows] = await conn.query(
      `SELECT
         COALESCE(i.Daily_Withdrawn, 0) AS dailyWithdrawn,
         COALESCE(i.Wasted, 0) AS wasted,
         COALESCE(
           NULLIF(TRIM(p.name), ''),
           NULLIF(TRIM(m.Product_Name), ''),
           NULLIF(TRIM(i.Item_Purchased), ''),
           CONCAT('Product #', i.Product_ID)
         ) AS productName,
         COALESCE(NULLIF(TRIM(i.unit), ''), 'unit') AS unit
       FROM Inventory i
       LEFT JOIN products p ON p.id = i.Product_ID
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       WHERE i.Product_ID = ?
       FOR UPDATE`,
      [product_id],
    );

    if (inventoryRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Inventory record not found" });
    }

    const availableWithdrawn = Number(inventoryRows[0].dailyWithdrawn) || 0;
    if (availableWithdrawn <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "No withdrawn stock available for spoilage.",
      });
    }
    if (qty > availableWithdrawn) {
      await conn.rollback();
      return res.status(400).json({
        message: `Spoilage cannot exceed withdrawn stock (${availableWithdrawn.toFixed(2)} available).`,
      });
    }

    const [stockStatusResult] = await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, 'spoilage', ?, NOW(), ?)`,
      [product_id, qty, normaliseRecordedBy(recorded_by)],
    );
    const stockStatusId = Number(stockStatusResult?.insertId);
    if (!Number.isSafeInteger(stockStatusId) || stockStatusId <= 0) {
      throw new Error("Unable to identify the completed spoilage operation");
    }

    // Spoilage — deducts mainStock only, dailyWithdrawn unchanged
    await applySpoilageToKitchenBatches(conn, product_id, qty);

    await conn.query(
      `UPDATE Inventory
       SET Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Wasted          = COALESCE(Wasted, 0) + ?,
           Last_Update     = NOW()
       WHERE Product_ID = ?`,
      [qty, qty, product_id],
    );

    const productName = String(inventoryRows[0].productName || `Product #${product_id}`);
    const unit = String(inventoryRows[0].unit || "unit");
    await createStaffNotification(conn, {
      dedupeKey: `inventory_change:spoilage:${stockStatusId}`,
      category: "inventory_change",
      eventType: "inventory.spoilage",
      entityId: stockStatusId,
      audience: STAFF_NOTIFICATION_AUDIENCES.ADMINISTRATOR,
      actorUserId,
      title: `Inventory write-off · ${productName}`,
      message: `${qty} ${unit} of ${productName} written off by ${actorName}.`,
      status: "Completed",
      metadata: {
        actionType: "spoilage_write_off",
        stockStatusId,
        productId: Number(product_id),
        productName,
        quantity: qty,
        unit,
        actorUserId,
        actorName,
        targetTab: "alerts",
      },
    });

    await conn.commit();
    res.status(201).json({
      success: true,
      product_id,
      quantity: qty,
      stockStatusId,
      dailyWithdrawn: +(availableWithdrawn - qty).toFixed(2),
      wasted: +((Number(inventoryRows[0].wasted) || 0) + qty).toFixed(2),
    });
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err?.statusCode) console.error("POST /stock-status/spoilage error:", err);
    if (isRedesignedProfile()) {
      return stockMutationErrorResponse(res, err);
    }
    const errorMessage = String(err?.message || "Unknown error");
    const isClientError = /must be stock_item|was not found/i.test(errorMessage);
    res
      .status(isClientError ? 400 : 500)
      .json({ message: isClientError ? errorMessage : "DB error", error: errorMessage });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
