const router = require("express").Router();
const bcrypt = require("bcryptjs");
const db = require("../config/db");
const { SUPERUSER_ROLE, normalizeRole } = require("../middleware/roleAccess");
const { requireCookViewAccess } = require("../middleware/cookViewAccess");
const { requireAdministratorAccess } = require("../middleware/staffAccess");
const { invalidateProductCache } = require("../services/cacheService");
const {
  isProtectedMenuCategorySystemKey,
} = require("../services/systemMenuCategoryService");
const {
  DEFAULT_PERMISSION_ROLE_LOCKS,
  DEFAULT_RESTAURANT_SETTINGS,
  DEFAULT_ROLE_PERMISSIONS,
} = require("../services/settingsDefaults");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("../db/schemaProfile");

const VALID_PERMISSION_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS);
const VALID_PERMISSION_KEYS = Object.keys(
  DEFAULT_ROLE_PERMISSIONS.administrator,
);
const COOK_VIEW_PERMISSION_ROLES = [
  "administrator",
  "cashier",
  "inventory_manager",
];
const DELIVERY_PLATFORM_LINKS_KEY = "delivery_platform_links";
const DELIVERY_PLATFORM_HOSTS = Object.freeze({
  grabfood: new Set(["r.grab.com", "food.grab.com", "app.grab.com"]),
  foodpanda: new Set(["foodpanda.go.link", "foodpanda.ph", "www.foodpanda.ph"]),
});
const EMPTY_DELIVERY_PLATFORM_LINKS = Object.freeze({
  grabfoodUrl: null,
  foodpandaUrl: null,
});
const DISCOUNT_AUTHORIZATION_KEY = "discount_authorization";
const REFUND_AUTHORIZATION_KEY = "refund_authorization";
const discountPasswordAttempts = new Map();
const refundPasswordUpdateAttempts = new Map();

function isRedesignedProfile() {
  return getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
}

function checkDiscountPasswordRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const current = discountPasswordAttempts.get(key) || {
    count: 0,
    resetAt: now + 15 * 60 * 1000,
  };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + 15 * 60 * 1000;
  }
  current.count += 1;
  discountPasswordAttempts.set(key, current);
  return current.count <= 5;
}

function checkRefundPasswordUpdateRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const current = refundPasswordUpdateAttempts.get(key) || {
    count: 0,
    resetAt: now + 15 * 60 * 1000,
  };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + 15 * 60 * 1000;
  }
  current.count += 1;
  refundPasswordUpdateAttempts.set(key, current);
  return current.count <= 5;
}

function enforceSuperuserPermissions(permissions) {
  for (const permissionKey of VALID_PERMISSION_KEYS) {
    permissions[SUPERUSER_ROLE][permissionKey] = true;
  }
  return permissions;
}

function enforcePermissionInvariants(permissions) {
  enforceSuperuserPermissions(permissions);
  for (const role of COOK_VIEW_PERMISSION_ROLES) {
    permissions[role].orders = true;
  }
  permissions.cashier.overview = true;
  return permissions;
}

function getRoleSource(source, role) {
  const merged = {};
  for (const [rawRole, value] of Object.entries(source)) {
    if (
      normalizeRole(rawRole) !== role ||
      !value ||
      typeof value !== "object"
    ) {
      continue;
    }
    Object.assign(merged, value);
  }
  if (source[role] && typeof source[role] === "object") {
    Object.assign(merged, source[role]);
  }
  return merged;
}

function normalizePermissionsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const next = {};

  for (const role of VALID_PERMISSION_ROLES) {
    const roleSource = getRoleSource(source, role);
    next[role] = {};
    for (const permissionKey of VALID_PERMISSION_KEYS) {
      next[role][permissionKey] = normalizeBoolean(
        roleSource[permissionKey],
        DEFAULT_ROLE_PERMISSIONS[role][permissionKey],
      );
    }
  }

  return enforcePermissionInvariants(next);
}

function mergePermissionsPayload(currentPermissions, payload) {
  const next = normalizePermissionsPayload(currentPermissions);
  const source = payload && typeof payload === "object" ? payload : {};

  for (const role of VALID_PERMISSION_ROLES) {
    const roleChanges = getRoleSource(source, role);
    for (const permissionKey of VALID_PERMISSION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(roleChanges, permissionKey))
        continue;
      next[role][permissionKey] = normalizeBoolean(
        roleChanges[permissionKey],
        next[role][permissionKey],
      );
    }
  }

  return enforcePermissionInvariants(next);
}

function normalizePermissionRoleLocks(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const next = {};

  for (const role of VALID_PERMISSION_ROLES) {
    let savedValue;
    for (const [rawRole, value] of Object.entries(source)) {
      if (normalizeRole(rawRole) === role) savedValue = value;
    }
    if (Object.prototype.hasOwnProperty.call(source, role)) {
      savedValue = source[role];
    }
    next[role] = normalizeBoolean(
      savedValue,
      DEFAULT_PERMISSION_ROLE_LOCKS[role],
    );
  }

  return next;
}

function mergePermissionRoleLocks(currentLocks, payload) {
  const next = normalizePermissionRoleLocks(currentLocks);
  const source = payload && typeof payload === "object" ? payload : {};
  for (const role of VALID_PERMISSION_ROLES) {
    let savedValue;
    let hasSavedValue = false;
    for (const [rawRole, value] of Object.entries(source)) {
      if (normalizeRole(rawRole) !== role) continue;
      savedValue = value;
      hasSavedValue = true;
    }
    if (Object.prototype.hasOwnProperty.call(source, role)) {
      savedValue = source[role];
      hasSavedValue = true;
    }
    if (hasSavedValue) {
      next[role] = normalizeBoolean(savedValue, next[role]);
    }
  }
  return next;
}

