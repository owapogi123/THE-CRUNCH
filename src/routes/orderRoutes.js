const router = require("express").Router();
const db = require("../config/db");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const {
  requireAuthenticatedUser,
  requireCookViewAccess,
} = require("../middleware/cookViewAccess");
const { sendCustomerOrderReceiptEmail } = require("../services/emailService");
const {
  deductPrevalidatedStockForPaidOrder,
  deductStockForPaidOrder,
  prepareOrderItemsAndStock,
  restoreStockForRefundedOrder,
} = require("../services/inventoryService");
const {
  normalizeOrderItems,
} = require("../services/orderItemService");
const {
  allocateOrderIdentifiers,
  formatOrderNumber,
  formatTransactionId,
  getBusinessDateParts,
} = require("../services/orderIdentifierService");
const {
  collectOrderItemNotes,
  createReceiptSnapshot,
  loadReceiptDto,
} = require("../services/receiptSnapshotService");
const {
  canSettlePersistedOrders,
  isSuperuserRole,
  normalizeRole,
} = require("../middleware/roleAccess");
const {
  isDevelopmentTimingEnabled,
  runWithDbQueryTiming,
} = require("../services/requestTiming");
const {
  publishOrderMutation,
  publishRefundRequestMutation,
} = require("../services/applicationEvents");
const { validateCashTender } = require("../services/cashValidationService");
const {
  APPROVAL_TTL_SECONDS,
  claimDiscountApproval,
  issueDiscountApproval,
  releaseDiscountApproval,
  verifyAuthorizationCode,
  verifyDiscountApproval,
} = require("../services/discountAuthorizationService");
const {
  claimBypassCheckout,
  consumeBypassCheckout,
  isBypassCheckoutId,
  isPayMongoEnabled,
  releaseBypassCheckout,
  verifyBypassCheckout,
} = require("../services/paymongoMode");
const {
  verifyPayMongoCheckoutSession: verifyBoundPayMongoCheckoutSession,
} = require("../services/paymongoCheckoutService");
const paymongoRoutes = require("./paymongoRoutes");
function withOrderRequestTiming(req, _res, next) {
  if (!isDevelopmentTimingEnabled()) return next();
  return runWithDbQueryTiming((queryTiming) => {
    req.orderTiming = {
      startedAt: process.hrtime.bigint(),
      stages: [],
      queryTiming,
    };
    return next();
  });
}

async function runOrderStage(req, name, callback) {
  const startedAt = process.hrtime.bigint();
  try {
    return await callback();
  } finally {
    if (req.orderTiming) {
      req.orderTiming.stages.push({
        name,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      });
    }
  }
}

function logOrderTiming(req, outcome) {
  const timing = req.orderTiming;
  if (!timing) return;
  const queries = timing.queryTiming?.queries ?? [];
  const slowestQuery = queries.reduce(
    (slowest, query) =>
      !slowest || query.durationMs > slowest.durationMs ? query : slowest,
    null,
  );
  console.info("[TIMING ORDER]", JSON.stringify({
    outcome,
    totalMs: Number(
      (Number(process.hrtime.bigint() - timing.startedAt) / 1e6).toFixed(1),
    ),
    dbStatementCount: queries.length,
    dbTotalMs: Number(
      queries.reduce((sum, query) => sum + query.durationMs, 0).toFixed(1),
    ),
    slowestQuery: slowestQuery
      ? {
          operation: slowestQuery.operation,
          sql: slowestQuery.sql,
          durationMs: Number(slowestQuery.durationMs.toFixed(1)),
        }
      : null,
    stages: timing.stages.map((stage) => ({
      name: stage.name,
      durationMs: Number(stage.durationMs.toFixed(1)),
    })),
  }));
}

function startOrderTransactionTiming(req) {
  if (req.orderTiming) {
    req.orderTiming.transactionStartedAt = process.hrtime.bigint();
  }
}

