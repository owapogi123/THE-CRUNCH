const express = require('express');
const cors = require('cors');

require('./config/db'); // 👈 connect MySQL

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
const testRoutes = require('./routes/testRoutes');
app.use('/api/test', testRoutes);
const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);

// inventory and batch endpoints (new)
const inventoryRoutes = require('./routes/inventoryRoutes');
app.use('/api/inventory', inventoryRoutes);

// order endpoints (used by POS & dashboard)
const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);

// Test route
app.get('/api', (req, res) => {
  res.json({ status: 'success', message: 'API is working' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend server is running' });
});

// Global error handler - ensures errors are returned as JSON and logged
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Internal Server Error', error: err && err.message ? err.message : 'Unknown error' });
});

module.exports = app;