const router = require("express").Router();
const db = require("../config/db");

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

  const categorySeeds = [
    ["Raw Material", 1],
    ["Sauces", 0],
    ["Ingredients", 0],
    ["Aromatics", 0],
  ];
  for (const [name, usesShelfLife] of categorySeeds) {
    await db.query(
      `INSERT INTO inventory_categories (name, uses_shelf_life)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER(?)
       )`,
      [name, usesShelfLife, name],
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

router.get("/inventory-categories", async (req, res) => {
  try {
    await ensureInventoryMasterTables();
    const activeOnly = normalizeBoolean(req.query.activeOnly, false);
    const [rows] = await db.query(
      `SELECT
         category_id,
         name,
         uses_shelf_life,
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
      `INSERT INTO inventory_categories (name, uses_shelf_life, is_active)
       VALUES (?, ?, TRUE)`,
      [name, usesShelfLife ? 1 : 0],
    );

    const [rows] = await db.query(
      `SELECT category_id, name, uses_shelf_life, is_active, created_at, updated_at
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
      `SELECT category_id, name, uses_shelf_life, is_active, created_at, updated_at
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
      `INSERT INTO inventory_units (name, abbreviation, is_active)
       VALUES (?, ?, TRUE)`,
      [name, abbreviation],
    );

    const [rows] = await db.query(
      `SELECT unit_id, name, abbreviation, is_active, created_at, updated_at
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
      `SELECT unit_id, name, abbreviation, is_active, created_at, updated_at
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
