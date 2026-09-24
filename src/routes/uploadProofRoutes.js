const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { requireCookViewAccess } = require("../middleware/cookViewAccess");

const uploadRoot = path.resolve(
  process.env.PROOF_UPLOAD_DIR ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "proofs")
      : path.join(__dirname, "..", "..", "uploads", "proofs")),
);
fs.mkdirSync(uploadRoot, { recursive: true });

const extensionByMimeType = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const generatedProofFilename = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i;

function isValidImageSignature(buffer, mimeType) {
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function getProofContentType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = extensionByMimeType.get(
      String(file.mimetype || "").toLowerCase(),
    ) || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!extensionByMimeType.has(String(file.mimetype || "").toLowerCase())) {
      const error = new Error("Only PNG, JPG, and WEBP payment proof images are supported");
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

router.post("/", requireCookViewAccess, upload.single("proof"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: "Proof image is required" });
  }

  try {
    const contents = await fs.promises.readFile(req.file.path);
    if (!isValidImageSignature(contents, req.file.mimetype)) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      return res.status(400).json({
        message: "The uploaded payment proof is not a valid image file",
      });
    }

    return res.json({
      message: "Payment proof uploaded",
      fileUrl: `/api/upload-proof/${encodeURIComponent(req.file.filename)}`,
      originalName: req.file.originalname || null,
    });
  } catch (error) {
    if (req.file?.path) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
    }
    return next(error);
  }
});

router.get("/:filename", requireCookViewAccess, async (req, res) => {
  const requestedFilename = String(req.params.filename || "");
  const safeFilename = path.basename(requestedFilename);
  if (
    !safeFilename ||
    safeFilename !== requestedFilename ||
    !generatedProofFilename.test(safeFilename)
  ) {
    return res.status(400).json({ message: "Invalid payment proof filename" });
  }

  const absolutePath = path.join(uploadRoot, safeFilename);
  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
    res.type(getProofContentType(safeFilename));
    res.set("Cache-Control", "private, no-store");
    return res.sendFile(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ message: "Payment proof not found" });
    }
    console.error("GET /upload-proof/:filename error:", error.message);
    return res.status(500).json({ message: "Failed to load payment proof" });
  }
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
