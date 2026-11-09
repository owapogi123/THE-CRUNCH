const db = require("../config/db");
const {
  fetchMenuIngredients,
  isAutoMenuMissingIngredients,
} = require("../utils/menuAvailability");
const {
  MENU_ITEM,
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
} = require("../utils/productItemType");
const { normalizeOrderItems } = require("./orderItemService");
const {
  CHICKEN_FLAVORS_SYSTEM_KEY,
  MENU_FOOD_SYSTEM_KEY,
  normalizeSystemKey,
} = require("./systemMenuCategoryService");
const {
  applyRedesignedInventoryMutation,
  executeRedesignedInventoryMutation,
} = require("./redesignedInventoryMutationService");
const {
  reconcileInventoryAlerts,
} = require("./inventoryNotificationService");

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

// Read-only redesigned inventory projection. Stock mutations intentionally
// remain on the existing legacy path until Phase 2B.2.
async function listRedesignedInventoryRows(connection = db) {
  const [rows] = await connection.query(
    `SELECT
       p.product_id AS inventory_id,
       p.product_id AS product_id,
       p.name AS product_name,
       COALESCE(category.name, 'Uncategorized') AS category,
       COALESCE(NULLIF(TRIM(unit.abbreviation), ''), unit.name, 'piece') AS unit,
       COALESCE(balance.on_hand, 0) AS mainStock,
       COALESCE(balance.on_hand, 0) AS quantity,
       p.name AS item_purchased,
       COALESCE(balance.updated_at, p.updated_at) AS last_update,
       COALESCE(balance.reorder_point, 0) AS reorderPoint,
       COALESCE(balance.critical_point, 0) AS criticalPoint,
       0 AS useDefaultThresholds,
       COALESCE(balance.reorder_point, 0) AS lowStockThreshold,
       COALESCE(balance.critical_point, 0) AS criticalStockThreshold,
       'No Supplier' AS supplier_name,
       0 AS dailyWithdrawn,
       COALESCE(movement.returned, 0) AS returned,
       COALESCE(movement.wasted, 0) AS wasted,
       COALESCE(movement.soldToday, 0) AS soldToday,
       batch.nearestExpiry AS expiryDate,
       batch.nearestUsableUntil AS usableUntil,
       p.shelf_life_days AS shelfLifeDays,
       NULL AS shelfLifeMonths,
       NULL AS shelfLifeHours,
       p.product_id AS id,
       p.name AS name,
       COALESCE(balance.on_hand, 0) AS stock,
       '0' AS price,
       p.product_type AS item_type,
       p.product_type AS product_type,
       COALESCE(p.description, '') AS description,
       '' AS promo,
       CASE WHEN category.system_key = 'raw_materials' THEN 1 ELSE 0 END AS isRawMaterial,
       CASE
         WHEN p.image_url LIKE 'data:image%' THEN '/img/placeholder.jpg'
         WHEN COALESCE(TRIM(p.image_url), '') = '' THEN '/img/placeholder.jpg'
         ELSE p.image_url
       END AS image,
       CONCAT('M-', LPAD(p.product_id, 3, '0')) AS menu_code,
       CASE
         WHEN p.lifecycle_status = 'archived' THEN 'Hidden'
         WHEN p.lifecycle_status = 'inactive'
           OR p.availability_override = 'unavailable'
           OR COALESCE(balance.on_hand, 0) <= 0
           THEN 'Out of Stock'
         ELSE 'Available'
       END AS availability_status,
       0 AS is_promotional,
       NULL AS promo_price,
       '' AS promo_label,
       CASE WHEN p.availability_override = 'unavailable' THEN 1 ELSE 0 END AS manual_override,
       CASE
         WHEN p.availability_override = 'unavailable' THEN 'Out of Stock'
         ELSE 'Available'
       END AS manual_status,
       NULL AS available_servings,
       0 AS ingredient_count,
       p.tracking_method,
       p.lifecycle_status,
       p.availability_override,
       COALESCE(batch.activeBatchStock, 0) AS activeBatchStock
     FROM products p
     LEFT JOIN inventory_balances balance
       ON balance.product_id = p.product_id
     LEFT JOIN inventory_categories category
       ON category.category_id = p.inventory_category_id
     LEFT JOIN units unit ON unit.unit_id = p.unit_id
     LEFT JOIN (
       SELECT
         product_id,
         SUM(CASE
           WHEN movement_type = 'return_in' AND signed_quantity > 0
             THEN signed_quantity
           ELSE 0
         END) AS returned,
         SUM(CASE
           WHEN movement_type = 'spoilage' AND signed_quantity < 0
             THEN -signed_quantity
           ELSE 0
         END) AS wasted,
         SUM(CASE
           WHEN movement_type = 'sale'
            AND occurred_at >= CURDATE()
            AND occurred_at < CURDATE() + INTERVAL 1 DAY
            AND signed_quantity < 0
             THEN -signed_quantity
           ELSE 0
         END) AS soldToday
       FROM stock_movements
       GROUP BY product_id
     ) movement ON movement.product_id = p.product_id
     LEFT JOIN (
       SELECT
         product_id,
         MIN(CASE
           WHEN status = 'active' AND remaining_quantity > 0
             THEN expiry_at
           ELSE NULL
         END) AS nearestExpiry,
         MIN(CASE
           WHEN status = 'active' AND remaining_quantity > 0
             THEN usable_until
           ELSE NULL
         END) AS nearestUsableUntil,
         SUM(CASE
           WHEN status = 'active' AND remaining_quantity > 0
             THEN remaining_quantity
           ELSE 0
         END) AS activeBatchStock
       FROM inventory_batches
       GROUP BY product_id
     ) batch ON batch.product_id = p.product_id
     WHERE p.product_type = 'stock_item'
     ORDER BY p.product_id ASC`,
  );
  return rows;
}

