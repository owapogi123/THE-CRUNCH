"use strict";

const crypto = require("crypto");
const {
  getSchemaProfile,
  REDESIGNED_SCHEMA_PROFILE,
} = require("../db/schemaProfile");

function canonicalizeProtectedPaymentReference(value) {
  return String(value || "").trim().toLowerCase();
}

function getProtectedPaymentReferenceLockName(value) {
  const canonicalReference = canonicalizeProtectedPaymentReference(value);
  if (!canonicalReference) return null;
  const digest = crypto
    .createHash("sha256")
    .update(canonicalReference, "utf8")
    .digest("hex");
  return `ordref:${digest.slice(0, 56)}`;
}

async function findProtectedPaymentReference(connection, value) {
  const canonicalReference = canonicalizeProtectedPaymentReference(value);
  if (!canonicalReference) return null;
  const redesigned = getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
  const [rows] = await connection.query(
    redesigned
      ? `SELECT order_id AS Order_ID
           FROM orders
          WHERE LOWER(TRIM(payment_reference)) = ?
            AND (payment_method IS NULL OR payment_method NOT IN ('GrabFood', 'foodpanda', 'Other'))
          LIMIT 1`
      : `SELECT Order_ID
           FROM orders
          WHERE LOWER(TRIM(payment_reference)) = ?
            AND (payment_method IS NULL OR payment_method NOT IN ('GrabFood', 'foodpanda', 'Other'))
          LIMIT 1`,
    [canonicalReference],
  );
  return rows[0] || null;
}

module.exports = {
  canonicalizeProtectedPaymentReference,
  findProtectedPaymentReference,
  getProtectedPaymentReferenceLockName,
};
