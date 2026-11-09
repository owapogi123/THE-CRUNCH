const {
  MENU_ITEM,
  SELECTION_OPTION,
  STOCK_ITEM,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
} = require("./productItemType");
const { assertTableColumns } = require("../services/schemaAssertions");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("../db/schemaProfile");

const availabilitySchemaReady = new Set();
const availabilitySchemaPromises = new Map();

const REDESIGNED_AVAILABILITY_SCHEMA_CONTRACT = {
  products: [
    "product_id", "product_type", "unit_id", "lifecycle_status",
    "availability_override", "tracking_method",
  ],
  product_recipes: [
    "parent_product_id", "ingredient_product_id", "quantity_required", "unit_id",
  ],
  inventory_balances: ["product_id", "on_hand"],
  units: ["unit_id", "name", "abbreviation"],
  inventory_batches: [
    "batch_id", "product_id", "remaining_quantity", "expiry_at",
    "usable_until", "status",
  ],
};

function isRedesignedProfile(profile = getSchemaProfile()) {
  return profile === REDESIGNED_SCHEMA_PROFILE;
}

function getRowItemType(row = {}) {
  return String(
    row.product_type ??
      row.productType ??
      row.item_type ??
      row.itemType ??
      MENU_ITEM,
  )
    .trim()
    .toLowerCase();
}

async function hasColumn(db, tableName, columnName) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [
    columnName,
  ]);
  return rows.length > 0;
}

function normalizeManualStatus(value) {
  const normalized = String(value ?? "Available").trim().toLowerCase();
  return normalized === "out of stock" || normalized === "unavailable"
    ? "Out of Stock"
    : "Available";
}

function isManualOverrideEnabled(row = {}) {
  if (
    String(row.availability_override ?? row.availabilityOverride ?? "")
      .trim()
      .toLowerCase() === "unavailable"
  ) {
    return true;
  }

  const overrideEnabled =
    Number(row.manual_override ?? row.manualOverride ?? 0) === 1;
  const status = normalizeManualStatus(
    row.manual_status ?? row.manualStatus ?? "Available",
  );

  // "Force Available" is no longer a supported mode. Treat legacy rows with
  // manual_override=1/manual_status=Available as Auto at runtime, without
  // mutating production data. A reviewed data migration can normalize those
  // rows later after the production backup/approval process is complete.
  return overrideEnabled && status === "Out of Stock";
}

function computeAvailableServings(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return null;
  }

  let servings = Number.POSITIVE_INFINITY;
  for (const ingredient of ingredients) {
    const quantityRequired = Number(ingredient.quantity_required ?? 0);
    if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
      return 0;
    }
    const availableStock = Number(ingredient.stock ?? 0);
    servings = Math.min(servings, availableStock / quantityRequired);
  }

  return Number.isFinite(servings) ? servings : null;
}

function isAutoMenuMissingIngredients(row = {}, ingredients = []) {
  const itemType = getRowItemType(row);
  return (
    itemType === "menu_item" &&
    !isManualOverrideEnabled(row) &&
    ingredients.length === 0
  );
}

function resolveProductAvailabilityStatus(row = {}, ingredients = []) {
  const lifecycleStatus = String(
    row.lifecycle_status ?? row.lifecycleStatus ?? "active",
  )
    .trim()
    .toLowerCase();
  if (lifecycleStatus === "archived") return "Hidden";
  if (lifecycleStatus === "inactive") return "Out of Stock";

  const storedAvailability = String(
    row.availability_status ?? row.availabilityStatus ?? "Available",
  )
    .trim()
    .toLowerCase();
  if (storedAvailability === "hidden") {
    return "Hidden";
  }

  if (isManualOverrideEnabled(row)) {
    return "Out of Stock";
  }

  const itemType = getRowItemType(row);
  if (itemType === MENU_ITEM) {
    if (isAutoMenuMissingIngredients(row, ingredients)) {
      return "Out of Stock";
    }
    if (ingredients.length === 0) return "Out of Stock";
    return (computeAvailableServings(ingredients) ?? 0) > 0
      ? "Available"
      : "Out of Stock";
  }

  // Selection options are labels chosen with a sellable menu item. They do
  // not carry stock or a separately sellable price.
  if (itemType === SELECTION_OPTION) return "Available";

  return Number(
    row.on_hand ?? row.onHand ?? row.remainingStock ?? row.stock ?? 0,
  ) > 0
    ? "Available"
    : "Out of Stock";
}

