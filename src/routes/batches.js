const express = require("express");
const router = express.Router();
const db = require("../config/db");

async function ensureBatchesTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS batches (
      batch_id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT NOT NULL,
      delivery_batch_id VARCHAR(50),
      quantity DECIMAL(10,2) NOT NULL,
      remaining_qty DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20) DEFAULT 'kg',
      received_date DATE NOT NULL,
      expiry_date DATE NULL,
      status ENUM('active','withdrawn','returned','expired') DEFAULT 'active',
      returned_qty DECIMAL(10,2) DEFAULT 0,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Legacy compatibility: old schema uses id/productId/receivedAt/expiresAt and has no remaining_qty.
  const [columns] = await db.query(`SHOW COLUMNS FROM batches`);
  const fieldSet = new Set(columns.map((c) => c.Field));

  if (!fieldSet.has("delivery_batch_id")) {
    await db.query(
      "ALTER TABLE batches ADD COLUMN delivery_batch_id VARCHAR(50)",
    );
  }

  const isLegacySchema =
    fieldSet.has("productId") ||
    fieldSet.has("receivedAt") ||
    !fieldSet.has("product_id");

  if (!isLegacySchema) return;

  const legacyBackupTable = `batches_legacy_${Date.now()}`;

  // Prepare new-format table.
  await db.query(`DROP TABLE IF EXISTS batches_new`);
  await db.query(`
    CREATE TABLE batches_new (
      batch_id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT NOT NULL,
      delivery_batch_id VARCHAR(50),
      quantity DECIMAL(10,2) NOT NULL,
      remaining_qty DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20) DEFAULT 'kg',
      received_date DATE NOT NULL,
      expiry_date DATE NULL,
      status ENUM('active','withdrawn','returned','expired') DEFAULT 'active',
      returned_qty DECIMAL(10,2) DEFAULT 0,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Ensure FK target rows exist in products before migrating.
  await db.query(`
    INSERT INTO products (id, name, price, quantity, description)
    SELECT m.Product_ID, m.Product_Name, COALESCE(m.Price, 0), COALESCE(m.Stock, 0), NULL
    FROM Menu m
    WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = m.Product_ID)
  `);

  // Migrate legacy rows to the new table shape.
  await db.query(`
    INSERT INTO batches_new
      (product_id, quantity, remaining_qty, unit, received_date, expiry_date, status, returned_qty, notes)
    SELECT
      lb.productId,
      COALESCE(lb.quantity, 0),
      COALESCE(lb.quantity, 0),
      COALESCE(lb.unit, 'kg'),
      DATE(COALESCE(lb.receivedAt, NOW())),
      CASE WHEN lb.expiresAt IS NULL THEN NULL ELSE DATE(lb.expiresAt) END,
      CASE
        WHEN LOWER(COALESCE(lb.status, 'active')) IN ('active', 'withdrawn', 'returned', 'expired')
          THEN LOWER(lb.status)
        ELSE 'active'
      END,
      0,
      'migrated_from_legacy'
    FROM batches lb
    WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = lb.productId)
  `);

  // Swap tables atomically: keep old table as backup.
  await db.query(
    `RENAME TABLE batches TO ${legacyBackupTable}, batches_new TO batches`,
  );
}

async function ensureKitchenBatchesTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS kitchen_batches (
      kitchen_batch_id INT PRIMARY KEY AUTO_INCREMENT,
      storage_batch_id INT NULL,
      product_id INT NOT NULL,
      withdrawn_qty DECIMAL(10,2) NOT NULL,
      used_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
      returned_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
      unit VARCHAR(20) DEFAULT 'kg',
      expiry_date DATE NULL,
      withdrawn_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status ENUM('active','reconciled') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (storage_batch_id) REFERENCES batches(batch_id) ON DELETE SET NULL,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getKitchenBatchById(conn, kitchenBatchId) {
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
     LIMIT 1`,
    [kitchenBatchId],
  );

  return rows[0] || null;
}