async function loadRolePermissions() {
  const [permissionResult, lockResult] = await Promise.all([
    db.query(
      `SELECT role, permission_key, enabled
         FROM role_permissions`,
    ),
    db.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'role_permission_locks'
        LIMIT 1`,
    ),
  ]);
  const [rows] = permissionResult;
  const [lockRows] = lockResult;

  const merged = normalizePermissionsPayload(DEFAULT_ROLE_PERMISSIONS);

  const orderedRows = [...rows].sort((left, right) => {
    const leftRole = String(left.role || "")
      .trim()
      .toLowerCase();
    const rightRole = String(right.role || "")
      .trim()
      .toLowerCase();
    const leftCanonical = leftRole === normalizeRole(left.role) ? 1 : 0;
    const rightCanonical = rightRole === normalizeRole(right.role) ? 1 : 0;
    return leftCanonical - rightCanonical;
  });

  for (const row of orderedRows) {
    const role = normalizeRole(row.role);
    const permissionKey = String(row.permission_key || "").trim();
    if (!VALID_PERMISSION_ROLES.includes(role)) continue;
    if (!VALID_PERMISSION_KEYS.includes(permissionKey)) continue;
    merged[role][permissionKey] = normalizeBoolean(row.enabled, false);
  }

  enforcePermissionInvariants(merged);

  let roleLocks = normalizePermissionRoleLocks(DEFAULT_PERMISSION_ROLE_LOCKS);
  if (lockRows.length > 0 && lockRows[0].settings_json) {
    try {
      roleLocks = normalizePermissionRoleLocks(
        JSON.parse(lockRows[0].settings_json),
      );
    } catch {
      roleLocks = normalizePermissionRoleLocks(DEFAULT_PERMISSION_ROLE_LOCKS);
    }
  }

  return {
    permissions: merged,
    roleLocks,
  };
}

function normalizeNumber(
  value,
  fieldName,
  { allowNull = false, min = null } = {},
) {
  if (value === null || value === undefined || value === "") {
    if (allowNull) return null;
    throw new Error(`${fieldName} is required`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (min !== null && numeric < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }
  return numeric;
}

function normalizeName(value, fieldName) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeCategoryName(value, fieldName) {
  const normalized = normalizeName(value, fieldName);
  if (normalized.length > 100) {
    throw new Error(`${fieldName} must not exceed 100 characters`);
  }
  if (/\p{Cc}/u.test(normalized)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  return normalized;
}

function isCategoryValidationError(error) {
  return /(?:required|must not exceed|invalid characters)/i.test(
    String(error?.message || ""),
  );
}

function categoryErrorStatus(error) {
  if (error?.code === "ER_DUP_ENTRY") return 409;
  return isCategoryValidationError(error) ? 400 : 500;
}

function parseStoredSettings(rows) {
  if (!rows?.length || !rows[0]?.settings_json) return {};
  try {
    const parsed = JSON.parse(rows[0].settings_json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function deleteUnusedCategory(req, res, definition) {
  let connection;
  let transactionStarted = false;
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [categoryRows] = await connection.query(
      `SELECT name${definition.systemKeyColumn ? ", system_key" : ""}
       FROM ${definition.tableName}
       WHERE category_id = ?
       FOR UPDATE`,
      [categoryId],
    );
    if (categoryRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: `${definition.label} not found` });
    }

    const categoryName = String(categoryRows[0].name);
    if (
      definition.systemKeyColumn &&
      isProtectedMenuCategorySystemKey(categoryRows[0].system_key)
    ) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({
        code: "SYSTEM_CATEGORY_PROTECTED",
        message: `${categoryName} is a built-in system category and cannot be deleted.`,
      });
    }
    let assignments;
    if (isRedesignedProfile()) {
      [assignments] = await connection.query(
        `SELECT p.product_id
           FROM products p
          WHERE p.${definition.redesignedProductCategoryColumn} = ?
          FOR UPDATE`,
        [categoryId],
      );
    } else {
      [assignments] = await connection.query(
        `SELECT m.Product_ID
           FROM Menu m
           INNER JOIN products p ON p.id = m.Product_ID
          WHERE LOWER(TRIM(COALESCE(m.Category_Name, ''))) = LOWER(TRIM(?))
            AND LOWER(TRIM(COALESCE(p.item_type, ''))) = ?
          FOR UPDATE`,
        [categoryName, definition.itemType],
      );
    }

    if (assignments.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      const count = assignments.length;
      const recordLabel =
        count === 1
          ? definition.singularAssignment
          : definition.pluralAssignment;
      return res.status(409).json({
        code: "CATEGORY_IN_USE",
        dependency_count: count,
        message: `Cannot delete ${categoryName} because ${count} ${recordLabel} assigned to this category. Reassign ${count === 1 ? "it" : definition.pluralReassignment} before deleting.`,
      });
    }

    const [result] = await connection.query(
      `DELETE FROM ${definition.tableName} WHERE category_id = ?`,
      [categoryId],
    );
    if (result.affectedRows !== 1) {
      throw new Error(`Failed to delete ${definition.label.toLowerCase()}`);
    }

    await connection.commit();
    transactionStarted = false;
    await invalidateProductCache(`${definition.label.toLowerCase()} deleted`);
    return res.json({
      success: true,
      category_id: categoryId,
      name: categoryName,
    });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    if (error?.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        code: "CATEGORY_IN_USE",
        message: `Cannot delete this ${definition.label.toLowerCase()} because products still reference it.`,
      });
    }
    console.error(
      `DELETE /api/settings/${definition.routeLabel}/:id error:`,
      error,
    );
    return res.status(500).json({
      message: `Failed to delete ${definition.label.toLowerCase()}`,
      error: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
}

const MENU_CATEGORY_DELETION = Object.freeze({
  tableName: "menu_categories",
  itemType: "menu_item",
  label: "Menu category",
  routeLabel: "menu-categories",
  singularAssignment: "menu product is",
  pluralAssignment: "menu products are",
  pluralReassignment: "those products",
  systemKeyColumn: true,
  redesignedProductCategoryColumn: "menu_category_id",
});

const INVENTORY_CATEGORY_DELETION = Object.freeze({
  tableName: "inventory_categories",
  itemType: "stock_item",
  label: "Inventory category",
  routeLabel: "inventory-categories",
  singularAssignment: "inventory material is",
  pluralAssignment: "inventory materials are",
  pluralReassignment: "those materials",
  redesignedProductCategoryColumn: "inventory_category_id",
});

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeString(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeEnum(value, allowedValues, fieldName, fallback) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(", ")}`);
  }
  return normalized;
}

