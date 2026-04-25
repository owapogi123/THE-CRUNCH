const db = require("../config/db");

function normalizePaymentStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "paid" || v === "completed") return "Paid";
  if (v === "pending verification") return "Pending Verification";
  if (v === "pending payment") return "Pending Payment";
  if (v === "pending") return "Pending";
  return value ? String(value) : "Pending";
}

function isPaidPaymentStatus(value) {
  return normalizePaymentStatus(value) === "Paid";
}

function normalizeOrderStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return "Queued";
  if (v === "completed") return "Completed";
  return value;
}

async function resolveRecordedByAdminId(recordedBy, connection = db) {
  const numericRecordedBy = Number(recordedBy);
  if (!Number.isInteger(numericRecordedBy) || numericRecordedBy <= 0) {
    return null;
  }

  const [adminRows] = await connection.query(
    `SELECT Admin_ID
     FROM admin
     WHERE Admin_ID = ?
     LIMIT 1`,
    [numericRecordedBy],
  );

  return adminRows.length ? numericRecordedBy : null;
}

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
  const safeRecordedBy = await resolveRecordedByAdminId(recordedBy, connection);

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
    [productId, qty, safeRecordedBy],
  );
}

async function deductSalesStockForCompletedOrder(
  orderId,
  recordedBy = null,
  connection = db,
) {
  const numericOrderId = Number(orderId) || 0;
  if (numericOrderId <= 0) {
    throw new Error("Invalid order ID for stock deduction");
  }

  const [orderRows] = await connection.query(
    `SELECT
       Order_ID AS orderId,
       Status AS orderStatus,
       payment_status AS paymentStatus,
       COALESCE(stock_deducted, 0) AS stockDeducted
     FROM orders
     WHERE Order_ID = ?
     LIMIT 1`,
    [numericOrderId],
  );

  if (!orderRows.length) {
    throw new Error("Order not found for stock deduction");
  }

  const order = orderRows[0];
  if (!isPaidPaymentStatus(order.paymentStatus)) {
    throw new Error("Cannot deduct stock for an unpaid order");
  }
  if (normalizeOrderStatus(order.orderStatus) !== "Completed") {
    throw new Error("Cannot deduct stock before the order is completed");
  }
  if (Number(order.stockDeducted) === 1) {
    return false;
  }

  const [items] = await connection.query(
    `SELECT Product_ID AS productId, Quantity AS quantity
     FROM order_item
     WHERE Order_ID = ?`,
    [numericOrderId],
  );

  for (const item of items) {
    const productId = Number(item.productId) || 0;
    const requiredQty = Number(item.quantity) || 0;

    if (productId <= 0 || requiredQty <= 0) {
      throw new Error(`Invalid order item for stock deduction on order ${numericOrderId}`);
    }

    await deductStockForOrder(productId, requiredQty, recordedBy, connection);
  }

  const [updateResult] = await connection.query(
    `UPDATE orders
     SET stock_deducted = 1
     WHERE Order_ID = ?
       AND COALESCE(stock_deducted, 0) = 0`,
    [numericOrderId],
  );

  return updateResult.affectedRows > 0;
}

module.exports = {
  deductStockForOrder,
  deductSalesStockForCompletedOrder,
};
