const router = require("express").Router();
const db = require("../config/db");
const {
    computeAvailableServings,
    deriveManualOverrideState,
    fetchMenuIngredients,
    normalizeMenuIngredients,
    replaceMenuIngredients,
    resolveProductAvailabilityStatus,
} = require("../utils/menuAvailability");
const {
    MENU_ITEM,
    STOCK_ITEM,
    getProductItemTypeExpression,
    normalizeItemType,
    assertProductsMatchItemType,
} = require("../utils/productItemType");
const { ensureProductSchema } = require("../services/productSchemaService");
const {
    buildProductCacheKey,
    cache,
    getProductCacheTtlMs,
    invalidateProductCache,
    PRODUCT_CACHE_PREFIX,
} = require("../services/cacheService");
const {
    isDevelopmentTimingEnabled,
    runWithDbQueryTiming,
} = require("../services/requestTiming");
const {
    requireAdministratorAccess,
    requireInventoryManagerAccess,
} = require("../middleware/staffAccess");
const {
    directStockUpdateResponse,
    findDirectStockQuantityFields,
} = require("../utils/stockMutationPolicy");
const {
    CHICKEN_FLAVORS_SYSTEM_KEY,
    normalizeSystemKey,
} = require("../services/systemMenuCategoryService");
const {
    REDESIGNED_SCHEMA_PROFILE,
    getSchemaProfile,
} = require("../db/schemaProfile");
const redesignedProductHandlers = require("./redesignedProductHandlers");

const PRODUCT_NAME_MAX_LENGTH = 100;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 100;
const RAW_MATERIAL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9' -]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;
const DEFAULT_INVENTORY_UNIT = "piece";

function isRedesignedProfile() {
    return getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
}

function normalizeProductName(value, { stockOnly = false } = {}) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        throw new Error("Product name is required.");
    }
    if (normalized.length < 2) {
        throw new Error("Product name must be at least 2 characters.");
    }
    if (normalized.length > PRODUCT_NAME_MAX_LENGTH) {
        throw new Error("Product name must not exceed 100 characters.");
    }
    if (stockOnly && !RAW_MATERIAL_NAME_PATTERN.test(normalized)) {
        throw new Error(
            "Material name may only use letters, numbers, spaces, apostrophes, and hyphens.",
        );
    }
    return normalized;
}

function normalizeProductDescription(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) return null;
    if (normalized.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
        throw new Error("Description must not exceed 100 characters.");
    }
    return normalized;
}

function normalizeProductCategory(value, { required = false } = {}) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        if (required) throw new Error("Category is required for menu items.");
        return null;
    }
    if (normalized.length > 150) {
        throw new Error("Category must not exceed 150 characters.");
    }
    return normalized;
}

async function lockConfiguredCategoryForAssignment(
    connection,
    categoryName,
    itemType,
) {
    const normalizedName = String(categoryName ?? "").trim();
    if (!normalizedName) return;
    const tableName = itemType === MENU_ITEM
        ? "menu_categories"
        : "inventory_categories";
    const label = itemType === MENU_ITEM ? "Menu" : "Inventory";
    const [rows] = await connection.query(
        `SELECT category_id
         FROM ${tableName}
         WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
         LIMIT 1
         LOCK IN SHARE MODE`,
        [normalizedName],
    );
    if (rows.length === 0) {
        const error = new Error(
            `${label} category "${normalizedName}" no longer exists. Refresh the category list and choose another category.`,
        );
        error.statusCode = 409;
        throw error;
    }
}

async function getMenuCategorySystemKey(database, categoryName) {
    const normalizedName = String(categoryName ?? "").trim();
    if (!normalizedName) return "";
    const [rows] = await database.query(
        `SELECT system_key
           FROM menu_categories
          WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
          LIMIT 1`,
        [normalizedName],
    );
    return normalizeSystemKey(rows[0]?.system_key);
}

function normalizeInventoryUnit(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        return DEFAULT_INVENTORY_UNIT;
    }
    if (normalized.length > 30) {
        throw new Error("Unit must not exceed 30 characters.");
    }
    return normalized;
}

function normalizeInventoryQuantity(value, label = "quantity") {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
        throw new Error(`Invalid ${label} value`);
    }
    if (
        normalized > 9999999999.9999 ||
        Math.abs(normalized * 10000 - Math.round(normalized * 10000)) > 1e-7
    ) {
        throw new Error(
            `${label} must fit DECIMAL(14,4) and use at most 4 decimal places`,
        );
    }
    return Math.round(normalized * 10000) / 10000;
}

function normalizeCurrencyAmount(value, label = "price") {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
        throw new Error(`Invalid ${label} value`);
    }
    if (
        normalized > 99999999.99 ||
        Math.abs(normalized * 100 - Math.round(normalized * 100)) > 1e-7
    ) {
        throw new Error(
            `${label} must fit DECIMAL(10,2) and use at most 2 decimal places`,
        );
    }
    return Math.round(normalized * 100) / 100;
}

function normalizeProductImageValue(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const normalized = String(value).trim();
    if (!normalized) return null;
    if (/^data:image\//i.test(normalized)) {
        throw new Error(
            "Base64 product images are not supported. Upload the image first and save the returned file path.",
        );
    }
    return normalized;
}

async function assertUniqueProductName(database, name, excludeId = null) {
    const params = [String(name).trim()];
    let exclusion = "";
    if (excludeId !== null) {
        exclusion = " AND id <> ?";
        params.push(Number(excludeId));
    }

    const [rows] = await database.query(
        `SELECT id
           FROM products
          WHERE LOWER(TRIM(name)) = LOWER(?)${exclusion}
          LIMIT 1`,
        params,
    );
    if (rows.length > 0) {
        const error = new Error(`A product named "${String(name).trim()}" already exists.`);
        error.statusCode = 409;
        throw error;
    }
}

