const express = require("express");
const cors = require("cors");

require("./config/db"); // 👈 connect MySQL

const app = express();

// Middleware
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "ngrok-skip-browser-warning",
    ],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
const usersRoutes = require("./routes/userRoutes");
app.use("/api/users", usersRoutes);
const testRoutes = require("./routes/testRoutes");
app.use("/api/test", testRoutes);
const productRoutes = require("./routes/productRoutes");
app.use("/api/products", productRoutes);
const purchaseOrdersRouter = require("./routes/purchaseOrders");
app.use("/api/purchase-orders", purchaseOrdersRouter);

// inventory and batch endpoints (new)
const inventoryRoutes = require("./routes/inventoryRoutes");
app.use("/api/inventory", inventoryRoutes);

const batchesRoutes = require("./routes/batches");
app.use("/api/batches", batchesRoutes);

// stock manager endpoints
const stockStatusRoutes = require("./routes/stockStatusRoutes");
app.use("/api/stock-status", stockStatusRoutes);

const suppliersRoutes = require("./routes/suppliersRoutes");
app.use("/api/suppliers", suppliersRoutes);

const reportsRoutes = require("./routes/reportsRoutes");
app.use("/api/reports", reportsRoutes);

// order endpoints (used by POS & dashboard)
const orderRoutes = require("./routes/orderRoutes");
app.use("/api/orders", orderRoutes);

// Test route
app.get("/api", (req, res) => {
  res.json({ status: "success", message: "API is working" });
});

// Root route for browser access
app.get("/", (req, res) => {
  res.send("Backend is working ✅");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Backend server is running" });
});

// Global error handler - ensures errors are returned as JSON and logged
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res
    .status(500)
    .json({
      message: "Internal Server Error",
      error: err && err.message ? err.message : "Unknown error",
    });
});

module.exports = app;