function deriveManualOverrideState(payload = {}) {
  const hasExplicitOverride =
    payload.override_mode !== undefined ||
    payload.manual_override !== undefined ||
    payload.manual_status !== undefined ||
    payload.availability_status !== undefined ||
    payload.availability_override !== undefined;

  if (!hasExplicitOverride) {
    return null;
  }

  const overrideMode = String(payload.override_mode ?? "").trim().toLowerCase();
  if (overrideMode === "auto") {
    return { manualOverride: 0, manualStatus: "Available" };
  }
  if (overrideMode === "force available") {
    throw new Error(
      'Force Available is no longer supported. Use "Auto" or "Force Out of Stock".',
    );
  }
  if (overrideMode === "force out of stock") {
    return { manualOverride: 1, manualStatus: "Out of Stock" };
  }

  if (payload.availability_override !== undefined) {
    const availabilityOverride = String(payload.availability_override)
      .trim()
      .toLowerCase();
    if (availabilityOverride === "auto") {
      return { manualOverride: 0, manualStatus: "Available" };
    }
    if (availabilityOverride === "unavailable") {
      return { manualOverride: 1, manualStatus: "Out of Stock" };
    }
    if (availabilityOverride === "available") {
      throw new Error(
        'Force Available is no longer supported. Use "auto" or "unavailable".',
      );
    }
  }

  if (payload.manual_override !== undefined || payload.manual_status !== undefined) {
    const manualOverride =
      payload.manual_override === true ||
      payload.manual_override === 1 ||
      String(payload.manual_override ?? "").trim().toLowerCase() === "true" ||
      String(payload.manual_override ?? "").trim() === "1";

    const manualStatus = normalizeManualStatus(payload.manual_status);
    if (manualOverride && manualStatus !== "Out of Stock") {
      throw new Error(
        'Force Available is no longer supported. Use "Auto" or "Force Out of Stock".',
      );
    }

    return manualOverride
      ? { manualOverride: 1, manualStatus: "Out of Stock" }
      : { manualOverride: 0, manualStatus: "Available" };
  }

  const legacyStatus = String(payload.availability_status ?? "")
    .trim()
    .toLowerCase();
  if (legacyStatus === "unavailable" || legacyStatus === "hidden") {
    return { manualOverride: 1, manualStatus: "Out of Stock" };
  }

  return { manualOverride: 0, manualStatus: "Available" };
}

function normalizeMenuIngredients(ingredients) {
  if (ingredients === undefined || ingredients === null) {
    return null;
  }

  if (!Array.isArray(ingredients)) {
    throw new Error("ingredients must be an array");
  }

  const merged = new Map();
  for (const entry of ingredients) {
    const productId = Number(entry?.product_id ?? entry?.productId);
    const quantityRequired = Number(
      entry?.quantity_required ?? entry?.quantityRequired,
    );

    if (!Number.isFinite(productId) || productId <= 0) {
      throw new Error("Each ingredient must include a valid product_id");
    }
    if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
      throw new Error("Each ingredient must include a positive quantity_required");
    }

    if (
      quantityRequired > 9999999999.9999 ||
      Math.abs(quantityRequired * 10000 - Math.round(quantityRequired * 10000)) >
        1e-7
    ) {
      throw new Error(
        "Ingredient quantities must fit DECIMAL(14,4) and use at most 4 decimal places",
      );
    }

    const current = merged.get(productId) ?? 0;
    const mergedQuantity = current + quantityRequired;
    if (mergedQuantity > 9999999999.9999) {
      throw new Error("Combined ingredient quantity exceeds DECIMAL(14,4)");
    }
    merged.set(productId, Math.round(mergedQuantity * 10000) / 10000);
  }

  return Array.from(merged.entries()).map(([productId, quantityRequired]) => ({
    productId,
    quantityRequired,
  }));
}

