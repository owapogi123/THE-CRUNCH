"use strict";

require("dotenv").config();

const mysql = require("mysql2/promise");
const {
  getDatabaseConfig,
  getDatabaseSslOptions,
} = require("../src/config/databaseEnvironment");

const temporaryDatabase = `the_crunch_stockmanager_verify_${Date.now()}`;
process.env.DB_NAME = temporaryDatabase;

const { setup } = require("../src/db/setup");
const db = require("../src/config/db");
const { ensureProductSchema } = require("../src/services/productSchemaService");
const {
  initializeStockManagerSchema,
} = require("../src/services/stockManagerSchemaService");

function connectionOptions() {
  const dbConfig = getDatabaseConfig();
  const sslOptions = getDatabaseSslOptions(dbConfig);
  return {
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port,
    ...(sslOptions ? { ssl: sslOptions } : {}),
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
