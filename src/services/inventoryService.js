const db = require("../config/db");

// Shared helper used by order flow.
// Sales only deduct Daily_Withdrawn — mainStock is ONLY touched by kitchen withdrawals.
async function deductStockForOrder(
  productId,
  quantityUsed,
  recordedBy = null,
  connection = db,
) {
  const qty = Number(quantityUsed) || 0;
  if (qty <= 0) return;

  // Ensure an inventory row exists.
  await connection.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT m.Product_ID, m.Stock, m.Stock, m.Product_Name
     FROM Menu m
     WHERE m.Product_ID = ?
       AND NOT EXISTS (
         SELECT 1 FROM Inventory i WHERE i.Product_ID = m.Product_ID
       )`,
    [productId],
  );

  // Only deduct Daily_Withdrawn — mainStock (Stock) is NOT touched by sales.
  await connection.query(
    `UPDATE Inventory
     SET Daily_Withdrawn = GREATEST(COALESCE(Daily_Withdrawn, 0) - ?, 0),
         Last_Update     = NOW()
     WHERE Product_ID = ?`,
    [qty, productId],
  );

  // Log to Stock_Status for audit trail.
  await connection.query(
    `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
     VALUES (?, 'Stock Out', ?, NOW(), ?)`,
    [productId, qty, Number.isInteger(recordedBy) ? recordedBy : null],
  );
}

module.exports = {
  deductStockForOrder,
};