async function ensureMenuAvailabilitySchema(db) {
  const profile = getSchemaProfile();
  if (availabilitySchemaReady.has(profile)) return;
  if (availabilitySchemaPromises.has(profile)) {
    return availabilitySchemaPromises.get(profile);
  }

  const schemaPromise = (async () => {
    if (isRedesignedProfile(profile)) {
      await assertTableColumns(
        db,
        REDESIGNED_AVAILABILITY_SCHEMA_CONTRACT,
        "Menu availability schema",
      );
      availabilitySchemaReady.add(profile);
      return;
    }

    if (!(await hasColumn(db, "Menu", "manual_override"))) {
      await db.query(
        "ALTER TABLE Menu ADD COLUMN manual_override TINYINT(1) NOT NULL DEFAULT 0",
      );
    }

    if (!(await hasColumn(db, "Menu", "manual_status"))) {
      await db.query(
        "ALTER TABLE Menu ADD COLUMN manual_status VARCHAR(20) NOT NULL DEFAULT 'Available'",
      );
    }

    await db.query(
      `CREATE TABLE IF NOT EXISTS menu_item_ingredients (
        menu_ingredient_id INT AUTO_INCREMENT PRIMARY KEY,
        menu_product_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity_required DECIMAL(14,4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_menu_ingredient (menu_product_id, product_id),
        CONSTRAINT fk_menu_item_ingredients_menu
          FOREIGN KEY (menu_product_id) REFERENCES Menu(Product_ID) ON DELETE CASCADE,
        CONSTRAINT fk_menu_item_ingredients_product
          FOREIGN KEY (product_id) REFERENCES Menu(Product_ID) ON DELETE CASCADE
      )`,
    );

    await db.query(
      `UPDATE Menu
       SET manual_override = 0
       WHERE manual_override IS NULL`,
    );

    await db.query(
      `UPDATE Menu
       SET manual_status = 'Available'
       WHERE manual_status IS NULL OR TRIM(manual_status) = ''`,
    );

    availabilitySchemaReady.add(profile);
  })();
  availabilitySchemaPromises.set(profile, schemaPromise);

  try {
    await schemaPromise;
  } catch (error) {
    availabilitySchemaPromises.delete(profile);
    throw error;
  }
}

