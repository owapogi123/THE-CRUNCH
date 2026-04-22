const mysql = require("mysql2");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

function getEnv(key, fallback) {
  const value = process.env[key];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed;
}

const dbConfig = {
  host: getEnv("DB_HOST", "127.0.0.1"),
  user: getEnv("DB_USER", "root"),
  password: process.env.DB_PASSWORD ?? "",
  database: getEnv("DB_NAME", "pos_system"),
  port: Number(getEnv("DB_PORT", "3306")),
};

const pool = mysql.createPool({
  host: dbConfig.host,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  port: dbConfig.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const promisePool = pool.promise();

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