async function reconcileDefaultBatchForStock(conn, productId) {
  const [[inventoryRow]] = await conn.query(
    `SELECT COALESCE(Stock, 0) AS stock
     FROM Inventory
     WHERE Product_ID = ?
     LIMIT 1`,
    [productId],
  );

  const inventoryStock = toNumber(inventoryRow?.stock);
  if (inventoryStock <= 0) {
    return { created: false, addedQty: 0 };
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
    return { created: false, addedQty: 0 };
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

  return { created: true, addedQty: missingQty };
}

router.get("/kitchen", async (_req, res) => {
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

router.get("/kitchen/today", async (_req, res) => {
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

router.post("/kitchen", async (req, res) => {
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

  let conn;
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    let unit = "kg";
    let expiryDate = null;
    let resolvedStorageBatchId = storageBatchId;

    if (resolvedStorageBatchId) {
      const [storageRows] = await conn.query(
        `SELECT batch_id, unit, expiry_date
         FROM batches
         WHERE batch_id = ?
         LIMIT 1`,
        [resolvedStorageBatchId],
      );

      if (storageRows.length > 0) {
        unit = storageRows[0].unit || unit;
        expiryDate = storageRows[0].expiry_date || null;
      } else {
        resolvedStorageBatchId = null;
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

router.patch("/kitchen/:kitchen_batch_id/supplement", async (req, res) => {
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

  let conn;
  try {
    await ensureBatchesTable();
    await ensureKitchenBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const existing = await getKitchenBatchById(conn, kitchenBatchId);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: "Kitchen batch not found" });
    }

    let nextStorageBatchId = existing.storage_batch_id;
    let nextUnit = existing.unit;
    let nextExpiryDate = existing.expiry_date;

    if (storageBatchId) {
      const [storageRows] = await conn.query(
        `SELECT batch_id, unit, expiry_date
         FROM batches
         WHERE batch_id = ?
         LIMIT 1`,
        [storageBatchId],
      );

      if (storageRows.length > 0) {
        nextStorageBatchId = storageRows[0].batch_id;
        nextUnit = storageRows[0].unit || nextUnit;
        nextExpiryDate = storageRows[0].expiry_date || nextExpiryDate;
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

router.patch("/kitchen/:kitchen_batch_id/return", async (req, res) => {
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

    const existing = await getKitchenBatchById(conn, kitchenBatchId);
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

    await conn.query(
      `UPDATE Inventory
       SET Stock = COALESCE(Stock, 0) + ?,
           Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Returned = COALESCE(Returned, 0) + ?,
           Last_Update = NOW()
       WHERE Product_ID = ?`,
      [qty, qty, qty, existing.product_id],
    );

    await conn.query(
      `UPDATE Menu
       SET Stock = COALESCE(Stock, 0) + ?
       WHERE Product_ID = ?`,
      [qty, existing.product_id],
    );

    await conn.query(
      `UPDATE products
       SET quantity = COALESCE(quantity, 0) + ?
       WHERE id = ?`,
      [qty, existing.product_id],
    );

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

router.patch("/kitchen/:kitchen_batch_id/reconcile", async (req, res) => {
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

    const existing = await getKitchenBatchById(conn, kitchenBatchId);
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
router.get("/product/:product_id", async (req, res) => {
  try {
    await ensureBatchesTable();

    const productId = toNumber(req.params.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ error: "Invalid product_id" });
    }

    const [rows] = await db.query(
      `SELECT b.*, p.name AS product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.product_id = ?
       ORDER BY b.received_date ASC`,
      [productId],
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching product batches:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET yesterday's returned batches
router.get("/returned/yesterday", async (_req, res) => {
  try {
    await ensureBatchesTable();

    const [rows] = await db.query(
      `SELECT b.*, p.name AS product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.status = 'returned'
         AND b.returned_qty > 0
         AND DATE(b.updated_at) = CURDATE() - INTERVAL 1 DAY
       ORDER BY b.received_date ASC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching yesterday returns:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET all active batches (FIFO source)
router.get("/active", async (_req, res) => {
  try {
    await ensureBatchesTable();

    const [rows] = await db.query(
      `SELECT b.*, p.name AS product_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.status IN ('active', 'returned')
         AND b.remaining_qty > 0
         AND (b.expiry_date IS NULL OR b.expiry_date >= CURDATE())
       ORDER BY CASE WHEN b.status = 'returned' THEN 0 ELSE 1 END, b.received_date ASC, b.batch_id ASC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching active batches:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create default batch from current stock (no stock increment)
router.post("/default", async (req, res) => {
  const productId = toNumber(req.body.product_id);

  if (!productId) {
    return res.status(400).json({ error: "product_id is required" });
  }

  let conn;
  try {
    await ensureBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Ensure product exists in `products` for FK integrity of batches.product_id -> products.id.
    const [productRows] = await conn.query(
      `SELECT id FROM products WHERE id = ? LIMIT 1`,
      [productId],
    );

    if (!productRows.length) {
      const [menuRows] = await conn.query(
        `SELECT Product_Name, Price, COALESCE(Stock, 0) AS stock
         FROM Menu
         WHERE Product_ID = ?
         LIMIT 1`,
        [productId],
      );

      if (!menuRows.length) {
        await conn.rollback();
        return res
          .status(404)
          .json({ error: "Product not found in Menu/products" });
      }

      const menu = menuRows[0];
      await conn.query(
        `INSERT INTO products (id, name, price, quantity, description)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           price = VALUES(price)`,
        [
          productId,
          menu.Product_Name || `Product ${productId}`,
          toNumber(menu.Price),
          toNumber(menu.stock),
          null,
        ],
      );
    }

    // Ensure inventory row exists.
    await conn.query(
      `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
       SELECT m.Product_ID, COALESCE(m.Stock, 0), COALESCE(m.Stock, 0), m.Product_Name
       FROM Menu m
       WHERE m.Product_ID = ?
         AND NOT EXISTS (SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID)`,
      [productId],
    );

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
      `SELECT COALESCE(i.Stock, m.Stock, 0) AS stock
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
router.post("/", async (req, res) => {
  const { product_id, quantity, unit, received_date, expiry_date, notes } =
    req.body;

  const productId = toNumber(product_id);
  const qty = toNumber(quantity);

  if (!productId || qty <= 0 || !received_date) {
    return res
      .status(400)
      .json({ error: "product_id, quantity and received_date are required" });
  }

  let conn;
  try {
    await ensureBatchesTable();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO batches
         (product_id, quantity, remaining_qty, unit, received_date, expiry_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        qty,
        qty,
        unit || "kg",
        received_date,
        expiry_date || null,
        notes || null,
      ],
    );

    // Keep inventory/menu/products aligned with your current stock flow.
    await conn.query(
      `UPDATE Inventory
       SET Stock = COALESCE(Stock, 0) + ?, Last_Update = NOW()
       WHERE Product_ID = ?`,
      [qty, productId],
    );

    await conn.query(
      `UPDATE Menu
       SET Stock = COALESCE(Stock, 0) + ?
       WHERE Product_ID = ?`,
      [qty, productId],
    );

    await conn.query(
      `UPDATE products
       SET quantity = COALESCE(quantity, 0) + ?
       WHERE id = ?`,
      [qty, productId],
    );

    await conn.commit();

    res
      .status(201)
      .json({ batch_id: result.insertId, message: "Batch added successfully" });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error adding batch:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST withdraw using FIFO or FEFO
router.post("/withdraw", async (req, res) => {
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

    await reconcileDefaultBatchForStock(conn, productId);

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
       ${orderClause}`,
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

    await conn.query(
      `UPDATE Inventory
       SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0),
           Daily_Withdrawn = COALESCE(Daily_Withdrawn, 0) + ?,
           Last_Update = NOW()
       WHERE Product_ID = ?`,
      [qtyNeeded, qtyNeeded, productId],
    );

    await conn.query(
      `UPDATE Menu
       SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0)
       WHERE Product_ID = ?`,
      [qtyNeeded, productId],
    );

    await conn.query(
      `UPDATE products
       SET quantity = GREATEST(COALESCE(quantity, 0) - ?, 0)
       WHERE id = ?`,
      [qtyNeeded, productId],
    );

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

// PUT edit batch (expiry/status/notes/unit and quantities)
router.put("/:batch_id", async (req, res) => {
  const batchId = toNumber(req.params.batch_id);
  if (!batchId) {
    return res.status(400).json({ error: "Invalid batch_id" });
  }

  const {
    quantity,
    remaining_qty,
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

    if (quantity !== undefined) {
      const q = toNumber(quantity);
      if (q < 0) {
        await conn.rollback();
        return res.status(400).json({ error: "quantity must be >= 0" });
      }
      updates.push("quantity = ?");
      values.push(q);
    }

    if (remaining_qty !== undefined) {
      const rq = toNumber(remaining_qty);
      if (rq < 0) {
        await conn.rollback();
        return res.status(400).json({ error: "remaining_qty must be >= 0" });
      }
      updates.push("remaining_qty = ?");
      values.push(rq);
    }

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

    // Keep Inventory/Menu/products stock aligned when remaining qty is edited.
    if (remaining_qty !== undefined) {
      const oldRemaining = toNumber(current.remaining_qty);
      const newRemaining = toNumber(remaining_qty);
      const delta = +(newRemaining - oldRemaining).toFixed(2);

      if (delta !== 0) {
        await conn.query(
          `UPDATE Inventory
           SET Stock = GREATEST(COALESCE(Stock, 0) + ?, 0), Last_Update = NOW()
           WHERE Product_ID = ?`,
          [delta, current.product_id],
        );

        await conn.query(
          `UPDATE Menu
           SET Stock = GREATEST(COALESCE(Stock, 0) + ?, 0)
           WHERE Product_ID = ?`,
          [delta, current.product_id],
        );

        await conn.query(
          `UPDATE products
           SET quantity = GREATEST(COALESCE(quantity, 0) + ?, 0)
           WHERE id = ?`,
          [delta, current.product_id],
        );
      }
    }

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
router.post("/return", async (req, res) => {
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
      `SELECT * FROM batches WHERE batch_id = ?`,
      [batchId],
    );

    if (!batches.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Batch not found" });
    }

    const batch = batches[0];

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

    await conn.query(
      `UPDATE Inventory
       SET Stock = COALESCE(Stock, 0) + ?,
           Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Returned = COALESCE(Returned, 0) + ?,
           Last_Update = NOW()
       WHERE Product_ID = ?`,
      [returnQty, returnQty, returnQty, batch.product_id],
    );

    await conn.query(
      `UPDATE Menu
       SET Stock = COALESCE(Stock, 0) + ?
       WHERE Product_ID = ?`,
      [returnQty, batch.product_id],
    );

    await conn.query(
      `UPDATE products
       SET quantity = COALESCE(quantity, 0) + ?
       WHERE id = ?`,
      [returnQty, batch.product_id],
    );

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
