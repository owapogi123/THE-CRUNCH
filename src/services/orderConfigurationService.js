"use strict";

async function loadCashierOrderConfiguration(connection, discountName, discountId) {
  const normalizedName = String(discountName || "").trim();
  const normalizedDiscountId = Number(discountId);
  const hasDiscountId = Number.isSafeInteger(normalizedDiscountId) && normalizedDiscountId > 0;
  const [rows] = await connection.query(
    `SELECT
       settings.settings_json,
       discount.discount_id,
       discount.name AS discount_name,
       discount.percentage AS discount_percentage
     FROM (SELECT 1 AS singleton) anchor
     LEFT JOIN system_settings settings
       ON settings.setting_key = 'restaurant_settings'
     LEFT JOIN (
       SELECT discount_id, name, percentage
       FROM discount_types
       WHERE (
         (? IS NOT NULL AND discount_id = ?)
         OR (? IS NULL AND LOWER(name) = LOWER(?))
       )
       AND is_active = TRUE
       LIMIT 1
     ) discount ON TRUE`,
    [
      hasDiscountId ? normalizedDiscountId : null,
      hasDiscountId ? normalizedDiscountId : null,
      hasDiscountId ? normalizedDiscountId : null,
      normalizedName,
    ],
  );
  let parsedSettings = {};
  try {
    parsedSettings = rows[0]?.settings_json ? JSON.parse(rows[0].settings_json) : {};
  } catch {
    parsedSettings = {};
  }
  return {
    billingSettings: {
      taxRate: Math.max(0, Number(parsedSettings?.taxRate ?? 0) || 0),
      serviceCharge: Math.max(0, Number(parsedSettings?.serviceCharge ?? 0) || 0),
    },
    receiptSettings: {
      restaurantName: String(parsedSettings?.restaurantName || "").trim() || "The Crunch",
      tagline: String(parsedSettings?.tagline || "").trim(),
      email: String(parsedSettings?.email || "").trim(),
      phone: String(parsedSettings?.phone || "").trim(),
      address: String(parsedSettings?.address || "").trim(),
      currency: String(parsedSettings?.currency || "").trim() || "PHP",
      timezone: String(parsedSettings?.timezone || "").trim() || "Asia/Manila",
    },
    discount: rows[0]?.discount_name
      ? {
          discountId: Number(rows[0].discount_id),
          discountName: String(rows[0].discount_name),
          discountRate: Math.max(0, Number(rows[0].discount_percentage || 0) || 0),
        }
      : { discountId: null, discountName: "", discountRate: 0 },
  };
}

function calculateBillingTotals(subtotal, settings, discountRate = 0) {
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  const safeDiscountRate = Math.max(0, Number(discountRate || 0));
  const discountAmount = safeSubtotal * (safeDiscountRate / 100);
  const taxAmount = safeSubtotal * (Number(settings.taxRate || 0) / 100);
  const serviceChargeAmount = safeSubtotal * (Number(settings.serviceCharge || 0) / 100);
  return {
    subtotal: safeSubtotal,
    discountAmount,
    taxAmount,
    serviceChargeAmount,
    grandTotal: safeSubtotal - discountAmount + taxAmount + serviceChargeAmount,
  };
}

module.exports = {
  calculateBillingTotals,
  loadCashierOrderConfiguration,
};