function sanitizeProductImageValue(value) {
    const normalized = String(value || "").trim();
    if (!normalized || /^data:image\//i.test(normalized)) {
        return "/img/placeholder.jpg";
    }
    return normalized;
}

function normalizeAvailabilityStatus(value) {
    const normalized = String(value || "Available").trim().toLowerCase();
    return normalized === "hidden" || normalized === "unavailable"
        ? "Hidden"
        : "Available";
}

function parseItemTypeInput(value, fallback = STOCK_ITEM) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return fallback;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === STOCK_ITEM || normalized === MENU_ITEM) {
        return normalized;
    }

    throw new Error("item_type must be either stock_item or menu_item");
}

function normalizeBooleanFlag(value, fallback = true) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return fallback;
}

function normalizePromoValues(isPromotional, promoPrice, promoLabel) {
    const enabled =
        isPromotional === true ||
        isPromotional === 1 ||
        String(isPromotional || "").toLowerCase() === "true" ||
        String(isPromotional || "") === "1";

    const normalizedPromoPriceInput =
        promoPrice === undefined || promoPrice === null || promoPrice === ""
            ? null
            : Number(promoPrice);

    const normalizedPromoPrice =
        normalizedPromoPriceInput === null
            ? null
            : normalizeCurrencyAmount(normalizedPromoPriceInput, "promo price");

    if (
        normalizedPromoPrice !== null &&
        (!Number.isFinite(normalizedPromoPrice) || normalizedPromoPrice < 0)
    ) {
        throw new Error("Invalid promo price value");
    }

    return {
        isPromotional: enabled ? 1 : 0,
        promoPrice: enabled ? normalizedPromoPrice : null,
        promoLabel: enabled
            ? String(promoLabel || "").trim() || null
            : null,
    };
}

function enrichIngredientAvailability(rows, ingredientMap) {
    return rows.map((row) => {
        const ingredients = (ingredientMap.get(Number(row.id)) ?? []).filter(
            (ingredient) => String(ingredient.item_type || STOCK_ITEM) === STOCK_ITEM,
        );
        const availableServings = computeAvailableServings(ingredients);
        const availabilityStatus = resolveProductAvailabilityStatus(row, ingredients);
        const directStock = Math.max(0, Number(row.remainingStock ?? 0));
        const effectiveStock = ingredients.length > 0
            ? Math.max(0, Math.floor(availableServings ?? 0))
            : Math.floor(directStock);
        return {
            ...row,
            image: sanitizeProductImageValue(row.image),
            ingredient_count: ingredients.length,
            available_servings: ingredients.length > 0 ? effectiveStock : null,
            availability_status: availabilityStatus,
            available: availabilityStatus === "Available",
            remainingStock: effectiveStock,
            ingredients,
        };
    });
}

async function attachIngredientAvailability(rows, database = db) {
    const ingredientMap = await fetchMenuIngredients(
        database,
        rows.map((row) => row.id),
    );
    return enrichIngredientAvailability(rows, ingredientMap);
}

async function measureOperation(timings, label, operation) {
    const startedAt = process.hrtime.bigint();
    try {
        return await operation();
    } finally {
        timings[label] = Number(process.hrtime.bigint() - startedAt) / 1e6;
    }
}

function logProductTimings(timings, queryTiming, totalMs) {
    if (!isDevelopmentTimingEnabled()) return;

    const querySummary = (queryTiming?.queries ?? [])
        .map(
            (query, index) =>
                `q${index + 1}:${query.operation}=${query.durationMs.toFixed(1)}ms`,
        )
        .join(" ");
    const operationSummary = Object.entries(timings)
        .map(([label, durationMs]) => `${label}=${durationMs.toFixed(1)}ms`)
        .join(" ");

    console.info(
        `[TIMING] products ${operationSummary} dbQueries=${
            queryTiming?.queries?.length ?? 0
        } ${querySummary} total=${totalMs.toFixed(1)}ms`,
    );
}

