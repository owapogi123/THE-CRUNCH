const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");

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

function getResetExpiryDate() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

function toBooleanFlag(value) {
  return Number(value) === 1 || value === true;
}

async function sendVerificationEmailOrThrow({
  email,
  otpCode,
  name,
}) {
  if (!email) {
    throw new Error("Recipient email is required for OTP delivery");
  }

  if (!otpCode) {
    throw new Error("Generated OTP code is missing");
  }

  try {
    await sendVerificationEmail({
      to: email,
      code: otpCode,
      customerName: name,
    });
  } catch (emailError) {
    console.error("OTP email failed:", emailError);
    throw emailError;
  }
}

async function ensurePasswordResetColumns() {
  const [codeColumns] = await db.query(
    `SHOW COLUMNS FROM users LIKE 'password_reset_code'`,
  );
  if (codeColumns.length === 0) {
    await db.query(
      `ALTER TABLE users
       ADD COLUMN password_reset_code VARCHAR(10) NULL`,
    );
  }

  const [expiryColumns] = await db.query(
    `SHOW COLUMNS FROM users LIKE 'password_reset_expires'`,
  );
  if (expiryColumns.length === 0) {
    await db.query(
      `ALTER TABLE users
       ADD COLUMN password_reset_expires DATETIME NULL`,
    );
  }
}

router.post("/register", async (req, res) => {
  try {
    const rawEmail = String(req.body?.email || req.body?.Email || "").trim();
    const email = normalizeEmail(rawEmail);
    const name = String(
      req.body?.name ||
      req.body?.fullName ||
      req.body?.customerName ||
      req.body?.username ||
      "Customer",
    ).trim();
    const password = String(req.body?.password || "").trim();
    const userName = name || "Customer";

    if (!email) {
      return res.status(400).json({ message: "Email is required for OTP." });
    }

    if (!userName || !password) {
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
      [email, userName],
    );
    if (existing.length > 0) {
      return res.status(400).json({
        message: "Email or username already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otpCode = generateVerificationCode();
    const verificationExpires = getVerificationExpiryDate();

    if (!otpCode) {
      return res.status(500).json({
        message: "Failed to generate OTP.",
      });
    }

    try {
      await sendVerificationEmailOrThrow({
        email,
        otpCode,
        name: userName,
      });
    } catch (emailError) {
      // Resend free/testing mode only allows sending to the verified account email unless a custom domain is verified.
      console.error("OTP email failed:", emailError);
      return res.status(500).json({
        message: "Failed to send OTP. Please try again.",
      });
    }

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
        email,
        hashedPassword,
        userRole,
        0,
        otpCode,
        verificationExpires,
      ],
    );

    return res.status(201).json({
      message: "Verification code sent. Complete email verification to activate your account",
      userId: result.insertId,
      role: userRole,
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
    const normalizedRole = String(user.role || "").trim().toLowerCase();
    if (normalizedRole === "customer" && !emailVerified) {
      return res.status(403).json({
        message: "Please verify your email before signing in",
        requiresEmailVerification: true,
        email: user.email,
      });
    }

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

    if (!verificationCode) {
      return res.status(500).json({
        message: "Failed to generate verification code",
      });
    }

    await db.query(
      `UPDATE users
       SET email_verification_code = ?,
           email_verification_expires = ?
      WHERE id = ?`,
      [verificationCode, verificationExpires, user.id],
    );

    try {
      await sendVerificationEmailOrThrow({
        email: user.email,
        otpCode: verificationCode,
        name: user.username,
      });
    } catch (emailError) {
      return res.status(500).json({
        message: "OTP email resend failed",
        error: emailError.message,
      });
    }

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

router.post("/forgot-password", async (req, res) => {
  try {
    await ensurePasswordResetColumns();
    const email = normalizeEmail(req.body?.email);
    const genericMessage =
      "If that email is registered, a reset code has been sent.";

    if (!email) {
      return res.json({ message: genericMessage });
    }

    const [rows] = await db.query(
      `SELECT id, username, email
         FROM users
        WHERE email = ?
        LIMIT 1`,
      [email],
    );

    if (rows.length === 0) {
      return res.json({ message: genericMessage });
    }

    const user = rows[0];
    const resetCode = generateVerificationCode();
    const resetExpires = getResetExpiryDate();

    await db.query(
      `UPDATE users
       SET password_reset_code = ?,
           password_reset_expires = ?
       WHERE id = ?`,
      [resetCode, resetExpires, user.id],
    );

    try {
      await sendPasswordResetEmail({
        to: user.email,
        code: resetCode,
        customerName: user.username,
      });
    } catch (emailError) {
      console.error("Password reset email failed:", emailError);
    }

    return res.json({ message: genericMessage });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    await ensurePasswordResetColumns();
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "").trim();

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        message: "Email, reset code, and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    const [rows] = await db.query(
      `SELECT id, password_reset_code, password_reset_expires
         FROM users
        WHERE email = ?
        LIMIT 1`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "Invalid reset code or email" });
    }

    const user = rows[0];
    if (!user.password_reset_code || user.password_reset_code !== code) {
      return res.status(400).json({ message: "Invalid reset code or email" });
    }

    const expiresAt = user.password_reset_expires
      ? new Date(user.password_reset_expires)
      : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "Reset code has expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.query(
      `UPDATE users
       SET password_hash = ?,
           password_reset_code = NULL,
           password_reset_expires = NULL
       WHERE id = ?`,
      [passwordHash, user.id],
    );

    return res.json({ message: "Password reset successfully" });
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
