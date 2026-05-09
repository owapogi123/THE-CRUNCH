const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadRoot = path.join(__dirname, "..", "..", "uploads", "products");
fs.mkdirSync(uploadRoot, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const extensionByMimeType = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

function slugifyFilename(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "product";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const ext =
      extensionByMimeType[mimeType] ||
      path.extname(file.originalname || "").toLowerCase() ||
      ".jpg";
    const baseName = slugifyFilename(file.originalname || "product");
    cb(null, `${baseName}-${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(String(file.mimetype || "").toLowerCase())) {
      const error = new Error(
        "Only PNG, JPG, WEBP, and AVIF product images are supported",
      );
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

router.post("/", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Product image is required" });
  }

  return res.json({
    message: "Product image uploaded",
    fileUrl: `/uploads/products/${encodeURIComponent(req.file.filename)}`,
    originalName: req.file.originalname || null,
  });
});

router.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Product image must be 5 MB or smaller",
    });
  }
  return res.status(err.statusCode || 500).json({
    message: err.message || "Failed to upload product image",
  });
});

module.exports = router;
