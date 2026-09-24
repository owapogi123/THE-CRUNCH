const SUPERUSER_ROLE = "administrator";

function normalizeRole(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isSuperuserRole(value) {
  return normalizeRole(value) === SUPERUSER_ROLE;
}

function canAccessRoles(value, allowedRoles) {
  const role = normalizeRole(value);
  if (isSuperuserRole(role)) return true;

  return allowedRoles.some((allowedRole) => normalizeRole(allowedRole) === role);
}

module.exports = {
  SUPERUSER_ROLE,
  normalizeRole,
  isSuperuserRole,
  canAccessRoles,
};