function normalizePercentage(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(`${fieldName} must be between 0 and 100`);
  }
  return Math.round(numeric * 100) / 100;
}

function normalizeNonNegativeNumericString(value, fieldName, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(normalizeNumber(value, fieldName, { min: 0 }));
}

function validateDeliveryPlatformUrl(value, platform) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const key = String(platform || "")
    .trim()
    .toLowerCase();
  const label = key === "grabfood" ? "GrabFood" : "Foodpanda";
  if (normalized.length > 2048) {
    throw new Error(`${label} ordering URL is too long`);
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} ordering URL must be a valid HTTPS URL`);
  }

  const allowedHosts = DELIVERY_PLATFORM_HOSTS[key];
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    !allowedHosts?.has(hostname)
  ) {
    throw new Error(
      `${label} ordering URL must use HTTPS on an approved official ${label} domain`,
    );
  }

  return parsed.toString();
}

function sanitizeDeliveryPlatformLinks(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    grabfoodUrl: validateDeliveryPlatformUrl(source.grabfoodUrl, "grabfood"),
    foodpandaUrl: validateDeliveryPlatformUrl(source.foodpandaUrl, "foodpanda"),
  };
}

function normalizeStoredDeliveryPlatformLinks(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const safe = { ...EMPTY_DELIVERY_PLATFORM_LINKS };
  try {
    safe.grabfoodUrl = validateDeliveryPlatformUrl(
      source.grabfoodUrl,
      "grabfood",
    );
  } catch {
    safe.grabfoodUrl = null;
  }
  try {
    safe.foodpandaUrl = validateDeliveryPlatformUrl(
      source.foodpandaUrl,
      "foodpanda",
    );
  } catch {
    safe.foodpandaUrl = null;
  }
  return safe;
}

async function loadDeliveryPlatformLinks() {
  const [rows] = await db.query(
    `SELECT settings_json
       FROM system_settings
      WHERE setting_key = ?
      LIMIT 1`,
    [DELIVERY_PLATFORM_LINKS_KEY],
  );
  if (!rows.length || !rows[0].settings_json) {
    return { ...EMPTY_DELIVERY_PLATFORM_LINKS };
  }
  try {
    return normalizeStoredDeliveryPlatformLinks(
      JSON.parse(rows[0].settings_json),
    );
  } catch {
    return { ...EMPTY_DELIVERY_PLATFORM_LINKS };
  }
}

function sanitizeSettingsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    restaurantName: DEFAULT_RESTAURANT_SETTINGS.restaurantName,
    tagline: DEFAULT_RESTAURANT_SETTINGS.tagline,
    email: normalizeString(source.email),
    phone: normalizeString(source.phone),
    address: normalizeString(source.address),
    businessTin: normalizeString(source.businessTin),
    businessRegistrationDetails: normalizeString(
      source.businessRegistrationDetails,
    ),
    currency: "PHP",
    timezone: "Asia/Manila",
    openTime: normalizeString(source.openTime, "08:00"),
    closeTime: normalizeString(source.closeTime, "22:00"),
    weekdayOpenTime: normalizeString(source.weekdayOpenTime, "10:00"),
    weekdayCloseTime: normalizeString(source.weekdayCloseTime, "22:00"),
    weekendOpenTime: normalizeString(source.weekendOpenTime, "11:00"),
    weekendCloseTime: normalizeString(source.weekendCloseTime, "20:30"),
    storeStatusMode: normalizeEnum(
      source.storeStatusMode,
      ["auto", "manual_open", "manual_closed"],
      "storeStatusMode",
      "auto",
    ),
    orderTypes: {
      dineIn: normalizeBoolean(source.orderTypes?.dineIn, true),
      takeout: normalizeBoolean(source.orderTypes?.takeout, true),
      delivery: normalizeBoolean(source.orderTypes?.delivery, false),
    },
    queueManagement: normalizeBoolean(source.queueManagement, false),
    maxTableCapacity: String(source.maxTableCapacity ?? ""),
    requireTableNumber: false,
    allowSplitBills: normalizeBoolean(source.allowSplitBills, false),
    enableLoyaltyPoints: normalizeBoolean(source.enableLoyaltyPoints, false),
    defaultLowStockThreshold: normalizeNonNegativeNumericString(
      source.defaultLowStockThreshold ?? source.lowStockThreshold ?? "",
      "defaultLowStockThreshold",
    ),
    defaultCriticalStockThreshold: normalizeNonNegativeNumericString(
      source.defaultCriticalStockThreshold ??
        source.criticalStockThreshold ??
        "",
      "defaultCriticalStockThreshold",
    ),
    trackExpiry: normalizeBoolean(source.trackExpiry, false),
    wasteLogging: normalizeBoolean(source.wasteLogging, false),
    defaultUsageType: normalizeEnum(
      source.defaultUsageType,
      ["manual", "auto"],
      "defaultUsageType",
      "manual",
    ),
    requireInventoryApproval: normalizeBoolean(
      source.requireInventoryApproval,
      true,
    ),
    allowNegativeStock: normalizeBoolean(source.allowNegativeStock, false),
    nearExpiryWarningDays: normalizeNonNegativeNumericString(
      source.nearExpiryWarningDays ?? "3",
      "nearExpiryWarningDays",
      "3",
    ),
    requireDailyUsageSubmission: normalizeBoolean(
      source.requireDailyUsageSubmission,
      true,
    ),
    autoFinalizeUsage: normalizeBoolean(source.autoFinalizeUsage, false),
    enableToastNotifications: normalizeBoolean(
      source.enableToastNotifications,
      true,
    ),
    toastPosition: normalizeEnum(
      source.toastPosition,
      ["top-right", "top-left", "bottom-right", "bottom-left"],
      "toastPosition",
      "top-right",
    ),
    toastDuration: normalizeNonNegativeNumericString(
      source.toastDuration ?? "4000",
      "toastDuration",
      "4000",
    ),
    enableConfirmDialogs: normalizeBoolean(source.enableConfirmDialogs, true),
    lowStockAlertsEnabled: normalizeBoolean(source.lowStockAlertsEnabled, true),
    taxRate: normalizeNonNegativeNumericString(source.taxRate ?? "", "taxRate"),
    serviceCharge: normalizeNonNegativeNumericString(
      source.serviceCharge ?? "",
      "serviceCharge",
    ),
    receiptFooter: String(source.receiptFooter ?? ""),
    printerEnabled: normalizeBoolean(source.printerEnabled, false),
    kitchenPrinterEnabled: normalizeBoolean(
      source.kitchenPrinterEnabled,
      false,
    ),
    maintenanceMode: normalizeBoolean(source.maintenanceMode, false),
  };
}

// Public by design: exposes only the two approved customer ordering URLs.
router.get("/delivery-links", async (_req, res) => {
  try {
    res.json(await loadDeliveryPlatformLinks());
  } catch (error) {
    console.error("GET /api/settings/delivery-links error:", error);
    res.status(500).json({ message: "Failed to load delivery platform links" });
  }
});

router.put("/delivery-links", requireAdministratorAccess, async (req, res) => {
  try {
    const links = sanitizeDeliveryPlatformLinks(req.body);
    await db.query(
      `INSERT INTO system_settings (setting_key, settings_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
      [DELIVERY_PLATFORM_LINKS_KEY, JSON.stringify(links)],
    );
    res.json(links);
  } catch (error) {
    const validationError = /ordering URL/i.test(String(error?.message));
    if (!validationError) {
      console.error("PUT /api/settings/delivery-links error:", error);
    }
    res.status(validationError ? 400 : 500).json({
      message: validationError
        ? error.message
        : "Failed to save delivery platform links",
    });
  }
});

