const router = require("express").Router();
const db = require("../config/db");
const { SUPERUSER_ROLE } = require("../middleware/roleAccess");
const { requireAdministratorAccess } = require("../middleware/staffAccess");

const DEFAULT_ROLE_PERMISSIONS = {
  administrator: {
    overview: true,
    orders: true,
    menuManagement: true,
    menus: true,
    stockManager: true,
    userAccounts: true,
    salesReports: true,
    settings: true,
  },
  cashier: {
    overview: true,
    orders: true,
    menuManagement: false,
    menus: true,
    stockManager: false,
    userAccounts: false,
    salesReports: true,
    settings: false,
  },
  cook: {
    overview: false,
    orders: true,
    menuManagement: false,
    menus: false,
    stockManager: false,
    userAccounts: false,
    salesReports: false,
    settings: false,
  },
  inventory_manager: {
    overview: true,
    orders: true,
    menuManagement: true,
    menus: false,
    stockManager: true,
    userAccounts: false,
    salesReports: false,
    settings: false,
  },
};

const VALID_PERMISSION_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS);
const VALID_PERMISSION_KEYS = Object.keys(DEFAULT_ROLE_PERMISSIONS.administrator);
const COOK_VIEW_PERMISSION_ROLES = [
  "administrator",
  "cashier",
  "inventory_manager",
  "cook",
];
const DEFAULT_PERMISSION_ROLE_LOCKS = {
  administrator: false,
  cashier: false,
  cook: false,
  inventory_manager: false,
};

function enforceSuperuserPermissions(permissions) {
  for (const permissionKey of VALID_PERMISSION_KEYS) {
    permissions[SUPERUSER_ROLE][permissionKey] = true;
  }
  return permissions;
}

function normalizePermissionsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const next = {};

  for (const role of VALID_PERMISSION_ROLES) {
    const roleSource =
      source[role] && typeof source[role] === "object" ? source[role] : {};
    next[role] = {};
    for (const permissionKey of VALID_PERMISSION_KEYS) {
      next[role][permissionKey] = normalizeBoolean(
        roleSource[permissionKey],
        DEFAULT_ROLE_PERMISSIONS[role][permissionKey],
      );
    }
  }

  enforceSuperuserPermissions(next);
  for (const role of COOK_VIEW_PERMISSION_ROLES) {
    next[role].orders = true;
  }
  next.cashier.overview = true;

  return next;
}

