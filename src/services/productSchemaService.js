"use strict";

const { assertTableColumns } = require("./schemaAssertions");

const PRODUCT_SCHEMA_CONTRACT = {
  products: [
    "id", "name", "price", "quantity", "image", "menu_code",
    "availability_status", "is_promotional", "promo_price", "promo_label",
    "item_type",
  ],
  Menu: ["Product_ID", "manual_override", "manual_status"],
  Inventory: [
    "Product_ID", "unit", "Reorder_Point", "Critical_Point",
    "use_default_thresholds", "low_stock_threshold", "critical_stock_threshold",
  ],
  menu_item_ingredients: [
    "menu_product_id", "product_id", "quantity_required",
  ],
};

// Retain the public name for existing callers, but make it a strict read-only
// assertion. Schema creation/backfills belong to explicit administrative setup.
async function ensureProductSchema(db) {
  await assertTableColumns(db, PRODUCT_SCHEMA_CONTRACT, "Product schema");
  return true;
}

module.exports = {
  PRODUCT_SCHEMA_CONTRACT,
  ensureProductSchema,
};