router.put(
  "/discount-password",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const userId = Number(req.user?.userId);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({ message: "Invalid authenticated user" });
      }
      if (!checkDiscountPasswordRateLimit(userId)) {
        return res
          .status(429)
          .json({
            message: "Too many password update attempts. Try again later.",
          });
      }

      const currentAdminPassword = String(req.body?.currentAdminPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      const confirmPassword = String(req.body?.confirmPassword || "");
      if (
        !currentAdminPassword ||
        newPassword.length < 8 ||
        newPassword.length > 72
      ) {
        return res
          .status(400)
          .json({
            message:
              "Enter your current password and a new password of 8 to 72 characters.",
          });
      }
      if (newPassword !== confirmPassword) {
        return res
          .status(400)
          .json({ message: "New password confirmation does not match." });
      }

      const [users] = await db.query(
        `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
        [userId],
      );
      if (
        !users.length ||
        !(await bcrypt.compare(currentAdminPassword, users[0].password_hash))
      ) {
        return res
          .status(403)
          .json({ message: "Current administrator password is incorrect." });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await db.query(
        `INSERT INTO system_settings (setting_key, settings_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
        [
          DISCOUNT_AUTHORIZATION_KEY,
          JSON.stringify({
            passwordHash,
            updatedAt: new Date().toISOString(),
            updatedBy: userId,
          }),
        ],
      );
      discountPasswordAttempts.delete(String(userId));
      res.json({ message: "Discount authorization password updated." });
    } catch (error) {
      console.error("PUT /api/settings/discount-password error:", error);
      res
        .status(500)
        .json({ message: "Failed to update discount authorization password" });
    }
  },
);

