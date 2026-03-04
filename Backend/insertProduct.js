require('dotenv').config();
const db = require('./src/config/db');

(async function() {
  try {
    const [result] = await db.query(
      "INSERT INTO menu (Product_Name, Price, Stock) VALUES (?,?,?)",
      ['Fried Chicken', 12.34, 50]
    );
    console.log('Product inserted:', result.insertId);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
