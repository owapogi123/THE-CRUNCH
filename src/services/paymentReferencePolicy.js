"use strict";

const crypto = require("crypto");

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
  const [rows] = await connection.query(
    `SELECT Order_ID
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
