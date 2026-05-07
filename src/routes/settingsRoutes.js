const router = require("express").Router();
const db = require("../config/db");

async function addColumnIfMissing(tableName, columnName, definition) {
  const [rows] = await db.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName],
  );

  if (rows.length === 0) {
    await db.query(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
    );
  }
}

async function ensureInventoryMasterTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      category_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      uses_shelf_life BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory_units (
      unit_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      abbreviation VARCHAR(30) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      settings_json LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role VARCHAR(50) NOT NULL,
      permission_key VARCHAR(80) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_role_permission (role, permission_key)
    )
  `);

  await addColumnIfMissing(
    "inventory_categories",
    "type",
    "ENUM('raw_material','ingredient','finished') NOT NULL DEFAULT 'ingredient'",
  );
  await addColumnIfMissing(
    "inventory_categories",
    "shelf_life_enabled",
    "BOOLEAN NOT NULL DEFAULT FALSE",
  );
  await addColumnIfMissing(
    "inventory_categories",
    "default_shelf_life_days",
    "INT NULL",
  );
  await addColumnIfMissing(
    "inventory_units",
    "base_unit",
    "VARCHAR(100) NULL",
  );
  await addColumnIfMissing(
    "inventory_units",
    "conversion_to_base",
    "DECIMAL(12,4) NULL",
  );

  const categorySeeds = [
    ["Raw Material", 1, "raw_material"],
    ["Sauces", 0, "ingredient"],
    ["Ingredients", 0, "ingredient"],
    ["Aromatics", 0, "ingredient"],
  ];
  for (const [name, usesShelfLife, type] of categorySeeds) {
    await db.query(
      `INSERT INTO inventory_categories (name, uses_shelf_life, type, shelf_life_enabled)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER(?)
       )`,
      [name, usesShelfLife, type, usesShelfLife, name],
    );
  }

  const unitSeeds = [
    ["kg", null],
    ["g", null],
    ["liter", null],
    ["ml", null],
    ["piece", null],
    ["pack", null],
    ["bottle", null],
    ["case", null],
  ];
  for (const [name, abbreviation] of unitSeeds) {
    await db.query(
      `INSERT INTO inventory_units (name, abbreviation)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM inventory_units WHERE LOWER(name) = LOWER(?)
       )`,
      [name, abbreviation, name],
    );
  }
}

const DEFAULT_ROLE_PERMISSIONS = {
  administrator: {
    overview: true,
    orders: false,
    menuManagement: true,
    menus: false,
    stockManager: false,
    userAccounts: true,
    salesReports: true,
    settings: true,
  },
  cashier: {
    overview: false,
    orders: false,
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
    orders: false,
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

  next.administrator.userAccounts = true;
  next.administrator.settings = true;

  return next;
}

async function loadRolePermissions() {
  await ensureInventoryMasterTables();
  const [rows] = await db.query(
    `SELECT role, permission_key, enabled
       FROM role_permissions`,
  );

  const merged = normalizePermissionsPayload(DEFAULT_ROLE_PERMISSIONS);

  for (const row of rows) {
    const role = String(row.role || "").trim().toLowerCase();
    const permissionKey = String(row.permission_key || "").trim();
    if (!VALID_PERMISSION_ROLES.includes(role)) continue;
    if (!VALID_PERMISSION_KEYS.includes(permissionKey)) continue;
    merged[role][permissionKey] = normalizeBoolean(row.enabled, false);
  }

  merged.administrator.userAccounts = true;
  merged.administrator.settings = true;

  return merged;
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

function sanitizeSettingsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    restaurantName: String(source.restaurantName ?? ""),
    tagline: String(source.tagline ?? ""),
    email: String(source.email ?? ""),
    phone: String(source.phone ?? ""),
    address: String(source.address ?? ""),
    currency: String(source.currency ?? "PHP"),
    timezone: String(source.timezone ?? "Asia/Manila"),
    openTime: String(source.openTime ?? "08:00"),
    closeTime: String(source.closeTime ?? "22:00"),
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
    lowStockThreshold: String(source.lowStockThreshold ?? ""),
    criticalStockThreshold: String(source.criticalStockThreshold ?? ""),
    autoReorderEnabled: normalizeBoolean(source.autoReorderEnabled, false),
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
    nearExpiryWarningDays: String(source.nearExpiryWarningDays ?? "3"),
    requireDailyUsageSubmission: normalizeBoolean(
      source.requireDailyUsageSubmission,
      true,
    ),
    autoFinalizeUsage: normalizeBoolean(source.autoFinalizeUsage, false),
    outOfStockBehavior: normalizeEnum(
      source.outOfStockBehavior,
      ["hide", "disable"],
      "outOfStockBehavior",
      "disable",
    ),
    emailNotifications: normalizeBoolean(source.emailNotifications, true),
    smsNotifications: normalizeBoolean(source.smsNotifications, false),
    orderAlerts: normalizeBoolean(source.orderAlerts, true),
    staffAlerts: normalizeBoolean(source.staffAlerts, false),
    dailyReportTime: String(source.dailyReportTime ?? "08:00"),
    taxRate: String(source.taxRate ?? ""),
    serviceCharge: String(source.serviceCharge ?? ""),
    receiptFooter: String(source.receiptFooter ?? ""),
    printerEnabled: normalizeBoolean(source.printerEnabled, false),
    kitchenPrinterEnabled: normalizeBoolean(source.kitchenPrinterEnabled, false),
    maintenanceMode: normalizeBoolean(source.maintenanceMode, false),
  };
}

router.get("/", async (_req, res) => {
  try {
    await ensureInventoryMasterTables();
    const [rows] = await db.query(
      `SELECT settings_json
         FROM system_settings
        WHERE setting_key = 'restaurant_settings'
        LIMIT 1`,
    );

    if (rows.length === 0 || !rows[0].settings_json) {
      return res.json({});
    }

    const parsed = JSON.parse(rows[0].settings_json);
    res.json(parsed && typeof parsed === "object" ? parsed : {});
  } catch (error) {
    console.error("GET /api/settings error:", error);
    res.status(500).json({
      message: "Failed to load settings",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
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

router.put("/permissions", async (req, res) => {
  try {
    const permissions = normalizePermissionsPayload(req.body);
    await ensureInventoryMasterTables();

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
    await ensureInventoryMasterTables();
    const activeOnly = normalizeBoolean(req.query.activeOnly, false);
    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
         uses_shelf_life,
         type,
         shelf_life_enabled,
         default_shelf_life_days,
         is_active,
         created_at,
         updated_at
       FROM inventory_categories
       ${activeOnly ? "WHERE is_active = TRUE" : ""}
       ORDER BY is_active DESC, uses_shelf_life DESC, name ASC`,
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

