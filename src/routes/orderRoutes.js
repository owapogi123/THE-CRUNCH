const router = require("express").Router();
const db = require("../config/db");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  deductSalesStockForCompletedOrder,
} = require("../services/inventoryService");
const fetchFn = (...args) =>
  (typeof fetch === "function"
    ? fetch(...args)
    : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args)));
const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function normalizeOrderType(value) {
  if (!value) return "dine-in";
  const v = String(value).toLowerCase().trim();
  if (v === "take-out" || v === "takeout") return "take-out";
  if (v === "delivery") return "delivery";
  return "dine-in";
}

function normalizePaymentMethod(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return "cash";
  if (
    v === "gcash_onsite" ||
    v === "onsite_epayment" ||
    v === "onsite e-payment" ||
    v === "onsite epayment" ||
    v === "e-payment"
  ) {
    return "gcash_onsite";
  }
  if (v === "gcash") return "gcash";
  return v === "cash" ? "cash" : String(value);
}

const DEFAULT_ESTIMATED_PREP_MINUTES = 10;
const PAYMENT_PROOF_DIR = path.join(
  __dirname,
  "..",
  "..",
  "uploads",
  "payment-proofs"
);

function normalizeKitchenStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return "Queued";
  if (v === "pending" || v === "queued") return "Queued";
  if (v === "preparing" || v === "in progress") return "Preparing";
  if (v === "ready" || v === "ready for pickup") return "Ready for Pickup";
  if (v === "completed") return "Completed";
  // Legacy compatibility: historical pickup completions now read as Completed.
  if (v === "picked up") return "Completed";
  if (v === "cancelled") return "Cancelled";
  if (v === "awaiting cashier review") return "Awaiting Cashier Review";
  if (v === "refunded") return "Refunded";
  return value;
}

function canUpdateTimerForStatus(value) {
  const normalized = normalizeKitchenStatus(value);
  return normalized === "Queued" || normalized === "Preparing";
}

function isStrictKitchenTransitionAllowed(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;

  if (nextStatus === "Cancelled") {
    return (
      currentStatus === "Awaiting Cashier Review" ||
      currentStatus === "Queued" ||
      currentStatus === "Preparing"
    );
  }

  if (nextStatus === "Refunded") {
    return currentStatus === "Completed";
  }

  const allowedTransitions = {
    "Awaiting Cashier Review": ["Queued", "Cancelled"],
    Queued: ["Preparing"],
    Preparing: ["Ready for Pickup"],
    "Ready for Pickup": ["Completed"],
    Completed: [],
    Cancelled: [],
    Refunded: [],
  };

  return (allowedTransitions[currentStatus] || []).includes(nextStatus);
}

function isPreparingStatus(value) {
  return normalizeKitchenStatus(value) === "Preparing";
}

function isReadyStatus(value) {
  return normalizeKitchenStatus(value) === "Ready for Pickup";
}

function isFinishedStatus(value) {
  const normalized = normalizeKitchenStatus(value);
  return (
    normalized === "Completed" ||
    normalized === "Cancelled" ||
    normalized === "Refunded"
  );
}

function isAwaitingCashierReviewStatus(value) {
  return normalizeKitchenStatus(value) === "Awaiting Cashier Review";
}

function requireAuthenticatedUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function hasPaidCheckout(attributes) {
  const payments = Array.isArray(attributes?.payments) ? attributes.payments : [];
  return payments.some((payment) => {
    const status = String(payment?.attributes?.status || payment?.status || "").toLowerCase();
    return status === "paid";
  });
}

function normalizePaymentStatus(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "paid" || v === "completed") return "Paid";
  if (v === "pending verification") return "Pending Verification";
  if (v === "pending payment") return "Pending Payment";
  if (v === "pending") return "Pending";
  return value ? String(value) : "Pending";
}

function isPaidPaymentStatus(value) {
  const normalized = normalizePaymentStatus(value);
  return normalized === "Paid";
}

