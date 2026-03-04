const pool = require('./src/config/db');

(async () => {
  try {
    const [r] = await pool.query('INSERT INTO products (name,price,quantity,description) VALUES (?,?,?,?)', ['Sample', 12.34, 10, 'desc']);
    console.log('inserted', r.insertId);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
})();