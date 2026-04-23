const router = require("express").Router();
const db = require("../config/db");
const { deductStockForOrder } = require("../services/inventoryService");
const fetchFn = (...args) =>
  (typeof fetch === "function"
    ? fetch(...args)
    : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args)));

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
  return v === "ready" || v === "ready for pickup";
}

function isFinishedStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  return v === "completed" || v === "cancelled" || v === "picked up";
}

function isAwaitingCashierReviewStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  return v === "awaiting cashier review";
}

function hasPaidCheckout(attributes) {
  const payments = Array.isArray(attributes?.payments) ? attributes.payments : [];
  return payments.some((payment) => {
    const status = String(payment?.attributes?.status || payment?.status || "").toLowerCase();
    return status === "paid";
  });
}

function getPayMongoSecretKey() {
  return process.env.PAYMONGO_SECRET_KEY || process.env.PAYMONGO_SK || "";
}

function getPayMongoBaseUrl() {
  return (process.env.PAYMONGO_API_BASE_URL || "https://api.paymongo.com/v1").replace(/\/+$/, "");
}

function getAppBaseUrl(req) {
  const configured = process.env.APP_BASE_URL || process.env.FRONTEND_URL || "";
  if (configured) return configured.replace(/\/+$/, "");
  const host = req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  return `${proto}://${host}`;
}