async function replaceMenuIngredients(db, menuProductId, ingredients) {
  if (isRedesignedProfile()) {
    let resolvedIngredients = ingredients ?? [];
    const normalizedProductId = Number(menuProductId);
    if (!Number.isSafeInteger(normalizedProductId) || normalizedProductId <= 0) {
      throw new Error("A valid menu product ID is required");
    }

    const [parentRows] = await db.query(
      `SELECT product_type
       FROM products
       WHERE product_id = ?
       LIMIT 1`,
      [normalizedProductId],
    );
    if (!parentRows.length) {
      throw new Error(`Menu product ${normalizedProductId} was not found`);
    }

    const parentType = String(parentRows[0].product_type || "")
      .trim()
      .toLowerCase();
    if (parentType === SELECTION_OPTION && resolvedIngredients.length) {
      throw new Error(
        "Chicken Flavor selection options cannot have ingredient mappings",
      );
    }
    if (parentType !== MENU_ITEM && parentType !== SELECTION_OPTION) {
      throw new Error("Only menu items can have ingredient mappings");
    }

    if (resolvedIngredients.length) {
      const ingredientIds = resolvedIngredients.map(
        (ingredient) => ingredient.productId,
      );
      const [ingredientRows] = await db.query(
        `SELECT product_id, product_type, unit_id
         FROM products
         WHERE product_id IN (?)`,
        [ingredientIds],
      );
      const ingredientsById = new Map(
        ingredientRows.map((row) => [Number(row.product_id), row]),
      );
      for (const ingredient of resolvedIngredients) {
        const row = ingredientsById.get(Number(ingredient.productId));
        if (!row) {
          throw new Error(
            `Ingredient product ${ingredient.productId} was not found`,
          );
        }
        if (String(row.product_type).trim().toLowerCase() !== STOCK_ITEM) {
          throw new Error(
            `Ingredient product ${ingredient.productId} must be stock_item`,
          );
        }
        if (
          !Number.isSafeInteger(Number(row.unit_id)) ||
          Number(row.unit_id) <= 0
        ) {
          throw new Error(
            `Ingredient product ${ingredient.productId} has no valid unit`,
          );
        }
      }
      resolvedIngredients = resolvedIngredients.map((ingredient) => ({
        ...ingredient,
        unitId: Number(
          ingredientsById.get(Number(ingredient.productId)).unit_id,
        ),
      }));
    }

    await db.query(
      "DELETE FROM product_recipes WHERE parent_product_id = ?",
      [normalizedProductId],
    );
    for (const ingredient of resolvedIngredients) {
      await db.query(
        `INSERT INTO product_recipes
          (parent_product_id, ingredient_product_id, quantity_required, unit_id)
         VALUES (?,?,?,?)`,
        [
          normalizedProductId,
          ingredient.productId,
          ingredient.quantityRequired,
          ingredient.unitId,
        ],
      );
    }
    return;
  }

  await db.query(
    "DELETE FROM menu_item_ingredients WHERE menu_product_id = ?",
    [menuProductId],
  );

  if (!ingredients || ingredients.length === 0) {
    return;
  }

  for (const ingredient of ingredients) {
    await db.query(
      `INSERT INTO menu_item_ingredients
        (menu_product_id, product_id, quantity_required)
       VALUES (?,?,?)`,
      [menuProductId, ingredient.productId, ingredient.quantityRequired],
    );
  }
}