function getCustomerTrackingStatus(rawStatus, paymentStatus) {
  const normalizedStatus = normalizeKitchenStatus(rawStatus);
  const normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);

  if (
    normalizedStatus === "Completed"
  ) {
    return "Completed";
  }

  if (normalizedStatus === "Awaiting Cashier Review") {
    return normalizedPaymentStatus === "Pending Payment"
      ? "Pending Payment"
      : "Awaiting Cashier Review";
  }

  return normalizedStatus || "Queued";
}

function getPaymentProofContentType(extension) {
  const ext = String(extension || "").toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function getPaymentProofExtension(mimeType) {
  const normalized = String(mimeType || "").toLowerCase().trim();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/jpg" || normalized === "image/jpeg") return ".jpg";
  return null;
}

async function ensurePaymentProofDirectory() {
  await fs.mkdir(PAYMENT_PROOF_DIR, { recursive: true });
}

function parsePaymentProofDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/
  );

  if (!match) {
    const error = new Error("Invalid payment proof image");
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  const extension = getPaymentProofExtension(mimeType);
  if (!extension) {
    const error = new Error("Only PNG, JPG, and WEBP payment proof images are supported");
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    const error = new Error("Payment proof image is empty");
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > 5 * 1024 * 1024) {
    const error = new Error("Payment proof image must be 5 MB or smaller");
    error.statusCode = 400;
    throw error;
  }

  return { buffer, extension };
}

async function verifyPayMongoCheckoutSession(checkoutSessionId) {
  const normalizedId = String(checkoutSessionId || "").trim();
  if (!normalizedId) {
    return { paid: false, status: "missing", paymentReference: null };
  }

  if (!getPayMongoSecretKey() && normalizedId.startsWith("TEST-BYPASS-")) {
    return {
      paid: true,
      status: "paid",
      paymentReference: normalizedId,
    };
  }

  const session = await payMongoRequest(`/checkout_sessions/${normalizedId}`, {
    method: "GET",
  });
  const attributes = session?.data?.attributes || {};
  const paid = hasPaidCheckout(attributes);

  return {
    paid,
    status: paid ? "paid" : attributes.status || "active",
    paymentReference:
      attributes.reference_number ||
      attributes.payments?.[0]?.id ||
      normalizedId,
  };
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
    "ALTER TABLE orders ADD COLUMN payment_method VARCHAR(50) NULL",
    "ALTER TABLE orders ADD COLUMN proof_image_url VARCHAR(500) NULL",
    "ALTER TABLE orders ADD COLUMN verified_by INT NULL",
    "ALTER TABLE orders ADD COLUMN verified_at DATETIME NULL",
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

let orderStockDeductionColumnReady = false;
async function ensureOrderStockDeductionColumn() {
  if (orderStockDeductionColumnReady) return;
  try {
    await db.query(
      "ALTER TABLE orders ADD COLUMN stock_deducted TINYINT(1) NOT NULL DEFAULT 0",
    );
  } catch (_) {
    // Column already exists on subsequent runs.
  }

  try {
    await db.query(
      "UPDATE orders SET stock_deducted = 0 WHERE stock_deducted IS NULL",
    );
  } catch (_) {
    // Safe backfill if the column already existed with nullable values.
  }

  orderStockDeductionColumnReady = true;
}

let deliveryTrackingColumnsReady = false;
async function ensureDeliveryTrackingColumns() {
  if (deliveryTrackingColumnsReady) return;
  const statements = [
    "ALTER TABLE orders ADD COLUMN handoverTimestamp DATETIME NULL",
    "ALTER TABLE orders ADD COLUMN riderName VARCHAR(255) NULL",
  ];

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (_) {
      // Column already exists on subsequent runs.
    }
  }

  deliveryTrackingColumnsReady = true;
}