async function payMongoRequest(path, options = {}) {
  const secretKey = getPayMongoSecretKey();
  if (!secretKey) {
    const error = new Error("PAYMONGO_SECRET_KEY is not configured");
    error.statusCode = 500;
    throw error;
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    ...options.headers,
  };

  const response = await fetchFn(`${getPayMongoBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_) {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.detail ||
      payload?.errors?.[0]?.code ||
      payload?.message ||
      `PayMongo request failed with HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
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

let onlineOrderColumnsReady = false;
async function ensureOnlineOrderColumns() {
  if (onlineOrderColumnsReady) return;
  const statements = [
    "ALTER TABLE orders ADD COLUMN customer_user_id INT NULL",
    "ALTER TABLE orders ADD COLUMN payment_reference VARCHAR(255) NULL",
    "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50) NULL",
  ];

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (_) {
      // Column already exists on subsequent runs.
    }
  }

  onlineOrderColumnsReady = true;
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
         o.customer_user_id AS customerUserId,
         o.Order_Date AS createdAt,
         o.startedAt  AS startedAt,
         oi.Quantity  AS quantity,
         m.Product_Name AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
       LEFT JOIN menu m        ON m.Product_ID = oi.Product_ID
       WHERE LOWER(COALESCE(o.Status, '')) NOT IN ('completed', 'cancelled', 'awaiting cashier review')
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
          isOnlinePickup:
            Number(r.customerUserId) > 0 &&
            normalizeOrderType(r.orderType) === "take-out",
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

// GET /orders/new-online — cashier review list for online pickup orders
// ⚠️  MUST be defined before router.patch("/:id") so Express doesn't treat
//     "new-online" as an :id parameter.
router.get("/new-online", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Status          AS status,
         o.Total_Amount    AS total,
         o.Order_Date      AS createdAt,
         o.Order_Type      AS orderType,
         oi.Quantity       AS quantity,
         COALESCE(m.Product_Name, pr.name) AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID  = o.Order_ID
       LEFT JOIN menu      m  ON m.Product_ID  = oi.Product_ID
       LEFT JOIN products  pr ON pr.id          = oi.Product_ID
       WHERE o.customer_user_id IS NOT NULL
         AND LOWER(COALESCE(o.Status, '')) = 'awaiting cashier review'
       ORDER BY o.Order_ID DESC`,
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: r.id,
          orderNumber: `#${r.id}`,
          total: Number(r.total) || 0,
          createdAt: r.createdAt,
          orderType: normalizeOrderType(r.orderType),
          trackingStatus: r.status || "Awaiting Cashier Review",
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

// GET /orders/ready-pickup — cashier pickup confirmation list for online pickup orders
router.get("/ready-pickup", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Status          AS status,
         o.Total_Amount    AS total,
         o.Order_Date      AS createdAt,
         o.Order_Type      AS orderType,
         oi.Quantity       AS quantity,
         COALESCE(m.Product_Name, pr.name) AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID  = o.Order_ID
       LEFT JOIN menu      m  ON m.Product_ID  = oi.Product_ID
       LEFT JOIN products  pr ON pr.id          = oi.Product_ID
       WHERE o.customer_user_id IS NOT NULL
         AND LOWER(COALESCE(o.Order_Type, '')) IN ('take-out', 'takeout')
         AND LOWER(COALESCE(o.Status, '')) = 'ready for pickup'
       ORDER BY o.Order_ID DESC`
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: r.id,
          orderNumber: `#${r.id}`,
          total: Number(r.total) || 0,
          createdAt: r.createdAt,
          orderType: normalizeOrderType(r.orderType),
          trackingStatus: r.status || "Ready for Pickup",
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
    console.error("GET /orders/ready-pickup error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /orders/customer/:customerUserId — customer tracking + history
router.get("/customer/:customerUserId", async (req, res) => {
  try {
    await ensureOnlineOrderColumns();

    const customerUserId = Number(req.params.customerUserId);
    if (!Number.isFinite(customerUserId) || customerUserId <= 0) {
      return res.status(400).json({ message: "Invalid customer user id" });
    }

    const [rows] = await db.query(
      `SELECT
         o.Order_ID AS id,
         o.Total_Amount AS total,
         o.Status AS status,
         o.Order_Date AS createdAt,
         o.Order_Type AS orderType,
         o.payment_reference AS paymentReference,
         o.payment_status AS paymentStatus,
         p.Payment_Type AS paymentMethod,
         oi.Quantity AS quantity,
         COALESCE(m.Product_Name, pr.name) AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
       LEFT JOIN menu m ON m.Product_ID = oi.Product_ID
       LEFT JOIN products pr ON pr.id = oi.Product_ID
       LEFT JOIN (
         SELECT p1.Order_ID, p1.Payment_Type
         FROM payments p1
         INNER JOIN (
           SELECT Order_ID, MAX(Payment_ID) AS maxPaymentId
           FROM payments
           GROUP BY Order_ID
         ) latest ON latest.maxPaymentId = p1.Payment_ID
       ) p ON p.Order_ID = o.Order_ID
       WHERE o.customer_user_id = ?
       ORDER BY o.Order_ID DESC`,
      [customerUserId]
    );

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.id]) {
        grouped[row.id] = {
          id: row.id,
          orderNumber: `#${row.id}`,
          total: Number(row.total) || 0,
          createdAt: row.createdAt,
          orderType: normalizeOrderType(row.orderType),
          rawStatus: row.status,
          trackingStatus: row.status || "Pending",
          paymentReference: row.paymentReference || null,
          paymentStatus: row.paymentStatus || null,
          paymentMethod: row.paymentMethod || "gcash",
          items: [],
        };
      }

      if (row.productName) {
        grouped[row.id].items.push({
          name: row.productName,
          quantity: Number(row.quantity) || 0,
        });
      }
    }

    const allOrders = Object.values(grouped);
    const activeOrders = allOrders.filter((order) => {
      const status = String(order.rawStatus || "").toLowerCase();
      return status !== "completed" && status !== "cancelled" && status !== "picked up";
    });
    const historyOrders = allOrders.filter((order) => {
      const status = String(order.rawStatus || "").toLowerCase();
      return status === "completed" || status === "cancelled" || status === "picked up";
    });

    res.json({ activeOrders, historyOrders });
  } catch (err) {
    console.error("GET /orders/customer/:customerUserId error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /orders/paymongo/checkout — create GCash checkout session
router.post("/paymongo/checkout", async (req, res) => {
  try {
    const { items, total, customerUserId, customerName, customerEmail } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const totalAmount = Math.round(Number(total || 0) * 100);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ message: "A valid total amount is required" });
    }

    const appBaseUrl = getAppBaseUrl(req);
    const session = await payMongoRequest("/checkout_sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: customerEmail || customerName ? {
              name: customerName || "The Crunch Customer",
              email: customerEmail || undefined,
            } : undefined,
            cancel_url: `${appBaseUrl}/usersmenu?payment=cancelled`,
            description: "The Crunch pickup order",
            line_items: items.map((item) => ({
              amount: Math.round(Number(item.price || 0) * 100),
              currency: "PHP",
              description: item.name,
              name: item.name,
              quantity: Number(item.qty) || 0,
            })),
            payment_method_types: ["gcash"],
            send_email_receipt: false,
            show_line_items: true,
            success_url: `${appBaseUrl}/usersmenu?payment=success`,
            metadata: {
              customerUserId: customerUserId ? String(customerUserId) : "",
              total: String(total || 0),
            },
          },
        },
      }),
    });

    const attributes = session?.data?.attributes || {};
    res.json({
      checkoutSessionId: session?.data?.id,
      checkoutUrl: attributes.checkout_url,
      status: attributes.status,
    });
  } catch (err) {
    console.error("POST /orders/paymongo/checkout error:", err.message);
    res.status(err.statusCode || 500).json({
      message: err.message || "Failed to create PayMongo checkout session",
      error: err.payload || null,
    });
  }
});

