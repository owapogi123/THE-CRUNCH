const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
const {
  timeDbQuery,
  wrapConnectionWithDbTiming,
} = require("../services/requestTiming");
const { getDatabaseConfig } = require("./databaseEnvironment");

const dbConfig = getDatabaseConfig();

const pool = mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: dbConfig.port,
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
