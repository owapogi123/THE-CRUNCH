const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey"; // ⚠️ use .env in production

// ─────────────────────────────────────────────
// REGISTER - saves to unified users table
// ─────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, username, password, email, role } = req.body;
    const userName = name || username;

    if (!userName || !password || !email) {
      return res.status(400).json({
        message: "Name, email, and password required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    // Validate role — default to 'customer' if not provided
    const allowedRoles = [
      "administrator",
      "cashier",
      "cook",
      "inventory_manager",
      "customer",
    ];
    const userRole = "customer";

    // Check if email or username already exists
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, userName],
    );
    if (existing.length > 0) {
      return res.status(400).json({
        message: "Email or username already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into unified users table
    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, role) 
       VALUES (?, ?, ?, ?)`,
      [userName, email, hashedPassword, userRole],
    );

    res.status(201).json({
      message: "User registered successfully",
      userId: result.insertId,
      role: userRole,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────
// LOGIN - checks unified users table
// ─────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = (email || username || "").trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        message: "Email or username and password required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    // ✅ Single query — checks all roles at once 
    const [rows] = await db.query(
      `SELECT id, username, email, password_hash, role 
       FROM users 
       WHERE email = ? OR username = ?`,
      [loginIdentifier, loginIdentifier],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];

    // Validate password against password_hash
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Include role in JWT payload
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role, // ✅ role is now in the token
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    // ✅ Return role to frontend
    res.json({
      message: "Login successful",
      token: token,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role, // ✅ frontend uses this for routing
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