function normalizePermissionRoleLocks(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const next = {};

  for (const role of VALID_PERMISSION_ROLES) {
    next[role] = normalizeBoolean(
      source[role],
      DEFAULT_PERMISSION_ROLE_LOCKS[role],
    );
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

  for (const row of rows) {
    const role = String(row.role || "").trim().toLowerCase();
    const permissionKey = String(row.permission_key || "").trim();
    if (!VALID_PERMISSION_ROLES.includes(role)) continue;
    if (!VALID_PERMISSION_KEYS.includes(permissionKey)) continue;
    merged[role][permissionKey] = normalizeBoolean(row.enabled, false);
  }

  enforceSuperuserPermissions(merged);
  for (const role of COOK_VIEW_PERMISSION_ROLES) {
    merged[role].orders = true;
  }
  merged.cashier.overview = true;

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

function normalizeNumber(value, fieldName, { allowNull = false, min = null } = {}) {
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
    throw new Error(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
    );
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

function sanitizeSettingsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    restaurantName: "The Crunch",
    tagline: "",
    email: normalizeString(source.email),
    phone: normalizeString(source.phone),
    address: normalizeString(source.address),
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
    requireTableNumber: normalizeBoolean(source.requireTableNumber, true),
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
    enableConfirmDialogs: normalizeBoolean(
      source.enableConfirmDialogs,
      true,
    ),
    taxRate: normalizeNonNegativeNumericString(
      source.taxRate ?? "",
      "taxRate",
    ),
    serviceCharge: normalizeNonNegativeNumericString(
      source.serviceCharge ?? "",
      "serviceCharge",
    ),
    receiptFooter: String(source.receiptFooter ?? ""),
    printerEnabled: normalizeBoolean(source.printerEnabled, false),
    kitchenPrinterEnabled: normalizeBoolean(source.kitchenPrinterEnabled, false),
    maintenanceMode: normalizeBoolean(source.maintenanceMode, false),
  };
}

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
    const sanitized = sanitizeSettingsPayload(req.body);
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

router.get("/permissions", async (_req, res) => {
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
  try {
    const permissions = normalizePermissionsPayload(
      req.body?.permissions ?? req.body,
    );
    const roleLocks = normalizePermissionRoleLocks(
      req.body?.roleLocks ?? DEFAULT_PERMISSION_ROLE_LOCKS,
    );
    for (const role of VALID_PERMISSION_ROLES) {
      for (const permissionKey of VALID_PERMISSION_KEYS) {
        await db.query(
          `INSERT INTO role_permissions (role, permission_key, enabled)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)`,
          [
            role,
            permissionKey,
            permissions[role][permissionKey] ? 1 : 0,
          ],
        );
      }
    }

    await db.query(
      `INSERT INTO system_settings (setting_key, settings_json)
       VALUES ('role_permission_locks', ?)
       ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
      [JSON.stringify(roleLocks)],
    );

    const savedPermissions = await loadRolePermissions();
    res.json(savedPermissions);
  } catch (error) {
    console.error("PUT /api/settings/permissions error:", error);
    res.status(400).json({
      message: error.message || "Failed to save permissions",
      error: error.message,
    });
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

router.post("/inventory-categories", requireAdministratorAccess, async (req, res) => {
  try {
    const name = normalizeName(req.body?.name, "Category name");
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
    res.status(error.message?.includes("required") ? 400 : 500).json({
      message: error.message?.includes("required")
        ? error.message
        : "Failed to create inventory category",
      error: error.message,
    });
  }
});

router.patch("/inventory-categories/:id", requireAdministratorAccess, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = normalizeName(req.body?.name, "Category name");
      const [duplicate] = await db.query(
        `SELECT category_id
         FROM inventory_categories
         WHERE LOWER(name) = LOWER(?) AND category_id <> ?
         LIMIT 1`,
        [name, categoryId],
      );
      if (duplicate.length > 0) {
        return res.status(409).json({ message: "Category already exists" });
      }
      updates.push("name = ?");
      values.push(name);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "date_tracking_type")) {
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
      return res.status(400).json({ message: "No updates provided" });
    }

    values.push(categoryId);
    const [result] = await db.query(
      `UPDATE inventory_categories
       SET ${updates.join(", ")}
       WHERE category_id = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

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
      [categoryId],
    );
    res.json(rows[0]);
  } catch (error) {
    console.error("PATCH /api/settings/inventory-categories/:id error:", error);
    res.status(error.message?.includes("required") ? 400 : 500).json({
      message: error.message?.includes("required")
        ? error.message
        : "Failed to update inventory category",
      error: error.message,
    });
  }
});

router.get("/menu-categories", async (req, res) => {
  try {
    const activeOnly = normalizeBoolean(req.query.activeOnly, true);
    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
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

router.post("/menu-categories", requireAdministratorAccess, async (req, res) => {
  try {
    const name = normalizeName(req.body?.name, "Menu category name");
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
      return res.status(409).json({ message: "Menu category already exists" });
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
    res.status(error.message?.includes("required") ? 400 : 500).json({
      message: error.message?.includes("required")
        ? error.message
        : "Failed to create menu category",
      error: error.message,
    });
  }
});

router.patch("/menu-categories/:id", requireAdministratorAccess, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
      const name = normalizeName(req.body?.name, "Menu category name");
      const [duplicate] = await db.query(
        `SELECT category_id
           FROM menu_categories
          WHERE LOWER(name) = LOWER(?) AND category_id <> ?
          LIMIT 1`,
        [name, categoryId],
      );
      if (duplicate.length > 0) {
        return res.status(409).json({ message: "Menu category already exists" });
      }
      updates.push("name = ?");
      values.push(name);
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
      return res.status(400).json({ message: "No updates provided" });
    }

    values.push(categoryId);
    const [result] = await db.query(
      `UPDATE menu_categories
          SET ${updates.join(", ")}
        WHERE category_id = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Menu category not found" });
    }

    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
         display_order,
         is_active,
         created_at,
         updated_at
       FROM menu_categories
       WHERE category_id = ?`,
      [categoryId],
    );
    res.json(rows[0]);
  } catch (error) {
    console.error("PATCH /api/settings/menu-categories/:id error:", error);
    res.status(error.message?.includes("required") ? 400 : 500).json({
      message: error.message?.includes("required")
        ? error.message
        : "Failed to update menu category",
      error: error.message,
    });
  }
});

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
    const percentage = normalizePercentage(
      req.body?.percentage,
      "percentage",
    );

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

router.patch("/discount-types/:id", requireAdministratorAccess, async (req, res) => {
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
        return res.status(409).json({ message: "Discount type already exists" });
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
});

router.delete("/inventory-categories/:id", requireAdministratorAccess, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const [result] = await db.query(
      `UPDATE inventory_categories
       SET is_active = FALSE
       WHERE category_id = ?`,
      [categoryId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/settings/inventory-categories/:id error:", error);
    res.status(500).json({
      message: "Failed to disable inventory category",
      error: error.message,
    });
  }
});

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

router.post("/inventory-units", requireAdministratorAccess, async (req, res) => {
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
});

router.patch("/inventory-units/:id", requireAdministratorAccess, async (req, res) => {
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

    if (Object.prototype.hasOwnProperty.call(req.body, "conversion_to_base")) {
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
});

router.delete("/inventory-units/:id", requireAdministratorAccess, async (req, res) => {
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
});

module.exports = router;