// GET /orders/paymongo/checkout/:checkoutSessionId — verify payment status
router.get("/paymongo/checkout/:checkoutSessionId", async (req, res) => {
  try {
    const { checkoutSessionId } = req.params;
    const session = await payMongoRequest(`/checkout_sessions/${checkoutSessionId}`, {
      method: "GET",
    });
    const attributes = session?.data?.attributes || {};
    const paid = hasPaidCheckout(attributes);

    res.json({
      checkoutSessionId,
      paid,
      status: paid ? "paid" : attributes.status || "active",
      paymentReference:
        attributes.reference_number ||
        attributes.payments?.[0]?.id ||
        checkoutSessionId,
      checkoutUrl: attributes.checkout_url || null,
    });
  } catch (err) {
    console.error("GET /orders/paymongo/checkout/:checkoutSessionId error:", err.message);
    res.status(err.statusCode || 500).json({
      message: err.message || "Failed to verify PayMongo checkout session",
      error: err.payload || null,
    });
  }
});

// POST /orders — place a new order (cashier or online customer)
router.post("/", async (req, res) => {
  let conn;
  try {
    await ensureOnlineOrderColumns();

    const {
      items,
      total,
      customerId,
      customerUserId,
      cashierId,
      cashier_id,
      orderType,
      order_type,
      paymentMethod,
      payment_method,
      paymentReference,
      payment_reference,
      paymentStatus,
      payment_status,
    } = req.body;

    // Online orders from usersmenu.tsx send NO cashierId — that's intentional.
    const resolvedCashierId = cashierId ?? cashier_id ?? null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const finalOrderType = normalizeOrderType(order_type || orderType);
    const finalPaymentMethod = String(payment_method || paymentMethod || "cash");
    const finalPaymentReference = String(payment_reference || paymentReference || "").trim() || null;
    const finalPaymentStatus = String(payment_status || paymentStatus || (finalPaymentReference ? "Paid" : "Pending"));
    const resolvedCustomerUserId = Number(customerUserId) > 0 ? Number(customerUserId) : null;
    const normalizedPaymentStatus = finalPaymentStatus.toLowerCase();
    const initialStatus =
      resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out"
        ? "Awaiting Cashier Review"
        : "Pending";

    if (resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out") {
      if (finalPaymentMethod.toLowerCase() !== "gcash") {
        return res.status(400).json({ message: "Online pickup orders must use GCash payment" });
      }
      if (!finalPaymentReference) {
        return res.status(400).json({ message: "Online pickup orders require a payment reference" });
      }
      if (normalizedPaymentStatus !== "paid" && normalizedPaymentStatus !== "completed") {
        return res.status(400).json({ message: "Online pickup orders must be paid before placement" });
      }
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Insert the order header
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status, customer_user_id, payment_reference, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [total, customerId || null, resolvedCashierId, finalOrderType, initialStatus, resolvedCustomerUserId, finalPaymentReference, finalPaymentStatus]
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

    if (normalizedPaymentStatus === "paid" || normalizedPaymentStatus === "completed") {
      await conn.query(
        "UPDATE Payments SET Payment_Status = 'Completed' WHERE Order_ID = ?",
        [orderId]
      );
    }

    await conn.commit();
    res.json({
      message: "Order placed",
      orderId,
      orderNumber: `#${orderId}`,
      trackingStatus: initialStatus,
    });
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
    const { status, startedAt, cashierId, cashier_id } = req.body;
    const resolvedCashierId = cashierId ?? cashier_id ?? null;

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    await ensureStartedAtColumn();

    const fields = ["Status = ?"];
    const values = [status];

    if (startedAt) {
      fields.push("startedAt = ?");
      values.push(new Date(startedAt));
    }

    if (resolvedCashierId != null) {
      fields.push("Cashier_ID = ?");
      values.push(resolvedCashierId);
    }

    values.push(id);
    await db.query(
      `UPDATE orders SET ${fields.join(", ")} WHERE Order_ID = ?`,
      values
    );

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
