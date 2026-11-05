const assert = require("node:assert/strict");
const {
  computeAvailableServings,
  deriveManualOverrideState,
  isAutoMenuMissingIngredients,
  normalizeMenuIngredients,
  resolveProductAvailabilityStatus,
} = require("./menuAvailability");

const autoMenu = {
  item_type: "menu_item",
  manual_override: 0,
  remainingStock: 20,
};

assert.equal(resolveProductAvailabilityStatus(autoMenu, []), "Out of Stock");
assert.equal(isAutoMenuMissingIngredients(autoMenu, []), true);

const sufficient = [{ quantity_required: 2.5, stock: 10 }];
assert.equal(computeAvailableServings(sufficient), 4);
assert.equal(resolveProductAvailabilityStatus(autoMenu, sufficient), "Available");

const insufficient = [{ quantity_required: 2.5, stock: 0 }];
assert.equal(resolveProductAvailabilityStatus(autoMenu, insufficient), "Out of Stock");

assert.equal(
  resolveProductAvailabilityStatus(
    { ...autoMenu, manual_override: 1, manual_status: "Available" },
    [],
  ),
  "Out of Stock",
);
assert.equal(
  isAutoMenuMissingIngredients(
    { ...autoMenu, manual_override: 1, manual_status: "Available" },
    [],
  ),
  true,
);
assert.equal(
  resolveProductAvailabilityStatus(
    { ...autoMenu, manual_override: 1, manual_status: "Out of Stock" },
    sufficient,
  ),
  "Out of Stock",
);

assert.deepEqual(deriveManualOverrideState({ override_mode: "Auto" }), {
  manualOverride: 0,
  manualStatus: "Available",
});
assert.deepEqual(
  deriveManualOverrideState({ override_mode: "Force Out of Stock" }),
  { manualOverride: 1, manualStatus: "Out of Stock" },
);
assert.throws(
  () => deriveManualOverrideState({ override_mode: "Force Available" }),
  /no longer supported/i,
);

assert.deepEqual(
  normalizeMenuIngredients([
    { product_id: 4, quantity_required: 0.125 },
    { product_id: 4, quantity_required: 0.375 },
  ]),
  [{ productId: 4, quantityRequired: 0.5 }],
);
assert.throws(
  () =>
    normalizeMenuIngredients([
      { product_id: 4, quantity_required: 0.00001 },
    ]),
  /at most 4 decimal places/i,
);
assert.throws(
  () =>
    deriveManualOverrideState({
      manual_override: true,
      manual_status: "Available",
    }),
  /no longer supported/i,
);

assert.equal(resolveProductAvailabilityStatus(autoMenu, sufficient), "Available");
assert.equal(resolveProductAvailabilityStatus(autoMenu, []), "Out of Stock");
assert.equal(
  resolveProductAvailabilityStatus(
    { ...autoMenu, availability_status: "Hidden" },
    sufficient,
  ),
  "Hidden",
);

assert.equal(
  resolveProductAvailabilityStatus(
    { item_type: "stock_item", remainingStock: 1, manual_override: 0 },
    [],
  ),
  "Available",
);

console.log("menu availability tests passed");
