const { assertJwtSecretConfigured } = require("./services/jwtConfig");
const {
  getDatabaseConfig,
  getSafeDatabaseErrorDetails,
  validateDatabaseConfig,
} = require("./config/databaseEnvironment");
const {
  verifySchemaCompatibility,
} = require("./services/schemaCompatibilityService");

const PORT = process.env.PORT || 5000;

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
    const server = app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });

    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
        console.error(
          `A backend instance is already running at http://localhost:${PORT}. Stop it first or run with a different PORT.`,
        );
        process.exit(0);
        return;
      }
      throw err;
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

module.exports = { startServer };
