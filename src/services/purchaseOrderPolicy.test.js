const assert = require("node:assert/strict");
const {
  getGenericTransitionError,
  getReceiveTransitionError,
  getUnitCompatibilityError,
} = require("./purchaseOrderPolicy");

assert.equal(getGenericTransitionError("Draft", "Ordered"), null);
assert.equal(getGenericTransitionError("Draft", "Cancelled"), null);
assert.equal(getGenericTransitionError("Ordered", "Cancelled"), null);
assert.match(
  getGenericTransitionError("Ordered", "Received").message,
  /receiving workflow/i,
);
assert.ok(getGenericTransitionError("Received", "Cancelled"));
assert.ok(getGenericTransitionError("Cancelled", "Ordered"));
assert.ok(getGenericTransitionError("Draft", "Draft"));

assert.equal(getReceiveTransitionError("Ordered"), null);
for (const status of ["Draft", "Received", "Cancelled"]) {
  assert.equal(getReceiveTransitionError(status).statusCode, 409);
}

assert.equal(getUnitCompatibilityError(" kg ", "KG", ["kg"]), null);
assert.match(getUnitCompatibilityError("kg", "g", []), /does not match/i);
assert.match(getUnitCompatibilityError("kg", "kg", ["g"]), /ambiguous/i);
assert.match(getUnitCompatibilityError("", "kg", []), /missing/i);

console.log("Purchase-order transition and unit policy tests passed");
