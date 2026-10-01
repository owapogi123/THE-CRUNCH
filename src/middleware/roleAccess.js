const SUPERUSER_ROLE = "administrator";
const PERSISTED_ORDER_SETTLEMENT_ROLES = Object.freeze([
  SUPERUSER_ROLE,
  "inventory_manager",
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
  return canAccessRoles(value, PERSISTED_ORDER_SETTLEMENT_ROLES);
}

module.exports = {
  PERSISTED_ORDER_SETTLEMENT_ROLES,
  SUPERUSER_ROLE,
  canSettlePersistedOrders,
  normalizeRole,
  isSuperuserRole,
  canAccessRoles,
};
