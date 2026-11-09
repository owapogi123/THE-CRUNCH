"use strict";

const db = require("../config/db");
const {
  formatOrderNumber,
  formatTransactionId,
  getBusinessDateParts,
} = require("../services/orderIdentifierService");
const { normalizeRole, isSuperuserRole } = require("../middleware/roleAccess");

function normalizeOrderType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "delivery") return "delivery";
  if (normalized === "take-out" || normalized === "takeout") return "take-out";
  return "dine-in";
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "pending" || normalized === "queued") return "Queued";
  if (normalized === "preparing" || normalized === "in progress") return "Preparing";
  if (normalized === "ready" || normalized === "ready for pickup") return "Ready for Pickup";
  if (normalized === "picked up" || normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";
  if (normalized === "refunded") return "Refunded";
  if (normalized === "awaiting cashier review") return "Awaiting Cashier Review";
  return String(value);
}

function normalizePaymentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "completed") return "Paid";
  if (normalized === "pending payment") return "Pending Payment";
  if (normalized === "pending verification") return "Pending Verification";
  return value ? String(value) : "Pending";
}

function publicRequestStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : null;
}

function publicIdentifiers(row) {
  return {
    transactionId: formatTransactionId(row.transactionId),
    orderNumber: formatOrderNumber(row.orderNumberValue, row.id),
    businessDate: row.businessDate || null,
  };
}

const FLAT_ORDER_SELECT = `SELECT
  o.order_id AS id,
  o.total_amount AS total,
  o.status,
  o.created_at AS createdAt,
  o.order_type AS orderType,
  o.transaction_id AS transactionId,
  o.order_number AS orderNumberValue,
  o.business_date AS businessDate,
  o.customer_user_id AS customerUserId,
  o.cashier_user_id AS cashierUserId,
  o.payment_reference AS paymentReference,
  o.payment_status AS paymentStatus,
  o.payment_method AS paymentMethod,
  o.proof_image_url AS proofImageUrl,
  o.prep_started_at AS prepStartedAt,
  o.ready_at AS readyAt,
  o.queued_at AS queuedAt,
  o.due_at AS dueAt,
  o.estimated_prep_minutes AS estimatedPrepMinutes,
  o.timer_updated_by_user_id AS timerUpdatedBy,
  o.timer_updated_at AS timerUpdatedAt,
  o.handover_at AS handoverTimestamp,
  o.rider_name AS riderName,
  o.order_note AS orderNote,
  payment.payment_id AS paymentId,
  payment.payment_method AS paymentRecordMethod,
  payment.payment_status AS paymentRecordStatus,
  payment.paid_at AS paymentDate,
  item.order_item_id AS itemId,
  item.product_id AS productId,
  item.product_name_snapshot AS productName,
  item.unit_price AS price,
  item.quantity,
  item.line_subtotal AS subtotal,
  item.selected_option_product_id AS selectedFlavorProductId,
  item.selected_option_name_snapshot AS selectedFlavorName,
  item.item_note AS itemNote,
  cashier.username AS cashierName,
  handover_user.username AS handoverStaffName,
  refund.refund_request_id AS refundRequestId,
  refund.status AS refundRequestStatus
FROM orders o
LEFT JOIN order_items item ON item.order_id = o.order_id
LEFT JOIN users cashier ON cashier.id = o.cashier_user_id
LEFT JOIN users handover_user ON handover_user.id = o.verified_by_user_id
LEFT JOIN payments payment ON payment.payment_id = (
  SELECT MAX(latest_payment.payment_id)
  FROM payments latest_payment
  WHERE latest_payment.order_id = o.order_id
)
LEFT JOIN refund_requests refund ON refund.order_id = o.order_id`;

async function loadRows(where = "", params = [], orderBy = "o.order_id DESC") {
  const [rows] = await db.query(
    `${FLAT_ORDER_SELECT} ${where ? `WHERE ${where}` : ""} ORDER BY ${orderBy}, item.sort_order, item.order_item_id`,
    params,
  );
  return rows;
}

function groupRows(rows, mapper) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id)) grouped.set(row.id, mapper(row));
    if (row.itemId != null) {
      grouped.get(row.id).items.push({
        name: row.productName || "Historical product name unavailable",
        quantity: Number(row.quantity) || 0,
        price: Number(row.price) || 0,
        note: row.itemNote || null,
        selectedFlavorProductId:
          row.selectedFlavorProductId == null
            ? null
            : Number(row.selectedFlavorProductId),
        selectedFlavorName: row.selectedFlavorName || null,
      });
    }
  }
  return [...grouped.values()];
}

