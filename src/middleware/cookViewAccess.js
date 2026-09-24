const jwt = require("jsonwebtoken");
const { canAccessRoles } = require("./roleAccess");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

// `cook` is retained only so existing accounts continue to work during the
// transition away from a dedicated cook role.
const COOK_VIEW_ROLES = Object.freeze([
  "administrator",
  "cashier",
  "inventory_manager",
  "cook",
]);

function requireCookViewAccess(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  let decoded;
  try {
    const token = authHeader.slice("Bearer ".length).trim();
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const role = String(decoded?.role || "").trim().toLowerCase();
  if (!canAccessRoles(role, COOK_VIEW_ROLES)) {
    return res.status(403).json({
      message: "Cook View employee access required",
    });
  }

  req.user = decoded;
  return next();
}

module.exports = {
  COOK_VIEW_ROLES,
  requireCookViewAccess,
};
