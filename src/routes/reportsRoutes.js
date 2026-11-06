const router = require("express").Router();
const db = require("../config/db");
const { requireInventoryManagerAccess } = require("../middleware/staffAccess");
const {
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
} = require("../utils/productItemType");

async function reportTypeColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM Reports");
  const columns = new Set(rows.map((r) => String(r.Field).toLowerCase()));
  if (columns.has("report_type")) return "Report_Type";
  if (columns.has("repport_type")) return "Repport_Type";
  return "NULL";
}

function buildInventoryReportItems({
  movementRows = [],
  receivedRows = [],
  stockRows = [],
  periodDays,
}) {
  const stockMap = new Map(
    stockRows.map((row) => [String(row.product_id), Number(row.remaining) || 0]),
  );
  const itemsByProduct = new Map();

  function ensureItem(row) {
    const key = String(row.product_id);
    if (!itemsByProduct.has(key)) {
      itemsByProduct.set(key, {
        product_id: row.product_id,
        product_name: row.product_name || "Unknown",
        category: row.category || "Uncategorized",
        unit: row.unit || "piece",
        received: 0,
        withdrawn: 0,
        returned: 0,
        wasted: 0,
        remaining: stockMap.get(key) ?? 0,
      });
    }
    return itemsByProduct.get(key);
  }

  for (const row of movementRows) {
    const item = ensureItem(row);
    item.withdrawn += Number(row.withdrawn) || 0;
    item.returned += Number(row.returned) || 0;
    item.wasted += Number(row.wasted) || 0;
  }

  for (const row of receivedRows) {
    const item = ensureItem(row);
    item.received += Number(row.received) || 0;
    if (item.product_name === "Unknown" && row.product_name) {
      item.product_name = row.product_name;
    }
    if (item.category === "Uncategorized" && row.category) {
      item.category = row.category;
    }
    if (item.unit === "piece" && row.unit) {
      item.unit = row.unit;
    }
  }

  return [...itemsByProduct.values()].map((item) => ({
    ...item,
    consumptionRate: item.withdrawn / periodDays,
  }));
}

