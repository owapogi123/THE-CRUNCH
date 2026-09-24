const db = require("../config/db");
const { fetchMenuIngredients } = require("../utils/menuAvailability");
const {
  MENU_ITEM,
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
} = require("../utils/productItemType");
const { normalizeOrderItems } = require("./orderItemService");

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

  const [inventoryUpdate] = await connection.query(
    `UPDATE Inventory
     SET Stock = COALESCE(Stock, 0) - ?,
         Last_Update     = NOW()
     WHERE Product_ID = ?
       AND COALESCE(Stock, 0) >= ?`,
    [qty, productId, qty],
  );
  if (inventoryUpdate.affectedRows < 1) {
    const error = new Error(
      `Insufficient inventory stock for product ${productId}.`,
    );
    error.statusCode = 409;
    throw error;
  }

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

async function buildStockRequirements(items, connection) {
  const menuProductIds = items
    .map((item) => Number(item.productId) || 0)
    .filter((productId) => productId > 0);
  const ingredientMap = await fetchMenuIngredients(connection, menuProductIds);
  const deductions = new Map();

  for (const item of items) {
    const productId = Number(item.productId) || 0;
    const orderedQty = Number(item.quantity) || 0;

    if (productId <= 0 || orderedQty <= 0) {
      throw new Error("Invalid order item for stock validation");
    }
    if (String(item.item_type || MENU_ITEM).trim().toLowerCase() !== MENU_ITEM) {
      throw new Error(
        `Order item ${productId} must be ${MENU_ITEM}, found ${String(item.item_type || "").trim().toLowerCase() || "unknown"}.`,
      );
    }

    const ingredients = ingredientMap.get(productId) ?? [];
    if (ingredients.length === 0) {
      const existing = deductions.get(productId) ?? {
        requiredQty: 0,
        name: String(item.product_name || `Product #${productId}`),
        directOrderItem: true,
      };
      existing.requiredQty += orderedQty;
      deductions.set(productId, existing);
      continue;
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
      const existing = deductions.get(ingredientProductId) ?? {
        requiredQty: 0,
        name: String(
          ingredient.product_name || `Product #${ingredientProductId}`,
        ),
        directOrderItem: false,
      };
      existing.requiredQty += orderedQty * quantityRequired;
      existing.directOrderItem = false;
      deductions.set(ingredientProductId, existing);
    }
  }

  return deductions;
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
       COALESCE(m.Product_Name, p.name, CONCAT('Product #', oi.Product_ID)) AS product_name,
       ${orderedItemTypeExpr} AS item_type
     FROM order_item oi
     LEFT JOIN Menu m ON m.Product_ID = oi.Product_ID
     LEFT JOIN products p ON p.id = oi.Product_ID
     WHERE oi.Order_ID = ?`,
    [orderId],
  );

  return buildStockRequirements(items, connection);
}

async function lockAndValidateStockRequirements(connection, deductions) {
  const productIds = Array.from(deductions.keys()).sort((a, b) => a - b);
  for (const productId of productIds) {
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
  }

  if (productIds.length === 0) return;
  const placeholders = productIds.map(() => "?").join(", ");
  const [inventoryRows] = await connection.query(
    `SELECT
       i.Product_ID AS productId,
       COALESCE(i.Stock, 0) AS mainStock
     FROM Inventory i
     WHERE i.Product_ID IN (${placeholders})
     ORDER BY i.Product_ID
     FOR UPDATE`,
    productIds,
  );
  const availableByProduct = new Map(
    inventoryRows.map((row) => [
      Number(row.productId),
      Number(row.mainStock ?? 0),
    ]),
  );

  for (const productId of productIds) {
    const requirement = deductions.get(productId);
    const requiredQty = Number(requirement?.requiredQty || 0);
    const availableQty = Number(availableByProduct.get(productId) ?? 0);
    if (availableQty < requiredQty) {
      const shownAvailable = Math.max(0, Math.floor(availableQty));
      const error = new Error(
        requirement?.directOrderItem
          ? `Only ${shownAvailable} units of "${requirement.name}" are available.`
          : `Insufficient stock for "${requirement?.name || `Product #${productId}`}". Required ${requiredQty}, available ${availableQty}.`,
      );
      error.statusCode = 409;
      throw error;
    }
  }
}

async function prepareOrderItemsAndStock(connection, items) {
  const normalizedItems = normalizeOrderItems(items);
  const productIds = normalizedItems.map((item) => item.product_id);
  await ensureProductsItemTypeSchema(connection);

  await connection.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT DISTINCT target.Product_ID, target.Stock, target.Stock, target.Product_Name
       FROM Menu ordered_menu
       LEFT JOIN menu_item_ingredients mi
         ON mi.menu_product_id = ordered_menu.Product_ID
       INNER JOIN Menu target
         ON target.Product_ID = COALESCE(mi.product_id, ordered_menu.Product_ID)
       LEFT JOIN Inventory inventory
         ON inventory.Product_ID = target.Product_ID
      WHERE ordered_menu.Product_ID IN (?)
        AND inventory.Product_ID IS NULL`,
    [productIds],
  );

  const orderedItemTypeExpr = getProductItemTypeExpression(true, "p", "m");
  const targetItemTypeExpr = getProductItemTypeExpression(
    true,
    "target_product",
    "target_menu",
  );
  const [rows] = await connection.query(
    `SELECT
       p.id AS productId,
       COALESCE(NULLIF(TRIM(m.Product_Name), ''), p.name) AS productName,
       COALESCE(m.Price, p.price, 0) AS currentPrice,
       COALESCE(m.manual_override, 0) AS manualOverride,
       COALESCE(m.manual_status, 'Available') AS manualStatus,
       ${orderedItemTypeExpr} AS itemType,
       mi.product_id AS ingredientProductId,
       mi.quantity_required AS ingredientQuantityRequired,
       COALESCE(
         target_product.name,
         target_menu.Product_Name,
         CONCAT('Product #', COALESCE(mi.product_id, p.id))
       ) AS stockProductName,
       ${targetItemTypeExpr} AS stockItemType,
       inventory.Product_ID AS inventoryProductId,
       COALESCE(inventory.Stock, 0) AS availableStock
     FROM products p
     LEFT JOIN Menu m ON m.Product_ID = p.id
     LEFT JOIN menu_item_ingredients mi ON mi.menu_product_id = p.id
     LEFT JOIN products target_product
       ON target_product.id = COALESCE(mi.product_id, p.id)
     LEFT JOIN Menu target_menu
       ON target_menu.Product_ID = COALESCE(mi.product_id, p.id)
     LEFT JOIN Inventory inventory
       ON inventory.Product_ID = COALESCE(mi.product_id, p.id)
     WHERE p.id IN (?)
     ORDER BY p.id, mi.product_id
     FOR UPDATE`,
    [productIds],
  );

  const rowsByProduct = new Map();
  for (const row of rows) {
    const productId = Number(row.productId);
    const current = rowsByProduct.get(productId) ?? [];
    current.push(row);
    rowsByProduct.set(productId, current);
  }

  const deductions = new Map();
  const authoritativeItems = normalizedItems.map((item) => {
    const productRows = rowsByProduct.get(item.product_id) ?? [];
    if (productRows.length === 0) {
      const error = new Error(`Unknown product_id ${item.product_id}`);
      error.statusCode = 400;
      throw error;
    }
    const product = productRows[0];
    const price = Number(product.currentPrice);
    if (!Number.isFinite(price) || price < 0) {
      const error = new Error(
        `Product ${item.product_id} does not have a valid price`,
      );
      error.statusCode = 400;
      throw error;
    }
    if (String(product.itemType || "").trim().toLowerCase() !== MENU_ITEM) {
      const error = new Error(
        `Order item ${item.product_id} must be ${MENU_ITEM}, found ${String(product.itemType || "").trim().toLowerCase() || "unknown"}.`,
      );
      error.statusCode = 400;
      throw error;
    }
    const isForcedOut =
      Number(product.manualOverride) === 1 &&
      ["out of stock", "unavailable"].includes(
        String(product.manualStatus || "").trim().toLowerCase(),
      );
    if (isForcedOut) {
      const error = new Error(`"${product.productName}" is unavailable.`);
      error.statusCode = 409;
      throw error;
    }

    const ingredientRows = productRows.filter(
      (row) => Number(row.ingredientProductId) > 0,
    );
    const stockRows = ingredientRows.length > 0 ? ingredientRows : [product];
    for (const stockRow of stockRows) {
      const stockProductId =
        Number(stockRow.ingredientProductId) || item.product_id;
      const quantityRequired = ingredientRows.length > 0
        ? Number(stockRow.ingredientQuantityRequired)
        : 1;
      if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
        throw new Error(
          `Invalid ingredient configuration for menu product ${item.product_id}`,
        );
      }
      if (
        ingredientRows.length > 0 &&
        String(stockRow.stockItemType || "").trim().toLowerCase() !== STOCK_ITEM
      ) {
        throw new Error(
          `Ingredient product ${stockProductId} must be ${STOCK_ITEM}, found ${String(stockRow.stockItemType || "").trim().toLowerCase() || "unknown"}.`,
        );
      }
      const existing = deductions.get(stockProductId) ?? {
        requiredQty: 0,
        name: String(stockRow.stockProductName || `Product #${stockProductId}`),
        directOrderItem: ingredientRows.length === 0,
        availableQty: Number(stockRow.availableStock || 0),
      };
      existing.requiredQty += item.qty * quantityRequired;
      existing.directOrderItem =
        existing.directOrderItem && ingredientRows.length === 0;
      deductions.set(stockProductId, existing);
    }

    return {
      product_id: item.product_id,
      qty: item.qty,
      name: String(product.productName || `Product #${item.product_id}`),
      price,
      subtotal: price * item.qty,
    };
  });

  for (const [productId, requirement] of deductions) {
    const availableQty = Number(requirement.availableQty || 0);
    if (availableQty < Number(requirement.requiredQty || 0)) {
      const shownAvailable = Math.max(0, Math.floor(availableQty));
      const error = new Error(
        requirement.directOrderItem
          ? `Only ${shownAvailable} units of "${requirement.name}" are available.`
          : `Insufficient stock for "${requirement.name}". Required ${requirement.requiredQty}, available ${availableQty}.`,
      );
      error.statusCode = 409;
      throw error;
    }
  }

  return { authoritativeItems, deductions };
}

