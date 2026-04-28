"use strict";

const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ─── helpers ─────────────────────────────────────────────────────────────────

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatPOId(counter) {
  return `PO-${String(counter).padStart(4, "0")}`;
}

function toDateString(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function toSqlDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toPositiveIntegerOrNull(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isStrictRawMaterialCategory(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "raw material" || normalized === "raw materials";
}

function computeUsableUntil(baseValue, shelfLifeDays, shelfLifeHours) {
  const base = new Date(baseValue);
  if (isNaN(base.getTime())) return null;
  const days = toPositiveIntegerOrNull(shelfLifeDays) || 0;
  const hours = toPositiveIntegerOrNull(shelfLifeHours) || 0;
  if (days <= 0 && hours <= 0) return null;

  const usableUntil = new Date(base.getTime());
  usableUntil.setDate(usableUntil.getDate() + days);
  usableUntil.setHours(usableUntil.getHours() + hours);
  return toSqlDateTime(usableUntil);
}

async function ensureBatchShelfLifeColumns(connOrDb = db) {
  await connOrDb.query(`
    CREATE TABLE IF NOT EXISTS batches (
      batch_id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT NOT NULL,
      delivery_batch_id VARCHAR(50),
      quantity DECIMAL(10,2) NOT NULL,
      remaining_qty DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20) DEFAULT 'kg',
      received_date DATE NOT NULL,
      expiry_date DATE NULL,
      shelf_life_days INT DEFAULT NULL,
      shelf_life_hours INT DEFAULT NULL,
      usable_until DATETIME DEFAULT NULL,
      status ENUM('active','withdrawn','returned','expired') DEFAULT 'active',
      returned_qty DECIMAL(10,2) DEFAULT 0,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [cols] = await connOrDb.query(`SHOW COLUMNS FROM batches`);
  const fieldSet = new Set(cols.map((c) => c.Field));

  if (!fieldSet.has("shelf_life_days")) {
    await connOrDb.query(
      `ALTER TABLE batches ADD COLUMN shelf_life_days INT DEFAULT NULL`,
    );
  }

  if (!fieldSet.has("shelf_life_hours")) {
    await connOrDb.query(
      `ALTER TABLE batches ADD COLUMN shelf_life_hours INT DEFAULT NULL`,
    );
  }

  if (!fieldSet.has("usable_until")) {
    await connOrDb.query(
      `ALTER TABLE batches ADD COLUMN usable_until DATETIME DEFAULT NULL`,
    );
  }
}

// ─── supplier history logger ──────────────────────────────────────────────────

async function logSupplierHistory(
  { supplier_name, action, details, performed_by = null },
  connOrDb = db,
) {
  try {
    await connOrDb.query(
      `INSERT INTO supplier_history (supplier_id, supplier_name, action, details, performed_by)
       VALUES (0, ?, ?, ?, ?)`,
      [
        supplier_name || "Unknown Supplier",
        action,
        details || null,
        performed_by,
      ],
    );
  } catch (err) {
    // Non-fatal — log but don't crash the request
    console.error("Failed to log supplier history:", err.message);
  }
}

// ─── table bootstrap ─────────────────────────────────────────────────────────

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS po_counter (
      id    INT PRIMARY KEY DEFAULT 1,
      value INT NOT NULL DEFAULT 0,
      CHECK (id = 1)
    )
  `);

  await db.query(`
    INSERT IGNORE INTO po_counter (id, value) VALUES (1, 0)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      po_id         VARCHAR(12)  NOT NULL PRIMARY KEY,
      supplier      VARCHAR(255) NOT NULL,
      contact       VARCHAR(100) DEFAULT '',
      order_date    DATE         NOT NULL,
      delivery_date DATE         NOT NULL,
      status        ENUM('Draft','Ordered','Received','Cancelled') NOT NULL DEFAULT 'Draft',
      notes         TEXT         DEFAULT NULL,
      receipt_no    VARCHAR(255) DEFAULT NULL,
      received_by   VARCHAR(255) DEFAULT NULL,
      received_date DATE         DEFAULT NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      item_id              INT          PRIMARY KEY AUTO_INCREMENT,
      po_id                VARCHAR(12)  NOT NULL,
      name                 VARCHAR(255) NOT NULL,
      category             VARCHAR(100) DEFAULT '',
      unit                 VARCHAR(50)  DEFAULT '',
      quantity             DECIMAL(10,2) NOT NULL DEFAULT 0,
      unit_cost            DECIMAL(10,2) NOT NULL DEFAULT 0,
      expected_expiry_date DATE         DEFAULT NULL,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE
    )
  `);

  {
    const [cols] = await db.query(`SHOW COLUMNS FROM purchase_order_items`);
    const fieldSet = new Set(cols.map((c) => c.Field));
    if (!fieldSet.has("expected_expiry_date")) {
      await db.query(
        `ALTER TABLE purchase_order_items ADD COLUMN expected_expiry_date DATE DEFAULT NULL`,
      );
    }
  }

  {
    const [cols] = await db.query(`SHOW COLUMNS FROM purchase_orders`);
    const fieldSet = new Set(cols.map((c) => c.Field));
    if (!fieldSet.has("receipt_no")) {
      await db.query(
        `ALTER TABLE purchase_orders ADD COLUMN receipt_no VARCHAR(255) DEFAULT NULL`,
      );
    }
  }
}

// ─── shape helpers ────────────────────────────────────────────────────────────

function shapePO(row, items = []) {
  return {
    id: row.po_id,
    supplier: row.supplier,
    contact: row.contact || "",
    date: toDateString(row.order_date),
    deliveryDate: toDateString(row.delivery_date),
    status: row.status,
    notes: row.notes || "",
    receiptNo: row.receipt_no || undefined,
    receivedBy: row.received_by || undefined,
    receivedDate: toDateString(row.received_date) || undefined,
    items: items.map((i) => ({
      id: i.item_id,
      name: i.name,
      category: i.category || "",
      unit: i.unit || "",
      quantity: toNumber(i.quantity),
      unitCost: toNumber(i.unit_cost),
      expectedExpiryDate: toDateString(i.expected_expiry_date) || undefined,
    })),
  };
}

// ─── GET /api/purchase-orders ─────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  try {
    await ensureTables();

    const [orders] = await db.query(
      `SELECT * FROM purchase_orders ORDER BY created_at DESC`,
    );

    if (!orders.length) return res.json([]);

    const poIds = orders.map((o) => o.po_id);

    const [allItems] = await db.query(
      `SELECT * FROM purchase_order_items WHERE po_id IN (?)`,
      [poIds],
    );

    const itemsByPO = {};
    for (const item of allItems) {
      if (!itemsByPO[item.po_id]) itemsByPO[item.po_id] = [];
      itemsByPO[item.po_id].push(item);
    }

    const result = orders.map((o) => shapePO(o, itemsByPO[o.po_id] || []));
    res.json(result);
  } catch (err) {
    console.error("GET /purchase-orders error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/purchase-orders/:id ────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const poId = req.params.id;

  try {
    await ensureTables();

    const [[order]] = await db.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );

    if (!order)
      return res.status(404).json({ error: "Purchase order not found" });

    const [items] = await db.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    res.json(shapePO(order, items));
  } catch (err) {
    console.error(`GET /purchase-orders/${poId} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/purchase-orders ────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const {
    supplier,
    contact = "",
    date,
    deliveryDate,
    status = "Draft",
    receiptNo = "",
    notes = "",
    items = [],
  } = req.body;

  if (!supplier || !supplier.trim()) {
    return res.status(400).json({ error: "supplier is required" });
  }

  const orderDate = toDateString(date) || toDateString(new Date());
  const delivDate = toDateString(deliveryDate);

  if (!delivDate) {
    return res.status(400).json({ error: "deliveryDate is required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "At least one item is required" });
  }

  const validStatuses = ["Draft", "Ordered", "Received", "Cancelled"];
  const safeStatus = validStatuses.includes(status) ? status : "Draft";

  let conn;
  try {
    await ensureTables();

    conn = await db.getConnection();
    await conn.beginTransaction();

    await conn.query(`UPDATE po_counter SET value = value + 1 WHERE id = 1`);
    const [[{ value: counter }]] = await conn.query(
      `SELECT value FROM po_counter WHERE id = 1`,
    );

    const poId = formatPOId(counter);

    await conn.query(
      `INSERT INTO purchase_orders
         (po_id, supplier, contact, order_date, delivery_date, status, notes, receipt_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        poId,
        supplier.trim(),
        contact.trim(),
        orderDate,
        delivDate,
        safeStatus,
        notes.trim() || null,
        String(receiptNo).trim() || null,
      ],
    );

    for (const item of items) {
      if (!item.name || !item.name.trim()) continue;
      await conn.query(
        `INSERT INTO purchase_order_items
           (po_id, name, category, unit, quantity, unit_cost, expected_expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          poId,
          item.name.trim(),
          (item.category || "").trim(),
          (item.unit || "").trim(),
          toNumber(item.quantity),
          toNumber(item.unitCost ?? item.unit_cost),
          toDateString(item.expectedExpiryDate ?? item.expected_expiry_date) ||
            null,
        ],
      );
    }

    await conn.commit();

    // ── Log PO Created ──────────────────────────────────────────────────────
    await logSupplierHistory({
      supplier_name: supplier.trim(),
      action: "Purchase Order Created",
      details: `PO: ${poId} | ${items.length} item(s) | Delivery: ${delivDate}${notes.trim() ? ` | Notes: ${notes.trim()}` : ""}`,
      performed_by: null,
    });

    const [[created]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );
    const [createdItems] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    res.status(201).json(shapePO(created, createdItems));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("POST /purchase-orders error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── PATCH /api/purchase-orders/:id/status ───────────────────────────────────

router.patch("/:id/status", async (req, res) => {
  const poId = req.params.id;
  const { status } = req.body;

  const validStatuses = ["Draft", "Ordered", "Received", "Cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${validStatuses.join(", ")}`,
    });
  }

  let conn;
  try {
    await ensureTables();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: "Purchase order not found" });
    }

    if (existing.status === "Cancelled" && status !== "Cancelled") {
      await conn.rollback();
      return res
        .status(409)
        .json({ error: "Cannot change status of a Cancelled order" });
    }

    await conn.query(`UPDATE purchase_orders SET status = ? WHERE po_id = ?`, [
      status,
      poId,
    ]);

    await conn.commit();

    // ── Log status change ───────────────────────────────────────────────────
    const actionMap = {
      Ordered: "Purchase Order Sent to Supplier",
      Cancelled: "Purchase Order Cancelled",
    };
    if (actionMap[status]) {
      await logSupplierHistory({
        supplier_name: existing.supplier,
        action: actionMap[status],
        details: `PO: ${poId} | Previous status: ${existing.status}`,
        performed_by: null,
      });
    }

    const [[updated]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );
    const [items] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    res.json(shapePO(updated, items));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(`PATCH /purchase-orders/${poId}/status error:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── PATCH /api/purchase-orders/:id/receive ──────────────────────────────────

router.patch("/:id/receive", async (req, res) => {
  const poId = req.params.id;
  const {
    receivedBy = "Staff on Duty",
    receiptNo = null,
    receivedDate,
    itemExpiryDates = {},
    itemShelfLife = {},
  } = req.body;

  const receivedAt = receivedDate ? new Date(receivedDate) : new Date();
  const safeReceivedAt = isNaN(receivedAt.getTime()) ? new Date() : receivedAt;
  const recDate = toDateString(safeReceivedAt) || toDateString(new Date());

  let conn;
  try {
    await ensureTables();
    await ensureBatchShelfLifeColumns();

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: "Purchase order not found" });
    }

    if (existing.status === "Received") {
      await conn.rollback();
      return res
        .status(409)
        .json({ error: "Order already marked as Received" });
    }

    if (existing.status === "Cancelled") {
      await conn.rollback();
      return res
        .status(409)
        .json({ error: "Cannot receive a Cancelled order" });
    }

    await conn.query(
      `UPDATE purchase_orders
       SET status = 'Received', receipt_no = ?, received_by = ?, received_date = ?
       WHERE po_id = ?`,
      [receiptNo ? String(receiptNo).trim() : null, receivedBy, recDate, poId],
    );

    const [items] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    const receivedItemNames = [];

    for (const item of items) {
      const qty = toNumber(item.quantity);
      if (qty <= 0) continue;

      let productId = null;
      let productRow = null;

      const [[matchedProduct]] = await conn.query(
        `SELECT p.id AS product_id,
                p.name AS product_name,
                p.price,
                p.quantity,
                COALESCE(m.Promo, '') AS promo,
                COALESCE(m.Category_Name, '') AS category_name
         FROM products p
         LEFT JOIN Menu m ON m.Product_ID = p.id
         WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(?))
         LIMIT 1`,
        [item.name],
      );

      if (matchedProduct) {
        productId = matchedProduct.product_id;
        productRow = matchedProduct;
      } else {
        const [[matchedMenu]] = await conn.query(
          `SELECT m.Product_ID AS product_id,
                  m.Product_Name AS product_name,
                  COALESCE(m.Price, 0) AS price,
                  COALESCE(m.Stock, 0) AS stock,
                  COALESCE(m.Promo, '') AS promo,
                  COALESCE(m.Category_Name, '') AS category_name
           FROM Menu m
           WHERE LOWER(TRIM(m.Product_Name)) = LOWER(TRIM(?))
           LIMIT 1`,
          [item.name],
        );

        if (matchedMenu) {
          productId = matchedMenu.product_id;
          productRow = matchedMenu;

          await conn.query(
            `INSERT INTO products (id, name, price, quantity, description)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               price = VALUES(price)`,
            [
              matchedMenu.product_id,
              matchedMenu.product_name || item.name,
              toNumber(matchedMenu.price),
              toNumber(matchedMenu.stock),
              null,
            ],
          );
        }
      }

      if (!productId) {
        console.warn(
          `[PO Receive] ${poId}: No product match for "${item.name}" - skipping`,
        );
        continue;
      }

      const [[menuRow]] = await conn.query(
        `SELECT Product_ID FROM Menu WHERE Product_ID = ? LIMIT 1`,
        [productId],
      );

      if (!menuRow) {
        await conn.query(
          `INSERT INTO Menu (Product_ID, Product_Name, Price, Stock)
           VALUES (?, ?, ?, ?)`,
          [
            productId,
            productRow?.product_name || item.name,
            toNumber(productRow?.price),
            toNumber(productRow?.quantity),
          ],
        );
      }

      const unit = item.unit || "kg";
      const shelfLifeInput = itemShelfLife?.[item.item_id] || {};
      const shelfLifeDays = toPositiveIntegerOrNull(
        shelfLifeInput.shelfLifeDays,
      );
      const shelfLifeHours = toPositiveIntegerOrNull(
        shelfLifeInput.shelfLifeHours,
      );
      const isRawMaterial = isStrictRawMaterialCategory(item.category);
      const itemExpiryDate = isRawMaterial
        ? null
        : toDateString(itemExpiryDates?.[item.item_id]);
      const usableUntil = isRawMaterial
        ? computeUsableUntil(safeReceivedAt, shelfLifeDays, shelfLifeHours)
        : null;

      if (isRawMaterial && !usableUntil) {
        await conn.rollback();
        return res.status(400).json({
          error: `Shelf life is required for raw material "${item.name}"`,
        });
      }

      if (!isRawMaterial && !itemExpiryDate) {
        await conn.rollback();
        return res.status(400).json({
          error: `Expiry date is required for "${item.name}"`,
        });
      }

      await conn.query(
        `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
         SELECT m.Product_ID, COALESCE(m.Stock, 0), COALESCE(m.Stock, 0), m.Product_Name
         FROM Menu m
         WHERE m.Product_ID = ?
           AND NOT EXISTS (
             SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID
           )`,
        [productId],
      );

      const [batchResult] = await conn.query(
        `INSERT INTO batches
           (product_id, quantity, remaining_qty, unit, received_date, expiry_date, shelf_life_days, shelf_life_hours, usable_until, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          qty,
          qty,
          unit,
          recDate,
          itemExpiryDate || null,
          shelfLifeDays,
          shelfLifeHours,
          usableUntil,
          `PO: ${poId}`,
        ],
      );

      await conn.query(
        `UPDATE Inventory
         SET Stock = COALESCE(Stock, 0) + ?,
             Last_Update = NOW()
         WHERE Product_ID = ?`,
        [qty, productId],
      );

      await conn.query(
        `UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?`,
        [qty, productId],
      );

      await conn.query(
        `UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?`,
        [qty, productId],
      );

      receivedItemNames.push(`${item.name} x${qty} ${unit}`);

      console.log(
        `[PO Receive] ${poId}: Created batch #${batchResult.insertId} for product ${productId} (${item.name}) - ${qty} ${unit}, expiry: ${itemExpiryDate || "none"}, usable until: ${usableUntil || "none"}`,
      );
    }

    await conn.commit();

    // ── Log PO Received with correct supplier name ──────────────────────────
    await logSupplierHistory({
      supplier_name: existing.supplier, // ← directly from PO, always correct
      action: "Batch Received",
      details: `PO: ${poId} | Receipt: ${receiptNo ? String(receiptNo).trim() : "N/A"} | Received by: ${receivedBy} | Items: ${receivedItemNames.join(", ") || "none"}`,
      performed_by: receivedBy,
    });

    const [[updated]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );
    const [updatedItems] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    res.json(shapePO(updated, updatedItems));
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(`PATCH /purchase-orders/${poId}/receive error:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /api/purchase-orders/:id ─────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const poId = req.params.id;

  try {
    await ensureTables();

    const [[existing]] = await db.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );

    if (!existing)
      return res.status(404).json({ error: "Purchase order not found" });

    if (existing.status === "Received") {
      return res.status(409).json({ error: "Cannot cancel a Received order" });
    }

    await db.query(
      `UPDATE purchase_orders SET status = 'Cancelled' WHERE po_id = ?`,
      [poId],
    );

    // ── Log cancellation ────────────────────────────────────────────────────
    await logSupplierHistory({
      supplier_name: existing.supplier,
      action: "Purchase Order Cancelled",
      details: `PO: ${poId} | Was: ${existing.status}`,
      performed_by: null,
    });

    res.json({ success: true, id: poId, status: "Cancelled" });
  } catch (err) {
    console.error(`DELETE /purchase-orders/${poId} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