function finishOrderTransactionTiming(req) {
  const timing = req.orderTiming;
  if (!timing?.transactionStartedAt || timing.transactionFinished) return;
  timing.transactionFinished = true;
  timing.stages.push({
    name: "transaction total",
    durationMs:
      Number(process.hrtime.bigint() - timing.transactionStartedAt) / 1e6,
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function normalizeOrderType(value) {
  if (!value) return "dine-in";
  const v = String(value).toLowerCase().trim();
  if (v === "take-out" || v === "takeout") return "take-out";
  if (v === "delivery") return "delivery";
  return "dine-in";
}

function getPublicOrderIdentifiers(row) {
  return {
    transactionId: formatTransactionId(
      row?.transactionId ?? row?.transaction_id,
    ),
    orderNumber: formatOrderNumber(
      row?.orderNumberValue ?? row?.order_number,
      row?.id ?? row?.Order_ID,
    ),
    businessDate: row?.businessDate ?? row?.business_date ?? null,
  };
}

function normalizePaymentMethod(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return "cash";
  if (v === "cash on pickup" || v === "cash_on_pickup") return "cash_on_pickup";
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

function getStoredPaymentMethod(method, options = {}) {
  const normalizedMethod = normalizePaymentMethod(method);
  const { isOnlinePickupOrder = false } = options;

  if (normalizedMethod === "gcash") return "GCash";
  if (normalizedMethod === "gcash_onsite") return "Onsite GCash / E-Payment";
  if (
    normalizedMethod === "cash_on_pickup" ||
    (normalizedMethod === "cash" && isOnlinePickupOrder)
  ) {
    return "Cash on Pickup";
  }
  if (normalizedMethod === "cash") return "Cash";
  return method ? String(method) : "Cash";
}

const DEFAULT_ESTIMATED_PREP_MINUTES = 10;
const PAYMENT_PROOF_DIR = path.resolve(
  process.env.PAYMENT_PROOF_UPLOAD_DIR ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "payment-proofs")
      : path.join(__dirname, "..", "..", "uploads", "payment-proofs")),
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

  if (nextStatus === "Cancelled" || nextStatus === "Refunded") {
    return true;
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

function requireCashierOrderActor(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (role === "cashier" || isSuperuserRole(role)) return next();
  return res.status(403).json({ message: "Cashier access required" });
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

function buildCustomerReceiptNote(paymentStatus) {
  if (normalizePaymentStatus(paymentStatus) === "Pending Payment") {
    return "Your order will be prepared once payment is confirmed onsite.";
  }
  return "Your payment has been verified. We are preparing your order.";
}

async function loadBillingSettings(connection = db) {
  try {
    const [rows] = await connection.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'restaurant_settings'
        LIMIT 1`,
    );
    if (!rows.length || !rows[0].settings_json) {
      return { taxRate: 0, serviceCharge: 0 };
    }
    const parsed = JSON.parse(rows[0].settings_json);
    return {
      taxRate: Math.max(0, Number(parsed?.taxRate ?? 0) || 0),
      serviceCharge: Math.max(0, Number(parsed?.serviceCharge ?? 0) || 0),
    };
  } catch {
    return { taxRate: 0, serviceCharge: 0 };
  }
}

async function loadCashierOrderConfiguration(connection, discountName, discountId) {
  const normalizedName = String(discountName || "").trim();
  const normalizedDiscountId = Number(discountId);
  const hasDiscountId =
    Number.isSafeInteger(normalizedDiscountId) && normalizedDiscountId > 0;
  const [rows] = await connection.query(
    `SELECT
       settings.settings_json,
       discount.discount_id,
       discount.name AS discount_name,
       discount.percentage AS discount_percentage
     FROM (SELECT 1 AS singleton) anchor
     LEFT JOIN system_settings settings
       ON settings.setting_key = 'restaurant_settings'
     LEFT JOIN (
        SELECT discount_id, name, percentage
       FROM discount_types
        WHERE (
          (? IS NOT NULL AND discount_id = ?)
          OR (? IS NULL AND LOWER(name) = LOWER(?))
        )
         AND is_active = TRUE
       LIMIT 1
     ) discount ON TRUE`,
    [
      hasDiscountId ? normalizedDiscountId : null,
      hasDiscountId ? normalizedDiscountId : null,
      hasDiscountId ? normalizedDiscountId : null,
      normalizedName,
    ],
  );
  let parsedSettings = {};
  try {
    parsedSettings = rows[0]?.settings_json
      ? JSON.parse(rows[0].settings_json)
      : {};
  } catch {
    parsedSettings = {};
  }
  return {
    billingSettings: {
      taxRate: Math.max(0, Number(parsedSettings?.taxRate ?? 0) || 0),
      serviceCharge: Math.max(
        0,
        Number(parsedSettings?.serviceCharge ?? 0) || 0,
      ),
    },
    receiptSettings: {
      restaurantName:
        String(parsedSettings?.restaurantName || "").trim() || "The Crunch",
      tagline: String(parsedSettings?.tagline || "").trim(),
      email: String(parsedSettings?.email || "").trim(),
      phone: String(parsedSettings?.phone || "").trim(),
      address: String(parsedSettings?.address || "").trim(),
      currency: String(parsedSettings?.currency || "").trim() || "PHP",
      timezone:
        String(parsedSettings?.timezone || "").trim() || "Asia/Manila",
    },
    discount: rows[0]?.discount_name
      ? {
          discountId: Number(rows[0].discount_id),
          discountName: String(rows[0].discount_name),
          discountRate: Math.max(
            0,
            Number(rows[0].discount_percentage || 0) || 0,
          ),
        }
      : { discountId: null, discountName: "", discountRate: 0 },
  };
}

async function requireSalesReportReceiptAccess(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (isSuperuserRole(role)) return next();
  try {
    const [rows] = await db.query(
      `SELECT enabled
       FROM role_permissions
       WHERE role = ? AND permission_key = 'salesReports'
       LIMIT 1`,
      [role],
    );
    if (Number(rows[0]?.enabled) === 1) return next();
    return res.status(403).json({ message: "Sales Report access required" });
  } catch (error) {
    console.error("Receipt permission check failed:", error.message);
    return res.status(500).json({ message: "Unable to verify receipt access" });
  }
}

function calculateBillingTotals(subtotal, settings, discountRate = 0) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  const safeDiscountRate = Math.max(0, Number(discountRate || 0));
  const discountAmount = safeSubtotal * (safeDiscountRate / 100);
  const taxAmount = safeSubtotal * (Number(settings.taxRate || 0) / 100);
  const serviceChargeAmount =
    safeSubtotal * (Number(settings.serviceCharge || 0) / 100);
  const grandTotal =
    safeSubtotal - discountAmount + taxAmount + serviceChargeAmount;
  return {
    subtotal: safeSubtotal,
    discountAmount,
    taxAmount,
    serviceChargeAmount,
    grandTotal,
  };
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

async function verifyPayMongoCheckoutSession(checkoutSessionId, context = {}) {
  const normalizedId = String(checkoutSessionId || "").trim();
  if (!normalizedId) {
    return { paid: false, status: "missing", paymentReference: null };
  }

  if (!isPayMongoEnabled()) {
    return context.claimBypass
      ? claimBypassCheckout(normalizedId, context)
      : verifyBypassCheckout(normalizedId, context);
  }

  if (isBypassCheckoutId(normalizedId)) {
    const error = new Error(
      "Local test payment cannot be used while PayMongo is enabled",
    );
    error.statusCode = 403;
    throw error;
  }

  return verifyBoundPayMongoCheckoutSession(normalizedId, context);
}

// Ensure startedAt column exists once at startup
async function ensureLegacyCashierContext(conn, cashierId) {
  const normalizedCashierId = Number(cashierId);
  if (!Number.isFinite(normalizedCashierId) || normalizedCashierId <= 0) {
    return { cashierId: null, recordedByAdminId: null };
  }

  const [cashierRows] = await conn.query(
    `SELECT
       cashier.Cashier_ID AS cashierId,
       admin.Admin_ID AS recordedByAdminId
     FROM (SELECT ? AS requestedId) requested
     LEFT JOIN Cashier cashier ON cashier.Cashier_ID = requested.requestedId
     LEFT JOIN Admin admin ON admin.Admin_ID = requested.requestedId`,
    [normalizedCashierId],
  );
  if (cashierRows[0]?.cashierId != null) {
    return {
      cashierId: normalizedCashierId,
      recordedByAdminId: cashierRows[0].recordedByAdminId == null
        ? null
        : normalizedCashierId,
    };
  }

  const [userRows] = await conn.query(
    `SELECT id, username
     FROM users
     WHERE id = ?
       AND role IN ('administrator', 'cashier', 'inventory_manager')
     LIMIT 1`,
    [normalizedCashierId],
  );
  if (userRows.length === 0) {
    return { cashierId: null, recordedByAdminId: null };
  }

  await conn.query(
    `INSERT INTO Cashier (Cashier_ID, UserName, Password)
     VALUES (?, ?, ?)`,
    [normalizedCashierId, userRows[0].username || `staff-${normalizedCashierId}`, ""],
  );

  return {
    cashierId: normalizedCashierId,
    recordedByAdminId: cashierRows[0]?.recordedByAdminId == null
      ? null
      : normalizedCashierId,
  };
}

async function ensureLegacyCashierRow(conn, cashierId) {
  const context = await ensureLegacyCashierContext(conn, cashierId);
  return context.cashierId;
}

// ─── ROUTES (specific paths MUST come before /:id wildcards) ──────────────────

// GET /orders — list all orders for dashboard
router.get("/", requireCookViewAccess, async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Total_Amount    AS total,
         o.Status          AS status,
         o.Order_Date      AS date,
         o.Order_Type      AS orderType,
         o.transaction_id  AS transactionId,
         o.order_number    AS orderNumberValue,
         o.business_date   AS businessDate,
         o.payment_reference AS paymentReference,
         o.payment_status  AS paymentStatus,
         o.payment_method  AS paymentMethod,
         o.proof_image_url AS proofImageUrl,
         o.verified_by     AS verifiedBy,
         o.handoverTimestamp AS handoverTimestamp,
         o.riderName       AS riderName,
         p.Payment_Type    AS paymentRecordMethod,
         p.Payment_ID      AS paymentId,
         oi.Product_ID     AS productId,
         oi.Quantity       AS quantity,
         oi.Subtotal       AS subtotal,
         COALESCE(m.Product_Name, pr.name) AS productName,
         COALESCE(m.Price,        pr.price) AS price,
         COALESCE(u.username, c.UserName) AS cashierName
       FROM orders o
       LEFT JOIN order_item oi ON o.Order_ID = oi.Order_ID
       LEFT JOIN Menu      m  ON m.Product_ID  = oi.Product_ID
       LEFT JOIN products  pr ON pr.id          = oi.Product_ID
       LEFT JOIN users     u  ON u.id           = COALESCE(o.Cashier_ID, o.verified_by)
       LEFT JOIN Cashier   c  ON c.Cashier_ID   = COALESCE(o.Cashier_ID, o.verified_by)
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
    res.json(
      orders.map((row) => {
        const { orderNumberValue: _orderNumberValue, ...publicRow } = row;
        return { ...publicRow, ...getPublicOrderIdentifiers(row) };
      }),
    );
  } catch (err) {
    console.error("GET /orders error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /orders/queue — kitchen/order queue view
router.get("/queue", requireCookViewAccess, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.Order_ID   AS id,
         o.Status     AS status,
         o.Order_Type AS orderType,
         o.transaction_id AS transactionId,
         o.order_number AS orderNumberValue,
         o.business_date AS businessDate,
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
        const normalizedOrderType = normalizeOrderType(r.orderType);
        grouped[r.id] = {
          id: String(r.id),
          ...getPublicOrderIdentifiers(r),
          tableNumber: 0,
          status: normalizedOrderType,
          orderType: normalizedOrderType,
          isOnlinePickup:
            Number(r.customerUserId) > 0 &&
            normalizedOrderType === "take-out",
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
router.get("/new-online", requireCookViewAccess, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Status          AS status,
         o.Total_Amount    AS total,
         o.Order_Date      AS createdAt,
         o.Order_Type      AS orderType,
         o.transaction_id  AS transactionId,
         o.order_number    AS orderNumberValue,
         o.business_date   AS businessDate,
         o.payment_status  AS paymentStatus,
         o.payment_method  AS paymentMethod,
         (
           SELECT p.Payment_Status
           FROM payments p
           WHERE p.Order_ID = o.Order_ID
           ORDER BY p.Payment_ID DESC
           LIMIT 1
         ) AS paymentRecordStatus,
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
          ...getPublicOrderIdentifiers(r),
          total: Number(r.total) || 0,
          createdAt: r.createdAt,
          orderType: normalizeOrderType(r.orderType),
          trackingStatus: r.status || "Awaiting Cashier Review",
          paymentStatus: normalizePaymentStatus(
            r.paymentStatus || r.paymentRecordStatus || "Pending"
          ),
          paymentMethod: r.paymentMethod || null,
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
router.get("/ready-pickup", requireCookViewAccess, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.Order_ID        AS id,
         o.Status          AS status,
         o.Total_Amount    AS total,
         o.Order_Date      AS createdAt,
         o.Order_Type      AS orderType,
         o.transaction_id  AS transactionId,
         o.order_number    AS orderNumberValue,
         o.business_date   AS businessDate,
         o.payment_status  AS paymentStatus,
         o.payment_method  AS paymentMethod,
         (
           SELECT p.Payment_Status
           FROM payments p
           WHERE p.Order_ID = o.Order_ID
           ORDER BY p.Payment_ID DESC
           LIMIT 1
         ) AS paymentRecordStatus,
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
          ...getPublicOrderIdentifiers(r),
          total: Number(r.total) || 0,
          createdAt: r.createdAt,
          orderType: normalizeOrderType(r.orderType),
          trackingStatus: r.status || "Ready for Pickup",
          paymentStatus: normalizePaymentStatus(
            r.paymentStatus || r.paymentRecordStatus || "Pending"
          ),
          paymentMethod: r.paymentMethod || null,
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

    res.json(
      Object.values(grouped).filter((order) =>
        isPaidPaymentStatus(order.paymentStatus)
      )
    );
  } catch (err) {
    console.error("GET /orders/ready-pickup error:", err.message);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /orders/delivery-handover — cashier handover list for POS delivery orders
router.get("/delivery-handover", requireCookViewAccess, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         o.Order_ID          AS id,
         o.Status            AS status,
         o.Total_Amount      AS total,
         o.Order_Date        AS createdAt,
         o.Order_Type        AS orderType,
         o.transaction_id    AS transactionId,
         o.order_number      AS orderNumberValue,
         o.business_date     AS businessDate,
         o.payment_status    AS paymentStatus,
         o.payment_method    AS paymentMethod,
         (
           SELECT p.Payment_Status
           FROM payments p
           WHERE p.Order_ID = o.Order_ID
           ORDER BY p.Payment_ID DESC
           LIMIT 1
         ) AS paymentRecordStatus,
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
         AND LOWER(COALESCE(o.Status, '')) IN ('ready', 'ready for pickup')
         AND COALESCE(o.handoverTimestamp, NULL) IS NULL
       ORDER BY o.Order_ID DESC`
    );

    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.id]) {
        grouped[r.id] = {
          id: r.id,
          ...getPublicOrderIdentifiers(r),
          total: Number(r.total) || 0,
          createdAt: r.createdAt,
          orderType: normalizeOrderType(r.orderType),
          trackingStatus: r.status || "Ready",
          paymentStatus: normalizePaymentStatus(
            r.paymentStatus || r.paymentRecordStatus || "Pending",
          ),
          paymentMethod: r.paymentMethod || null,
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
         o.transaction_id AS transactionId,
         o.order_number AS orderNumberValue,
         o.business_date AS businessDate,
         o.payment_reference AS paymentReference,
         o.payment_status AS paymentStatus,
         o.payment_method AS storedPaymentMethod,
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
          ...getPublicOrderIdentifiers(row),
          total: Number(row.total) || 0,
          createdAt: row.createdAt,
          orderType: normalizeOrderType(row.orderType),
          rawStatus: row.status,
          trackingStatus,
          paymentReference: row.paymentReference || null,
          paymentStatus: normalizePaymentStatus(row.paymentStatus || null),
          paymentMethod: row.storedPaymentMethod || row.paymentMethod || "GCash",
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
// GET /orders/shift — today's transactions for the authenticated cashier.
router.get("/shift", requireCookViewAccess, async (req, res) => {
  try {
    const requesterId = Number(req.user?.userId);
    const requesterRole = normalizeRole(req.user?.role);
    if (!Number.isSafeInteger(requesterId) || requesterId <= 0) {
      return res.status(401).json({ message: "Invalid authenticated user" });
    }
    if (requesterRole !== "cashier" && !isSuperuserRole(requesterRole)) {
      return res.status(403).json({ message: "Cashier history access required" });
    }

    const { businessDate } = getBusinessDateParts(new Date());
    const [rows] = await db.query(
      `SELECT
         o.Order_ID AS id,
         COALESCE(snapshot.transaction_id, o.transaction_id) AS transactionId,
         COALESCE(snapshot.order_number, o.order_number) AS orderNumberValue,
         COALESCE(snapshot.total, o.Total_Amount) AS total,
         COALESCE(snapshot.order_date, o.Order_Date) AS createdAt,
         COALESCE(snapshot.order_type, o.Order_Type) AS orderType,
         COALESCE(snapshot.payment_method, o.payment_method, payment.Payment_Type) AS paymentMethod,
         o.Status AS status,
         COALESCE(o.payment_status, payment.Payment_Status) AS paymentStatus,
         refund_request.refund_request_id AS refundRequestId,
         refund_request.status AS refundRequestStatus,
         COALESCE(snapshot_item.receipt_item_id, order_item.Order_Item_ID) AS itemId,
         COALESCE(
           NULLIF(TRIM(snapshot_item.product_name), ''),
           NULLIF(TRIM(menu.Product_Name), ''),
           NULLIF(TRIM(product.name), ''),
           CONCAT('Product #', order_item.Product_ID)
         ) AS productName,
         COALESCE(snapshot_item.quantity, order_item.Quantity) AS quantity,
         CASE
           WHEN snapshot_item.receipt_item_id IS NOT NULL THEN snapshot_item.unit_price
           WHEN order_item.Quantity > 0 THEN order_item.Subtotal / order_item.Quantity
           ELSE NULL
         END AS price,
         COALESCE(snapshot_item.sort_order, order_item.Order_Item_ID, 0) AS itemSort
       FROM orders o
       LEFT JOIN receipt_snapshots snapshot ON snapshot.order_id = o.Order_ID
       LEFT JOIN receipt_snapshot_items snapshot_item
         ON snapshot_item.order_id = snapshot.order_id
       LEFT JOIN order_item
         ON order_item.Order_ID = o.Order_ID
        AND snapshot.order_id IS NULL
       LEFT JOIN Menu menu ON menu.Product_ID = order_item.Product_ID
       LEFT JOIN products product ON product.id = order_item.Product_ID
       LEFT JOIN (
         SELECT p1.Order_ID, p1.Payment_Type, p1.Payment_Status
         FROM payments p1
         INNER JOIN (
           SELECT Order_ID, MAX(Payment_ID) AS maxPaymentId
           FROM payments
           GROUP BY Order_ID
         ) latest ON latest.maxPaymentId = p1.Payment_ID
       ) payment ON payment.Order_ID = o.Order_ID
       LEFT JOIN refund_requests refund_request
         ON refund_request.order_id = o.Order_ID
       WHERE o.Cashier_ID = ?
         AND (
           o.business_date = ?
           OR (
             o.business_date IS NULL
             AND DATE(CONVERT_TZ(o.Order_Date, '+00:00', '+08:00')) = ?
           )
         )
       ORDER BY o.Order_Date DESC, itemSort ASC`,
      [requesterId, businessDate, businessDate],
    );

    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: Number(row.id),
          ...getPublicOrderIdentifiers(row),
          total: Number(row.total) || 0,
          createdAt: row.createdAt,
          orderType: normalizeOrderType(row.orderType),
          paymentMethod: row.paymentMethod || null,
          status: normalizeKitchenStatus(row.status),
          paymentStatus: normalizePaymentStatus(row.paymentStatus),
          refundRequestId: row.refundRequestId == null ? null : Number(row.refundRequestId),
          refundRequestStatus: row.refundRequestStatus || null,
          items: [],
        });
      }

      if (row.itemId != null) {
        grouped.get(row.id).items.push({
          name: row.productName || "Historical product name unavailable",
          quantity: Number(row.quantity) || 0,
          price: Number(row.price) || 0,
        });
      }
    }

    return res.json(Array.from(grouped.values()));
  } catch (error) {
    console.error("GET /orders/shift error:", error.message);
    return res.status(500).json({
      message: "Failed to load cashier history",
      error: error.message,
    });
  }
});

// Load one immutable receipt on demand. `id` remains orders.Order_ID.
router.get(
  "/:id/receipt",
  requireCookViewAccess,
  requireSalesReportReceiptAccess,
  async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: "Invalid order id" });
      }
      const receipt = await loadReceiptDto(db, orderId);
      if (!receipt) return res.status(404).json({ message: "Order not found" });
      return res.json(receipt);
    } catch (error) {
      console.error("GET /orders/:id/receipt error:", error.message);
      return res.status(500).json({
        message: "Failed to load receipt",
        error: error.message,
      });
    }
  },
);

