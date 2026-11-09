const router = require("express").Router();
const db = require("../config/db");
const {
  requireAuthenticatedUser,
} = require("../middleware/cookViewAccess");
const {
  isSuperuserRole,
  normalizeRole,
} = require("../middleware/roleAccess");
const {
  formatOrderNumber,
} = require("../services/orderIdentifierService");
const {
  publishOrderMutation,
  publishRefundRequestMutation,
} = require("../services/applicationEvents");
const {
  getRefundEligibility,
  isRefundEligible,
} = require("../services/refundEligibility");
const {
  STAFF_NOTIFICATION_AUDIENCES,
  createStaffNotification,
  updateStaffNotificationStatus,
} = require("../services/staffNotificationService");
const {
  getSchemaProfile,
  REDESIGNED_SCHEMA_PROFILE,
} = require("../db/schemaProfile");

const REQUEST_STATUSES = new Set(["Pending", "Ignored", "Actioned"]);

function isRedesignedProfile() {
  return getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
}

function publicRequestStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Pending";
}

function requireCashier(req, res, next) {
  return requireAuthenticatedUser(req, res, () => {
    if (normalizeRole(req.user?.role) !== "cashier") {
      return res.status(403).json({ message: "Cashier access required" });
    }
    return next();
  });
}

function requireAdministrator(req, res, next) {
  return requireAuthenticatedUser(req, res, () => {
    if (!isSuperuserRole(req.user?.role)) {
      return res.status(403).json({ message: "Administrator access required" });
    }
    return next();
  });
}

function normalizePaymentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "paid" || normalized === "completed" ? "Paid" : String(value || "Pending");
}

function normalizeOrderStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "refunded") return "Refunded";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  if (normalized === "completed" || normalized === "picked up") return "Completed";
  if (normalized === "ready") return "Ready";
  if (normalized === "ready for pickup") return "Ready for Pickup";
  if (normalized === "preparing") return "Preparing";
  if (normalized === "queued" || normalized === "pending") return "Queued";
  return value ? String(value) : "Unknown";
}

function isRequestEligible(order) {
  return isRefundEligible(order);
}

function parsePositiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error(`Invalid ${label}`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function mapRequestRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.requestId)) {
      grouped.set(row.requestId, {
        id: Number(row.requestId),
        type: "refund_request",
        orderId: Number(row.orderId),
        orderNumber: row.orderNumberSnapshot || formatOrderNumber(row.orderNumberValue, row.orderId),
        requester: {
          id: Number(row.requesterUserId),
          name: row.requesterName || "Cashier",
          role: row.requesterRole || "cashier",
        },
        requestedAt: row.requestedAt,
        reason: row.reasonSnapshot || "Cashier requested a refund review.",
        status: publicRequestStatus(row.requestStatus),
        reviewedAt: row.reviewedAt || null,
        order: {
          orderType: row.orderType || null,
          paymentMethod: row.paymentMethod || null,
          total: Number(row.total) || 0,
          status: normalizeOrderStatus(row.orderStatus),
          paymentStatus: normalizePaymentStatus(row.paymentStatus),
          prepStartedAt: row.prepStartedAt || null,
          startedAt: row.startedAt || null,
          readyAt: row.readyAt || null,
          items: [],
        },
      });
    }

    if (row.itemId != null) {
      grouped.get(row.requestId).order.items.push({
        name: row.productName || "Historical product name unavailable",
        quantity: Number(row.quantity) || 0,
        price: Number(row.price) || 0,
      });
    }
  }
  return [...grouped.values()];
}

