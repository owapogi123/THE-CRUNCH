"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const temporaryDatabase = `the_crunch_stockmanager_verify_${Date.now()}`;
process.env.DB_NAME = temporaryDatabase;

const { setup } = require("../src/db/setup");
const db = require("../src/config/db");
const { ensureProductSchema } = require("../src/services/productSchemaService");
const {
  initializeStockManagerSchema,
} = require("../src/services/stockManagerSchemaService");

function connectionOptions() {
  return {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    ...(process.env.DB_SSL_CA_PATH
      ? {
          ssl: {
            ca: fs.readFileSync(
              path.resolve(process.env.DB_SSL_CA_PATH),
              "utf8",
            ),
            rejectUnauthorized: true,
          },
        }
      : {}),
  };
}

async function main() {
  let adminConnection;
  try {
    await setup({ log: { log() {}, error: console.error } });
    await ensureProductSchema(db);
    await initializeStockManagerSchema(db);

    const [[categories]] = await db.query(
      "SELECT COUNT(*) AS count FROM inventory_categories",
    );
    const [[units]] = await db.query(
      "SELECT COUNT(*) AS count FROM inventory_units",
    );
    const [requiredTables] = await db.query(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (
            'Inventory',
            'Suppliers',
            'inventory_categories',
            'inventory_units',
            'purchase_orders',
            'purchase_order_items'
          )`,
    );

    if (requiredTables.length !== 6) {
      throw new Error("Fresh setup did not create all Stock Manager tables");
    }
    if (Number(categories.count) < 5 || Number(units.count) < 8) {
      throw new Error("Fresh setup did not seed categories and units");
    }

    console.log(
      JSON.stringify({
        ok: true,
        requiredTables: requiredTables.length,
        inventoryCategories: Number(categories.count),
        inventoryUnits: Number(units.count),
      }),
    );
  } finally {
    await db.end().catch(() => undefined);
    adminConnection = await mysql.createConnection(connectionOptions());
    await adminConnection.query(`DROP DATABASE IF EXISTS \`${temporaryDatabase}\``);
    await adminConnection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
