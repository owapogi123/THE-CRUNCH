const router = require("express").Router();
const db = require("../config/db");

async function reportTypeColumn() {
  const [rows] = await db.query("SHOW COLUMNS FROM Reports");
  const columns = new Set(rows.map((r) => String(r.Field).toLowerCase()));
  if (columns.has("report_type")) return "Report_Type";
  if (columns.has("repport_type")) return "Repport_Type";
  return "NULL";
}

// GET /api/reports
router.get("/", async (req, res) => {
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
router.get("/weekly", async (req, res) => {
  const { start } = req.query;
  if (!start) return res.status(400).json({ error: "start date required" });

  const startDate = new Date(start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  try {
    const [withdrawalRows] = await db.query(
      `SELECT
        m.Product_ID                                                       AS product_id,
        COALESCE(m.Product_Name, 'Unknown')                                AS product_name,
        COALESCE(m.Category_Name, 'Uncategorized')                         AS category,
        COALESCE(bu.unit, 'piece')                                         AS unit,
        COALESCE(SUM(CASE WHEN LOWER(ss.Type) IN ('initial','supplementary') THEN ss.Quantity ELSE 0 END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN LOWER(ss.Type) = 'return'   THEN ss.Quantity ELSE 0 END), 0) AS returned,
        COALESCE(SUM(CASE WHEN LOWER(ss.Type) = 'spoilage' THEN ss.Quantity ELSE 0 END), 0) AS wasted
      FROM Stock_Status ss
      JOIN Menu m ON m.Product_ID = ss.Product_ID
      LEFT JOIN (
        SELECT product_id, MAX(unit) AS unit
        FROM batches
        GROUP BY product_id
      ) bu ON bu.product_id = ss.Product_ID
      WHERE DATE(ss.Status_Date) >= ? AND DATE(ss.Status_Date) < ?
      GROUP BY m.Product_ID, m.Product_Name, m.Category_Name, bu.unit`,
      [startStr, endStr],
    );

    const [receivedRows] = await db.query(
      `SELECT
        b.product_id,
        COALESCE(SUM(b.quantity), 0) AS received
      FROM batches b
      WHERE DATE(b.received_date) >= ? AND DATE(b.received_date) < ?
      GROUP BY b.product_id`,
      [startStr, endStr],
    );

    const [stockRows] = await db.query(
      `SELECT Product_ID AS product_id, COALESCE(Stock, 0) AS remaining FROM Inventory`,
    );

    const receivedMap = Object.fromEntries(
      receivedRows.map((r) => [r.product_id, Number(r.received)]),
    );
    const stockMap = Object.fromEntries(
      stockRows.map((r) => [r.product_id, Number(r.remaining)]),
    );

    const items = withdrawalRows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      category: row.category,
      unit: row.unit,
      received: receivedMap[row.product_id] ?? 0,
      withdrawn: Number(row.withdrawn),
      returned: Number(row.returned),
      wasted: Number(row.wasted),
      remaining: stockMap[row.product_id] ?? 0,
      consumptionRate: Number(row.withdrawn) / 7,
    }));

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
router.get("/monthly", async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month)
    return res.status(400).json({ error: "year and month required" });

  const startDate = new Date(Number(year), Number(month) - 1, 1);
  const endDate = new Date(Number(year), Number(month), 1);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();

  try {
    const [withdrawalRows] = await db.query(
      `SELECT
        m.Product_ID                                                       AS product_id,
        COALESCE(m.Product_Name, 'Unknown')                                AS product_name,
        COALESCE(m.Category_Name, 'Uncategorized')                         AS category,
        COALESCE(bu.unit, 'piece')                                         AS unit,
        COALESCE(SUM(CASE WHEN LOWER(ss.Type) IN ('initial','supplementary') THEN ss.Quantity ELSE 0 END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN LOWER(ss.Type) = 'return'   THEN ss.Quantity ELSE 0 END), 0) AS returned,
        COALESCE(SUM(CASE WHEN LOWER(ss.Type) = 'spoilage' THEN ss.Quantity ELSE 0 END), 0) AS wasted
      FROM Stock_Status ss
      JOIN Menu m ON m.Product_ID = ss.Product_ID
      LEFT JOIN (
        SELECT product_id, MAX(unit) AS unit
        FROM batches
        GROUP BY product_id
      ) bu ON bu.product_id = ss.Product_ID
      WHERE DATE(ss.Status_Date) >= ? AND DATE(ss.Status_Date) < ?
      GROUP BY m.Product_ID, m.Product_Name, m.Category_Name, bu.unit`,
      [startStr, endStr],
    );

    const [receivedRows] = await db.query(
      `SELECT
        b.product_id,
        COALESCE(SUM(b.quantity), 0) AS received
      FROM batches b
      WHERE DATE(b.received_date) >= ? AND DATE(b.received_date) < ?
      GROUP BY b.product_id`,
      [startStr, endStr],
    );

    const [stockRows] = await db.query(
      `SELECT Product_ID AS product_id, COALESCE(Stock, 0) AS remaining FROM Inventory`,
    );

    const receivedMap = Object.fromEntries(
      receivedRows.map((r) => [r.product_id, Number(r.received)]),
    );
    const stockMap = Object.fromEntries(
      stockRows.map((r) => [r.product_id, Number(r.remaining)]),
    );

    const monthName = startDate.toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    const items = withdrawalRows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      category: row.category,
      unit: row.unit,
      received: receivedMap[row.product_id] ?? 0,
      withdrawn: Number(row.withdrawn),
      returned: Number(row.returned),
      wasted: Number(row.wasted),
      remaining: stockMap[row.product_id] ?? 0,
      consumptionRate: Number(row.withdrawn) / daysInMonth,
    }));

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
