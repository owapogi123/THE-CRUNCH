const express = require("express");
const router = express.Router();
const db = require("../config/db");
const {
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
  assertProductsMatchItemType,
} = require("../utils/productItemType");
const {
  requireInventoryManagerAccess,
  requireKitchenInventoryAccess,
} = require("../middleware/staffAccess");
const { assertTableColumns } = require("../services/schemaAssertions");
const {
  directStockUpdateResponse,
  findDirectStockQuantityFields,
  stockReceiptRequiresPurchaseOrderResponse,
} = require("../utils/stockMutationPolicy");

// Phase 4A canonical contract: products(id) is the authority;
// batches.product_id is NOT NULL; unit/status retain VARCHAR
// storage and all shelf-life fields; kitchen storage provenance stays nullable.
const BATCH_SCHEMA_CONTRACT = {
  batches: [
    "batch_id", "product_id", "delivery_batch_id", "quantity",
    "remaining_qty", "unit", "received_date", "expiry_date",
    "shelf_life_months", "shelf_life_days", "shelf_life_hours", "usable_until", "status",
    "returned_qty", "notes", "created_at", "updated_at",
  ],
};

const KITCHEN_BATCH_SCHEMA_CONTRACT = {
  kitchen_batches: [
    "kitchen_batch_id", "storage_batch_id", "product_id", "withdrawn_qty",
    "used_qty", "returned_qty", "unit", "expiry_date", "withdrawn_at",
    "status", "created_at", "updated_at",
  ],
};

async function ensureBatchesTable() {
  await ensureProductsItemTypeSchema(db);
  await assertTableColumns(db, BATCH_SCHEMA_CONTRACT, "Storage-batch schema");
  return true;
}

