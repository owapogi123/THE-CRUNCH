const router = require("express").Router();
const db = require("../config/db");

// list all orders (with optional items) for dashboard
router.get("/", async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT o.Order_ID as id, o.Total_Amount as total, o.Status as status, o.Order_Date as date,
                    oi.Product_ID as productId, oi.Quantity as quantity, oi.Subtotal as subtotal
             FROM orders o
             LEFT JOIN order_item oi ON o.Order_ID = oi.Order_ID`);
        // the above returns flat rows; frontend can reshape as needed
        res.json(orders);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

// place a new order (old schema)
router.post("/", async (req, res) => {
    try {
        const { items, total, customerId, cashierId, orderType } = req.body;

        // create order record in existing `orders` table
        const [orderResult] = await db.query(
            "INSERT INTO orders (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status) VALUES (?,?,?,?,?)",
            [total, customerId || null, cashierId || null, orderType || null, 'Pending']
        );

        const orderId = orderResult.insertId;

        // insert each item and decrement stock/quantity
        for (const item of items) {
            await db.query(
                "INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal) VALUES (?,?,?,?)",
                [orderId, item.product_id, item.qty, item.subtotal]
            );

            // products table uses `quantity` field
            await db.query(
                "UPDATE products SET quantity = quantity - ? WHERE id = ?",
                [item.qty, item.product_id]
            );
        }

        res.json({ message: "Order placed", orderId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'DB error', error: err.message });
    }
});

module.exports = router;