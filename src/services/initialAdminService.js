"use strict";

const bcrypt = require("bcryptjs");

const ADMIN_PASSWORD_MIN_LENGTH = 12;
const ADMIN_PASSWORD_MAX_LENGTH = 100;
const ADMIN_NAME_PATTERN = /^[A-Za-z][A-Za-z.' -]*[A-Za-z.]$|^[A-Za-z.]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function configurationError(message) {
  const error = new Error(message);
  error.code = "INITIAL_ADMIN_CONFIG_ERROR";
  return error;
}

function readInitialAdministratorConfig(env = process.env) {
  const username = String(env.INITIAL_ADMIN_USERNAME || "").trim();
  const email = String(env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(env.INITIAL_ADMIN_PASSWORD || "");

  const missing = [];
  if (!username) missing.push("INITIAL_ADMIN_USERNAME");
  if (!email) missing.push("INITIAL_ADMIN_EMAIL");
  if (!password) missing.push("INITIAL_ADMIN_PASSWORD");
  if (missing.length > 0) {
    throw configurationError(
      `No Administrator account exists. Set ${missing.join(", ")} for the one-time fresh-database setup.`,
    );
  }

  if (
    username.length < 2 ||
    username.length > 100 ||
    !ADMIN_NAME_PATTERN.test(username)
  ) {
    throw configurationError(
      "INITIAL_ADMIN_USERNAME must be 2-100 characters and use only letters, spaces, apostrophes, hyphens, and periods.",
    );
  }
  if (email.length > 100 || !EMAIL_PATTERN.test(email)) {
    throw configurationError("INITIAL_ADMIN_EMAIL must be a valid email address of at most 100 characters.");
  }
  if (
    password.length < ADMIN_PASSWORD_MIN_LENGTH ||
    password.length > ADMIN_PASSWORD_MAX_LENGTH ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw configurationError(
      "INITIAL_ADMIN_PASSWORD must be 12-100 characters and include uppercase, lowercase, number, and special characters.",
    );
  }

  return { username, email, password };
}

async function ensureLegacyAdministrator(connection, administrator) {
  const [legacyRows] = await connection.query(
    "SELECT Admin_ID FROM Admin WHERE Admin_ID = ? OR Email = ? LIMIT 1",
    [administrator.id, administrator.email],
  );
  if (legacyRows.length > 0) return false;

  await connection.query(
    `INSERT INTO Admin (Admin_ID, UserName, Email, Password)
     VALUES (?, ?, ?, ?)`,
    [
      administrator.id,
      administrator.username,
      administrator.email,
      administrator.password_hash,
    ],
  );
  return true;
}

async function ensureInitialAdministrator(
  connection,
  { env = process.env, log = console } = {},
) {
  const [existingRows] = await connection.query(
    `SELECT id, username, email, password_hash
       FROM users
      WHERE role = 'administrator'
      ORDER BY id ASC
      LIMIT 1`,
  );

  if (existingRows.length > 0) {
    const legacyCreated = await ensureLegacyAdministrator(
      connection,
      existingRows[0],
    );
    log.log(
      legacyCreated
        ? "Existing Administrator linked to the legacy staff table."
        : "Initial Administrator already exists; bootstrap skipped.",
    );
    return { created: false, legacyCreated };
  }

  const config = readInitialAdministratorConfig(env);
  const [duplicates] = await connection.query(
    `SELECT id
       FROM users
      WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
      LIMIT 1`,
    [config.username, config.email],
  );
  if (duplicates.length > 0) {
    throw configurationError(
      "The initial Administrator username or email is already used by a non-Administrator account.",
    );
  }

  const passwordHash = await bcrypt.hash(config.password, 12);
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [result] = await connection.query(
      `INSERT INTO users (username, email, password_hash, role, email_verified)
       VALUES (?, ?, ?, 'administrator', 1)`,
      [config.username, config.email, passwordHash],
    );
    await ensureLegacyAdministrator(connection, {
      id: result.insertId,
      username: config.username,
      email: config.email,
      password_hash: passwordHash,
    });
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  }

  log.log("Initial Administrator account created with a bcrypt password hash.");
  return { created: true, legacyCreated: true };
}

module.exports = {
  ensureInitialAdministrator,
  readInitialAdministratorConfig,
};
