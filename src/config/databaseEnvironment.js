const fs = require("fs");
const path = require("path");
const dns = require("dns/promises");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const REQUIRED_DB_VARIABLES = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
];

const ALTERNATE_DATABASE_VARIABLES = [
  "MYSQLHOST",
  "MYSQLPORT",
  "MYSQLUSER",
  "MYSQLPASSWORD",
  "MYSQLDATABASE",
  "MYSQL_URL",
  "MYSQL_PUBLIC_URL",
  "DATABASE_URL",
];

function isConfigured(key) {
  return (
    typeof process.env[key] === "string" && process.env[key].trim() !== ""
  );
}

function readTrimmed(key, fallback) {
  return isConfigured(key) ? process.env[key].trim() : fallback;
}

function isRailwayRuntime() {
  return [
    "RAILWAY_PROJECT_ID",
    "RAILWAY_ENVIRONMENT_ID",
    "RAILWAY_SERVICE_ID",
  ].some(isConfigured);
}

function getDatabaseConnectionMode(host) {
  const normalizedHost = String(host || "").trim().toLowerCase();

  if (!normalizedHost) return "unknown";
  if (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1"
  ) {
    return "local";
  }
  if (normalizedHost.endsWith(".railway.internal")) return "private";
  if (
    normalizedHost.endsWith(".proxy.rlwy.net") ||
    normalizedHost.endsWith(".rlwy.net")
  ) {
    return "public";
  }
  return "external";
}

function getDatabaseConfig() {
  const rawPort = readTrimmed("DB_PORT", "3306");

  return {
    host: readTrimmed("DB_HOST", "127.0.0.1"),
    port: Number(rawPort),
    user: readTrimmed("DB_USER", "root"),
    password: isConfigured("DB_PASSWORD") ? process.env.DB_PASSWORD : "",
    database: readTrimmed("DB_NAME", "pos_system"),
  };
}

function getDatabaseSslOptions(config = getDatabaseConfig()) {
  const connectionMode = getDatabaseConnectionMode(config.host);

  // Railway private networking is already encrypted in transit and its MySQL
  // service must not inherit a provider-specific CA from a previous host.
  if (connectionMode === "private" || !isConfigured("DB_SSL_CA_PATH")) {
    return undefined;
  }

  return {
    ca: fs.readFileSync(
      path.resolve(process.env.DB_SSL_CA_PATH.trim()),
      "utf8",
    ),
    rejectUnauthorized: true,
  };
}

function getDatabaseSslDiagnostics(config = getDatabaseConfig()) {
  const connectionMode = getDatabaseConnectionMode(config.host);
  const caConfigured = isConfigured("DB_SSL_CA_PATH");
  const enabled = connectionMode !== "private" && caConfigured;

  return {
    sslEnabled: enabled ? "yes" : "no",
    sslCaConfigured: caConfigured ? "yes" : "no",
    sslMode:
      connectionMode === "private" && caConfigured
        ? "disabled-private-network"
        : enabled
          ? "custom-ca-verified"
          : "disabled",
  };
}

