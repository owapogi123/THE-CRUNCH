const router = require("express").Router();
const db = require("../config/db");

async function addColumnIfMissing(conn, tableName, columnName, definition) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [
    columnName,
  ]);
  if (rows.length > 0) return;
  await conn.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
}

async function ensureKitchenUsageTables(conn = db) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS kitchen_usage_reports (
      report_id INT PRIMARY KEY AUTO_INCREMENT,
      report_date DATE NOT NULL,
      status ENUM('draft','submitted','finalized') NOT NULL DEFAULT 'draft',
      prepared_by INT NULL,
      finalized_by INT NULL,
      finalized_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_report_date (report_date)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS kitchen_usage_items (
      usage_item_id INT PRIMARY KEY AUTO_INCREMENT,
      report_id INT NOT NULL,
      product_id INT NULL,
      product_name VARCHAR(255) NOT NULL DEFAULT '',
      category VARCHAR(255) NOT NULL DEFAULT 'RAW MATERIAL',
      unit VARCHAR(50) NOT NULL DEFAULT 'unit',
      withdrawn_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
      used_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
      spoilage_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_report_product (report_id, product_id),
      CONSTRAINT fk_kitchen_usage_report
        FOREIGN KEY (report_id) REFERENCES kitchen_usage_reports(report_id)
        ON DELETE CASCADE
    )
  `);

  await conn.query(`
    ALTER TABLE kitchen_usage_items
    MODIFY COLUMN product_id INT NULL
  `);
  await addColumnIfMissing(
    conn,
    "kitchen_usage_items",
    "product_name",
    "VARCHAR(255) NOT NULL DEFAULT ''",
  );
  await addColumnIfMissing(
    conn,
    "kitchen_usage_items",
    "category",
    "VARCHAR(255) NOT NULL DEFAULT 'RAW MATERIAL'",
  );
  await addColumnIfMissing(
    conn,
    "kitchen_usage_items",
    "unit",
    "VARCHAR(50) NOT NULL DEFAULT 'unit'",
  );
  await addColumnIfMissing(
    conn,
    "kitchen_usage_items",
    "withdrawn_qty",
    "DECIMAL(10,2) NOT NULL DEFAULT 0",
  );
}

function toDateString(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? +n.toFixed(2) : 0;
}

async function getOrCreateReport(conn, reportDate, preparedBy = null) {
  await ensureKitchenUsageTables(conn);

  const [existing] = await conn.query(
    `SELECT
       kur.report_id,
       kur.report_date,
       kur.status,
       kur.prepared_by,
       pu.username AS prepared_by_name,
       kur.finalized_by,
       fu.username AS finalized_by_name,
       kur.finalized_at,
       kur.updated_at
     FROM kitchen_usage_reports kur
     LEFT JOIN users pu ON pu.id = kur.prepared_by
     LEFT JOIN users fu ON fu.id = kur.finalized_by
     WHERE report_date = ?`,
    [reportDate],
  );

  if (existing.length > 0) return existing[0];

  const [insertResult] = await conn.query(
    `INSERT INTO kitchen_usage_reports (report_date, prepared_by)
     VALUES (?, ?)`,
    [reportDate, preparedBy],
  );

  const [created] = await conn.query(
    `SELECT
       kur.report_id,
       kur.report_date,
       kur.status,
       kur.prepared_by,
       pu.username AS prepared_by_name,
       kur.finalized_by,
       fu.username AS finalized_by_name,
       kur.finalized_at,
       kur.updated_at
     FROM kitchen_usage_reports kur
     LEFT JOIN users pu ON pu.id = kur.prepared_by
     LEFT JOIN users fu ON fu.id = kur.finalized_by
     WHERE kur.report_id = ?`,
    [insertResult.insertId],
  );

  return created[0];
}

async function buildReportPayload(reportDate) {
  await ensureKitchenUsageTables();

  const report = await getOrCreateReport(db, reportDate);

  const [items] = await db.query(
    `SELECT
       kui.usage_item_id,
       kui.product_id,
       kui.product_name,
       kui.category,
       kui.unit,
       kui.withdrawn_qty,
       kui.used_qty,
       kui.spoilage_qty,
       kui.note
     FROM kitchen_usage_items kui
     WHERE kui.report_id = ?
     ORDER BY kui.usage_item_id ASC`,
    [report.report_id],
  );

  return {
    report: {
      report_id: report.report_id,
      report_date: report.report_date,
      status: report.status,
      prepared_by: report.prepared_by,
      prepared_by_name: report.prepared_by_name || null,
      finalized_by: report.finalized_by,
      finalized_by_name: report.finalized_by_name || null,
      finalized_at: report.finalized_at,
      updated_at: report.updated_at,
    },
    items: items.map((item) => ({
      usage_item_id: Number(item.usage_item_id),
      product_id: item.product_id == null ? null : Number(item.product_id),
      product_name: String(item.product_name || ""),
      category: String(item.category || "RAW MATERIAL"),
      unit: String(item.unit || "unit"),
      withdrawn_qty: normalizeQty(item.withdrawn_qty),
      used_qty: normalizeQty(item.used_qty),
      spoilage_qty: normalizeQty(item.spoilage_qty),
      note: item.note ? String(item.note) : "",
    })),
  };
}

async function findLatestPopulatedReportDate() {
  await ensureKitchenUsageTables();

  const [rows] = await db.query(
    `SELECT DATE_FORMAT(kur.report_date, '%Y-%m-%d') AS report_date
     FROM kitchen_usage_reports kur
     INNER JOIN kitchen_usage_items kui
       ON kui.report_id = kur.report_id
     GROUP BY kur.report_id, kur.report_date
     HAVING COUNT(kui.usage_item_id) > 0
     ORDER BY kur.report_date DESC
     LIMIT 1`,
  );

  return rows.length > 0 ? String(rows[0].report_date) : null;
}

router.get("/today", async (req, res) => {
  try {
    const reportDate = toDateString(req.query.date);
    let payload = await buildReportPayload(reportDate);

    if (
      String(req.query.preferLatestPopulated || "") === "1" &&
      payload.items.length === 0
    ) {
      const latestReportDate = await findLatestPopulatedReportDate();
      if (latestReportDate) {
        payload = await buildReportPayload(latestReportDate);
      }
    }

    res.json(payload);
  } catch (err) {
    console.error("GET /kitchen-usage/today error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

router.put("/today", async (req, res) => {
  let conn;
  try {
    const reportDate = toDateString(req.body.report_date);
    const status = ["draft", "submitted"].includes(String(req.body.status || "").toLowerCase())
      ? String(req.body.status).toLowerCase()
      : "draft";
    const preparedBy = req.body.prepared_by == null ? null : Number(req.body.prepared_by);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    conn = await db.getConnection();
    await conn.beginTransaction();

    const report = await getOrCreateReport(conn, reportDate, preparedBy);

    await conn.query(
      `UPDATE kitchen_usage_reports
       SET status = ?, prepared_by = COALESCE(?, prepared_by)
      WHERE report_id = ?`,
      [status, Number.isFinite(preparedBy) ? preparedBy : null, report.report_id],
    );

    await conn.query(`DELETE FROM kitchen_usage_items WHERE report_id = ?`, [
      report.report_id,
    ]);

    for (const item of items) {
      const productName = String(item.product_name || "").trim();
      if (!productName) continue;
      const productId = Number(item.product_id);

      await conn.query(
        `INSERT INTO kitchen_usage_items (
           report_id,
           product_id,
           product_name,
           category,
           unit,
           withdrawn_qty,
           used_qty,
           spoilage_qty,
           note
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          report.report_id,
          Number.isFinite(productId) && productId > 0 ? productId : null,
          productName,
          item.category ? String(item.category).trim() : "RAW MATERIAL",
          item.unit ? String(item.unit).trim() : "unit",
          normalizeQty(item.withdrawn_qty),
          normalizeQty(item.used_qty),
          normalizeQty(item.spoilage_qty),
          item.note ? String(item.note).trim() : null,
        ],
      );
    }

    await conn.commit();
    const payload = await buildReportPayload(reportDate);
    res.json(payload);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("PUT /kitchen-usage/today error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

router.patch("/:reportId/finalize", async (req, res) => {
  try {
    await ensureKitchenUsageTables();
    const reportId = Number(req.params.reportId);
    const finalizedBy = req.body.finalized_by == null ? null : Number(req.body.finalized_by);

    if (!Number.isFinite(reportId) || reportId <= 0) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    await db.query(
      `UPDATE kitchen_usage_reports
       SET status = 'finalized',
           finalized_by = ?,
           finalized_at = NOW()
       WHERE report_id = ?`,
      [Number.isFinite(finalizedBy) ? finalizedBy : null, reportId],
    );

    const [reportRows] = await db.query(
      `SELECT report_date FROM kitchen_usage_reports WHERE report_id = ?`,
      [reportId],
    );
    if (reportRows.length === 0) {
      return res.status(404).json({ message: "Report not found" });
    }

    const payload = await buildReportPayload(toDateString(reportRows[0].report_date));
    res.json(payload);
  } catch (err) {
    console.error("PATCH /kitchen-usage/:reportId/finalize error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

module.exports = router;
