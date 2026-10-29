"use strict";

const { EXPECTED_INDEXES } = require("../../services/schemaCompatibilityService");

const VERSION = "2026-10-30_deployment-schema-alignment";

function migrationReviewError(message, details = {}) {
  const error = new Error(message);
  error.code = "DB_MIGRATION_REVIEW_REQUIRED";
  error.details = details;
  return error;
}

function quoteIdentifier(value) {
  const identifier = String(value || "");
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw migrationReviewError(`Unsafe SQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
}

async function getColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) = LOWER(?)
        AND LOWER(COLUMN_NAME) = LOWER(?)
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows[0] || null;
}

async function assertZero(connection, sql, params, message, details = {}) {
  const [[row]] = await connection.query(sql, params);
  const count = Number(row?.invalid_count);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw migrationReviewError(`${message} Preflight returned an invalid count.`, details);
  }
  if (count > 0) {
    throw migrationReviewError(message, { ...details, invalidCount: count });
  }
}

async function ensureInventoryUnit(connection, log) {
  const column = await getColumn(connection, "Inventory", "unit");
  if (!column) {
    await connection.query(
      "ALTER TABLE `Inventory` ADD COLUMN `unit` VARCHAR(30) NOT NULL DEFAULT 'piece'",
    );
    log.log("Migration: added Inventory.unit.");
    return;
  }

  const alreadyCanonical =
    String(column.COLUMN_TYPE).toLowerCase() === "varchar(30)" &&
    String(column.IS_NULLABLE).toUpperCase() === "NO" &&
    String(column.COLUMN_DEFAULT ?? "") === "piece";
  if (alreadyCanonical) return;

  await assertZero(
    connection,
    `SELECT COUNT(*) AS invalid_count
       FROM Inventory
      WHERE unit IS NULL OR CHAR_LENGTH(unit) > 30`,
    [],
    "Inventory.unit contains NULL or over-length values; review the records before changing the column definition.",
    { table: "Inventory", column: "unit" },
  );
  await connection.query(
    "ALTER TABLE `Inventory` MODIFY COLUMN `unit` VARCHAR(30) NOT NULL DEFAULT 'piece'",
  );
  log.log("Migration: aligned Inventory.unit definition.");
}

async function syncProductsFromMenu(connection) {
  await connection.query(
    `INSERT INTO products (id, name, price, quantity, description, item_type)
     SELECT
       m.Product_ID,
       COALESCE(NULLIF(TRIM(m.Product_Name), ''), CONCAT('Product #', m.Product_ID)),
       COALESCE(m.Price, 0),
       COALESCE(m.Stock, 0),
       NULL,
       CASE
         WHEN LOWER(TRIM(COALESCE(m.Promo, ''))) = 'raw_material'
           OR LOWER(TRIM(COALESCE(m.Category_Name, ''))) IN
             ('raw material', 'raw materials', 'sauces', 'ingredients', 'aromatics', 'supplies')
           THEN 'stock_item'
         ELSE 'menu_item'
       END
     FROM Menu m
     LEFT JOIN products p ON p.id = m.Product_ID
     WHERE p.id IS NULL`,
  );
}

async function ensureBatchesProductColumn(connection, log) {
  await syncProductsFromMenu(connection);
  await assertZero(
    connection,
    "SELECT COUNT(*) AS invalid_count FROM batches WHERE product_id IS NULL",
    [],
    "batches.product_id contains NULL values and cannot be made mandatory without a reviewed product mapping.",
    { table: "batches", column: "product_id" },
  );
  await assertZero(
    connection,
    `SELECT COUNT(*) AS invalid_count
       FROM batches b
       LEFT JOIN products p ON p.id = b.product_id
      WHERE b.product_id IS NOT NULL AND p.id IS NULL`,
    [],
    "Some batch product IDs do not exist in products; review product mirrors before changing the foreign key.",
    { table: "batches", column: "product_id", parent: "products.id" },
  );

  const column = await getColumn(connection, "batches", "product_id");
  if (!column) {
    throw migrationReviewError("batches.product_id is missing; run the canonical database setup first.");
  }
  if (
    String(column.COLUMN_TYPE).toLowerCase() !== "int" ||
    String(column.IS_NULLABLE).toUpperCase() !== "NO"
  ) {
    await connection.query(
      "ALTER TABLE `batches` MODIFY COLUMN `product_id` INT NOT NULL",
    );
    log.log("Migration: aligned batches.product_id definition.");
  }
}

async function foreignKeysForColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT kcu.CONSTRAINT_NAME, kcu.REFERENCED_TABLE_NAME,
            kcu.REFERENCED_COLUMN_NAME, rc.UPDATE_RULE, rc.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.TABLE_NAME = kcu.TABLE_NAME
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
        AND LOWER(kcu.TABLE_NAME) = LOWER(?)
        AND LOWER(kcu.COLUMN_NAME) = LOWER(?)
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName, columnName],
  );
  return rows;
}

function foreignKeyMatches(row, parentTable, parentColumn) {
  return (
    String(row.REFERENCED_TABLE_NAME).toLowerCase() === parentTable.toLowerCase() &&
    String(row.REFERENCED_COLUMN_NAME).toLowerCase() === parentColumn.toLowerCase() &&
    String(row.UPDATE_RULE).toUpperCase() === "RESTRICT" &&
    String(row.DELETE_RULE).toUpperCase() === "RESTRICT"
  );
}

async function ensureForeignKey(connection, definition, log) {
  const {
    table,
    column,
    constraint,
    parentTable,
    parentColumn,
  } = definition;
  let rows = await foreignKeysForColumn(connection, table, column);
  for (const row of rows) {
    if (foreignKeyMatches(row, parentTable, parentColumn)) continue;
    await connection.query(
      `ALTER TABLE ${quoteIdentifier(table)} DROP FOREIGN KEY ${quoteIdentifier(row.CONSTRAINT_NAME)}`,
    );
    log.log(`Migration: removed conflicting foreign key ${row.CONSTRAINT_NAME}.`);
  }

  rows = await foreignKeysForColumn(connection, table, column);
  if (rows.some((row) => foreignKeyMatches(row, parentTable, parentColumn))) return;
  await connection.query(
    `ALTER TABLE ${quoteIdentifier(table)}
       ADD CONSTRAINT ${quoteIdentifier(constraint)}
       FOREIGN KEY (${quoteIdentifier(column)})
       REFERENCES ${quoteIdentifier(parentTable)} (${quoteIdentifier(parentColumn)})
       ON UPDATE RESTRICT ON DELETE RESTRICT`,
  );
  log.log(`Migration: added foreign key ${constraint}.`);
}

async function loadIndexShapes(connection) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  );
  const groups = new Map();
  for (const row of rows) {
    const key = `${String(row.TABLE_NAME).toLowerCase()}|${String(row.INDEX_NAME).toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const shapes = new Set();
  const names = new Map();
  for (const rowsForIndex of groups.values()) {
    const ordered = rowsForIndex.sort(
      (a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX),
    );
    const table = String(ordered[0].TABLE_NAME).toLowerCase();
    const name = String(ordered[0].INDEX_NAME).toLowerCase();
    const unique = Number(ordered[0].NON_UNIQUE) === 0 ? "1" : "0";
    const columns = ordered.map((row) => String(row.COLUMN_NAME).toLowerCase()).join(",");
    shapes.add(`${table}|${unique}|${columns}`);
    names.set(`${table}|${name}`, `${table}|${unique}|${columns}`);
  }
  return { shapes, names };
}

async function ensureRequiredIndexes(connection, log) {
  let inventory = await loadIndexShapes(connection);
  for (const signature of EXPECTED_INDEXES) {
    const [table, indexName, unique, columnsCsv] = signature.split("|");
    const shape = `${table}|${unique}|${columnsCsv}`;
    if (inventory.shapes.has(shape)) continue;
    if (indexName === "primary") {
      throw migrationReviewError(
        `Primary key for ${table} does not match the canonical schema and requires manual review.`,
        { table, columns: columnsCsv },
      );
    }
    const nameKey = `${table}|${indexName}`;
    if (inventory.names.has(nameKey)) {
      throw migrationReviewError(
        `Index ${table}.${indexName} exists with a conflicting definition.`,
        { table, index: indexName },
      );
    }
    const columns = columnsCsv
      .split(",")
      .map(quoteIdentifier)
      .join(", ");
    await connection.query(
      `ALTER TABLE ${quoteIdentifier(table)} ADD ${unique === "1" ? "UNIQUE " : ""}INDEX ${quoteIdentifier(indexName)} (${columns})`,
    );
    log.log(`Migration: added required index ${table}.${indexName}.`);
    inventory = await loadIndexShapes(connection);
  }
}

async function up(connection, { log = console } = {}) {
  await ensureInventoryUnit(connection, log);
  await ensureBatchesProductColumn(connection, log);

  await assertZero(
    connection,
    `SELECT COUNT(*) AS invalid_count
       FROM kitchen_batches kb
       LEFT JOIN batches b ON b.batch_id = kb.storage_batch_id
      WHERE kb.storage_batch_id IS NOT NULL AND b.batch_id IS NULL`,
    [],
    "Some kitchen batch storage references are invalid; review them before adding referential constraints.",
    { table: "kitchen_batches", column: "storage_batch_id" },
  );
  await assertZero(
    connection,
    `SELECT COUNT(*) AS invalid_count
       FROM kitchen_batches kb
       LEFT JOIN products p ON p.id = kb.product_id
      WHERE kb.product_id IS NOT NULL AND p.id IS NULL`,
    [],
    "Some kitchen batch product references are invalid; review them before adding referential constraints.",
    { table: "kitchen_batches", column: "product_id" },
  );

  await ensureRequiredIndexes(connection, log);
  await ensureForeignKey(connection, {
    table: "batches",
    column: "product_id",
    constraint: "fk_batches_product",
    parentTable: "products",
    parentColumn: "id",
  }, log);
  await ensureForeignKey(connection, {
    table: "kitchen_batches",
    column: "storage_batch_id",
    constraint: "fk_kitchen_batches_storage_batch",
    parentTable: "batches",
    parentColumn: "batch_id",
  }, log);
  await ensureForeignKey(connection, {
    table: "kitchen_batches",
    column: "product_id",
    constraint: "fk_kitchen_batches_product",
    parentTable: "products",
    parentColumn: "id",
  }, log);
}

module.exports = {
  VERSION,
  migrationReviewError,
  up,
};
