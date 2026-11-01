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
const {
  PURCHASE_ORDER_STATUSES,
  getGenericTransitionError,
  getReceiveTransitionError,
  getUnitCompatibilityError,
} = require("../services/purchaseOrderPolicy");
const {
  STAFF_NOTIFICATION_AUDIENCES,
  createStaffNotification,
} = require("../services/staffNotificationService");
const { getBusinessDateParts } = require("../services/orderIdentifierService");

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

function validateDraftItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throwPurchaseOrderError(400, "At least one item is required");
  }
  return items.map((item) => {
    const name = String(item?.name ?? "").trim();
    if (!name) {
      throwPurchaseOrderError(400, "Each purchase order item must have a name");
    }
    if (name.length > PURCHASE_ORDER_NAME_MAX_LENGTH) {
      throwPurchaseOrderError(
        400,
        "Purchase order item name must not exceed 100 characters",
      );
    }
    const rawQuantity = String(item.quantity ?? "").trim();
    const quantity = toNumber(rawQuantity, Number.NaN);
    if (
      !/^\d+$/.test(rawQuantity) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > PURCHASE_ORDER_QUANTITY_MAX
    ) {
      throwPurchaseOrderError(
        400,
        "Purchase order item quantity must be a whole number from 1 to 999",
      );
    }
    const rawUnitCost = item.unitCost ?? item.unit_cost;
    const unitCost = hasProvidedValue(rawUnitCost) ? Number(rawUnitCost) : 0;
    if (
      (hasProvidedValue(rawUnitCost) && !hasValidNumericLength(rawUnitCost)) ||
      !Number.isFinite(unitCost) ||
      unitCost < 0 ||
      unitCost > 99999999.99 ||
      Math.abs(unitCost * 100 - Math.round(unitCost * 100)) > 1e-7
    ) {
      throwPurchaseOrderError(
        400,
        "Purchase order item unit cost must fit DECIMAL(10,2) and cannot be negative",
      );
    }
    const unit = String(item.unit ?? "").trim();
    if (!unit) {
      throwPurchaseOrderError(
        400,
        "Purchase order item unit is required and must come from inventory",
      );
    }
    return { ...item, name, quantity, unitCost, unit };
  });
}

function formatPOId(counter) {
  return `PO-${String(counter).padStart(4, "0")}`;
}

