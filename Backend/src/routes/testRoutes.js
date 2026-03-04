const router = require('express').Router();
const db = require('../config/db');

// Insert an admin (for testing)
router.post('/admin', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: 'Missing fields' });

    const [result] = await db.query(
      'INSERT INTO admin (UserName, Email, Password) VALUES (?,?,?)',
      [username, email, password]
    );

    res.status(201).json({ message: 'Admin inserted', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB error', error: err.message });
  }
});

// List admins
router.get('/admin', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT Admin_ID, UserName, Email FROM admin');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB error', error: err.message });
  }
});

module.exports = router;