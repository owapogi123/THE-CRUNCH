const { AsyncLocalStorage } = require("node:async_hooks");

const queryTimingStorage = new AsyncLocalStorage();

function isDevelopmentTimingEnabled() {
  return process.env.NODE_ENV !== "production";
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
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
    });
  }
}

module.exports = {
  isDevelopmentTimingEnabled,
  runWithDbQueryTiming,
  timeDbQuery,
};
