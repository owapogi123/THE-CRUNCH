"use strict";

const db = require("../config/db");
const {
  MENU_ITEM,
  SELECTION_OPTION,
  STOCK_ITEM,
} = require("../utils/productItemType");
const {
  deriveManualOverrideState,
  fetchMenuIngredients,
  normalizeMenuIngredients,
  replaceMenuIngredients,
  resolveProductAvailabilityStatus,
} = require("../utils/menuAvailability");
const {
  directStockUpdateResponse,
  findDirectStockQuantityFields,
} = require("../utils/stockMutationPolicy");
const {
  CHICKEN_FLAVORS_SYSTEM_KEY,
  normalizeSystemKey,
} = require("../services/systemMenuCategoryService");
const { invalidateProductCache } = require("../services/cacheService");

const PRODUCT_NAME_MAX_LENGTH = 100;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 100;
const RAW_MATERIAL_NAME_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9' -]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;
const SUPPORTED_PRODUCT_TYPES = new Set([
  MENU_ITEM,
  STOCK_ITEM,
  SELECTION_OPTION,
]);

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizeName(value, { stockOnly = false } = {}) {
  const name = String(value ?? "").trim();
  if (!name) throw httpError(400, "Product name is required.");
  if (name.length < 2) {
    throw httpError(400, "Product name must be at least 2 characters.");
  }
  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    throw httpError(400, "Product name must not exceed 100 characters.");
  }
  if (stockOnly && !RAW_MATERIAL_NAME_PATTERN.test(name)) {
    throw httpError(
      400,
      "Material name may only use letters, numbers, spaces, apostrophes, and hyphens.",
    );
  }
  return name;
}

function normalizeDescription(value) {
  if (value === undefined) return undefined;
  const description = String(value ?? "").trim();
  if (!description) return null;
  if (description.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    throw httpError(400, "Description must not exceed 100 characters.");
  }
  return description;
}

function normalizeImage(value) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const image = String(value).trim();
  if (/^data:image\//i.test(image)) {
    throw httpError(
      400,
      "Base64 product images are not supported. Upload the image first and save the returned file path.",
    );
  }
  return image;
}

function normalizeProductType(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const productType = String(value).trim().toLowerCase();
  if (!SUPPORTED_PRODUCT_TYPES.has(productType)) {
    throw httpError(
      400,
      "item_type must be menu_item, stock_item, or selection_option",
    );
  }
  return productType;
}

function assertNoUnsupportedPromotion(body = {}) {
  const promotional =
    body.is_promotional === true ||
    body.is_promotional === 1 ||
    ["1", "true", "yes", "on"].includes(
      String(body.is_promotional ?? "").trim().toLowerCase(),
    );
  const hasPromoPrice =
    body.promo_price !== undefined &&
    body.promo_price !== null &&
    String(body.promo_price).trim() !== "";
  const hasPromoLabel = String(body.promo_label ?? "").trim() !== "";
  if (promotional || hasPromoPrice || hasPromoLabel) {
    throw httpError(
      409,
      "Product promotions are not represented in the redesigned baseline schema and cannot be saved by this endpoint.",
    );
  }
}

function normalizeDecimal(value, label, { scale = 4, maximum } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw httpError(400, `Invalid ${label} value`);
  }
  const multiplier = 10 ** scale;
  if (
    (maximum !== undefined && number > maximum) ||
    Math.abs(number * multiplier - Math.round(number * multiplier)) > 1e-7
  ) {
    throw httpError(
      400,
      `${label} must use at most ${scale} decimal places`,
    );
  }
  return Math.round(number * multiplier) / multiplier;
}

function normalizeTracking(body, fallback = {}) {
  const trackingMethod = String(
    body.tracking_method ?? fallback.tracking_method ?? "none",
  )
    .trim()
    .toLowerCase();
  if (!["none", "expiry", "shelf_life"].includes(trackingMethod)) {
    throw httpError(
      400,
      "tracking_method must be none, expiry, or shelf_life",
    );
  }

  const rawDays = body.shelf_life_days ?? fallback.shelf_life_days;
  if (trackingMethod !== "shelf_life") {
    if (body.shelf_life_days !== undefined && body.shelf_life_days !== null && body.shelf_life_days !== "") {
      throw httpError(
        400,
        "shelf_life_days is only valid when tracking_method is shelf_life",
      );
    }
    return { trackingMethod, shelfLifeDays: null };
  }

  const shelfLifeDays = Number(rawDays);
  if (!Number.isSafeInteger(shelfLifeDays) || shelfLifeDays <= 0) {
    throw httpError(
      400,
      "shelf_life_days must be a positive whole number for shelf_life tracking",
    );
  }
  return { trackingMethod, shelfLifeDays };
}