// GET /api/reports
router.get("/", requireInventoryManagerAccess, async (req, res) => {
  try {
    const typeColumn = await reportTypeColumn();
    const [rows] = await db.query(
      `SELECT
         Report_ID AS report_id,
         ${typeColumn} AS report_type,
         Total_Sales AS total_sales,
         Total_Transaction AS total_transaction,
         GeneratedAt AS generated_at
       FROM Reports
       ORDER BY GeneratedAt DESC, Report_ID DESC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /api/reports/weekly?start=YYYY-MM-DD
router.get("/weekly", requireInventoryManagerAccess, async (req, res) => {
  const { start } = req.query;
  if (!start) return res.status(400).json({ error: "start date required" });

  const startDate = new Date(start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  try {
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
    const [withdrawalRows] = await db.query(
      `SELECT
        m.Product_ID                                                       AS product_id,
        COALESCE(m.Product_Name, 'Unknown')                                AS product_name,
        COALESCE(m.Category_Name, 'Uncategorized')                         AS category,
        COALESCE(NULLIF(TRIM(i.unit), ''), bu.unit, 'piece')                AS unit,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(ss.Type)) IN ('stock out','initial','supplementary') THEN ss.Quantity ELSE 0 END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(ss.Type)) = 'return'   THEN ss.Quantity ELSE 0 END), 0) AS returned,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(ss.Type)) = 'spoilage' THEN ss.Quantity ELSE 0 END), 0) AS wasted
      FROM Stock_Status ss
      JOIN Menu m ON m.Product_ID = ss.Product_ID
      LEFT JOIN products p ON p.id = m.Product_ID
      LEFT JOIN Inventory i ON i.Product_ID = ss.Product_ID
      LEFT JOIN (
        SELECT product_id, MAX(unit) AS unit
        FROM batches
        GROUP BY product_id
      ) bu ON bu.product_id = ss.Product_ID
      WHERE DATE(ss.Status_Date) >= ? AND DATE(ss.Status_Date) < ?
        AND ${itemTypeExpr} = ?
      GROUP BY m.Product_ID, m.Product_Name, m.Category_Name, i.unit, bu.unit`,
      [startStr, endStr, STOCK_ITEM],
    );

    const [receivedRows] = await db.query(
      `SELECT
        b.product_id,
        COALESCE(m.Product_Name, p.name, 'Unknown') AS product_name,
        COALESCE(m.Category_Name, 'Uncategorized') AS category,
        COALESCE(NULLIF(TRIM(i.unit), ''), MAX(NULLIF(TRIM(b.unit), '')), 'piece') AS unit,
        COALESCE(SUM(b.quantity), 0) AS received
      FROM batches b
      LEFT JOIN products p ON p.id = b.product_id
      LEFT JOIN Menu m ON m.Product_ID = b.product_id
      LEFT JOIN Inventory i ON i.Product_ID = b.product_id
      WHERE DATE(b.received_date) >= ? AND DATE(b.received_date) < ?
        AND ${itemTypeExpr} = ?
      GROUP BY b.product_id, m.Product_Name, p.name, m.Category_Name, i.unit`,
      [startStr, endStr, STOCK_ITEM],
    );

    const [stockRows] = await db.query(
      `SELECT i.Product_ID AS product_id, COALESCE(i.Stock, 0) AS remaining
       FROM Inventory i
       LEFT JOIN products p ON p.id = i.Product_ID
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       WHERE ${itemTypeExpr} = ?`,
      [STOCK_ITEM],
    );

    const items = buildInventoryReportItems({
      movementRows: withdrawalRows,
      receivedRows,
      stockRows,
      periodDays: 7,
    });

    res.json({
      period: `Week of ${startStr}`,
      generatedAt: new Date().toISOString(),
      items,
      totalReceived: items.reduce((s, i) => s + i.received, 0),
      totalWithdrawn: items.reduce((s, i) => s + i.withdrawn, 0),
      totalReturned: items.reduce((s, i) => s + i.returned, 0),
      totalWasted: items.reduce((s, i) => s + i.wasted, 0),
    });
  } catch (err) {
    console.error("GET /reports/weekly error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// GET /api/reports/monthly?year=2026&month=4
router.get("/monthly", requireInventoryManagerAccess, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month)
    return res.status(400).json({ error: "year and month required" });

  const startDate = new Date(Number(year), Number(month) - 1, 1);
  const endDate = new Date(Number(year), Number(month), 1);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();

  try {
    const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
    const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
    const [withdrawalRows] = await db.query(
      `SELECT
        m.Product_ID                                                       AS product_id,
        COALESCE(m.Product_Name, 'Unknown')                                AS product_name,
        COALESCE(m.Category_Name, 'Uncategorized')                         AS category,
        COALESCE(NULLIF(TRIM(i.unit), ''), bu.unit, 'piece')                AS unit,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(ss.Type)) IN ('stock out','initial','supplementary') THEN ss.Quantity ELSE 0 END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(ss.Type)) = 'return'   THEN ss.Quantity ELSE 0 END), 0) AS returned,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(ss.Type)) = 'spoilage' THEN ss.Quantity ELSE 0 END), 0) AS wasted
      FROM Stock_Status ss
      JOIN Menu m ON m.Product_ID = ss.Product_ID
      LEFT JOIN products p ON p.id = m.Product_ID
      LEFT JOIN Inventory i ON i.Product_ID = ss.Product_ID
      LEFT JOIN (
        SELECT product_id, MAX(unit) AS unit
        FROM batches
        GROUP BY product_id
      ) bu ON bu.product_id = ss.Product_ID
      WHERE DATE(ss.Status_Date) >= ? AND DATE(ss.Status_Date) < ?
        AND ${itemTypeExpr} = ?
      GROUP BY m.Product_ID, m.Product_Name, m.Category_Name, i.unit, bu.unit`,
      [startStr, endStr, STOCK_ITEM],
    );

    const [receivedRows] = await db.query(
      `SELECT
        b.product_id,
        COALESCE(m.Product_Name, p.name, 'Unknown') AS product_name,
        COALESCE(m.Category_Name, 'Uncategorized') AS category,
        COALESCE(NULLIF(TRIM(i.unit), ''), MAX(NULLIF(TRIM(b.unit), '')), 'piece') AS unit,
        COALESCE(SUM(b.quantity), 0) AS received
      FROM batches b
      LEFT JOIN products p ON p.id = b.product_id
      LEFT JOIN Menu m ON m.Product_ID = b.product_id
      LEFT JOIN Inventory i ON i.Product_ID = b.product_id
      WHERE DATE(b.received_date) >= ? AND DATE(b.received_date) < ?
        AND ${itemTypeExpr} = ?
      GROUP BY b.product_id, m.Product_Name, p.name, m.Category_Name, i.unit`,
      [startStr, endStr, STOCK_ITEM],
    );

    const [stockRows] = await db.query(
      `SELECT i.Product_ID AS product_id, COALESCE(i.Stock, 0) AS remaining
       FROM Inventory i
       LEFT JOIN products p ON p.id = i.Product_ID
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       WHERE ${itemTypeExpr} = ?`,
      [STOCK_ITEM],
    );

    const monthName = startDate.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    const items = buildInventoryReportItems({
      movementRows: withdrawalRows,
      receivedRows,
      stockRows,
      periodDays: daysInMonth,
    });

    res.json({
      period: monthName,
      generatedAt: new Date().toISOString(),
      items,
      totalReceived: items.reduce((s, i) => s + i.received, 0),
      totalWithdrawn: items.reduce((s, i) => s + i.withdrawn, 0),
      totalReturned: items.reduce((s, i) => s + i.returned, 0),
      totalWasted: items.reduce((s, i) => s + i.wasted, 0),
    });
  } catch (err) {
    console.error("GET /reports/monthly error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

module.exports = router;
module.exports.buildInventoryReportItems = buildInventoryReportItems;
