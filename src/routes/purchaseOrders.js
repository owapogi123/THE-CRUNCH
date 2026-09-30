"use strict";

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const {
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
} = require("../utils/productItemType");
const { requireInventoryManagerAccess } = require("../middleware/staffAccess");

// helpers

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const PURCHASE_ORDER_NAME_MAX_LENGTH = 100;
const PURCHASE_ORDER_NUMBER_MAX_DIGITS = 20;
const PURCHASE_ORDER_QUANTITY_MAX = 999;

function hasValidNumericLength(value, maxDigits = PURCHASE_ORDER_NUMBER_MAX_DIGITS) {
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  return digitsOnly.length > 0 && digitsOnly.length <= maxDigits;
}

function hasProvidedValue(value) {
  return !(
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  );
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

function normalizeInventoryCategoryName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getLevenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

async function resolveInventoryCategoryTracking(connOrDb, categoryValue) {
  const [rows] = await connOrDb.query(
    `SELECT name, date_tracking_type
       FROM inventory_categories`,
  );

  const normalizedCategory = normalizeInventoryCategoryName(categoryValue);
  const normalizedRows = rows.map((row) => ({
    name: String(row.name || ""),
    normalizedName: normalizeInventoryCategoryName(row.name),
    dateTrackingType: String(row.date_tracking_type || "none"),
  }));

  const directMatch =
    normalizedRows.find((row) => row.normalizedName === normalizedCategory) ??
    null;
  if (directMatch) {
    return {
      matchedCategory: directMatch.name,
      dateTrackingType: directMatch.dateTrackingType,
    };
  }

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of normalizedRows) {
    const distance = getLevenshteinDistance(
      normalizedCategory,
      row.normalizedName,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = row;
    }
  }

  if (bestMatch && bestDistance <= 2) {
    return {
      matchedCategory: bestMatch.name,
      dateTrackingType: bestMatch.dateTrackingType,
    };
  }

  return {
    matchedCategory: null,
    dateTrackingType: "none",
  };
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

// supplier history logger

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

// table bootstrap

// shape helpers

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

// GET /api/purchase-orders

router.get("/", async (_req, res) => {
  try {
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

// GET /api/purchase-orders/:id

router.get("/:id", async (req, res) => {
  const poId = req.params.id;

  try {
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

// POST /api/purchase-orders

router.post("/", requireInventoryManagerAccess, async (req, res) => {
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
  for (const item of items) {
    const safeName = String(item?.name ?? "").trim();
    if (!safeName) {
      return res.status(400).json({
        error: "Each purchase order item must have a name",
      });
    }
    if (safeName.length > PURCHASE_ORDER_NAME_MAX_LENGTH) {
      return res.status(400).json({
        error: "Purchase order item name must not exceed 100 characters",
      });
    }
    const rawQuantity = String(item.quantity ?? "").trim();
    const safeQuantity = toNumber(rawQuantity, Number.NaN);
    if (
      !/^\d+$/.test(rawQuantity) ||
      !Number.isFinite(safeQuantity) ||
      !Number.isInteger(safeQuantity) ||
      safeQuantity < 1 ||
      safeQuantity > PURCHASE_ORDER_QUANTITY_MAX
    ) {
      return res.status(400).json({
        error: "Purchase order item quantity must be a whole number from 1 to 999",
      });
    }
    const submittedUnitCost = item.unitCost ?? item.unit_cost;
    if (hasProvidedValue(submittedUnitCost)) {
      if (!hasValidNumericLength(submittedUnitCost)) {
        return res.status(400).json({
          error: "Purchase order item unit cost is too long or invalid",
        });
      }
      const safeUnitCost = toNumber(submittedUnitCost, Number.NaN);
      if (!Number.isFinite(safeUnitCost) || safeUnitCost < 0) {
        return res.status(400).json({
          error: "Purchase order item unit cost cannot be negative",
        });
      }
    }
    if (!String(item.unit ?? "").trim()) {
      return res.status(400).json({
        error: "Purchase order item unit is required and must come from inventory",
      });
    }
  }

  const validStatuses = ["Draft", "Ordered", "Received", "Cancelled"];
  const safeStatus = validStatuses.includes(status) ? status : "Draft";

  let conn;
  try {
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
          toNumber(item.unitCost ?? item.unit_cost, 0),
          toDateString(item.expectedExpiryDate ?? item.expected_expiry_date) ||
            null,
        ],
      );
    }

    await conn.commit();

    // Log PO Created
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

// PATCH /api/purchase-orders/:id/status

router.patch("/:id/status", requireInventoryManagerAccess, async (req, res) => {
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

    // Log status change
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

// PATCH /api/purchase-orders/:id/receive

router.patch("/:id/receive", requireInventoryManagerAccess, async (req, res) => {
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
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");

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

    const [items] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    const invalidItem = items.find((item) => {
      const quantity = toNumber(item.quantity, Number.NaN);
      return (
        !Number.isFinite(quantity) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > PURCHASE_ORDER_QUANTITY_MAX
      );
    });
    if (invalidItem) {
      await conn.rollback();
      return res.status(400).json({
        error:
          "Purchase order contains an item quantity outside the allowed whole-number range of 1 to 999",
      });
    }

    await conn.query(
      `UPDATE purchase_orders
       SET status = 'Received', receipt_no = ?, received_by = ?, received_date = ?
       WHERE po_id = ?`,
      [receiptNo ? String(receiptNo).trim() : null, receivedBy, recDate, poId],
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
           AND ${itemTypeExpr} = ?
         LIMIT 1`,
        [item.name, STOCK_ITEM],
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
           LEFT JOIN products p ON p.id = m.Product_ID
           WHERE LOWER(TRIM(m.Product_Name)) = LOWER(TRIM(?))
             AND ${itemTypeExpr} = ?
           LIMIT 1`,
          [item.name, STOCK_ITEM],
        );

        if (matchedMenu) {
          productId = matchedMenu.product_id;
          productRow = matchedMenu;

          const upsertSql = hasItemTypeColumn
            ? `INSERT INTO products (id, name, price, quantity, description, item_type)
               VALUES (?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 name = VALUES(name),
                 price = VALUES(price)`
            : `INSERT INTO products (id, name, price, quantity, description)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 name = VALUES(name),
                 price = VALUES(price)`;
          await conn.query(
            upsertSql,
            hasItemTypeColumn
              ? [
                  matchedMenu.product_id,
                  matchedMenu.product_name || item.name,
                  toNumber(matchedMenu.price),
                  toNumber(matchedMenu.stock),
                  null,
                  STOCK_ITEM,
                ]
              : [
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
      const { dateTrackingType } =
        await resolveInventoryCategoryTracking(conn, item.category);

      const usesShelfLife = dateTrackingType === "shelf_life";
      const usesExpiry = dateTrackingType === "expiry";
      const itemExpiryDate = usesExpiry
        ? toDateString(itemExpiryDates?.[item.item_id])
        : null;
      const usableUntil = usesShelfLife
        ? computeUsableUntil(safeReceivedAt, shelfLifeDays, shelfLifeHours)
        : null;

      if (usesShelfLife && !usableUntil) {
        await conn.rollback();
        return res.status(400).json({
          error: `Shelf life is required for "${item.name}"`,
        });
      }

      if (usesExpiry && !itemExpiryDate) {
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

router.delete("/:id", requireInventoryManagerAccess, async (req, res) => {
  const poId = req.params.id;

  try {
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
