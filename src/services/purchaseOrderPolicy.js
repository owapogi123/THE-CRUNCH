"use strict";

const PURCHASE_ORDER_STATUSES = Object.freeze([
  "Draft",
  "Ordered",
  "Received",
  "Cancelled",
]);

const GENERIC_TRANSITIONS = Object.freeze({
  Draft: new Set(["Ordered", "Cancelled"]),
  Ordered: new Set(["Cancelled"]),
  Received: new Set(),
  Cancelled: new Set(),
});

function getGenericTransitionError(currentStatus, nextStatus) {
  if (!PURCHASE_ORDER_STATUSES.includes(nextStatus)) {
    return {
      statusCode: 400,
      message: `status must be one of: ${PURCHASE_ORDER_STATUSES.join(", ")}`,
    };
  }
  if (nextStatus === "Received") {
    return {
      statusCode: 409,
      message:
        "Purchase orders can only be marked Received through the receiving workflow",
    };
  }
  if (GENERIC_TRANSITIONS[currentStatus]?.has(nextStatus)) return null;
  return {
    statusCode: 409,
    message: `Cannot change purchase order status from ${currentStatus} to ${nextStatus}`,
  };
}

function getReceiveTransitionError(currentStatus) {
  if (currentStatus === "Ordered") return null;
  if (currentStatus === "Received") {
    return { statusCode: 409, message: "Purchase order has already been received" };
  }
  return {
    statusCode: 409,
    message: `Only an Ordered purchase order can be received; current status is ${currentStatus}`,
  };
}

function normalizeUnit(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getUnitCompatibilityError(poUnit, inventoryUnit, batchUnits = []) {
  const submitted = normalizeUnit(poUnit);
  const inventory = normalizeUnit(inventoryUnit);
  const historical = [...new Set(batchUnits.map(normalizeUnit).filter(Boolean))];
  if (!submitted) return "Purchase order item unit is missing";
  if (inventory && inventory !== submitted) {
    return `Purchase order unit "${poUnit}" does not match inventory unit "${inventoryUnit}"`;
  }
  if (historical.some((unit) => unit !== (inventory || submitted))) {
    return "Existing stock batches contain incompatible units; conversion is ambiguous";
  }
  return null;
}

module.exports = {
  PURCHASE_ORDER_STATUSES,
  getGenericTransitionError,
  getReceiveTransitionError,
  getUnitCompatibilityError,
  normalizeUnit,
};