function normalizeThresholds(body, fallback = {}) {
  const useDefaults =
    body.use_default_thresholds === undefined
      ? false
      : body.use_default_thresholds === true ||
        body.use_default_thresholds === 1 ||
        ["1", "true", "yes", "on"].includes(
          String(body.use_default_thresholds).trim().toLowerCase(),
        );
  const reorderInput = body.low_stock_threshold;
  const criticalInput = body.critical_stock_threshold;
  const reorderPoint =
    useDefaults || reorderInput === undefined || reorderInput === null || reorderInput === ""
      ? Number(fallback.reorder_point ?? 20)
      : normalizeDecimal(reorderInput, "low stock threshold", {
          scale: 4,
          maximum: 9999999999.9999,
        });
  const criticalPoint =
    useDefaults || criticalInput === undefined || criticalInput === null || criticalInput === ""
      ? Number(fallback.critical_point ?? 5)
      : normalizeDecimal(criticalInput, "critical stock threshold", {
          scale: 4,
          maximum: 9999999999.9999,
        });
  if (criticalPoint > reorderPoint) {
    throw httpError(
      400,
      "Critical threshold cannot be greater than warning threshold",
    );
  }
  return { reorderPoint, criticalPoint, useDefaults };
}

async function assertUniqueName(connection, name, excludeId = null) {
  const params = [name];
  let exclusion = "";
  if (excludeId !== null) {
    exclusion = " AND product_id <> ?";
    params.push(excludeId);
  }
  const [rows] = await connection.query(
    `SELECT product_id
       FROM products
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))${exclusion}
      LIMIT 1
      FOR UPDATE`,
    params,
  );
  if (rows.length) {
    throw httpError(409, `A product named "${name}" already exists.`);
  }
}

async function lockCategory(connection, categoryName, productType) {
  const name = String(categoryName ?? "").trim();
  if (!name) {
    throw httpError(
      400,
      productType === STOCK_ITEM
        ? "Category is required for stock items."
        : "Category is required for menu items.",
    );
  }
  const isStock = productType === STOCK_ITEM;
  const table = isStock ? "inventory_categories" : "menu_categories";
  const [rows] = await connection.query(
    `SELECT category_id, name, system_key, is_active
       FROM ${table}
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
      LIMIT 1
      LOCK IN SHARE MODE`,
    [name],
  );
  const category = rows[0];
  if (!category) {
    throw httpError(
      409,
      `${isStock ? "Inventory" : "Menu"} category "${name}" no longer exists. Refresh the category list and choose another category.`,
    );
  }
  if (Number(category.is_active) !== 1) {
    throw httpError(409, `Category "${category.name}" is inactive.`);
  }
  return category;
}

async function lockUnit(connection, unitValue) {
  const unit = String(unitValue ?? "piece").trim() || "piece";
  const [rows] = await connection.query(
    `SELECT unit_id, name, abbreviation, system_key, is_active
       FROM units
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
         OR LOWER(TRIM(abbreviation)) = LOWER(TRIM(?))
         OR LOWER(TRIM(COALESCE(system_key, ''))) = LOWER(TRIM(?))
      ORDER BY CASE WHEN LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END
      LIMIT 1
      LOCK IN SHARE MODE`,
    [unit, unit, unit, unit],
  );
  const matched = rows[0];
  if (!matched) {
    throw httpError(
      409,
      `Inventory unit "${unit}" no longer exists. Refresh the unit list and choose another unit.`,
    );
  }
  if (Number(matched.is_active) !== 1) {
    throw httpError(409, `Inventory unit "${matched.name}" is inactive.`);
  }
  return matched;
}

