"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const defaultDatabase = require("../config/db");
const { requireRoleAccess } = require("../middleware/cookViewAccess");
const { requireAdministratorAccess } = require("../middleware/staffAccess");
const {
  PAYMENT_QR_MAX_BYTES,
  PAYMENT_QR_SETTING_KEY,
  detectPaymentQrImage,
  getActivePaymentQr,
  loadPaymentQrConfig,
  resolvePaymentQrUploadRoot,
} = require("../services/paymentQrService");

const requirePaymentQrReadAccess = requireRoleAccess(
  ["cashier"],
  "Cashier or Administrator access required",
);

function publicPaymentQrResponse(active) {
  if (!active) return { configured: false, imageUrl: null, updatedAt: null };
  const version = active.updatedAt
    ? encodeURIComponent(new Date(active.updatedAt).getTime() || active.updatedAt)
    : "current";
  return {
    configured: true,
    imageUrl: `/api/payment-qr/image?v=${version}`,
    updatedAt: active.updatedAt || null,
  };
}

function createPaymentQrRouter({ database = defaultDatabase, env = process.env } = {}) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PAYMENT_QR_MAX_BYTES },
    fileFilter: (_req, file, callback) => {
      const mimeType = String(file.mimetype || "").trim().toLowerCase();
      if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)) {
        const error = new Error("Only PNG, JPG, and WebP QR images are supported");
        error.statusCode = 400;
        return callback(error);
      }
      return callback(null, true);
    },
  });

  router.get("/", requirePaymentQrReadAccess, async (_req, res) => {
    try {
      const active = await getActivePaymentQr(database, env);
      return res.json(publicPaymentQrResponse(active));
    } catch (error) {
      console.error("GET /payment-qr error:", error.message);
      return res.status(500).json({ message: "Unable to load the GCash QR configuration" });
    }
  });

  router.get("/image", requirePaymentQrReadAccess, async (_req, res) => {
    try {
      const active = await getActivePaymentQr(database, env);
      if (!active) return res.status(404).json({ message: "GCash QR image is not configured" });
      res.type(active.mimeType);
      res.set("Cache-Control", "private, no-store");
      return res.sendFile(active.absolutePath);
    } catch (error) {
      console.error("GET /payment-qr/image error:", error.message);
      return res.status(500).json({ message: "Unable to load the GCash QR image" });
    }
  });

  router.post(
    "/",
    requireAdministratorAccess,
    upload.single("image"),
    async (req, res, next) => {
      if (!req.file) return res.status(400).json({ message: "GCash QR image is required" });

      const uploadRoot = resolvePaymentQrUploadRoot(env);
      if (!uploadRoot) {
        return res.status(503).json({
          message: "Durable QR image storage is not configured",
        });
      }

      const detected = detectPaymentQrImage(req.file.buffer, req.file.mimetype);
      if (!detected) {
        return res.status(400).json({
          message: "The uploaded file content is not a valid PNG, JPG, or WebP image",
        });
      }

      const filename = `gcash-qr-${Date.now()}-${crypto.randomUUID()}${detected.extension}`;
      const temporaryPath = path.join(uploadRoot, `.upload-${crypto.randomUUID()}.tmp`);
      const finalPath = path.join(uploadRoot, filename);
      let previous = null;
      try {
        await fs.promises.mkdir(uploadRoot, { recursive: true });
        await fs.promises.writeFile(temporaryPath, req.file.buffer, { flag: "wx" });
        await fs.promises.rename(temporaryPath, finalPath);

        previous = await loadPaymentQrConfig(database);
        const updatedAt = new Date().toISOString();
        await database.query(
          `INSERT INTO system_settings (setting_key, settings_json)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
          [
            PAYMENT_QR_SETTING_KEY,
            JSON.stringify({ filename, mimeType: detected.mimeType, updatedAt }),
          ],
        );

        if (previous?.filename && previous.filename !== filename) {
          await fs.promises.unlink(path.join(uploadRoot, previous.filename)).catch(() => undefined);
        }
        return res.json(publicPaymentQrResponse({
          filename,
          mimeType: detected.mimeType,
          updatedAt,
        }));
      } catch (error) {
        await fs.promises.unlink(temporaryPath).catch(() => undefined);
        await fs.promises.unlink(finalPath).catch(() => undefined);
        return next(error);
      }
    },
  );

  router.delete("/", requireAdministratorAccess, async (_req, res) => {
    try {
      const previous = await loadPaymentQrConfig(database);
      await database.query(
        "DELETE FROM system_settings WHERE setting_key = ?",
        [PAYMENT_QR_SETTING_KEY],
      );
      const uploadRoot = resolvePaymentQrUploadRoot(env);
      if (previous?.filename && uploadRoot) {
        await fs.promises.unlink(path.join(uploadRoot, previous.filename)).catch(() => undefined);
      }
      return res.json({ configured: false, imageUrl: null, updatedAt: null });
    } catch (error) {
      console.error("DELETE /payment-qr error:", error.message);
      return res.status(500).json({ message: "Unable to remove the GCash QR image" });
    }
  });

  router.use((error, _req, res, next) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "GCash QR image must be 5 MB or smaller" });
    }
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Unable to save the GCash QR image",
    });
  });

  return router;
}

const router = createPaymentQrRouter();
router.createPaymentQrRouter = createPaymentQrRouter;
router.publicPaymentQrResponse = publicPaymentQrResponse;

module.exports = router;
