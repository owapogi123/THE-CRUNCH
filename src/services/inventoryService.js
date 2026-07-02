const db = require("../config/db");
const { fetchMenuIngredients } = require("../utils/menuAvailability");
const {
  MENU_ITEM,
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
} = require("../utils/productItemType");

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

function isForceAvailableMenuItem(menuItem) {
  const manualOverride =
    menuItem?.manual_override === true ||
    menuItem?.manual_override === 1 ||
    String(menuItem?.manual_override).toLowerCase() === "true";

  const status = String(
    menuItem?.manual_status || menuItem?.availability_status || "",
  )
    .trim()
    .toLowerCase();

  return (
    manualOverride &&
    (
      status === "available" ||
      status === "force available" ||
      status.includes("available")
    ) &&
    !status.includes("out")
  );
}

async function resolveRecordedByAdminId(recordedBy, connection = db) {
  const numericRecordedBy = Number(recordedBy);
  if (!Number.isInteger(numericRecordedBy) || numericRecordedBy <= 0) {
    return null;
  }

  let adminRows = [];
  try {
    [adminRows] = await connection.query(
      `SELECT Admin_ID
       FROM admin
       WHERE Admin_ID = ?
       LIMIT 1`,
      [numericRecordedBy],
    );
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return null;
    }
    throw error;
  }

  return adminRows.length ? numericRecordedBy : null;
}

// Shared helper used by order flow.
// Paid orders deduct directly from main inventory stock.
async function deductStockForOrder(
  productId,
  quantityUsed,
  recordedBy = null,
  connection = db,
) {
  const qty = Number(quantityUsed) || 0;
  if (qty <= 0) return;
  const safeRecordedBy = await resolveRecordedByAdminId(recordedBy, connection);

  const [menuRows] = await connection.query(
    `SELECT Product_ID
     FROM Menu
     WHERE Product_ID = ?
     LIMIT 1`,
    [productId],
  );

  // Some legacy order_item rows point to product IDs that no longer exist in Menu.
  // Skip stock logging for those orphaned rows so order completion can still succeed.
  if (!menuRows.length) {
    console.warn(
      `[inventoryService] Skipping stock deduction for missing Menu product ${productId}`,
    );
    return;
  }

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

  await connection.query(
    `UPDATE Inventory
     SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0),
         Last_Update     = NOW()
     WHERE Product_ID = ?`,
    [qty, productId],
  );

  await connection.query(
    `UPDATE Menu
     SET Stock = GREATEST(COALESCE(Stock, 0) - ?, 0)
     WHERE Product_ID = ?`,
    [qty, productId],
  );

  await connection.query(
    `UPDATE products
     SET quantity = GREATEST(COALESCE(quantity, 0) - ?, 0)
     WHERE id = ?`,
    [qty, productId],
  );

  // Log to Stock_Status for audit trail.
  await connection.query(
    `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
     VALUES (?, 'Stock Out', ?, NOW(), ?)`,
    [productId, qty, safeRecordedBy],
  );
}