// Only the Administrator can set the shared refund authorization password.
// The administrator's own login password is required to make this change.
router.put("/refund-password", requireAdministratorAccess, async (req, res) => {
  try {
    const userId = Number(req.user?.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Invalid authenticated user" });
    }
    if (!checkRefundPasswordUpdateRateLimit(userId)) {
      return res.status(429).json({
        message: "Too many password update attempts. Try again later.",
      });
    }

    const currentAdminPassword = String(req.body?.currentAdminPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");
    const passwordBytes = Buffer.byteLength(newPassword, "utf8");

    if (!currentAdminPassword || passwordBytes < 8 || passwordBytes > 72) {
      return res.status(400).json({
        message:
          "Enter your current administrator password and a new refund password of 8 to 72 bytes.",
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New refund password confirmation does not match.",
      });
    }

    const [users] = await db.query(
      `SELECT password_hash FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    if (
      !users.length ||
      !(await bcrypt.compare(currentAdminPassword, users[0].password_hash))
    ) {
      return res.status(403).json({
        message: "Current administrator password is incorrect.",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.query(
      `INSERT INTO system_settings (setting_key, settings_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
      [
        REFUND_AUTHORIZATION_KEY,
        JSON.stringify({
          passwordHash,
          updatedAt: new Date().toISOString(),
          updatedBy: userId,
        }),
      ],
    );
    refundPasswordUpdateAttempts.delete(String(userId));
    return res.json({ message: "Refund authorization password updated." });
  } catch (error) {
    console.error("PUT /api/settings/refund-password error:", error);
    return res.status(500).json({
      message: "Failed to update refund authorization password",
    });
  }
});

router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'restaurant_settings'
        LIMIT 1`,
    );

    if (rows.length === 0 || !rows[0].settings_json) {
      return res.json(sanitizeSettingsPayload({}));
    }

    const parsed = JSON.parse(rows[0].settings_json);
    res.json(
      parsed && typeof parsed === "object"
        ? sanitizeSettingsPayload(parsed)
        : {},
    );
  } catch (error) {
    console.error("GET /api/settings error:", error);
    res.status(500).json({
      message: "Failed to load settings",
      error: error.message,
    });
  }
});

router.post("/", requireAdministratorAccess, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT settings_json
       FROM system_settings
       WHERE setting_key = 'restaurant_settings'
       LIMIT 1`,
    );
    const current = parseStoredSettings(rows);
    const incoming = req.body && typeof req.body === "object" ? req.body : {};
    const sanitized = sanitizeSettingsPayload({ ...current, ...incoming });
    await db.query(
      `INSERT INTO system_settings (setting_key, settings_json)
       VALUES ('restaurant_settings', ?)
       ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
      [JSON.stringify(sanitized)],
    );
    res.json(sanitized);
  } catch (error) {
    console.error("POST /api/settings error:", error);
    res.status(400).json({
      message: error.message || "Failed to save settings",
      error: error.message,
    });
  }
});

router.get("/permissions", requireCookViewAccess, async (_req, res) => {
  try {
    const permissions = await loadRolePermissions();
    res.json(permissions);
  } catch (error) {
    console.error("GET /api/settings/permissions error:", error);
    res.status(500).json({
      message: "Failed to load permissions",
      error: error.message,
    });
  }
});

router.put("/permissions", requireAdministratorAccess, async (req, res) => {
  let connection;
  let transactionStarted = false;
  try {
    const current = await loadRolePermissions();
    const permissionChanges = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "permissions",
    )
      ? req.body.permissions
      : req.body;
    const permissions = mergePermissionsPayload(
      current.permissions,
      permissionChanges,
    );
    const roleLocks = mergePermissionRoleLocks(
      current.roleLocks,
      req.body?.roleLocks,
    );
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    for (const role of VALID_PERMISSION_ROLES) {
      for (const permissionKey of VALID_PERMISSION_KEYS) {
        await connection.query(
          `INSERT INTO role_permissions (role, permission_key, enabled)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
          [role, permissionKey, permissions[role][permissionKey] ? 1 : 0],
        );
      }
    }

    await connection.query(
      `INSERT INTO system_settings (setting_key, settings_json)
       VALUES ('role_permission_locks', ?)
       ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
      [JSON.stringify(roleLocks)],
    );
    await connection.commit();
    transactionStarted = false;

    const savedPermissions = await loadRolePermissions();
    res.json(savedPermissions);
  } catch (error) {
    console.error("PUT /api/settings/permissions error:", error);
    res.status(400).json({
      message: error.message || "Failed to save permissions",
      error: error.message,
    });
  } finally {
    if (connection && transactionStarted) await connection.rollback();
    if (connection) connection.release();
  }
});

router.get("/inventory-categories", async (req, res) => {
  try {
    const activeOnly = normalizeBoolean(req.query.activeOnly, false);
    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
         type,
         date_tracking_type,
         is_active,
         created_at,
         updated_at
       FROM inventory_categories
       ${activeOnly ? "WHERE is_active = TRUE" : ""}
       ORDER BY is_active DESC, name ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error("GET /api/settings/inventory-categories error:", error);
    res.status(500).json({
      message: "Failed to load inventory categories",
      error: error.message,
    });
  }
});

router.post(
  "/inventory-categories",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const name = normalizeCategoryName(req.body?.name, "Category name");
      const dateTrackingType = normalizeEnum(
        req.body?.date_tracking_type,
        ["none", "expiry", "shelf_life"],
        "date_tracking_type",
        "none",
      );

      const [existing] = await db.query(
        `SELECT category_id
       FROM inventory_categories
       WHERE LOWER(name) = LOWER(?)
       LIMIT 1`,
        [name],
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: "Category already exists" });
      }

      const [result] = await db.query(
        `INSERT INTO inventory_categories (
         name,
         date_tracking_type,
         is_active
       )
       VALUES (?, ?, TRUE)`,
        [name, dateTrackingType],
      );

      const [rows] = await db.query(
        `SELECT
         category_id,
         name,
         type,
         date_tracking_type,
         is_active,
         created_at,
         updated_at
       FROM inventory_categories
       WHERE category_id = ?`,
        [result.insertId],
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("POST /api/settings/inventory-categories error:", error);
      res.status(categoryErrorStatus(error)).json({
        message: isCategoryValidationError(error)
          ? error.message
          : error?.code === "ER_DUP_ENTRY"
            ? "Category already exists"
            : "Failed to create inventory category",
        error: error.message,
      });
    }
  },
);

router.patch(
  "/inventory-categories/:id",
  requireAdministratorAccess,
  async (req, res) => {
    let connection;
    let transactionStarted = false;
    try {
      const categoryId = Number(req.params.id);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return res.status(400).json({ message: "Invalid category id" });
      }

      const updates = [];
      const values = [];
      connection = await db.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [currentRows] = await connection.query(
        `SELECT name
       FROM inventory_categories
       WHERE category_id = ?
       FOR UPDATE`,
        [categoryId],
      );
      if (currentRows.length === 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(404).json({ message: "Category not found" });
      }
      const previousName = currentRows[0].name;
      let nextName = null;

      if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
        const name = normalizeCategoryName(req.body?.name, "Category name");
        const [duplicate] = await connection.query(
          `SELECT category_id
         FROM inventory_categories
         WHERE LOWER(name) = LOWER(?) AND category_id <> ?
         LIMIT 1`,
          [name, categoryId],
        );
        if (duplicate.length > 0) {
          await connection.rollback();
          transactionStarted = false;
          return res.status(409).json({ message: "Category already exists" });
        }
        updates.push("name = ?");
        values.push(name);
        nextName = name;
      }

      if (
        Object.prototype.hasOwnProperty.call(req.body, "date_tracking_type")
      ) {
        updates.push("date_tracking_type = ?");
        values.push(
          normalizeEnum(
            req.body.date_tracking_type,
            ["none", "expiry", "shelf_life"],
            "date_tracking_type",
            "none",
          ),
        );
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "is_active")) {
        updates.push("is_active = ?");
        values.push(normalizeBoolean(req.body.is_active, true) ? 1 : 0);
      }

      if (updates.length === 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: "No updates provided" });
      }

      values.push(categoryId);
      const [result] = await connection.query(
        `UPDATE inventory_categories
       SET ${updates.join(", ")}
       WHERE category_id = ?`,
        values,
      );

      if (
        !isRedesignedProfile() &&
        nextName !== null &&
        nextName !== previousName
      ) {
        await connection.query(
          `UPDATE Menu m
         INNER JOIN products p ON p.id = m.Product_ID
         SET m.Category_Name = ?
         WHERE LOWER(TRIM(COALESCE(m.Category_Name, ''))) = LOWER(TRIM(?))
           AND LOWER(TRIM(COALESCE(p.item_type, ''))) = 'stock_item'`,
          [nextName, previousName],
        );
      }

      const [rows] = await connection.query(
        `SELECT
         category_id,
         name,
         type,
         date_tracking_type,
         is_active,
         created_at,
         updated_at
       FROM inventory_categories
       WHERE category_id = ?`,
        [categoryId],
      );
      await connection.commit();
      transactionStarted = false;
      await invalidateProductCache("inventory category updated");
      res.json(rows[0]);
    } catch (error) {
      if (connection && transactionStarted) await connection.rollback();
      console.error(
        "PATCH /api/settings/inventory-categories/:id error:",
        error,
      );
      res.status(categoryErrorStatus(error)).json({
        message: isCategoryValidationError(error)
          ? error.message
          : error?.code === "ER_DUP_ENTRY"
            ? "Category already exists"
            : "Failed to update inventory category",
        error: error.message,
      });
    } finally {
      if (connection) connection.release();
    }
  },
);

router.get("/menu-categories", async (req, res) => {
  try {
    const activeOnly = normalizeBoolean(req.query.activeOnly, true);
    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
         system_key,
         display_order,
         is_active,
         created_at,
         updated_at
       FROM menu_categories
       ${activeOnly ? "WHERE is_active = TRUE" : ""}
       ORDER BY display_order ASC, name ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error("GET /api/settings/menu-categories error:", error);
    res.status(500).json({
      message: "Failed to load menu categories",
      error: error.message,
    });
  }
});

router.post(
  "/menu-categories",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const name = normalizeCategoryName(req.body?.name, "Menu category name");
      const displayOrder = Object.prototype.hasOwnProperty.call(
        req.body || {},
        "display_order",
      )
        ? normalizeNumber(req.body?.display_order, "display_order", { min: 0 })
        : 0;

      const [existing] = await db.query(
        `SELECT category_id
         FROM menu_categories
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1`,
        [name],
      );
      if (existing.length > 0) {
        return res
          .status(409)
          .json({ message: "Menu category already exists" });
      }

      const [result] = await db.query(
        `INSERT INTO menu_categories (
         name,
         display_order,
         is_active
       )
       VALUES (?, ?, TRUE)`,
        [name, displayOrder],
      );

      const [rows] = await db.query(
        `SELECT
         category_id,
         name,
         system_key,
         display_order,
         is_active,
         created_at,
         updated_at
       FROM menu_categories
       WHERE category_id = ?`,
        [result.insertId],
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("POST /api/settings/menu-categories error:", error);
      res.status(categoryErrorStatus(error)).json({
        message: isCategoryValidationError(error)
          ? error.message
          : error?.code === "ER_DUP_ENTRY"
            ? "Menu category already exists"
            : "Failed to create menu category",
        error: error.message,
      });
    }
  },
);

router.patch(
  "/menu-categories/:id",
  requireAdministratorAccess,
  async (req, res) => {
    let connection;
    let transactionStarted = false;
    try {
      const categoryId = Number(req.params.id);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return res.status(400).json({ message: "Invalid category id" });
      }

      const updates = [];
      const values = [];
      connection = await db.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [currentRows] = await connection.query(
        `SELECT name, system_key
       FROM menu_categories
       WHERE category_id = ?
       FOR UPDATE`,
        [categoryId],
      );
      if (currentRows.length === 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(404).json({ message: "Menu category not found" });
      }
      const previousName = currentRows[0].name;
      const protectedCategory = isProtectedMenuCategorySystemKey(
        currentRows[0].system_key,
      );
      if (
        protectedCategory &&
        (Object.prototype.hasOwnProperty.call(req.body, "name") ||
          (Object.prototype.hasOwnProperty.call(req.body, "is_active") &&
            !normalizeBoolean(req.body.is_active, true)))
      ) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          code: "SYSTEM_CATEGORY_PROTECTED",
          message: `${previousName} is a built-in system category and cannot be renamed or disabled.`,
        });
      }
      let nextName = null;

      if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
        const name = normalizeCategoryName(
          req.body?.name,
          "Menu category name",
        );
        const [duplicate] = await connection.query(
          `SELECT category_id
           FROM menu_categories
          WHERE LOWER(name) = LOWER(?) AND category_id <> ?
          LIMIT 1`,
          [name, categoryId],
        );
        if (duplicate.length > 0) {
          await connection.rollback();
          transactionStarted = false;
          return res
            .status(409)
            .json({ message: "Menu category already exists" });
        }
        updates.push("name = ?");
        values.push(name);
        nextName = name;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "display_order")) {
        updates.push("display_order = ?");
        values.push(
          normalizeNumber(req.body.display_order, "display_order", { min: 0 }),
        );
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "is_active")) {
        updates.push("is_active = ?");
        values.push(normalizeBoolean(req.body.is_active, true) ? 1 : 0);
      }

      if (updates.length === 0) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: "No updates provided" });
      }

      values.push(categoryId);
      const [result] = await connection.query(
        `UPDATE menu_categories
          SET ${updates.join(", ")}
        WHERE category_id = ?`,
        values,
      );

      if (
        !isRedesignedProfile() &&
        nextName !== null &&
        nextName !== previousName
      ) {
        await connection.query(
          `UPDATE Menu m
         INNER JOIN products p ON p.id = m.Product_ID
         SET m.Category_Name = ?
         WHERE LOWER(TRIM(COALESCE(m.Category_Name, ''))) = LOWER(TRIM(?))
           AND LOWER(TRIM(COALESCE(p.item_type, ''))) = 'menu_item'`,
          [nextName, previousName],
        );
      }

      const [rows] = await connection.query(
        `SELECT
         category_id,
         name,
         system_key,
         display_order,
         is_active,
         created_at,
         updated_at
       FROM menu_categories
       WHERE category_id = ?`,
        [categoryId],
      );
      await connection.commit();
      transactionStarted = false;
      await invalidateProductCache("menu category updated");
      res.json(rows[0]);
    } catch (error) {
      if (connection && transactionStarted) await connection.rollback();
      console.error("PATCH /api/settings/menu-categories/:id error:", error);
      res.status(categoryErrorStatus(error)).json({
        message: isCategoryValidationError(error)
          ? error.message
          : error?.code === "ER_DUP_ENTRY"
            ? "Menu category already exists"
            : "Failed to update menu category",
        error: error.message,
      });
    } finally {
      if (connection) connection.release();
    }
  },
);

router.delete("/menu-categories/:id", requireAdministratorAccess, (req, res) =>
  deleteUnusedCategory(req, res, MENU_CATEGORY_DELETION),
);

router.get("/discount-types", async (req, res) => {
  try {
    const activeOnly = normalizeBoolean(req.query.activeOnly, true);
    const [rows] = await db.query(
      `SELECT discount_id, name, percentage, is_active, created_at, updated_at
         FROM discount_types
        ${activeOnly ? "WHERE is_active = TRUE" : ""}
        ORDER BY percentage ASC, name ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error("GET /api/settings/discount-types error:", error);
    res.status(500).json({
      message: "Failed to load discount types",
      error: error.message,
    });
  }
});