function buildQuantityCase(entries, columnName) {
  return {
    sql: `CASE ${columnName} ${entries.map(() => "WHEN ? THEN ?").join(" ")} ELSE 0 END`,
    params: entries.flatMap(([productId, requirement]) => [
      productId,
      Number(requirement.requiredQty),
    ]),
  };
}

async function applyStockDeductions(
  connection,
  deductions,
  recordedByAdminId,
) {
  const entries = Array.from(deductions.entries())
    .filter(([, requirement]) => Number(requirement?.requiredQty) > 0)
    .sort(([left], [right]) => Number(left) - Number(right));
  if (entries.length === 0) return;

  const inventoryCase = buildQuantityCase(entries, "i.Product_ID");
  const menuCase = buildQuantityCase(entries, "m.Product_ID");
  const productCase = buildQuantityCase(entries, "p.id");
  const productIds = entries.map(([productId]) => productId);
  await connection.query(
    `UPDATE Inventory i
     INNER JOIN Menu m ON m.Product_ID = i.Product_ID
     INNER JOIN products p ON p.id = i.Product_ID
     SET i.Stock = COALESCE(i.Stock, 0) - ${inventoryCase.sql},
         i.Last_Update = NOW(),
         m.Stock = GREATEST(COALESCE(m.Stock, 0) - ${menuCase.sql}, 0),
         p.quantity = GREATEST(COALESCE(p.quantity, 0) - ${productCase.sql}, 0)
     WHERE i.Product_ID IN (?)`,
    [
      ...inventoryCase.params,
      ...menuCase.params,
      ...productCase.params,
      productIds,
    ],
  );

  const valuesSql = entries.map(() => "(?, 'Stock Out', ?, NOW(), ?)").join(", ");
  const values = entries.flatMap(([productId, requirement]) => [
    productId,
    Number(requirement.requiredQty),
    recordedByAdminId,
  ]);
  await connection.query(
    `INSERT INTO Stock_Status
       (Product_ID, Type, Quantity, Status_Date, RecordedBy)
     VALUES ${valuesSql}`,
    values,
  );
}

