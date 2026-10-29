const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  getCancellationEligibility,
  getRefundEligibility,
  getSettlementEligibility,
  hasPreparationStarted,
} = require("./refundEligibility");

const cases = [
  ["Pending Payment", "Pending Payment", false, "not_paid"],
  ["Queued", "Paid", true, "eligible"],
  ["Preparing", "Paid", false, "preparation_started"],
  ["Ready", "Paid", false, "preparation_started"],
  ["Ready for Pickup", "Paid", false, "preparation_started"],
  ["Completed", "Paid", false, "preparation_started"],
  ["Picked Up", "Paid", false, "preparation_started"],
  ["Refunded", "Paid", false, "already_refunded"],
  ["Cancelled", "Paid", false, "cancelled"],
];

test("refund eligibility follows the approved state matrix", () => {
  for (const [status, paymentStatus, eligible, code] of cases) {
    assert.deepEqual(
      getRefundEligibility({ status, paymentStatus }),
      {
        eligible,
        code,
        message: getRefundEligibility({ status, paymentStatus }).message,
      },
      `${status}/${paymentStatus}`,
    );
  }
});

test("preparation timestamps permanently block a refund after status changes", () => {
  const revertedToQueued = {
    status: "Queued",
    paymentStatus: "Paid",
    prepStartedAt: new Date("2026-10-23T09:00:00Z"),
  };
  assert.equal(hasPreparationStarted(revertedToQueued), true);
  assert.equal(getRefundEligibility(revertedToQueued).eligible, false);
  assert.equal(getRefundEligibility(revertedToQueued).code, "preparation_started");
});

test("cancellation eligibility permits only unpaid orders before preparation", () => {
  assert.equal(
    getCancellationEligibility({ status: "Queued", paymentStatus: "Pending Payment" }).eligible,
    true,
  );
  assert.equal(
    getCancellationEligibility({ status: "Queued", paymentStatus: "Paid" }).code,
    "paid",
  );
  assert.equal(
    getCancellationEligibility({ status: "Preparing", paymentStatus: "Pending Payment" }).code,
    "preparation_started",
  );
  assert.equal(
    getCancellationEligibility({
      status: "Queued",
      paymentStatus: "Pending Payment",
      prepStartedAt: new Date("2026-10-23T09:00:00Z"),
    }).code,
    "preparation_started",
  );
});

test("the shared settlement policy rejects terminal and unsupported actions", () => {
  for (const status of ["Ready", "Completed", "Cancelled", "Refunded"]) {
    assert.equal(
      getSettlementEligibility({ status, paymentStatus: "Paid" }, "refund").eligible,
      false,
      `${status} refund`,
    );
    assert.equal(
      getSettlementEligibility({ status, paymentStatus: "Pending Payment" }, "cancel").eligible,
      false,
      `${status} cancellation`,
    );
  }
  assert.equal(getSettlementEligibility({}, "other").code, "invalid_action");
});

test("inventory restoration remains row-locked and exact-once guarded", () => {
  const source = fs.readFileSync(path.join(__dirname, "inventoryService.js"), "utf8");
  const restoreFunction = source.slice(source.indexOf("async function restoreStockForRefundedOrder"));
  assert.match(restoreFunction, /FOR UPDATE/);
  assert.match(restoreFunction, /stockDeducted\) !== 1/);
  assert.match(restoreFunction, /SET stock_deducted = 0/);
  assert.match(restoreFunction, /COALESCE\(stock_deducted, 0\) = 1/);
  assert.match(restoreFunction, /successfully refunded order/);
});
