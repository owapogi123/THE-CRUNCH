const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  getFinalizedSaleSql,
  isFinalizedSale,
} = require("./financialStatus");

const cases = [
  ["Pending", "Pending Payment", false],
  ["Queued", "Paid", false],
  ["Preparing", "Paid", false],
  ["Ready", "Paid", false],
  ["Completed", "Paid", true],
  ["Picked Up", "Completed", true],
  ["Cancelled", "Paid", false],
  ["Refunded", "Paid", false],
  ["Completed", "Pending Payment", false],
];

test("only paid completed orders are finalized sales", () => {
  for (const [status, paymentStatus, expected] of cases) {
    assert.equal(
      isFinalizedSale({ status, paymentStatus }),
      expected,
      `${status}/${paymentStatus}`,
    );
  }
});

test("the SQL predicate applies the same status and payment rules", () => {
  const sql = getFinalizedSaleSql("o");
  assert.match(sql, /o\.Status/);
  assert.match(sql, /'completed', 'picked up'/);
  assert.match(sql, /o\.payment_status/);
  assert.match(sql, /'paid', 'completed'/);
  assert.throws(() => getFinalizedSaleSql("o; DROP TABLE orders"));
});

test("soldToday uses finalized sales and ingredient quantities", () => {
  const route = fs.readFileSync(
    path.join(__dirname, "..", "routes", "inventoryRoutes.js"),
    "utf8",
  );
  assert.match(route, /getFinalizedSaleSql\("o"\)/);
  assert.match(route, /COALESCE\(mi\.product_id, oi\.Product_ID\)/);
  assert.match(route, /COALESCE\(mi\.quantity_required, 1\)/);
});
