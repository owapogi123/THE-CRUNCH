"use strict";

const bcrypt = require("bcryptjs");

const BOOTSTRAP_VARIABLES = Object.freeze([
  "BOOTSTRAP_ADMIN_USERNAME",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
]);

function bootstrapConfigError(message) {
  const error = new Error(message);
  error.code = "ADMIN_BOOTSTRAP_CONFIG_ERROR";
  return error;
}

function isPresent(value) {
  return typeof value === "string" && value.trim() !== "";
}

function readBootstrapAdminConfig(env = process.env) {
  const present = BOOTSTRAP_VARIABLES.filter((key) => isPresent(env[key]));

  if (present.length > 0 && present.length !== BOOTSTRAP_VARIABLES.length) {
    throw bootstrapConfigError(
      "Administrator bootstrap configuration is incomplete. Set all three " +
        "BOOTSTRAP_ADMIN_* variables or none of them.",
    );
  }

  if (present.length === 0) return null;

  const username = env.BOOTSTRAP_ADMIN_USERNAME.trim();
  const email = env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
    throw bootstrapConfigError(
      "BOOTSTRAP_ADMIN_USERNAME must be 3-50 characters and use only " +
        "letters, numbers, period, underscore, or hyphen.",
    );
  }
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw bootstrapConfigError(
      "BOOTSTRAP_ADMIN_EMAIL must be a valid email address of at most 150 characters.",
    );
  }
  // Temporary administrator bootstrap for isolated testing only.
  if (password.length < 1 || password.length > 128) {
    throw bootstrapConfigError(
      "BOOTSTRAP_ADMIN_PASSWORD must contain between 1 and 128 characters.",
    );
  }

  return { email, password, username };
}

async function bootstrapAdministrator(
  connection,
  { env = process.env, log = console, bcryptRounds = 12 } = {},
) {
  const config = readBootstrapAdminConfig(env);
  const [existing] = await connection.query(
    "SELECT id FROM users WHERE role = 'administrator' LIMIT 1",
  );

  if (existing.length > 0) {
    return { created: false, userId: Number(existing[0].id) };
  }

  if (!config) {
    throw bootstrapConfigError(
      "No administrator exists. Set BOOTSTRAP_ADMIN_USERNAME, " +
        "BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD for the initial run.",
    );
  }

  const [conflicts] = await connection.query(
    "SELECT id, role FROM users WHERE username = ? OR email = ? LIMIT 1",
    [config.username, config.email],
  );
  if (conflicts.length > 0) {
    throw bootstrapConfigError(
      "The bootstrap administrator username or email is already assigned " +
        "to a non-administrator account.",
    );
  }

  const passwordHash = await bcrypt.hash(config.password, bcryptRounds);
  const [result] = await connection.query(
    "INSERT INTO users " +
      "(username, email, password_hash, role, email_verified, is_active) " +
      "VALUES (?, ?, ?, 'administrator', 1, 1)",
    [config.username, config.email, passwordHash],
  );

  log.log("Created the initial administrator account from secure bootstrap configuration.");
  return { created: true, userId: Number(result.insertId) };
}

module.exports = {
  BOOTSTRAP_VARIABLES,
  bootstrapAdministrator,
  readBootstrapAdminConfig,
};
