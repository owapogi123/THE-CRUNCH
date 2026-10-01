const mysql = require("mysql2");
const {
  timeDbQuery,
  wrapConnectionWithDbTiming,
} = require("../services/requestTiming");
const {
  getDatabaseConfig,
  getDatabaseSslOptions,
} = require("./databaseEnvironment");

const dbConfig = getDatabaseConfig();
const sslOptions = getDatabaseSslOptions(dbConfig);

const pool = mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: dbConfig.port,
  ...(sslOptions ? { ssl: sslOptions } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
});

const promisePool = pool.promise();
const rawQuery = promisePool.query.bind(promisePool);
promisePool.query = (...args) =>
  timeDbQuery(args[0], () => rawQuery(...args));
const rawGetConnection = promisePool.getConnection.bind(promisePool);
promisePool.getConnection = async () =>
  wrapConnectionWithDbTiming(await rawGetConnection());

async function verifyConnection() {
  const connection = await promisePool.getConnection();
  try {
    return {
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
    };
  } finally {
    connection.release();
  }
}

module.exports = Object.assign(promisePool, {
  verifyConnection,
  config: dbConfig,
});
