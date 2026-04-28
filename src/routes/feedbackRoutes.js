const router = require("express").Router();
const db = require("../config/db");

function normalizeNullableInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

router.post("/", async (req, res) => {
  try {
    const productId = normalizeNullableInt(req.body?.product_id);
    const customerUserId = normalizeNullableInt(req.body?.customer_user_id);
    const ratingValue =
      req.body?.rating === undefined ||
      req.body?.rating === null ||
      req.body?.rating === ""
        ? null
        : Number(req.body.rating);
    const comment = String(req.body?.comment ?? "").trim();

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Valid product_id is required" });
    }

    if (customerUserId !== null && Number.isNaN(customerUserId)) {
      return res
        .status(400)
        .json({ message: "customer_user_id must be a valid user ID or null" });
    }

    if (!comment) {
      return res.status(400).json({ message: "Comment is required" });
    }

    if (
      ratingValue !== null &&
      (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5)
    ) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const [productRows] = await db.query(
      "SELECT Product_ID, Product_Name FROM Menu WHERE Product_ID = ? LIMIT 1",
      [productId],
    );
    if (productRows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (customerUserId !== null) {
      const [userRows] = await db.query(
        "SELECT id FROM users WHERE id = ? LIMIT 1",
        [customerUserId],
      );
      if (userRows.length === 0) {
        return res.status(404).json({ message: "Customer user not found" });
      }
    }

    const [result] = await db.query(
      `INSERT INTO feedback (product_id, customer_user_id, rating, comment)
       VALUES (?, ?, ?, ?)`,
      [productId, customerUserId, ratingValue, comment],
    );

    const [rows] = await db.query(
      `SELECT
          f.feedback_id,
          f.product_id,
          f.customer_user_id,
          f.rating,
          f.comment,
          f.created_at,
          COALESCE(m.Product_Name, p.name, CONCAT('Product #', f.product_id)) AS product_name,
          COALESCE(u.username, 'Anonymous') AS customer_name
       FROM feedback f
       LEFT JOIN Menu m ON m.Product_ID = f.product_id
       LEFT JOIN products p ON p.id = f.product_id
       LEFT JOIN users u ON u.id = f.customer_user_id
       WHERE f.feedback_id = ?`,
      [result.insertId],
    );

    return res.status(201).json({
      message: "Feedback submitted successfully",
      feedback: rows[0] ?? {
        feedback_id: result.insertId,
        product_id: productId,
        customer_user_id: customerUserId,
        rating: ratingValue,
        comment,
      },
    });
  } catch (error) {
    console.error("POST /api/feedback error:", error);
    return res.status(500).json({
      message: "Failed to submit feedback",
      error: error.message,
    });
  }
});

router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
          f.feedback_id,
          f.product_id,
          f.customer_user_id,
          f.rating,
          f.comment,
          f.created_at,
          COALESCE(m.Product_Name, p.name, CONCAT('Product #', f.product_id)) AS product_name,
          COALESCE(u.username, 'Anonymous') AS customer_name
       FROM feedback f
       LEFT JOIN Menu m ON m.Product_ID = f.product_id
       LEFT JOIN products p ON p.id = f.product_id
       LEFT JOIN users u ON u.id = f.customer_user_id
       ORDER BY f.created_at DESC, f.feedback_id DESC`,
    );

    return res.json(rows);
  } catch (error) {
    console.error("GET /api/feedback error:", error);
    return res.status(500).json({
      message: "Failed to load feedback",
      error: error.message,
    });
  }
});

module.exports = router;