function productSelectSql(whereClause = "") {
  return `SELECT
      p.product_id AS id,
      p.product_id AS product_id,
      p.name,
      p.selling_price AS price,
      CASE WHEN p.product_type = '${STOCK_ITEM}' THEN COALESCE(balance.on_hand, 0) ELSE 0 END AS quantity,
      p.description,
      p.image_url AS image,
      CONCAT('M-', LPAD(p.product_id, 3, '0')) AS menu_code,
      CASE
        WHEN p.lifecycle_status = 'archived' THEN 'Hidden'
        WHEN p.lifecycle_status = 'inactive' OR p.availability_override = 'unavailable' THEN 'Out of Stock'
        ELSE 'Available'
      END AS availability_status,
      0 AS is_promotional,
      NULL AS promo_price,
      NULL AS promo_label,
      p.product_type AS item_type,
      p.product_type AS product_type,
      COALESCE(menu_category.name, inventory_category.name) AS category,
      menu_category.system_key AS category_system_key,
      NULL AS inventoryPromo,
      COALESCE(NULLIF(TRIM(unit.abbreviation), ''), unit.name, 'piece') AS unit,
      COALESCE(balance.on_hand, 0) AS stock,
      0 AS dailyWithdrawn,
      CASE WHEN p.product_type = '${STOCK_ITEM}' THEN COALESCE(balance.on_hand, 0) ELSE 0 END AS remainingStock,
      CASE WHEN p.availability_override = 'unavailable' THEN 1 ELSE 0 END AS manual_override,
      CASE WHEN p.availability_override = 'unavailable' THEN 'Out of Stock' ELSE 'Available' END AS manual_status,
      0 AS use_default_thresholds,
      balance.reorder_point AS low_stock_threshold,
      balance.critical_point AS critical_stock_threshold,
      p.tracking_method,
      p.shelf_life_days,
      p.lifecycle_status,
      p.availability_override
    FROM products p
    LEFT JOIN menu_categories menu_category
      ON menu_category.category_id = p.menu_category_id
    LEFT JOIN inventory_categories inventory_category
      ON inventory_category.category_id = p.inventory_category_id
    LEFT JOIN units unit ON unit.unit_id = p.unit_id
    LEFT JOIN inventory_balances balance ON balance.product_id = p.product_id
    ${whereClause}`;
}

async function getEnrichedRows(connection, whereClause = "", params = []) {
  const [rows] = await connection.query(productSelectSql(whereClause), params);
  const ingredientsByProduct = await fetchMenuIngredients(
    connection,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const ingredients = ingredientsByProduct.get(Number(row.id)) ?? [];
    const availabilityStatus = resolveProductAvailabilityStatus(row, ingredients);
    let remainingStock = Number(row.remainingStock ?? 0);
    if (row.item_type === MENU_ITEM && ingredients.length) {
      remainingStock = Math.max(
        0,
        Math.floor(
          Math.min(
            ...ingredients.map(
              (ingredient) =>
                Number(ingredient.stock ?? 0) /
                Number(ingredient.quantity_required ?? 1),
            ),
          ),
        ),
      );
    }
    return {
      ...row,
      image:
        String(row.image || "").trim() && !/^data:image\//i.test(row.image)
          ? row.image
          : "/img/placeholder.jpg",
      ingredient_count: ingredients.length,
      available_servings:
        row.item_type === MENU_ITEM && ingredients.length ? remainingStock : null,
      availability_status: availabilityStatus,
      available: availabilityStatus === "Available",
      remainingStock,
      ingredients,
    };
  });
}

function sendError(res, error, operation) {
  if (error?.statusCode) {
    const payload = { message: error.message };
    if (error.code) payload.code = error.code;
    return res.status(error.statusCode).json(payload);
  }
  if (error?.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ message: "A product with the same unique value already exists." });
  }
  if (error?.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      code: "PRODUCT_HAS_PROTECTED_HISTORY",
      message: "Product cannot be deleted because historical records reference it.",
    });
  }
  console.error(`${operation} redesigned product error:`, error);
  return res.status(500).json({ message: "DB error", error: error.message });
}

