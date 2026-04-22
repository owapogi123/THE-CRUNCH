const router = require("express").Router();
const db = require("../config/db");
const { deductStockForOrder } = require("../services/inventoryService");

async function hasColumn(tableName, columnName) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [
    columnName,
  ]);
  return rows.length > 0;
}

async function ensureInventoryAlertColumns() {
  if (!(await hasColumn("Inventory", "Reorder_Point"))) {
    await db.query(
      "ALTER TABLE Inventory ADD COLUMN Reorder_Point DECIMAL(10,2) DEFAULT 20",
    );
  }

  if (!(await hasColumn("Inventory", "Critical_Point"))) {
    await db.query(
      "ALTER TABLE Inventory ADD COLUMN Critical_Point DECIMAL(10,2) DEFAULT 5",
    );
  }
}

async function ensureProductsImageColumn() {
  if (!(await hasColumn("products", "image"))) {
    await db.query("ALTER TABLE products ADD COLUMN image LONGTEXT NULL");
  }
}

function toMySqlDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function ensureBatchTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS Batches (
      batch_id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT,
      delivery_batch_id VARCHAR(50),
      quantity DECIMAL(10,2) NOT NULL,
      remaining_qty DECIMAL(10,2) NOT NULL,
      unit VARCHAR(50),
      received_date DATE NOT NULL,
      expiry_date DATE NULL,
      status VARCHAR(20) DEFAULT 'active',
      returned_qty DECIMAL(10,2) DEFAULT 0,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES Menu(Product_ID)
    );
  `);

  if (!(await hasColumn("Batches", "delivery_batch_id"))) {
    await db.query(
      "ALTER TABLE Batches ADD COLUMN delivery_batch_id VARCHAR(50)",
    );
  }
}

// GET /api/inventory
router.get("/", async (req, res) => {
  try {
    await ensureBatchTable();
    await ensureInventoryAlertColumns();
    await ensureProductsImageColumn();

    // Ensure inventory rows exist for all menu products.
    await db.query(
      `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
       SELECT m.Product_ID, m.Stock, m.Stock, m.Product_Name
       FROM Menu m
       LEFT JOIN Inventory i ON i.Product_ID = m.Product_ID
       WHERE i.Inventory_ID IS NULL`,
    );

    const hasReorderPoint = await hasColumn("Inventory", "Reorder_Point");
    const hasCriticalPoint = await hasColumn("Inventory", "Critical_Point");

    const reorderExpr = hasReorderPoint
      ? "COALESCE(i.Reorder_Point, 20)"
      : "20";
    const criticalExpr = hasCriticalPoint
      ? "COALESCE(i.Critical_Point, 5)"
      : "5";

    const [rows] = await db.query(
      `SELECT
         i.Inventory_ID                                                          AS inventory_id,
         i.Product_ID                                                            AS product_id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product')          AS product_name,
         COALESCE(m.Category_Name, 'Uncategorized')                             AS category,
         COALESCE(bu.unit, 'piece')                                             AS unit,
         COALESCE(i.Stock, 0)                                                   AS mainStock,
         COALESCE(i.Quantity, 0)                                                AS quantity,
         COALESCE(i.Item_Purchased, m.Product_Name, 'Unnamed Product')          AS item_purchased,
         i.Last_Update                                                           AS last_update,
         ${reorderExpr}                                                          AS reorderPoint,
         ${criticalExpr}                                                         AS criticalPoint,
         COALESCE(sa.supplier_name, 'No Supplier')                              AS supplier_name,
         COALESCE(i.Daily_Withdrawn, 0)                                         AS dailyWithdrawn,
         COALESCE(i.Returned, 0)                                                AS returned,
         COALESCE(i.Wasted, 0)                                                  AS wasted,
         COALESCE(ot.soldToday, 0)                                              AS soldToday,
         bexp.nearestExpiry                                                      AS expiryDate,
         i.Product_ID                                                            AS id,
         COALESCE(m.Product_Name, i.Item_Purchased, 'Unnamed Product')          AS name,
         COALESCE(i.Stock, 0)                                                   AS stock,
         COALESCE(CAST(m.Price AS CHAR), '0')                                   AS price,
         COALESCE(p.description, '')                                            AS description,
         COALESCE(m.Promo, '')                                                  AS promo,
         CASE WHEN COALESCE(m.Promo, '') = 'RAW_MATERIAL' THEN 1 ELSE 0 END    AS isRawMaterial,
         COALESCE(p.image, '/img/placeholder.jpg')                              AS image
       FROM Inventory i
       LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
       LEFT JOIN products p ON p.id = i.Product_ID
       LEFT JOIN (
         SELECT product_id, MAX(unit) AS unit
         FROM Batches
         GROUP BY product_id
       ) bu ON bu.product_id = i.Product_ID
       LEFT JOIN (
         SELECT product_id, MIN(expiry_date) AS nearestExpiry
         FROM Batches
         WHERE status = 'active' AND expiry_date IS NOT NULL
         GROUP BY product_id
       ) bexp ON bexp.product_id = i.Product_ID
       LEFT JOIN (
         SELECT Product_ID, MIN(SupplierName) AS supplier_name
         FROM Suppliers
         GROUP BY Product_ID
       ) sa ON sa.Product_ID = i.Product_ID
       LEFT JOIN (
         SELECT oi.Product_ID,
           SUM(oi.Quantity) AS soldToday
         FROM order_item oi
         JOIN orders o ON o.Order_ID = oi.Order_ID
         WHERE DATE(o.Order_Date) = CURDATE()
           AND LOWER(COALESCE(o.Status, '')) NOT IN ('cancelled')
         GROUP BY oi.Product_ID
       ) ot ON ot.Product_ID = i.Product_ID
       ORDER BY i.Inventory_ID ASC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// PUT /api/inventory/:inventory_id
