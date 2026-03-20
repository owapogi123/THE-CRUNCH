const router = require("express").Router();
const db = require("../config/db");

// GET all products (old backend used `products` table)
router.get("/", async (req, res) => {
    try {
        const includeRaw = String(req.query.includeRaw || "").toLowerCase();
        const includeRawMaterials = includeRaw === "1" || includeRaw === "true";

        const whereClause = includeRawMaterials
            ? ""
            : "WHERE COALESCE(m.Promo, '') <> 'RAW_MATERIAL'";

        const [rows] = await db.query(
            `SELECT p.*, CAST(COALESCE(m.Stock, i.Stock, p.quantity, 0) AS SIGNED) AS remainingStock
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
        const { name, price, quantity, description, category, raw_material } = req.body;
        const [result] = await db.query(
            "INSERT INTO products (name, price, quantity, description) VALUES (?,?,?,?)",
            [name, price || 0, quantity || 0, description || null]
        );

        const newId = result.insertId;
        const promoTag = raw_material ? "RAW_MATERIAL" : null;

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
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

module.exports = router;