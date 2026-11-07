"use strict";

const mysql = require("mysql2/promise");
const {
  getDatabaseConfig,
  getDatabaseSslOptions,
  getSafeDatabaseErrorDetails,
  validateDatabaseConfig,
} = require("../config/databaseEnvironment");
const deploymentSchemaAlignment = require("./migrations/2026-10-30_deployment-schema-alignment");
const inventoryChangeNotificationCategory = require("./migrations/2026-11-01_inventory-change-notification-category");
const purchaseOrderDeliveryDateNullable = require("./migrations/2026-11-01_purchase-order-delivery-date-nullable");
const thirdPartyReferenceReuse = require("./migrations/2026-11-03_third-party-reference-reuse");
const orderInventoryDeductionSnapshots = require("./migrations/2026-11-04_order-inventory-deduction-snapshots");
const passwordResetDigestWidth = require("./migrations/2026-11-05_password-reset-digest-width");
const poReceiptQuantitiesAndShelfLifeMonths = require("./migrations/2026-11-06_po-receipt-quantities-and-shelf-life-months");
const receiptCustomerIdentity = require("./migrations/2026-11-06_receipt-customer-identity");
const paymongoCheckoutIntents = require("./migrations/2026-11-06_paymongo-checkout-intents");
const paymongoWebhookEvents = require("./migrations/2026-11-06_paymongo-webhook-events");
const chickenFlavorSelection = require("./migrations/2026-11-07_chicken-flavor-selection");

const MIGRATIONS = [
  deploymentSchemaAlignment,
  inventoryChangeNotificationCategory,
  purchaseOrderDeliveryDateNullable,
  thirdPartyReferenceReuse,
  orderInventoryDeductionSnapshots,
  passwordResetDigestWidth,
  poReceiptQuantitiesAndShelfLifeMonths,
  receiptCustomerIdentity,
  paymongoCheckoutIntents,
  paymongoWebhookEvents,
  chickenFlavorSelection,
];
const LOCK_NAME = "the_crunch_schema_migrations";

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

async function applyMigrations(connection, { log = console } = {}) {
  await ensureMigrationTable(connection);
  const [rows] = await connection.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => String(row.version)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.VERSION)) continue;
    log.log(`Applying database migration ${migration.VERSION}...`);
    await migration.up(connection, { log });
    await connection.query(
      "INSERT INTO schema_migrations (version) VALUES (?)",
      [migration.VERSION],
    );
    log.log(`Applied database migration ${migration.VERSION}.`);
  }
}

async function migrate(options = {}) {
  const { log = console, connection: providedConnection = null } = options;
  const dbConfig = getDatabaseConfig();
  validateDatabaseConfig(dbConfig, { requireExplicit: true });

  let connection = providedConnection;
  let ownsConnection = false;
  let lockAcquired = false;
  try {
    if (!connection) {
      const sslOptions = getDatabaseSslOptions(dbConfig);
      connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        ...(sslOptions ? { ssl: sslOptions } : {}),
        multipleStatements: false,
      });
      ownsConnection = true;
    }

    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK(?, 30) AS acquired",
      [LOCK_NAME],
    );
    lockAcquired = Number(lockRow?.acquired) === 1;
    if (!lockAcquired) {
      const error = new Error("Could not acquire the database migration lock.");
      error.code = "DB_MIGRATION_LOCK_TIMEOUT";
      throw error;
    }

    await applyMigrations(connection, { log });
    return true;
  } catch (error) {
    log.error("Database migration failed:", getSafeDatabaseErrorDetails(error, dbConfig));
    throw error;
  } finally {
    if (connection && lockAcquired) {
      await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => undefined);
    }
    if (connection && ownsConnection) await connection.end();
  }
}

module.exports = {
  MIGRATIONS,
  applyMigrations,
  migrate,
};

if (require.main === module) {
  migrate().catch(() => {
    process.exitCode = 1;
  });
}