function baseOrder(row) {
  return {
    id: Number(row.id),
    ...publicIdentifiers(row),
    total: Number(row.total) || 0,
    createdAt: row.createdAt,
    orderType: normalizeOrderType(row.orderType),
    trackingStatus: normalizeStatus(row.status),
    paymentStatus: normalizePaymentStatus(
      row.paymentStatus || row.paymentRecordStatus,
    ),
    paymentMethod: row.paymentMethod || row.paymentRecordMethod || null,
    paymentReference: row.paymentReference || null,
    handoverTimestamp: row.handoverTimestamp || null,
    riderName: row.riderName || null,
    items: [],
  };
}

async function listOrders(_req, res) {
  try {
    const rows = await loadRows();
    return res.json(
      rows.map((row) => ({
        id: Number(row.id),
        total: Number(row.total) || 0,
        status: row.status,
        date: row.createdAt,
        orderType: row.orderType,
        ...publicIdentifiers(row),
        paymentReference: row.paymentReference,
        paymentStatus: row.paymentStatus,
        paymentMethod: row.paymentMethod,
        prepStartedAt: row.prepStartedAt,
        startedAt: row.prepStartedAt,
        readyAt: row.readyAt,
        proofImageUrl: row.proofImageUrl,
        handoverTimestamp: row.handoverTimestamp,
        riderName: row.riderName,
        paymentRecordMethod: row.paymentRecordMethod,
        paymentId: row.paymentId,
        paymentDate: row.paymentDate,
        productId: row.productId,
        quantity: row.quantity,
        subtotal: row.subtotal,
        selectedFlavorProductId: row.selectedFlavorProductId,
        selectedFlavorName: row.selectedFlavorName,
        productName: row.productName,
        price: row.price,
        cashierName: row.cashierName,
        handoverStaffName: row.handoverStaffName,
      })),
    );
  } catch (error) {
    console.error("GET /orders redesigned error:", error.message);
    return res.status(500).json({ message: "DB error", error: error.message });
  }
}

async function listQueue(_req, res) {
  try {
    const rows = await loadRows(
      `LOWER(o.status) NOT IN ('completed','cancelled','awaiting cashier review','picked up','refunded')
       AND NOT EXISTS (
         SELECT 1 FROM refund_requests pending_refund
         WHERE pending_refund.order_id = o.order_id
           AND pending_refund.status = 'pending'
       )`,
      [],
      "o.order_id ASC",
    );
    const orders = groupRows(rows, (row) => {
      const status = normalizeStatus(row.status);
      const prepMinutes = Math.max(Number(row.estimatedPrepMinutes) || 10, 1);
      const dueAt = row.dueAt ? new Date(row.dueAt) : null;
      const orderType = normalizeOrderType(row.orderType);
      return {
        id: String(row.id),
        ...publicIdentifiers(row),
        tableNumber: 0,
        status: orderType,
        orderType,
        isOnlinePickup: Number(row.customerUserId) > 0 && orderType === "take-out",
        items: [],
        orderNote: row.orderNote || null,
        currentStatus: status,
        paymentStatus: normalizePaymentStatus(row.paymentStatus || row.paymentRecordStatus),
        isPreparing: status === "Preparing",
        isReady: status === "Ready for Pickup",
        isFinished: ["Completed", "Cancelled", "Refunded"].includes(status),
        createdAt: row.createdAt ? new Date(row.createdAt).getTime() : undefined,
        queuedAt: row.queuedAt ? new Date(row.queuedAt).getTime() : undefined,
        prepStartedAt: row.prepStartedAt ? new Date(row.prepStartedAt).getTime() : undefined,
        readyAt: row.readyAt ? new Date(row.readyAt).getTime() : undefined,
        startedAt: row.prepStartedAt ? new Date(row.prepStartedAt).getTime() : undefined,
        estimatedPrepMinutes: prepMinutes,
        dueAt: dueAt ? dueAt.getTime() : undefined,
        overdue: status === "Preparing" && Boolean(dueAt) && Date.now() > dueAt.getTime(),
        timerUpdatedBy: row.timerUpdatedBy == null ? null : Number(row.timerUpdatedBy),
        timerUpdatedAt: row.timerUpdatedAt ? new Date(row.timerUpdatedAt).getTime() : undefined,
      };
    })
      .filter((order) => order.paymentStatus === "Paid")
      .sort((left, right) => {
        const priority = (order) => {
          if (order.isPreparing && order.overdue) return 0;
          if (order.isPreparing) return 1;
          if (!order.isPreparing && !order.isReady) return 2;
          if (order.isReady) return 3;
          return 4;
        };
        const difference = priority(left) - priority(right);
        if (difference) return difference;
        const leftTime = left.prepStartedAt || left.queuedAt || left.createdAt || 0;
        const rightTime = right.prepStartedAt || right.queuedAt || right.createdAt || 0;
        return leftTime - rightTime || Number(left.id) - Number(right.id);
      });
    return res.json(orders);
  } catch (error) {
    console.error("GET /orders/queue redesigned error:", error.message);
    return res.status(500).json({ message: "DB error", error: error.message });
  }
}

