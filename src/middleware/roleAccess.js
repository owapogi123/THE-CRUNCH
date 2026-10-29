const SUPERUSER_ROLE = "administrator";
const PERSISTED_ORDER_CANCELLATION_ROLES = Object.freeze([
  SUPERUSER_ROLE,
  "inventory_manager",
]);
const PERSISTED_ORDER_REFUND_ROLES = Object.freeze([SUPERUSER_ROLE]);
const PERSISTED_ORDER_SETTLEMENT_ROLES = PERSISTED_ORDER_CANCELLATION_ROLES;
const ORDER_PAYMENT_STATUS_ROLES = Object.freeze([
  SUPERUSER_ROLE,
  "cashier",
]);

function normalizeRole(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (
    normalized === "inventorymanager" ||
    normalized === "inventory manager" ||
    normalized === "stock_manager" ||
    normalized === "stockmanager" ||
    normalized === "stock manager"
  ) {
    return "inventory_manager";
  }
  if (normalized === "user") return "customer";
  return normalized;
}

function isSuperuserRole(value) {
  return normalizeRole(value) === SUPERUSER_ROLE;
}

function canAccessRoles(value, allowedRoles) {
  const role = normalizeRole(value);
  if (isSuperuserRole(role)) return true;

  return allowedRoles.some((allowedRole) => normalizeRole(allowedRole) === role);
}

function canSettlePersistedOrders(value) {
  return canCancelPersistedOrders(value);
}

function canCancelPersistedOrders(value) {
  return canAccessRoles(value, PERSISTED_ORDER_CANCELLATION_ROLES);
}

function canRefundPersistedOrders(value) {
  return canAccessRoles(value, PERSISTED_ORDER_REFUND_ROLES);
}

function canUpdateOrderPaymentStatus(value) {
  return canAccessRoles(value, ORDER_PAYMENT_STATUS_ROLES);
}

module.exports = {
  ORDER_PAYMENT_STATUS_ROLES,
  PERSISTED_ORDER_CANCELLATION_ROLES,
  PERSISTED_ORDER_REFUND_ROLES,
  PERSISTED_ORDER_SETTLEMENT_ROLES,
  SUPERUSER_ROLE,
  canCancelPersistedOrders,
  canRefundPersistedOrders,
  canUpdateOrderPaymentStatus,
  canSettlePersistedOrders,
  normalizeRole,
  isSuperuserRole,
  canAccessRoles,
};
