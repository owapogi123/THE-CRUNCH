const router = require("express").Router();
const db = require("../config/db");
const {
    deriveManualOverrideState,
    ensureMenuAvailabilitySchema,
    fetchMenuIngredients,
    normalizeMenuIngredients,
    replaceMenuIngredients,
} = require("../utils/menuAvailability");
const {
    MENU_ITEM,
    STOCK_ITEM,
    ensureProductsItemTypeSchema,
    getProductItemTypeExpression,
    normalizeItemType,
    assertProductsMatchItemType,
} = require("../utils/productItemType");

const PRODUCT_NAME_MAX_LENGTH = 100;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 100;
const RAW_MATERIAL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9' -]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;

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

async function hasColumn(tableName, columnName) {
    const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [
        columnName,
    ]);
    return rows.length > 0;
}

async function ensureProductsImageColumn() {
    if (!(await hasColumn("products", "image"))) {
        await db.query("ALTER TABLE products ADD COLUMN image LONGTEXT NULL");
    }
}

async function cleanupLegacyBase64ProductImages() {
    await db.query(
        `UPDATE products
         SET image = '/img/placeholder.jpg'
         WHERE image IS NOT NULL
           AND TRIM(image) <> ''
           AND image LIKE 'data:image%'`,
    );
}

async function ensureInventoryThresholdColumns() {
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

    if (!(await hasColumn("Inventory", "use_default_thresholds"))) {
        await db.query(
            "ALTER TABLE Inventory ADD COLUMN use_default_thresholds TINYINT(1) NOT NULL DEFAULT 1",
        );
    }

    if (!(await hasColumn("Inventory", "low_stock_threshold"))) {
        await db.query(
            "ALTER TABLE Inventory ADD COLUMN low_stock_threshold INT NULL",
        );
    }

    if (!(await hasColumn("Inventory", "critical_stock_threshold"))) {
        await db.query(
            "ALTER TABLE Inventory ADD COLUMN critical_stock_threshold INT NULL",
        );
    }
}

async function ensureMenuManagementColumns() {
  await ensureProductsImageColumn();
    await cleanupLegacyBase64ProductImages();
    await ensureProductsItemTypeSchema(db);

    if (!(await hasColumn("products", "menu_code"))) {
        await db.query("ALTER TABLE products ADD COLUMN menu_code VARCHAR(20) NULL");
    }

    if (!(await hasColumn("products", "availability_status"))) {
        await db.query(
            "ALTER TABLE products ADD COLUMN availability_status VARCHAR(20) DEFAULT 'Available'",
        );
    }

    if (!(await hasColumn("products", "is_promotional"))) {
        await db.query(
            "ALTER TABLE products ADD COLUMN is_promotional TINYINT(1) DEFAULT 0",
        );
    }

    if (!(await hasColumn("products", "promo_price"))) {
        await db.query(
            "ALTER TABLE products ADD COLUMN promo_price DECIMAL(10,2) NULL",
        );
    }

    if (!(await hasColumn("products", "promo_label"))) {
        await db.query(
            "ALTER TABLE products ADD COLUMN promo_label VARCHAR(100) NULL",
        );
    }

    await db.query(
        `UPDATE products
         SET menu_code = CONCAT('M-', LPAD(id, 3, '0'))
         WHERE menu_code IS NULL OR TRIM(menu_code) = ''`,
    );

    await db.query(
        `UPDATE products
         SET availability_status = 'Available'
         WHERE availability_status IS NULL OR TRIM(availability_status) = ''`,
    );

    await db.query(
        `UPDATE products
         SET is_promotional = 0
         WHERE is_promotional IS NULL`,
    );
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

    const normalizedPromoPrice =
        promoPrice === undefined || promoPrice === null || promoPrice === ""
            ? null
            : Number(promoPrice);

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

function computeAvailableServings(ingredients) {
    if (!ingredients || ingredients.length === 0) {
        return null;
    }

    let servings = Number.POSITIVE_INFINITY;
    for (const ingredient of ingredients) {
        const quantityRequired = Number(ingredient.quantity_required ?? 0);
        if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
            return 0;
        }
        const dailyWithdrawn = Number(ingredient.daily_withdrawn ?? 0);
        servings = Math.min(servings, dailyWithdrawn / quantityRequired);
    }

    return Number.isFinite(servings) ? servings : null;
}

