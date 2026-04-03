const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

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
    const { username, email, password, role } = req.body;

    // Validate all fields present
    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Only allow staff roles
    const staffRoles = [
      "administrator",
      "cashier",
      "cook",
      "inventory_manager",
    ];
    if (!staffRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

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
