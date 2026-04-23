const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const CUSTOMER_ROLES = new Set(["customer", "user"]);
const onlineStaffSessions = new Map();

function isStaffRole(role) {
  return !!role && !CUSTOMER_ROLES.has(String(role).toLowerCase());
}

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

function removeExpiredStaffSessions() {
  const now = Date.now();
  for (const [userId, session] of onlineStaffSessions.entries()) {
    if (session.expiresAt <= now) onlineStaffSessions.delete(userId);
  }
}

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
    if (isStaffRole(user.role)) {
      const decodedToken = jwt.decode(token);
      const expiresAt =
        decodedToken && typeof decodedToken.exp === "number"
          ? decodedToken.exp * 1000
          : Date.now() + 60 * 60 * 1000;

      onlineStaffSessions.set(String(user.id), {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        timeIn: new Date().toISOString(),
        expiresAt,
      });
    }

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

router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    if (isStaffRole(decoded.role)) {
      onlineStaffSessions.delete(String(decoded.userId));
    }

    res.json({ message: "Logout successful" });
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
});

router.get("/attendance/online-staff", verifyAdmin, (req, res) => {
  removeExpiredStaffSessions();

  const records = Array.from(onlineStaffSessions.values())
    .filter((session) => isStaffRole(session.role))
    .sort((a, b) => a.username.localeCompare(b.username));

  res.json(records);
});

module.exports = router;