async function createPurchaseOrderNotification(
  connection,
  { poId, event, actorUserId, supplier, status, deliveryDate },
) {
  if (event !== "received") {
    return { notificationId: null, created: false };
  }
  const eventLabels = {
    created: "created",
    ordered: "sent to supplier",
    received: "received",
    cancelled: "cancelled",
  };
  const eventLabel = eventLabels[event] || event;
  return createStaffNotification(connection, {
    dedupeKey: `purchase_order:${poId}:${event}`,
    category: "purchase_order",
    eventType: `purchase_order.${event}`,
    entityId: poId,
    audience: STAFF_NOTIFICATION_AUDIENCES.BOTH,
    // Receipt is a business event for both approved roles, including the
    // authenticated receiver. A null actor prevents the per-user feed filter
    // from hiding it from that receiver.
    actorUserId: null,
    title: `Purchase order ${eventLabel} · ${poId}`,
    message: `${supplier || "Supplier"} · Status: ${status}`,
    status,
    metadata: {
      poId,
      supplier: supplier || null,
      status,
      deliveryDate: deliveryDate || null,
    },
  });
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

class PurchaseOrderHttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function throwPurchaseOrderError(statusCode, message) {
  throw new PurchaseOrderHttpError(statusCode, message);
}

function toProductId(item) {
  const value = Number(item?.productId ?? item?.product_id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function resolveStockProduct(conn, item, itemTypeExpr, { lock = false } = {}) {
  const productId = toProductId(item);
  const whereClause = productId
    ? "p.id = ?"
    : "LOWER(TRIM(p.name)) = LOWER(TRIM(?))";
  const lookupValue = productId || String(item.name || "").trim();
  const [rows] = await conn.query(
    `SELECT p.id AS product_id,
            p.name AS product_name,
            COALESCE(p.quantity, 0) AS product_quantity,
            m.Product_ID AS menu_product_id,
            COALESCE(m.Stock, 0) AS menu_stock,
            COALESCE(m.Category_Name, '') AS category_name,
            i.Inventory_ID AS inventory_id,
            COALESCE(i.Stock, 0) AS inventory_stock,
            NULLIF(TRIM(i.unit), '') AS inventory_unit
       FROM products p
       LEFT JOIN Menu m ON m.Product_ID = p.id
       LEFT JOIN Inventory i ON i.Product_ID = p.id
      WHERE ${whereClause}
        AND ${itemTypeExpr} = ?
      ORDER BY p.id${lock ? " FOR UPDATE" : ""}`,
    [lookupValue, STOCK_ITEM],
  );

  if (rows.length === 0) {
    throwPurchaseOrderError(
      422,
      `No stock inventory product could be resolved for "${item.name}"`,
    );
  }
  if (productId && rows.length > 1) {
    throwPurchaseOrderError(
      409,
      `Inventory product "${item.name}" has multiple main-stock rows; receiving requires data reconciliation`,
    );
  }
  if (!productId && rows.length > 1) {
    throwPurchaseOrderError(
      409,
      `Multiple inventory products match legacy item "${item.name}"; receiving requires an explicit product mapping`,
    );
  }
  const product = rows[0];
  if (!product.menu_product_id) {
    throwPurchaseOrderError(
      422,
      `Inventory product "${item.name}" has no main-stock record`,
    );
  }
  return product;
}

function assertMatchingStockMirrors(item, product) {
  const values = product.inventory_id
    ? [
        Number(product.inventory_stock),
        Number(product.menu_stock),
        Number(product.product_quantity),
      ]
    : [Number(product.menu_stock), Number(product.product_quantity)];
  if (!values.every(Number.isFinite) || !values.every((value) => value === values[0])) {
    throwPurchaseOrderError(
      409,
      `Stock records for "${item.name}" are out of sync; receiving was stopped before inventory changed`,
    );
  }
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
      productId: i.product_id == null ? null : Number(i.product_id),
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

router.get("/", requireInventoryManagerAccess, async (_req, res) => {
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

router.get("/:id", requireInventoryManagerAccess, async (req, res) => {
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

// PUT /api/purchase-orders/:id
// Drafts are replaced atomically so a failed item validation/write cannot
// leave the purchase-order header and item rows out of sync.
router.put("/:id", requireInventoryManagerAccess, async (req, res) => {
  const poId = req.params.id;
  const {
    supplier,
    contact = "",
    date,
    deliveryDate,
    notes = "",
    items = [],
  } = req.body;

  let conn;
  try {
    const normalizedSupplier = String(supplier ?? "").trim();
    if (!normalizedSupplier) {
      throwPurchaseOrderError(400, "supplier is required");
    }
    const deliveryDateProvided = Object.prototype.hasOwnProperty.call(
      req.body,
      "deliveryDate",
    );
    let delivery = null;
    if (deliveryDateProvided && hasProvidedValue(deliveryDate)) {
      delivery = toDateString(deliveryDate);
      if (!delivery) {
        throwPurchaseOrderError(400, "deliveryDate must be a valid date");
      }
    }
    const orderDate = toDateString(date) || toDateString(new Date());
    const validatedItems = validateDraftItems(items);

    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(
      hasItemTypeColumn,
      "p",
      "m",
    );
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      "SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE",
      [poId],
    );
    if (!existing) throwPurchaseOrderError(404, "Purchase order not found");
    if (existing.status !== "Draft") {
      throwPurchaseOrderError(
        409,
        `Only Draft purchase orders can be edited; current status is ${existing.status}`,
      );
    }
    if (!deliveryDateProvided) {
      // Omission means "unchanged" for legacy drafts; explicit null clears it.
      delivery = toDateString(existing.delivery_date);
    }

    const resolvedItems = [];
    for (const item of validatedItems) {
      const product = await resolveStockProduct(conn, item, itemTypeExpr);
      const unitError = getUnitCompatibilityError(
        item.unit,
        product.inventory_unit,
      );
      if (unitError) {
        throwPurchaseOrderError(422, `${unitError} for "${item.name}"`);
      }
      resolvedItems.push({
        ...item,
        productId: product.product_id,
        name: product.product_name,
        category: product.category_name || String(item.category || "").trim(),
        unit: product.inventory_unit || item.unit,
      });
    }

    await conn.query(
      `UPDATE purchase_orders
          SET supplier = ?, contact = ?, order_date = ?, delivery_date = ?, notes = ?
        WHERE po_id = ? AND status = 'Draft'`,
      [
        normalizedSupplier,
        String(contact ?? "").trim(),
        orderDate,
        delivery,
        String(notes ?? "").trim() || null,
        poId,
      ],
    );
    await conn.query("DELETE FROM purchase_order_items WHERE po_id = ?", [poId]);
    for (const item of resolvedItems) {
      await conn.query(
        `INSERT INTO purchase_order_items
           (po_id, product_id, name, category, unit, quantity, unit_cost, expected_expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          poId,
          item.productId,
          item.name,
          String(item.category || "").trim(),
          item.unit,
          item.quantity,
          item.unitCost,
          toDateString(item.expectedExpiryDate ?? item.expected_expiry_date) ||
            null,
        ],
      );
    }

    const [[updated]] = await conn.query(
      "SELECT * FROM purchase_orders WHERE po_id = ?",
      [poId],
    );
    const [updatedItems] = await conn.query(
      "SELECT * FROM purchase_order_items WHERE po_id = ?",
      [poId],
    );
    await conn.commit();

    await logSupplierHistory({
      supplier_name: normalizedSupplier,
      action: "Purchase Order Draft Updated",
      details: `PO: ${poId} | ${resolvedItems.length} item(s)${delivery ? ` | Delivery: ${delivery}` : ""}`,
      performed_by: null,
    });
    return res.json(shapePO(updated, updatedItems));
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err.statusCode) {
      console.error(`PUT /purchase-orders/${poId} error:`, err);
    }
    return res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
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
  const delivDate = hasProvidedValue(deliveryDate)
    ? toDateString(deliveryDate)
    : null;

  if (hasProvidedValue(deliveryDate) && !delivDate) {
    return res.status(400).json({ error: "deliveryDate must be a valid date" });
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
      if (
        !Number.isFinite(safeUnitCost) ||
        safeUnitCost < 0 ||
        safeUnitCost > 99999999.99 ||
        Math.abs(safeUnitCost * 100 - Math.round(safeUnitCost * 100)) > 1e-7
      ) {
        return res.status(400).json({
          error:
            "Purchase order item unit cost must fit DECIMAL(10,2), use at most 2 decimal places, and cannot be negative",
        });
      }
    }
    if (!String(item.unit ?? "").trim()) {
      return res.status(400).json({
        error: "Purchase order item unit is required and must come from inventory",
      });
    }
  }

  if (!PURCHASE_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${PURCHASE_ORDER_STATUSES.join(", ")}`,
    });
  }
  if (status !== "Draft") {
    return res.status(409).json({
      error: "New purchase orders must start in Draft status",
    });
  }

  let conn;
  try {
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
    conn = await db.getConnection();
    await conn.beginTransaction();

    const resolvedItems = [];
    for (const item of items) {
      const product = await resolveStockProduct(conn, item, itemTypeExpr);
      const unitError = getUnitCompatibilityError(
        item.unit,
        product.inventory_unit,
      );
      if (unitError) {
        throwPurchaseOrderError(422, `${unitError} for "${item.name}"`);
      }
      resolvedItems.push({
        ...item,
        productId: product.product_id,
        name: product.product_name,
        category: product.category_name || String(item.category || "").trim(),
        unit: product.inventory_unit || String(item.unit || "").trim(),
      });
    }

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
        "Draft",
        notes.trim() || null,
        String(receiptNo).trim() || null,
      ],
    );

    for (const item of resolvedItems) {
      await conn.query(
        `INSERT INTO purchase_order_items
           (po_id, product_id, name, category, unit, quantity, unit_cost, expected_expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          poId,
          item.productId,
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

    const [[created]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );
    const [createdItems] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    await createPurchaseOrderNotification(conn, {
      poId,
      event: "created",
      actorUserId: req.user?.userId,
      supplier: created.supplier,
      status: created.status,
      deliveryDate: created.delivery_date,
    });

    await conn.commit();

    await logSupplierHistory({
      supplier_name: supplier.trim(),
      action: "Purchase Order Created",
      details: `PO: ${poId} | ${items.length} item(s)${delivDate ? ` | Delivery: ${delivDate}` : ""}${notes.trim() ? ` | Notes: ${notes.trim()}` : ""}`,
      performed_by: null,
    });
    res.status(201).json(shapePO(created, createdItems));
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err.statusCode) console.error("POST /purchase-orders error:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PATCH /api/purchase-orders/:id/status

router.patch("/:id/status", requireInventoryManagerAccess, async (req, res) => {
  const poId = req.params.id;
  const { status } = req.body;

  if (!PURCHASE_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${PURCHASE_ORDER_STATUSES.join(", ")}`,
    });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
      [poId],
    );

    if (!existing) {
      throwPurchaseOrderError(404, "Purchase order not found");
    }

    const transitionError = getGenericTransitionError(existing.status, status);
    if (transitionError) {
      throwPurchaseOrderError(
        transitionError.statusCode,
        transitionError.message,
      );
    }

    await conn.query(`UPDATE purchase_orders SET status = ? WHERE po_id = ?`, [
      status,
      poId,
    ]);

    const [[updated]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );
    const [items] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    await createPurchaseOrderNotification(conn, {
      poId,
      event: status === "Ordered" ? "ordered" : "cancelled",
      actorUserId: req.user?.userId,
      supplier: updated.supplier,
      status: updated.status,
      deliveryDate: updated.delivery_date,
    });

    await conn.commit();

    const actionMap = {
      Ordered: "Purchase Order Sent to Supplier",
      Cancelled: "Purchase Order Cancelled",
    };
    await logSupplierHistory({
      supplier_name: existing.supplier,
      action: actionMap[status],
      details: `PO: ${poId} | Previous status: ${existing.status}`,
      performed_by: null,
    });
    res.json(shapePO(updated, items));
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err.statusCode) {
      console.error(`PATCH /purchase-orders/${poId}/status error:`, err);
    }
    res.status(err.statusCode || 500).json({ error: err.message });
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

  const currentDateTime = new Date();
  const today = getBusinessDateParts(currentDateTime).businessDate;
  const receivedDateProvided = hasProvidedValue(receivedDate);
  const recDate = receivedDateProvided ? toDateString(receivedDate) : today;
  if (!recDate) {
    return res.status(400).json({ error: "receivedDate must be a valid date" });
  }
  if (today && recDate > today) {
    return res.status(400).json({
      error: "receivedDate cannot be in the future",
    });
  }
  // Keep the current time-of-day for shelf-life calculations while applying
  // the staff-selected calendar date to the DATE column and batch timestamps.
  const [receivedYear, receivedMonth, receivedDay] = recDate
    .split("-")
    .map(Number);
  const safeReceivedAt = new Date(currentDateTime);
  safeReceivedAt.setUTCFullYear(
    receivedYear,
    receivedMonth - 1,
    receivedDay,
  );

  let conn;
  try {
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
      [poId],
    );

    if (!existing) {
      throwPurchaseOrderError(404, "Purchase order not found");
    }

    const receiveTransitionError = getReceiveTransitionError(existing.status);
    if (receiveTransitionError) {
      throwPurchaseOrderError(
        receiveTransitionError.statusCode,
        receiveTransitionError.message,
      );
    }

    const [items] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );
    if (items.length === 0) {
      throwPurchaseOrderError(422, "Purchase order has no items to receive");
    }

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
      throwPurchaseOrderError(
        400,
        "Purchase order contains an item quantity outside the allowed whole-number range of 1 to 999",
      );
    }

    const receivePlan = [];
    const receivedItemNames = [];

    for (const item of items) {
      const qty = toNumber(item.quantity);
      const product = await resolveStockProduct(conn, item, itemTypeExpr, {
        lock: true,
      });
      assertMatchingStockMirrors(item, product);

      const [batchUnitRows] = await conn.query(
        `SELECT DISTINCT unit
           FROM batches
          WHERE product_id = ?
            AND unit IS NOT NULL
            AND TRIM(unit) <> ''`,
        [product.product_id],
      );
      const unitError = getUnitCompatibilityError(
        item.unit,
        product.inventory_unit,
        batchUnitRows.map((row) => row.unit),
      );
      if (unitError) {
        throwPurchaseOrderError(422, `${unitError} for "${item.name}"`);
      }
      const unit = product.inventory_unit || String(item.unit).trim();
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
        throwPurchaseOrderError(
          400,
          `Shelf life is required for "${item.name}"`,
        );
      }

      if (usesExpiry && !itemExpiryDate) {
        throwPurchaseOrderError(
          400,
          `Expiry date is required for "${item.name}"`,
        );
      }

      if (!product.inventory_id) {
        const [inventoryInsert] = await conn.query(
          `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased, unit)
           SELECT m.Product_ID, COALESCE(m.Stock, 0), COALESCE(m.Stock, 0), m.Product_Name, ?
             FROM Menu m
            WHERE m.Product_ID = ?
              AND NOT EXISTS (
                SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID
              )`,
          [unit, product.product_id],
        );
        if (inventoryInsert.affectedRows !== 1) {
          throwPurchaseOrderError(
            409,
            `Could not establish a single main-stock row for "${item.name}"`,
          );
        }
      }

      receivePlan.push({
        item,
        productId: product.product_id,
        qty,
        unit,
        shelfLifeDays,
        shelfLifeHours,
        itemExpiryDate,
        usableUntil,
      });
    }

    for (const plan of receivePlan) {
      const {
        item,
        productId,
        qty,
        unit,
        shelfLifeDays,
        shelfLifeHours,
        itemExpiryDate,
        usableUntil,
      } = plan;

      await conn.query(
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

      const [inventoryUpdate] = await conn.query(
        `UPDATE Inventory
         SET Stock = COALESCE(Stock, 0) + ?,
             Last_Update = NOW()
         WHERE Product_ID = ?`,
        [qty, productId],
      );

      const [menuUpdate] = await conn.query(
        `UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?`,
        [qty, productId],
      );

      const [productUpdate] = await conn.query(
        `UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?`,
        [qty, productId],
      );

      if (
        inventoryUpdate.affectedRows !== 1 ||
        menuUpdate.affectedRows !== 1 ||
        productUpdate.affectedRows !== 1
      ) {
        throwPurchaseOrderError(
          409,
          `Main-stock update failed for "${item.name}"; no purchase-order quantities were committed`,
        );
      }

      receivedItemNames.push(`${item.name} x${qty} ${unit}`);
    }

    const [statusUpdate] = await conn.query(
      `UPDATE purchase_orders
          SET status = 'Received', receipt_no = ?, received_by = ?, received_date = ?
        WHERE po_id = ? AND status = 'Ordered'`,
      [receiptNo ? String(receiptNo).trim() : null, receivedBy, recDate, poId],
    );
    if (statusUpdate.affectedRows !== 1) {
      throwPurchaseOrderError(
        409,
        "Purchase order status changed before receiving could complete",
      );
    }

    const [[updated]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ?`,
      [poId],
    );
    const [updatedItems] = await conn.query(
      `SELECT * FROM purchase_order_items WHERE po_id = ?`,
      [poId],
    );

    await createPurchaseOrderNotification(conn, {
      poId,
      event: "received",
      actorUserId: req.user?.userId,
      supplier: updated.supplier,
      status: updated.status,
      deliveryDate: updated.delivery_date,
    });

    await conn.commit();

    // ── Log PO Received with correct supplier name ──────────────────────────
    await logSupplierHistory({
      supplier_name: existing.supplier, // ← directly from PO, always correct
      action: "Batch Received",
      details: `PO: ${poId} | Receipt: ${receiptNo ? String(receiptNo).trim() : "N/A"} | Actual receipt date: ${recDate} | Received by: ${receivedBy} | Items: ${receivedItemNames.join(", ") || "none"}`,
      performed_by: receivedBy,
    });

    res.json(shapePO(updated, updatedItems));
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err.statusCode) {
      console.error(`PATCH /purchase-orders/${poId}/receive error:`, err);
    }
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ─── DELETE /api/purchase-orders/:id ─────────────────────────────────────────

router.delete("/:id", requireInventoryManagerAccess, async (req, res) => {
  const poId = req.params.id;
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE`,
      [poId],
    );

    if (!existing) {
      throwPurchaseOrderError(404, "Purchase order not found");
    }
    const transitionError = getGenericTransitionError(
      existing.status,
      "Cancelled",
    );
    if (transitionError) {
      throwPurchaseOrderError(
        transitionError.statusCode,
        transitionError.message,
      );
    }

    await conn.query(
      `UPDATE purchase_orders SET status = 'Cancelled' WHERE po_id = ?`,
      [poId],
    );
    await createPurchaseOrderNotification(conn, {
      poId,
      event: "cancelled",
      actorUserId: req.user?.userId,
      supplier: existing.supplier,
      status: "Cancelled",
      deliveryDate: existing.delivery_date,
    });
    await conn.commit();

    // ── Log cancellation ────────────────────────────────────────────────────
    await logSupplierHistory({
      supplier_name: existing.supplier,
      action: "Purchase Order Cancelled",
      details: `PO: ${poId} | Was: ${existing.status}`,
      performed_by: null,
    });

    res.json({ success: true, id: poId, status: "Cancelled" });
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err.statusCode) {
      console.error(`DELETE /purchase-orders/${poId} error:`, err);
    }
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