function resolveAvailabilityStatus(row, ingredients) {
    const manualOverride = Number(row.manual_override ?? 0) === 1;
    const manualStatus = String(row.manual_status ?? "Available")
        .trim()
        .toLowerCase();
    if (manualOverride) {
        return manualStatus === "out of stock" || manualStatus === "unavailable"
            ? "Out of Stock"
            : "Available";
    }

    if (ingredients.length > 0) {
        const availableServings = computeAvailableServings(ingredients);
        return (availableServings ?? 0) > 0 ? "Available" : "Out of Stock";
    }

    const itemType = String(row.item_type ?? "").trim().toLowerCase();
    if (itemType === MENU_ITEM) {
        return "Not Configured";
    }

    const fallback = String(row.availability_status ?? "Available")
        .trim()
        .toLowerCase();
    return fallback === "hidden" || fallback === "unavailable" || fallback === "out of stock"
        ? "Out of Stock"
        : "Available";
}

async function attachIngredientAvailability(rows) {
    const ingredientMap = await fetchMenuIngredients(
        db,
        rows.map((row) => row.id),
    );

    return rows.map((row) => {
        const ingredients = (ingredientMap.get(Number(row.id)) ?? []).filter(
            (ingredient) => String(ingredient.item_type || STOCK_ITEM) === STOCK_ITEM,
        );
        const availableServings = computeAvailableServings(ingredients);
        const availabilityStatus = resolveAvailabilityStatus(row, ingredients);
        return {
            ...row,
            image: sanitizeProductImageValue(row.image),
            ingredient_count: ingredients.length,
            available_servings: availableServings,
            availability_status: availabilityStatus,
            available: availabilityStatus === "Available",
            remainingStock: availabilityStatus === "Not Configured" ? 0 : Number(row.remainingStock ?? 0),
            ingredients,
        };
    });
}

