const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { sendVerificationEmail } = require("../services/emailService");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function generateVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function getVerificationExpiryDate() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

function toBooleanFlag(value) {
  return Number(value) === 1 || value === true;
}

router.post("/register", async (req, res) => {
  try {
    const { name, username, password, email } = req.body;
    const userName = String(name || username || "").trim();
    const normalizedEmail = normalizeEmail(email);

    if (!userName || !password || !normalizedEmail) {
      return res.status(400).json({
        message: "Name, email, and password required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const userRole = "customer";

    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [normalizedEmail, userName],
    );
    if (existing.length > 0) {
      return res.status(400).json({
        message: "Email or username already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationExpires = getVerificationExpiryDate();

    const [result] = await db.query(
      `INSERT INTO users (
         username,
         email,
         password_hash,
         role,
         email_verified,
         email_verification_code,
         email_verification_expires
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userName,
        normalizedEmail,
        hashedPassword,
        userRole,
        0,
        verificationCode,
        verificationExpires,
      ],
    );

    let emailDeliveryFailed = false;
    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        code: verificationCode,
        customerName: userName,
      });
    } catch (emailError) {
      emailDeliveryFailed = true;
      console.error(
        "Failed to send verification email:",
        emailError && emailError.message ? emailError.message : emailError,
      );
    }

    return res.status(201).json({
      message: "User registered successfully",
      userId: result.insertId,
      role: userRole,
      requiresEmailVerification: true,
      emailDeliveryFailed,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = String(email || username || "").trim();
    const normalizedLoginIdentifier = normalizeEmail(loginIdentifier);

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

    const [rows] = await db.query(
      `SELECT id, username, email, password_hash, role, email_verified
       FROM users
       WHERE email = ? OR username = ?`,
      [normalizedLoginIdentifier, loginIdentifier],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const emailVerified = toBooleanFlag(user.email_verified);
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        email_verified: emailVerified,
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    return res.json({
      message: "Login successful",
      token,
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      email_verified: emailVerified,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !code) {
      return res.status(400).json({
        message: "Email and verification code are required",
      });
    }

    const [rows] = await db.query(
      `SELECT id, email_verified, email_verification_code, email_verification_expires
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    if (toBooleanFlag(user.email_verified)) {
      return res.json({
        message: "Email is already verified",
        email_verified: true,
      });
    }

    if (!user.email_verification_code || user.email_verification_code !== code) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    const expiresAt = user.email_verification_expires
      ? new Date(user.email_verification_expires)
      : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "Verification code has expired" });
    }

    await db.query(
      `UPDATE users
       SET email_verified = 1,
           email_verification_code = NULL,
           email_verification_expires = NULL
       WHERE id = ?`,
      [user.id],
    );

    return res.json({
      message: "Email verified successfully",
      email_verified: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const [rows] = await db.query(
      `SELECT id, username, email, email_verified
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    if (toBooleanFlag(user.email_verified)) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const verificationCode = generateVerificationCode();
    const verificationExpires = getVerificationExpiryDate();

    await db.query(
      `UPDATE users
       SET email_verification_code = ?,
           email_verification_expires = ?
       WHERE id = ?`,
      [verificationCode, verificationExpires, user.id],
    );

    await sendVerificationEmail({
      to: user.email,
      code: verificationCode,
      customerName: user.username,
    });

    return res.json({
      message: "Verification code resent successfully",
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    return res.json({ message: "Logout successful" });
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
});

module.exports = router;
