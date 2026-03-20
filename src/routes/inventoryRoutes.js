const router = require("express").Router();
const db = require("../config/db");
const { randomUUID } = require("crypto");

async function hasColumn(tableName, columnName) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
  return rows.length > 0;
}

function toMySqlDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Shared helper used by order flow to deduct stock and log stock-out activity.
async function deductStockForOrder(productId, quantityUsed, recordedBy = null, connection = db) {
  const qty = Number(quantityUsed) || 0;
  if (qty <= 0) return;

  // Ensure an inventory row exists for this product to keep inventory updates consistent.
  await connection.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT m.Product_ID, m.Stock, m.Stock, m.Product_Name
     FROM Menu m
     WHERE m.Product_ID = ?
       AND NOT EXISTS (
         SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID
       )`,
    [productId]
  );

  await connection.query(
    `UPDATE Inventory
     SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0),
         Quantity = GREATEST(COALESCE(Quantity, 0) - ?, 0),
         Last_Update = NOW()
     WHERE Product_ID = ?`,
    [qty, qty, productId]
  );

  // RecordedBy is nullable; use null for system-triggered updates.
  await connection.query(
    `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
     VALUES (?, 'Stock Out', ?, NOW(), ?)`,
    [productId, qty, Number.isInteger(recordedBy) ? recordedBy : null]
  );
}

// Helper to ensure batches table exists (in case setup script hasn't been run)
async function ensureBatchTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS Batches (
      id VARCHAR(36) PRIMARY KEY,
      productId INT,
      quantity INT NOT NULL,
      unit VARCHAR(50),
      receivedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NULL,
      status VARCHAR(20) DEFAULT 'active',
      FOREIGN KEY (productId) REFERENCES Menu(Product_ID)
    );
  `);
}

