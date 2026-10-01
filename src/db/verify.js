const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const {
  getDatabaseConfig,
  getSafeDatabaseErrorDetails,
  logDatabaseDiagnostics,
  validateDatabaseConfig,
} = require('../config/databaseEnvironment');

(async function verify(){
  const dbConfig = getDatabaseConfig();
  let conn;
  try {
    logDatabaseDiagnostics(console, dbConfig);
    validateDatabaseConfig(dbConfig);

    conn = await mysql.createConnection({
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
                'utf8',
              ),
              rejectUnauthorized: true,
            },
          }
        : {}),
    });
    console.log('Connected to the configured MySQL database.');

    const [tables] = await conn.query("SHOW TABLES");
    if (!tables.length) {
      console.log('No tables found.');
      return;
    }

    console.log('Tables and row counts:');
    for (const row of tables) {
      // The column name is like 'Tables_in_pos_system'
      const tableName = Object.values(row)[0];
      try {
        const [res] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
        console.log(`- ${tableName}: ${res[0].cnt} rows`);
      } catch (e) {
        console.log(`- ${tableName}: error getting count (${e.message})`);
      }
    }
  } catch (err) {
    console.error(
      'Verify failed:',
      getSafeDatabaseErrorDetails(err, dbConfig),
    );
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
