/**
 * purchaseOrders.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Express router for Purchase Orders.
 *
 * Tables created/used:
 *   purchase_orders        — one row per PO header
 *   purchase_order_items   — line items (child of purchase_orders)
 *
 * Frontend contract (matches StockManager.tsx PurchaseOrder / POItem types):
 *
 *   PurchaseOrder {
 *     id           string   "PO-0001"
 *     supplier     string
 *     contact      string
 *     date         string   "YYYY-MM-DD"   (order date)
 *     deliveryDate string   "YYYY-MM-DD"
 *     status       "Draft" | "Ordered" | "Received" | "Cancelled"
 *     items        POItem[]
 *     notes        string
 *     receivedBy?  string
 *     receivedDate? string  "YYYY-MM-DD"
 *   }
 *
 *   POItem {
 *     id        number
 *     name      string
 *     category  string
 *     unit      string
 *     quantity  number
 *     unitCost  number
 *   }
 *
 * Routes:
 *   GET    /api/purchase-orders              → list all POs
 *   GET    /api/purchase-orders/:id          → single PO with items
 *   POST   /api/purchase-orders              → create Draft PO
 *   PATCH  /api/purchase-orders/:id/status   → update status only
 *   PATCH  /api/purchase-orders/:id/receive  → mark Received + receivedBy
 *   DELETE /api/purchase-orders/:id          → soft-delete (Cancelled)
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const express = require("express");
const router = express.Router();
const db = require("../config/db");

// ─── helpers ─────────────────────────────────────────────────────────────────

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Zero-pad a counter into "PO-XXXX" format */
function formatPOId(counter) {
  return `PO-${String(counter).padStart(4, "0")}`;
}

/** Format a JS Date or date-string to "YYYY-MM-DD" */
function toDateString(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

// ─── table bootstrap ─────────────────────────────────────────────────────────

async function ensureTables() {
  // PO counter table — keeps the auto-incrementing PO number separate so it
  // survives deletes without leaving gaps in a confusing way.
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
      received_by   VARCHAR(255) DEFAULT NULL,
      received_date DATE         DEFAULT NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      item_id   INT          PRIMARY KEY AUTO_INCREMENT,
      po_id     VARCHAR(12)  NOT NULL,
      name      VARCHAR(255) NOT NULL,
      category  VARCHAR(100) DEFAULT '',
      unit      VARCHAR(50)  DEFAULT '',
      quantity  DECIMAL(10,2) NOT NULL DEFAULT 0,
      unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE
    )
  `);
}

// ─── shape helpers ───────────────────────────────────────────────────────────

/**
 * Convert a raw DB purchase_orders row + its items rows into the frontend
 * PurchaseOrder shape.
 */
function shapePO(row, items = []) {
  return {
    id: row.po_id,
    supplier: row.supplier,
    contact: row.contact || "",
    date: toDateString(row.order_date),
    deliveryDate: toDateString(row.delivery_date),
    status: row.status,
    notes: row.notes || "",
    receivedBy: row.received_by || undefined,
    receivedDate: toDateString(row.received_date) || undefined,
    items: items.map((i) => ({
      id: i.item_id,
      name: i.name,
      category: i.category || "",
      unit: i.unit || "",
      quantity: toNumber(i.quantity),
      unitCost: toNumber(i.unit_cost),
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

    // Fetch all items for these POs in one query.
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

    // Atomically increment counter and retrieve new value.
    await conn.query(`UPDATE po_counter SET value = value + 1 WHERE id = 1`);
    const [[{ value: counter }]] = await conn.query(
      `SELECT value FROM po_counter WHERE id = 1`,
    );

    const poId = formatPOId(counter);

    await conn.query(
      `INSERT INTO purchase_orders
         (po_id, supplier, contact, order_date, delivery_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        poId,
        supplier.trim(),
        contact.trim(),
        orderDate,
        delivDate,
        safeStatus,
        notes.trim() || null,
      ],
    );

    // Insert line items.
    for (const item of items) {
      if (!item.name || !item.name.trim()) continue;
      await conn.query(
        `INSERT INTO purchase_order_items
           (po_id, name, category, unit, quantity, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          poId,
          item.name.trim(),
          (item.category || "").trim(),
          (item.unit || "").trim(),
          toNumber(item.quantity),
          toNumber(item.unitCost ?? item.unit_cost),
        ],
      );
    }

    await conn.commit();

    // Return full PO shape.
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

    // Guard: cannot un-cancel or un-receive.
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
//
// Marks the PO as Received, stamps receivedBy + receivedDate.
// Optionally creates a batch in the `batches` table for each line item that
// maps to a known product (matched by name, case-insensitive).

router.patch("/:id/receive", async (req, res) => {
  const poId = req.params.id;
  const { receivedBy = "Staff on Duty", receivedDate, itemExpiryDates = {} } = req.body;

  const recDate = toDateString(receivedDate) || toDateString(new Date());

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

    // Mark as received.
    await conn.query(
      `UPDATE purchase_orders
       SET status = 'Received', received_by = ?, received_date = ?
       WHERE po_id = ?`,
      [receivedBy, recDate, poId],
    );

    // Fetch line items.
    const [items] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    // For each line item, try to match a product and create a batch.
    for (const item of items) {
      const qty = toNumber(item.quantity);
      if (qty <= 0) continue;

      // Try to find a matching product by name (case-insensitive).
      const [[matchedProduct]] = await conn.query(
        `SELECT p.id AS product_id, p.name
         FROM products p
         WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(?))
         LIMIT 1`,
        [item.name],
      );

      if (!matchedProduct) {
        // No matching product found — skip batch creation for this item.
        // The PO is still marked received; staff can manually add stock.
        continue;
      }

      const productId = matchedProduct.product_id;
      const unit = item.unit || "kg";
      const itemExpiryDate = toDateString(itemExpiryDates?.[item.item_id]);

      // Insert a new batch (FIFO).
      const [batchResult] = await conn.query(
        `INSERT INTO batches
           (product_id, quantity, remaining_qty, unit, received_date, expiry_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [productId, qty, qty, unit, recDate, itemExpiryDate, `PO: ${poId}`],
      );

      // Update Inventory stock.
      await conn.query(
        `UPDATE Inventory
         SET Stock = COALESCE(Stock, 0) + ?,
             Item_Purchased = COALESCE(Item_Purchased, 0) + ?,
             Last_Update = NOW()
         WHERE Product_ID = ?`,
        [qty, qty, productId],
      );

      // Keep Menu + products in sync.
      await conn.query(
        `UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?`,
        [qty, productId],
      );

      await conn.query(
        `UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?`,
        [qty, productId],
      );

      console.log(
        `[PO Receive] ${poId}: Created batch #${batchResult.insertId} for product ${productId} (${item.name}) — ${qty} ${unit}`,
      );
    }

    await conn.commit();

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
// Soft-delete: sets status to Cancelled (preserves audit trail).

router.delete("/:id", async (req, res) => {
  const poId = req.params.id;

  try {
    await ensureTables();

    const [[existing]] = await db.query(
      `SELECT status FROM purchase_orders WHERE po_id = ?`,
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

    res.json({ success: true, id: poId, status: "Cancelled" });
  } catch (err) {
    console.error(`DELETE /purchase-orders/${poId} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