router.post("/discount-types", requireAdministratorAccess, async (req, res) => {
  try {
    const name = normalizeString(req.body?.name);
    const percentage = normalizePercentage(req.body?.percentage, "percentage");

    if (!name) {
      return res.status(400).json({ message: "Discount name is required" });
    }

    const [existing] = await db.query(
      `SELECT discount_id
         FROM discount_types
        WHERE LOWER(name) = LOWER(?)
        LIMIT 1`,
      [name],
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Discount type already exists" });
    }

    const [result] = await db.query(
      `INSERT INTO discount_types (name, percentage, is_active)
       VALUES (?, ?, TRUE)`,
      [name, percentage],
    );

    const [rows] = await db.query(
      `SELECT discount_id, name, percentage, is_active, created_at, updated_at
         FROM discount_types
        WHERE discount_id = ?`,
      [result.insertId],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("POST /api/settings/discount-types error:", error);
    res.status(500).json({
      message: error.message || "Failed to create discount type",
      error: error.message,
    });
  }
});

router.patch(
  "/discount-types/:id",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const discountId = Number(req.params.id);
      if (!Number.isFinite(discountId) || discountId <= 0) {
        return res.status(400).json({ message: "Invalid discount type id" });
      }

      const updates = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
        const name = normalizeString(req.body?.name);
        if (!name) {
          return res.status(400).json({ message: "Discount name is required" });
        }
        const [existing] = await db.query(
          `SELECT discount_id
           FROM discount_types
          WHERE LOWER(name) = LOWER(?)
            AND discount_id <> ?
          LIMIT 1`,
          [name, discountId],
        );
        if (existing.length > 0) {
          return res
            .status(409)
            .json({ message: "Discount type already exists" });
        }
        updates.push("name = ?");
        values.push(name);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "percentage")) {
        updates.push("percentage = ?");
        values.push(normalizePercentage(req.body?.percentage, "percentage"));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "is_active")) {
        updates.push("is_active = ?");
        values.push(normalizeBoolean(req.body?.is_active, true));
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      values.push(discountId);
      const [result] = await db.query(
        `UPDATE discount_types
          SET ${updates.join(", ")}
        WHERE discount_id = ?`,
        values,
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Discount type not found" });
      }

      const [rows] = await db.query(
        `SELECT discount_id, name, percentage, is_active, created_at, updated_at
         FROM discount_types
        WHERE discount_id = ?`,
        [discountId],
      );
      res.json(rows[0]);
    } catch (error) {
      console.error("PATCH /api/settings/discount-types/:id error:", error);
      res.status(500).json({
        message: error.message || "Failed to update discount type",
        error: error.message,
      });
    }
  },
);