// GET /api/inventory
// Returns stock manager shape + compatibility fields for existing frontend code.
router.get("/", async (req, res) => {
  try {
    await ensureBatchTable();

    // Ensure inventory rows exist for all menu products.
    await db.query(
      `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
       SELECT m.Product_ID, m.Stock, m.Stock, m.Product_Name
       FROM Menu m
       LEFT JOIN Inventory i ON i.Product_ID = m.Product_ID
       WHERE i.Inventory_ID IS NULL`
    );

    const hasReorderPoint = await hasColumn("Inventory", "Reorder_Point");
    const hasCriticalPoint = await hasColumn("Inventory", "Critical_Point");

    const reorderExpr = hasReorderPoint ? "COALESCE(i.Reorder_Point, 20)" : "20";
    const criticalExpr = hasCriticalPoint ? "COALESCE(i.Critical_Point, 5)" : "5";

    const [rows] = await db.query(
      `SELECT
         i.Inventory_ID AS inventory_id,
         i.Product_ID AS product_id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product') AS product_name,
         COALESCE(m.Category_Name, 'Uncategorized') AS category,
         COALESCE(bu.unit, 'piece') AS unit,
         COALESCE(i.Stock, 0) AS mainStock,
         COALESCE(i.Quantity, 0) AS quantity,
         COALESCE(i.Item_Purchased, m.Product_Name, 'Unnamed Product') AS item_purchased,
         i.Last_Update AS last_update,
         ${reorderExpr} AS reorderPoint,
         ${criticalExpr} AS criticalPoint,
         COALESCE(sa.supplier_name, 'No Supplier') AS supplier_name,
         COALESCE(ss.dailyWithdrawn, 0) AS dailyWithdrawn,
         COALESCE(ss.returned, 0) AS returned,
         COALESCE(ss.wasted, 0) AS wasted,
         i.Product_ID AS id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product') AS name,
         COALESCE(i.Stock, 0) AS stock,
         COALESCE(CAST(m.Price AS CHAR), '0') AS price,
         '/img/placeholder.jpg' AS image
       FROM Inventory i
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       LEFT JOIN (
         SELECT productId, MAX(unit) AS unit
         FROM Batches
         GROUP BY productId
       ) bu ON bu.productId = i.Product_ID
       LEFT JOIN (
         SELECT Product_ID, MIN(SupplierName) AS supplier_name
         FROM Suppliers
         GROUP BY Product_ID
       ) sa ON sa.Product_ID = i.Product_ID
       LEFT JOIN (
         SELECT
           Product_ID,
           SUM(CASE
             WHEN DATE(Status_Date) = CURDATE()
              AND LOWER(COALESCE(Type, '')) NOT IN ('return', 'spoilage', 'wasted', 'waste')
             THEN COALESCE(Quantity, 0) ELSE 0 END
           ) AS dailyWithdrawn,
           SUM(CASE
             WHEN DATE(Status_Date) = CURDATE()
              AND LOWER(COALESCE(Type, '')) = 'return'
             THEN COALESCE(Quantity, 0) ELSE 0 END
           ) AS returned,
           SUM(CASE
             WHEN DATE(Status_Date) = CURDATE()
              AND LOWER(COALESCE(Type, '')) IN ('spoilage', 'wasted', 'waste')
             THEN COALESCE(Quantity, 0) ELSE 0 END
           ) AS wasted
         FROM Stock_Status
         GROUP BY Product_ID
       ) ss ON ss.Product_ID = i.Product_ID
       ORDER BY i.Inventory_ID ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// PUT /api/inventory/:inventory_id
// Body: { stock, daily_withdrawn?, returned?, wasted? }
router.put("/:inventory_id", async (req, res) => {
  try {
    const inventoryId = Number(req.params.inventory_id);

    if (!Number.isFinite(inventoryId) || inventoryId <= 0) {
      return res.status(400).json({ message: "Invalid inventory_id" });
    }

    const { stock, daily_withdrawn, returned, wasted } = req.body;

    // Build SET clause dynamically — only update fields that were actually sent
    const fields = [];
    const values = [];

    if (stock !== undefined) {
      if (!Number.isFinite(Number(stock)) || Number(stock) < 0)
        return res.status(400).json({ message: "Invalid stock value" });
      fields.push("Stock = ?");
      values.push(Number(stock));
    }
    if (daily_withdrawn !== undefined) {
      fields.push("Daily_Withdrawn = ?");
      values.push(Number(daily_withdrawn));
    }
    if (returned !== undefined) {
      fields.push("Returned = ?");
      values.push(Number(returned));
    }
    if (wasted !== undefined) {
      fields.push("Wasted = ?");
      values.push(Number(wasted));
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    fields.push("Last_Update = NOW()");
    values.push(inventoryId);

    const [result] = await db.query(
      `UPDATE Inventory SET ${fields.join(", ")} WHERE Inventory_ID = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Inventory record not found" });
    }

    const [rows] = await db.query(
      `SELECT * FROM Inventory WHERE Inventory_ID = ?`,
      [inventoryId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Error updating inventory:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /api/inventory/batches
router.post("/batches", async (req, res) => {
  try {
    await ensureBatchTable();

    const { productId, productName, quantity, unit, expiresAt } = req.body;
    const id = randomUUID();
    const receivedAt = new Date();
    const qty = Number(quantity) || 0;

    if (!Number.isFinite(Number(productId)) || qty <= 0) {
      return res.status(400).json({ message: "productId and quantity are required" });
    }

    // Ensure referenced product exists in Menu.
    const [menuRows] = await db.query("SELECT Product_ID FROM Menu WHERE Product_ID = ?", [productId]);
    if (menuRows.length === 0) {
      const [prodRows] = await db.query("SELECT name, price, quantity FROM products WHERE id = ?", [productId]);
      if (prodRows.length > 0) {
        const p = prodRows[0];
        await db.query(
          "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
          [productId, p.name, p.price || 0, p.quantity || 0]
        );
      } else {
        // Fallback: keep batch flow working even when product mapping is incomplete.
        const safeName = String(productName || `Product ${productId}`);
        await db.query(
          "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
          [productId, safeName, 0, 0]
        );
      }
    }

    const formattedExpiresAt = toMySqlDateTime(expiresAt);

    await db.query("INSERT INTO Batches SET ?", {
      id,
      productId,
      quantity: qty,
      unit,
      receivedAt,
      expiresAt: formattedExpiresAt,
      status: "active",
    });

    await db.query(
      `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
       SELECT m.Product_ID, 0, 0, m.Product_Name
       FROM Menu m
       WHERE m.Product_ID = ?
         AND NOT EXISTS (SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID)`,
      [productId]
    );

    await db.query("UPDATE Inventory SET Stock = COALESCE(Stock, 0) + ?, Last_Update = NOW() WHERE Product_ID = ?", [qty, productId]);
    await db.query("UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?", [qty, productId]);
    await db.query("UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?", [qty, productId]);

    res.status(201).json({ id, productId, quantity: qty, unit, receivedAt, expiresAt: formattedExpiresAt, status: "active" });
  } catch (err) {
    console.error("Error adding batch:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /api/inventory/batches/:batchId/return
router.post("/batches/:batchId/return", async (req, res) => {
  try {
    const { batchId } = req.params;
    const qtyToReturn = Number(req.body.quantity) || 0;

    if (qtyToReturn <= 0) {
      return res.status(400).json({ message: "quantity must be greater than 0" });
    }

    const [rows] = await db.query("SELECT productId, quantity FROM Batches WHERE id = ?", [batchId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const batch = rows[0];
    const newQty = Math.max((Number(batch.quantity) || 0) - qtyToReturn, 0);
    const newStatus = newQty === 0 ? "returned" : "partial";

    await db.query("UPDATE Batches SET status = ?, quantity = ? WHERE id = ?", [newStatus, newQty, batchId]);

    await db.query("UPDATE Inventory SET Stock = COALESCE(Stock, 0) + ?, Last_Update = NOW() WHERE Product_ID = ?", [qtyToReturn, batch.productId]);
    await db.query("UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?", [qtyToReturn, batch.productId]);
    await db.query("UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?", [qtyToReturn, batch.productId]);

    res.json({ success: true, batch_id: batchId, status: newStatus, quantity: newQty });
  } catch (err) {
    console.error("Error returning batch:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

router.deductStockForOrder = deductStockForOrder;

module.exports = router;
