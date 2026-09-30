const assert = require("node:assert/strict");
const {
  computeAvailableServings,
  isAutoMenuMissingIngredients,
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
  "Available",
);
assert.equal(
  isAutoMenuMissingIngredients(
    { ...autoMenu, manual_override: 1, manual_status: "Available" },
    [],
  ),
  false,
);
assert.equal(
  resolveProductAvailabilityStatus(
    { ...autoMenu, manual_override: 1, manual_status: "Out of Stock" },
    sufficient,
  ),
  "Out of Stock",
);

assert.equal(resolveProductAvailabilityStatus(autoMenu, sufficient), "Available");
assert.equal(resolveProductAvailabilityStatus(autoMenu, []), "Out of Stock");

assert.equal(
  resolveProductAvailabilityStatus(
    { item_type: "stock_item", remainingStock: 1, manual_override: 0 },
    [],
  ),
  "Available",
);

console.log("menu availability tests passed");
