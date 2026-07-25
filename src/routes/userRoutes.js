const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";
const STAFF_FIELD_MAX_LENGTH = 100;
const STAFF_NAME_MIN_LENGTH = 2;
const STAFF_PASSWORD_MIN_LENGTH = 8;
const ASSIGNABLE_STAFF_ROLES = [
  "administrator",
  "cashier",
  "inventory_manager",
];
const STAFF_NAME_PATTERN = /^[A-Za-z][A-Za-z.' -]*[A-Za-z.]$|^[A-Za-z.]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const CUSTOMER_ROLES = new Set(["customer", "user"]);

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
  if (!ASSIGNABLE_STAFF_ROLES.includes(normalized)) {
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

const verifyEmployee = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const userId = Number(decoded.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const [rows] = await db.query(
      `SELECT id, username, email, role, password_hash
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [userId],
    );
    const account = rows[0];
    if (!account) {
      return res.status(401).json({ message: "Account not found" });
    }
    if (CUSTOMER_ROLES.has(String(account.role || "").toLowerCase())) {
      return res.status(403).json({ message: "Employee account required" });
    }

    req.user = decoded;
    req.employeeAccount = account;
    next();
  } catch (error) {
    console.error("Employee account verification failed:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

function shapeOwnAccount(account) {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    role: account.role,
  };
}

router.get("/me", verifyEmployee, (req, res) => {
  res.json(shapeOwnAccount(req.employeeAccount));
});

router.put("/me", verifyEmployee, async (req, res) => {
  try {
    const username = normalizeStaffName(req.body?.username);
    const [duplicates] = await db.query(
      `SELECT id
         FROM users
        WHERE LOWER(username) = LOWER(?) AND id <> ?
        LIMIT 1`,
      [username, req.employeeAccount.id],
    );
    if (duplicates.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    await db.query("UPDATE users SET username = ? WHERE id = ?", [
      username,
      req.employeeAccount.id,
    ]);
    res.json(
      shapeOwnAccount({
        ...req.employeeAccount,
        username,
      }),
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Full name")) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/me/password", verifyEmployee, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = normalizeStaffPassword(req.body?.newPassword);
    const confirmPassword = String(req.body?.confirmPassword ?? "");

    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required." });
    }
    if (currentPassword.length > STAFF_FIELD_MAX_LENGTH) {
      return res.status(400).json({ message: "Current password is invalid." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match." });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from the current password.",
      });
    }

    const currentPasswordMatches = await bcrypt.compare(
      currentPassword,
      req.employeeAccount.password_hash,
    );
    if (!currentPasswordMatches) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [
      passwordHash,
      req.employeeAccount.id,
    ]);
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Password")) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

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