router.put("/:inventory_id", async (req, res) => {
  try {
    const inventoryId = Number(req.params.inventory_id);
    if (!Number.isFinite(inventoryId) || inventoryId <= 0) {
      return res.status(400).json({ message: "Invalid inventory_id" });
    }

    const {
      stock,
      daily_withdrawn,
      returned,
      wasted,
      reorderPoint,
      criticalPoint,
    } = req.body;
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

    if (reorderPoint !== undefined || criticalPoint !== undefined) {
      await ensureInventoryAlertColumns();

      const [existingRows] = await db.query(
        `SELECT
           COALESCE(Reorder_Point, 20) AS reorderPoint,
           COALESCE(Critical_Point, 5) AS criticalPoint
         FROM Inventory
         WHERE Inventory_ID = ?`,
        [inventoryId],
      );

      if (existingRows.length === 0) {
        return res.status(404).json({ message: "Inventory record not found" });
      }

      const nextReorderPoint =
        reorderPoint !== undefined
          ? Number(reorderPoint)
          : Number(existingRows[0].reorderPoint);
      const nextCriticalPoint =
        criticalPoint !== undefined
          ? Number(criticalPoint)
          : Number(existingRows[0].criticalPoint);

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

      if (reorderPoint !== undefined) {
        fields.push("Reorder_Point = ?");
        values.push(nextReorderPoint);
      }
      if (criticalPoint !== undefined) {
        fields.push("Critical_Point = ?");
        values.push(nextCriticalPoint);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    fields.push("Last_Update = NOW()");
    values.push(inventoryId);

    const [result] = await db.query(
      `UPDATE Inventory SET ${fields.join(", ")} WHERE Inventory_ID = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Inventory record not found" });
    }

    const [rows] = await db.query(
      `SELECT * FROM Inventory WHERE Inventory_ID = ?`,
      [inventoryId],
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
    const qty = Number(quantity) || 0;

    if (!Number.isFinite(Number(productId)) || qty <= 0) {
      return res
        .status(400)
        .json({ message: "productId and quantity are required" });
    }

    const [menuRows] = await db.query(
      "SELECT Product_ID FROM Menu WHERE Product_ID = ?",
      [productId],
    );
    if (menuRows.length === 0) {
      const [prodRows] = await db.query(
        "SELECT name, price, quantity FROM products WHERE id = ?",
        [productId],
      );
      if (prodRows.length > 0) {
        const p = prodRows[0];
        await db.query(
          "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
          [productId, p.name, p.price || 0, p.quantity || 0],
        );
      } else {
        const safeName = String(productName || `Product ${productId}`);
        await db.query(
          "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
          [productId, safeName, 0, 0],
        );
      }
    }

    const formattedExpiresAt = toMySqlDateTime(expiresAt);

    const [insertResult] = await db.query(
      `INSERT INTO Batches
         (product_id, quantity, remaining_qty, unit, received_date, expiry_date, status, returned_qty, notes)
       VALUES (?, ?, ?, ?, CURDATE(), ?, 'active', 0, NULL)`,
      [productId, qty, qty, unit || "piece", formattedExpiresAt],
    );

    await db.query(
      `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
       SELECT m.Product_ID, 0, 0, m.Product_Name
       FROM Menu m
       WHERE m.Product_ID = ?
         AND NOT EXISTS (SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID)`,
      [productId],
    );

    // Delivery — only mainStock increases, dailyWithdrawn stays unchanged
    await db.query(
      "UPDATE Inventory SET Stock = COALESCE(Stock, 0) + ?, Last_Update = NOW() WHERE Product_ID = ?",
      [qty, productId],
    );
    await db.query(
      "UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?",
      [qty, productId],
    );
    await db.query(
      "UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?",
      [qty, productId],
    );

    res.status(201).json({
      batch_id: insertResult.insertId,
      product_id: productId,
      quantity: qty,
      remaining_qty: qty,
      unit: unit || "piece",
      expiry_date: formattedExpiresAt,
      status: "active",
    });
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
      return res
        .status(400)
        .json({ message: "quantity must be greater than 0" });
    }

    const [rows] = await db.query(
      "SELECT product_id, remaining_qty FROM Batches WHERE batch_id = ?",
      [batchId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const batch = rows[0];
    const newQty = Math.max(
      (Number(batch.remaining_qty) || 0) - qtyToReturn,
      0,
    );
    const newStatus = newQty === 0 ? "returned" : "partial";

    await db.query(
      "UPDATE Batches SET status = ?, remaining_qty = ?, returned_qty = COALESCE(returned_qty, 0) + ? WHERE batch_id = ?",
      [newStatus, newQty, qtyToReturn, batchId],
    );

    // Batch return — mainStock goes back up, dailyWithdrawn goes back down
    await db.query(
      `UPDATE Inventory
       SET Stock           = COALESCE(Stock, 0) + ?,
           Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
           Last_Update     = NOW()
       WHERE Product_ID = ?`,
      [qtyToReturn, qtyToReturn, batch.product_id],
    );
    await db.query(
      "UPDATE Menu SET Stock = COALESCE(Stock, 0) + ? WHERE Product_ID = ?",
      [qtyToReturn, batch.product_id],
    );
    await db.query(
      "UPDATE products SET quantity = COALESCE(quantity, 0) + ? WHERE id = ?",
      [qtyToReturn, batch.product_id],
    );

    res.json({
      success: true,
      batch_id: batchId,
      status: newStatus,
      quantity: newQty,
    });
  } catch (err) {
    console.error("Error returning batch:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

module.exports = router;
