const jwt = require("jsonwebtoken");
const { canAccessRoles } = require("./roleAccess");
const { getJwtSecret } = require("../services/jwtConfig");

// `cook` is retained only so existing accounts continue to work during the
// transition away from a dedicated cook role.
const COOK_VIEW_ROLES = Object.freeze([
  "administrator",
  "cashier",
  "inventory_manager",
  "cook",
]);

function requireAuthenticatedUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const token = authHeader.slice("Bearer ".length).trim();
    req.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRoleAccess(allowedRoles, denialMessage = "Staff access required") {
  return function roleAccessMiddleware(req, res, next) {
    return requireAuthenticatedUser(req, res, () => {
      const decoded = req.user;
      const role = String(decoded?.role || "").trim().toLowerCase();
      if (!canAccessRoles(role, allowedRoles)) {
        return res.status(403).json({
          message: denialMessage,
        });
      }

      return next();
    });
  };
}

const requireCookViewAccess = requireRoleAccess(
  COOK_VIEW_ROLES,
  "Cook View employee access required",
);

module.exports = {
  COOK_VIEW_ROLES,
  requireAuthenticatedUser,
  requireCookViewAccess,
  requireRoleAccess,
};
