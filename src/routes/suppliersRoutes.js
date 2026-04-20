const router = require("express").Router();
const db = require("../config/db");

async function getSuppliersColumns() {
  const [rows] = await db.query("SHOW COLUMNS FROM Suppliers");
  return new Set(rows.map((r) => String(r.Field).toLowerCase()));
}

function buildSupplierSelect(columns) {
  const hasEmail = columns.has("email");
  const hasProductsSupplied = columns.has("products_supplied");
  const hasDeliverySchedule = columns.has("delivery_schedule");
  const hasProductId = columns.has("product_id");

  return `SELECT
    Supplier_ID AS supplier_id,
    SupplierName AS supplier_name,
    Contact_Number AS contact_number,
    ${hasDeliverySchedule ? "Delivery_Schedule" : "NULL"} AS delivery_schedule,
    ${hasProductId ? "Product_ID" : "NULL"} AS product_id,
    ${hasEmail ? "Email" : "NULL"} AS email,
    ${hasProductsSupplied ? "Products_Supplied" : "NULL"} AS products_supplied
  FROM Suppliers`;
}

function normalizeOptionalProductId(value) {
  if (value === null || value === undefined || value === "") return null;
  const productId = Number(value);
  if (!Number.isFinite(productId) || productId <= 0) return null;
  return productId;
}

function normalizeProductsSupplied(value) {
  if (Array.isArray(value)) {
    value = value.join(",");
  }

  if (value === null || value === undefined) return null;

  const normalized = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => {
      const lower = item.toLowerCase();
      return arr.findIndex((entry) => entry.toLowerCase() === lower) === index;
    })
    .join(", ");

  return normalized || null;
}

