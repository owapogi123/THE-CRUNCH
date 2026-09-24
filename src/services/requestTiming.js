const { AsyncLocalStorage } = require("node:async_hooks");

const queryTimingStorage = new AsyncLocalStorage();

function isDevelopmentTimingEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ORDER_TIMING_ENABLED === "1"
  );
}

function describeSql(sql) {
  const normalized = String(sql || "").replace(/\s+/g, " ").trim();
  const patterns = [
    [/^SHOW COLUMNS/i, "SHOW COLUMNS"],
    [/^CREATE TABLE/i, "CREATE TABLE"],
    [/^ALTER TABLE/i, "ALTER TABLE"],
    [/^SELECT/i, "SELECT"],
    [/^INSERT/i, "INSERT"],
    [/^UPDATE/i, "UPDATE"],
    [/^DELETE/i, "DELETE"],
  ];
  return patterns.find(([pattern]) => pattern.test(normalized))?.[1] || "QUERY";
}

function summarizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function runWithDbQueryTiming(callback) {
  if (!isDevelopmentTimingEnabled()) {
    return callback(null);
  }
  return queryTimingStorage.run({ queries: [] }, () =>
    callback(queryTimingStorage.getStore()),
  );
}

async function timeDbQuery(sql, execute) {
  const timing = queryTimingStorage.getStore();
  if (!timing) return execute();

  const startedAt = process.hrtime.bigint();
  try {
    return await execute();
  } finally {
    timing.queries.push({
      operation: describeSql(sql),
      sql: summarizeSql(sql),
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    });
  }
}

function wrapConnectionWithDbTiming(connection) {
  if (!connection || connection.__requestTimingWrapped) return connection;
  const rawQuery = connection.query.bind(connection);
  const rawBeginTransaction = connection.beginTransaction.bind(connection);
  const rawCommit = connection.commit.bind(connection);
  const rawRollback = connection.rollback.bind(connection);

  connection.query = (...args) =>
    timeDbQuery(args[0], () => rawQuery(...args));
  connection.beginTransaction = () =>
    timeDbQuery("BEGIN", () => rawBeginTransaction());
  connection.commit = () => timeDbQuery("COMMIT", () => rawCommit());
  connection.rollback = () => timeDbQuery("ROLLBACK", () => rawRollback());
  Object.defineProperty(connection, "__requestTimingWrapped", {
    value: true,
  });
  return connection;
}

module.exports = {
  isDevelopmentTimingEnabled,
  runWithDbQueryTiming,
  timeDbQuery,
  wrapConnectionWithDbTiming,
};
