"use strict";

const db = require("../config/db");
const {
  canCancelPersistedOrders,
  canUpdateOrderPaymentStatus,
  isSuperuserRole,
  normalizeRole,
} = require("../middleware/roleAccess");
const { getSettlementEligibility } = require("../services/refundEligibility");
const {
  verifyRefundAuthorizationPassword,
} = require("../services/refundAuthorizationService");
const {
  deductRedesignedStockForCompletedPaidOrder,
  refreshRedesignedInventoryAlerts,
} = require("../services/inventoryService");
const {
  publishOrderMutation,
  publishRefundRequestMutation,
} = require("../services/applicationEvents");
const {
  updateStaffNotificationStatus,
} = require("../services/staffNotificationService");
const {
  formatOrderNumber,
  formatTransactionId,
} = require("../services/orderIdentifierService");

const DEFAULT_ESTIMATED_PREP_MINUTES = 10;

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

function isPaid(value) {
  return normalizePaymentStatus(value) === "Paid";
}

function transitionAllowed(current, next) {
  if (current === next) return true;
  if (next === "Cancelled" || next === "Refunded") return true;
  return Boolean({
    "Awaiting Cashier Review": ["Queued", "Cancelled"],
    Queued: ["Preparing"],
    Preparing: ["Ready for Pickup"],
    "Ready for Pickup": ["Completed"],
  }[current]?.includes(next));
}

function responseIdentifiers(order) {
  return {
    transactionId: formatTransactionId(order.transactionId),
    orderNumber: formatOrderNumber(order.orderNumberValue, order.id),
    businessDate: order.businessDate || null,
  };
}