async function fetchMenuIngredients(db, menuIds) {
  const normalizedIds = Array.from(
    new Set(
      (menuIds ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
  if (isRedesignedProfile()) {
    const [rows] = await db.query(
      `SELECT
         recipe.parent_product_id AS menu_product_id,
         recipe.ingredient_product_id AS product_id,
         recipe.quantity_required,
         ingredient.name AS product_name,
         ingredient.product_type AS item_type,
         COALESCE(NULLIF(TRIM(unit.abbreviation), ''), unit.name) AS unit,
         CASE
           WHEN ingredient.tracking_method = 'none'
             THEN COALESCE(balance.on_hand, 0)
           WHEN ingredient.tracking_method = 'expiry'
             THEN LEAST(
               COALESCE(balance.on_hand, 0),
               COALESCE(batch_stock.expiry_usable_stock, 0)
             )
           WHEN ingredient.tracking_method = 'shelf_life'
             THEN LEAST(
               COALESCE(balance.on_hand, 0),
               COALESCE(batch_stock.shelf_life_usable_stock, 0)
             )
           ELSE 0
         END AS daily_withdrawn,
         CASE
           WHEN ingredient.tracking_method = 'none'
             THEN COALESCE(balance.on_hand, 0)
           WHEN ingredient.tracking_method = 'expiry'
             THEN LEAST(
               COALESCE(balance.on_hand, 0),
               COALESCE(batch_stock.expiry_usable_stock, 0)
             )
           WHEN ingredient.tracking_method = 'shelf_life'
             THEN LEAST(
               COALESCE(balance.on_hand, 0),
               COALESCE(batch_stock.shelf_life_usable_stock, 0)
             )
           ELSE 0
         END AS stock,
         CASE
           WHEN ingredient.tracking_method = 'expiry'
             THEN COALESCE(batch_stock.expiry_usable_stock, 0)
           WHEN ingredient.tracking_method = 'shelf_life'
             THEN COALESCE(batch_stock.shelf_life_usable_stock, 0)
           ELSE COALESCE(balance.on_hand, 0)
         END AS usable_batch_stock
       FROM product_recipes recipe
       INNER JOIN products parent
         ON parent.product_id = recipe.parent_product_id
        AND parent.product_type = '${MENU_ITEM}'
       INNER JOIN products ingredient
         ON ingredient.product_id = recipe.ingredient_product_id
        AND ingredient.product_type = '${STOCK_ITEM}'
       INNER JOIN units unit ON unit.unit_id = recipe.unit_id
       LEFT JOIN inventory_balances balance
         ON balance.product_id = recipe.ingredient_product_id
       LEFT JOIN (
         SELECT
           product_id,
           SUM(CASE
             WHEN status = 'active'
              AND remaining_quantity > 0
              AND expiry_at IS NOT NULL
              AND expiry_at > NOW()
             THEN remaining_quantity
             ELSE 0
           END) AS expiry_usable_stock,
           SUM(CASE
             WHEN status = 'active'
              AND remaining_quantity > 0
              AND usable_until IS NOT NULL
              AND usable_until > NOW()
             THEN remaining_quantity
             ELSE 0
           END) AS shelf_life_usable_stock
         FROM inventory_batches
         GROUP BY product_id
       ) batch_stock ON batch_stock.product_id = recipe.ingredient_product_id
       WHERE recipe.parent_product_id IN (?)
       ORDER BY recipe.parent_product_id ASC, product_name ASC`,
      [normalizedIds],
    );
    return groupIngredientRows(rows);
  }

  const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
  const [rows] = await db.query(
    `SELECT
       mi.menu_product_id,
       mi.product_id,
       mi.quantity_required,
       COALESCE(p.name, m.Product_Name, CONCAT('Product #', mi.product_id)) AS product_name,
       ${itemTypeExpr} AS item_type,
       COALESCE(bu.unit, 'piece') AS unit,
       COALESCE(inv.Stock, 0) AS daily_withdrawn,
       COALESCE(inv.Stock, 0) AS stock
     FROM menu_item_ingredients mi
     LEFT JOIN products p ON p.id = mi.product_id
     LEFT JOIN Menu m ON m.Product_ID = mi.product_id
     LEFT JOIN Inventory inv ON inv.Product_ID = mi.product_id
     LEFT JOIN (
       SELECT product_id, MAX(unit) AS unit
       FROM batches
       GROUP BY product_id
     ) bu ON bu.product_id = mi.product_id
     WHERE mi.menu_product_id IN (?) 
     ORDER BY mi.menu_product_id ASC, product_name ASC`,
    [normalizedIds],
  );

  return groupIngredientRows(rows);
}

function groupIngredientRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const menuProductId = Number(row.menu_product_id);
    const current = grouped.get(menuProductId) ?? [];
    current.push({
      product_id: Number(row.product_id),
      product_name: String(row.product_name),
      item_type: String(row.item_type || "stock_item"),
      quantity_required: Number(row.quantity_required),
      unit: String(row.unit ?? "piece"),
      daily_withdrawn: Number(row.daily_withdrawn ?? 0),
      stock: Number(row.stock ?? 0),
      usable_batch_stock: Number(row.usable_batch_stock ?? 0),
    });
    grouped.set(menuProductId, current);
  }

  return grouped;
}

module.exports = {
  computeAvailableServings,
  deriveManualOverrideState,
  ensureMenuAvailabilitySchema,
  fetchMenuIngredients,
  isAutoMenuMissingIngredients,
  normalizeManualStatus,
  normalizeMenuIngredients,
  replaceMenuIngredients,
  resolveProductAvailabilityStatus,
  REDESIGNED_AVAILABILITY_SCHEMA_CONTRACT,
};
