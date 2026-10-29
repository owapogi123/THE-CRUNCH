const { assertJwtSecretConfigured } = require("./services/jwtConfig");
const {
  getDatabaseConfig,
  getSafeDatabaseErrorDetails,
  validateDatabaseConfig,
} = require("./config/databaseEnvironment");
const {
  verifySchemaCompatibility,
} = require("./services/schemaCompatibilityService");

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";

async function startServer() {
  const dbConfig = getDatabaseConfig();
  try {
    if (process.argv.includes("--reset")) {
      const error = new Error(
        "--reset is an administrative database option and is forbidden during normal backend startup.",
      );
      error.code = "UNSAFE_STARTUP_OPTION";
      throw error;
    }

    assertJwtSecretConfigured();
    validateDatabaseConfig(dbConfig, { requireExplicit: true });
    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
      const error = new Error("PORT must be an integer between 1 and 65535.");
      error.code = "DB_CONFIG_ERROR";
      throw error;
    }

    // Do not construct the pool or load routes until the explicit-config gate
    // passes. Normal startup never initializes, repairs, seeds, or migrates.
    const db = require("./config/db");
    await db.verifyConnection();
    const compatibility = await verifySchemaCompatibility(db, dbConfig.database);

    for (const warning of compatibility.warnings) {
      console.warn(`Database compatibility warning: ${warning}`);
    }
    console.log(
      `MySQL compatibility verified for ${compatibility.database}: ` +
        `${compatibility.tableCount} tables, ${compatibility.indexCount} indexes, ` +
        `${compatibility.foreignKeyCount} foreign keys, ${compatibility.triggerCount} triggers.`,
    );

    // Loading app registers routes but does not perform schema work.
    const app = require("./app");
    const server = app.listen(PORT, HOST, () => {
      console.log(`Backend server listening on ${HOST}:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });

    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
        console.error(
          `A backend instance is already running at http://localhost:${PORT}. Stop it first or run with a different PORT.`,
        );
        process.exit(1);
        return;
      }
      console.error("Backend server error:", err && err.message ? err.message : err);
      process.exit(1);
    });
  } catch (err) {
    console.error(
      "Backend startup safety check failed:",
      getSafeDatabaseErrorDetails(err, dbConfig),
    );
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err && err.stack ? err.stack : err);
});

module.exports = { HOST, PORT, startServer };