// GET all products (old backend used `products` table)
router.get("/", (req, res) => {
    if (isRedesignedProfile()) {
        return redesignedProductHandlers.listProducts(req, res);
    }
    return runWithDbQueryTiming(async (queryTiming) => {
    const startedAt = process.hrtime.bigint();
    const timings = {};
    try {
        const requestedItemType = String(req.query.item_type || "")
            .trim()
            .toLowerCase();
        const includeRaw = String(req.query.includeRaw || "").toLowerCase();
        const includeRawMaterials = includeRaw === "1" || includeRaw === "true";
        const normalizedItemType =
            requestedItemType === STOCK_ITEM || requestedItemType === MENU_ITEM
                ? requestedItemType
                : "";
        const cacheKey = buildProductCacheKey({
            itemType: normalizedItemType,
            includeRawMaterials,
        });
        const cachedProducts = await cache.get(cacheKey);
        if (cachedProducts !== null) {
            await measureOperation(timings, "serialization", async () => {
                JSON.stringify(cachedProducts);
            });
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            console.info(
                `[CACHE HIT] products key=${cacheKey} durationMs=${durationMs.toFixed(1)}`,
            );
            return res.json(cachedProducts);
        }
        const cacheVersion = cache.getPrefixVersion(PRODUCT_CACHE_PREFIX);

        // Startup initialization guarantees the item_type column before the
        // server accepts traffic. Reads never perform schema maintenance.
        const itemTypeExpr = getProductItemTypeExpression(true, "p", "m");
        const filters = [];
        const values = [];

        if (normalizedItemType) {
            filters.push(`${itemTypeExpr} = ?`);
            values.push(normalizedItemType);
            if (normalizedItemType === MENU_ITEM) {
                filters.push("m.Product_ID IS NOT NULL");
            }
        }

        if (!includeRawMaterials) {
            filters.push("COALESCE(m.Promo, '') <> 'RAW_MATERIAL'");
        }

        const whereClause = filters.length > 0
            ? `WHERE ${filters.join(" AND ")}`
            : "";

        const [rows] = await measureOperation(timings, "productQuery", () =>
            db.query(
                `SELECT
                p.*,
                ${itemTypeExpr} AS item_type,
                m.Category_Name AS category,
                mc.system_key AS category_system_key,
                m.Promo AS inventoryPromo,
                COALESCE(NULLIF(TRIM(i.unit), ''), 'piece') AS unit,
                COALESCE(i.Stock, 0) AS stock,
                COALESCE(i.Daily_Withdrawn, 0) AS dailyWithdrawn,
                CAST(CASE
                    WHEN ${itemTypeExpr} = '${STOCK_ITEM}' THEN COALESCE(i.Stock, 0)
                    ELSE COALESCE(i.Stock, 0)
                END AS DECIMAL(14,4)) AS remainingStock,
                COALESCE(m.manual_override, 0) AS manual_override,
                COALESCE(m.manual_status, 'Available') AS manual_status
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             LEFT JOIN menu_categories mc
               ON LOWER(TRIM(mc.name)) = LOWER(TRIM(m.Category_Name))
             LEFT JOIN Inventory i ON i.Product_ID = p.id
                 ${whereClause}`,
                values,
            ),
        );

        let ingredientMap;
        await measureOperation(timings, "ingredientQuery", async () => {
            ingredientMap = await fetchMenuIngredients(
                db,
                rows.map((row) => row.id),
            );
        });
        const products = await measureOperation(
            timings,
            "availabilityCalculation",
            async () => enrichIngredientAvailability(
                rows.map((row) => ({
                    ...row,
                    unit: normalizeInventoryUnit(row.unit),
                })),
                ingredientMap,
            ),
        );
        await cache.setIfPrefixVersion(
            cacheKey,
            products,
            getProductCacheTtlMs(),
            PRODUCT_CACHE_PREFIX,
            cacheVersion,
        );
        await measureOperation(timings, "serialization", async () => {
            JSON.stringify(products);
        });
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        logProductTimings(timings, queryTiming, durationMs);
        console.info(
            `[CACHE MISS] products key=${cacheKey} durationMs=${durationMs.toFixed(1)}`,
        );
        return res.json(products);
    } catch (err) {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        logProductTimings(timings, queryTiming, durationMs);
        console.error(err);
        return res.status(500).json({ message: 'DB error', error: err.message });
    }
    });
});

