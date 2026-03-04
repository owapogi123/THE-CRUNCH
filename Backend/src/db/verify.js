require('dotenv').config();
const mysql = require('mysql2/promise');

(async function verify(){
  const DB_HOST = process.env.DB_HOST || 'localhost';
  const DB_USER = process.env.DB_USER || 'root';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  const DB_NAME = process.env.DB_NAME || 'pos_db';
  const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  let conn;
  try {
    conn = await mysql.createConnection({host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, port: DB_PORT});
    console.log(`Connected to ${DB_HOST}:${DB_PORT} database ${DB_NAME}`);

    const [tables] = await conn.query("SHOW TABLES");
    if (!tables.length) {
      console.log('No tables found.');
      return;
    }

    console.log('Tables and row counts:');
    for (const row of tables) {
      // The column name is like 'Tables_in_pos_db'
      const tableName = Object.values(row)[0];
      try {
        const [res] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
        console.log(`- ${tableName}: ${res[0].cnt} rows`);
      } catch (e) {
        console.log(`- ${tableName}: error getting count (${e.message})`);
      }
    }
  } catch (err) {
    console.error('Verify failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();