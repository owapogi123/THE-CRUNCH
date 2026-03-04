const router = require('express').Router();
const db = require('../config/db');
const { randomUUID } = require('crypto');

// helper to ensure batches table exists (in case setup script hasn't been run)
async function ensureBatchTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS Batches (
        id VARCHAR(36) PRIMARY KEY,
        productId INT,
        quantity INT NOT NULL,
        unit VARCHAR(50),
        receivedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME NULL,
        status VARCHAR(20) DEFAULT 'active',
        FOREIGN KEY (productId) REFERENCES Menu(Product_ID)
    );
  `);
}

// GET inventory with attached batches
router.get('/', async (req, res) => {
  try {
    await ensureBatchTable();

    const [products] = await db.query('SELECT * FROM Menu');
    const [batches] = await db.query('SELECT * FROM Batches');

    const map = {};
    batches.forEach((b) => {
      if (!map[b.productId]) map[b.productId] = [];
      map[b.productId].push({
        id: b.id,
        productId: b.productId,
        quantity: b.quantity,
        unit: b.unit,
        receivedAt: b.receivedAt,
        expiresAt: b.expiresAt,
        status: b.status,
      });
    });

    const result = products.map((p) => ({
      ...p,
      batches: map[p.Product_ID] || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ message: 'DB error', error: err.message });
  }
});

// create a new batch
router.post('/batches', async (req, res) => {
  try {
    await ensureBatchTable();

    const { productId, quantity, unit, expiresAt } = req.body;
    const id = randomUUID();
    const receivedAt = new Date();

    // make sure the referenced product exists in Menu; if it doesn't we
    // try to copy it from the legacy "products" table. this allows newly
    // created products (which are added only to "products") to still be
    // batched without hitting a foreign key constraint.
    const [menuRows] = await db.query('SELECT Product_ID FROM Menu WHERE Product_ID = ?', [productId]);
    if (menuRows.length === 0) {
      // attempt to fetch from products table
      const [prodRows] = await db.query('SELECT name, price, quantity FROM products WHERE id = ?', [productId]);
      if (prodRows.length > 0) {
        const p = prodRows[0];
        await db.query(
          'INSERT INTO Menu (Product_ID, Product_Name, Price, Stock) VALUES (?,?,?,?)',
          [productId, p.name, p.price || 0, p.quantity || 0]
        );
      }
    }

    await db.query('INSERT INTO Batches SET ?', {
      id,
      productId,
      quantity,
      unit,
      receivedAt,
      expiresAt: expiresAt || null,
      status: 'active',
    });

    // increment the stock in both tables so returned/incoming counts are accurate
    await db.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [quantity, productId]);
    await db.query('UPDATE Menu SET Stock = Stock + ? WHERE Product_ID = ?', [quantity, productId]);

    res.status(201).json({ id, productId, quantity, unit, receivedAt, expiresAt, status: 'active' });
  } catch (err) {
    console.error('Error adding batch:', err);
    res.status(500).json({ message: 'DB error', error: err.message });
  }
});

// return/mark a batch
router.post('/batches/:batchId/return', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { quantity, returnedAt } = req.body; // returnedAt not used currently

    // retrieve productId so we can update stock
    const [rows] = await db.query('SELECT productId FROM Batches WHERE id = ?', [batchId]);
    const productId = rows[0]?.productId;

    // mark as returned; optionally adjust quantity
    await db.query('UPDATE Batches SET status = ?, quantity = ? WHERE id = ?', [
      'returned',
      quantity,
      batchId,
    ]);

    if (productId) {
      await db.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [quantity, productId]);
      await db.query('UPDATE Menu SET Stock = Stock + ? WHERE Product_ID = ?', [quantity, productId]);
    }

    res.json({ message: 'Batch updated' });
  } catch (err) {
    console.error('Error returning batch:', err);
    res.status(500).json({ message: 'DB error', error: err.message });
  }
});

module.exports = router;