async function restoreStockForOrder(
  productId,
  quantityUsed,
  recordedBy = null,
  connection = db,
) {
  const qty = Number(quantityUsed) || 0;
  if (qty <= 0) return;
  const safeRecordedBy = await resolveRecordedByAdminId(recordedBy, connection);

  await connection.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT p.id, COALESCE(p.quantity, 0), COALESCE(p.quantity, 0), p.name
     FROM products p
     WHERE p.id = ?
       AND NOT EXISTS (
         SELECT 1 FROM Inventory i WHERE i.Product_ID = p.id
       )`,
    [productId],
  );

  await connection.query(
    `UPDATE Inventory
     SET Stock = COALESCE(Stock, 0) + ?,
         Last_Update = NOW()
     WHERE Product_ID = ?`,
    [qty, productId],
  );

  await connection.query(
    `UPDATE Menu
     SET Stock = COALESCE(Stock, 0) + ?
     WHERE Product_ID = ?`,
    [qty, productId],
  );

  await connection.query(
    `UPDATE products
     SET quantity = COALESCE(quantity, 0) + ?
     WHERE id = ?`,
    [qty, productId],
  );

  await connection.query(
    `INSERT INTO Stock_Status (Product_ID, Type, Quantity, Status_Date, RecordedBy)
     VALUES (?, 'Stock In', ?, NOW(), ?)`,
    [productId, qty, safeRecordedBy],
  );
}

async function getOrderIngredientDeductions(orderId, connection) {
  const hasItemTypeColumn = await ensureProductsItemTypeSchema(connection);
  const orderedItemTypeExpr = getProductItemTypeExpression(
    hasItemTypeColumn,
    "p",
    "m",
  );
  const [items] = await connection.query(
    `SELECT
       oi.Product_ID AS productId,
       oi.Quantity AS quantity,
       COALESCE(m.manual_override, 0) AS manual_override,
       COALESCE(m.manual_status, '') AS manual_status,
       COALESCE(p.availability_status, 'Available') AS availability_status,
       ${orderedItemTypeExpr} AS item_type
     FROM order_item oi
     LEFT JOIN Menu m ON m.Product_ID = oi.Product_ID
     LEFT JOIN products p ON p.id = oi.Product_ID
     WHERE oi.Order_ID = ?`,
    [orderId],
  );

  const menuProductIds = items
    .map((item) => Number(item.productId) || 0)
    .filter((productId) => productId > 0);
  const ingredientMap = await fetchMenuIngredients(connection, menuProductIds);
  const deductions = new Map();

  for (const item of items) {
    const productId = Number(item.productId) || 0;
    const orderedQty = Number(item.quantity) || 0;
    const isForceAvailable = isForceAvailableMenuItem(item);

    if (productId <= 0 || orderedQty <= 0) {
      throw new Error(
        `Invalid order item for stock deduction on order ${Number(orderId) || 0}`,
      );
    }
    if (String(item.item_type || MENU_ITEM).trim().toLowerCase() !== MENU_ITEM) {
      throw new Error(
        `Order item ${productId} must be ${MENU_ITEM}, found ${String(item.item_type || "").trim().toLowerCase() || "unknown"}.`,
      );
    }

    if (isForceAvailable) {
      console.warn(
        `[inventoryService] Skipping stock deduction for force-available menu product ${productId}.`,
      );
      continue;
    }

    const ingredients = ingredientMap.get(productId) ?? [];
    if (ingredients.length === 0) {
      throw new Error(
        `Menu item has no ingredient mapping. Product ${productId}.`,
      );
    }

    for (const ingredient of ingredients) {
      const ingredientProductId = Number(ingredient.product_id) || 0;
      const quantityRequired = Number(ingredient.quantity_required) || 0;
      const ingredientItemType = String(ingredient.item_type || STOCK_ITEM);
      if (ingredientProductId <= 0 || quantityRequired <= 0) {
        throw new Error(
          `Invalid ingredient configuration for menu product ${productId}`,
        );
      }
      if (ingredientItemType !== STOCK_ITEM) {
        throw new Error(
          `Ingredient product ${ingredientProductId} must be ${STOCK_ITEM}, found ${ingredientItemType}.`,
        );
      }
      const totalRequired = orderedQty * quantityRequired;
      const currentRequiredQty = Number(
        deductions.get(ingredientProductId) ?? 0,
      );
      deductions.set(ingredientProductId, currentRequiredQty + totalRequired);
    }
  }

  return deductions;
}

async function deductStockForPaidOrder(
  orderId,
  recordedBy = null,
  connection = null,
) {
  const numericOrderId = Number(orderId) || 0;
  if (numericOrderId <= 0) {
    throw new Error("Invalid order ID for stock deduction");
  }

  let conn = connection;
  let ownsConnection = false;
  let txStarted = false;

  try {
    if (!conn) {
      conn = await db.getConnection();
      ownsConnection = true;
      await conn.beginTransaction();
      txStarted = true;
    }

    const [orderRows] = await conn.query(
      `SELECT
         Order_ID AS orderId,
         Status AS orderStatus,
         payment_status AS paymentStatus,
         COALESCE(stock_deducted, 0) AS stockDeducted
       FROM orders
       WHERE Order_ID = ?
       LIMIT 1
       FOR UPDATE`,
      [numericOrderId],
    );

    if (!orderRows.length) {
      throw new Error("Order not found for stock deduction");
    }

    const order = orderRows[0];
    if (!isPaidPaymentStatus(order.paymentStatus)) {
      console.info(
        `[inventoryService] Order ${numericOrderId} stock deduction skipped: payment is not confirmed as paid yet.`,
      );
      return false;
    }
    if (Number(order.stockDeducted) === 1) {
      console.info(
        `[inventoryService] Order ${numericOrderId} stock deduction skipped: order already deducted.`,
      );
      return false;
    }

    const deductions = await getOrderIngredientDeductions(numericOrderId, conn);
    const deductionEntries = Array.from(deductions.entries());
    for (const [productId, requiredQty] of deductionEntries) {
      const [inventoryRows] = await conn.query(
        `SELECT COALESCE(Stock, 0) AS mainStock
         FROM Inventory
         WHERE Product_ID = ?
         LIMIT 1
         FOR UPDATE`,
        [productId],
      );

      const availableQty = Number(inventoryRows[0]?.mainStock ?? 0);

      if (availableQty < Number(requiredQty || 0)) {
        throw new Error(
          `Insufficient inventory stock for product ${productId}. Required ${Number(requiredQty || 0)}, available ${availableQty}.`,
        );
      }
    }

    for (const [productId, requiredQty] of deductionEntries) {
      const strictRequiredQty = Number(requiredQty) || 0;
      if (strictRequiredQty > 0) {
        await deductStockForOrder(productId, strictRequiredQty, recordedBy, conn);
      }
    }

    const [updateResult] = await conn.query(
      `UPDATE orders
       SET stock_deducted = 1
       WHERE Order_ID = ?
         AND COALESCE(stock_deducted, 0) = 0`,
      [numericOrderId],
    );

    if (txStarted) {
      await conn.commit();
      txStarted = false;
    }

    if (updateResult.affectedRows > 0) {
      console.info(
        `[inventoryService] Order ${numericOrderId} stock deduction recorded after payment confirmation.`,
      );
    }

    return updateResult.affectedRows > 0;
  } catch (error) {
    if (txStarted) {
      await conn.rollback();
      txStarted = false;
    }
    throw error;
  } finally {
    if (ownsConnection && conn) {
      conn.release();
    }
  }
}

async function restoreStockForRefundedOrder(
  orderId,
  recordedBy = null,
  connection = null,
) {
  const numericOrderId = Number(orderId) || 0;
  if (numericOrderId <= 0) {
    throw new Error("Invalid order ID for stock restoration");
  }

  let conn = connection;
  let ownsConnection = false;
  let txStarted = false;

  try {
    if (!conn) {
      conn = await db.getConnection();
      ownsConnection = true;
      await conn.beginTransaction();
      txStarted = true;
    }

    const [orderRows] = await conn.query(
      `SELECT
         Order_ID AS orderId,
         payment_status AS paymentStatus,
         COALESCE(stock_deducted, 0) AS stockDeducted
       FROM orders
       WHERE Order_ID = ?
       LIMIT 1
       FOR UPDATE`,
      [numericOrderId],
    );

    if (!orderRows.length) {
      throw new Error("Order not found for stock restoration");
    }

    if (Number(orderRows[0].stockDeducted) !== 1) {
      console.info(
        `[inventoryService] Order ${numericOrderId} inventory restore skipped because already restored or never deducted.`,
      );
      return false;
    }

    const deductions = await getOrderIngredientDeductions(numericOrderId, conn);
    for (const [productId, requiredQty] of deductions.entries()) {
      const strictRequiredQty = Number(requiredQty) || 0;
      if (strictRequiredQty > 0) {
        await restoreStockForOrder(
          productId,
          strictRequiredQty,
          recordedBy,
          conn,
        );
      }
    }

    const [updateResult] = await conn.query(
      `UPDATE orders
       SET stock_deducted = 0
       WHERE Order_ID = ?
         AND COALESCE(stock_deducted, 0) = 1`,
      [numericOrderId],
    );

    if (txStarted) {
      await conn.commit();
      txStarted = false;
    }

    if (updateResult.affectedRows > 0) {
      console.info(
        `[inventoryService] Order ${numericOrderId} inventory restored after refund.`,
      );
    } else {
      console.info(
        `[inventoryService] Order ${numericOrderId} inventory restore skipped because already restored.`,
      );
    }

    return updateResult.affectedRows > 0;
  } catch (error) {
    if (txStarted) {
      await conn.rollback();
      txStarted = false;
    }
    throw error;
  } finally {
    if (ownsConnection && conn) {
      conn.release();
    }
  }
}

module.exports = {
  deductStockForOrder,
  deductStockForPaidOrder,
  restoreStockForRefundedOrder,
};