// GET all products (old backend used `products` table)
router.get("/", async (req, res) => {
    try {
        await ensureMenuManagementColumns();
        await ensureMenuAvailabilitySchema(db);
        const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
        await ensureInventoryThresholdColumns();
        const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
        const requestedItemType = String(req.query.item_type || "")
            .trim()
            .toLowerCase();
        const includeRaw = String(req.query.includeRaw || "").toLowerCase();
        const includeRawMaterials = includeRaw === "1" || includeRaw === "true";
        const filters = [];
        const values = [];

        if (requestedItemType === STOCK_ITEM || requestedItemType === MENU_ITEM) {
            filters.push(`${itemTypeExpr} = ?`);
            values.push(requestedItemType);
            if (requestedItemType === MENU_ITEM) {
                filters.push("m.Product_ID IS NOT NULL");
            }
        }

        if (!includeRawMaterials) {
            filters.push("COALESCE(m.Promo, '') <> 'RAW_MATERIAL'");
        }

        const whereClause = filters.length > 0
            ? `WHERE ${filters.join(" AND ")}`
            : "";

        const [rows] = await db.query(
            `SELECT
                p.*,
                ${itemTypeExpr} AS item_type,
                m.Category_Name AS category,
                m.Promo AS inventoryPromo,
                COALESCE(i.Stock, 0) AS stock,
                COALESCE(i.Daily_Withdrawn, 0) AS dailyWithdrawn,
                CAST(COALESCE(m.Stock, i.Stock, p.quantity, 0) AS SIGNED) AS remainingStock,
                COALESCE(m.manual_override, 0) AS manual_override,
                COALESCE(m.manual_status, 'Available') AS manual_status
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             LEFT JOIN Inventory i ON i.Product_ID = p.id
             ${whereClause}`,
            values,
        );

        res.json(await attachIngredientAvailability(rows));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// ADD product
router.post("/", async (req, res) => {
    try {
        await ensureMenuManagementColumns();
        await ensureMenuAvailabilitySchema(db);
        const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);
        await ensureInventoryThresholdColumns();
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
        } = req.body;

        const normalizedAvailabilityStatus = normalizeAvailabilityStatus(
            availability_status,
        );
        const normalizedImage = normalizeProductImageValue(image);
        const normalizedIngredients = normalizeMenuIngredients(ingredients);
        const normalizedItemType = parseItemTypeInput(item_type, STOCK_ITEM);
        if (normalizedIngredients !== null) {
            await assertProductsMatchItemType(
                db,
                normalizedIngredients.map((ingredient) => ingredient.productId),
                STOCK_ITEM,
                "Ingredient",
            );
        }
        const manualOverrideState = deriveManualOverrideState({
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
        const normalizedDescription = normalizeProductDescription(description);
        const normalizedPromo = normalizePromoValues(
            is_promotional,
            promo_price,
            promo_label,
        );
        const safePrice =
            price === undefined || price === null || price === ""
                ? 0
                : Number(price);
        const safeQuantity =
            quantity === undefined || quantity === null || quantity === ""
                ? 0
                : Number(quantity);
        if (!Number.isFinite(safePrice) || safePrice < 0) {
            return res.status(400).json({ message: "Invalid price value" });
        }
        if (normalizedItemType === MENU_ITEM && safePrice < 1) {
            return res.status(400).json({ message: "Price must be at least \u20B11." });
        }
        if (!Number.isFinite(safeQuantity) || safeQuantity < 0) {
            return res.status(400).json({ message: "Invalid quantity value" });
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

        const [result] = await db.query(
            `INSERT INTO products (${insertColumns.join(", ")})
             VALUES (${insertColumns.map(() => "?").join(",")})`,
            insertValues,
        );

        const newId = result.insertId;
        await db.query(
            "UPDATE products SET menu_code = CONCAT('M-', LPAD(id, 3, '0')) WHERE id = ?",
            [newId],
        );
        const normalizedCategory = String(category || "").toLowerCase().trim();
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
        await db.query(
            `INSERT INTO Menu
                (Product_ID, Product_Name, Category_Name, Price, Stock, Promo, manual_override, manual_status)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
                newId,
                normalizedName,
                category || null,
                safePrice,
                safeQuantity,
                promoTag,
                manualOverrideState?.manualOverride ?? 0,
                manualOverrideState?.manualStatus ?? "Available",
            ]
        );

        await db.query(
            `INSERT INTO Inventory (
                Product_ID,
                Quantity,
                Stock,
                Reorder_Point,
                Critical_Point,
                Item_Purchased,
                use_default_thresholds,
                low_stock_threshold,
                critical_stock_threshold
            )
             VALUES (?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                Quantity = VALUES(Quantity),
                Stock = VALUES(Stock),
                Reorder_Point = VALUES(Reorder_Point),
                Critical_Point = VALUES(Critical_Point),
                Item_Purchased = VALUES(Item_Purchased),
                use_default_thresholds = VALUES(use_default_thresholds),
                low_stock_threshold = VALUES(low_stock_threshold),
                critical_stock_threshold = VALUES(critical_stock_threshold)`,
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
            ],
        );

        if (normalizedIngredients !== null) {
            await replaceMenuIngredients(db, newId, normalizedIngredients);
        }

        res.status(201).json({ message: "Product added", id: newId });
    } catch (err) {
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
                err.message === "Product name is required." ||
                err.message === "Product name must be at least 2 characters." ||
                err.message === "Product name must not exceed 100 characters." ||
                err.message === "Description must not exceed 100 characters." ||
                err.message ===
                    "Material name may only use letters, numbers, spaces, apostrophes, and hyphens." ||
                /must be (stock_item|menu_item)|was not found/i.test(err.message))
        ) {
            return res.status(400).json({ message: err.message });
        }
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// UPDATE product
router.put("/:id", async (req, res) => {
    try {
        await ensureMenuManagementColumns();
        await ensureMenuAvailabilitySchema(db);
        const hasItemTypeColumn = await ensureProductsItemTypeSchema(db);

        const productId = Number(req.params.id);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }
        const itemTypeSelect = hasItemTypeColumn ? "item_type" : "NULL AS item_type";
        const [[existingProduct]] = await db.query(
            `SELECT ${itemTypeSelect}, price
             FROM products
             WHERE id = ?
             LIMIT 1`,
            [productId],
        );
        if (!existingProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        const {
            name,
            price,
            quantity,
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
        } = req.body;

        const productFields = [];
        const productValues = [];
        const menuFields = [];
        const menuValues = [];
        const inventoryFields = [];
        const inventoryValues = [];

        if (name !== undefined) {
            const safeName = normalizeProductName(name, {
                stockOnly:
                    normalizeItemType(existingProduct.item_type, MENU_ITEM) ===
                    STOCK_ITEM,
            });
            productFields.push("name = ?");
            productValues.push(safeName);
            menuFields.push("Product_Name = ?");
            menuValues.push(safeName);
            inventoryFields.push("Item_Purchased = ?");
            inventoryValues.push(safeName);
        }

        if (price !== undefined) {
            const safePrice = Number(price);
            if (!Number.isFinite(safePrice) || safePrice < 0) {
                return res.status(400).json({ message: "Invalid price value" });
            }
            productFields.push("price = ?");
            productValues.push(safePrice);
            menuFields.push("Price = ?");
            menuValues.push(safePrice);
        }

        if (quantity !== undefined) {
            const safeQuantity = Number(quantity);
            if (!Number.isFinite(safeQuantity) || safeQuantity < 0) {
                return res.status(400).json({ message: "Invalid quantity value" });
            }
            productFields.push("quantity = ?");
            productValues.push(safeQuantity);
            menuFields.push("Stock = ?");
            menuValues.push(safeQuantity);
            inventoryFields.push("Stock = ?");
            inventoryValues.push(safeQuantity);
            inventoryFields.push("Quantity = ?");
            inventoryValues.push(safeQuantity);
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

        if (availability_status !== undefined) {
            productFields.push("availability_status = ?");
            productValues.push(normalizeAvailabilityStatus(availability_status));
        }

        const manualOverrideState = deriveManualOverrideState({
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

        const normalizedIngredients = normalizeMenuIngredients(ingredients);
        const effectiveTargetItemType = parseItemTypeInput(
            item_type,
            normalizeItemType(existingProduct.item_type, MENU_ITEM),
        );
        const effectivePrice =
            price !== undefined ? Number(price) : Number(existingProduct.price ?? 0);
        if (!Number.isFinite(effectivePrice) || effectivePrice < 0) {
            return res.status(400).json({ message: "Invalid price value" });
        }
        if (effectiveTargetItemType === MENU_ITEM && effectivePrice < 1) {
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
            const normalizedPromo = normalizePromoValues(
                is_promotional,
                promo_price,
                promo_label,
            );
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
            menuFields.push("Category_Name = ?");
            menuValues.push(category ? String(category).trim() : null);
        }

        if (
            productFields.length === 0 &&
            menuFields.length === 0 &&
            inventoryFields.length === 0 &&
            normalizedIngredients === null
        ) {
            return res.status(400).json({ message: "No fields to update" });
        }

        if (productFields.length > 0) {
            await db.query(
                `UPDATE products SET ${productFields.join(", ")} WHERE id = ?`,
                [...productValues, productId],
            );
        }

        await assertProductsMatchItemType(
            db,
            [productId],
            effectiveTargetItemType,
            effectiveTargetItemType === MENU_ITEM ? "Menu" : "Stock",
        );

        if (menuFields.length > 0) {
            await db.query(
                `UPDATE Menu SET ${menuFields.join(", ")} WHERE Product_ID = ?`,
                [...menuValues, productId],
            );
        }

        if (inventoryFields.length > 0) {
            inventoryFields.push("Last_Update = NOW()");
            await db.query(
                `UPDATE Inventory SET ${inventoryFields.join(", ")} WHERE Product_ID = ?`,
                [...inventoryValues, productId],
            );
        }

        if (normalizedIngredients !== null) {
            await replaceMenuIngredients(db, productId, normalizedIngredients);
        }

        const [rows] = await db.query(
            `SELECT p.*, m.Category_Name AS category,
                    COALESCE(m.manual_override, 0) AS manual_override,
                    COALESCE(m.manual_status, 'Available') AS manual_status
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             WHERE p.id = ?`,
            [productId],
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        const [enrichedRow] = await attachIngredientAvailability(rows);
        res.json(enrichedRow);
    } catch (err) {
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
                err.message === "Product name is required." ||
                err.message === "Product name must be at least 2 characters." ||
                err.message === "Product name must not exceed 100 characters." ||
                err.message === "Description must not exceed 100 characters." ||
                err.message ===
                    "Material name may only use letters, numbers, spaces, apostrophes, and hyphens." ||
                /must be (stock_item|menu_item)|was not found/i.test(err.message))
        ) {
            return res.status(400).json({ message: err.message });
        }
        console.error("PUT /products/:id error:", err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// DELETE product
router.delete("/:id", async (req, res) => {
    try {
        await ensureMenuAvailabilitySchema(db);
        const productId = Number(req.params.id);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        // Temporarily disable foreign key checks to allow cascading deletes
        await db.query("SET FOREIGN_KEY_CHECKS=0");

        try {
            await db.query(
                "DELETE FROM menu_item_ingredients WHERE menu_product_id = ? OR product_id = ?",
                [productId, productId],
            );

            // Delete batches associated with this product
            await db.query("DELETE FROM batches WHERE product_id = ?", [productId]);

            // Delete inventory entries
            await db.query("DELETE FROM Inventory WHERE Product_ID = ?", [productId]);

            // Delete stock status entries
            await db.query("DELETE FROM Stock_Status WHERE Product_ID = ?", [productId]);

            // Delete menu entries
            await db.query("DELETE FROM Menu WHERE Product_ID = ?", [productId]);

            // Delete from products table
            await db.query("DELETE FROM products WHERE id = ?", [productId]);

            res.json({ message: "Product deleted successfully" });
        } finally {
            // Re-enable foreign key checks
            await db.query("SET FOREIGN_KEY_CHECKS=1");
        }
    } catch (err) {
        console.error("DELETE /products/:id error:", err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

module.exports = router;