async function listNewOnline(_req, res) {
  try {
    const rows = await loadRows(
      "o.customer_user_id IS NOT NULL AND LOWER(o.status) = 'awaiting cashier review'",
    );
    return res.json(groupRows(rows, baseOrder));
  } catch (error) {
    return res.status(500).json({ message: "DB error", error: error.message });
  }
}

async function listReadyPickup(_req, res) {
  try {
    const rows = await loadRows(
      `o.customer_user_id IS NOT NULL
       AND LOWER(o.order_type) IN ('take-out','takeout')
       AND LOWER(o.status) = 'ready for pickup'`,
    );
    return res.json(
      groupRows(rows, baseOrder).filter((order) => order.paymentStatus === "Paid"),
    );
  } catch (error) {
    return res.status(500).json({ message: "DB error", error: error.message });
  }
}

async function listDeliveryHandover(_req, res) {
  try {
    const rows = await loadRows(
      `o.customer_user_id IS NULL
       AND LOWER(o.order_type) = 'delivery'
       AND LOWER(o.status) IN ('ready','ready for pickup')
       AND o.handover_at IS NULL`,
    );
    return res.json(groupRows(rows, baseOrder));
  } catch (error) {
    return res.status(500).json({ message: "DB error", error: error.message });
  }
}

async function listCustomerOrders(req, res) {
  try {
    const customerUserId = Number(req.params.customerUserId);
    if (!Number.isSafeInteger(customerUserId) || customerUserId <= 0) {
      return res.status(400).json({ message: "Invalid customer user id" });
    }
    const requesterId = Number(req.user?.userId);
    if (requesterId !== customerUserId && !isSuperuserRole(req.user?.role)) {
      return res.status(403).json({ message: "You can only access your own order history" });
    }
    const rows = await loadRows("o.customer_user_id = ?", [customerUserId]);
    const orders = groupRows(rows, (row) => {
      const order = baseOrder(row);
      return {
        ...order,
        trackingStatus:
          order.trackingStatus === "Awaiting Cashier Review" &&
          order.paymentStatus === "Pending Payment"
            ? "Pending Payment"
            : order.trackingStatus,
        rawStatus: row.status,
      };
    });
    return res.json({
      activeOrders: orders.filter((order) => !["Completed", "Cancelled", "Refunded"].includes(normalizeStatus(order.rawStatus))),
      historyOrders: orders.filter((order) => ["Completed", "Cancelled", "Refunded"].includes(normalizeStatus(order.rawStatus))),
    });
  } catch (error) {
    return res.status(500).json({ message: "DB error", error: error.message });
  }
}

async function listShift(req, res) {
  try {
    const requesterId = Number(req.user?.userId);
    const role = normalizeRole(req.user?.role);
    if (!Number.isSafeInteger(requesterId) || requesterId <= 0) {
      return res.status(401).json({ message: "Invalid authenticated user" });
    }
    if (role !== "cashier" && !isSuperuserRole(role)) {
      return res.status(403).json({ message: "Cashier history access required" });
    }
    const { businessDate } = getBusinessDateParts(new Date());
    const rows = await loadRows(
      "o.cashier_user_id = ? AND o.business_date = ?",
      [requesterId, businessDate],
    );
    return res.json(groupRows(rows, (row) => ({
      id: Number(row.id),
      ...publicIdentifiers(row),
      total: Number(row.total) || 0,
      createdAt: row.createdAt,
      orderType: normalizeOrderType(row.orderType),
      paymentMethod: row.paymentMethod || row.paymentRecordMethod || null,
      status: normalizeStatus(row.status),
      paymentStatus: normalizePaymentStatus(row.paymentStatus || row.paymentRecordStatus),
      prepStartedAt: row.prepStartedAt || null,
      startedAt: row.prepStartedAt || null,
      readyAt: row.readyAt || null,
      refundRequestId: row.refundRequestId == null ? null : Number(row.refundRequestId),
      refundRequestStatus: publicRequestStatus(row.refundRequestStatus),
      items: [],
    })));
  } catch (error) {
    console.error("GET /orders/shift redesigned error:", error.message);
    return res.status(500).json({ message: "Failed to load cashier history", error: error.message });
  }
}

module.exports = {
  listCustomerOrders,
  listDeliveryHandover,
  listNewOnline,
  listOrders,
  listQueue,
  listReadyPickup,
  listShift,
};
