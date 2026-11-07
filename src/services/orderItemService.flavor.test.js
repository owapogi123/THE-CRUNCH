"use strict";

const assert = require("node:assert/strict");
const { normalizeOrderItems } = require("./orderItemService");

const normalized = normalizeOrderItems([
  { product_id: 10, qty: 1, selected_flavor_product_id: 20 },
  { product_id: 10, qty: 2, selected_flavor_product_id: 20 },
  { product_id: 10, qty: 1, selected_flavor_product_id: 21 },
  { product_id: 11, qty: 3 },
]);

assert.deepEqual(normalized, [
  { product_id: 10, qty: 3, selected_flavor_product_id: 20 },
  { product_id: 10, qty: 1, selected_flavor_product_id: 21 },
  { product_id: 11, qty: 3 },
]);
assert.throws(
  () => normalizeOrderItems([
    { product_id: 10, qty: 1, selected_flavor_product_id: 10 },
  ]),
  /cannot select itself/i,
);

console.log("Chicken flavor order-item normalization tests passed");
