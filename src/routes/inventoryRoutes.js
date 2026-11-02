const router = require("express").Router();
const db = require("../config/db");
const { deductStockForOrder } = require("../services/inventoryService");
const {
  fetchMenuIngredients,
} = require("../utils/menuAvailability");
const {
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
  assertProductsMatchItemType,
} = require("../utils/productItemType");
const {
  requireCookViewAccess,
  requireRoleAccess,
} = require("../middleware/cookViewAccess");
const {
  requireInventoryManagerAccess,
  requireKitchenInventoryAccess,
} = require("../middleware/staffAccess");
const { getFinalizedSaleSql } = require("../services/financialStatus");
const { assertTableColumns } = require("../services/schemaAssertions");
const {
  getVisibleInventoryAlertSeverities,
  listInventoryNotifications,
  markAllInventoryNotificationsRead,
  markInventoryNotificationRead,
  reconcileInventoryAlerts,
} = require("../services/inventoryNotificationService");
const {
  directStockUpdateResponse,
  findDirectStockQuantityFields,
  stockReceiptRequiresPurchaseOrderResponse,
} = require("../utils/stockMutationPolicy");

function normalizeBooleanFlag(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const DEFAULT_BACKEND_LOW_STOCK_THRESHOLD = 10;
const DEFAULT_BACKEND_CRITICAL_STOCK_THRESHOLD = 5;

async function readStockAlertDefaults() {
  try {
    const [rows] = await db.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'restaurant_settings'
        LIMIT 1`,
    );

    if (!rows.length || !rows[0].settings_json) {
      return {
        low: DEFAULT_BACKEND_LOW_STOCK_THRESHOLD,
        critical: DEFAULT_BACKEND_CRITICAL_STOCK_THRESHOLD,
      };
    }

    const parsed = JSON.parse(rows[0].settings_json);
    const critical = Math.max(
      0,
      Number(
        parsed?.defaultCriticalStockThreshold ??
          parsed?.criticalStockThreshold ??
          DEFAULT_BACKEND_CRITICAL_STOCK_THRESHOLD,
      ) || DEFAULT_BACKEND_CRITICAL_STOCK_THRESHOLD,
    );
    const low = Math.max(
      critical,
      Number(
        parsed?.defaultLowStockThreshold ??
          parsed?.lowStockThreshold ??
          DEFAULT_BACKEND_LOW_STOCK_THRESHOLD,
      ) || DEFAULT_BACKEND_LOW_STOCK_THRESHOLD,
    );

    return { low, critical };
  } catch {
    return {
      low: DEFAULT_BACKEND_LOW_STOCK_THRESHOLD,
      critical: DEFAULT_BACKEND_CRITICAL_STOCK_THRESHOLD,
    };
  }
}

function getAppliedInventoryAlertThresholds(row, defaults) {
  const useDefaultThresholds = normalizeBooleanFlag(
    row?.useDefaultThresholds,
    true,
  );
  const critical = useDefaultThresholds
    ? defaults.critical
    : Math.max(
        0,
        Number(row?.criticalStockThreshold) || defaults.critical,
      );
  const low = useDefaultThresholds
    ? defaults.low
    : Math.max(critical, Number(row?.lowStockThreshold) || defaults.low);

  return {
    useDefaultThresholds,
    low,
    critical,
  };
}

function getInventoryAlertSeverity(stockValue, thresholds) {
  const stock = Number(stockValue) || 0;
  if (stock <= 0) return "out";
  if (stock <= thresholds.critical) return "critical";
  if (stock <= thresholds.low) return "low";
  return "normal";
}

async function ensureDailyUsageTables(conn = db) {
  await assertTableColumns(
    conn,
    {
      daily_usage_reports: [
        "report_id", "report_date", "status", "created_by", "finalized_by",
        "created_at", "finalized_at", "updated_at",
      ],
      daily_usage_report_items: [
        "usage_item_id", "report_id", "product_id", "product_name",
        "category", "unit", "withdrawn_qty", "used_qty", "wasted_qty",
        "returned_qty", "notes", "created_at", "updated_at",
      ],
    },
    "Daily-usage schema",
  );
}

function toReportDateString(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeUsageQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? +n.toFixed(2) : 0;
}

async function getOrCreateDailyUsageReport(conn, reportDate, createdBy = null) {
  await ensureDailyUsageTables(conn);
  const [rows] = await conn.query(
    `SELECT report_id, report_date, status, created_by, finalized_by, finalized_at, created_at, updated_at
     FROM daily_usage_reports
     WHERE report_date = ?
     LIMIT 1`,
    [reportDate],
  );

  if (rows.length > 0) return rows[0];

  const [result] = await conn.query(
    `INSERT INTO daily_usage_reports (report_date, created_by)
     VALUES (?, ?)`,
    [reportDate, Number.isFinite(Number(createdBy)) ? Number(createdBy) : null],
  );

  const [createdRows] = await conn.query(
    `SELECT report_id, report_date, status, created_by, finalized_by, finalized_at, created_at, updated_at
     FROM daily_usage_reports
     WHERE report_id = ?`,
    [result.insertId],
  );
  return createdRows[0];
}

async function findLatestDailyUsageReportDate(status = "") {
  await ensureDailyUsageTables(db);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const filters = [];
  const values = [];
  if (normalizedStatus === "pending" || normalizedStatus === "finalized") {
    filters.push("dur.status = ?");
    values.push(normalizedStatus);
  }

  const [rows] = await db.query(
    `SELECT DATE_FORMAT(dur.report_date, '%Y-%m-%d') AS report_date
     FROM daily_usage_reports dur
     INNER JOIN daily_usage_report_items duri
       ON duri.report_id = dur.report_id
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     GROUP BY dur.report_id, dur.report_date
     ORDER BY dur.report_date DESC
     LIMIT 1`,
    values,
  );

  return rows.length > 0 ? String(rows[0].report_date) : null;
}

async function buildDailyUsagePayload({
  reportDate,
  reportId = null,
  status = "",
}) {
  await ensureDailyUsageTables(db);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
  const stockItemExpr = getProductItemTypeExpression(
    hasItemTypeColumn,
    "p",
    "m",
  );

  const whereParts = [];
  const values = [];
  if (reportId != null) {
    whereParts.push("dur.report_id = ?");
    values.push(Number(reportId));
  } else {
    whereParts.push("dur.report_date = ?");
    values.push(reportDate);
  }
  if (normalizedStatus === "pending" || normalizedStatus === "finalized") {
    whereParts.push("dur.status = ?");
    values.push(normalizedStatus);
  }

  const [reportRows] = await db.query(
    `SELECT
       dur.report_id,
       dur.report_date,
       dur.status,
       dur.created_by,
       cu.username AS created_by_name,
       dur.finalized_by,
       fu.username AS finalized_by_name,
       dur.created_at,
       dur.updated_at,
       dur.finalized_at
     FROM daily_usage_reports dur
     LEFT JOIN users cu ON cu.id = dur.created_by
     LEFT JOIN users fu ON fu.id = dur.finalized_by
     WHERE ${whereParts.join(" AND ")}
     LIMIT 1`,
    values,
  );

  if (reportRows.length === 0) {
    const fallbackDate = reportDate || toReportDateString(null);
    const fallback = await getOrCreateDailyUsageReport(db, fallbackDate, null);
    return {
      report: {
        report_id: Number(fallback.report_id),
        report_date: fallback.report_date,
        status: String(fallback.status || "pending"),
        prepared_by: fallback.created_by == null ? null : Number(fallback.created_by),
        prepared_by_name: null,
        finalized_by: fallback.finalized_by == null ? null : Number(fallback.finalized_by),
        finalized_by_name: null,
        created_at: fallback.created_at ?? null,
        updated_at: fallback.updated_at ?? null,
        finalized_at: fallback.finalized_at ?? null,
      },
      items: [],
    };
  }

  const report = reportRows[0];
  const [itemRows] = await db.query(
    `SELECT
       duri.usage_item_id,
       duri.product_id,
       COALESCE(m.Product_Name, p.name, duri.product_name) AS product_name,
       COALESCE(m.Category_Name, duri.category) AS category,
       COALESCE(bu.unit, duri.unit, 'unit') AS unit,
       COALESCE(inv.Daily_Withdrawn, duri.withdrawn_qty, 0) AS withdrawn_qty,
       duri.used_qty,
       duri.wasted_qty,
       duri.returned_qty,
       duri.notes
     FROM daily_usage_report_items duri
     LEFT JOIN products p ON p.id = duri.product_id
     LEFT JOIN Menu m ON m.Product_ID = duri.product_id
     LEFT JOIN Inventory inv ON inv.Product_ID = duri.product_id
     LEFT JOIN (
       SELECT product_id, MAX(unit) AS unit
       FROM batches
       GROUP BY product_id
     ) bu ON bu.product_id = duri.product_id
     WHERE duri.report_id = ?
       AND ${stockItemExpr} = ?
     ORDER BY product_name ASC, duri.usage_item_id ASC`,
    [report.report_id, STOCK_ITEM],
  );

  return {
    report: {
      report_id: Number(report.report_id),
      report_date: report.report_date,
      status: String(report.status || "pending"),
      prepared_by: report.created_by == null ? null : Number(report.created_by),
      prepared_by_name: report.created_by_name || null,
      finalized_by:
        report.finalized_by == null ? null : Number(report.finalized_by),
      finalized_by_name: report.finalized_by_name || null,
      created_at: report.created_at ?? null,
      updated_at: report.updated_at ?? null,
      finalized_at: report.finalized_at ?? null,
    },
    items: itemRows.map((row) => ({
      usage_item_id: Number(row.usage_item_id),
      product_id: Number(row.product_id),
      product_name: String(row.product_name || ""),
      category: String(row.category || ""),
      unit: String(row.unit || "unit"),
      withdrawn_qty: normalizeUsageQty(row.withdrawn_qty),
      used_qty: normalizeUsageQty(row.used_qty),
      spoilage_qty: normalizeUsageQty(row.wasted_qty),
      returned_qty: normalizeUsageQty(row.returned_qty),
      note: row.notes ? String(row.notes) : "",
    })),
  };
}

// GET /api/inventory
router.get("/", requireCookViewAccess, async (req, res) => {
  try {
    const hasItemTypeColumn = true;
    const productItemTypeExpr = getProductItemTypeExpression(
      hasItemTypeColumn,
      "p",
      "m",
    );

    const [rows] = await db.query(
      `SELECT
         i.Inventory_ID                                                          AS inventory_id,
         i.Product_ID                                                            AS product_id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product')          AS product_name,
         COALESCE(m.Category_Name, 'Uncategorized')                             AS category,
         COALESCE(NULLIF(TRIM(i.unit), ''), bu.unit, 'piece')                   AS unit,
         COALESCE(i.Stock, 0)                                                   AS mainStock,
         COALESCE(i.Quantity, 0)                                                AS quantity,
         COALESCE(i.Item_Purchased, m.Product_Name, 'Unnamed Product')          AS item_purchased,
         i.Last_Update                                                           AS last_update,
         COALESCE(i.Reorder_Point, 20)                                           AS reorderPoint,
         COALESCE(i.Critical_Point, 5)                                          AS criticalPoint,
         COALESCE(i.use_default_thresholds, 1)                                  AS useDefaultThresholds,
         i.low_stock_threshold                                                   AS lowStockThreshold,
         i.critical_stock_threshold                                              AS criticalStockThreshold,
         COALESCE(sa.supplier_name, 'No Supplier')                              AS supplier_name,
         COALESCE(i.Daily_Withdrawn, 0)                                         AS dailyWithdrawn,
         COALESCE(i.Returned, 0)                                                AS returned,
         COALESCE(i.Wasted, 0)                                                  AS wasted,
         COALESCE(ot.soldToday, 0)                                              AS soldToday,
         bexp.nearestExpiry                                                      AS expiryDate,
         brm.nearestUsableUntil                                                  AS usableUntil,
         brm.shelfLifeDays                                                       AS shelfLifeDays,
         brm.shelfLifeHours                                                      AS shelfLifeHours,
         i.Product_ID                                                            AS id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product')          AS name,
         COALESCE(i.Stock, 0)                                                   AS stock,
         COALESCE(CAST(m.Price AS CHAR), '0')                                   AS price,
         ${productItemTypeExpr}                                                 AS item_type,
         COALESCE(p.description, '')                                            AS description,
         COALESCE(m.Promo, '')                                                  AS promo,
         CASE WHEN COALESCE(m.Promo, '') = 'RAW_MATERIAL' THEN 1 ELSE 0 END    AS isRawMaterial,
         CASE
           WHEN p.image LIKE 'data:image%' THEN '/img/placeholder.jpg'
           WHEN COALESCE(TRIM(p.image), '') = '' THEN '/img/placeholder.jpg'
           ELSE p.image
         END                                                                    AS image,
         COALESCE(p.menu_code, CONCAT('M-', LPAD(i.Product_ID, 3, '0')))        AS menu_code,
         CASE
           WHEN COALESCE(m.manual_override, 0) = 1 THEN
             CASE
               WHEN LOWER(COALESCE(m.manual_status, 'available')) IN ('out of stock', 'unavailable')
                 THEN 'Out of Stock'
               ELSE 'Available'
             END
           WHEN COALESCE(ia.ingredientCount, 0) > 0 THEN
             CASE
               WHEN COALESCE(ia.availableServings, 0) <= 0 THEN 'Out of Stock'
               ELSE 'Available'
             END
           ELSE
             CASE
               WHEN LOWER(COALESCE(p.availability_status, 'available')) IN ('hidden', 'unavailable', 'out of stock')
                 THEN 'Out of Stock'
               WHEN COALESCE(i.Stock, 0) > 0
                 THEN 'Available'
               ELSE 'Out of Stock'
             END
         END                                                                     AS availability_status,
         COALESCE(p.is_promotional, 0)                                          AS is_promotional,
         p.promo_price                                                          AS promo_price,
         COALESCE(p.promo_label, '')                                            AS promo_label,
         COALESCE(m.manual_override, 0)                                         AS manual_override,
         COALESCE(m.manual_status, 'Available')                                 AS manual_status,
         ia.availableServings                                                   AS available_servings,
         COALESCE(ia.ingredientCount, 0)                                        AS ingredient_count
       FROM Inventory i
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       LEFT JOIN products p ON p.id = i.Product_ID
         LEFT JOIN (
         SELECT
           mi.menu_product_id,
           COUNT(*) AS ingredientCount,
           MIN(
             CASE
               WHEN mi.quantity_required > 0
                 THEN COALESCE(inv.Stock, 0) / mi.quantity_required
               ELSE 0
             END
           ) AS availableServings
         FROM menu_item_ingredients mi
         LEFT JOIN products ip ON ip.id = mi.product_id
         LEFT JOIN Menu im ON im.Product_ID = mi.product_id
         LEFT JOIN Inventory inv ON inv.Product_ID = mi.product_id
         WHERE ${getProductItemTypeExpression(hasItemTypeColumn, "ip", "im")} = 'stock_item'
         GROUP BY mi.menu_product_id
       ) ia ON ia.menu_product_id = i.Product_ID
       LEFT JOIN (
         SELECT product_id, MAX(unit) AS unit
         FROM batches
         GROUP BY product_id
       ) bu ON bu.product_id = i.Product_ID
       LEFT JOIN (
         SELECT product_id, MIN(expiry_date) AS nearestExpiry
         FROM batches
         WHERE status = 'active' AND expiry_date IS NOT NULL
         GROUP BY product_id
       ) bexp ON bexp.product_id = i.Product_ID
       LEFT JOIN (
         SELECT product_id,
                MIN(usable_until) AS nearestUsableUntil,
                MAX(COALESCE(shelf_life_days, 0)) AS shelfLifeDays,
                MAX(COALESCE(shelf_life_hours, 0)) AS shelfLifeHours
         FROM batches
         WHERE status = 'active' AND usable_until IS NOT NULL
         GROUP BY product_id
       ) brm ON brm.product_id = i.Product_ID
       LEFT JOIN (
         SELECT Product_ID, MIN(SupplierName) AS supplier_name
         FROM Suppliers
         GROUP BY Product_ID
       ) sa ON sa.Product_ID = i.Product_ID
       LEFT JOIN (
         SELECT sold.Product_ID, SUM(sold.Quantity) AS soldToday
         FROM (
           SELECT
             COALESCE(mi.product_id, oi.Product_ID) AS Product_ID,
             oi.Quantity * COALESCE(mi.quantity_required, 1) AS Quantity
           FROM order_item oi
           JOIN orders o ON o.Order_ID = oi.Order_ID
           LEFT JOIN menu_item_ingredients mi
             ON mi.menu_product_id = oi.Product_ID
           WHERE DATE(o.Order_Date) = CURDATE()
             AND ${getFinalizedSaleSql("o")}
         ) sold
         GROUP BY sold.Product_ID
       ) ot ON ot.Product_ID = i.Product_ID
       WHERE ${productItemTypeExpr} = ?
       ORDER BY i.Inventory_ID ASC`,
      [STOCK_ITEM],
    );

    const ingredientMap = await fetchMenuIngredients(
      db,
      rows.map((row) => row.product_id ?? row.id),
    );

    res.json(
      rows.map((row) => ({
        ...row,
        ingredients: ingredientMap.get(Number(row.product_id ?? row.id ?? 0)) ?? [],
      })),
    );
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

const requireInventoryAlertAccess = requireRoleAccess(
  ["administrator", "inventory_manager"],
  "Inventory alert access denied",
);

router.get("/alerts", requireInventoryAlertAccess, async (req, res) => {
  try {
    const userId = Number(req.user?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Invalid authenticated user" });
    }
    const hasItemTypeColumn = true;
    const productItemTypeExpr = getProductItemTypeExpression(
      hasItemTypeColumn,
      "p",
      "m",
    );

    const [defaults, [rows]] = await Promise.all([
      readStockAlertDefaults(),
      db.query(
        `SELECT
         i.Inventory_ID AS inventory_id,
         i.Product_ID AS product_id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product') AS product_name,
         COALESCE(m.Category_Name, 'Uncategorized') AS category,
         COALESCE(NULLIF(TRIM(i.unit), ''), bu.unit, 'piece') AS unit,
         COALESCE(i.Stock, 0) AS mainStock,
         COALESCE(i.use_default_thresholds, 1) AS useDefaultThresholds,
         i.low_stock_threshold AS lowStockThreshold,
         i.critical_stock_threshold AS criticalStockThreshold,
         ${productItemTypeExpr} AS item_type
       FROM Inventory i
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       LEFT JOIN products p ON p.id = i.Product_ID
       LEFT JOIN (
         SELECT product_id, MAX(unit) AS unit
         FROM batches
         GROUP BY product_id
       ) bu ON bu.product_id = i.Product_ID
       WHERE ${productItemTypeExpr} = ?
       ORDER BY product_name ASC`,
        [STOCK_ITEM],
      ),
    ]);

    const items = rows.map((row) => {
      const thresholds = getAppliedInventoryAlertThresholds(row, defaults);
      const severity = getInventoryAlertSeverity(row.mainStock, thresholds);

      return {
        inventory_id: Number(row.inventory_id),
        product_id: Number(row.product_id),
        product_name: String(row.product_name || ""),
        category: String(row.category || ""),
        unit: String(row.unit || "piece"),
        mainStock: Number(row.mainStock) || 0,
        severity,
        thresholds,
      };
    });
    await reconcileInventoryAlerts(db, items);

    const visibleSeverities = new Set(
      getVisibleInventoryAlertSeverities(req.user?.role),
    );
    const visibleItems = items.filter(
      (item) =>
        item.severity !== "normal" && visibleSeverities.has(item.severity),
    );
    const { notifications, unreadCount } = await listInventoryNotifications(db, {
      userId,
      role: req.user?.role,
    });

    const summary = visibleItems.reduce(
      (acc, item) => {
        if (item.severity === "out") acc.outOfStock += 1;
        else if (item.severity === "critical") acc.critical += 1;
        else if (item.severity === "low") acc.low += 1;
        return acc;
      },
      {
        totalItems: items.length,
        normal: items.filter((item) => item.severity === "normal").length,
        low: 0,
        critical: 0,
        outOfStock: 0,
      },
    );

    res.set("Cache-Control", "private, no-store");
    res.json({
      generatedAt: new Date().toISOString(),
      defaults,
      summary: {
        ...summary,
        attention: summary.low + summary.critical + summary.outOfStock,
      },
      items: visibleItems,
      notifications,
      unreadCount,
    });
  } catch (err) {
    console.error("GET /inventory/alerts error:", err);
    res.status(500).json({ message: "Unable to load inventory alerts" });
  }
});

router.post(
  "/alerts/read-all",
  requireInventoryAlertAccess,
  async (req, res) => {
    try {
      const userId = Number(req.user?.userId);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ message: "Invalid authenticated user" });
      }
      const markedCount = await markAllInventoryNotificationsRead(db, {
        userId,
        role: req.user?.role,
      });
      return res.json({ message: "Notifications marked as read", markedCount });
    } catch (err) {
      console.error("POST /inventory/alerts/read-all error:", err);
      return res.status(500).json({ message: "Unable to mark notifications as read" });
    }
  },
);

router.post(
  "/alerts/:alertId/read",
  requireInventoryAlertAccess,
  async (req, res) => {
    try {
      const userId = Number(req.user?.userId);
      const alertId = Number(req.params.alertId);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ message: "Invalid authenticated user" });
      }
      if (!Number.isSafeInteger(alertId) || alertId <= 0) {
        return res.status(400).json({ message: "Invalid alert id" });
      }
      const marked = await markInventoryNotificationRead(db, {
        alertId,
        userId,
        role: req.user?.role,
      });
      if (!marked) {
        return res.status(404).json({ message: "Notification not found" });
      }
      return res.json({ message: "Notification marked as read", alertId });
    } catch (err) {
      console.error("POST /inventory/alerts/:alertId/read error:", err);
      return res.status(500).json({ message: "Unable to mark notification as read" });
    }
  },
);

// PUT /api/inventory/:inventory_id
router.put("/:inventory_id", requireInventoryManagerAccess, async (req, res) => {
  let conn;
  try {
    const inventoryId = Number(req.params.inventory_id);
    if (!Number.isFinite(inventoryId) || inventoryId <= 0) {
      return res.status(400).json({ message: "Invalid inventory_id" });
    }

    const directStockFields = findDirectStockQuantityFields(req.body);
    if (directStockFields.length > 0) {
      return res
        .status(400)
        .json(directStockUpdateResponse(directStockFields));
    }

    const {
      reorderPoint,
      criticalPoint,
      useDefaultThresholds,
      lowStockThreshold,
      criticalStockThreshold,
    } = req.body;
    const fields = [];
    const values = [];

    const [existingRows] = await db.query(
      `SELECT
         Product_ID AS productId,
         COALESCE(Reorder_Point, 20) AS reorderPoint,
         COALESCE(Critical_Point, 5) AS criticalPoint,
         COALESCE(use_default_thresholds, 1) AS useDefaultThresholds,
         low_stock_threshold AS lowStockThreshold,
         critical_stock_threshold AS criticalStockThreshold
       FROM Inventory
       WHERE Inventory_ID = ?`,
      [inventoryId],
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Inventory record not found" });
    }
    const existingInventory = existingRows[0];

    if (
      reorderPoint !== undefined ||
      criticalPoint !== undefined ||
      useDefaultThresholds !== undefined ||
      lowStockThreshold !== undefined ||
      criticalStockThreshold !== undefined
    ) {
      const nextReorderPoint =
        reorderPoint !== undefined
          ? Number(reorderPoint)
          : Number(existingInventory.reorderPoint);
      const nextCriticalPoint =
        criticalPoint !== undefined
          ? Number(criticalPoint)
          : Number(existingInventory.criticalPoint);
      const nextUseDefaultThresholds = normalizeBooleanFlag(
        useDefaultThresholds,
        Number(existingInventory.useDefaultThresholds ?? 1) === 1,
      );
      const nextLowStockThreshold =
        lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== ""
          ? Number(lowStockThreshold)
          : existingInventory.lowStockThreshold == null
            ? null
            : Number(existingInventory.lowStockThreshold);
      const nextCriticalStockThreshold =
        criticalStockThreshold !== undefined &&
        criticalStockThreshold !== null &&
        criticalStockThreshold !== ""
          ? Number(criticalStockThreshold)
          : existingInventory.criticalStockThreshold == null
            ? null
            : Number(existingInventory.criticalStockThreshold);

      if (!Number.isFinite(nextReorderPoint) || nextReorderPoint < 0) {
        return res.status(400).json({ message: "Invalid reorderPoint value" });
      }
      if (!Number.isFinite(nextCriticalPoint) || nextCriticalPoint < 0) {
        return res.status(400).json({ message: "Invalid criticalPoint value" });
      }
      if (nextCriticalPoint > nextReorderPoint) {
        return res.status(400).json({
          message:
            "Critical threshold cannot be greater than warning threshold",
        });
      }
      if (
        nextLowStockThreshold !== null &&
        (!Number.isFinite(nextLowStockThreshold) || nextLowStockThreshold < 0)
      ) {
        return res
          .status(400)
          .json({ message: "Invalid lowStockThreshold value" });
      }
      if (
        nextCriticalStockThreshold !== null &&
        (!Number.isFinite(nextCriticalStockThreshold) ||
          nextCriticalStockThreshold < 0)
      ) {
        return res
          .status(400)
          .json({ message: "Invalid criticalStockThreshold value" });
      }
      if (
        nextLowStockThreshold !== null &&
        nextCriticalStockThreshold !== null &&
        nextCriticalStockThreshold > nextLowStockThreshold
      ) {
        return res.status(400).json({
          message:
            "Critical threshold cannot be greater than warning threshold",
        });
      }

      if (reorderPoint !== undefined) {
        fields.push("Reorder_Point = ?");
        values.push(nextReorderPoint);
      }
      if (criticalPoint !== undefined) {
        fields.push("Critical_Point = ?");
        values.push(nextCriticalPoint);
      }
      if (useDefaultThresholds !== undefined) {
        fields.push("use_default_thresholds = ?");
        values.push(nextUseDefaultThresholds ? 1 : 0);
      }
      if (lowStockThreshold !== undefined) {
        fields.push("low_stock_threshold = ?");
        values.push(
          lowStockThreshold === null || lowStockThreshold === ""
            ? null
            : nextLowStockThreshold,
        );
      }
      if (criticalStockThreshold !== undefined) {
        fields.push("critical_stock_threshold = ?");
        values.push(
          criticalStockThreshold === null || criticalStockThreshold === ""
            ? null
            : nextCriticalStockThreshold,
        );
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    fields.push("Last_Update = NOW()");
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[lockedInventory]] = await conn.query(
      `SELECT Product_ID AS productId
         FROM Inventory
        WHERE Inventory_ID = ?
        FOR UPDATE`,
      [inventoryId],
    );
    if (!lockedInventory) {
      const error = new Error("Inventory record not found");
      error.statusCode = 404;
      throw error;
    }

    const [result] = await conn.query(
      `UPDATE Inventory SET ${fields.join(", ")} WHERE Inventory_ID = ?`,
      [...values, inventoryId],
    );

    if (result.affectedRows === 0) {
      const error = new Error("Inventory record not found");
      error.statusCode = 404;
      throw error;
    }

    const [rows] = await conn.query(
      `SELECT * FROM Inventory WHERE Inventory_ID = ?`,
      [inventoryId],
    );

    await conn.commit();
    res.json(rows[0]);
  } catch (err) {
    if (conn) await conn.rollback();
    if (!err?.statusCode) console.error("Error updating inventory:", err);
    res
      .status(err?.statusCode || 500)
      .json({ message: err?.statusCode ? err.message : "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/inventory/batches
router.post("/batches", requireInventoryManagerAccess, (_req, res) => {
  res.status(400).json(stockReceiptRequiresPurchaseOrderResponse());
});

// POST /api/inventory/batches/:batchId/return
router.post("/batches/:batchId/return", requireInventoryManagerAccess, async (req, res) => {
  let conn;
  try {
    const { batchId } = req.params;
    const qtyToReturn = Number(req.body.quantity) || 0;

    if (qtyToReturn <= 0) {
      return res
        .status(400)
        .json({ message: "quantity must be greater than 0" });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT product_id, quantity, remaining_qty
         FROM batches
        WHERE batch_id = ?
        FOR UPDATE`,
      [batchId],
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Batch not found" });
    }

    const batch = rows[0];
    const remainingQty = Number(batch.remaining_qty) || 0;
    const maxReturnable = Math.max(
      0,
      +((Number(batch.quantity) || 0) - remainingQty).toFixed(2),
    );
    if (qtyToReturn > maxReturnable) {
      await conn.rollback();
      return res.status(400).json({
        message: `Return quantity exceeds withdrawn amount (${maxReturnable})`,
      });
    }
    const newQty = +(remainingQty + qtyToReturn).toFixed(2);
    const newStatus = "returned";

    await conn.query(
      "UPDATE batches SET status = ?, remaining_qty = ?, returned_qty = COALESCE(returned_qty, 0) + ? WHERE batch_id = ?",
      [newStatus, newQty, qtyToReturn, batchId],
    );

    // Batch return — mainStock goes back up, dailyWithdrawn goes back down
    const [inventoryUpdate] = await conn.query(
      `UPDATE Inventory
       SET Stock           = COALESCE(Stock, 0) + ?,
           Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Last_Update     = NOW()
       WHERE Product_ID = ?`,
      [qtyToReturn, qtyToReturn, batch.product_id],
    );
    const [menuUpdate] = await conn.query(
      "UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?",
      [qtyToReturn, batch.product_id],
    );
    const [productUpdate] = await conn.query(
      "UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?",
      [qtyToReturn, batch.product_id],
    );

    if (
      inventoryUpdate.affectedRows !== 1 ||
      menuUpdate.affectedRows !== 1 ||
      productUpdate.affectedRows !== 1
    ) {
      throw new Error("Inventory mirrors are incomplete; batch return was rolled back");
    }

    await conn.commit();
    res.json({
      success: true,
      batch_id: batchId,
      status: newStatus,
      quantity: newQty,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Error returning batch:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.get("/daily-usage", requireCookViewAccess, async (req, res) => {
  try {
    const requestedDate = toReportDateString(req.query.date);
    const requestedStatus = String(req.query.status || "").trim().toLowerCase();
    let effectiveDate = requestedDate;

    if (String(req.query.preferLatestPopulated || "") === "1") {
      const latest = await findLatestDailyUsageReportDate(requestedStatus);
      if (latest) effectiveDate = latest;
    }

    const payload = await buildDailyUsagePayload({
      reportDate: effectiveDate,
      status: requestedStatus,
    });
    res.json(payload);
  } catch (err) {
    console.error("GET /inventory/daily-usage error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

router.post("/daily-usage", requireKitchenInventoryAccess, async (req, res) => {
  let conn;
  try {
    const reportDate = toReportDateString(req.body.report_date);
    const createdBy =
      req.body.created_by == null ? null : Number(req.body.created_by);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    conn = await db.getConnection();
    await conn.beginTransaction();
    await ensureDailyUsageTables(conn);

    const report = await getOrCreateDailyUsageReport(conn, reportDate, createdBy);
    if (String(report.status || "").toLowerCase() === "finalized") {
      await conn.rollback();
      return res.status(409).json({
        message: "This daily usage report has already been finalized.",
      });
    }

    const normalizedItems = items
      .map((item) => ({
        product_id: Number(item.product_id),
        used_qty: normalizeUsageQty(item.used_qty),
        wasted_qty: normalizeUsageQty(item.spoilage_qty ?? item.wasted_qty),
        returned_qty: normalizeUsageQty(item.returned_qty),
        note: item.note ? String(item.note).trim() : null,
      }))
      .filter((item) => Number.isFinite(item.product_id) && item.product_id > 0);

    const uniqueProductIds = Array.from(
      new Set(normalizedItems.map((item) => Number(item.product_id))),
    );
    if (uniqueProductIds.length > 0) {
      const hasItemTypeColumn = await ensureProductsItemTypeSchema(conn);
      const stockItemExpr = getProductItemTypeExpression(
        hasItemTypeColumn,
        "p",
        "m",
      );
      const [productRows] = await conn.query(
        `SELECT
           p.id AS product_id,
           COALESCE(m.Product_Name, p.name, CONCAT('Product #', p.id)) AS product_name,
           COALESCE(m.Category_Name, '') AS category,
           COALESCE(NULLIF(TRIM(inv.unit), ''), bu.unit, 'unit') AS unit,
           COALESCE(inv.Daily_Withdrawn, 0) AS withdrawn_qty,
           ${stockItemExpr} AS item_type
         FROM products p
         LEFT JOIN Menu m ON m.Product_ID = p.id
         LEFT JOIN Inventory inv ON inv.Product_ID = p.id
         LEFT JOIN (
           SELECT product_id, MAX(unit) AS unit
           FROM batches
           GROUP BY product_id
         ) bu ON bu.product_id = p.id
         WHERE p.id IN (?)`,
        [uniqueProductIds],
      );

      const productMap = new Map(
        productRows.map((row) => [Number(row.product_id), row]),
      );

      for (const item of normalizedItems) {
        const product = productMap.get(Number(item.product_id));
        if (!product) {
          throw new Error(`Daily usage product ${item.product_id} was not found.`);
        }
        if (String(product.item_type || STOCK_ITEM).trim().toLowerCase() !== STOCK_ITEM) {
          throw new Error(
            `Daily usage product ${item.product_id} must be ${STOCK_ITEM}.`,
          );
        }
      }

      await conn.query(
        `UPDATE daily_usage_reports
         SET status = 'pending',
             created_by = COALESCE(?, created_by),
             finalized_by = NULL,
             finalized_at = NULL
         WHERE report_id = ?`,
        [Number.isFinite(createdBy) ? createdBy : null, report.report_id],
      );

      await conn.query(
        `DELETE FROM daily_usage_report_items WHERE report_id = ?`,
        [report.report_id],
      );

      for (const item of normalizedItems) {
        const product = productMap.get(Number(item.product_id));
        await conn.query(
          `INSERT INTO daily_usage_report_items (
             report_id,
             product_id,
             product_name,
             category,
             unit,
             withdrawn_qty,
             used_qty,
             wasted_qty,
             returned_qty,
             notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            report.report_id,
            Number(item.product_id),
            String(product.product_name || ""),
            String(product.category || ""),
            String(product.unit || "unit"),
            normalizeUsageQty(product.withdrawn_qty),
            item.used_qty,
            item.wasted_qty,
            item.returned_qty,
            item.note,
          ],
        );
      }
    } else {
      await conn.query(
        `UPDATE daily_usage_reports
         SET status = 'pending',
             created_by = COALESCE(?, created_by),
             finalized_by = NULL,
             finalized_at = NULL
         WHERE report_id = ?`,
        [Number.isFinite(createdBy) ? createdBy : null, report.report_id],
      );
      await conn.query(
        `DELETE FROM daily_usage_report_items WHERE report_id = ?`,
        [report.report_id],
      );
    }

    await conn.commit();
    const payload = await buildDailyUsagePayload({ reportId: report.report_id });
    res.json(payload);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("POST /inventory/daily-usage error:", err);
    const errorMessage = String(err?.message || "Unknown error");
    const isClientError = /must be stock_item|was not found|finalized/i.test(
      errorMessage,
    );
    res
      .status(isClientError ? 400 : 500)
      .json({ message: isClientError ? errorMessage : "DB error", error: errorMessage });
  } finally {
    if (conn) conn.release();
  }
});

router.patch("/daily-usage/:id/finalize", requireInventoryManagerAccess, async (req, res) => {
  let conn;
  try {
    const reportId = Number(req.params.id);
    const finalizedBy =
      req.body.finalized_by == null ? null : Number(req.body.finalized_by);

    if (!Number.isFinite(reportId) || reportId <= 0) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    await ensureDailyUsageTables(conn);

    const [reportRows] = await conn.query(
      `SELECT report_id, report_date, status
       FROM daily_usage_reports
       WHERE report_id = ?
       LIMIT 1
       FOR UPDATE`,
      [reportId],
    );

    if (reportRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Report not found" });
    }

    const report = reportRows[0];
    if (String(report.status || "").toLowerCase() === "finalized") {
      await conn.rollback();
      return res.status(409).json({ message: "Report already finalized" });
    }

    const hasItemTypeColumn = await ensureProductsItemTypeSchema(conn);
    const stockItemExpr = getProductItemTypeExpression(
      hasItemTypeColumn,
      "p",
      "m",
    );
    const [itemRows] = await conn.query(
      `SELECT
         duri.usage_item_id,
         duri.product_id,
         duri.used_qty,
         duri.wasted_qty,
         duri.returned_qty,
         COALESCE(inv.Daily_Withdrawn, 0) AS daily_withdrawn,
         ${stockItemExpr} AS item_type,
         EXISTS (
           SELECT 1
           FROM menu_item_ingredients mi
           WHERE mi.product_id = duri.product_id
         ) AS is_auto_usage
       FROM daily_usage_report_items duri
       LEFT JOIN Inventory inv ON inv.Product_ID = duri.product_id
       LEFT JOIN products p ON p.id = duri.product_id
       LEFT JOIN Menu m ON m.Product_ID = duri.product_id
       WHERE duri.report_id = ?
       ORDER BY duri.usage_item_id ASC
       FOR UPDATE`,
      [reportId],
    );

    for (const item of itemRows) {
      if (String(item.item_type || STOCK_ITEM).trim().toLowerCase() !== STOCK_ITEM) {
        throw new Error(`Daily usage product ${item.product_id} must be ${STOCK_ITEM}.`);
      }

      const usedQty = normalizeUsageQty(item.used_qty);
      const wastedQty = normalizeUsageQty(item.wasted_qty);
      const returnedQty = normalizeUsageQty(item.returned_qty);
      const isAutoUsage = Number(item.is_auto_usage) === 1;
      const deductionQty = (isAutoUsage ? 0 : usedQty) + wastedQty + returnedQty;
      const availableQty = normalizeUsageQty(item.daily_withdrawn);

      if (deductionQty > availableQty) {
        throw new Error(
          `Daily usage exceeds withdrawn stock for product ${item.product_id}. Required ${deductionQty}, available ${availableQty}.`,
        );
      }

      await conn.query(
        `UPDATE Inventory
         SET Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
             Wasted = COALESCE(Wasted, 0) + ?,
             Returned = COALESCE(Returned, 0) + ?,
             Last_Update = NOW()
         WHERE Product_ID = ?`,
        [deductionQty, wastedQty, returnedQty, item.product_id],
      );
    }

    await conn.query(
      `UPDATE daily_usage_reports
       SET status = 'finalized',
           finalized_by = ?,
           finalized_at = NOW()
       WHERE report_id = ?`,
      [Number.isFinite(finalizedBy) ? finalizedBy : null, reportId],
    );

    await conn.commit();
    const payload = await buildDailyUsagePayload({ reportId });
    res.json(payload);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("PATCH /inventory/daily-usage/:id/finalize error:", err);
    const errorMessage = String(err?.message || "Unknown error");
    const isClientError = /stock_item|was not found|already finalized|exceeds withdrawn stock|invalid report id/i.test(
      errorMessage,
    );
    res
      .status(isClientError ? 400 : 500)
      .json({ message: isClientError ? errorMessage : "DB error", error: errorMessage });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
