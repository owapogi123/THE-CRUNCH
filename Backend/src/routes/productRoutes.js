const router = require("express").Router();
const db = require("../config/db");

// GET all products (old backend used `products` table)
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM products");
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// ADD product
router.post("/", async (req, res) => {
    try {
        const { name, price, quantity, description } = req.body;
        const [result] = await db.query(
            "INSERT INTO products (name, price, quantity, description) VALUES (?,?,?,?)",
            [name, price || 0, quantity || 0, description || null]
        );

        const newId = result.insertId;

        // also insert into Menu so that inventory batches can reference this product
        // we explicitly set Product_ID to keep both tables aligned. If the
        // Menu table has an auto-increment counter lower than newId this will
        // bump it automatically.
        await db.query(
            "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
            [newId, name, price || 0, quantity || 0]
        );

        res.status(201).json({ message: "Product added", id: newId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

module.exports = router;