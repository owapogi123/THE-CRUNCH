const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadRoot = path.join(__dirname, "..", "..", "uploads", "proofs");
fs.mkdirSync(uploadRoot, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(String(file.mimetype || "").toLowerCase())) {
      const error = new Error("Only PNG, JPG, and WEBP payment proof images are supported");
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

router.post("/", upload.single("proof"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Proof image is required" });
  }

  return res.json({
    message: "Payment proof uploaded",
    fileUrl: `/uploads/proofs/${encodeURIComponent(req.file.filename)}`,
    originalName: req.file.originalname || null,
  });
});

router.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Payment proof image must be 5 MB or smaller",
    });
  }
  return res.status(err.statusCode || 500).json({
    message: err.message || "Failed to upload payment proof",
  });
});

module.exports = router;
