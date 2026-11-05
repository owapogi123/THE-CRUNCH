"use strict";

const VERSION = "2026-11-05_password-reset-digest-width";
const TARGET_LENGTH = 64;

async function loadColumn(connection) {
  const [rows] = await connection.query(
    `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = 'users'
        AND LOWER(COLUMN_NAME) = 'password_reset_code'
      LIMIT 1`,
  );
  return rows[0] || null;
}

async function up(connection, { log = console } = {}) {
  const column = await loadColumn(connection);
  if (!column) {
    await connection.query(
      "ALTER TABLE `users` ADD COLUMN `password_reset_code` VARCHAR(64) NULL",
    );
    log.log("Migration: added users.password_reset_code for password-reset digests.");
    return;
  }

  const dataType = String(column.DATA_TYPE || "").trim().toLowerCase();
  if (dataType !== "varchar") {
    const error = new Error(
      "users.password_reset_code is not VARCHAR and requires manual review.",
    );
    error.code = "DB_MIGRATION_REVIEW_REQUIRED";
    throw error;
  }

  const currentLength = Number(column.CHARACTER_MAXIMUM_LENGTH || 0);
  const nullable = String(column.IS_NULLABLE || "").toUpperCase() === "YES";
  if (currentLength === TARGET_LENGTH && nullable) return;

  await connection.query(
    "ALTER TABLE `users` MODIFY COLUMN `password_reset_code` VARCHAR(64) NULL",
  );
  log.log("Migration: widened users.password_reset_code for HMAC-SHA256 digests.");
}

module.exports = {
  TARGET_LENGTH,
  VERSION,
  loadColumn,
  up,
};
