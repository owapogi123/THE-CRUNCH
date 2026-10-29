const REFUNDABLE_ORDER_STATUSES = new Set([
  "queued",
  "pending",
  "awaiting cashier review",
]);
const CANCELLABLE_ORDER_STATUSES = new Set([
  "pending payment",
  "queued",
  "pending",
  "awaiting cashier review",
]);
const PREPARATION_STATUSES = new Set([
  "preparing",
  "ready",
  "ready for pickup",
  "completed",
  "picked up",
]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isPaid(value) {
  const paymentStatus = normalize(value);
  return paymentStatus === "paid" || paymentStatus === "completed";
}

function hasPreparationStarted(order) {
  return (
    Boolean(
      order?.preparationStarted ||
        order?.prepStartedAt ||
        order?.startedAt ||
        order?.readyAt,
    ) || PREPARATION_STATUSES.has(normalize(order?.status))
  );
}

function getRefundEligibility(order) {
  const status = normalize(order?.status);

  if (status === "refunded") {
    return { eligible: false, code: "already_refunded", message: "This order has already been refunded." };
  }
  if (status === "cancelled" || status === "canceled") {
    return { eligible: false, code: "cancelled", message: "Cancelled orders cannot be refunded." };
  }
  if (hasPreparationStarted(order)) {
    return {
      eligible: false,
      code: "preparation_started",
      message: "This order cannot be refunded because food preparation has already started.",
    };
  }
  if (!isPaid(order?.paymentStatus)) {
    return {
      eligible: false,
      code: "not_paid",
      message: "Only paid orders can be refunded. Pending-payment orders may only be cancelled.",
    };
  }
  if (!REFUNDABLE_ORDER_STATUSES.has(status)) {
    return {
      eligible: false,
      code: "invalid_status",
      message: "This order is no longer eligible for a refund.",
    };
  }

  return { eligible: true, code: "eligible", message: "Refund permitted." };
}

function getCancellationEligibility(order) {
  const status = normalize(order?.status);

  if (status === "cancelled" || status === "canceled") {
    return { eligible: false, code: "already_cancelled", message: "This order has already been cancelled." };
  }
  if (status === "refunded") {
    return { eligible: false, code: "refunded", message: "Refunded orders cannot be cancelled." };
  }
  if (hasPreparationStarted(order)) {
    return {
      eligible: false,
      code: "preparation_started",
      message: "This order cannot be cancelled because food preparation has already started.",
    };
  }
  if (isPaid(order?.paymentStatus)) {
    return {
      eligible: false,
      code: "paid",
      message: "Paid orders must use the authorized refund workflow instead of cancellation.",
    };
  }
  if (!CANCELLABLE_ORDER_STATUSES.has(status)) {
    return {
      eligible: false,
      code: "invalid_status",
      message: "This order is no longer eligible for cancellation.",
    };
  }

  return { eligible: true, code: "eligible", message: "Cancellation permitted." };
}

function getSettlementEligibility(order, action) {
  if (action === "cancel") return getCancellationEligibility(order);
  if (action === "refund") return getRefundEligibility(order);
  return {
    eligible: false,
    code: "invalid_action",
    message: "Unsupported settlement action.",
  };
}

function isRefundEligible(order) {
  return getRefundEligibility(order).eligible;
}

module.exports = {
  getCancellationEligibility,
  getRefundEligibility,
  getSettlementEligibility,
  hasPreparationStarted,
  isRefundEligible,
};