router.delete(
  "/inventory-categories/:id",
  requireAdministratorAccess,
  (req, res) => deleteUnusedCategory(req, res, INVENTORY_CATEGORY_DELETION),
);

router.get("/inventory-units", async (req, res) => {
  try {
    const activeOnly = normalizeBoolean(req.query.activeOnly, false);
    const [rows] = await db.query(
      `SELECT
         unit_id,
         name,
         abbreviation,
         base_unit,
         conversion_to_base,
         is_active,
         created_at,
         updated_at
       FROM inventory_units
       ${activeOnly ? "WHERE is_active = TRUE" : ""}
       ORDER BY is_active DESC, name ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error("GET /api/settings/inventory-units error:", error);
    res.status(500).json({
      message: "Failed to load inventory units",
      error: error.message,
    });
  }
});

router.post(
  "/inventory-units",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const name = normalizeName(req.body?.name, "Unit name");
      const abbreviation = normalizeOptionalString(req.body?.abbreviation);
      const baseUnit = normalizeOptionalString(req.body?.base_unit);
      const conversionToBase = Object.prototype.hasOwnProperty.call(
        req.body || {},
        "conversion_to_base",
      )
        ? normalizeNumber(req.body?.conversion_to_base, "conversion_to_base", {
            allowNull: true,
            min: 0,
          })
        : null;

      const [existing] = await db.query(
        `SELECT unit_id
       FROM inventory_units
       WHERE LOWER(name) = LOWER(?)
       LIMIT 1`,
        [name],
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: "Unit already exists" });
      }

      const [result] = await db.query(
        `INSERT INTO inventory_units (
         name,
         abbreviation,
         base_unit,
         conversion_to_base,
         is_active
       )
       VALUES (?, ?, ?, ?, TRUE)`,
        [name, abbreviation, baseUnit, conversionToBase],
      );

      const [rows] = await db.query(
        `SELECT
         unit_id,
         name,
         abbreviation,
         base_unit,
         conversion_to_base,
         is_active,
         created_at,
         updated_at
       FROM inventory_units
       WHERE unit_id = ?`,
        [result.insertId],
      );
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("POST /api/settings/inventory-units error:", error);
      res.status(error.message?.includes("required") ? 400 : 500).json({
        message: error.message?.includes("required")
          ? error.message
          : "Failed to create inventory unit",
        error: error.message,
      });
    }
  },
);

router.patch(
  "/inventory-units/:id",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const unitId = Number(req.params.id);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ message: "Invalid unit id" });
      }

      const updates = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
        const name = normalizeName(req.body?.name, "Unit name");
        const [duplicate] = await db.query(
          `SELECT unit_id
         FROM inventory_units
         WHERE LOWER(name) = LOWER(?) AND unit_id <> ?
         LIMIT 1`,
          [name, unitId],
        );
        if (duplicate.length > 0) {
          return res.status(409).json({ message: "Unit already exists" });
        }
        updates.push("name = ?");
        values.push(name);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "abbreviation")) {
        updates.push("abbreviation = ?");
        values.push(normalizeOptionalString(req.body.abbreviation));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "base_unit")) {
        updates.push("base_unit = ?");
        values.push(normalizeOptionalString(req.body.base_unit));
      }

      if (
        Object.prototype.hasOwnProperty.call(req.body, "conversion_to_base")
      ) {
        updates.push("conversion_to_base = ?");
        values.push(
          normalizeNumber(req.body.conversion_to_base, "conversion_to_base", {
            allowNull: true,
            min: 0,
          }),
        );
      }

      if (Object.prototype.hasOwnProperty.call(req.body, "is_active")) {
        updates.push("is_active = ?");
        values.push(normalizeBoolean(req.body.is_active, true) ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No updates provided" });
      }

      values.push(unitId);
      const [result] = await db.query(
        `UPDATE inventory_units
       SET ${updates.join(", ")}
       WHERE unit_id = ?`,
        values,
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Unit not found" });
      }

      const [rows] = await db.query(
        `SELECT
         unit_id,
         name,
         abbreviation,
         base_unit,
         conversion_to_base,
         is_active,
         created_at,
         updated_at
       FROM inventory_units
       WHERE unit_id = ?`,
        [unitId],
      );
      res.json(rows[0]);
    } catch (error) {
      console.error("PATCH /api/settings/inventory-units/:id error:", error);
      res.status(error.message?.includes("required") ? 400 : 500).json({
        message: error.message?.includes("required")
          ? error.message
          : "Failed to update inventory unit",
        error: error.message,
      });
    }
  },
);

router.delete(
  "/inventory-units/:id",
  requireAdministratorAccess,
  async (req, res) => {
    try {
      const unitId = Number(req.params.id);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ message: "Invalid unit id" });
      }

      const [result] = await db.query(
        `UPDATE inventory_units
       SET is_active = FALSE
       WHERE unit_id = ?`,
        [unitId],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Unit not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("DELETE /api/settings/inventory-units/:id error:", error);
      res.status(500).json({
        message: "Failed to disable inventory unit",
        error: error.message,
      });
    }
  },
);

module.exports = router;
module.exports.permissionPolicy = {
  DEFAULT_RESTAURANT_SETTINGS,
  DEFAULT_ROLE_PERMISSIONS,
  VALID_PERMISSION_KEYS,
  VALID_PERMISSION_ROLES,
  mergePermissionRoleLocks,
  mergePermissionsPayload,
  normalizePermissionRoleLocks,
  normalizePermissionsPayload,
  normalizeStoredDeliveryPlatformLinks,
  sanitizeDeliveryPlatformLinks,
  sanitizeSettingsPayload,
  validateDeliveryPlatformUrl,
};
