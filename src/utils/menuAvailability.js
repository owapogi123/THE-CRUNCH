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

function deriveManualOverrideState(payload = {}) {
  const hasExplicitOverride =
    payload.override_mode !== undefined ||
    payload.manual_override !== undefined ||
    payload.manual_status !== undefined ||
    payload.availability_status !== undefined;

  if (!hasExplicitOverride) {
    return null;
  }

  const overrideMode = String(payload.override_mode ?? "").trim().toLowerCase();
  if (overrideMode === "auto") {
    return { manualOverride: 0, manualStatus: "Available" };
  }
  if (overrideMode === "force available") {
    return { manualOverride: 1, manualStatus: "Available" };
  }
  if (overrideMode === "force out of stock") {
    return { manualOverride: 1, manualStatus: "Out of Stock" };
  }

  if (payload.manual_override !== undefined || payload.manual_status !== undefined) {
    const manualOverride =
      payload.manual_override === true ||
      payload.manual_override === 1 ||
      String(payload.manual_override ?? "").trim().toLowerCase() === "true" ||
      String(payload.manual_override ?? "").trim() === "1";

    return {
      manualOverride: manualOverride ? 1 : 0,
      manualStatus: normalizeManualStatus(payload.manual_status),
    };
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

    const current = merged.get(productId) ?? 0;
    merged.set(productId, current + quantityRequired);
  }

  return Array.from(merged.entries()).map(([productId, quantityRequired]) => ({
    productId,
    quantityRequired,
  }));
}

async function ensureMenuAvailabilitySchema(db) {
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
      quantity_required DECIMAL(10,2) NOT NULL DEFAULT 0,
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
}

async function replaceMenuIngredients(db, menuProductId, ingredients) {
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

  const [rows] = await db.query(
    `SELECT
       mi.menu_product_id,
       mi.product_id,
       mi.quantity_required,
       COALESCE(p.name, m.Product_Name, CONCAT('Product #', mi.product_id)) AS product_name,
       COALESCE(bu.unit, 'piece') AS unit,
       COALESCE(inv.Daily_Withdrawn, 0) AS daily_withdrawn,
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

  const grouped = new Map();
  for (const row of rows) {
    const menuProductId = Number(row.menu_product_id);
    const current = grouped.get(menuProductId) ?? [];
    current.push({
      product_id: Number(row.product_id),
      product_name: String(row.product_name),
      quantity_required: Number(row.quantity_required),
      unit: String(row.unit ?? "piece"),
      daily_withdrawn: Number(row.daily_withdrawn ?? 0),
      stock: Number(row.stock ?? 0),
    });
    grouped.set(menuProductId, current);
  }

  return grouped;
}

module.exports = {
  deriveManualOverrideState,
  ensureMenuAvailabilitySchema,
  fetchMenuIngredients,
  normalizeManualStatus,
  normalizeMenuIngredients,
  replaceMenuIngredients,
};