let kitchenTimingColumnsReady = false;
async function ensureKitchenTimingColumns() {
  if (kitchenTimingColumnsReady) return;
  const statements = [
    "ALTER TABLE orders ADD COLUMN queuedAt DATETIME NULL",
    "ALTER TABLE orders ADD COLUMN prepStartedAt DATETIME NULL",
    "ALTER TABLE orders ADD COLUMN readyAt DATETIME NULL",
    "ALTER TABLE orders ADD COLUMN dueAt DATETIME NULL",
    "ALTER TABLE orders ADD COLUMN estimatedPrepMinutes INT NULL",
    "ALTER TABLE orders ADD COLUMN timerUpdatedBy INT NULL",
    "ALTER TABLE orders ADD COLUMN timerUpdatedAt DATETIME NULL",
  ];

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (_) {
      // Column already exists on subsequent runs.
    }
  }

  kitchenTimingColumnsReady = true;
}

// ─── ROUTES (specific paths MUST come before /:id wildcards) ──────────────────

// GET /orders — list all orders for dashboard
router.get("/", async (req, res) => {
  try {
    await ensureDeliveryTrackingColumns();
    const [orders] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Total_Amount    AS total,
         o.Status          AS status,
         o.Order_Date      AS date,
         o.Order_Type      AS orderType,
         o.payment_reference AS paymentReference,
         o.handoverTimestamp AS handoverTimestamp,
         o.riderName       AS riderName,
         p.Payment_Type    AS paymentMethod,
         p.Payment_ID      AS paymentId,
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
         SELECT p1.Order_ID, p1.Payment_ID, p1.Payment_Type
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
    await ensureKitchenTimingColumns();

    const [rows] = await db.query(
      `SELECT
         o.Order_ID   AS id,
         o.Status     AS status,
         o.Order_Type AS orderType,
         o.customer_user_id AS customerUserId,
         o.payment_status AS paymentStatus,
         o.Order_Date AS createdAt,
         o.queuedAt   AS queuedAt,
         o.prepStartedAt AS prepStartedAt,
         o.readyAt    AS readyAt,
         o.dueAt      AS dueAt,
         o.startedAt  AS startedAt,
         o.estimatedPrepMinutes AS estimatedPrepMinutes,
         o.timerUpdatedBy AS timerUpdatedBy,
         o.timerUpdatedAt AS timerUpdatedAt,
         p.Payment_Status AS paymentRecordStatus,
         oi.Quantity  AS quantity,
         m.Product_Name AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
       LEFT JOIN Menu m        ON m.Product_ID = oi.Product_ID
       LEFT JOIN (
         SELECT p1.Order_ID, p1.Payment_Status
         FROM payments p1
         INNER JOIN (
           SELECT Order_ID, MAX(Payment_ID) AS maxPaymentId
           FROM payments
           GROUP BY Order_ID
         ) latest ON latest.maxPaymentId = p1.Payment_ID
       ) p ON p.Order_ID = o.Order_ID
       WHERE LOWER(COALESCE(o.Status, '')) NOT IN ('completed', 'cancelled', 'awaiting cashier review', 'picked up', 'refunded')
       ORDER BY o.Order_ID ASC`
    );

    const grouped = {};
    for (const r of rows) {
      const normalizedStatus = normalizeKitchenStatus(r.status);
      const estimatedPrepMinutes =
        Math.max(Number(r.estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES, 1);
      const dueAt = r.dueAt ? new Date(r.dueAt) : null;
      const overdue =
        normalizedStatus === "Preparing" &&
        Boolean(dueAt) &&
        Date.now() > dueAt.getTime() &&
        !isFinishedStatus(normalizedStatus);

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
          currentStatus: normalizedStatus,
          paymentStatus: normalizePaymentStatus(
            r.paymentStatus || r.paymentRecordStatus || "Pending"
          ),
          isPreparing: isPreparingStatus(normalizedStatus),
          isReady: isReadyStatus(normalizedStatus),
          isFinished: isFinishedStatus(normalizedStatus),
          createdAt: r.createdAt ? new Date(r.createdAt).getTime() : undefined,
          queuedAt: r.queuedAt ? new Date(r.queuedAt).getTime() : undefined,
          prepStartedAt: r.prepStartedAt
            ? new Date(r.prepStartedAt).getTime()
            : undefined,
          readyAt: r.readyAt ? new Date(r.readyAt).getTime() : undefined,
          startedAt: r.startedAt
            ? new Date(r.startedAt).getTime()
            : undefined,
          estimatedPrepMinutes,
          dueAt: dueAt ? dueAt.getTime() : undefined,
          overdue,
          timerUpdatedBy:
            r.timerUpdatedBy != null ? Number(r.timerUpdatedBy) : null,
          timerUpdatedAt: r.timerUpdatedAt
            ? new Date(r.timerUpdatedAt).getTime()
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

    const sorted = Object.values(grouped)
      .filter((order) => isPaidPaymentStatus(order.paymentStatus))
      .sort((a, b) => {
      const getPriority = (order) => {
        if (order.isPreparing && order.overdue) return 0;
        if (order.isPreparing) return 1;
        if (!order.isPreparing && !order.isReady) return 2;
        if (order.isReady) return 3;
        return 4;
      };
      const aPriority = getPriority(a);
      const bPriority = getPriority(b);
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aBase = a.prepStartedAt || a.queuedAt || a.createdAt || 0;
      const bBase = b.prepStartedAt || b.queuedAt || b.createdAt || 0;
      if (aBase !== bBase) return aBase - bBase;
      return Number(a.id) - Number(b.id);
    });

    res.json(sorted);
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
       LEFT JOIN Menu      m  ON m.Product_ID  = oi.Product_ID
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
    await ensureDeliveryTrackingColumns();
    const [rows] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Status          AS status,
         o.Total_Amount    AS total,
         o.Order_Date      AS createdAt,
         o.Order_Type      AS orderType,
         o.handoverTimestamp AS handoverTimestamp,
         o.riderName       AS riderName,
         oi.Quantity       AS quantity,
         COALESCE(m.Product_Name, pr.name) AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID  = o.Order_ID
       LEFT JOIN Menu      m  ON m.Product_ID  = oi.Product_ID
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
          handoverTimestamp: r.handoverTimestamp,
          riderName: r.riderName,
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

// GET /orders/delivery-handover — cashier handover list for POS delivery orders
router.get("/delivery-handover", async (req, res) => {
  try {
    await ensureDeliveryTrackingColumns();
    const [rows] = await db.query(
      `SELECT
         o.Order_ID          AS id,
         o.Status            AS status,
         o.Total_Amount      AS total,
         o.Order_Date        AS createdAt,
         o.Order_Type        AS orderType,
         o.handoverTimestamp AS handoverTimestamp,
         o.riderName         AS riderName,
         oi.Quantity         AS quantity,
         COALESCE(m.Product_Name, pr.name) AS productName
       FROM orders o
       LEFT JOIN order_item oi ON oi.Order_ID  = o.Order_ID
       LEFT JOIN Menu      m  ON m.Product_ID  = oi.Product_ID
       LEFT JOIN products  pr ON pr.id          = oi.Product_ID
       WHERE o.customer_user_id IS NULL
         AND LOWER(COALESCE(o.Order_Type, '')) = 'delivery'
         AND LOWER(COALESCE(o.Status, '')) IN ('ready', 'completed', 'ready for pickup')
         AND COALESCE(o.handoverTimestamp, NULL) IS NULL
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
          trackingStatus: r.status || "Ready",
          handoverTimestamp: r.handoverTimestamp,
          riderName: r.riderName,
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
    console.error("GET /orders/delivery-handover error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /orders/customer/:customerUserId — customer tracking + history
router.get("/customer/:customerUserId", requireAuthenticatedUser, async (req, res) => {
  try {
    await ensureOnlineOrderColumns();

    const customerUserId = Number(req.params.customerUserId);
    if (!Number.isFinite(customerUserId) || customerUserId <= 0) {
      return res.status(400).json({ message: "Invalid customer user id" });
    }

    const requesterUserId = Number(req.user?.userId);
    const requesterRole = String(req.user?.role || "").toLowerCase();
    const canAccess =
      requesterUserId === customerUserId || requesterRole === "administrator";

    if (!canAccess) {
      return res.status(403).json({
        message: "You can only access your own order history",
      });
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
       LEFT JOIN Menu m ON m.Product_ID = oi.Product_ID
       LEFT JOIN products pr ON pr.id = oi.Product_ID
       LEFT JOIN (
         SELECT p1.Order_ID, p1.Payment_ID, p1.Payment_Type
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
        const trackingStatus = getCustomerTrackingStatus(
          row.status,
          row.paymentStatus,
        );
        grouped[row.id] = {
          id: row.id,
          orderNumber: `#${row.id}`,
          total: Number(row.total) || 0,
          createdAt: row.createdAt,
          orderType: normalizeOrderType(row.orderType),
          rawStatus: row.status,
          trackingStatus,
          paymentReference: row.paymentReference || null,
          paymentStatus: normalizePaymentStatus(row.paymentStatus || null),
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
      const status = normalizeKitchenStatus(order.rawStatus);
      return (
        status !== "Completed" &&
        status !== "Cancelled" &&
        status !== "Refunded"
      );
    });
    const historyOrders = allOrders.filter((order) => {
      const status = normalizeKitchenStatus(order.rawStatus);
      return (
        status === "Completed" ||
        status === "Cancelled" ||
        status === "Refunded"
      );
    });

    res.json({ activeOrders, historyOrders });
  } catch (err) {
    console.error("GET /orders/customer/:customerUserId error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /orders/payment-proofs — save cashier onsite e-payment proof image
router.post("/payment-proofs", async (req, res) => {
  try {
    const { dataUrl, originalName } = req.body || {};
    const { buffer, extension } = parsePaymentProofDataUrl(dataUrl);
    await ensurePaymentProofDirectory();

    const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    const absolutePath = path.join(PAYMENT_PROOF_DIR, filename);
    await fs.writeFile(absolutePath, buffer);

    res.json({
      message: "Payment proof uploaded",
      proofImageUrl: `/api/orders/payment-proofs/${encodeURIComponent(filename)}`,
      originalName: originalName ? String(originalName) : null,
    });
  } catch (err) {
    console.error("POST /orders/payment-proofs error:", err.message);
    res.status(err.statusCode || 500).json({
      message: err.message || "Failed to upload payment proof",
    });
  }
});

// GET /orders/payment-proofs/:filename — serve cashier onsite e-payment proof image
router.get("/payment-proofs/:filename", async (req, res) => {
  try {
    const requested = decodeURIComponent(String(req.params.filename || ""));
    const safeFilename = path.basename(requested);
    if (!safeFilename || safeFilename !== requested) {
      return res.status(400).json({ message: "Invalid payment proof filename" });
    }

    const absolutePath = path.join(PAYMENT_PROOF_DIR, safeFilename);
    await fs.access(absolutePath);
    res.type(getPaymentProofContentType(path.extname(safeFilename)));
    return res.sendFile(absolutePath);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return res.status(404).json({ message: "Payment proof not found" });
    }
    console.error("GET /orders/payment-proofs/:filename error:", err.message);
    return res.status(500).json({
      message: err.message || "Failed to load payment proof",
    });
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
    await ensureOrderStockDeductionColumn();

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
      checkoutSessionId,
      checkout_session_id,
      paymentReference,
      payment_reference,
      paymentStatus,
      payment_status,
      proofImageUrl,
      proof_image_url,
    } = req.body;

    // Online orders from usersmenu.tsx send NO cashierId — that's intentional.
    const resolvedCashierId = cashierId ?? cashier_id ?? null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }

    const finalOrderType = normalizeOrderType(order_type || orderType);
    const finalPaymentMethod = normalizePaymentMethod(
      payment_method || paymentMethod || "cash"
    );
    const submittedPaymentReference = String(payment_reference || paymentReference || "").trim() || null;
    const submittedCheckoutSessionId = String(
      checkout_session_id || checkoutSessionId || ""
    ).trim() || null;
    const submittedProofImageUrl =
      String(proof_image_url || proofImageUrl || "").trim() || null;
    const resolvedCustomerUserId = Number(customerUserId) > 0 ? Number(customerUserId) : null;
    const isOnlinePickupOrder =
      resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out";
    let effectivePaymentReference = submittedPaymentReference;
    let effectivePaymentStatus = "Pending";
    let verifiedBy = null;
    let verifiedAt = null;
    let initialStatus =
      resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out"
        ? "Awaiting Cashier Review"
        : "Pending";

    if (resolvedCashierId != null) {
      if (finalPaymentMethod === "cash") {
        effectivePaymentStatus = "Paid";
      } else if (finalPaymentMethod === "gcash_onsite") {
        effectivePaymentStatus = normalizePaymentStatus(
          payment_status || paymentStatus || "Pending Verification"
        );

        if (!submittedProofImageUrl) {
          return res.status(400).json({
            message: "Onsite e-payment orders require a proof image before confirmation",
          });
        }

        if (!isPaidPaymentStatus(effectivePaymentStatus)) {
          return res.status(400).json({
            message: "Onsite e-payment orders must be manually confirmed by the cashier before placement",
          });
        }

        verifiedBy = resolvedCashierId;
        verifiedAt = new Date();
      } else {
        effectivePaymentStatus = normalizePaymentStatus(
          payment_status || paymentStatus || "Paid"
        );
      }
    } else if (isOnlinePickupOrder && finalPaymentMethod.toLowerCase() === "gcash") {
      const checkoutToVerify = submittedCheckoutSessionId || submittedPaymentReference;
      const verification = await verifyPayMongoCheckoutSession(checkoutToVerify);
      if (!checkoutToVerify) {
        return res.status(400).json({ message: "Online pickup orders require a PayMongo checkout session" });
      }
      if (!verification.paid) {
        return res.status(400).json({ message: "Online pickup orders must be paid after backend verification" });
      }
      effectivePaymentStatus = "Paid";
      effectivePaymentReference = verification.paymentReference || checkoutToVerify;
    } else if (isOnlinePickupOrder && finalPaymentMethod.toLowerCase() === "cash") {
      effectivePaymentStatus = "Pending Payment";
      effectivePaymentReference = null;
      initialStatus = "Awaiting Cashier Review";
    } else {
      effectivePaymentStatus = normalizePaymentStatus(
        payment_status || paymentStatus || (submittedPaymentReference ? "Paid" : "Pending")
      );
    }

    if (isOnlinePickupOrder) {
      initialStatus = "Awaiting Cashier Review";
    }

    if (resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out") {
      if (finalPaymentMethod.toLowerCase() !== "gcash" && finalPaymentMethod.toLowerCase() !== "cash") {
        return res.status(400).json({ message: "Online pickup orders must use GCash or cash payment" });
      }

      if (finalPaymentMethod.toLowerCase() !== "gcash") {
        // Cash on pickup is allowed, but remains blocked from the cook queue until payment is confirmed.
      } else if (!effectivePaymentReference) {
        return res.status(400).json({ message: "Online pickup orders require a verified payment reference" });
      }
    }

    conn = await db.getConnection();

    // Insert the order header
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status, customer_user_id, payment_reference, payment_status, payment_method, proof_image_url, verified_by, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        total,
        customerId || null,
        resolvedCashierId,
        finalOrderType,
        initialStatus,
        resolvedCustomerUserId,
        effectivePaymentReference,
        effectivePaymentStatus,
        finalPaymentMethod,
        submittedProofImageUrl,
        verifiedBy,
        verifiedAt,
      ]
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

    }

    // Insert payment record
    await conn.query(
      "INSERT INTO payments (Order_ID, Payment_Type, Payment_Status, ProcessBy) VALUES (?, ?, 'Pending', ?)",
      [orderId, finalPaymentMethod, resolvedCashierId]
    );

    if (isPaidPaymentStatus(effectivePaymentStatus)) {
      await conn.query(
        "UPDATE payments SET Payment_Status = 'Completed' WHERE Order_ID = ?",
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
  let conn;
  let txStarted = false;
  try {
    const { id } = req.params;
    const {
      status,
      startedAt,
      cashierId,
      cashier_id,
      handoverTimestamp,
      riderName,
      estimatedPrepMinutes,
      timerUpdatedBy,
      paymentStatus,
      payment_status,
    } = req.body;
    const resolvedCashierId = cashierId ?? cashier_id ?? null;

    await ensureStartedAtColumn();
    await ensureDeliveryTrackingColumns();
    await ensureKitchenTimingColumns();
    await ensureOrderStockDeductionColumn();

    conn = await db.getConnection();

    const [existingRows] = await conn.query(
      `SELECT
         Status AS status,
         queuedAt AS queuedAt,
         prepStartedAt AS prepStartedAt,
         dueAt AS dueAt,
         estimatedPrepMinutes AS estimatedPrepMinutes,
         payment_status AS paymentStatus,
         (
           SELECT p.Payment_Status
           FROM payments p
           WHERE p.Order_ID = o.Order_ID
           ORDER BY p.Payment_ID DESC
           LIMIT 1
         ) AS paymentRecordStatus,
         COALESCE(stock_deducted, 0) AS stockDeducted
       FROM orders o
       WHERE o.Order_ID = ?
       LIMIT 1`,
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const currentRawStatus = existingRows[0].status;
    const currentStatus = normalizeKitchenStatus(currentRawStatus);
    const hasTimerUpdate = estimatedPrepMinutes !== undefined;
    const hasStatusUpdate = status !== undefined && status !== null && String(status).trim() !== "";
    const submittedPaymentStatus = payment_status ?? paymentStatus;
    const hasPaymentStatusUpdate =
      submittedPaymentStatus !== undefined &&
      submittedPaymentStatus !== null &&
      String(submittedPaymentStatus).trim() !== "";
    const nextPaymentStatus = hasPaymentStatusUpdate
      ? normalizePaymentStatus(submittedPaymentStatus)
      : normalizePaymentStatus(
          existingRows[0].paymentStatus || existingRows[0].paymentRecordStatus
        );

    if (!hasStatusUpdate && !hasTimerUpdate && !hasPaymentStatusUpdate && !startedAt && resolvedCashierId == null && !handoverTimestamp && riderName === undefined) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    if (hasTimerUpdate && !canUpdateTimerForStatus(currentStatus)) {
      return res.status(400).json({
        message: "Timer can only be updated while the order is queued or preparing",
      });
    }

    let nextStatus = currentStatus;
    if (hasStatusUpdate) {
      nextStatus = normalizeKitchenStatus(status);
      if (!isStrictKitchenTransitionAllowed(currentStatus, nextStatus)) {
        return res.status(400).json({
          message: `Invalid order status transition: ${currentStatus} -> ${nextStatus}`,
        });
      }
    }

    if (
      (nextStatus === "Queued" || nextStatus === "Preparing") &&
      !isPaidPaymentStatus(nextPaymentStatus)
    ) {
      return res.status(400).json({
        message: "Orders cannot move to the cook queue until payment is confirmed as paid",
      });
    }

    const fields = [];
    const values = [];

    if (hasStatusUpdate) {
      fields.push("Status = ?");
      values.push(nextStatus);
    }

    if (hasPaymentStatusUpdate) {
      fields.push("payment_status = ?");
      values.push(nextPaymentStatus);
    } else if (
      nextStatus === "Completed" &&
      !isPaidPaymentStatus(existingRows[0].paymentStatus) &&
      isPaidPaymentStatus(existingRows[0].paymentRecordStatus)
    ) {
      fields.push("payment_status = ?");
      values.push("Paid");
    }

    if (
      !existingRows[0].queuedAt &&
      (currentStatus === "Queued" || nextStatus === "Queued" || nextStatus === "Preparing")
    ) {
      fields.push("queuedAt = ?");
      values.push(new Date());
    }

    if (hasTimerUpdate) {
      const parsedEstimatedPrepMinutes = Math.max(
        Number(estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES,
        1
      );
      fields.push("estimatedPrepMinutes = ?");
      values.push(parsedEstimatedPrepMinutes);
      fields.push("timerUpdatedAt = ?");
      values.push(new Date());
      fields.push("timerUpdatedBy = ?");
      values.push(
        timerUpdatedBy != null && Number.isFinite(Number(timerUpdatedBy))
          ? Number(timerUpdatedBy)
          : null
      );

      if (currentStatus === "Preparing" && existingRows[0].prepStartedAt) {
        const prepStartedAt = new Date(existingRows[0].prepStartedAt);
        const nextDueAt = new Date(
          prepStartedAt.getTime() + parsedEstimatedPrepMinutes * 60 * 1000
        );
        fields.push("dueAt = ?");
        values.push(nextDueAt);
      }
    }

    if (hasStatusUpdate && nextStatus === "Preparing") {
      const prepStartDate = startedAt ? new Date(startedAt) : new Date();
      const prepMinutes = Math.max(
        Number(estimatedPrepMinutes ?? existingRows[0].estimatedPrepMinutes) ||
          DEFAULT_ESTIMATED_PREP_MINUTES,
        1
      );
      const nextDueAt = new Date(
        prepStartDate.getTime() + prepMinutes * 60 * 1000
      );
      fields.push("prepStartedAt = ?");
      values.push(prepStartDate);
      fields.push("startedAt = ?");
      values.push(prepStartDate);
      fields.push("readyAt = NULL");
      fields.push("dueAt = ?");
      values.push(nextDueAt);
      if (estimatedPrepMinutes === undefined) {
        fields.push("estimatedPrepMinutes = ?");
        values.push(prepMinutes);
      }
    }

    if (hasStatusUpdate && nextStatus === "Ready for Pickup") {
      fields.push("readyAt = ?");
      values.push(new Date());
    }

    if (resolvedCashierId != null) {
      fields.push("Cashier_ID = ?");
      values.push(resolvedCashierId);
    }

    if (handoverTimestamp) {
      fields.push("handoverTimestamp = ?");
      values.push(new Date(handoverTimestamp));
    }

    if (riderName !== undefined) {
      fields.push("riderName = ?");
      values.push(riderName ? String(riderName).trim() : null);
    }

    if (!fields.length) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    await conn.beginTransaction();
    txStarted = true;

    values.push(id);
    await conn.query(
      `UPDATE orders SET ${fields.join(", ")} WHERE Order_ID = ?`,
      values
    );

    const shouldDeductStockNow =
      hasStatusUpdate &&
      currentStatus !== "Completed" &&
      nextStatus === "Completed" &&
      Number(existingRows[0].stockDeducted) === 0;

    if (shouldDeductStockNow) {
      if (!isPaidPaymentStatus(nextPaymentStatus)) {
        throw new Error("Cannot deduct stock for an unpaid completed order");
      }

      await deductSalesStockForCompletedOrder(id, resolvedCashierId, conn);
    }

    if (hasPaymentStatusUpdate || nextStatus === "Completed") {
      const paymentRecordStatus =
        isPaidPaymentStatus(nextPaymentStatus) || nextStatus === "Completed"
          ? "Completed"
          : "Pending";
      await conn.query(
        "UPDATE payments SET Payment_Status = ? WHERE Order_ID = ?",
        [paymentRecordStatus, id]
      );
    }

    await conn.commit();
    txStarted = false;

    res.json({
      message: "Order updated",
      id,
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      estimatedPrepMinutes:
        hasTimerUpdate
          ? Math.max(Number(estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES, 1)
          : undefined,
    });
  } catch (err) {
    if (conn && txStarted) await conn.rollback();
    console.error("PATCH /orders/:id error:", JSON.stringify({
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
    }, null, 2));
    res.status(500).json({ message: "DB error", error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