async function updateOrder(req, res) {
  let connection;
  let transactionStarted = false;
  try {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid order id" });
    }
    const body = req.body || {};
    const hasStatus = body.status != null && String(body.status).trim() !== "";
    const requestedStatus = hasStatus ? normalizeStatus(body.status) : null;
    const hasPaymentStatus =
      Object.prototype.hasOwnProperty.call(body, "paymentStatus") ||
      Object.prototype.hasOwnProperty.call(body, "payment_status");
    const submittedPaymentStatus = body.payment_status ?? body.paymentStatus;
    const hasTimer = body.estimatedPrepMinutes !== undefined;
    const hasHandover =
      body.handoverTimestamp !== undefined || body.riderName !== undefined;
    const actorId = Number(req.user?.userId);

    const unsupportedPaymentField = Object.keys(body).find((field) => {
      const normalized = String(field).replace(/[_-]/g, "").toLowerCase();
      return (
        (normalized.startsWith("payment") ||
          normalized.startsWith("proof") ||
          normalized === "verifiedby" ||
          normalized === "verifiedat") &&
        field !== "paymentStatus" &&
        field !== "payment_status"
      );
    });
    if (unsupportedPaymentField) {
      return res.status(400).json({
        message: `${unsupportedPaymentField} cannot be updated through the order status endpoint`,
      });
    }
    if (hasPaymentStatus && !canUpdateOrderPaymentStatus(req.user?.role)) {
      return res.status(403).json({
        message: "Payment status updates require Cashier or Administrator access",
      });
    }
    if (hasPaymentStatus && !String(submittedPaymentStatus || "").trim()) {
      return res.status(400).json({ message: "Payment status is required" });
    }
    if (requestedStatus === "Cancelled" && !canCancelPersistedOrders(req.user?.role)) {
      return res.status(403).json({ message: "Order cancellation is not authorized" });
    }
    if (
      requestedStatus === "Refunded" &&
      normalizeRole(req.user?.role) !== "cashier" &&
      !isSuperuserRole(req.user?.role)
    ) {
      return res.status(403).json({
        message: "Cashier or Administrator access required to refund an order",
      });
    }
    if (
      (requestedStatus === "Cancelled" || requestedStatus === "Refunded" ||
        hasPaymentStatus || hasHandover) &&
      (!Number.isSafeInteger(actorId) || actorId <= 0)
    ) {
      return res.status(401).json({ message: "Invalid authenticated staff user" });
    }
    if (requestedStatus === "Refunded") {
      await verifyRefundAuthorizationPassword(
        body.refundAuthorizationPassword ?? body.refund_authorization_password,
        actorId,
      );
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT
         o.order_id AS id,
         o.status,
         o.order_type AS orderType,
         o.customer_user_id AS customerUserId,
         o.cashier_user_id AS cashierUserId,
         o.queued_at AS queuedAt,
         o.prep_started_at AS prepStartedAt,
         o.ready_at AS readyAt,
         o.due_at AS dueAt,
         o.estimated_prep_minutes AS estimatedPrepMinutes,
         o.transaction_id AS transactionId,
         o.order_number AS orderNumberValue,
         o.business_date AS businessDate,
         o.payment_status AS paymentStatus,
         o.stock_deducted AS stockDeducted,
         (SELECT payment.payment_status
            FROM payments payment
           WHERE payment.order_id = o.order_id
           ORDER BY payment.payment_id DESC
           LIMIT 1) AS paymentRecordStatus,
         EXISTS(
           SELECT 1 FROM refund_requests request
           WHERE request.order_id = o.order_id AND request.status = 'pending'
         ) AS hasPendingRefundRequest
       FROM orders o
       WHERE o.order_id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );
    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Order not found" });
    }
    const order = rows[0];
    const currentStatus = normalizeStatus(order.status);
    const orderType = normalizeOrderType(order.orderType);
    const onlinePickup = Number(order.customerUserId) > 0 && orderType === "take-out";
    const currentPaymentStatus = isPaid(order.paymentStatus)
      ? "Paid"
      : normalizePaymentStatus(order.paymentRecordStatus || order.paymentStatus);
    const nextPaymentStatus = hasPaymentStatus
      ? normalizePaymentStatus(submittedPaymentStatus)
      : currentPaymentStatus;
    const nextStatus = hasStatus ? requestedStatus : currentStatus;
    const onlineAcceptance =
      onlinePickup &&
      currentStatus === "Awaiting Cashier Review" &&
      nextStatus === "Queued" &&
      isPaid(nextPaymentStatus);

    if (!hasStatus && !hasPaymentStatus && !hasTimer && !hasHandover && !body.startedAt) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    if (hasTimer && !["Queued", "Preparing"].includes(currentStatus)) {
      return res.status(400).json({
        message: "Timer can only be updated while the order is queued or preparing",
      });
    }
    if (
      Number(order.hasPendingRefundRequest) === 1 &&
      (hasTimer || (hasStatus && !["Refunded", "Cancelled"].includes(nextStatus)))
    ) {
      return res.status(409).json({
        code: "REFUND_REQUEST_PENDING",
        message: "Kitchen updates are paused while this refund request is pending administrator review",
      });
    }
    const atomicCompletion =
      body.completeFromPreparing === true &&
      currentStatus === "Preparing" &&
      nextStatus === "Completed" &&
      orderType !== "delivery" &&
      !onlinePickup;
    if (hasStatus && !atomicCompletion && !transitionAllowed(currentStatus, nextStatus)) {
      return res.status(400).json({
        message: `Invalid order status transition: ${currentStatus} -> ${nextStatus}`,
      });
    }
    if (
      hasPaymentStatus &&
      !(
        onlinePickup &&
        currentStatus === "Awaiting Cashier Review" &&
        nextStatus === "Queued" &&
        isPaid(nextPaymentStatus)
      )
    ) {
      return res.status(400).json({
        message: "Payment status can only be confirmed as paid during online pickup review",
      });
    }
    if (["Queued", "Preparing", "Completed"].includes(nextStatus) && !isPaid(nextPaymentStatus)) {
      return res.status(400).json({
        message: "Orders cannot advance until payment is confirmed as paid",
      });
    }
    if (
      onlinePickup &&
      nextStatus === "Completed" &&
      normalizeRole(req.user?.role) !== "cashier" &&
      !isSuperuserRole(req.user?.role)
    ) {
      return res.status(403).json({
        message: "Only Cashier or Administrator access can complete an online pickup",
      });
    }
    if (["Cancelled", "Refunded"].includes(nextStatus)) {
      const action = nextStatus === "Cancelled" ? "cancel" : "refund";
      const eligibility = getSettlementEligibility(
        {
          ...order,
          status: currentStatus,
          paymentStatus: currentPaymentStatus,
        },
        action,
      );
      if (!eligibility.eligible) {
        return res.status(409).json({
          code: "SETTLEMENT_INELIGIBLE",
          reason: eligibility.code,
          message: eligibility.message,
        });
      }
      if (nextStatus === "Refunded" && Number(order.stockDeducted) === 1) {
        return res.status(409).json({
          code: "REFUND_INVENTORY_RECONCILIATION_REQUIRED",
          message: "This order already changed inventory and requires manual reconciliation.",
        });
      }
    }

    const deliveryCompletion = orderType === "delivery" && nextStatus === "Completed";
    if (hasHandover && !deliveryCompletion) {
      return res.status(400).json({
        message: "Rider handover details can only be recorded while completing a delivery order",
      });
    }
    if (deliveryCompletion && !String(body.riderName || "").trim()) {
      return res.status(400).json({ message: "Rider name is required for delivery handover" });
    }

    const fields = [];
    const values = [];
    let prepStartedAt = order.prepStartedAt ? new Date(order.prepStartedAt) : null;
    let readyAt = order.readyAt ? new Date(order.readyAt) : null;
    let dueAt = order.dueAt ? new Date(order.dueAt) : null;
    if (hasStatus) {
      fields.push("status = ?");
      values.push(nextStatus);
    }
    if (nextStatus === "Refunded") {
      fields.push("payment_status = 'Refunded'");
    } else if (hasPaymentStatus) {
      fields.push("payment_status = ?");
      values.push(nextPaymentStatus);
    }
    if (!order.queuedAt && ["Queued", "Preparing"].includes(nextStatus)) {
      fields.push("queued_at = ?");
      values.push(new Date());
    }
    if (hasTimer) {
      const minutes = Math.max(Number(body.estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES, 1);
      fields.push("estimated_prep_minutes = ?", "timer_updated_at = ?", "timer_updated_by_user_id = ?");
      values.push(minutes, new Date(), actorId || null);
      if (currentStatus === "Preparing" && prepStartedAt) {
        dueAt = new Date(prepStartedAt.getTime() + minutes * 60000);
        fields.push("due_at = ?");
        values.push(dueAt);
      }
    }
    if (hasStatus && nextStatus === "Preparing") {
      prepStartedAt = body.startedAt ? new Date(body.startedAt) : new Date();
      const minutes = Math.max(Number(body.estimatedPrepMinutes ?? order.estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES, 1);
      dueAt = new Date(prepStartedAt.getTime() + minutes * 60000);
      readyAt = null;
      fields.push("prep_started_at = ?", "ready_at = NULL", "due_at = ?");
      values.push(prepStartedAt, dueAt);
      if (!hasTimer) {
        fields.push("estimated_prep_minutes = ?");
        values.push(minutes);
      }
    }
    if (hasStatus && (nextStatus === "Ready for Pickup" || atomicCompletion)) {
      readyAt = new Date();
      fields.push("ready_at = ?");
      values.push(readyAt);
    }
    if (
      onlineAcceptance ||
      hasPaymentStatus ||
      hasHandover ||
      ["Cancelled", "Refunded"].includes(nextStatus)
    ) {
      fields.push("cashier_user_id = ?");
      values.push(actorId);
    }
    if (deliveryCompletion) {
      fields.push("handover_at = ?", "verified_by_user_id = ?");
      values.push(new Date(), actorId);
    }
    if (body.riderName !== undefined) {
      fields.push("rider_name = ?");
      values.push(String(body.riderName || "").trim() || null);
    }
    if (!fields.length) return res.status(400).json({ message: "No valid fields to update" });

    values.push(orderId);
    await connection.query(
      `UPDATE orders SET ${fields.join(", ")} WHERE order_id = ?`,
      values,
    );

    let inventoryDeducted = false;
    if (hasStatus && nextStatus === "Completed" && Number(order.stockDeducted) === 0) {
      inventoryDeducted = await deductRedesignedStockForCompletedPaidOrder(
        orderId,
        actorId,
        connection,
      );
    }
    if (hasPaymentStatus || nextStatus === "Refunded") {
      await connection.query(
        `UPDATE payments
            SET payment_status = ?,
                processed_by_user_id = ?,
                paid_at = CASE WHEN ? = 'Completed' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
          WHERE order_id = ?`,
        [
          nextStatus === "Refunded" ? "Refunded" : isPaid(nextPaymentStatus) ? "Completed" : "Pending",
          actorId,
          nextStatus === "Refunded" ? "Refunded" : isPaid(nextPaymentStatus) ? "Completed" : "Pending",
          orderId,
        ],
      );
    }
    let refundRequestResolved = false;
    if (nextStatus === "Refunded") {
      const [result] = await connection.query(
        `UPDATE refund_requests
            SET status = 'actioned', reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP
          WHERE order_id = ? AND status = 'pending'`,
        [actorId, orderId],
      );
      refundRequestResolved = Number(result?.affectedRows || 0) > 0;
      if (refundRequestResolved) {
        await updateStaffNotificationStatus(connection, {
          category: "refund_request",
          entityId: orderId,
          status: "Actioned",
          message: "Refund request was actioned through the authorized settlement workflow.",
          resolved: true,
        });
      }
    }

    await connection.commit();
    transactionStarted = false;
    if (inventoryDeducted) {
      await refreshRedesignedInventoryAlerts(db).catch((error) => {
        console.error(
          "Completed-order inventory alert refresh failed:",
          error.message,
        );
      });
    }
    publishOrderMutation({
      reason: nextStatus === "Refunded" ? "order.refunded" : hasStatus ? "order.status_updated" : "order.updated",
      customerUserId: order.customerUserId,
      paymentChanged: hasPaymentStatus || nextStatus === "Refunded",
      inventoryChanged: inventoryDeducted,
    });
    if (refundRequestResolved) {
      publishRefundRequestMutation({ reason: "refund_request.actioned" });
    }
    return res.json({
      message: "Order updated",
      id: String(orderId),
      ...responseIdentifiers(order),
      status: nextStatus,
      paymentStatus: nextStatus === "Refunded" ? "Refunded" : nextPaymentStatus,
      estimatedPrepMinutes: hasTimer
        ? Math.max(Number(body.estimatedPrepMinutes) || DEFAULT_ESTIMATED_PREP_MINUTES, 1)
        : undefined,
      prepStartedAt: prepStartedAt?.getTime(),
      readyAt: readyAt?.getTime(),
      dueAt: dueAt?.getTime(),
      preparationStarted: Boolean(order.prepStartedAt) || nextStatus === "Preparing",
      inventoryRestored: false,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
      transactionStarted = false;
    }
    const statusCode = Number(error?.statusCode);
    const clientError = statusCode >= 400 && statusCode < 500;
    console.error("PATCH /orders/:id redesigned error:", error.message);
    return res.status(clientError ? statusCode : 500).json({
      message: clientError ? error.message : "DB error",
      error: error.message,
      ...(error?.code ? { code: error.code } : {}),
    });
  } finally {
    if (connection && transactionStarted) await connection.rollback();
    if (connection) connection.release();
  }
}

module.exports = { updateOrder };