function getDatabaseDiagnostics(config = getDatabaseConfig()) {
  const rawHost =
    typeof process.env.DB_HOST === "string" ? process.env.DB_HOST : "";
  const effectiveHost = String(config.host || "");
  const containsProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(effectiveHost);
  const containsCredentials = effectiveHost.includes("@");

  return {
    hostConfigured: isConfigured("DB_HOST") ? "yes" : "no",
    portConfigured: isConfigured("DB_PORT") ? "yes" : "no",
    userConfigured: isConfigured("DB_USER") ? "yes" : "no",
    databaseConfigured: isConfigured("DB_NAME") ? "yes" : "no",
    passwordConfigured: isConfigured("DB_PASSWORD") ? "yes" : "no",
    port: Number.isInteger(config.port) ? config.port : "invalid",
    connectionMode: getDatabaseConnectionMode(config.host),
    host: containsProtocol || containsCredentials
      ? "<redacted: DB_HOST is not a plain hostname>"
      : effectiveHost,
    hostLength: effectiveHost.length,
    hostHasWhitespace: /\s/.test(effectiveHost) ? "yes" : "no",
    hostWasTrimmed: rawHost !== effectiveHost ? "yes" : "no",
    hostContainsProtocol: containsProtocol ? "yes" : "no",
    hostContainsPort: /:\d+$/.test(effectiveHost) ? "yes" : "no",
    hostHasSurroundingQuotes: /^(["']).*\1$/.test(effectiveHost)
      ? "yes"
      : "no",
  };
}

function logDatabaseDiagnostics(log = console, config = getDatabaseConfig()) {
  const diagnostics = getDatabaseDiagnostics(config);
  const sslDiagnostics = getDatabaseSslDiagnostics(config);
  log.log("Database connection diagnostics:");
  log.log(`DB_HOST: ${diagnostics.host}`);
  log.log(`DB_PORT: ${diagnostics.port}`);
  log.log(`DB_HOST length: ${diagnostics.hostLength}`);
  log.log(`DB_HOST has whitespace: ${diagnostics.hostHasWhitespace}`);
  log.log(`DB_HOST was trimmed: ${diagnostics.hostWasTrimmed}`);
  log.log(`DB_HOST contains protocol: ${diagnostics.hostContainsProtocol}`);
  log.log(`DB_HOST contains port: ${diagnostics.hostContainsPort}`);
  log.log(
    `DB_HOST has surrounding quotes: ${diagnostics.hostHasSurroundingQuotes}`,
  );
  log.log(`DB connection mode: ${diagnostics.connectionMode}`);
  log.log(`DB host configured: ${diagnostics.hostConfigured}`);
  log.log(`DB port configured: ${diagnostics.portConfigured}`);
  log.log(`DB user configured: ${diagnostics.userConfigured}`);
  log.log(`DB database configured: ${diagnostics.databaseConfigured}`);
  log.log(`DB password configured: ${diagnostics.passwordConfigured}`);
  log.log(`DB SSL enabled: ${sslDiagnostics.sslEnabled}`);
  log.log(`DB SSL CA configured: ${sslDiagnostics.sslCaConfigured}`);
  log.log(`DB SSL mode: ${sslDiagnostics.sslMode}`);
}

async function logDatabaseDnsDiagnostics(
  log = console,
  config = getDatabaseConfig(),
) {
  const diagnostics = getDatabaseDiagnostics(config);

  try {
    const result = await dns.lookup(config.host);
    log.log(`DNS lookup successful: ${result.address}`);
    return result;
  } catch (error) {
    log.error("DNS lookup failed:", {
      code: error && error.code ? error.code : "UNKNOWN_ERROR",
      hostname: diagnostics.host,
    });
    return null;
  }
}

function validateDatabaseConfig(config = getDatabaseConfig()) {
  const missing = REQUIRED_DB_VARIABLES.filter((key) => !isConfigured(key));
  const hasAlternateDatabaseVariables =
    ALTERNATE_DATABASE_VARIABLES.some(isConfigured);
  const requiresExplicitConfig =
    process.env.NODE_ENV === "production" ||
    isRailwayRuntime() ||
    hasAlternateDatabaseVariables;

  if (requiresExplicitConfig && missing.length > 0) {
    const error = new Error(
      `Missing required database variables: ${missing.join(", ")}. ` +
        "This backend reads DB_* variables; MYSQL*/DATABASE_URL values are not consumed directly and must be mapped.",
    );
    error.code = "DB_CONFIG_ERROR";
    throw error;
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    const error = new Error("DB_PORT must be an integer between 1 and 65535.");
    error.code = "DB_CONFIG_ERROR";
    throw error;
  }

  return config;
}

function getSafeDatabaseErrorDetails(error, config = getDatabaseConfig()) {
  const diagnostics = getDatabaseDiagnostics(config);
  const sslDiagnostics = getDatabaseSslDiagnostics(config);
  return {
    code:
      error && (error.code || error.name)
        ? error.code || error.name
        : "UNKNOWN_ERROR",
    ...(error && error.code === "DB_CONFIG_ERROR"
      ? { message: error.message }
      : {}),
    hostConfigured: diagnostics.hostConfigured,
    portConfigured: diagnostics.portConfigured,
    port: diagnostics.port,
    databaseConfigured: diagnostics.databaseConfigured,
    connectionMode: diagnostics.connectionMode,
    sslMode: sslDiagnostics.sslMode,
  };
}

module.exports = {
  getDatabaseConfig,
  getDatabaseSslOptions,
  getSafeDatabaseErrorDetails,
  logDatabaseDnsDiagnostics,
  logDatabaseDiagnostics,
  validateDatabaseConfig,
};