router.post("/inventory-categories", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
    const name = normalizeName(req.body?.name, "Category name");
    const usesShelfLife = normalizeBoolean(req.body?.uses_shelf_life, false);
    const type = normalizeEnum(
      req.body?.type,
      ["raw_material", "ingredient", "finished"],
      "type",
      usesShelfLife ? "raw_material" : "ingredient",
    );
    const shelfLifeEnabled = normalizeBoolean(
      req.body?.shelf_life_enabled,
      usesShelfLife,
    );
    const defaultShelfLifeDays = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "default_shelf_life_days",
    )
      ? normalizeNumber(req.body?.default_shelf_life_days, "default_shelf_life_days", {
          allowNull: true,
          min: 0,
        })
      : null;

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
         uses_shelf_life,
         type,
         shelf_life_enabled,
         default_shelf_life_days,
         is_active
       )
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [
        name,
        usesShelfLife ? 1 : 0,
        type,
        shelfLifeEnabled ? 1 : 0,
        defaultShelfLifeDays,
      ],
    );

    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
         uses_shelf_life,
         type,
         shelf_life_enabled,
         default_shelf_life_days,
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

router.patch("/inventory-categories/:id", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
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

    if (Object.prototype.hasOwnProperty.call(req.body, "uses_shelf_life")) {
      updates.push("uses_shelf_life = ?");
      values.push(normalizeBoolean(req.body.uses_shelf_life, false) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "type")) {
      updates.push("type = ?");
      values.push(
        normalizeEnum(
          req.body.type,
          ["raw_material", "ingredient", "finished"],
          "type",
          "ingredient",
        ),
      );
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "shelf_life_enabled")) {
      updates.push("shelf_life_enabled = ?");
      values.push(normalizeBoolean(req.body.shelf_life_enabled, false) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "default_shelf_life_days")) {
      updates.push("default_shelf_life_days = ?");
      values.push(
        normalizeNumber(req.body.default_shelf_life_days, "default_shelf_life_days", {
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
         uses_shelf_life,
         type,
         shelf_life_enabled,
         default_shelf_life_days,
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

router.delete("/inventory-categories/:id", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
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
    await ensureInventoryMasterTables();
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

router.post("/inventory-units", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
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

router.patch("/inventory-units/:id", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
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

router.delete("/inventory-units/:id", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
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