async function loadRequests({ status = null, requestId = null } = {}) {
  const redesigned = isRedesignedProfile();
  const conditions = [];
  const values = [];
  if (status) {
    conditions.push("rr.status = ?");
    values.push(redesigned ? status.toLowerCase() : status);
  }
  if (requestId) {
    conditions.push("rr.refund_request_id = ?");
    values.push(requestId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await db.query(
    redesigned
      ? `SELECT
       rr.refund_request_id AS requestId,
       rr.order_id AS orderId,
       rr.order_number_snapshot AS orderNumberSnapshot,
       rr.requester_user_id AS requesterUserId,
       rr.reason_snapshot AS reasonSnapshot,
       rr.status AS requestStatus,
       rr.requested_at AS requestedAt,
       rr.reviewed_at AS reviewedAt,
       COALESCE(requester.username, rr.requester_name_snapshot) AS requesterName,
       COALESCE(requester.role, rr.requester_role_snapshot) AS requesterRole,
       o.order_number AS orderNumberValue,
       o.order_type AS orderType,
       o.total_amount AS total,
       o.status AS orderStatus,
       o.prep_started_at AS prepStartedAt,
       o.prep_started_at AS startedAt,
       o.ready_at AS readyAt,
       COALESCE(o.payment_status, payment.payment_status) AS paymentStatus,
       COALESCE(snapshot.payment_method, o.payment_method, payment.payment_method) AS paymentMethod,
       COALESCE(snapshot_item.receipt_item_id, order_item.order_item_id) AS itemId,
       COALESCE(snapshot_item.product_name, order_item.product_name_snapshot) AS productName,
       COALESCE(snapshot_item.quantity, order_item.quantity) AS quantity,
       COALESCE(snapshot_item.unit_price, order_item.unit_price, 0) AS price
     FROM refund_requests rr
     INNER JOIN orders o ON o.order_id = rr.order_id
     LEFT JOIN users requester ON requester.id = rr.requester_user_id
     LEFT JOIN receipt_snapshots snapshot ON snapshot.order_id = o.order_id
     LEFT JOIN receipt_snapshot_items snapshot_item ON snapshot_item.order_id = snapshot.order_id
     LEFT JOIN order_items order_item
       ON order_item.order_id = o.order_id
      AND snapshot.order_id IS NULL
     LEFT JOIN payments payment ON payment.payment_id = (
       SELECT MAX(latest.payment_id) FROM payments latest WHERE latest.order_id = o.order_id
     )
     ${where}
     ORDER BY rr.requested_at DESC, itemId ASC`
      : `SELECT
       rr.refund_request_id AS requestId,
       rr.order_id AS orderId,
       rr.order_number_snapshot AS orderNumberSnapshot,
       rr.requester_user_id AS requesterUserId,
       rr.reason_snapshot AS reasonSnapshot,
       rr.status AS requestStatus,
       rr.requested_at AS requestedAt,
       rr.reviewed_at AS reviewedAt,
       COALESCE(requester.username, rr.requester_name_snapshot) AS requesterName,
       COALESCE(requester.role, rr.requester_role_snapshot) AS requesterRole,
       o.order_number AS orderNumberValue,
       o.Order_Type AS orderType,
       o.Total_Amount AS total,
       o.Status AS orderStatus,
       o.prepStartedAt AS prepStartedAt,
       o.startedAt AS startedAt,
       o.readyAt AS readyAt,
       COALESCE(o.payment_status, payment.Payment_Status) AS paymentStatus,
       COALESCE(snapshot.payment_method, o.payment_method, payment.Payment_Type) AS paymentMethod,
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
         ELSE 0
       END AS price
     FROM refund_requests rr
     INNER JOIN orders o ON o.Order_ID = rr.order_id
     LEFT JOIN users requester ON requester.id = rr.requester_user_id
     LEFT JOIN receipt_snapshots snapshot ON snapshot.order_id = o.Order_ID
     LEFT JOIN receipt_snapshot_items snapshot_item ON snapshot_item.order_id = snapshot.order_id
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
     ${where}
     ORDER BY rr.requested_at DESC, itemId ASC`,
    values,
  );
  return mapRequestRows(rows);
}

// A request is an escalation only. It never changes the order or payment.
router.post("/", requireCashier, async (req, res) => {
  let connection;
  let transactionStarted = false;
  try {
    const orderId = parsePositiveId(req.body?.orderId, "order id");
    const requesterUserId = parsePositiveId(req.user?.userId, "authenticated user");
    const reason = String(req.body?.reason || "Cashier requested a refund review.").trim();
    if (!reason) return res.status(400).json({ message: "Refund request reason is required" });
    if (reason.length > 500) {
      return res.status(400).json({ message: "Refund request reason must not exceed 500 characters" });
    }
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [orders] = await connection.query(
      isRedesignedProfile()
        ? `SELECT
         o.order_id AS id,
         o.cashier_user_id AS cashierId,
         o.status,
         o.prep_started_at AS prepStartedAt,
         o.prep_started_at AS startedAt,
         o.ready_at AS readyAt,
         o.order_number AS orderNumberValue,
         requester.username AS requesterName,
         requester.role AS requesterRole,
         COALESCE(o.payment_status, (
           SELECT payment.payment_status
           FROM payments payment
           WHERE payment.order_id = o.order_id
           ORDER BY payment.payment_id DESC
           LIMIT 1
         )) AS paymentStatus
       FROM orders o
       INNER JOIN users requester ON requester.id = ?
       WHERE o.order_id = ?
       LIMIT 1
       FOR UPDATE`
        : `SELECT
         o.Order_ID AS id,
         o.Cashier_ID AS cashierId,
         o.Status AS status,
         o.prepStartedAt AS prepStartedAt,
         o.startedAt AS startedAt,
         o.readyAt AS readyAt,
         o.order_number AS orderNumberValue,
         requester.username AS requesterName,
         requester.role AS requesterRole,
         COALESCE(o.payment_status, (
           SELECT p.Payment_Status
           FROM payments p
           WHERE p.Order_ID = o.Order_ID
           ORDER BY p.Payment_ID DESC
           LIMIT 1
         )) AS paymentStatus
       FROM orders o
       INNER JOIN users requester ON requester.id = ?
       WHERE o.Order_ID = ?
       LIMIT 1
       FOR UPDATE`,
      [requesterUserId, orderId],
    );
    if (!orders.length) {
      return res.status(404).json({ message: "Order not found" });
    }
    const order = orders[0];
    if (Number(order.cashierId) !== requesterUserId) {
      return res.status(403).json({ message: "You can only request refunds for your own orders" });
    }
    const eligibility = getRefundEligibility(order);
    if (!eligibility.eligible) {
      return res.status(409).json({
        code: "REFUND_INELIGIBLE",
        reason: eligibility.code,
        message: eligibility.message,
      });
    }

    const [existing] = await connection.query(
      `SELECT refund_request_id AS id, status
       FROM refund_requests
       WHERE order_id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );
    if (existing.length) {
      const message = String(existing[0].status).toLowerCase() === "pending"
        ? "A refund request for this order is already pending."
        : "The refund request for this order has already been reviewed.";
      return res.status(409).json({ message, requestId: Number(existing[0].id), status: existing[0].status });
    }

    const orderNumber = formatOrderNumber(order.orderNumberValue, order.id);
    const [created] = await connection.query(
      `INSERT INTO refund_requests
         (order_id, order_number_snapshot, requester_user_id,
          requester_name_snapshot, requester_role_snapshot, reason_snapshot, status)
       VALUES (?, ?, ?, ?, ?, ?, '${isRedesignedProfile() ? "pending" : "Pending"}')`,
      [
        orderId,
        orderNumber,
        requesterUserId,
        order.requesterName || `Cashier ${requesterUserId}`,
        normalizeRole(order.requesterRole) || "cashier",
        reason,
      ],
    );
    await createStaffNotification(connection, {
      dedupeKey: `refund_request:order:${orderId}`,
      category: "refund_request",
      eventType: "refund_request.created",
      entityId: orderId,
      audience: STAFF_NOTIFICATION_AUDIENCES.ADMINISTRATOR,
      actorUserId: requesterUserId,
      title: `Refund request · ${orderNumber}`,
      message: reason,
      status: "Pending",
      metadata: {
        requestId: Number(created.insertId),
        orderId,
        orderNumber,
        reason,
        requestedBy: order.requesterName || `Cashier ${requesterUserId}`,
      },
    });
    await connection.commit();
    transactionStarted = false;
    publishRefundRequestMutation({ reason: "refund_request.created" });
    publishOrderMutation({ reason: "refund_request.pending" });
    return res.status(201).json({
      message: "Refund request sent to Administrator.",
      request: {
        id: Number(created.insertId),
        type: "refund_request",
        orderId,
        orderNumber,
        reason,
        status: "Pending",
      },
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A refund request for this order is already pending." });
    }
    const statusCode = Number(error?.statusCode);
    console.error("POST /refund-requests error:", error.message);
    return res.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).json({
      message: statusCode ? error.message : "Failed to create refund request",
    });
  } finally {
    if (connection && transactionStarted) await connection.rollback();
    if (connection) connection.release();
  }
});

router.get("/", requireAdministrator, async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || "Pending").trim();
    const status = requestedStatus.toLowerCase() === "all"
      ? null
      : [...REQUEST_STATUSES].find((entry) => entry.toLowerCase() === requestedStatus.toLowerCase());
    if (requestedStatus.toLowerCase() !== "all" && !status) {
      return res.status(400).json({ message: "Invalid refund request status" });
    }
    return res.json(await loadRequests({ status }));
  } catch (error) {
    console.error("GET /refund-requests error:", error.message);
    return res.status(500).json({ message: "Failed to load refund requests" });
  }
});

router.get("/:id", requireAdministrator, async (req, res) => {
  try {
    const requestId = parsePositiveId(req.params.id, "refund request id");
    const requests = await loadRequests({ requestId });
    if (!requests.length) return res.status(404).json({ message: "Refund request not found" });
    return res.json(requests[0]);
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    return res.status(statusCode || 500).json({ message: statusCode ? error.message : "Failed to load refund request" });
  }
});

router.patch("/:id/ignore", requireAdministrator, async (req, res) => {
  let connection;
  let transactionStarted = false;
  try {
    const requestId = parsePositiveId(req.params.id, "refund request id");
    const reviewerUserId = parsePositiveId(req.user?.userId, "authenticated user");
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT refund_request_id AS id, order_id AS orderId, status
       FROM refund_requests
       WHERE refund_request_id = ?
       LIMIT 1
       FOR UPDATE`,
      [requestId],
    );
    if (!rows.length) return res.status(404).json({ message: "Refund request not found" });
    if (String(rows[0].status).toLowerCase() !== "pending") {
      return res.status(409).json({ message: `Refund request is already ${rows[0].status.toLowerCase()}` });
    }
    await connection.query(
      `UPDATE refund_requests
       SET status = '${isRedesignedProfile() ? "ignored" : "Ignored"}', reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE refund_request_id = ?`,
      [reviewerUserId, requestId],
    );
    await updateStaffNotificationStatus(connection, {
      category: "refund_request",
      entityId: rows[0].orderId,
      status: "Ignored",
      message: "Refund request was reviewed and ignored.",
      resolved: true,
    });
    await connection.commit();
    transactionStarted = false;
    publishRefundRequestMutation({ reason: "refund_request.ignored" });
    publishOrderMutation({ reason: "refund_request.ignored" });
    return res.json({ message: "Refund request ignored.", id: requestId, status: "Ignored" });
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    console.error("PATCH /refund-requests/:id/ignore error:", error.message);
    return res.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).json({
      message: statusCode ? error.message : "Failed to ignore refund request",
    });
  } finally {
    if (connection && transactionStarted) await connection.rollback();
    if (connection) connection.release();
  }
});

module.exports = router;
module.exports.isRequestEligible = isRequestEligible;
