const router = require("express").Router();
const db = require("../config/db");
const inventoryRoutes = require("./inventoryRoutes");
const deductStockForOrder = inventoryRoutes.deductStockForOrder;

function normalizeOrderType(value) {
  if (!value) return "dine-in";
  const v = String(value).toLowerCase();
  if (v === "take-out") return "take-out";
  if (v === "delivery") return "delivery";
  return "dine-in";
}

function isPreparingStatus(value) {
  const v = String(value || "").toLowerCase();
  return v === "preparing" || v === "in progress";
}

function isReadyStatus(value) {
  const v = String(value || "").toLowerCase();
  return v === "ready";
}

function isFinishedStatus(value) {
  const v = String(value || "").toLowerCase();
  return v === "completed" || v === "cancelled";
}

// list all orders for dashboard
router.get("/", async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.Order_ID as id, o.Total_Amount as total, o.Status as status, o.Order_Date as date,
                    o.Order_Type as orderType, p.Payment_Type as paymentMethod,
                    oi.Product_ID as productId, oi.Quantity as quantity, oi.Subtotal as subtotal,
                    COALESCE(m.Product_Name, pr.name) as productName,
                    COALESCE(m.Price, pr.price) as price,
                    u.username as cashierName
             FROM orders o
             LEFT JOIN order_item oi ON o.Order_ID = oi.Order_ID
             LEFT JOIN Menu m ON m.Product_ID = oi.Product_ID
             LEFT JOIN products pr ON pr.id = oi.Product_ID
             LEFT JOIN users u ON u.id = o.Cashier_ID
             LEFT JOIN (
                SELECT p1.Order_ID, p1.Payment_Type
                FROM payments p1
                INNER JOIN (
                    SELECT Order_ID, MAX(Payment_ID) as maxPaymentId
                    FROM payments
                    GROUP BY Order_ID
                ) latest ON latest.maxPaymentId = p1.Payment_ID
             ) p ON p.Order_ID = o.Order_ID`,
    );
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// Ensure startedAt column exists once at startup
let startedAtColumnReady = false;
async function ensureStartedAtColumn() {
  if (startedAtColumnReady) return;
  try {
    await db.query(`ALTER TABLE orders ADD COLUMN startedAt DATETIME NULL`);
  } catch (_) {
    /* column already exists */
  }
  startedAtColumnReady = true;
}

// queue view for kitchen/order page
router.get("/queue", async (req, res) => {
  try {
    await ensureStartedAtColumn();

    const [rows] = await db.query(
      `SELECT o.Order_ID as id, o.Status as status, o.Order_Type as orderType,
                    o.Order_Date as createdAt, o.startedAt as startedAt,
                    oi.Quantity as quantity, m.Product_Name as productName
             FROM orders o
             LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
             LEFT JOIN menu m ON m.Product_ID = oi.Product_ID
             WHERE LOWER(COALESCE(o.Status, '')) NOT IN ('completed', 'cancelled')
             ORDER BY o.Order_ID ASC`,
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
    console.error(err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// place a new order
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

    const resolvedCashierId = cashierId ?? cashier_id ?? null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const finalOrderType = normalizeOrderType(order_type || orderType);
    const finalPaymentMethod = String(
      payment_method || paymentMethod || "cash",
    );

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      "INSERT INTO orders (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status) VALUES (?,?,?,?,?)",
      [total, customerId || null, resolvedCashierId, finalOrderType, "Pending"],
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      // ── Ensure Menu row exists ────────────────────────────────────────
      const [menuRows] = await conn.query(
        "SELECT Product_ID FROM Menu WHERE Product_ID = ?",
        [item.product_id],
      );
      if (menuRows.length === 0) {
        const [productRows] = await conn.query(
          "SELECT name, price, quantity FROM products WHERE id = ?",
          [item.product_id],
        );
        if (productRows.length > 0) {
          const p = productRows[0];
          await conn.query(
            "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
            [
              item.product_id,
              p.name,
              Number(p.price) || 0,
              Number(p.quantity) || 0,
            ],
          );
        } else if (item.name) {
          await conn.query(
            "INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)",
            [item.product_id, item.name, Number(item.price) || 0, 0],
          );
        } else {
          throw new Error(`Unknown product_id ${item.product_id}`);
        }
      }

      // ── Quantity check ────────────────────────────────────────────────
      // NOTE: We do NOT enforce Menu.Stock here because the stockManager
      // workflow deducts Menu.Stock when withdrawing items to the floor,
      // which would incorrectly block valid cashier orders.
      // The SQL UPDATE below uses GREATEST(..., 0) to floor at zero.
      const requiredQty = Number(item.qty) || 0;
      if (requiredQty <= 0)
        throw new Error(`Invalid quantity for product_id ${item.product_id}`);

      // ── Insert order item ─────────────────────────────────────────────
      await conn.query(
        "INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal) VALUES (?,?,?,?)",
        [orderId, item.product_id, item.qty, item.subtotal],
      );

      // ── Deduct Menu.Stock ─────────────────────────────────────────────
      await conn.query(
        "UPDATE Menu SET Stock = GREATEST(Stock - ?, 0) WHERE Product_ID = ?",
        [item.qty, item.product_id],
      );

      // ── Keep legacy products.quantity in sync ─────────────────────────
      await conn.query(
        "UPDATE products SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?",
        [item.qty, item.product_id],
      );

      // ── Deduct Inventory.Stock + log Stock_Status (single call, no duplicate)
      await deductStockForOrder(item.product_id, item.qty, null, conn);
    }

    await conn.query(
      "INSERT INTO Payments (Order_ID, Payment_Type, Payment_Status, ProcessBy) VALUES (?,?,?,?)",
      [orderId, finalPaymentMethod, "Pending", resolvedCashierId],
    );

    await conn.commit();
    res.json({ message: "Order placed", orderId, orderNumber: `#${orderId}` });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(
      "ORDER POST ERROR:",
      JSON.stringify(
        {
          message: err.message,
          code: err.code,
          sqlMessage: err.sqlMessage,
          sql: err.sql,
        },
        null,
        2,
      ),
    );
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// update order status
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, startedAt } = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });

    await ensureStartedAtColumn();

    if (startedAt) {
      await db.query(
        "UPDATE Orders SET Status = ?, startedAt = ? WHERE Order_ID = ?",
        [status, new Date(startedAt), id],
      );
    } else {
      await db.query("UPDATE Orders SET Status = ? WHERE Order_ID = ?", [
        status,
        id,
      ]);
    }

    if (String(status).toLowerCase() === "completed") {
      await db.query(
        "UPDATE Payments SET Payment_Status = ? WHERE Order_ID = ?",
        ["Completed", id],
      );
    }

    res.json({ message: "Order updated", id, status });
  } catch (err) {
    console.error(
      "ORDER PATCH ERROR:",
      JSON.stringify(
        {
          message: err.message,
          code: err.code,
          sqlMessage: err.sqlMessage,
          sql: err.sql,
        },
        null,
        2,
      ),
    );
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

router.get("/new-online", async (req, res) => {
  try {
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 5 * 60 * 1000);

    const [rows] = await db.query(
      `SELECT o.Order_ID as id, o.Total_Amount as total,
              o.Order_Date as createdAt, o.Order_Type as orderType,
              oi.Quantity as quantity,
              COALESCE(m.Product_Name, pr.name) as productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
       LEFT JOIN menu m ON m.Product_ID = oi.Product_ID
       LEFT JOIN products pr ON pr.id = oi.Product_ID
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
          total: Number(r.total),
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
    console.error(err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});
module.exports = router;


