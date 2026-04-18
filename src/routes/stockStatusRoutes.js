const router = require("express").Router();
const db = require("../config/db");

function normaliseRecordedBy(recorded_by) {
  if (recorded_by == null) return null;
  const n = Number(recorded_by);
  return Number.isFinite(n) ? n : String(recorded_by);
}

async function ensureInventoryRow(conn, product_id) {
  await conn.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT m.Product_ID, m.Stock, m.Stock, m.Stock
     FROM Menu m
     WHERE m.Product_ID = ?
       AND NOT EXISTS (SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID)`,
    [product_id],
  );
}

// GET /api/stock-status/today
router.get("/today", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         ss.Status_ID                              AS status_id,
         ss.Product_ID                             AS product_id,
         COALESCE(m.Product_Name, 'Unknown')       AS product_name,
         LOWER(COALESCE(ss.Type, 'initial'))       AS type,
         COALESCE(ss.Quantity, 0)                  AS quantity,
         ss.Status_Date                            AS status_date,
         ss.RecordedBy                             AS recorded_by
       FROM Stock_Status ss
       LEFT JOIN Menu m ON m.Product_ID = ss.Product_ID
       WHERE DATE(ss.Status_Date) = CURDATE()
       ORDER BY ss.Status_Date DESC, ss.Status_ID DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /stock-status/today error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /api/stock-status
// Handles: initial, supplementary (withdrawal) and return
router.post("/", async (req, res) => {
  let conn;
  try {
    const { product_id, type, quantity, recorded_by } = req.body;
    const qty = Number(quantity) || 0;
    const typeLow = String(type || "").toLowerCase();

    if (!Number.isFinite(Number(product_id)) || qty <= 0 || !typeLow) {
      return res
        .status(400)
        .json({ message: "product_id, type, and quantity are required" });
    }

    const recordedByValue = normaliseRecordedBy(recorded_by);

    conn = await db.getConnection();
    await conn.beginTransaction();

    // 1. Log to Stock_Status
    const [result] = await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, ?, ?, NOW(), ?)`,
      [product_id, typeLow, qty, recordedByValue],
    );

    // 2. Ensure Inventory row exists
    await ensureInventoryRow(conn, product_id);

    if (typeLow === "return") {
      // Return → mainStock goes UP, dailyWithdrawn goes DOWN
      await conn.query(
        `UPDATE Inventory
         SET Stock           = COALESCE(Stock, 0) + ?,
             Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
             Returned        = COALESCE(Returned, 0) + ?,
             Last_Update     = NOW()
         WHERE Product_ID = ?`,
        [qty, qty, qty, product_id],
      );
      await conn.query(
        "UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?",
        [qty, product_id],
      );
    } else {
      // Withdrawal (initial / supplementary)
      // → mainStock goes DOWN, dailyWithdrawn goes UP
      await conn.query(
        `UPDATE Inventory
         SET Stock           = GREATEST(COALESCE(Stock, 0) - ?, 0),
             Daily_Withdrawn = COALESCE(Daily_Withdrawn, 0) + ?,
             Last_Update     = NOW()
         WHERE Product_ID = ?`,
        [qty, qty, product_id],
      );
      await conn.query(
        "UPDATE Menu SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0) WHERE Product_ID = ?",
        [qty, product_id],
      );
    }

    await conn.commit();

    // Return the created record
    const [createdRows] = await db.query(
      `SELECT
         ss.Status_ID                              AS status_id,
         ss.Product_ID                             AS product_id,
         COALESCE(m.Product_Name, 'Unknown')       AS product_name,
         LOWER(COALESCE(ss.Type, 'initial'))       AS type,
         COALESCE(ss.Quantity, 0)                  AS quantity,
         ss.Status_Date                            AS status_date,
         ss.RecordedBy                             AS recorded_by
       FROM Stock_Status ss
       LEFT JOIN Menu m ON m.Product_ID = ss.Product_ID
       WHERE ss.Status_ID = ?`,
      [result.insertId],
    );

    res.status(201).json(createdRows[0]);
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("POST /stock-status error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/stock-status/spoilage
router.post("/spoilage", async (req, res) => {
  let conn;
  try {
    const { product_id, quantity, recorded_by } = req.body;
    const qty = Number(quantity) || 0;

    if (!Number.isFinite(Number(product_id)) || qty <= 0) {
      return res
        .status(400)
        .json({ message: "product_id and quantity are required" });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    await ensureInventoryRow(conn, product_id);

    const [inventoryRows] = await conn.query(
      `SELECT
         COALESCE(Daily_Withdrawn, 0) AS dailyWithdrawn,
         COALESCE(Wasted, 0) AS wasted
       FROM Inventory
       WHERE Product_ID = ?
       FOR UPDATE`,
      [product_id],
    );

    if (inventoryRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Inventory record not found" });
    }

    const availableWithdrawn = Number(inventoryRows[0].dailyWithdrawn) || 0;
    if (availableWithdrawn <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "No withdrawn stock available for spoilage.",
      });
    }
    if (qty > availableWithdrawn) {
      await conn.rollback();
      return res.status(400).json({
        message: `Spoilage cannot exceed withdrawn stock (${availableWithdrawn.toFixed(2)} available).`,
      });
    }

    await conn.query(
      `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
       VALUES (?, 'spoilage', ?, NOW(), ?)`,
      [product_id, qty, normaliseRecordedBy(recorded_by)],
    );

    // Spoilage — deducts mainStock only, dailyWithdrawn unchanged
    await conn.query(
      `UPDATE Inventory
       SET Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Wasted          = COALESCE(Wasted, 0) + ?,
           Last_Update     = NOW()
       WHERE Product_ID = ?`,
      [qty, qty, product_id],
    );

    await conn.commit();
    res.status(201).json({
      success: true,
      product_id,
      quantity: qty,
      dailyWithdrawn: +(availableWithdrawn - qty).toFixed(2),
      wasted: +((Number(inventoryRows[0].wasted) || 0) + qty).toFixed(2),
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("POST /stock-status/spoilage error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