// Helper to log supplier activity
async function logSupplierHistory({
  supplier_id,
  supplier_name,
  action,
  details,
  performed_by = null,
}) {
  try {
    await db.query(
      `INSERT INTO supplier_history (supplier_id, supplier_name, action, details, performed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [supplier_id ?? 0, supplier_name, action, details ?? null, performed_by],
    );
  } catch (err) {
    console.error("Failed to log supplier history:", err.message);
    // Non-fatal — don't throw, just log
  }
}

// GET /api/suppliers
router.get("/", async (req, res) => {
  try {
    const columns = await getSuppliersColumns();
    const [rows] = await db.query(
      `${buildSupplierSelect(columns)}
       ORDER BY Supplier_ID ASC`,
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching suppliers:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// GET /api/suppliers/history  <-- must be BEFORE /:supplier_id
router.get("/history", async (req, res) => {
  try {
    const [history] = await db.query(
      `SELECT * FROM supplier_history ORDER BY created_at DESC LIMIT 200`,
    );
    res.json(history);
  } catch (err) {
    console.error("GET /suppliers/history error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/suppliers/:supplier_id
router.put("/:supplier_id", async (req, res) => {
  try {
    const supplierId = Number(req.params.supplier_id);
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ message: "Invalid supplier_id" });
    }

    const columns = await getSuppliersColumns();
    const [existingRows] = await db.query(
      `${buildSupplierSelect(columns)} WHERE Supplier_ID = ?`,
      [supplierId],
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const existing = existingRows[0];
    const updates = [];
    const values = [];
    const detailParts = [];

    if (Object.prototype.hasOwnProperty.call(req.body, "supplier_name")) {
      const supplierName = String(req.body.supplier_name ?? "").trim();
      if (!supplierName) {
        return res
          .status(400)
          .json({ message: "supplier_name cannot be empty" });
      }
      updates.push("SupplierName = ?");
      values.push(supplierName);
      detailParts.push(`Name: ${existing.supplier_name} -> ${supplierName}`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "contact_number")) {
      const contactNumber = req.body.contact_number
        ? String(req.body.contact_number).trim()
        : null;
      updates.push("Contact_Number = ?");
      values.push(contactNumber);
      detailParts.push(
        `Contact: ${existing.contact_number ?? "-"} -> ${contactNumber ?? "-"}`,
      );
    }

    if (
      columns.has("delivery_schedule") &&
      Object.prototype.hasOwnProperty.call(req.body, "delivery_schedule")
    ) {
      const deliverySchedule = req.body.delivery_schedule
        ? String(req.body.delivery_schedule).trim()
        : null;
      updates.push("Delivery_Schedule = ?");
      values.push(deliverySchedule);
      detailParts.push(
        `Schedule: ${existing.delivery_schedule ?? "-"} -> ${deliverySchedule ?? "-"}`,
      );
    }

    if (
      columns.has("product_id") &&
      Object.prototype.hasOwnProperty.call(req.body, "product_id")
    ) {
      const productId = normalizeOptionalProductId(req.body.product_id);

      updates.push("Product_ID = ?");
      values.push(productId);
      detailParts.push(
        `Product ID: ${existing.product_id ?? "-"} -> ${productId ?? "-"}`,
      );
    }

    if (
      columns.has("email") &&
      Object.prototype.hasOwnProperty.call(req.body, "email")
    ) {
      const email = req.body.email ? String(req.body.email).trim() : null;
      updates.push("Email = ?");
      values.push(email);
      detailParts.push(`Email: ${existing.email ?? "-"} -> ${email ?? "-"}`);
    }

    if (
      columns.has("products_supplied") &&
      Object.prototype.hasOwnProperty.call(req.body, "products_supplied")
    ) {
      const productsSupplied = normalizeProductsSupplied(
        req.body.products_supplied,
      );
      updates.push("Products_Supplied = ?");
      values.push(productsSupplied);
      detailParts.push(
        `Products: ${existing.products_supplied ?? "-"} -> ${productsSupplied ?? "-"}`,
      );
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid supplier fields provided" });
    }

    values.push(supplierId);
    await db.query(
      `UPDATE Suppliers SET ${updates.join(", ")} WHERE Supplier_ID = ?`,
      values,
    );

    const [updatedRows] = await db.query(
      `${buildSupplierSelect(columns)} WHERE Supplier_ID = ?`,
      [supplierId],
    );

    await logSupplierHistory({
      supplier_id: supplierId,
      supplier_name: updatedRows[0].supplier_name,
      action: "Supplier Updated",
      details: detailParts.join(" | ") || null,
    });

    res.json(updatedRows[0]);
  } catch (err) {
    console.error("Error updating supplier:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// POST /api/suppliers
router.post("/", async (req, res) => {
  try {
    const {
      supplier_name,
      contact_number,
      delivery_schedule,
      product_id: rawProductId,
      email,
      products_supplied,
    } = req.body;

    if (!supplier_name) {
      return res.status(400).json({ message: "supplier_name is required" });
    }

    const columns = await getSuppliersColumns();
    const fieldNames = ["SupplierName", "Contact_Number"];
    const values = [supplier_name, contact_number ?? null];

    if (columns.has("delivery_schedule")) {
      fieldNames.push("Delivery_Schedule");
      values.push(delivery_schedule ?? null);
    }

    if (columns.has("product_id")) {
      fieldNames.push("Product_ID");
      values.push(normalizeOptionalProductId(rawProductId));
    }

    if (columns.has("email")) {
      fieldNames.push("Email");
      values.push(email ?? null);
    }

    if (columns.has("products_supplied")) {
      fieldNames.push("Products_Supplied");
      values.push(normalizeProductsSupplied(products_supplied));
    }

    const placeholders = fieldNames.map(() => "?").join(", ");
    const [result] = await db.query(
      `INSERT INTO Suppliers (${fieldNames.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    const [createdRows] = await db.query(
      `${buildSupplierSelect(columns)}
       WHERE Supplier_ID = ?`,
      [result.insertId],
    );

    // ── Log the addition ──────────────────────────────────────────
    await logSupplierHistory({
      supplier_id: result.insertId,
      supplier_name,
      action: "Supplier Added",
      details:
        [
          contact_number ? `Contact: ${contact_number}` : null,
          email ? `Email: ${email}` : null,
          products_supplied ? `Products: ${products_supplied}` : null,
          delivery_schedule ? `Schedule: ${delivery_schedule}` : null,
        ]
          .filter(Boolean)
          .join(" | ") || null,
    });

    res.status(201).json(createdRows[0]);
  } catch (err) {
    console.error("Error creating supplier:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// DELETE /api/suppliers/:supplier_id
router.delete("/:supplier_id", async (req, res) => {
  try {
    const supplierId = Number(req.params.supplier_id);
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ message: "Invalid supplier_id" });
    }

    // ── Fetch name BEFORE deleting ────────────────────────────────
    const [[supplier]] = await db.query(
      `SELECT SupplierName AS supplier_name, Contact_Number AS contact_number
       FROM Suppliers WHERE Supplier_ID = ?`,
      [supplierId],
    );

    const [result] = await db.query(
      "DELETE FROM Suppliers WHERE Supplier_ID = ?",
      [supplierId],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // ── Log the removal ───────────────────────────────────────────
    if (supplier) {
      await logSupplierHistory({
        supplier_id: supplierId,
        supplier_name: supplier.supplier_name,
        action: "Supplier Removed",
        details: supplier.contact_number
          ? `Contact: ${supplier.contact_number}`
          : null,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting supplier:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// PATCH /api/suppliers/:supplier_id/products
// Called automatically after every PO is saved
router.patch("/:supplier_id/products", async (req, res) => {
  try {
    const supplierId = Number(req.params.supplier_id);
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ message: "Invalid supplier_id" });
    }

    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ message: "products must be a non-empty array" });
    }

    const columns = await getSuppliersColumns();
    if (!columns.has("products_supplied")) {
      return res
        .status(400)
        .json({ message: "products_supplied column does not exist in DB" });
    }

    // Fetch current supplier
    const [[existing]] = await db.query(
      `SELECT Supplier_ID AS supplier_id,
              SupplierName AS supplier_name,
              Products_Supplied AS products_supplied
       FROM Suppliers WHERE Supplier_ID = ?`,
      [supplierId],
    );

    if (!existing) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    // Parse existing products
    const existingProducts = existing.products_supplied
      ? existing.products_supplied
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Incoming products from PO items
    const incomingProducts = normalizeProductsSupplied(products)
      ? normalizeProductsSupplied(products).split(", ")
      : [];

    // Merge — no duplicates (case-insensitive check)
    const merged = [...existingProducts];
    const existingLower = existingProducts.map((e) => e.toLowerCase());

    for (const item of incomingProducts) {
      if (!existingLower.includes(item.toLowerCase())) {
        merged.push(item);
      }
    }

    const mergedString = merged.join(", ");

    // Only update if something actually changed
    if (mergedString === (existing.products_supplied ?? "").trim()) {
      const [rows] = await db.query(
        `${buildSupplierSelect(columns)} WHERE Supplier_ID = ?`,
        [supplierId],
      );
      return res.json(rows[0]);
    }

    await db.query(
      `UPDATE Suppliers SET Products_Supplied = ? WHERE Supplier_ID = ?`,
      [mergedString, supplierId],
    );

    // Log only the newly added ones
    const newlyAdded = incomingProducts.filter(
      (p) => !existingLower.includes(p.toLowerCase()),
    );

    if (newlyAdded.length > 0) {
      await logSupplierHistory({
        supplier_id: supplierId,
        supplier_name: existing.supplier_name,
        action: "Products Updated via PO",
        details: `Added: ${newlyAdded.join(", ")}`,
      });
    }

    const [updatedRows] = await db.query(
      `${buildSupplierSelect(columns)} WHERE Supplier_ID = ?`,
      [supplierId],
    );

    res.json(updatedRows[0]);
  } catch (err) {
    console.error("PATCH /suppliers/:id/products error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

// DELETE /api/suppliers/:supplier_id/products/:product_name
// Called when staff clicks × on a product chip in the supplier table
router.delete("/:supplier_id/products/:product_name", async (req, res) => {
  try {
    const supplierId = Number(req.params.supplier_id);
    const productName = decodeURIComponent(req.params.product_name).trim();

    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ message: "Invalid supplier_id" });
    }
    if (!productName) {
      return res.status(400).json({ message: "product_name is required" });
    }

    const columns = await getSuppliersColumns();

    const [[existing]] = await db.query(
      `SELECT Supplier_ID AS supplier_id,
              SupplierName AS supplier_name,
              Products_Supplied AS products_supplied
       FROM Suppliers WHERE Supplier_ID = ?`,
      [supplierId],
    );

    if (!existing) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const existingProducts = existing.products_supplied
      ? existing.products_supplied
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Remove the product (case-insensitive)
    const updated = existingProducts
      .filter((p) => p.toLowerCase() !== productName.toLowerCase())
      .join(", ");

    await db.query(
      `UPDATE Suppliers SET Products_Supplied = ? WHERE Supplier_ID = ?`,
      [updated || null, supplierId],
    );

    await logSupplierHistory({
      supplier_id: supplierId,
      supplier_name: existing.supplier_name,
      action: "Product Removed from Supplier",
      details: `Removed: ${productName}`,
    });

    const [updatedRows] = await db.query(
      `${buildSupplierSelect(columns)} WHERE Supplier_ID = ?`,
      [supplierId],
    );

    res.json(updatedRows[0]);
  } catch (err) {
    console.error("DELETE /suppliers/:id/products/:name error:", err);
    res.status(500).json({ message: "DB error", error: err.message });
  }
});

module.exports = router;