async function listProducts(req, res) {
  try {
    const requestedType = String(req.query.item_type ?? "").trim().toLowerCase();
    if (requestedType && !SUPPORTED_PRODUCT_TYPES.has(requestedType)) {
      return res.status(400).json({
        message: "item_type must be menu_item, stock_item, or selection_option",
      });
    }
    const filters = [];
    const params = [];
    if (requestedType) {
      if (requestedType === MENU_ITEM) {
        // The current Menu Management and Cashier clients both obtain flavor
        // labels from the menu_item response and then exclude the protected
        // flavor category from the ordinary product grid. Keep that response
        // contract while exposing the authoritative type separately.
        filters.push("p.product_type IN (?, ?)");
        params.push(MENU_ITEM, SELECTION_OPTION);
      } else {
        filters.push("p.product_type = ?");
        params.push(requestedType);
      }
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await getEnrichedRows(db, `${where} ORDER BY p.product_id ASC`, params);
    return res.json(
      requestedType === MENU_ITEM
        ? rows.map((row) =>
            row.product_type === SELECTION_OPTION
              ? { ...row, item_type: MENU_ITEM }
              : row,
          )
        : rows,
    );
  } catch (error) {
    return sendError(res, error, "GET");
  }
}

async function createProduct(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const directStockFields = findDirectStockQuantityFields(req.body);
    const forbiddenStockFields = directStockFields.filter(
      (field) =>
        String(field).replace(/[^a-z0-9]/gi, "").toLowerCase() !== "quantity" ||
        Number(req.body[field]) !== 0,
    );
    if (forbiddenStockFields.length) {
      return res
        .status(400)
        .json(directStockUpdateResponse(forbiddenStockFields));
    }

    const requestedType = normalizeProductType(req.body.item_type, STOCK_ITEM);
    assertNoUnsupportedPromotion(req.body);
    const name = normalizeName(req.body.name, { stockOnly: requestedType === STOCK_ITEM });
    const description = normalizeDescription(req.body.description) ?? null;
    const image = normalizeImage(req.body.image) ?? null;
    const ingredients = normalizeMenuIngredients(req.body.ingredients);

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    await assertUniqueName(connection, name);

    let category = await lockCategory(connection, req.body.category, requestedType);
    const categorySystemKey = normalizeSystemKey(category.system_key);
    let productType = requestedType;
    if (requestedType === MENU_ITEM && categorySystemKey === CHICKEN_FLAVORS_SYSTEM_KEY) {
      productType = SELECTION_OPTION;
    }
    if (
      productType === SELECTION_OPTION &&
      categorySystemKey !== CHICKEN_FLAVORS_SYSTEM_KEY
    ) {
      throw httpError(
        400,
        "selection_option products must belong to the protected Chicken Flavors category.",
      );
    }
    if (
      productType !== SELECTION_OPTION &&
      categorySystemKey === CHICKEN_FLAVORS_SYSTEM_KEY
    ) {
      throw httpError(
        400,
        "The protected Chicken Flavors category only accepts selection_option products.",
      );
    }

    if (productType === SELECTION_OPTION && ingredients?.length) {
      throw httpError(400, "Chicken Flavor selection options cannot have ingredient mappings");
    }
    if (productType === STOCK_ITEM && ingredients !== null) {
      throw httpError(400, "Ingredients can only be assigned to menu_item products");
    }

    let sellingPrice = null;
    if (productType === MENU_ITEM) {
      sellingPrice = normalizeDecimal(req.body.price ?? 0, "price", {
        scale: 2,
        maximum: 9999999999.99,
      });
      if (sellingPrice < 1) throw httpError(400, "Price must be at least ₱1.");
    } else if (
      productType === SELECTION_OPTION &&
      req.body.price !== undefined &&
      Number(req.body.price) !== 0
    ) {
      throw httpError(400, "Chicken Flavor selection options cannot have a selling price");
    }

    const manualState =
      productType === SELECTION_OPTION
        ? { manualOverride: 0 }
        : deriveManualOverrideState(req.body) ?? { manualOverride: 0 };
    const availabilityOverride = manualState.manualOverride ? "unavailable" : "auto";

    let unit = null;
    let tracking = { trackingMethod: "none", shelfLifeDays: null };
    if (productType === STOCK_ITEM) {
      unit = await lockUnit(connection, req.body.unit);
      tracking = normalizeTracking(req.body);
    }

    const [result] = await connection.query(
      `INSERT INTO products
        (name, product_type, menu_category_id, inventory_category_id, unit_id,
         selling_price, description, image_url, lifecycle_status,
         availability_override, tracking_method, shelf_life_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        name,
        productType,
        productType === STOCK_ITEM ? null : category.category_id,
        productType === STOCK_ITEM ? category.category_id : null,
        unit?.unit_id ?? null,
        sellingPrice,
        description,
        image,
        availabilityOverride,
        tracking.trackingMethod,
        tracking.shelfLifeDays,
      ],
    );
    const productId = Number(result.insertId);

    if (productType === STOCK_ITEM) {
      const thresholds = normalizeThresholds(req.body);
      await connection.query(
        `INSERT INTO inventory_balances
          (product_id, on_hand, reorder_point, critical_point)
         VALUES (?, 0, ?, ?)`,
        [productId, thresholds.reorderPoint, thresholds.criticalPoint],
      );
    } else if (productType === MENU_ITEM && ingredients !== null) {
      await replaceMenuIngredients(connection, productId, ingredients);
    }

    await connection.commit();
    transactionStarted = false;
    await invalidateProductCache("redesigned product created");
    return res.status(201).json({ message: "Product added", id: productId });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    return sendError(res, error, "POST");
  } finally {
    if (connection) connection.release();
  }
}

async function updateProduct(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    const directStockFields = findDirectStockQuantityFields(req.body);
    if (directStockFields.length) {
      return res.status(400).json(directStockUpdateResponse(directStockFields));
    }
    assertNoUnsupportedPromotion(req.body);

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [existingRows] = await connection.query(
      `SELECT p.*, balance.product_id AS balance_product_id,
              balance.reorder_point, balance.critical_point,
              menu_category.name AS menu_category_name,
              menu_category.system_key AS menu_category_system_key,
              inventory_category.name AS inventory_category_name,
              unit.name AS unit_name, unit.abbreviation AS unit_abbreviation
         FROM products p
         LEFT JOIN inventory_balances balance ON balance.product_id = p.product_id
         LEFT JOIN menu_categories menu_category ON menu_category.category_id = p.menu_category_id
         LEFT JOIN inventory_categories inventory_category ON inventory_category.category_id = p.inventory_category_id
         LEFT JOIN units unit ON unit.unit_id = p.unit_id
        WHERE p.product_id = ?
        LIMIT 1
        FOR UPDATE`,
      [productId],
    );
    const existing = existingRows[0];
    if (!existing) throw httpError(404, "Product not found");

    let requestedType = normalizeProductType(req.body.item_type, existing.product_type);
    const currentSystemKey = normalizeSystemKey(existing.menu_category_system_key);
    if (
      existing.product_type === SELECTION_OPTION &&
      requestedType === MENU_ITEM &&
      currentSystemKey === CHICKEN_FLAVORS_SYSTEM_KEY
    ) {
      // The current Menu Management client still submits chicken flavors as
      // menu_item. Preserve that wire contract while storing selection_option.
      requestedType = SELECTION_OPTION;
    }
    if (requestedType !== existing.product_type) {
      throw httpError(
        409,
        "Changing an existing product type is not supported by this endpoint because it can invalidate inventory or historical relationships.",
      );
    }

    const productType = existing.product_type;
    const categoryName =
      req.body.category ??
      (productType === STOCK_ITEM
        ? existing.inventory_category_name
        : existing.menu_category_name);
    const category = await lockCategory(connection, categoryName, productType);
    const categorySystemKey = normalizeSystemKey(category.system_key);
    if (
      productType === SELECTION_OPTION &&
      categorySystemKey !== CHICKEN_FLAVORS_SYSTEM_KEY
    ) {
      throw httpError(400, "Chicken Flavor selection options cannot leave the protected Chicken Flavors category.");
    }
    if (
      productType === MENU_ITEM &&
      categorySystemKey === CHICKEN_FLAVORS_SYSTEM_KEY
    ) {
      throw httpError(409, "Move into Chicken Flavors requires an explicit product-type migration.");
    }

    const name =
      req.body.name === undefined
        ? existing.name
        : normalizeName(req.body.name, { stockOnly: productType === STOCK_ITEM });
    await assertUniqueName(connection, name, productId);
    const description =
      req.body.description === undefined
        ? existing.description
        : normalizeDescription(req.body.description);
    const image =
      req.body.image === undefined ? existing.image_url : normalizeImage(req.body.image);

    let sellingPrice = existing.selling_price;
    if (productType === MENU_ITEM && req.body.price !== undefined) {
      sellingPrice = normalizeDecimal(req.body.price, "price", {
        scale: 2,
        maximum: 9999999999.99,
      });
      if (sellingPrice < 1) throw httpError(400, "Price must be at least ₱1.");
    }
    if (productType === SELECTION_OPTION) {
      if (req.body.price !== undefined && Number(req.body.price) !== 0) {
        throw httpError(400, "Chicken Flavor selection options cannot have a selling price");
      }
      sellingPrice = null;
    }

    const manualState =
      productType === SELECTION_OPTION
        ? { manualOverride: 0 }
        : deriveManualOverrideState(req.body);
    const availabilityOverride = manualState
      ? manualState.manualOverride
        ? "unavailable"
        : "auto"
      : existing.availability_override;

    let unitId = existing.unit_id;
    let tracking = {
      trackingMethod: existing.tracking_method,
      shelfLifeDays: existing.shelf_life_days,
    };
    if (productType === STOCK_ITEM) {
      if (existing.balance_product_id == null) {
        throw httpError(
          409,
          "Stock item is missing its required inventory balance. Repair the data before editing this product.",
        );
      }
      if (req.body.unit !== undefined) {
        unitId = (await lockUnit(connection, req.body.unit)).unit_id;
      }
      tracking = normalizeTracking(req.body, existing);
    }

    const ingredients = normalizeMenuIngredients(req.body.ingredients);
    if (productType === SELECTION_OPTION && ingredients?.length) {
      throw httpError(400, "Chicken Flavor selection options cannot have ingredient mappings");
    }
    if (productType === STOCK_ITEM && ingredients !== null) {
      throw httpError(400, "Ingredients can only be assigned to menu_item products");
    }

    await connection.query(
      `UPDATE products
          SET name = ?,
              menu_category_id = ?,
              inventory_category_id = ?,
              unit_id = ?,
              selling_price = ?,
              description = ?,
              image_url = ?,
              availability_override = ?,
              tracking_method = ?,
              shelf_life_days = ?
        WHERE product_id = ?`,
      [
        name,
        productType === STOCK_ITEM ? null : category.category_id,
        productType === STOCK_ITEM ? category.category_id : null,
        productType === STOCK_ITEM ? unitId : null,
        productType === STOCK_ITEM ? null : sellingPrice,
        description,
        image,
        availabilityOverride,
        productType === STOCK_ITEM ? tracking.trackingMethod : "none",
        productType === STOCK_ITEM ? tracking.shelfLifeDays : null,
        productId,
      ],
    );

    if (productType === STOCK_ITEM) {
      const thresholds = normalizeThresholds(req.body, existing);
      const [balanceResult] = await connection.query(
        `UPDATE inventory_balances
            SET reorder_point = ?, critical_point = ?
          WHERE product_id = ?`,
        [thresholds.reorderPoint, thresholds.criticalPoint, productId],
      );
      if (Number(balanceResult.affectedRows) !== 1) {
        throw httpError(
          409,
          "Stock item is missing its required inventory balance. Repair the data before editing this product.",
        );
      }
    } else if (productType === MENU_ITEM && ingredients !== null) {
      await replaceMenuIngredients(connection, productId, ingredients);
    }

    const [updated] = await getEnrichedRows(
      connection,
      "WHERE p.product_id = ?",
      [productId],
    );
    await connection.commit();
    transactionStarted = false;
    await invalidateProductCache("redesigned product updated");
    return res.json(updated);
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    return sendError(res, error, "PUT");
  } finally {
    if (connection) connection.release();
  }
}

async function setArchiveState(req, res, archived) {
  let connection;
  let transactionStarted = false;
  try {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT product_id, product_type, lifecycle_status
         FROM products
        WHERE product_id = ?
        LIMIT 1
        FOR UPDATE`,
      [productId],
    );
    const product = rows[0];
    if (!product) throw httpError(404, "Product not found");
    if (![MENU_ITEM, SELECTION_OPTION].includes(product.product_type)) {
      throw httpError(
        400,
        "Only menu items and Chicken Flavor selection options can be archived from Menu Management.",
      );
    }
    const lifecycleStatus = archived ? "archived" : "active";
    await connection.query(
      "UPDATE products SET lifecycle_status = ? WHERE product_id = ?",
      [lifecycleStatus, productId],
    );
    await connection.commit();
    transactionStarted = false;
    await invalidateProductCache(archived ? "redesigned product archived" : "redesigned product restored");
    return res.json({
      id: productId,
      availability_status: archived ? "Hidden" : "Available",
      lifecycle_status: lifecycleStatus,
      archived,
      message: archived
        ? "Menu item archived. Historical records were preserved."
        : "Menu item restored. Live ingredient and stock availability still applies.",
    });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    return sendError(res, error, archived ? "ARCHIVE" : "RESTORE");
  } finally {
    if (connection) connection.release();
  }
}

