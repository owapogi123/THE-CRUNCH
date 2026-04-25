const router = require("express").Router();
const db = require("../config/db");

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

async function ensureMenuManagementColumns() {
    await ensureProductsImageColumn();

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

function normalizeAvailabilityStatus(value) {
    const normalized = String(value || "Available").trim().toLowerCase();
    return normalized === "hidden" || normalized === "unavailable"
        ? "Hidden"
        : "Available";
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

// GET all products (old backend used `products` table)
router.get("/", async (req, res) => {
    try {
        await ensureMenuManagementColumns();
        const includeRaw = String(req.query.includeRaw || "").toLowerCase();
        const includeRawMaterials = includeRaw === "1" || includeRaw === "true";

        const whereClause = includeRawMaterials
            ? ""
            : "WHERE COALESCE(m.Promo, '') <> 'RAW_MATERIAL'";

        const [rows] = await db.query(
            `SELECT
                p.*,
                m.Category_Name AS category,
                m.Promo AS inventoryPromo,
                CAST(COALESCE(m.Stock, i.Stock, p.quantity, 0) AS SIGNED) AS remainingStock
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             LEFT JOIN Inventory i ON i.Product_ID = p.id
             ${whereClause}`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// ADD product
router.post("/", async (req, res) => {
    try {
        await ensureMenuManagementColumns();
        const {
            name,
            price,
            quantity,
            description,
            category,
            raw_material,
            image,
            availability_status,
            is_promotional,
            promo_price,
            promo_label,
        } = req.body;

        const normalizedAvailabilityStatus = normalizeAvailabilityStatus(
            availability_status,
        );
        const normalizedPromo = normalizePromoValues(
            is_promotional,
            promo_price,
            promo_label,
        );

        const [result] = await db.query(
            `INSERT INTO products
                (name, price, quantity, description, image, availability_status, is_promotional, promo_price, promo_label)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [
                name,
                price || 0,
                quantity || 0,
                description || null,
                image || null,
                normalizedAvailabilityStatus,
                normalizedPromo.isPromotional,
                normalizedPromo.promoPrice,
                normalizedPromo.promoLabel,
            ]
        );

        const newId = result.insertId;
        await db.query(
            "UPDATE products SET menu_code = CONCAT('M-', LPAD(id, 3, '0')) WHERE id = ?",
            [newId],
        );
        const normalizedCategory = String(category || "").toLowerCase().trim();
        const promoTag = raw_material
            ? "RAW_MATERIAL"
            : normalizedCategory.includes("suppl")
                ? "SUPPLIES"
                : "FINISHED_GOODS";

        // also insert into Menu so that inventory batches can reference this product
        // we explicitly set Product_ID to keep both tables aligned. If the
        // Menu table has an auto-increment counter lower than newId this will
        // bump it automatically.
        await db.query(
            "INSERT INTO Menu (Product_ID, Product_Name, Category_Name, Price, Stock, Promo) VALUES (?,?,?,?,?,?)",
            [newId, name, category || null, price || 0, quantity || 0, promoTag]
        );

        res.status(201).json({ message: "Product added", id: newId });
    } catch (err) {
        if (err && err.message === "Invalid promo price value") {
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

        const productId = Number(req.params.id);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const {
            name,
            price,
            quantity,
            description,
            category,
            image,
            availability_status,
            is_promotional,
            promo_price,
            promo_label,
        } = req.body;

        const productFields = [];
        const productValues = [];
        const menuFields = [];
        const menuValues = [];
        const inventoryFields = [];
        const inventoryValues = [];

        if (name !== undefined) {
            const safeName = String(name).trim();
            if (!safeName) {
                return res.status(400).json({ message: "name cannot be empty" });
            }
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

        if (description !== undefined) {
            productFields.push("description = ?");
            productValues.push(description ? String(description).trim() : null);
        }

        if (image !== undefined) {
            productFields.push("image = ?");
            productValues.push(image ? String(image) : null);
        }

        if (availability_status !== undefined) {
            productFields.push("availability_status = ?");
            productValues.push(normalizeAvailabilityStatus(availability_status));
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
            inventoryFields.length === 0
        ) {
            return res.status(400).json({ message: "No fields to update" });
        }

        if (productFields.length > 0) {
            await db.query(
                `UPDATE products SET ${productFields.join(", ")} WHERE id = ?`,
                [...productValues, productId],
            );
        }

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

        const [rows] = await db.query(
            `SELECT p.*, m.Category_Name AS category
             FROM products p
             LEFT JOIN Menu m ON m.Product_ID = p.id
             WHERE p.id = ?`,
            [productId],
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json(rows[0]);
    } catch (err) {
        if (err && err.message === "Invalid promo price value") {
            return res.status(400).json({ message: err.message });
        }
        console.error("PUT /products/:id error:", err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// DELETE product
router.delete("/:id", async (req, res) => {
    try {
        const productId = Number(req.params.id);
        if (!Number.isFinite(productId) || productId <= 0) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        // Temporarily disable foreign key checks to allow cascading deletes
        await db.query("SET FOREIGN_KEY_CHECKS=0");

        try {
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