async function deductPrevalidatedStockForPaidOrder(
  orderId,
  paymentStatus,
  deductions,
  recordedByAdminId,
  connection,
) {
  if (!isPaidPaymentStatus(paymentStatus)) {
    throw new Error("Prevalidated stock deduction requires a paid order");
  }
  await applyStockDeductions(connection, deductions, recordedByAdminId);
  const [updateResult] = await connection.query(
    `UPDATE orders
     SET stock_deducted = 1
     WHERE Order_ID = ?
       AND COALESCE(stock_deducted, 0) = 0`,
    [orderId],
  );
  if (updateResult.affectedRows !== 1) {
    const error = new Error("Order stock was already deducted");
    error.statusCode = 409;
    throw error;
  }
  return true;
}

async function validateStockForOrderItems(items, connection) {
  const hasItemTypeColumn = await ensureProductsItemTypeSchema(connection);
  const itemTypeExpr = getProductItemTypeExpression(
    hasItemTypeColumn,
    "p",
    "m",
  );
  const productIds = items.map((item) => Number(item.product_id));
  const placeholders = productIds.map(() => "?").join(", ");
  const [productRows] = await connection.query(
    `SELECT
       p.id AS productId,
       COALESCE(m.Product_Name, p.name, CONCAT('Product #', p.id)) AS product_name,
       COALESCE(m.manual_override, 0) AS manual_override,
       COALESCE(m.manual_status, 'Available') AS manual_status,
       ${itemTypeExpr} AS item_type
     FROM products p
     LEFT JOIN Menu m ON m.Product_ID = p.id
     WHERE p.id IN (${placeholders})`,
    productIds,
  );
  const productsById = new Map(
    productRows.map((row) => [Number(row.productId), row]),
  );
  const stockItems = items.map((item) => {
    const product = productsById.get(Number(item.product_id));
    if (!product) {
      const error = new Error(`Unknown product_id ${item.product_id}`);
      error.statusCode = 400;
      throw error;
    }
    const isForcedOut =
      Number(product.manual_override) === 1 &&
      ["out of stock", "unavailable"].includes(
        String(product.manual_status || "").trim().toLowerCase(),
      );
    if (isForcedOut) {
      const error = new Error(`"${product.product_name}" is unavailable.`);
      error.statusCode = 409;
      throw error;
    }
    return {
      ...product,
      quantity: Number(item.qty),
    };
  });
  const deductions = await buildStockRequirements(stockItems, connection);
  await lockAndValidateStockRequirements(connection, deductions);
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
    await lockAndValidateStockRequirements(conn, deductions);

    for (const [productId, requirement] of deductionEntries) {
      const strictRequiredQty = Number(requirement?.requiredQty) || 0;
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
    for (const [productId, requirement] of deductions.entries()) {
      const strictRequiredQty = Number(requirement?.requiredQty) || 0;
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
  deductPrevalidatedStockForPaidOrder,
  prepareOrderItemsAndStock,
  restoreStockForRefundedOrder,
  validateStockForOrderItems,
};