async function deleteProduct(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [products] = await connection.query(
      `SELECT product_id, product_type
         FROM products
        WHERE product_id = ?
        FOR UPDATE`,
      [productId],
    );
    const product = products[0];
    if (!product) throw httpError(404, "Product not found");

    const [dependencyRows] = await connection.query(
      `SELECT
         EXISTS(SELECT 1 FROM inventory_batches WHERE product_id = ? LIMIT 1) AS has_batches,
         EXISTS(SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1) AS has_stock_movements,
         EXISTS(SELECT 1 FROM order_items WHERE product_id = ? OR selected_option_product_id = ? LIMIT 1) AS has_order_items,
         EXISTS(SELECT 1 FROM purchase_order_items WHERE product_id = ? LIMIT 1) AS has_purchase_order_items,
         EXISTS(SELECT 1 FROM receipt_snapshot_items WHERE original_product_id = ? OR selected_option_product_id = ? LIMIT 1) AS has_receipt_history,
         EXISTS(SELECT 1 FROM order_inventory_deductions WHERE product_id = ? LIMIT 1) AS has_order_deductions,
         EXISTS(SELECT 1 FROM feedback WHERE product_id = ? LIMIT 1) AS has_feedback,
         EXISTS(SELECT 1 FROM supplier_products WHERE product_id = ? LIMIT 1) AS has_supplier_link,
         EXISTS(SELECT 1 FROM inventory_alerts WHERE product_id = ? LIMIT 1) AS has_inventory_alerts,
         EXISTS(SELECT 1 FROM product_recipes WHERE parent_product_id = ? OR ingredient_product_id = ? LIMIT 1) AS has_recipe_link`,
      Array(13).fill(productId),
    );
    const dependencies = dependencyRows[0] ?? {};
    if (Object.values(dependencies).some((value) => Number(value) !== 0)) {
      const error = httpError(
        409,
        "Products with historical records or active relationships cannot be hard deleted.",
        "PRODUCT_HAS_PROTECTED_HISTORY",
      );
      error.canArchive = [MENU_ITEM, SELECTION_OPTION].includes(product.product_type);
      throw error;
    }

    await connection.query("DELETE FROM inventory_balances WHERE product_id = ?", [productId]);
    const [result] = await connection.query(
      "DELETE FROM products WHERE product_id = ?",
      [productId],
    );
    if (!result.affectedRows) throw httpError(404, "Product not found");
    await connection.commit();
    transactionStarted = false;
    await invalidateProductCache("redesigned product deleted");
    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    if (error?.statusCode === 409 && error.code === "PRODUCT_HAS_PROTECTED_HISTORY") {
      return res.status(409).json({
        code: error.code,
        canArchive: Boolean(error.canArchive),
        productId: Number(req.params.id),
        message: error.message,
      });
    }
    return sendError(res, error, "DELETE");
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  createProduct,
  deleteProduct,
  listProducts,
  setArchiveState,
  updateProduct,
};
