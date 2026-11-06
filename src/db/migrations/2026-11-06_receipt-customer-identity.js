"use strict";

const VERSION = "2026-11-06_receipt-customer-identity";
const COLUMNS = Object.freeze({
  sold_to_name: "VARCHAR(150) NULL",
  cashier_name: "VARCHAR(150) NULL",
});

async function up(connection, { log = console } = {}) {
  const [rows] = await connection.query(
    `SELECT LOWER(COLUMN_NAME) AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = 'receipt_snapshots'`,
  );
  const existing = new Set(rows.map((row) => String(row.column_name).toLowerCase()));
  for (const [name, definition] of Object.entries(COLUMNS)) {
    if (existing.has(name)) continue;
    await connection.query(`ALTER TABLE \`receipt_snapshots\` ADD COLUMN \`${name}\` ${definition}`);
    log.log(`Migration: added receipt_snapshots.${name}.`);
  }
}

module.exports = { COLUMNS, VERSION, up };
