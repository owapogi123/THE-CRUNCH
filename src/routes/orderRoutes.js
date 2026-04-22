const router = require("express").Router();
const db = require("../config/db");
const inventoryRoutes = require("./inventoryRoutes");
const deductStockForOrder = inventoryRoutes.deductStockForOrder;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function normalizeOrderType(value) {
  if (!value) return "dine-in";
  const v = String(value).toLowerCase().trim();
  if (v === "take-out" || v === "takeout") return "take-out";
  if (v === "delivery") return "delivery";
  return "dine-in";
}

function isPreparingStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  return v === "preparing" || v === "in progress";
}

function isReadyStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  return v === "ready";
}

function isFinishedStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  return v === "completed" || v === "cancelled";
}

// Ensure startedAt column exists once at startup
let startedAtColumnReady = false;
async function ensureStartedAtColumn() {
  if (startedAtColumnReady) return;
  try {
    await db.query(`ALTER TABLE orders ADD COLUMN startedAt DATETIME NULL`);
  } catch (_) {
    // Column already exists — this is expected after first run
  }
  startedAtColumnReady = true;
}

// ─── ROUTES (specific paths MUST come before /:id wildcards) ──────────────────

// GET /orders — list all orders for dashboard
router.get("/", async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Total_Amount    AS total,
         o.Status          AS status,
         o.Order_Date      AS date,
         o.Order_Type      AS orderType,
         p.Payment_Type    AS paymentMethod,
         oi.Product_ID     AS productId,
         oi.Quantity       AS quantity,
         oi.Subtotal       AS subtotal,
         COALESCE(m.Product_Name, pr.name) AS productName,
         COALESCE(m.Price,        pr.price) AS price,
         u.username        AS cashierName
       FROM orders o
       LEFT JOIN order_item oi ON o.Order_ID = oi.Order_ID
       LEFT JOIN Menu      m  ON m.Product_ID  = oi.Product_ID
       LEFT JOIN products  pr ON pr.id          = oi.Product_ID
       LEFT JOIN users     u  ON u.id           = o.Cashier_ID
       LEFT JOIN (
         SELECT p1.Order_ID, p1.Payment_Type
         FROM payments p1
         INNER JOIN (
           SELECT Order_ID, MAX(Payment_ID) AS maxPaymentId
           FROM payments
           GROUP BY Order_ID
         ) latest ON latest.maxPaymentId = p1.Payment_ID
       ) p ON p.Order_ID = o.Order_ID`
    );
    res.json(orders);
  } catch (err) {
    console.error("GET /orders error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /orders/queue — kitchen/order queue view
router.get("/queue", async (req, res) => {
  try {
    await ensureStartedAtColumn();

    const [rows] = await db.query(
      `SELECT
         o.Order_ID   AS id,
         o.Status     AS status,
         o.Order_Type AS orderType,
         o.Order_Date AS createdAt,
         o.startedAt  AS startedAt,
         oi.Quantity  AS quantity,
         m.Product_Name AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
       LEFT JOIN menu m        ON m.Product_ID = oi.Product_ID
       WHERE LOWER(COALESCE(o.Status, '')) NOT IN ('completed', 'cancelled')
       ORDER BY o.Order_ID ASC`
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: String(r.id),
          orderNumber: `#${r.id}`,
          tableNumber: 0,
          status: normalizeOrderType(r.orderType),
          items: [],
          isPreparing: isPreparingStatus(r.status),
          isReady: isReadyStatus(r.status),
          isFinished: isFinishedStatus(r.status),
          startedAt: r.startedAt
            ? new Date(r.startedAt).getTime()
            : r.createdAt
              ? new Date(r.createdAt).getTime()
              : undefined,
        };
      }
      if (r.productName) {
        grouped[r.id].items.push({
          quantity: Number(r.quantity) || 0,
          name: r.productName,
        });
      }
    }

    res.json(Object.values(grouped));
  } catch (err) {
    console.error("GET /orders/queue error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /orders/new-online — poll for new online orders (no cashier) since a timestamp
// ⚠️  MUST be defined before router.patch("/:id") so Express doesn't treat
//     "new-online" as an :id parameter.
router.get("/new-online", async (req, res) => {
  try {
    // Default: look back 5 minutes if no `since` param provided
    let since;
    if (req.query.since) {
      since = new Date(req.query.since);
      if (isNaN(since.getTime())) {
        return res.status(400).json({ message: "Invalid `since` date" });
      }
    } else {
      since = new Date(Date.now() - 5 * 60 * 1000);
    }

    const [rows] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Total_Amount    AS total,
         o.Order_Date      AS createdAt,
         o.Order_Type      AS orderType,
         oi.Quantity       AS quantity,
         COALESCE(m.Product_Name, pr.name) AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID  = o.Order_ID
       LEFT JOIN menu      m  ON m.Product_ID  = oi.Product_ID
       LEFT JOIN products  pr ON pr.id          = oi.Product_ID
       WHERE o.Cashier_ID IS NULL
         AND o.Order_Date >= ?
       ORDER BY o.Order_ID DESC`,
      [since]
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: r.id,
          total: Number(r.total) || 0,
          createdAt: r.createdAt,
          orderType: r.orderType,
          items: [],
        };
      }
      if (r.productName) {
        grouped[r.id].items.push({
          name: r.productName,
          quantity: Number(r.quantity) || 0,
        });
      }
    }

    res.json(Object.values(grouped));
  } catch (err) {
    console.error("GET /orders/new-online error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /orders — place a new order (cashier or online customer)
router.post("/", async (req, res) => {
  let conn;
  try {
    const {
      items,
      total,
      customerId,
      cashierId,
      cashier_id,
      orderType,
      order_type,
      paymentMethod,
      payment_method,
    } = req.body;

    // Online orders from usersmenu.tsx send NO cashierId — that's intentional.
    const resolvedCashierId = cashierId ?? cashier_id ?? null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const finalOrderType = normalizeOrderType(order_type || orderType);
    const finalPaymentMethod = String(payment_method || paymentMethod || "cash");

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Insert the order header
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [total, customerId || null, resolvedCashierId, finalOrderType]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      const requiredQty = Number(item.qty) || 0;
      if (requiredQty <= 0) {
        throw new Error(`Invalid quantity for product_id ${item.product_id}`);
      }

      // Ensure a Menu row exists for this product (create one if missing)
      const [menuRows] = await conn.query(
        "SELECT Product_ID FROM Menu WHERE Product_ID = ?",
        [item.product_id]
      );

      if (menuRows.length === 0) {
        const [productRows] = await conn.query(
          "SELECT name, price, quantity FROM products WHERE id = ?",
          [item.product_id]
        );

        if (productRows.length > 0) {
          const p = productRows[0];
          await conn.query(
            "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?, ?, ?, ?)",
            [item.product_id, p.name, Number(p.price) || 0, Number(p.quantity) || 0]
          );
        } else if (item.name) {
          // Fallback: use the name sent from the client
          await conn.query(
            "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?, ?, ?, 0)",
            [item.product_id, item.name, Number(item.price) || 0]
          );
        } else {
          throw new Error(`Unknown product_id ${item.product_id}`);
        }
      }

      // Insert line item
      await conn.query(
        "INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal) VALUES (?, ?, ?, ?)",
        [orderId, item.product_id, requiredQty, item.subtotal]
      );

      // Deduct Menu.Stock (floors at 0)
      await conn.query(
        "UPDATE Menu SET Stock = GREATEST(Stock - ?, 0) WHERE Product_ID = ?",
        [requiredQty, item.product_id]
      );

      // Keep products.quantity in sync
      await conn.query(
        "UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?",
        [requiredQty, item.product_id]
      );

      // Deduct inventory stock and log status
      await deductStockForOrder(item.product_id, requiredQty, null, conn);
    }

    // Insert payment record
    await conn.query(
      "INSERT INTO Payments (Order_ID, Payment_Type, Payment_Status, ProcessBy) VALUES (?, ?, 'Pending', ?)",
      [orderId, finalPaymentMethod, resolvedCashierId]
    );

    await conn.commit();
    res.json({ message: "Order placed", orderId, orderNumber: `#${orderId}` });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("POST /orders error:", JSON.stringify({
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
    }, null, 2));
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PATCH /orders/:id — update order status
// ⚠️  Wildcard param routes go LAST so they don't shadow named paths above.
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, startedAt } = req.body;

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    await ensureStartedAtColumn();

    if (startedAt) {
      await db.query(
        "UPDATE orders SET Status = ?, startedAt = ? WHERE Order_ID = ?",
        [status, new Date(startedAt), id]
      );
    } else {
      await db.query(
        "UPDATE orders SET Status = ? WHERE Order_ID = ?",
        [status, id]
      );
    }

    if (String(status).toLowerCase() === "completed") {
      await db.query(
        "UPDATE Payments SET Payment_Status = 'Completed' WHERE Order_ID = ?",
        [id]
      );
    }

    res.json({ message: "Order updated", id, status });
  } catch (err) {
    console.error("PATCH /orders/:id error:", JSON.stringify({
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
    }, null, 2));
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

module.exports = router;
