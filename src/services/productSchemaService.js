"use strict";

const { assertTableColumns } = require("./schemaAssertions");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("../db/schemaProfile");

const LEGACY_PRODUCT_SCHEMA_CONTRACT = {
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

const REDESIGNED_PRODUCT_SCHEMA_CONTRACT = {
  products: [
    "product_id", "name", "product_type", "menu_category_id",
    "inventory_category_id", "unit_id", "selling_price", "description",
    "image_url", "lifecycle_status", "availability_override",
    "tracking_method", "shelf_life_days",
  ],
  menu_categories: ["category_id", "system_key", "is_active"],
  inventory_balances: [
    "product_id", "on_hand", "reorder_point", "critical_point", "version",
  ],
  product_recipes: [
    "parent_product_id", "ingredient_product_id", "quantity_required", "unit_id",
  ],
  units: [
    "unit_id", "name", "abbreviation", "base_unit_id",
    "conversion_to_base", "is_active",
  ],
  inventory_batches: [
    "batch_id", "product_id", "remaining_quantity", "unit_id", "received_at",
    "expiry_at", "usable_until", "status",
  ],
};

// Keep this export as the legacy contract for callers/tests that imported it
// before schema profiles were introduced.
const PRODUCT_SCHEMA_CONTRACT = LEGACY_PRODUCT_SCHEMA_CONTRACT;

function getProductSchemaContract(profile = getSchemaProfile()) {
  return profile === REDESIGNED_SCHEMA_PROFILE
    ? REDESIGNED_PRODUCT_SCHEMA_CONTRACT
    : LEGACY_PRODUCT_SCHEMA_CONTRACT;
}

// Retain the public name for existing callers, but make it a strict read-only
// assertion. Schema creation/backfills belong to explicit administrative setup.
async function ensureProductSchema(db) {
  await assertTableColumns(
    db,
    getProductSchemaContract(),
    "Product schema",
  );
  return true;
}

module.exports = {
  LEGACY_PRODUCT_SCHEMA_CONTRACT,
  PRODUCT_SCHEMA_CONTRACT,
  REDESIGNED_PRODUCT_SCHEMA_CONTRACT,
  ensureProductSchema,
  getProductSchemaContract,
};
