"use strict";

function createSchemaCompatibilityError(message, details = {}) {
  const error = new Error(
    `${message} Run the approved database migration or administrative setup before retrying.`,
  );
  error.code = "DB_SCHEMA_INCOMPATIBLE";
  error.details = details;
  return error;
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

async function assertTableColumns(db, tableContracts, context = "Database schema") {
  const entries = Object.entries(tableContracts || {});
  if (entries.length === 0) return true;

  const tableNames = entries.map(([tableName]) => tableName);
  const [rows] = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (?)`,
    [tableNames],
  );

  const actual = new Map();
  for (const row of rows) {
    const tableName = normalizeIdentifier(row.TABLE_NAME ?? row.table_name);
    const columnName = normalizeIdentifier(row.COLUMN_NAME ?? row.column_name);
    if (!actual.has(tableName)) actual.set(tableName, new Set());
    actual.get(tableName).add(columnName);
  }

  const missing = [];
  for (const [tableName, columns] of entries) {
    const normalizedTable = normalizeIdentifier(tableName);
    const actualColumns = actual.get(normalizedTable);
    if (!actualColumns) {
      missing.push(`${tableName} (table)`);
      continue;
    }
    for (const columnName of columns) {
      if (!actualColumns.has(normalizeIdentifier(columnName))) {
        missing.push(`${tableName}.${columnName}`);
      }
    }
  }

  if (missing.length > 0) {
    throw createSchemaCompatibilityError(
      `${context} is missing required objects: ${missing.join(", ")}.`,
      { missing },
    );
  }

  return true;
}

module.exports = {
  assertTableColumns,
  createSchemaCompatibilityError,
  normalizeIdentifier,
};
