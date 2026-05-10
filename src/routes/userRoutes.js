const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";
const STAFF_FIELD_MAX_LENGTH = 100;
const STAFF_NAME_MIN_LENGTH = 2;
const STAFF_PASSWORD_MIN_LENGTH = 8;
const STAFF_ROLES = [
  "administrator",
  "cashier",
  "cook",
  "inventory_manager",
];
const STAFF_NAME_PATTERN = /^[A-Za-z][A-Za-z.' -]*[A-Za-z.]$|^[A-Za-z.]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

function normalizeStaffName(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error("Full name is required.");
  }
  if (normalized.length < STAFF_NAME_MIN_LENGTH) {
    throw new Error("Full name must be at least 2 characters.");
  }
  if (normalized.length > STAFF_FIELD_MAX_LENGTH) {
    throw new Error("Full name must not exceed 100 characters.");
  }
  if (!STAFF_NAME_PATTERN.test(normalized) || !/[A-Za-z]/.test(normalized)) {
    throw new Error(
      "Full name may only use letters, spaces, apostrophes, hyphens, and periods.",
    );
  }
  return normalized;
}

function normalizeStaffEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("Email is required.");
  }
  if (normalized.length > STAFF_FIELD_MAX_LENGTH) {
    throw new Error("Email must not exceed 100 characters.");
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error("Please enter a valid email address.");
  }
  return normalized;
}

function normalizeStaffPassword(value) {
  const normalized = String(value ?? "");
  if (!normalized.trim()) {
    throw new Error("Password is required.");
  }
  if (normalized.length < STAFF_PASSWORD_MIN_LENGTH) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (normalized.length > STAFF_FIELD_MAX_LENGTH) {
    throw new Error("Password must not exceed 100 characters.");
  }
  if (!PASSWORD_PATTERN.test(normalized)) {
    throw new Error("Password must include at least 1 letter and 1 number.");
  }
  return normalized;
}

function normalizeStaffRole(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("Role is required.");
  }
  if (!STAFF_ROLES.includes(normalized)) {
    throw new Error("Invalid role");
  }
  return normalized;
}

// ─────────────────────────────────────────────
// MIDDLEWARE - Admin only
// ─────────────────────────────────────────────
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "administrator") {
      return res.status(403).json({ message: "Administrator access required" });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ─────────────────────────────────────────────
// GET /api/users/staff — get all staff accounts
// ─────────────────────────────────────────────
router.get("/staff", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, role, created_at
       FROM users
       WHERE role != 'customer'
       ORDER BY role, username`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/users/staff/create — create staff
// ─────────────────────────────────────────────
router.post("/staff/create", verifyAdmin, async (req, res) => {
  try {
    const username = normalizeStaffName(req.body?.username);
    const email = normalizeStaffEmail(req.body?.email);
    const password = normalizeStaffPassword(req.body?.password);
    const role = normalizeStaffRole(req.body?.role);

    // Check duplicate
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username],
    );
    if (existing.length > 0) {
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    }

    // Hash password then insert
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [username, email, hashedPassword, role],
    );

    res.status(201).json({
      message: "Staff account created successfully",
      userId: result.insertId,
      role,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (
        err.message === "Full name is required." ||
        err.message === "Full name must be at least 2 characters." ||
        err.message === "Full name must not exceed 100 characters." ||
        err.message ===
          "Full name may only use letters, spaces, apostrophes, hyphens, and periods." ||
        err.message === "Email is required." ||
        err.message === "Email must not exceed 100 characters." ||
        err.message === "Please enter a valid email address." ||
        err.message === "Password is required." ||
        err.message === "Password must be at least 8 characters." ||
        err.message === "Password must not exceed 100 characters." ||
        err.message === "Password must include at least 1 letter and 1 number." ||
        err.message === "Role is required." ||
        err.message === "Invalid role"
      ) {
        return res.status(400).json({ message: err.message });
      }
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/users/staff/:id — delete staff
// ─────────────────────────────────────────────
router.delete("/staff/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.userId) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account" });
    }

    // Check if user exists
    const [existing] = await db.query("SELECT id FROM users WHERE id = ?", [
      id,
    ]);
    if (existing.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await db.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