// ADD product
router.post("/", requireInventoryManagerAccess, async (req, res) => {
    if (isRedesignedProfile()) {
        return redesignedProductHandlers.createProduct(req, res);
    }
    let conn;
    try {
        const hasItemTypeColumn = await ensureProductSchema(db);
        const {
            name,
            price,
            quantity,
            description,
            category,
            raw_material,
            item_type,
            image,
            availability_status,
            is_promotional,
            promo_price,
            promo_label,
            manual_override,
            manual_status,
            override_mode,
            ingredients,
            use_default_thresholds,
            low_stock_threshold,
            critical_stock_threshold,
            unit,
        } = req.body;

        let normalizedAvailabilityStatus = normalizeAvailabilityStatus(
            availability_status,
        );
        const normalizedImage = normalizeProductImageValue(image);
        let normalizedIngredients = normalizeMenuIngredients(ingredients);
        const normalizedItemType = parseItemTypeInput(item_type, STOCK_ITEM);
        let manualOverrideState = deriveManualOverrideState({
            manual_override,
            manual_status,
            override_mode,
            availability_status,
        });
        if (normalizedIngredients !== null && normalizedItemType !== MENU_ITEM) {
            return res.status(400).json({
                message: "Ingredients can only be assigned to menu_item products",
            });
        }
        const normalizedName = normalizeProductName(name, {
            stockOnly: normalizedItemType === STOCK_ITEM,
        });
        await assertUniqueProductName(db, normalizedName);
        const normalizedDescription = normalizeProductDescription(description);
        const normalizedProductCategory = normalizeProductCategory(category, {
            required: normalizedItemType === MENU_ITEM,
        });
        const isChickenFlavor =
            normalizedItemType === MENU_ITEM &&
            (await getMenuCategorySystemKey(db, normalizedProductCategory)) ===
                CHICKEN_FLAVORS_SYSTEM_KEY;
        if (isChickenFlavor) {
            normalizedIngredients = null;
            normalizedAvailabilityStatus = "Available";
            manualOverrideState = { manualOverride: 0, manualStatus: "Available" };
        } else if (normalizedIngredients !== null) {
            await assertProductsMatchItemType(
                db,
                normalizedIngredients.map((ingredient) => ingredient.productId),
                STOCK_ITEM,
                "Ingredient",
            );
        }
        const normalizedUnit = normalizeInventoryUnit(unit);
        const normalizedPromo = isChickenFlavor
            ? { isPromotional: 0, promoPrice: null, promoLabel: null }
            : normalizePromoValues(is_promotional, promo_price, promo_label);
        const safePriceInput =
            price === undefined || price === null || price === ""
                ? 0
                : Number(price);
        const safePrice = isChickenFlavor
            ? 0
            : normalizeCurrencyAmount(safePriceInput);
        const safeQuantityInput =
            quantity === undefined || quantity === null || quantity === ""
                ? 0
                : Number(quantity);
        const safeQuantity = isChickenFlavor
            ? 0
            : normalizeInventoryQuantity(safeQuantityInput);
        if (safeQuantity > 0) {
            return res
                .status(400)
                .json(directStockUpdateResponse(["quantity"]));
        }
        if (normalizedItemType === MENU_ITEM && !isChickenFlavor && safePrice < 1) {
            return res.status(400).json({ message: "Price must be at least \u20B11." });
        }
        if (
            normalizedPromo.promoPrice !== null &&
            (!Number.isFinite(Number(normalizedPromo.promoPrice)) ||
                Number(normalizedPromo.promoPrice) < 1)
        ) {
            return res.status(400).json({
                message: "Promo price must be at least \u20B11.",
            });
        }
        const useDefaultThresholds = normalizeBooleanFlag(
            use_default_thresholds,
            true,
        );
        const lowStockThreshold =
            low_stock_threshold === undefined ||
            low_stock_threshold === null ||
            low_stock_threshold === ""
                ? null
                : Number(low_stock_threshold);
        const criticalStockThreshold =
            critical_stock_threshold === undefined ||
            critical_stock_threshold === null ||
            critical_stock_threshold === ""
                ? null
                : Number(critical_stock_threshold);

        if (
            lowStockThreshold !== null &&
            (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0)
        ) {
            return res.status(400).json({ message: "Invalid low stock threshold value" });
        }
        if (
            criticalStockThreshold !== null &&
            (!Number.isFinite(criticalStockThreshold) || criticalStockThreshold < 0)
        ) {
            return res.status(400).json({ message: "Invalid critical stock threshold value" });
        }
        if (
            lowStockThreshold !== null &&
            criticalStockThreshold !== null &&
            criticalStockThreshold > lowStockThreshold
        ) {
            return res.status(400).json({
                message: "Critical threshold cannot be greater than warning threshold",
            });
        }

        const insertColumns = [
            "name",
            "price",
            "quantity",
            "description",
            "image",
            "availability_status",
            "is_promotional",
            "promo_price",
            "promo_label",
        ];
        const insertValues = [
            normalizedName,
            safePrice,
            safeQuantity,
            normalizedDescription,
            normalizedImage ?? null,
            normalizedAvailabilityStatus,
            normalizedPromo.isPromotional,
            normalizedPromo.promoPrice,
            normalizedPromo.promoLabel,
        ];
        if (hasItemTypeColumn) {
            insertColumns.push("item_type");
            insertValues.push(normalizedItemType);
        }

        conn = await db.getConnection();
        await conn.beginTransaction();
        await lockConfiguredCategoryForAssignment(
            conn,
            normalizedProductCategory,
            normalizedItemType,
        );
        await assertUniqueProductName(conn, normalizedName);

        const [result] = await conn.query(
            `INSERT INTO products (${insertColumns.join(", ")})
             VALUES (${insertColumns.map(() => "?").join(",")})`,
            insertValues,
        );

        const newId = result.insertId;
        await conn.query(
            "UPDATE products SET menu_code = CONCAT('M-', LPAD(id, 3, '0')) WHERE id = ?",
            [newId],
        );
        const normalizedCategory = String(normalizedProductCategory || "")
            .toLowerCase()
            .trim();
        const promoTag = normalizedItemType === MENU_ITEM
            ? "MENU FOOD"
            : raw_material
                ? "RAW_MATERIAL"
                : normalizedCategory.includes("suppl")
                ? "SUPPLIES"
                : "FINISHED_GOODS";

        // also insert into Menu so that inventory batches can reference this product
        // we explicitly set Product_ID to keep both tables aligned. If the
        // Menu table has an auto-increment counter lower than newId this will
        // bump it automatically.
        await conn.query(
            `INSERT INTO Menu
                (Product_ID, Product_Name, Category_Name, Price, Stock, Promo, manual_override, manual_status)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
                newId,
                normalizedName,
                normalizedProductCategory,
                safePrice,
                safeQuantity,
                promoTag,
                manualOverrideState?.manualOverride ?? 0,
                manualOverrideState?.manualStatus ?? "Available",
            ]
        );

        if (!isChickenFlavor) {
            await conn.query(
                `INSERT INTO Inventory (
                Product_ID,
                Quantity,
                Stock,
                Reorder_Point,
                Critical_Point,
                Item_Purchased,
                use_default_thresholds,
                low_stock_threshold,
                critical_stock_threshold,
                unit
            )
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                Quantity = VALUES(Quantity),
                Stock = VALUES(Stock),
                Reorder_Point = VALUES(Reorder_Point),
                Critical_Point = VALUES(Critical_Point),
                Item_Purchased = VALUES(Item_Purchased),
                use_default_thresholds = VALUES(use_default_thresholds),
                low_stock_threshold = VALUES(low_stock_threshold),
                critical_stock_threshold = VALUES(critical_stock_threshold),
                unit = VALUES(unit)`,
            [
                newId,
                safeQuantity,
                safeQuantity,
                20,
                5,
                normalizedName,
                useDefaultThresholds ? 1 : 0,
                lowStockThreshold,
                criticalStockThreshold,
                normalizedUnit,
                ],
            );
        }

        if (normalizedIngredients !== null) {
            await replaceMenuIngredients(conn, newId, normalizedIngredients);
        }

        await conn.commit();
        await invalidateProductCache("product created");
        res.status(201).json({ message: "Product added", id: newId });
    } catch (err) {
        if (conn) await conn.rollback();
        if (err?.statusCode) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        if (err && err.message === "Invalid promo price value") {
            return res.status(400).json({ message: err.message });
        }
        if (
            err &&
            (err.message === "item_type must be either stock_item or menu_item" ||
                err.message ===
                    "Base64 product images are not supported. Upload the image first and save the returned file path." ||
                err.message === "ingredients must be an array" ||
                err.message === "Each ingredient must include a valid product_id" ||
                err.message === "Each ingredient must include a positive quantity_required" ||
                /DECIMAL\(14,4\)|at most 4 decimal places/i.test(err.message) ||
                err.message === "Invalid quantity value" ||
                err.message === "Invalid price value" ||
                /DECIMAL\(10,2\)|at most 2 decimal places/i.test(err.message) ||
                err.message === "Product name is required." ||
                err.message === "Product name must be at least 2 characters." ||
                err.message === "Product name must not exceed 100 characters." ||
                err.message === "Unit must not exceed 30 characters." ||
                err.message === "Description must not exceed 100 characters." ||
                err.message === "Category is required for menu items." ||
                err.message === "Category must not exceed 150 characters." ||
                /Force Available is no longer supported/i.test(err.message) ||
                err.message ===
                    "Material name may only use letters, numbers, spaces, apostrophes, and hyphens." ||
                /must be (stock_item|menu_item)|was not found/i.test(err.message))
        ) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

// UPDATE product
router.put("/:id", requireInventoryManagerAccess, async (req, res) => {
    if (isRedesignedProfile()) {
        return redesignedProductHandlers.updateProduct(req, res);
    }
    let conn;
    try {
        const productId = Number(req.params.id);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }
        const directStockFields = findDirectStockQuantityFields(req.body);
        if (directStockFields.length > 0) {
            return res
                .status(400)
                .json(directStockUpdateResponse(directStockFields));
        }

        const hasItemTypeColumn = await ensureProductSchema(db);
        const itemTypeSelect = hasItemTypeColumn
            ? "p.item_type AS item_type"
            : "NULL AS item_type";
        const [[existingProduct]] = await db.query(
            `SELECT ${itemTypeSelect}, p.price, p.name, p.quantity,
                    m.Category_Name AS category, mc.system_key AS category_system_key
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             LEFT JOIN menu_categories mc
               ON LOWER(TRIM(mc.name)) = LOWER(TRIM(m.Category_Name))
             WHERE p.id = ?
             LIMIT 1`,
            [productId],
        );
        if (!existingProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        const {
            name,
            price,
            description,
            category,
            image,
            item_type,
            availability_status,
            is_promotional,
            promo_price,
            promo_label,
            manual_override,
            manual_status,
            override_mode,
            ingredients,
            use_default_thresholds,
            low_stock_threshold,
            critical_stock_threshold,
            unit,
        } = req.body;

        const effectiveTargetItemType = parseItemTypeInput(
            item_type,
            normalizeItemType(existingProduct.item_type, MENU_ITEM),
        );
        const targetCategorySystemKey = category !== undefined
            ? await getMenuCategorySystemKey(db, category)
            : normalizeSystemKey(existingProduct.category_system_key);
        const isChickenFlavor =
            effectiveTargetItemType === MENU_ITEM &&
            targetCategorySystemKey === CHICKEN_FLAVORS_SYSTEM_KEY;

        if (
            effectiveTargetItemType === MENU_ITEM &&
            availability_status !== undefined &&
            normalizeAvailabilityStatus(availability_status) === "Hidden"
        ) {
            return res.status(409).json({
                message: "Use the dedicated archive endpoint to hide a menu item.",
            });
        }

        const productFields = [];
        const productValues = [];
        const menuFields = [];
        const menuValues = [];
        let normalizedCategoryForLock = null;
        const inventoryFields = [];
        const inventoryValues = [];

        if (name !== undefined) {
            const safeName = normalizeProductName(name, {
                stockOnly: effectiveTargetItemType === STOCK_ITEM,
            });
            await assertUniqueProductName(db, safeName, productId);
            productFields.push("name = ?");
            productValues.push(safeName);
            menuFields.push("Product_Name = ?");
            menuValues.push(safeName);
            inventoryFields.push("Item_Purchased = ?");
            inventoryValues.push(safeName);
        }

        if (unit !== undefined && !isChickenFlavor) {
            inventoryFields.push("unit = ?");
            inventoryValues.push(normalizeInventoryUnit(unit));
        }

        if (price !== undefined || isChickenFlavor) {
            const safePrice = isChickenFlavor ? 0 : normalizeCurrencyAmount(price);
            productFields.push("price = ?");
            productValues.push(safePrice);
            menuFields.push("Price = ?");
            menuValues.push(safePrice);
        }

        if (
            use_default_thresholds !== undefined ||
            low_stock_threshold !== undefined ||
            critical_stock_threshold !== undefined
        ) {
            const useDefaultThresholds = normalizeBooleanFlag(
                use_default_thresholds,
                true,
            );
            const lowStockThreshold =
                low_stock_threshold === undefined ||
                low_stock_threshold === null ||
                low_stock_threshold === ""
                    ? null
                    : Number(low_stock_threshold);
            const criticalStockThreshold =
                critical_stock_threshold === undefined ||
                critical_stock_threshold === null ||
                critical_stock_threshold === ""
                    ? null
                    : Number(critical_stock_threshold);

            if (
                lowStockThreshold !== null &&
                (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0)
            ) {
                return res.status(400).json({ message: "Invalid low stock threshold value" });
            }
            if (
                criticalStockThreshold !== null &&
                (!Number.isFinite(criticalStockThreshold) || criticalStockThreshold < 0)
            ) {
                return res.status(400).json({ message: "Invalid critical stock threshold value" });
            }
            if (
                lowStockThreshold !== null &&
                criticalStockThreshold !== null &&
                criticalStockThreshold > lowStockThreshold
            ) {
                return res.status(400).json({
                    message: "Critical threshold cannot be greater than warning threshold",
                });
            }

            if (use_default_thresholds !== undefined) {
                inventoryFields.push("use_default_thresholds = ?");
                inventoryValues.push(useDefaultThresholds ? 1 : 0);
            }
            if (low_stock_threshold !== undefined) {
                inventoryFields.push("low_stock_threshold = ?");
                inventoryValues.push(lowStockThreshold);
            }
            if (critical_stock_threshold !== undefined) {
                inventoryFields.push("critical_stock_threshold = ?");
                inventoryValues.push(criticalStockThreshold);
            }
        }

        if (description !== undefined) {
            const safeDescription = normalizeProductDescription(description);
            productFields.push("description = ?");
            productValues.push(safeDescription);
        }

        const normalizedImage =
            image !== undefined ? normalizeProductImageValue(image) : undefined;

        if (normalizedImage !== undefined) {
            productFields.push("image = ?");
            productValues.push(normalizedImage);
        }

        if (availability_status !== undefined && !isChickenFlavor) {
            productFields.push("availability_status = ?");
            productValues.push(normalizeAvailabilityStatus(availability_status));
        }

        const manualOverrideState = isChickenFlavor
            ? { manualOverride: 0, manualStatus: "Available" }
            : deriveManualOverrideState({
                manual_override,
                manual_status,
                override_mode,
                availability_status,
            });
        if (manualOverrideState) {
            menuFields.push("manual_override = ?");
            menuValues.push(manualOverrideState.manualOverride);
            menuFields.push("manual_status = ?");
            menuValues.push(manualOverrideState.manualStatus);
        }

        const normalizedIngredients = isChickenFlavor
            ? null
            : normalizeMenuIngredients(ingredients);
        const effectivePrice =
            price !== undefined ? Number(price) : Number(existingProduct.price ?? 0);
        if (!Number.isFinite(effectivePrice) || effectivePrice < 0) {
            return res.status(400).json({ message: "Invalid price value" });
        }
        if (effectiveTargetItemType === MENU_ITEM && !isChickenFlavor && effectivePrice < 1) {
            return res.status(400).json({ message: "Price must be at least \u20B11." });
        }
        if (normalizedIngredients !== null) {
            if (effectiveTargetItemType !== MENU_ITEM) {
                return res.status(400).json({
                    message: "Ingredients can only be assigned to menu_item products",
                });
            }
            await assertProductsMatchItemType(
                db,
                normalizedIngredients.map((ingredient) => ingredient.productId),
                STOCK_ITEM,
                "Ingredient",
            );
        }
        if (item_type !== undefined && hasItemTypeColumn) {
            productFields.push("item_type = ?");
            productValues.push(effectiveTargetItemType);
        }

        if (
            is_promotional !== undefined ||
            promo_price !== undefined ||
            promo_label !== undefined
        ) {
            const normalizedPromo = isChickenFlavor
                ? { isPromotional: 0, promoPrice: null, promoLabel: null }
                : normalizePromoValues(is_promotional, promo_price, promo_label);
            if (
                normalizedPromo.promoPrice !== null &&
                (!Number.isFinite(Number(normalizedPromo.promoPrice)) ||
                    Number(normalizedPromo.promoPrice) < 1)
            ) {
                return res.status(400).json({
                    message: "Promo price must be at least \u20B11.",
                });
            }
            productFields.push("is_promotional = ?");
            productValues.push(normalizedPromo.isPromotional);
            productFields.push("promo_price = ?");
            productValues.push(normalizedPromo.promoPrice);
            productFields.push("promo_label = ?");
            productValues.push(normalizedPromo.promoLabel);
        }

        if (category !== undefined) {
            const normalizedProductCategory = normalizeProductCategory(category, {
                required: effectiveTargetItemType === MENU_ITEM,
            });
            menuFields.push("Category_Name = ?");
            menuValues.push(normalizedProductCategory);
            normalizedCategoryForLock = normalizedProductCategory;
        }

        if (
            productFields.length === 0 &&
            menuFields.length === 0 &&
            inventoryFields.length === 0 &&
            normalizedIngredients === null
        ) {
            return res.status(400).json({ message: "No fields to update" });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();

        if (category !== undefined) {
            await lockConfiguredCategoryForAssignment(
                conn,
                normalizedCategoryForLock,
                effectiveTargetItemType,
            );
        }

        if (name !== undefined) {
            await assertUniqueProductName(conn, productValues[0], productId);
        }

        if (productFields.length > 0) {
            await conn.query(
                `UPDATE products SET ${productFields.join(", ")} WHERE id = ?`,
                [...productValues, productId],
            );
        }

        await assertProductsMatchItemType(
            conn,
            [productId],
            effectiveTargetItemType,
            effectiveTargetItemType === MENU_ITEM ? "Menu" : "Stock",
        );

        if (menuFields.length > 0) {
            await conn.query(
                `UPDATE Menu SET ${menuFields.join(", ")} WHERE Product_ID = ?`,
                [...menuValues, productId],
            );
        }

        if (effectiveTargetItemType === STOCK_ITEM || inventoryFields.length > 0) {
            const [[existingInventory]] = await conn.query(
                `SELECT Inventory_ID
                 FROM Inventory
                 WHERE Product_ID = ?
                 LIMIT 1`,
                [productId],
            );
            if (!existingInventory) {
                const fallbackQuantity = Number(existingProduct.quantity ?? 0);
                const fallbackItemPurchased =
                    name !== undefined
                        ? normalizeProductName(name, {
                              stockOnly: effectiveTargetItemType === STOCK_ITEM,
                          })
                        : String(existingProduct.name ?? "").trim() || "Unnamed Product";
                const fallbackUnit =
                    unit !== undefined
                        ? normalizeInventoryUnit(unit)
                        : DEFAULT_INVENTORY_UNIT;
                const fallbackUseDefaultThresholds =
                    use_default_thresholds !== undefined
                        ? normalizeBooleanFlag(use_default_thresholds, true)
                        : true;
                const fallbackLowStockThreshold =
                    low_stock_threshold === undefined ||
                    low_stock_threshold === null ||
                    low_stock_threshold === ""
                        ? null
                        : Number(low_stock_threshold);
                const fallbackCriticalStockThreshold =
                    critical_stock_threshold === undefined ||
                    critical_stock_threshold === null ||
                    critical_stock_threshold === ""
                        ? null
                        : Number(critical_stock_threshold);
                await conn.query(
                    `INSERT INTO Inventory (
                        Product_ID,
                        Quantity,
                        Stock,
                        Reorder_Point,
                        Critical_Point,
                        Item_Purchased,
                        use_default_thresholds,
                        low_stock_threshold,
                        critical_stock_threshold,
                        unit
                    )
                    VALUES (?, ?, ?, 20, 5, ?, ?, ?, ?, ?)`,
                    [
                        productId,
                        fallbackQuantity,
                        fallbackQuantity,
                        fallbackItemPurchased,
                        fallbackUseDefaultThresholds ? 1 : 0,
                        fallbackLowStockThreshold,
                        fallbackCriticalStockThreshold,
                        fallbackUnit,
                    ],
                );
            }
            if (inventoryFields.length > 0) {
                inventoryFields.push("Last_Update = NOW()");
                await conn.query(
                    `UPDATE Inventory SET ${inventoryFields.join(", ")} WHERE Product_ID = ?`,
                    [...inventoryValues, productId],
                );
            }
        }

        if (normalizedIngredients !== null) {
            await replaceMenuIngredients(conn, productId, normalizedIngredients);
        }

        const responseItemTypeExpr = getProductItemTypeExpression(
            hasItemTypeColumn,
            "p",
            "m",
        );
        const [rows] = await conn.query(
            `SELECT p.*, m.Category_Name AS category,
                    COALESCE(NULLIF(TRIM(i.unit), ''), 'piece') AS unit,
                    CAST(CASE
                        WHEN ${responseItemTypeExpr} = '${STOCK_ITEM}' THEN COALESCE(i.Stock, 0)
                        ELSE COALESCE(i.Stock, 0)
                    END AS DECIMAL(14,4)) AS remainingStock,
                    COALESCE(m.manual_override, 0) AS manual_override,
                    COALESCE(m.manual_status, 'Available') AS manual_status
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             LEFT JOIN Inventory i ON i.Product_ID = p.id
             WHERE p.id = ?`,
            [productId],
        );

        if (rows.length === 0) {
            const error = new Error("Product not found after update");
            error.statusCode = 404;
            throw error;
        }

        const [enrichedRow] = await attachIngredientAvailability(rows, conn);
        await conn.commit();
        await invalidateProductCache("product updated");
        res.json(enrichedRow);
    } catch (err) {
        if (conn) await conn.rollback();
        if (err?.statusCode) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        if (err && err.message === "Invalid promo price value") {
            return res.status(400).json({ message: err.message });
        }
        if (
            err &&
            (err.message === "item_type must be either stock_item or menu_item" ||
                err.message ===
                    "Base64 product images are not supported. Upload the image first and save the returned file path." ||
                err.message === "ingredients must be an array" ||
                err.message === "Each ingredient must include a valid product_id" ||
                err.message === "Each ingredient must include a positive quantity_required" ||
                /DECIMAL\(14,4\)|at most 4 decimal places/i.test(err.message) ||
                err.message === "Invalid quantity value" ||
                err.message === "Invalid price value" ||
                /DECIMAL\(10,2\)|at most 2 decimal places/i.test(err.message) ||
                err.message === "Product name is required." ||
                err.message === "Product name must be at least 2 characters." ||
                err.message === "Product name must not exceed 100 characters." ||
                err.message === "Unit must not exceed 30 characters." ||
                err.message === "Description must not exceed 100 characters." ||
                err.message === "Category is required for menu items." ||
                err.message === "Category must not exceed 150 characters." ||
                /Force Available is no longer supported/i.test(err.message) ||
                err.message ===
                    "Material name may only use letters, numbers, spaces, apostrophes, and hyphens." ||
                /must be (stock_item|menu_item)|was not found/i.test(err.message))
        ) {
            return res.status(400).json({ message: err.message });
        }
        console.error("PUT /products/:id error:", err);
        res.status(500).json({ message: 'DB error', error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

async function setMenuItemArchiveState(req, res, archived) {
    if (isRedesignedProfile()) {
        return redesignedProductHandlers.setArchiveState(req, res, archived);
    }
    let conn;
    let transactionStarted = false;
    try {
        await ensureProductSchema(db);
        const productId = Number(req.params.id);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const itemTypeExpr = getProductItemTypeExpression(true, "p", "m");
        conn = await db.getConnection();
        await conn.beginTransaction();
        transactionStarted = true;
        const [rows] = await conn.query(
            `SELECT p.id, p.name, p.availability_status, ${itemTypeExpr} AS item_type
               FROM products p
               LEFT JOIN Menu m ON m.Product_ID = p.id
              WHERE p.id = ?
              LIMIT 1
              FOR UPDATE`,
            [productId],
        );
        const product = rows[0];
        if (!product) {
            await conn.rollback();
            transactionStarted = false;
            return res.status(404).json({ message: "Product not found" });
        }
        if (normalizeItemType(product.item_type, STOCK_ITEM) !== MENU_ITEM) {
            await conn.rollback();
            transactionStarted = false;
            return res.status(400).json({
                message: "Only menu items can be archived from Menu Management.",
            });
        }

        const nextStatus = archived ? "Hidden" : "Available";
        await conn.query(
            "UPDATE products SET availability_status = ? WHERE id = ?",
            [nextStatus, productId],
        );
        await conn.commit();
        transactionStarted = false;
        await invalidateProductCache(archived ? "product archived" : "product restored");
        return res.json({
            id: productId,
            availability_status: nextStatus,
            archived,
            message: archived
                ? "Menu item archived. Historical records were preserved."
                : "Menu item restored. Live ingredient and stock availability still applies.",
        });
    } catch (err) {
        if (conn && transactionStarted) await conn.rollback();
        console.error(
            `${archived ? "ARCHIVE" : "RESTORE"} /products/:id error:`,
            err,
        );
        return res.status(500).json({ message: "DB error", error: err.message });
    } finally {
        if (conn) conn.release();
    }
}

router.patch("/:id/archive", requireAdministratorAccess, (req, res) =>
    setMenuItemArchiveState(req, res, true),
);

router.patch("/:id/restore", requireAdministratorAccess, (req, res) =>
    setMenuItemArchiveState(req, res, false),
);

// DELETE product
router.delete("/:id", requireInventoryManagerAccess, async (req, res) => {
    if (isRedesignedProfile()) {
        return redesignedProductHandlers.deleteProduct(req, res);
    }
    let conn;
    try {
        await ensureProductSchema(db);
        const productId = Number(req.params.id);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [[lockedProduct]] = await conn.query(
            `SELECT id, item_type
               FROM products
              WHERE id = ?
              FOR UPDATE`,
            [productId],
        );
        if (!lockedProduct) {
            await conn.rollback();
            return res.status(404).json({ message: "Product not found" });
        }

        const [[history]] = await conn.query(
            `SELECT
               EXISTS(SELECT 1 FROM batches WHERE product_id = ? LIMIT 1) AS has_storage_batches,
               EXISTS(SELECT 1 FROM kitchen_batches WHERE product_id = ? LIMIT 1) AS has_kitchen_batches,
               EXISTS(SELECT 1 FROM order_item WHERE Product_ID = ? LIMIT 1) AS has_order_items,
               EXISTS(SELECT 1 FROM order_item WHERE selected_flavor_product_id = ? LIMIT 1) AS has_flavor_order_items,
               EXISTS(SELECT 1 FROM purchase_order_items WHERE product_id = ? LIMIT 1) AS has_purchase_order_items,
               EXISTS(SELECT 1 FROM Stock_Status WHERE Product_ID = ? LIMIT 1) AS has_stock_history,
               EXISTS(SELECT 1 FROM receipt_snapshot_items WHERE original_product_id = ? LIMIT 1) AS has_receipt_history,
               EXISTS(SELECT 1 FROM order_inventory_deductions WHERE product_id = ? LIMIT 1) AS has_order_deductions,
               EXISTS(SELECT 1 FROM daily_usage_report_items WHERE product_id = ? LIMIT 1) AS has_daily_usage,
               EXISTS(SELECT 1 FROM kitchen_usage_items WHERE product_id = ? LIMIT 1) AS has_kitchen_usage,
               EXISTS(SELECT 1 FROM feedback WHERE product_id = ? LIMIT 1) AS has_feedback,
               EXISTS(SELECT 1 FROM Suppliers WHERE Product_ID = ? LIMIT 1) AS has_supplier_link,
               EXISTS(
                   SELECT 1 FROM menu_item_ingredients
                   WHERE menu_product_id = ? OR product_id = ?
                   LIMIT 1
               ) AS has_ingredient_link`,
            Array(14).fill(productId),
        );
        if (Object.values(history || {}).some((value) => Number(value) !== 0)) {
            await conn.rollback();
            const canArchive =
                normalizeItemType(lockedProduct.item_type, STOCK_ITEM) === MENU_ITEM;
            return res.status(409).json({
                code: "PRODUCT_HAS_PROTECTED_HISTORY",
                canArchive,
                productId,
                message: "Products with historical records or active relationships cannot be hard deleted.",
            });
        }

        await conn.query(
            "DELETE FROM menu_item_ingredients WHERE menu_product_id = ? OR product_id = ?",
            [productId, productId],
        );
        await conn.query("DELETE FROM Inventory WHERE Product_ID = ?", [productId]);
        await conn.query("DELETE FROM Stock_Status WHERE Product_ID = ?", [productId]);
        await conn.query("DELETE FROM Menu WHERE Product_ID = ?", [productId]);
        const [result] = await conn.query("DELETE FROM products WHERE id = ?", [productId]);

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ message: "Product not found" });
        }

        await conn.commit();
        await invalidateProductCache("product deleted");
        res.json({ message: "Product deleted successfully" });
    } catch (err) {
        if (conn) await conn.rollback();
        if (err && err.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                code: "PRODUCT_HAS_PROTECTED_HISTORY",
                message: "Product cannot be deleted because historical records reference it.",
            });
        }
        console.error("DELETE /products/:id error:", err);
        res.status(500).json({ message: 'DB error', error: err.message });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;