async function ensureKitchenBatchesTable() {
  await assertTableColumns(
    db,
    KITCHEN_BATCH_SCHEMA_CONTRACT,
    "Kitchen-batch schema",
  );
  return true;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getKitchenBatchById(conn, kitchenBatchId, { lock = false } = {}) {
  const [rows] = await conn.query(
    `SELECT
       kb.kitchen_batch_id,
       kb.storage_batch_id,
       kb.product_id,
       COALESCE(p.name, m.Product_Name, CONCAT('Product ', kb.product_id)) AS product_name,
       COALESCE(kb.withdrawn_qty, 0) AS withdrawn_qty,
       COALESCE(kb.used_qty, 0) AS used_qty,
       COALESCE(kb.returned_qty, 0) AS returned_qty,
       COALESCE(kb.unit, 'kg') AS unit,
       kb.expiry_date,
       kb.withdrawn_at,
       kb.status
     FROM kitchen_batches kb
     LEFT JOIN products p ON p.id = kb.product_id
     LEFT JOIN Menu m ON m.Product_ID = kb.product_id
     WHERE kb.kitchen_batch_id = ?
     LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [kitchenBatchId],
  );

  return rows[0] || null;
}

async function reconcileDefaultBatchForStock(conn, productId) {
  const [[inventoryRow]] = await conn.query(
    `SELECT COALESCE(Stock, 0) AS stock
     FROM Inventory
     WHERE Product_ID = ?
     LIMIT 1
     FOR UPDATE`,
    [productId],
  );

  const inventoryStock = toNumber(inventoryRow?.stock);
  if (inventoryStock <= 0) {
    return { created: false, addedQty: 0, inventoryStock };
  }

  const [batchRows] = await conn.query(
    `SELECT COALESCE(SUM(remaining_qty), 0) AS batch_stock
     FROM batches
     WHERE product_id = ?
       AND status IN ('active', 'returned')
       AND remaining_qty > 0
       AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
    [productId],
  );

  const batchStock = toNumber(batchRows[0]?.batch_stock);
  const missingQty = +(inventoryStock - batchStock).toFixed(2);

  if (missingQty <= 0) {
    return { created: false, addedQty: 0, inventoryStock };
  }

  const [[lastBatchRow]] = await conn.query(
    `SELECT unit
     FROM batches
     WHERE product_id = ?
     ORDER BY batch_id DESC
     LIMIT 1`,
    [productId],
  );

  await conn.query(
    `INSERT INTO batches
       (product_id, quantity, remaining_qty, unit, received_date, expiry_date, status, returned_qty, notes)
     VALUES (?, ?, ?, ?, CURDATE(), NULL, 'active', 0, 'AUTO_DEFAULT')`,
    [productId, missingQty, missingQty, lastBatchRow?.unit || "kg"],
  );

  return { created: true, addedQty: missingQty, inventoryStock };
}

router.get("/kitchen", requireInventoryManagerAccess, async (_req, res) => {
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    const [rows] = await db.query(
      `SELECT
         kb.kitchen_batch_id,
         kb.storage_batch_id,
         kb.product_id,
         COALESCE(p.name, m.Product_Name, CONCAT('Product ', kb.product_id)) AS product_name,
         COALESCE(kb.withdrawn_qty, 0) AS withdrawn_qty,
         COALESCE(kb.used_qty, 0) AS used_qty,
         COALESCE(kb.returned_qty, 0) AS returned_qty,
         COALESCE(kb.unit, 'kg') AS unit,
         kb.expiry_date,
         kb.withdrawn_at,
         kb.status
       FROM kitchen_batches kb
       LEFT JOIN products p ON p.id = kb.product_id
       LEFT JOIN Menu m ON m.Product_ID = kb.product_id
       WHERE DATE(kb.withdrawn_at) = CURDATE()
       ORDER BY kb.withdrawn_at DESC, kb.kitchen_batch_id DESC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching kitchen batches:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/kitchen/today", requireInventoryManagerAccess, async (_req, res) => {
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    const [rows] = await db.query(
      `SELECT
         kb.kitchen_batch_id,
         kb.storage_batch_id,
         kb.product_id,
         COALESCE(p.name, m.Product_Name, CONCAT('Product ', kb.product_id)) AS product_name,
         COALESCE(kb.withdrawn_qty, 0) AS withdrawn_qty,
         COALESCE(kb.used_qty, 0) AS used_qty,
         COALESCE(kb.returned_qty, 0) AS returned_qty,
         COALESCE(kb.unit, 'kg') AS unit,
         kb.expiry_date,
         kb.withdrawn_at,
         kb.status
       FROM kitchen_batches kb
       LEFT JOIN products p ON p.id = kb.product_id
       LEFT JOIN Menu m ON m.Product_ID = kb.product_id
       WHERE DATE(kb.withdrawn_at) = CURDATE()
       ORDER BY kb.withdrawn_at DESC, kb.kitchen_batch_id DESC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching today's kitchen batches:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/kitchen", requireKitchenInventoryAccess, async (req, res) => {
  const { product_id, quantity, storage_batch_id } = req.body;

  const productId = toNumber(product_id);
  const qty = toNumber(quantity);
  const storageBatchId =
    storage_batch_id == null ? null : toNumber(storage_batch_id);

  if (!productId || qty <= 0) {
    return res
      .status(400)
      .json({ error: "product_id and quantity are required" });
  }
  if (storage_batch_id != null && !storageBatchId) {
    return res.status(400).json({ error: "Invalid storage_batch_id" });
  }

  let conn;
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();
    await assertProductsMatchItemType(
      conn,
      [productId],
      STOCK_ITEM,
      "Kitchen batch",
    );

    let unit = "kg";
    let expiryDate = null;
    let resolvedStorageBatchId = storageBatchId;

    if (resolvedStorageBatchId) {
      const [storageRows] = await conn.query(
        `SELECT batch_id, product_id, unit, expiry_date
         FROM batches
         WHERE batch_id = ?
           AND product_id = ?
         LIMIT 1`,
        [resolvedStorageBatchId, productId],
      );

      if (storageRows.length > 0) {
        unit = storageRows[0].unit || unit;
        expiryDate = storageRows[0].expiry_date || null;
      } else {
        await conn.rollback();
        return res.status(409).json({
          error: "storage_batch_id must reference a batch for the same product",
        });
      }
    }

    if (!resolvedStorageBatchId) {
      const [fallbackRows] = await conn.query(
        `SELECT batch_id, unit, expiry_date
         FROM batches
         WHERE product_id = ?
         ORDER BY updated_at DESC, batch_id DESC
         LIMIT 1`,
        [productId],
      );

      if (fallbackRows.length > 0) {
        resolvedStorageBatchId = fallbackRows[0].batch_id;
        unit = fallbackRows[0].unit || unit;
        expiryDate = fallbackRows[0].expiry_date || null;
      }
    }

    const [insertResult] = await conn.query(
      `INSERT INTO kitchen_batches
         (storage_batch_id, product_id, withdrawn_qty, used_qty, returned_qty, unit, expiry_date, withdrawn_at, status)
       VALUES (?, ?, ?, 0, 0, ?, ?, NOW(), 'active')`,
      [resolvedStorageBatchId, productId, qty, unit, expiryDate],
    );

    const created = await getKitchenBatchById(conn, insertResult.insertId);
    await conn.commit();
    res.status(201).json(created);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error creating kitchen batch:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.patch("/kitchen/:kitchen_batch_id/supplement", requireKitchenInventoryAccess, async (req, res) => {
  const kitchenBatchId = toNumber(req.params.kitchen_batch_id);
  const qty = toNumber(req.body.qty);
  const storageBatchId =
    req.body.storage_batch_id == null
      ? null
      : toNumber(req.body.storage_batch_id);

  if (!kitchenBatchId || qty <= 0) {
    return res
      .status(400)
      .json({ error: "kitchen_batch_id and qty are required" });
  }
  if (req.body.storage_batch_id != null && !storageBatchId) {
    return res.status(400).json({ error: "Invalid storage_batch_id" });
  }

  let conn;
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const existing = await getKitchenBatchById(conn, kitchenBatchId, {
      lock: true,
    });
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: "Kitchen batch not found" });
    }

    let nextStorageBatchId = existing.storage_batch_id;
    let nextUnit = existing.unit;
    let nextExpiryDate = existing.expiry_date;

    if (storageBatchId) {
      const [storageRows] = await conn.query(
        `SELECT batch_id, product_id, unit, expiry_date
         FROM batches
         WHERE batch_id = ?
           AND product_id = ?
         LIMIT 1`,
        [storageBatchId, existing.product_id],
      );

      if (storageRows.length > 0) {
        nextStorageBatchId = storageRows[0].batch_id;
        nextUnit = storageRows[0].unit || nextUnit;
        nextExpiryDate = storageRows[0].expiry_date || nextExpiryDate;
      } else {
        await conn.rollback();
        return res.status(409).json({
          error: "storage_batch_id must reference a batch for the same product",
        });
      }
    }

    await conn.query(
      `UPDATE kitchen_batches
       SET withdrawn_qty = COALESCE(withdrawn_qty, 0) + ?,
           storage_batch_id = ?,
           unit = ?,
           expiry_date = ?,
           status = 'active'
       WHERE kitchen_batch_id = ?`,
      [qty, nextStorageBatchId, nextUnit, nextExpiryDate, kitchenBatchId],
    );

    const updated = await getKitchenBatchById(conn, kitchenBatchId);
    await conn.commit();
    res.json(updated);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error supplementing kitchen batch:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.patch("/kitchen/:kitchen_batch_id/return", requireKitchenInventoryAccess, async (req, res) => {
  const kitchenBatchId = toNumber(req.params.kitchen_batch_id);
  const requestedQty =
    req.body && req.body.qty !== undefined ? toNumber(req.body.qty) : null;
  const recordedBy =
    req.body && req.body.recorded_by !== undefined ? req.body.recorded_by : null;

  if (!kitchenBatchId) {
    return res.status(400).json({ error: "Invalid kitchen_batch_id" });
  }

  let conn;
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const existing = await getKitchenBatchById(conn, kitchenBatchId, {
      lock: true,
    });
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: "Kitchen batch not found" });
    }

    const remainingUnused = +(
      toNumber(existing.withdrawn_qty) -
      toNumber(existing.used_qty) -
      toNumber(existing.returned_qty)
    ).toFixed(2);

    const qty =
      requestedQty == null || requestedQty <= 0 ? remainingUnused : requestedQty;

    if (qty <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: "No unused quantity left to return" });
    }

    if (qty > remainingUnused) {
      await conn.rollback();
      return res.status(400).json({
        error: `Return quantity exceeds unused amount (${remainingUnused})`,
      });
    }

    let targetStorageBatchId = existing.storage_batch_id;

    if (!targetStorageBatchId) {
      const [fallbackRows] = await conn.query(
        `SELECT batch_id
         FROM batches
         WHERE product_id = ?
         ORDER BY updated_at DESC, batch_id DESC
         LIMIT 1`,
        [existing.product_id],
      );

      if (!fallbackRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: "No storage batch found for return" });
      }

      targetStorageBatchId = fallbackRows[0].batch_id;
    }

    const [matchingStorageRows] = await conn.query(
      `SELECT batch_id
       FROM batches
       WHERE batch_id = ?
         AND product_id = ?
       LIMIT 1`,
      [targetStorageBatchId, existing.product_id],
    );
    if (matchingStorageRows.length === 0) {
      await conn.rollback();
      return res.status(409).json({
        error: "Kitchen batch source must belong to the same product",
      });
    }

    await conn.query(
      `UPDATE batches
       SET remaining_qty = COALESCE(remaining_qty, 0) + ?,
           returned_qty = COALESCE(returned_qty, 0) + ?,
           status = CASE
             WHEN COALESCE(remaining_qty, 0) + ? > 0 THEN 'returned'
             ELSE status
           END
       WHERE batch_id = ?`,
      [qty, qty, qty, targetStorageBatchId],
    );

    await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, 'return', ?, NOW(), ?)`,
      [
        existing.product_id,
        qty,
        Number.isInteger(recordedBy) ? recordedBy : null,
      ],
    );

    const [inventoryUpdate] = await conn.query(
      `UPDATE Inventory
       SET Stock = COALESCE(Stock, 0) + ?,
           Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Returned = COALESCE(Returned, 0) + ?,
           Last_Update = NOW()
       WHERE Product_ID = ?`,
      [qty, qty, qty, existing.product_id],
    );

    const [menuUpdate] = await conn.query(
      `UPDATE Menu
       SET Stock = COALESCE(Stock, 0) + ?
       WHERE Product_ID = ?`,
      [qty, existing.product_id],
    );

    const [productUpdate] = await conn.query(
      `UPDATE products
       SET quantity = COALESCE(quantity, 0) + ?
       WHERE id = ?`,
      [qty, existing.product_id],
    );

    if (
      inventoryUpdate.affectedRows !== 1 ||
      menuUpdate.affectedRows !== 1 ||
      productUpdate.affectedRows !== 1
    ) {
      throw new Error("Inventory mirrors are incomplete; kitchen return was rolled back");
    }

    const nextReturnedQty = +(toNumber(existing.returned_qty) + qty).toFixed(2);
    const nextUsedQty = toNumber(existing.used_qty);
    const nextStatus =
      nextUsedQty + nextReturnedQty >= toNumber(existing.withdrawn_qty)
        ? "reconciled"
        : "active";

    await conn.query(
      `UPDATE kitchen_batches
       SET storage_batch_id = ?,
           returned_qty = ?,
           status = ?
       WHERE kitchen_batch_id = ?`,
      [targetStorageBatchId, nextReturnedQty, nextStatus, kitchenBatchId],
    );

    const updated = await getKitchenBatchById(conn, kitchenBatchId);
    await conn.commit();
    res.json(updated);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error returning kitchen batch stock:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.patch("/kitchen/:kitchen_batch_id/reconcile", requireKitchenInventoryAccess, async (req, res) => {
  const kitchenBatchId = toNumber(req.params.kitchen_batch_id);

  if (!kitchenBatchId) {
    return res.status(400).json({ error: "Invalid kitchen_batch_id" });
  }

  let conn;
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const existing = await getKitchenBatchById(conn, kitchenBatchId, {
      lock: true,
    });
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: "Kitchen batch not found" });
    }

    const requestedUsedQty =
      req.body && req.body.used_qty !== undefined
        ? toNumber(req.body.used_qty)
        : null;

    const requestedReturnedQty =
      req.body && req.body.returned_qty !== undefined
        ? toNumber(req.body.returned_qty)
        : null;

    let nextReturnedQty = toNumber(existing.returned_qty);
    if (requestedReturnedQty != null && requestedReturnedQty >= 0) {
      nextReturnedQty = requestedReturnedQty;
    }

    let nextUsedQty =
      requestedUsedQty != null && requestedUsedQty >= 0
        ? requestedUsedQty
        : +(toNumber(existing.withdrawn_qty) - nextReturnedQty).toFixed(2);

    if (nextUsedQty < 0) nextUsedQty = 0;

    if (nextUsedQty + nextReturnedQty > toNumber(existing.withdrawn_qty)) {
      await conn.rollback();
      return res.status(400).json({
        error: "used_qty and returned_qty cannot exceed withdrawn_qty",
      });
    }

    await conn.query(
      `UPDATE kitchen_batches
       SET used_qty = ?,
           returned_qty = ?,
           status = 'reconciled'
       WHERE kitchen_batch_id = ?`,
      [nextUsedQty, nextReturnedQty, kitchenBatchId],
    );

    const updated = await getKitchenBatchById(conn, kitchenBatchId);
    await conn.commit();
    res.json(updated);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error reconciling kitchen batch:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// GET all batches for a product
router.get("/product/:product_id", requireInventoryManagerAccess, async (req, res) => {
  try {
    await ensureBatchesTable();
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p");

    const productId = toNumber(req.params.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: "Invalid product_id" });
    }

    const [rows] = await db.query(
      `SELECT b.*, p.name AS product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.product_id = ?
         AND ${itemTypeExpr} = ?
       ORDER BY b.received_date ASC`,
      [productId, STOCK_ITEM],
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching product batches:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET yesterday's returned batches
router.get("/returned/yesterday", requireInventoryManagerAccess, async (_req, res) => {
  try {
    await ensureBatchesTable();
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p");

    const [rows] = await db.query(
      `SELECT b.*, p.name AS product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.status = 'returned'
         AND ${itemTypeExpr} = ?
         AND b.returned_qty > 0
         AND DATE(b.updated_at) = CURDATE() - INTERVAL 1 DAY
       ORDER BY b.received_date ASC`,
      [STOCK_ITEM],
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching yesterday returns:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET all active batches (FIFO source)
router.get("/active", requireInventoryManagerAccess, async (_req, res) => {
  try {
    await ensureBatchesTable();

    const [rows] = await db.query(
      `SELECT
         b.batch_id,
         b.product_id,
         COALESCE(p.name, m.Product_Name, CONCAT('Product ', b.product_id)) AS product_name,
         b.quantity,
         b.remaining_qty,
         COALESCE(b.unit, 'kg') AS unit,
         b.received_date,
         b.expiry_date,
         LOWER(TRIM(COALESCE(b.status, 'active'))) AS status,
         COALESCE(b.returned_qty, 0) AS returned_qty,
         b.notes,
         b.updated_at
       FROM batches b
       LEFT JOIN products p ON p.id = b.product_id
       LEFT JOIN Menu m ON m.Product_ID = b.product_id
       WHERE COALESCE(b.remaining_qty, 0) > 0
         AND LOWER(TRIM(COALESCE(b.status, 'active'))) <> 'withdrawn'
       ORDER BY
         b.received_date ASC,
         b.batch_id ASC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching delivered batches:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create default batch from current stock (no stock increment)
