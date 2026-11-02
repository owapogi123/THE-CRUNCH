"use strict";

const fs = require("fs");
const path = require("path");

const PAYMENT_QR_SETTING_KEY = "gcash_qr_payment";
const PAYMENT_QR_MAX_BYTES = 5 * 1024 * 1024;

function isStructurallyValidPng(buffer) {
  return (
    buffer.length >= 45 &&
    buffer.readUInt32BE(8) === 13 &&
    buffer.subarray(12, 16).toString("ascii") === "IHDR" &&
    buffer.readUInt32BE(16) > 0 &&
    buffer.readUInt32BE(20) > 0 &&
    buffer.readUInt32BE(buffer.length - 12) === 0 &&
    buffer.subarray(buffer.length - 8, buffer.length - 4).toString("ascii") === "IEND"
  );
}

function isStructurallyValidWebp(buffer) {
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.readUInt32LE(4) !== buffer.length - 8 ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return false;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");
  const chunkLength = buffer.readUInt32LE(16);
  if (20 + chunkLength > buffer.length) return false;

  if (chunkType === "VP8X") {
    return (
      chunkLength >= 10 &&
      buffer.length >= 30 &&
      buffer.readUIntLE(24, 3) + 1 > 0 &&
      buffer.readUIntLE(27, 3) + 1 > 0
    );
  }
  if (chunkType === "VP8L") {
    if (chunkLength < 5 || buffer.length < 25 || buffer[20] !== 0x2f) return false;
    const dimensionBits = buffer.readUInt32LE(21);
    return (dimensionBits & 0x3fff) + 1 > 0 && ((dimensionBits >> 14) & 0x3fff) + 1 > 0;
  }
  if (chunkType === "VP8 ") {
    return (
      chunkLength >= 10 &&
      buffer.length >= 30 &&
      buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a])) &&
      (buffer.readUInt16LE(26) & 0x3fff) > 0 &&
      (buffer.readUInt16LE(28) & 0x3fff) > 0
    );
  }
  return false;
}

function isStructurallyValidJpeg(buffer) {
  if (
    buffer.length < 16 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    return false;
  }

  let offset = 2;
  let hasDimensions = false;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9) break;
    if (marker === 0xda) return hasDimensions;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return false;
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (segmentLength < 8) return false;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      hasDimensions = width > 0 && height > 0;
    }
    offset += segmentLength;
  }
  return false;
}

function resolvePaymentQrUploadRoot(env = process.env) {
  const configuredRoot = String(env.QR_PAYMENT_UPLOAD_DIR || "").trim();
  if (configuredRoot) return path.resolve(configuredRoot);

  const railwayVolumeRoot = String(env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
  if (railwayVolumeRoot) return path.join(railwayVolumeRoot, "payment-qr");

  if (String(env.NODE_ENV || "").trim().toLowerCase() === "production") {
    return null;
  }
  return path.join(__dirname, "..", "..", "uploads", "payment-qr");
}

function detectPaymentQrImage(buffer, submittedMimeType) {
  const mimeType = String(submittedMimeType || "").trim().toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ) &&
    isStructurallyValidPng(buffer);
  if (isPng && mimeType === "image/png") {
    return { mimeType: "image/png", extension: ".png" };
  }

  const isWebp = isStructurallyValidWebp(buffer);
  if (isWebp && mimeType === "image/webp") {
    return { mimeType: "image/webp", extension: ".webp" };
  }

  const isJpeg = isStructurallyValidJpeg(buffer);
  if (isJpeg && (mimeType === "image/jpeg" || mimeType === "image/jpg")) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }

  return null;
}

function normalizePaymentQrConfig(value) {
  if (!value || typeof value !== "object") return null;
  const filename = String(value.filename || "").trim();
  const mimeType = String(value.mimeType || "").trim().toLowerCase();
  const updatedAt = String(value.updatedAt || "").trim();
  if (!/^gcash-qr-\d+-[0-9a-f-]{36}\.(?:png|jpe?g|webp)$/i.test(filename)) {
    return null;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    return null;
  }
  return { filename, mimeType, updatedAt: updatedAt || null };
}

async function loadPaymentQrConfig(database) {
  const [rows] = await database.query(
    `SELECT settings_json, updated_at
       FROM system_settings
      WHERE setting_key = ?
      LIMIT 1`,
    [PAYMENT_QR_SETTING_KEY],
  );
  if (!rows.length || !rows[0].settings_json) return null;
  try {
    const config = normalizePaymentQrConfig(JSON.parse(rows[0].settings_json));
    if (!config) return null;
    return {
      ...config,
      updatedAt: config.updatedAt || rows[0].updated_at || null,
    };
  } catch {
    return null;
  }
}

async function getActivePaymentQr(database, env = process.env) {
  const config = await loadPaymentQrConfig(database);
  const uploadRoot = resolvePaymentQrUploadRoot(env);
  if (!config || !uploadRoot) return null;
  const absolutePath = path.join(uploadRoot, config.filename);
  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
    return { ...config, uploadRoot, absolutePath };
  } catch {
    return null;
  }
}

module.exports = {
  PAYMENT_QR_MAX_BYTES,
  PAYMENT_QR_SETTING_KEY,
  detectPaymentQrImage,
  getActivePaymentQr,
  loadPaymentQrConfig,
  normalizePaymentQrConfig,
  resolvePaymentQrUploadRoot,
};