async function listRedesignedInventoryAlertRows(connection = db) {
  const [rows] = await connection.query(
    `SELECT
       p.product_id AS inventory_id,
       p.product_id AS product_id,
       p.name AS product_name,
       COALESCE(category.name, 'Uncategorized') AS category,
       COALESCE(NULLIF(TRIM(unit.abbreviation), ''), unit.name, 'piece') AS unit,
       COALESCE(balance.on_hand, 0) AS mainStock,
       0 AS useDefaultThresholds,
       COALESCE(balance.reorder_point, 0) AS lowStockThreshold,
       COALESCE(balance.critical_point, 0) AS criticalStockThreshold,
       p.product_type AS item_type
     FROM products p
     LEFT JOIN inventory_balances balance
       ON balance.product_id = p.product_id
     LEFT JOIN inventory_categories category
       ON category.category_id = p.inventory_category_id
     LEFT JOIN units unit ON unit.unit_id = p.unit_id
     WHERE p.product_type = 'stock_item'
       AND p.lifecycle_status <> 'archived'
     ORDER BY p.name ASC`,
  );
  return rows;
}

async function refreshRedesignedInventoryAlerts(database = db) {
  const rows = await listRedesignedInventoryAlertRows(database);
  const items = rows.map((row) => {
    const stock = Number(row.mainStock) || 0;
    const low = Math.max(0, Number(row.lowStockThreshold) || 0);
    const critical = Math.min(
      low,
      Math.max(0, Number(row.criticalStockThreshold) || 0),
    );
    const severity = stock <= 0
      ? "out"
      : stock <= critical
        ? "critical"
        : stock <= low
          ? "low"
          : "normal";
    return {
      inventory_id: Number(row.inventory_id),
      product_id: Number(row.product_id),
      product_name: String(row.product_name || ""),
      category: String(row.category || ""),
      unit: String(row.unit || "piece"),
      mainStock: stock,
      severity,
      thresholds: { low, critical },
    };
  });
  return reconcileInventoryAlerts(database, items);
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

// Shared helper used by paid order activation flows.
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

async function buildStockRequirements(
  items,
  connection,
  { enforceAutoRecipe = false } = {},
) {
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
      if (enforceAutoRecipe && isAutoMenuMissingIngredients(item, ingredients)) {
        const error = new Error(
          `"${String(item.product_name || `Product #${productId}`)}" is unavailable because no ingredients are configured.`,
        );
        error.statusCode = 409;
        throw error;
      }
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

async function getOrderIngredientDeductions(
  orderId,
  connection,
  { enforceAutoRecipe = false } = {},
) {
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
       COALESCE(m.manual_override, 0) AS manual_override,
       COALESCE(m.manual_status, 'Available') AS manual_status,
       ${orderedItemTypeExpr} AS item_type
     FROM order_item oi
     LEFT JOIN Menu m ON m.Product_ID = oi.Product_ID
     LEFT JOIN products p ON p.id = oi.Product_ID
     WHERE oi.Order_ID = ?`,
    [orderId],
  );

  return buildStockRequirements(items, connection, {
    enforceAutoRecipe,
  });
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

async function prepareOrderItemsAndStock(
  connection,
  items,
  { requireChickenFlavorForMenuFood = false } = {},
) {
  const requestedItems = normalizeOrderItems(items);
  const recipeItems = requestedItems.flatMap((item, selectionIndex) => [
    { ...item, selectionIndex, selectionRole: "base" },
    ...(item.selected_flavor_product_id
      ? [{
          product_id: item.selected_flavor_product_id,
          qty: item.qty,
          selectionIndex,
          selectionRole: "flavor",
        }]
      : []),
  ]);
  const productIds = [...new Set(recipeItems.map((item) => item.product_id))];
  const baseProductIds = [...new Set(
    recipeItems
      .filter((item) => item.selectionRole === "base")
      .map((item) => item.product_id),
  )];
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
    [baseProductIds],
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
       p.availability_status AS availabilityStatus,
       COALESCE(m.manual_override, 0) AS manualOverride,
       COALESCE(m.manual_status, 'Available') AS manualStatus,
       mc.system_key AS categorySystemKey,
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
     LEFT JOIN menu_categories mc
       ON LOWER(TRIM(mc.name)) = LOWER(TRIM(m.Category_Name))
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
  const preparedRecipeItems = recipeItems.map((item) => {
    const productRows = rowsByProduct.get(item.product_id) ?? [];
    if (productRows.length === 0) {
      const error = new Error(`Unknown product_id ${item.product_id}`);
      error.statusCode = 400;
      throw error;
    }
    const product = productRows[0];
    const categorySystemKey = normalizeSystemKey(product.categorySystemKey);
    if (
      item.selectionRole === "flavor" &&
      categorySystemKey !== CHICKEN_FLAVORS_SYSTEM_KEY
    ) {
      const error = new Error(
        `Product ${item.product_id} is not an eligible chicken flavor.`,
      );
      error.statusCode = 409;
      throw error;
    }
    if (
      item.selectionRole === "base" &&
      requireChickenFlavorForMenuFood &&
      categorySystemKey === MENU_FOOD_SYSTEM_KEY &&
      !item.selected_flavor_product_id
    ) {
      const error = new Error(
        `Choose one chicken flavor for "${product.productName}" before checkout.`,
      );
      error.statusCode = 400;
      throw error;
    }
    if (
      String(product.availabilityStatus || "")
        .trim()
        .toLowerCase() === "hidden"
    ) {
      const error = new Error(
        `"${product.productName}" is archived and cannot be ordered.`,
      );
      error.statusCode = 409;
      throw error;
    }
    if (item.selectionRole === "flavor") {
      return {
        product_id: item.product_id,
        qty: item.qty,
        name: String(product.productName || `Product #${item.product_id}`),
        price: 0,
        subtotal: 0,
        selectionIndex: item.selectionIndex,
        selectionRole: item.selectionRole,
      };
    }
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
    if (isAutoMenuMissingIngredients(product, ingredientRows)) {
      const error = new Error(
        `"${product.productName}" is unavailable because no ingredients are configured.`,
      );
      error.statusCode = 409;
      throw error;
    }
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
      selectionIndex: item.selectionIndex,
      selectionRole: item.selectionRole,
    };
  });

  const authoritativeItems = requestedItems.map((item, selectionIndex) => {
    const base = preparedRecipeItems.find(
      (prepared) =>
        prepared.selectionIndex === selectionIndex &&
        prepared.selectionRole === "base",
    );
    const flavor = preparedRecipeItems.find(
      (prepared) =>
        prepared.selectionIndex === selectionIndex &&
        prepared.selectionRole === "flavor",
    );
    return {
      product_id: base.product_id,
      qty: base.qty,
      name: base.name,
      price: base.price,
      subtotal: base.subtotal,
      ...(flavor
        ? {
            selected_flavor_product_id: flavor.product_id,
            selected_flavor_name: flavor.name,
          }
        : {}),
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

function getDeductionSnapshotEntries(deductions) {
  const entries = Array.from(deductions.entries())
    .map(([productId, requirement]) => [
      Number(productId),
      Number(requirement?.requiredQty),
    ])
    .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
    .sort(([left], [right]) => left - right);

  if (
    entries.length === 0 ||
    entries.some(([productId]) => !Number.isSafeInteger(productId) || productId <= 0)
  ) {
    const error = new Error("Order does not have a valid inventory deduction plan");
    error.statusCode = 409;
    error.code = "ORDER_DEDUCTION_SNAPSHOT_INVALID";
    throw error;
  }
  return entries;
}

async function recordOrderDeductionSnapshot(connection, orderId, deductions) {
  const entries = getDeductionSnapshotEntries(deductions);
  const valuesSql = entries.map(() => "(?, ?, ?)").join(", ");
  const values = entries.flatMap(([productId, quantity]) => [
    Number(orderId),
    productId,
    quantity,
  ]);
  try {
    await connection.query(
      `INSERT INTO order_inventory_deductions (order_id, product_id, quantity)
       VALUES ${valuesSql}`,
      values,
    );
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      const conflict = new Error(
        "Inventory deduction records already exist for this order",
      );
      conflict.statusCode = 409;
      conflict.code = "ORDER_DEDUCTION_SNAPSHOT_CONFLICT";
      throw conflict;
    }
    throw error;
  }
  return entries;
}

function createRefundSnapshotReviewError(reason) {
  const error = new Error(
    `Original inventory deduction records are ${reason}. Manual inventory review is required before refunding this order.`,
  );
  error.statusCode = 409;
  error.code = "REFUND_INVENTORY_RECONCILIATION_REQUIRED";
  return error;
}

async function loadOrderDeductionSnapshot(connection, orderId) {
  const [rows] = await connection.query(
    `SELECT
       d.product_id AS productId,
       d.quantity AS quantity,
       i.Product_ID AS inventoryProductId,
       m.Product_ID AS menuProductId,
       p.id AS productMirrorId
     FROM order_inventory_deductions d
     LEFT JOIN Inventory i ON i.Product_ID = d.product_id
     LEFT JOIN Menu m ON m.Product_ID = d.product_id
     LEFT JOIN products p ON p.id = d.product_id
     WHERE d.order_id = ?
     ORDER BY d.product_id
     FOR UPDATE`,
    [Number(orderId)],
  );

  if (rows.length === 0) {
    throw createRefundSnapshotReviewError("missing");
  }

  const deductions = new Map();
  for (const row of rows) {
    const productId = Number(row.productId);
    const quantity = Number(row.quantity);
    const hasAllMirrors =
      Number(row.inventoryProductId) === productId &&
      Number(row.menuProductId) === productId &&
      Number(row.productMirrorId) === productId;
    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      deductions.has(productId) ||
      !hasAllMirrors
    ) {
      throw createRefundSnapshotReviewError("inconsistent");
    }
    deductions.set(productId, {
      requiredQty: quantity,
      name: `Product #${productId}`,
    });
  }
  return deductions;
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

async function applyStockRestorations(
  connection,
  deductions,
  recordedByAdminId,
) {
  const entries = Array.from(deductions.entries())
    .filter(([, requirement]) => Number(requirement?.requiredQty) > 0)
    .sort(([left], [right]) => Number(left) - Number(right));
  if (entries.length === 0) return;

  const productIds = entries.map(([productId]) => productId);
  await connection.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     SELECT p.id, COALESCE(p.quantity, 0), COALESCE(p.quantity, 0), p.name
     FROM products p
     LEFT JOIN Inventory i ON i.Product_ID = p.id
     WHERE p.id IN (?)
       AND i.Product_ID IS NULL`,
    [productIds],
  );

  const inventoryCase = buildQuantityCase(entries, "i.Product_ID");
  const menuCase = buildQuantityCase(entries, "m.Product_ID");
  const productCase = buildQuantityCase(entries, "p.id");
  await connection.query(
    `UPDATE Inventory i
     LEFT JOIN Menu m ON m.Product_ID = i.Product_ID
     LEFT JOIN products p ON p.id = i.Product_ID
     SET i.Stock = COALESCE(i.Stock, 0) + ${inventoryCase.sql},
         i.Last_Update = NOW(),
         m.Stock = COALESCE(m.Stock, 0) + ${menuCase.sql},
         p.quantity = COALESCE(p.quantity, 0) + ${productCase.sql}
     WHERE i.Product_ID IN (?)`,
    [
      ...inventoryCase.params,
      ...menuCase.params,
      ...productCase.params,
      productIds,
    ],
  );

  const valuesSql = entries.map(() => "(?, 'Stock In', ?, NOW(), ?)").join(", ");
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
  await recordOrderDeductionSnapshot(connection, orderId, deductions);
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
  const deductions = await buildStockRequirements(stockItems, connection, {
    enforceAutoRecipe: true,
  });
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
    if (String(order.orderStatus || "").trim().toLowerCase() !== "queued") {
      console.info(
        `[inventoryService] Order ${numericOrderId} stock deduction skipped: order is not queued for preparation.`,
      );
      return false;
    }
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

    const deductions = await getOrderIngredientDeductions(numericOrderId, conn, {
      enforceAutoRecipe: true,
    });
    const deductionEntries = Array.from(deductions.entries());
    await lockAndValidateStockRequirements(conn, deductions);
    await recordOrderDeductionSnapshot(conn, numericOrderId, deductions);

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

    if (updateResult.affectedRows !== 1) {
      const error = new Error("Order stock was already deducted");
      error.statusCode = 409;
      throw error;
    }

    if (txStarted) {
      await conn.commit();
      txStarted = false;
    }

    console.info(
      `[inventoryService] Order ${numericOrderId} stock deduction recorded after paid queue acceptance.`,
    );
    return true;
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
      throw new Error("Order not found for stock restoration");
    }

    if (String(orderRows[0].orderStatus || "").trim().toLowerCase() !== "refunded") {
      const error = new Error("Inventory can only be restored for a successfully refunded order");
      error.statusCode = 409;
      throw error;
    }

    if (Number(orderRows[0].stockDeducted) !== 1) {
      console.info(
        `[inventoryService] Order ${numericOrderId} inventory restore skipped because already restored or never deducted.`,
      );
      return false;
    }

    const deductions = await loadOrderDeductionSnapshot(conn, numericOrderId);
    const recordedByAdminId = await resolveRecordedByAdminId(recordedBy, conn);
    await applyStockRestorations(conn, deductions, recordedByAdminId);

    const [updateResult] = await conn.query(
      `UPDATE orders
       SET stock_deducted = 0
       WHERE Order_ID = ?
         AND COALESCE(stock_deducted, 0) = 1`,
      [numericOrderId],
    );

    if (updateResult.affectedRows !== 1) {
      const error = new Error("Order inventory was already restored");
      error.statusCode = 409;
      throw error;
    }

    if (txStarted) {
      await conn.commit();
      txStarted = false;
    }

    console.info(
      `[inventoryService] Order ${numericOrderId} inventory restored after refund.`,
    );
    return true;
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
  applyRedesignedInventoryMutation,
  deductStockForOrder,
  deductStockForPaidOrder,
  deductPrevalidatedStockForPaidOrder,
  executeRedesignedInventoryMutation,
  getOrderIngredientDeductions,
  listRedesignedInventoryAlertRows,
  listRedesignedInventoryRows,
  prepareOrderItemsAndStock,
  refreshRedesignedInventoryAlerts,
  restoreStockForRefundedOrder,
  validateStockForOrderItems,
};