router.post("/default", requireInventoryManagerAccess, async (req, res) => {
  const productId = toNumber(req.body.product_id);

  if (!productId) {
    return res.status(400).json({ error: "product_id is required" });
  }

  let conn;
  try {
    await ensureBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();
    await assertProductsMatchItemType(conn, [productId], STOCK_ITEM, "Batch");
    const [mirrorRows] = await conn.query(
      `SELECT p.id, m.Product_ID AS menu_id, i.Inventory_ID AS inventory_id
       FROM products p
       LEFT JOIN Menu m ON m.Product_ID = p.id
       LEFT JOIN Inventory i ON i.Product_ID = p.id
       WHERE p.id = ?
       LIMIT 1`,
      [productId],
    );
    if (!mirrorRows[0]?.menu_id || !mirrorRows[0]?.inventory_id) {
      await conn.rollback();
      return res.status(409).json({
        error: "Product inventory mirrors are incomplete; run the approved repair migration first",
      });
    }

    const [existing] = await conn.query(
      `SELECT * FROM batches
       WHERE product_id = ?
         AND notes = 'AUTO_DEFAULT'
       ORDER BY batch_id DESC
       LIMIT 1`,
      [productId],
    );

    if (existing.length > 0) {
      await conn.commit();
      return res.status(200).json({
        message: "Default batch already exists",
        batch_id: existing[0].batch_id,
      });
    }

    const [inventoryRows] = await conn.query(
      `SELECT COALESCE(i.Stock, 0) AS stock
       FROM Menu m
       LEFT JOIN Inventory i ON i.Product_ID = m.Product_ID
       WHERE m.Product_ID = ?
       LIMIT 1`,
      [productId],
    );

    if (!inventoryRows.length) {
      await conn.rollback();
      return res
        .status(404)
        .json({ error: "Inventory row not found for product" });
    }

    const stockQty = toNumber(inventoryRows[0].stock);
    if (stockQty <= 0) {
      await conn.rollback();
      return res
        .status(400)
        .json({ error: "Cannot create default batch for zero stock" });
    }

    const [lastUnitRows] = await conn.query(
      `SELECT unit FROM batches WHERE product_id = ? ORDER BY batch_id DESC LIMIT 1`,
      [productId],
    );
    const unit =
      lastUnitRows.length > 0 && lastUnitRows[0].unit
        ? String(lastUnitRows[0].unit)
        : "kg";

    const [insertResult] = await conn.query(
      `INSERT INTO batches
         (product_id, quantity, remaining_qty, unit, received_date, expiry_date, status, returned_qty, notes)
       VALUES (?, ?, ?, ?, CURDATE(), NULL, 'active', 0, 'AUTO_DEFAULT')`,
      [productId, stockQty, stockQty, unit],
    );

    await conn.commit();
    res.status(201).json({
      message: "Default batch created",
      batch_id: insertResult.insertId,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error creating default batch:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST add a new batch
router.post("/", requireInventoryManagerAccess, (_req, res) => {
  res.status(400).json(stockReceiptRequiresPurchaseOrderResponse());
});

// POST withdraw using FIFO or FEFO
router.post("/withdraw", requireInventoryManagerAccess, async (req, res) => {
  const {
    product_id,
    qty_needed,
    recorded_by,
    type = "initial",
    strategy = "fifo",
  } = req.body;

  const productId = toNumber(product_id);
  const qtyNeeded = toNumber(qty_needed);

  if (!productId || qtyNeeded <= 0) {
    return res
      .status(400)
      .json({ error: "product_id and qty_needed are required" });
  }

  let conn;
  try {
    await ensureBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    await assertProductsMatchItemType(conn, [productId], STOCK_ITEM, "Batch");
    const reconciliation = await reconcileDefaultBatchForStock(conn, productId);
    if (reconciliation.inventoryStock < qtyNeeded) {
      await conn.rollback();
      return res.status(400).json({
        error: `Insufficient stock. Available: ${reconciliation.inventoryStock}`,
      });
    }

    const normalizedStrategy =
      String(strategy || "fifo").toLowerCase() === "fefo" ? "fefo" : "fifo";

    const orderClause =
      normalizedStrategy === "fefo"
        ? `ORDER BY
             CASE WHEN status = 'returned' THEN 0 ELSE 1 END,
             CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
             expiry_date ASC,
             received_date ASC,
             batch_id ASC`
        : `ORDER BY
             CASE WHEN status = 'returned' THEN 0 ELSE 1 END,
             received_date ASC,
             batch_id ASC`;

    const [batches] = await conn.query(
      `SELECT *
       FROM batches
       WHERE product_id = ?
         AND status IN ('active', 'returned')
         AND remaining_qty > 0
         AND (expiry_date IS NULL OR expiry_date >= CURDATE())
       ${orderClause}
       FOR UPDATE`,
      [productId],
    );

    const totalAvailable = batches.reduce(
      (sum, b) => sum + toNumber(b.remaining_qty),
      0,
    );
    if (totalAvailable < qtyNeeded) {
      await conn.rollback();
      return res
        .status(400)
        .json({ error: `Insufficient stock. Available: ${totalAvailable}` });
    }

    let remaining = qtyNeeded;
    const usedBatches = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const take = Math.min(toNumber(batch.remaining_qty), remaining);
      const newRemQty = +(toNumber(batch.remaining_qty) - take).toFixed(2);
      const newStatus = newRemQty <= 0 ? "withdrawn" : batch.status;

      await conn.query(
        `UPDATE batches
         SET remaining_qty = ?, status = ?
         WHERE batch_id = ?`,
        [newRemQty, newStatus, batch.batch_id],
      );

      usedBatches.push({
        batch_id: batch.batch_id,
        received_date: batch.received_date,
        expiry_date: batch.expiry_date,
        taken: take,
      });

      remaining = +(remaining - take).toFixed(2);
    }

    await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, ?, ?, NOW(), ?)`,
      [
        productId,
        String(type).toLowerCase(),
        qtyNeeded,
        Number.isInteger(recorded_by) ? recorded_by : null,
      ],
    );

    const [inventoryUpdate] = await conn.query(
      `UPDATE Inventory
       SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0),
           Daily_Withdrawn = COALESCE(Daily_Withdrawn, 0) + ?,
           Last_Update = NOW()
       WHERE Product_ID = ?`,
      [qtyNeeded, qtyNeeded, productId],
    );

    const [menuUpdate] = await conn.query(
      `UPDATE Menu
       SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0)
       WHERE Product_ID = ?`,
      [qtyNeeded, productId],
    );

    const [productUpdate] = await conn.query(
      `UPDATE products
       SET quantity = GREATEST(COALESCE(quantity, 0) - ?, 0)
       WHERE id = ?`,
      [qtyNeeded, productId],
    );

    if (
      inventoryUpdate.affectedRows !== 1 ||
      menuUpdate.affectedRows !== 1 ||
      productUpdate.affectedRows !== 1
    ) {
      throw new Error("Inventory mirrors are incomplete; withdrawal was rolled back");
    }

    await conn.commit();

    res.json({
      message: "Withdrawal successful",
      batches_used: usedBatches,
      total_taken: qtyNeeded,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error in FIFO withdrawal:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PUT edit batch metadata. Quantities must only change through stock movements.
router.put("/:batch_id", requireInventoryManagerAccess, async (req, res) => {
  const batchId = toNumber(req.params.batch_id);
  if (!batchId) {
    return res.status(400).json({ error: "Invalid batch_id" });
  }

  const directStockFields = findDirectStockQuantityFields(req.body);
  if (directStockFields.length > 0) {
    return res
      .status(400)
      .json(directStockUpdateResponse(directStockFields));
  }

  const {
    unit,
    received_date,
    expiry_date,
    status,
    notes,
  } = req.body;

  let conn;
  try {
    await ensureBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT * FROM batches WHERE batch_id = ?`,
      [batchId],
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Batch not found" });
    }

    const current = rows[0];

    const updates = [];
    const values = [];

    if (unit !== undefined) {
      updates.push("unit = ?");
      values.push(unit || "kg");
    }

    if (received_date !== undefined) {
      updates.push("received_date = ?");
      values.push(received_date || current.received_date);
    }

    if (expiry_date !== undefined) {
      updates.push("expiry_date = ?");
      values.push(expiry_date || null);
    }

    if (status !== undefined) {
      updates.push("status = ?");
      values.push(status);
    }

    if (notes !== undefined) {
      updates.push("notes = ?");
      values.push(notes || null);
    }

    if (!updates.length) {
      await conn.rollback();
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(batchId);
    await conn.query(
      `UPDATE batches SET ${updates.join(", ")} WHERE batch_id = ?`,
      values,
    );

    const [updatedRows] = await conn.query(
      `SELECT * FROM batches WHERE batch_id = ?`,
      [batchId],
    );
    await conn.commit();
    res.json({ message: "Batch updated", batch: updatedRows[0] });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error updating batch:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST return stock back to a batch
router.post("/return", requireInventoryManagerAccess, async (req, res) => {
  const { batch_id, return_qty, recorded_by } = req.body;

  const batchId = toNumber(batch_id);
  const returnQty = toNumber(return_qty);

  if (!batchId || returnQty <= 0) {
    return res
      .status(400)
      .json({ error: "batch_id and return_qty are required" });
  }

  let conn;
  try {
    await ensureBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [batches] = await conn.query(
      `SELECT * FROM batches WHERE batch_id = ? FOR UPDATE`,
      [batchId],
    );

    if (!batches.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Batch not found" });
    }

    const batch = batches[0];
    const maxReturnable = Math.max(
      0,
      +(toNumber(batch.quantity) - toNumber(batch.remaining_qty)).toFixed(2),
    );
    if (returnQty > maxReturnable) {
      await conn.rollback();
      return res.status(400).json({
        error: `Return quantity exceeds withdrawn amount (${maxReturnable})`,
      });
    }

    await conn.query(
      `UPDATE batches
       SET remaining_qty = COALESCE(remaining_qty, 0) + ?,
           returned_qty = COALESCE(returned_qty, 0) + ?,
           status = 'returned'
       WHERE batch_id = ?`,
      [returnQty, returnQty, batchId],
    );

    await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, 'return', ?, NOW(), ?)`,
      [
        batch.product_id,
        returnQty,
        Number.isInteger(recorded_by) ? recorded_by : null,
      ],
    );

    const [inventoryUpdate] = await conn.query(
      `UPDATE Inventory
       SET Stock = COALESCE(Stock, 0) + ?,
           Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Returned = COALESCE(Returned, 0) + ?,
           Last_Update = NOW()
       WHERE Product_ID = ?`,
      [returnQty, returnQty, returnQty, batch.product_id],
    );

    const [menuUpdate] = await conn.query(
      `UPDATE Menu
       SET Stock = COALESCE(Stock, 0) + ?
       WHERE Product_ID = ?`,
      [returnQty, batch.product_id],
    );

    const [productUpdate] = await conn.query(
      `UPDATE products
       SET quantity = COALESCE(quantity, 0) + ?
       WHERE id = ?`,
      [returnQty, batch.product_id],
    );

    if (
      inventoryUpdate.affectedRows !== 1 ||
      menuUpdate.affectedRows !== 1 ||
      productUpdate.affectedRows !== 1
    ) {
      throw new Error("Inventory mirrors are incomplete; batch return was rolled back");
    }

    await conn.commit();

    res.json({ message: "Return recorded successfully", batch_id: batchId });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error recording batch return:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
