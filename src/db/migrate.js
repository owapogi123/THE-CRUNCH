"use strict";

const crypto = require("node:crypto");
const mysql = require("mysql2/promise");
const {
  getDatabaseConfig,
  getDatabaseSslOptions,
  getSafeDatabaseErrorDetails,
  validateDatabaseConfig,
} = require("../config/databaseEnvironment");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("./schemaProfile");
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
const redesignedBaseline = require("./migrations/2026-11-08_redesigned-baseline");
const {
  seedRedesignedSystemDefaults,
} = require("../services/redesignedSystemSeed");
const {
  bootstrapAdministrator,
} = require("../services/administratorBootstrapService");

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
const REDESIGNED_MIGRATIONS = [redesignedBaseline];
const LOCK_NAME = "the_crunch_schema_migrations";
const REDESIGNED_PROFILE_MARKER = "__schema_profile_redesigned_v1__";
const REDESIGNED_PROFILE_MARKER_CHECKSUM = crypto
  .createHash("sha256")
  .update(REDESIGNED_PROFILE_MARKER)
  .digest("hex");

function schemaProfileMismatchError() {
  const error = new Error(
    "The redesigned migration profile can initialize only an empty database " +
      "or resume a database already marked for the redesigned schema.",
  );
  error.code = "DB_SCHEMA_PROFILE_MISMATCH";
  return error;
}

async function ensureMigrationTable(connection, profile) {
  if (profile === REDESIGNED_SCHEMA_PROFILE) {
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (" +
        "version VARCHAR(100) NOT NULL PRIMARY KEY, " +
        "checksum CHAR(64) NULL, " +
        "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
        ") ENGINE=InnoDB",
    );
    const [columns] = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "AND TABLE_NAME = 'schema_migrations' " +
        "AND COLUMN_NAME = 'checksum'",
    );
    if (columns.length === 0) {
      await connection.query(
        "ALTER TABLE schema_migrations " +
          "ADD COLUMN checksum CHAR(64) NULL AFTER version",
      );
    }
    return;
  }

  await connection.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "version VARCHAR(100) NOT NULL PRIMARY KEY, " +
      "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
      ") ENGINE=InnoDB",
  );
}

async function prepareRedesignedDatabase(connection) {
  const [tableRows] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
  );
  const tables = tableRows.map((row) =>
    String(row.TABLE_NAME || row.table_name || "").toLowerCase(),
  );
  const hasMigrationTable = tables.includes("schema_migrations");
  let marker = null;

  if (hasMigrationTable) {
    const [markerRows] = await connection.query(
      "SELECT version FROM schema_migrations WHERE version = ?",
      [REDESIGNED_PROFILE_MARKER],
    );
    marker = markerRows[0] || null;
  }

  const nonLedgerTables = tables.filter(
    (table) => table !== "schema_migrations",
  );
  if (nonLedgerTables.length > 0 && !marker) {
    throw schemaProfileMismatchError();
  }

  await ensureMigrationTable(connection, REDESIGNED_SCHEMA_PROFILE);
  const [verifiedMarkerRows] = await connection.query(
    "SELECT version, checksum FROM schema_migrations WHERE version = ?",
    [REDESIGNED_PROFILE_MARKER],
  );
  if (verifiedMarkerRows.length === 0) {
    await connection.query(
      "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)",
      [REDESIGNED_PROFILE_MARKER, REDESIGNED_PROFILE_MARKER_CHECKSUM],
    );
  } else if (
    verifiedMarkerRows[0].checksum !== REDESIGNED_PROFILE_MARKER_CHECKSUM
  ) {
    throw checksumMismatchError(REDESIGNED_PROFILE_MARKER);
  }
}

function getMigrationsForProfile(profile) {
  return profile === REDESIGNED_SCHEMA_PROFILE
    ? REDESIGNED_MIGRATIONS
    : MIGRATIONS;
}

function checksumMismatchError(version) {
  const error = new Error(
    "Applied migration " + version +
      " does not match the reviewed migration checksum.",
  );
  error.code = "DB_MIGRATION_CHECKSUM_MISMATCH";
  return error;
}

async function applyMigrations(
  connection,
  { log = console, profile = getSchemaProfile() } = {},
) {
  const selectedProfile = getSchemaProfile({ DB_SCHEMA_PROFILE: profile });
  await ensureMigrationTable(connection, selectedProfile);
  const isRedesigned = selectedProfile === REDESIGNED_SCHEMA_PROFILE;
  const [rows] = await connection.query(
    isRedesigned
      ? "SELECT version, checksum FROM schema_migrations"
      : "SELECT version FROM schema_migrations",
  );
  const applied = new Map(
    rows.map((row) => [String(row.version), row.checksum || null]),
  );

  for (const migration of getMigrationsForProfile(selectedProfile)) {
    if (applied.has(migration.VERSION)) {
      if (
        isRedesigned &&
        (!migration.CHECKSUM || applied.get(migration.VERSION) !== migration.CHECKSUM)
      ) {
        throw checksumMismatchError(migration.VERSION);
      }
      continue;
    }

    log.log("Applying database migration " + migration.VERSION + "...");
    await migration.up(connection, { log });
    if (isRedesigned) {
      await connection.query(
        "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)",
        [migration.VERSION, migration.CHECKSUM],
      );
    } else {
      await connection.query(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [migration.VERSION],
      );
    }
    log.log("Applied database migration " + migration.VERSION + ".");
  }
}

async function migrate(options = {}) {
  const {
    log = console,
    connection: providedConnection = null,
    env = process.env,
    profile = getSchemaProfile(env),
  } = options;
  const selectedProfile = getSchemaProfile({ DB_SCHEMA_PROFILE: profile });
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

    if (selectedProfile === REDESIGNED_SCHEMA_PROFILE) {
      await prepareRedesignedDatabase(connection);
    }
    await applyMigrations(connection, { log, profile: selectedProfile });
    if (selectedProfile === REDESIGNED_SCHEMA_PROFILE) {
      await seedRedesignedSystemDefaults(connection);
      await bootstrapAdministrator(connection, { env, log });
    }
    return true;
  } catch (error) {
    log.error(
      "Database migration failed:",
      getSafeDatabaseErrorDetails(error, dbConfig),
    );
    throw error;
  } finally {
    if (connection && lockAcquired) {
      await connection
        .query("SELECT RELEASE_LOCK(?)", [LOCK_NAME])
        .catch(() => undefined);
    }
    if (connection && ownsConnection) await connection.end();
  }
}

module.exports = {
  MIGRATIONS,
  REDESIGNED_MIGRATIONS,
  REDESIGNED_PROFILE_MARKER,
  applyMigrations,
  ensureMigrationTable,
  getMigrationsForProfile,
  migrate,
  prepareRedesignedDatabase,
};

if (require.main === module) {
  migrate().catch(() => {
    process.exitCode = 1;
  });
}
