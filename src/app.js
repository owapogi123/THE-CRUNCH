const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://127.0.0.1:5173",
  "https://127.0.0.1:5173",
  "https://thecrunch.site",
  "https://www.thecrunch.site",
];

// Middleware
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const isCloudflarePages =
        /^https:\/\/[a-z0-9-]+\.the-crunch\.pages\.dev$/.test(origin);

      if (allowedOrigins.includes(origin) || isCloudflarePages) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "ngrok-skip-browser-warning",
    ],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(["/uploads/proofs", "/uploads/payment-proofs"], (_req, res) => {
  res.status(404).json({ message: "Payment proofs require staff access" });
});
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Product availability depends on product, inventory, batch, purchase, and paid
// order writes. Invalidate only the product read cache after a successful write.
const productCacheInvalidation = require("./middleware/productCacheInvalidation");
app.use(productCacheInvalidation);

// Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
const usersRoutes = require("./routes/userRoutes");
app.use("/api/users", usersRoutes);
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

const kitchenUsageRoutes = require("./routes/kitchenUsageRoutes");
app.use("/api/kitchen-usage", kitchenUsageRoutes);
const uploadProofRoutes = require("./routes/uploadProofRoutes");
app.use("/api/upload-proof", uploadProofRoutes);
const uploadProductImageRoutes = require("./routes/uploadProductImageRoutes");
app.use("/api/upload-product-image", uploadProductImageRoutes);
const feedbackRoutes = require("./routes/feedbackRoutes");
app.use("/api/feedback", feedbackRoutes);
const settingsRoutes = require("./routes/settingsRoutes");
app.use("/api/settings", settingsRoutes);
const contentRoutes = require("./routes/contentRoutes");
app.use("/api", contentRoutes);
const paymongoRoutes = require("./routes/paymongoRoutes");
app.use("/api/paymongo", paymongoRoutes);

// order endpoints (used by POS & dashboard)
const orderRoutes = require("./routes/orderRoutes");
app.use("/api/orders", orderRoutes);

// Local fallback for optional dine-in table support.
app.get("/api/tables", (req, res) => {
  res.json([]);
});

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
  res.status(500).json({
    message: "Internal Server Error",
    error: err && err.message ? err.message : "Unknown error",
  });
});

module.exports = app;