router.post("/payment-proofs", requireCookViewAccess, async (req, res) => {
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
router.get("/payment-proofs/:filename", requireCookViewAccess, async (req, res) => {
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
router.post(
  "/paymongo/checkout",
  requireAuthenticatedUser,
  paymongoRoutes.requireCustomerCheckoutActor,
  paymongoRoutes.createCheckoutHandler,
);

// GET /orders/paymongo/checkout/:checkoutSessionId — verify payment status
router.get(
  "/paymongo/checkout/:checkoutSessionId",
  requireAuthenticatedUser,
  paymongoRoutes.requireCustomerCheckoutActor,
  paymongoRoutes.verifyCheckoutHandler,
);

// POST /orders/discount-authorization — approve one staff discount selection.
router.post(
  "/discount-authorization",
  requireAuthenticatedUser,
  requireCashierOrderActor,
  async (req, res) => {
    try {
      const discountId = Number(req.body?.discount_id ?? req.body?.discountId);
      const authorizationCode =
        req.body?.authorization_code ?? req.body?.authorizationCode;
      const items = normalizeOrderItems(req.body?.items);

      if (!Number.isSafeInteger(discountId) || discountId <= 0) {
        return res.status(400).json({ message: "Invalid discount selection" });
      }

      const [discountRows] = await db.query(
        `SELECT discount_id, name, percentage
           FROM discount_types
          WHERE discount_id = ?
            AND is_active = TRUE
          LIMIT 1`,
        [discountId],
      );
      const discount = discountRows[0];
      if (!discount || Number(discount.percentage) <= 0) {
        return res.status(400).json({
          message: "Selected discount does not require authorization",
        });
      }

      if (!verifyAuthorizationCode(authorizationCode)) {
        return res.status(403).json({ message: "Discount authorization failed" });
      }

      const approvalToken = issueDiscountApproval({
        userId: req.user.userId,
        discountId: discount.discount_id,
        discountRate: discount.percentage,
        items,
      });

      return res.json({
        approvalToken,
        expiresInSeconds: APPROVAL_TTL_SECONDS,
        discount: {
          discount_id: Number(discount.discount_id),
          name: String(discount.name),
          percentage: Number(discount.percentage),
        },
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode);
      const isExpectedError = statusCode >= 400 && statusCode < 600;
      return res.status(isExpectedError ? statusCode : 500).json({
        message: isExpectedError
          ? error.message
          : "Unable to authorize this discount",
      });
    }
  },
);

// POST /orders — place a new authenticated cashier or online customer order.
router.post("/", withOrderRequestTiming, requireAuthenticatedUser, async (req, res) => {
  let conn;
  let txStarted = false;
  let orderCommitted = false;
  let bypassSessionToClaim = null;
  let claimedBypassSessionId = null;
  let claimedDiscountApprovalId = null;
  let payMongoVerification = null;
  let authoritativeItems = [];
  let receiptDto = null;
  let orderOutcome = "failed";
  try {
    const {
      items,
      total,
      customerId,
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
      customerName,
      customer_name,
      customerEmail,
      customer_email,
      customerType,
      customer_type,
      discountName,
      discount_name,
      discountId,
      discount_id,
      discountRate,
      discount_rate,
      discountAuthorization,
      discount_authorization,
      cashTendered,
      cash_tendered,
      tableId,
      table_id,
      tableNumber,
      table_number,
      orderNote,
      order_note,
    } = req.body;

    const actorRole = normalizeRole(req.user?.role);
    const isStaffOrderActor = actorRole === "cashier" || isSuperuserRole(actorRole);
    const isOnlineCustomerActor = actorRole === "customer" || actorRole === "user";
    if (!isStaffOrderActor && !isOnlineCustomerActor) {
      return res.status(403).json({ message: "Order access denied" });
    }

    // Staff identity is always derived from the verified JWT. Body-supplied
    // cashier IDs are intentionally ignored and never persisted.
    const resolvedCashierId = isStaffOrderActor
      ? Number(req.user.userId)
      : null;
    if (
      isStaffOrderActor &&
      (!Number.isSafeInteger(resolvedCashierId) || resolvedCashierId <= 0)
    ) {
      return res.status(401).json({ message: "Invalid authenticated staff user" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }
    const itemNotesByProduct = collectOrderItemNotes(items);
    const validatedItems = normalizeOrderItems(items);

    const finalOrderType = normalizeOrderType(order_type || orderType);
    const normalizedPaymentMethod = normalizePaymentMethod(
      payment_method || paymentMethod || "cash"
    );
    const submittedPaymentReference = String(payment_reference || paymentReference || "").trim() || null;
    const submittedCheckoutSessionId = String(
      checkout_session_id || checkoutSessionId || ""
    ).trim() || null;
    const submittedProofImageUrl =
      String(proof_image_url || proofImageUrl || "").trim() || null;
    const submittedCustomerName =
      String(customer_name || customerName || "").trim() || null;
    const submittedCustomerEmail =
      String(customer_email || customerEmail || "").trim().toLowerCase() || null;
    const submittedCustomerType =
      String(customer_type || customerType || "").trim() || null;
    const submittedTableNumber =
      String(table_number ?? tableNumber ?? table_id ?? tableId ?? "").trim() || null;
    const submittedOrderNote =
      String(order_note || orderNote || "").trim().slice(0, 2000) || null;
    const tenderedCandidate = Number(cash_tendered ?? cashTendered);
    const submittedCashTendered =
      normalizedPaymentMethod === "cash" &&
      Number.isFinite(tenderedCandidate) &&
      tenderedCandidate >= 0
        ? tenderedCandidate
        : null;
    // Online ownership is derived only from the verified JWT. A legacy
    // customerUserId body field is accepted but deliberately ignored.
    const resolvedCustomerUserId = isOnlineCustomerActor
      ? Number(req.user.userId)
      : null;
    if (
      isOnlineCustomerActor &&
      (!Number.isSafeInteger(resolvedCustomerUserId) || resolvedCustomerUserId <= 0)
    ) {
      return res.status(401).json({ message: "Invalid authenticated customer" });
    }
    const isOnlinePickupOrder =
      resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out";
    const storedPaymentMethod = getStoredPaymentMethod(
      normalizedPaymentMethod,
      { isOnlinePickupOrder },
    );
    let effectivePaymentReference = submittedPaymentReference;
    let effectivePaymentStatus = "Pending";
    let verifiedBy = null;
    let verifiedAt = null;
    let initialStatus =
      resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out"
        ? "Awaiting Cashier Review"
        : "Pending";

    if (resolvedCashierId != null) {
      if (normalizedPaymentMethod === "cash") {
        effectivePaymentStatus = "Paid";
      } else if (normalizedPaymentMethod === "gcash_onsite") {
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
    } else if (isOnlinePickupOrder && normalizedPaymentMethod === "gcash") {
      const checkoutToVerify = submittedCheckoutSessionId || submittedPaymentReference;
      if (!checkoutToVerify) {
        return res.status(400).json({ message: "Online pickup orders require a PayMongo checkout session" });
      }
      payMongoVerification = await verifyPayMongoCheckoutSession(checkoutToVerify, {
        customerUserId: resolvedCustomerUserId,
        items: validatedItems,
      });
      if (!payMongoVerification.paid) {
        return res.status(400).json({ message: "Online pickup orders must be paid after backend verification" });
      }
      if (payMongoVerification.bypassed) {
        bypassSessionToClaim = payMongoVerification.checkoutSessionId;
      }
      effectivePaymentStatus = "Paid";
      effectivePaymentReference = payMongoVerification.paymentReference || checkoutToVerify;
    } else if (
      isOnlinePickupOrder &&
      (normalizedPaymentMethod === "cash" || normalizedPaymentMethod === "cash_on_pickup")
    ) {
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

    let onlineCustomerProfile = null;

    if (resolvedCustomerUserId && resolvedCashierId == null && finalOrderType === "take-out") {
      const [customerRows] = await db.query(
        `SELECT role, email_verified, username, email
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [resolvedCustomerUserId],
      );

      if (customerRows.length === 0) {
        return res.status(404).json({ message: "Customer account not found" });
      }

      const customer = customerRows[0];
      onlineCustomerProfile = customer;
      if (
        String(customer.role || "").trim().toLowerCase() === "customer" &&
        Number(customer.email_verified) !== 1
      ) {
        return res.status(403).json({
          message: "Please verify your email before placing an order.",
        });
      }

      if (normalizedPaymentMethod !== "gcash" && normalizedPaymentMethod !== "cash" && normalizedPaymentMethod !== "cash_on_pickup") {
        return res.status(400).json({ message: "Online pickup orders must use GCash or cash payment" });
      }

      if (normalizedPaymentMethod !== "gcash") {
        // Cash on pickup is allowed, but remains blocked from the cook queue until payment is confirmed.
      } else if (!effectivePaymentReference) {
        return res.status(400).json({ message: "Online pickup orders require a verified payment reference" });
      }
    }

    if (bypassSessionToClaim) {
      const claimedBypass = claimBypassCheckout(bypassSessionToClaim, {
        customerUserId: resolvedCustomerUserId,
        items: validatedItems,
      });
      claimedBypassSessionId = claimedBypass.checkoutSessionId;
      effectivePaymentReference = claimedBypass.paymentReference;
    }

    conn = await runOrderStage(req, "acquire connection", () => db.getConnection());
    startOrderTransactionTiming(req);
    await runOrderStage(req, "begin transaction", () => conn.beginTransaction());
    txStarted = true;
    const requestedDiscountName =
      discount_name || discountName || customer_type || customerType || "";
    const requestedDiscountId = Number(discount_id ?? discountId);
    const configuration = await runOrderStage(
      req,
      "load billing and discount configuration",
      () => loadCashierOrderConfiguration(
        conn,
        resolvedCashierId != null && !isOnlinePickupOrder
          ? requestedDiscountName
          : "",
        resolvedCashierId != null && !isOnlinePickupOrder
          ? requestedDiscountId
          : null,
      ),
    );
    const billingSettings = configuration.billingSettings;
    const stockPlan = await runOrderStage(
      req,
      "load items and lock stock",
      () => prepareOrderItemsAndStock(conn, validatedItems),
    );
    authoritativeItems = stockPlan.authoritativeItems.map((item) => ({
      ...item,
      note: itemNotesByProduct.get(item.product_id) || null,
    }));
    const subtotalAmount = authoritativeItems.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );
    const appliedDiscount =
      resolvedCashierId != null && !isOnlinePickupOrder
        ? configuration.discount
        : { discountId: null, discountName: "", discountRate: 0 };
    const billingTotals = calculateBillingTotals(
      subtotalAmount,
      billingSettings,
      appliedDiscount.discountRate,
    );

    if (
      isOnlinePickupOrder &&
      normalizedPaymentMethod === "gcash" &&
      !payMongoVerification?.bypassed
    ) {
      const authoritativeAmountCentavos = Math.round(billingTotals.grandTotal * 100);
      if (
        !Number.isSafeInteger(payMongoVerification?.expectedAmountCentavos) ||
        payMongoVerification.expectedAmountCentavos !== authoritativeAmountCentavos
      ) {
        const amountError = new Error(
          "Paid checkout amount does not match the authoritative order total",
        );
        amountError.statusCode = 409;
        throw amountError;
      }
    }

    let verifiedDiscountApproval = null;
    if (appliedDiscount.discountRate > 0) {
      verifiedDiscountApproval = verifyDiscountApproval({
        token: discount_authorization || discountAuthorization,
        userId: resolvedCashierId,
        discountId: appliedDiscount.discountId,
        discountRate: appliedDiscount.discountRate,
        items: validatedItems,
      });
    }

    let snapshotCashTendered =
      normalizedPaymentMethod === "cash" ? submittedCashTendered : null;
    let snapshotChange = snapshotCashTendered === null
      ? null
      : Math.max(0, snapshotCashTendered - billingTotals.grandTotal);
    if (normalizedPaymentMethod === "cash" && resolvedCashierId != null) {
      const cashSettlement = validateCashTender(
        snapshotCashTendered,
        billingTotals.grandTotal,
      );
      snapshotCashTendered = cashSettlement.cashTendered;
      snapshotChange = cashSettlement.change;
    }
    const cashierContext = await runOrderStage(
      req,
      "resolve cashier",
      () => ensureLegacyCashierContext(conn, resolvedCashierId),
    );
    const persistedCashierId = cashierContext.cashierId;

    if (verifiedDiscountApproval) {
      claimDiscountApproval(verifiedDiscountApproval);
      claimedDiscountApprovalId = verifiedDiscountApproval.approvalId;
    }
    const identifiers = await runOrderStage(
      req,
      "allocate order identifiers",
      () => allocateOrderIdentifiers(conn, finalOrderType),
    );

    // Insert the order header
    const [orderResult] = await runOrderStage(
      req,
      "insert order",
      () => conn.query(
        `INSERT INTO orders
           (Total_Amount, Customer_ID, Cashier_ID, Order_Type, Status, customer_user_id, payment_reference, payment_status, payment_method, proof_image_url, verified_by, verified_at, transaction_id, order_number, business_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billingTotals.grandTotal,
          customerId || null,
          persistedCashierId,
          finalOrderType,
          initialStatus,
          resolvedCustomerUserId,
          effectivePaymentReference,
          effectivePaymentStatus,
          storedPaymentMethod,
          submittedProofImageUrl,
          verifiedBy,
          verifiedAt,
          identifiers.transactionId,
          identifiers.orderNumberValue,
          identifiers.businessDate,
        ],
      ),
    );
    const orderId = orderResult.insertId;

    const itemValuesSql = authoritativeItems
      .map(() => "(?, ?, ?, ?)")
      .join(", ");
    const itemValues = authoritativeItems.flatMap((item) => [
      orderId,
      item.product_id,
      item.qty,
      item.subtotal,
    ]);
    await runOrderStage(req, "insert order items", () => conn.query(
      `INSERT INTO order_item (Order_ID, Product_ID, Quantity, Subtotal)
       VALUES ${itemValuesSql}`,
      itemValues,
    ));

    // Insert payment record
    await runOrderStage(req, "insert payment", () => conn.query(
      `INSERT INTO payments
         (Order_ID, Payment_Type, Payment_Status, ProcessBy)
       VALUES (?, ?, ?, ?)`,
      [
        orderId,
        storedPaymentMethod,
        isPaidPaymentStatus(effectivePaymentStatus) ? "Completed" : "Pending",
        persistedCashierId,
      ],
    ));

    receiptDto = await runOrderStage(
      req,
      "insert receipt snapshot",
      () => createReceiptSnapshot(conn, {
        orderId,
        transactionId: identifiers.transactionId,
        orderNumberValue: identifiers.orderNumberValue,
        orderType: finalOrderType,
        currentStatus: initialStatus,
        currentPaymentStatus: effectivePaymentStatus,
        paymentMethod: storedPaymentMethod,
        subtotal: billingTotals.subtotal,
        discountName: appliedDiscount.discountName || null,
        discountRate: appliedDiscount.discountRate,
        discountAmount: billingTotals.discountAmount,
        taxRate: billingSettings.taxRate,
        taxAmount: billingTotals.taxAmount,
        serviceChargeRate: billingSettings.serviceCharge,
        serviceChargeAmount: billingTotals.serviceChargeAmount,
        total: billingTotals.grandTotal,
        amountPaid: isPaidPaymentStatus(effectivePaymentStatus)
          ? billingTotals.grandTotal
          : 0,
        cashTendered: snapshotCashTendered,
        changeAmount: snapshotChange,
        customerType: submittedCustomerType,
        tableNumber: finalOrderType === "dine-in" ? submittedTableNumber : null,
        orderNote: submittedOrderNote,
        currency: configuration.receiptSettings.currency,
        merchantName: configuration.receiptSettings.restaurantName,
        merchantTagline: configuration.receiptSettings.tagline,
        merchantEmail: configuration.receiptSettings.email,
        merchantPhone: configuration.receiptSettings.phone,
        merchantAddress: configuration.receiptSettings.address,
        timezone: configuration.receiptSettings.timezone,
        items: authoritativeItems,
      }),
    );

    if (isPaidPaymentStatus(effectivePaymentStatus)) {
      await runOrderStage(
        req,
        "deduct stock",
        () => deductPrevalidatedStockForPaidOrder(
          orderId,
          effectivePaymentStatus,
          stockPlan.deductions,
          cashierContext.recordedByAdminId,
          conn,
        ),
      );
    }

    await runOrderStage(req, "commit", () => conn.commit());
    txStarted = false;
    orderCommitted = true;
    finishOrderTransactionTiming(req);
    publishOrderMutation({
      reason: "order.created",
      customerUserId: resolvedCustomerUserId,
      paymentChanged: true,
      inventoryChanged: isPaidPaymentStatus(effectivePaymentStatus),
    });
    if (claimedBypassSessionId) {
      consumeBypassCheckout(claimedBypassSessionId);
      claimedBypassSessionId = null;
    }

    if (isOnlinePickupOrder) {
      const receiptEmail = submittedCustomerEmail || String(onlineCustomerProfile?.email || "").trim().toLowerCase();
      const receiptCustomerName = submittedCustomerName || String(onlineCustomerProfile?.username || "").trim() || "Customer";

      if (receiptEmail) {
        try {
          await sendCustomerOrderReceiptEmail({
            to: receiptEmail,
            customerName: receiptCustomerName,
            order: {
              orderNumber: identifiers.orderNumber,
              transactionId: identifiers.transactionId,
              orderType: finalOrderType,
              paymentMethod: storedPaymentMethod,
              paymentStatus: effectivePaymentStatus,
              subtotal: billingTotals.subtotal,
              taxAmount: billingTotals.taxAmount,
              serviceChargeAmount: billingTotals.serviceChargeAmount,
              total: billingTotals.grandTotal,
              items: authoritativeItems,
              note: buildCustomerReceiptNote(effectivePaymentStatus),
            },
          });
        } catch (emailError) {
          console.error(
            "Customer receipt email failed",
            emailError && emailError.message ? emailError.message : emailError,
          );
        }
      }
    }

    orderOutcome = "success";
    res.json({
      message: "Order placed",
      orderId,
      id: orderId,
      transactionId: identifiers.transactionId,
      orderNumber: identifiers.orderNumber,
      businessDate: identifiers.businessDate,
      trackingStatus: initialStatus,
      receipt: receiptDto,
    });
  } catch (err) {
    if (conn && txStarted) await conn.rollback();
    if (claimedDiscountApprovalId && !orderCommitted) {
      releaseDiscountApproval(claimedDiscountApprovalId);
      claimedDiscountApprovalId = null;
    }
    finishOrderTransactionTiming(req);
    if (claimedBypassSessionId) {
      releaseBypassCheckout(claimedBypassSessionId);
      claimedBypassSessionId = null;
    }
    console.error("POST /orders error:", JSON.stringify({
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
    }, null, 2));
    const duplicateEntry = err?.code === "ER_DUP_ENTRY";
    const duplicatePaymentReference =
      duplicateEntry && /payment_reference/i.test(String(err?.sqlMessage || err?.message || ""));
    const duplicateBusinessIdentifier =
      duplicateEntry && !duplicatePaymentReference;
    const statusCode = duplicateEntry ? 409 : Number(err?.statusCode);
    const isClientError = statusCode >= 400 && statusCode < 500;
    res.status(isClientError ? statusCode : 500).json({
      message: duplicatePaymentReference
        ? "This payment has already been used to place an order"
        : duplicateBusinessIdentifier
          ? "An order identifier allocation conflict occurred; please retry the order"
        : isClientError
          ? err.message
          : "DB error",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
    logOrderTiming(req, orderOutcome);
  }
});

// PATCH /orders/:id — update order status
// ⚠️  Wildcard param routes go LAST so they don't shadow named paths above.
router.patch("/:id", withOrderRequestTiming, requireCookViewAccess, async (req, res) => {
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
      completeFromPreparing,
    } = req.body;
    const requestedStatus =
      status === undefined || status === null || String(status).trim() === ""
        ? null
        : normalizeKitchenStatus(status);
    const isPersistedSettlement =
      requestedStatus === "Cancelled" || requestedStatus === "Refunded";
    if (
      isPersistedSettlement &&
      !canSettlePersistedOrders(req.user?.role)
    ) {
      return res.status(403).json({ message: "Order settlement is not authorized" });
    }

    const authenticatedActorId = Number(req.user?.userId);
    if (
      isPersistedSettlement &&
      (!Number.isSafeInteger(authenticatedActorId) || authenticatedActorId <= 0)
    ) {
      return res.status(401).json({ message: "Invalid authenticated staff user" });
    }

    const resolvedCashierId = isPersistedSettlement
      ? null
      : cashierId ?? cashier_id ?? null;

    conn = await db.getConnection();
    const persistedCashierId = isPersistedSettlement
      ? null
      : await ensureLegacyCashierRow(conn, resolvedCashierId);

    const [existingRows] = await conn.query(
      `SELECT
         Status AS status,
         Order_Type AS orderType,
         customer_user_id AS customerUserId,
         queuedAt AS queuedAt,
         prepStartedAt AS prepStartedAt,
         startedAt AS startedAt,
         readyAt AS readyAt,
         dueAt AS dueAt,
         estimatedPrepMinutes AS estimatedPrepMinutes,
         transaction_id AS transactionId,
         order_number AS orderNumberValue,
         business_date AS businessDate,
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
    const preparationStartedBeforeUpdate =
      Boolean(
        existingRows[0].prepStartedAt ||
        existingRows[0].startedAt ||
        existingRows[0].readyAt,
      ) ||
      ["Preparing", "Ready for Pickup", "Completed"].includes(currentStatus);
    const currentOrderType = normalizeOrderType(existingRows[0].orderType);
    const isOnlinePickupCompletion =
      Number(existingRows[0].customerUserId) > 0 &&
      currentOrderType === "take-out";
    const hasTimerUpdate = estimatedPrepMinutes !== undefined;
    const hasStatusUpdate = status !== undefined && status !== null && String(status).trim() !== "";
    const submittedPaymentStatus = payment_status ?? paymentStatus;
    const hasPaymentStatusUpdate =
      submittedPaymentStatus !== undefined &&
      submittedPaymentStatus !== null &&
      String(submittedPaymentStatus).trim() !== "";
    const persistedOrderPaymentStatus = normalizePaymentStatus(
      existingRows[0].paymentStatus
    );
    const persistedPaymentRecordStatus = normalizePaymentStatus(
      existingRows[0].paymentRecordStatus
    );
    const effectiveCurrentPaymentStatus =
      isPaidPaymentStatus(persistedOrderPaymentStatus) ||
      !isPaidPaymentStatus(persistedPaymentRecordStatus)
        ? persistedOrderPaymentStatus
        : persistedPaymentRecordStatus;
    const nextPaymentStatus = hasPaymentStatusUpdate
      ? normalizePaymentStatus(submittedPaymentStatus)
      : effectiveCurrentPaymentStatus;

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
      const isAtomicDineInCompletion =
        completeFromPreparing === true &&
        currentStatus === "Preparing" &&
        nextStatus === "Completed" &&
        currentOrderType !== "delivery" &&
        !isOnlinePickupCompletion;
      if (
        !isAtomicDineInCompletion &&
        !isStrictKitchenTransitionAllowed(currentStatus, nextStatus)
      ) {
        return res.status(400).json({
          message: `Invalid order status transition: ${currentStatus} -> ${nextStatus}`,
        });
      }
    }

    if (hasStatusUpdate && (nextStatus === "Cancelled" || nextStatus === "Refunded")) {
      if (currentStatus === "Refunded" || currentStatus === "Cancelled") {
        return res.status(400).json({
          message: `${currentStatus} orders cannot be cancelled or refunded again`,
        });
      }

      if (nextStatus === "Cancelled") {
        if (currentStatus === "Completed") {
          console.warn(
            `[orderRoutes] Blocked completed cancellation for order ${id}.`,
          );
          return res.status(400).json({
            message: "Completed orders cannot be cancelled",
          });
        }

        if (isPaidPaymentStatus(effectiveCurrentPaymentStatus)) {
          return res.status(400).json({
            message: "Paid orders must be refunded instead of cancelled",
          });
        }
      }

      if (nextStatus === "Refunded" && !isPaidPaymentStatus(effectiveCurrentPaymentStatus)) {
        return res.status(400).json({
          message: "Only paid orders can be refunded",
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

    if (
      hasStatusUpdate &&
      nextStatus === "Completed" &&
      persistedCashierId == null &&
      isOnlinePickupCompletion
    ) {
      return res.status(400).json({
        message: "Only cashier-confirmed pickup or handover can complete an order",
      });
    }

    const fields = [];
    const values = [];
    let responsePrepStartedAt = existingRows[0].prepStartedAt
      ? new Date(existingRows[0].prepStartedAt)
      : null;
    let responseReadyAt = existingRows[0].readyAt
      ? new Date(existingRows[0].readyAt)
      : null;
    let responseDueAt = existingRows[0].dueAt
      ? new Date(existingRows[0].dueAt)
      : null;
    let inventoryRestored = null;
    let refundRequestResolved = false;

    if (hasStatusUpdate) {
      fields.push("Status = ?");
      values.push(nextStatus);
    }

    if (hasStatusUpdate && nextStatus === "Refunded") {
      fields.push("payment_status = ?");
      values.push("Refunded");
    } else if (hasPaymentStatusUpdate) {
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
        responseDueAt = nextDueAt;
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
      responsePrepStartedAt = prepStartDate;
      responseReadyAt = null;
      responseDueAt = nextDueAt;
      if (estimatedPrepMinutes === undefined) {
        fields.push("estimatedPrepMinutes = ?");
        values.push(prepMinutes);
      }
    }

    if (
      hasStatusUpdate &&
      (
        nextStatus === "Ready for Pickup" ||
        (
          completeFromPreparing === true &&
          currentStatus === "Preparing" &&
          nextStatus === "Completed"
        )
      )
    ) {
      const readyAt = new Date();
      fields.push("readyAt = ?");
      values.push(readyAt);
      responseReadyAt = readyAt;
    }

    if (persistedCashierId != null) {
      fields.push("Cashier_ID = ?");
      values.push(persistedCashierId);
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
      nextStatus !== "Refunded" &&
      !isPaidPaymentStatus(effectiveCurrentPaymentStatus) &&
      isPaidPaymentStatus(nextPaymentStatus) &&
      Number(existingRows[0].stockDeducted) === 0;

    if (shouldDeductStockNow) {
      await deductStockForPaidOrder(id, resolvedCashierId, conn);
    }

    if (hasStatusUpdate && nextStatus === "Cancelled") {
      console.info(
        `[orderRoutes] Recorded unpaid cancellation for order ${id}.`,
      );
    }

    if (hasStatusUpdate && nextStatus === "Refunded") {
      console.info(
        `[orderRoutes] Recorded paid refund for order ${id}.`,
      );
      if (preparationStartedBeforeUpdate) {
        inventoryRestored = false;
        console.info(
          `[orderRoutes] Order ${id} inventory remains deducted because preparation had started.`,
        );
      } else {
        inventoryRestored = await restoreStockForRefundedOrder(
          id,
          authenticatedActorId,
          conn,
        );
      }

      const [resolvedRequest] = await conn.query(
        `UPDATE refund_requests
         SET status = 'Actioned', reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND status = 'Pending'`,
        [authenticatedActorId, id],
      );
      refundRequestResolved = Number(resolvedRequest?.affectedRows || 0) > 0;
    }

    if (
      hasPaymentStatusUpdate ||
      nextStatus === "Completed" ||
      nextStatus === "Refunded"
    ) {
      const paymentRecordStatus =
        nextStatus === "Refunded"
          ? "Refunded"
          : (
              isPaidPaymentStatus(nextPaymentStatus) ||
              nextStatus === "Completed"
            )
            ? "Completed"
            : "Pending";
      await conn.query(
        "UPDATE payments SET Payment_Status = ? WHERE Order_ID = ?",
        [paymentRecordStatus, id]
      );
    }

    await conn.commit();
    txStarted = false;

    publishOrderMutation({
      reason:
        nextStatus === "Refunded"
          ? "order.refunded"
          : nextStatus === "Cancelled"
            ? "order.cancelled"
          : hasStatusUpdate
            ? "order.status_updated"
            : hasPaymentStatusUpdate
              ? "order.payment_updated"
              : "order.updated",
      customerUserId: existingRows[0].customerUserId,
      paymentChanged:
        hasPaymentStatusUpdate ||
        nextStatus === "Completed" ||
        nextStatus === "Refunded",
      inventoryChanged: shouldDeductStockNow || inventoryRestored === true,
    });
    if (refundRequestResolved) {
      publishRefundRequestMutation?.({ reason: "refund_request.actioned" });
    }

    res.json({
      message: "Order updated",
      id,
      ...getPublicOrderIdentifiers({ id, ...existingRows[0] }),
      status: nextStatus,
      paymentStatus: nextStatus === "Refunded" ? "Refunded" : nextPaymentStatus,
      estimatedPrepMinutes:
        hasTimerUpdate
          ? Math.max(Number(estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES, 1)
          : undefined,
      prepStartedAt: responsePrepStartedAt?.getTime(),
      readyAt: responseReadyAt?.getTime(),
      dueAt: responseDueAt?.getTime(),
      preparationStarted: preparationStartedBeforeUpdate || nextStatus === "Preparing",
      inventoryRestored,
    });
  } catch (err) {
    if (conn && txStarted) await conn.rollback();
    console.error("PATCH /orders/:id error:", JSON.stringify({
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
    }, null, 2));
    const errorMessage = String(err?.message || "Unknown error");
    const statusCode = Number(err?.statusCode);
    const hasClientStatus = statusCode >= 400 && statusCode < 500;
    const matchesKnownClientError =
      /cannot move to the cook queue until payment is confirmed as paid/i.test(errorMessage) ||
      /insufficient (daily_withdrawn|inventory stock|stock)/i.test(errorMessage) ||
      /must be stock_item/i.test(errorMessage) ||
      /invalid order status transition/i.test(errorMessage) ||
      /timer can only be updated/i.test(errorMessage);
    res
      .status(hasClientStatus ? statusCode : matchesKnownClientError ? 400 : 500)
      .json({
        message: hasClientStatus || matchesKnownClientError ? errorMessage : "DB error",
        error: errorMessage,
      });
  } finally {
    if (conn) conn.release();
    logOrderTiming(
      req,
      res.statusCode >= 400 ? `status-${res.statusCode}` : "status-success",
    );
  }
});

module.exports = router;
