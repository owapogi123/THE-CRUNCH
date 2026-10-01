const assert = require("node:assert/strict");
const {
  clearSubscribersForTests,
  publishRefundRequestMutation,
  subscribe,
} = require("./applicationEvents");

clearSubscribersForTests();
const received = { administrator: 0, cashier: 0, inventory_manager: 0, customer: 0 };
const unsubscribers = [
  subscribe({ audience: "staff", role: "administrator", onEvent: () => { received.administrator += 1; } }),
  subscribe({ audience: "staff", role: "cashier", onEvent: () => { received.cashier += 1; } }),
  subscribe({ audience: "staff", role: "inventory_manager", onEvent: () => { received.inventory_manager += 1; } }),
  subscribe({ audience: "customer", userId: 44, role: "customer", onEvent: () => { received.customer += 1; } }),
];

const delivered = publishRefundRequestMutation({ reason: "refund_request.test" });
assert.equal(delivered, 1);
assert.deepEqual(received, {
  administrator: 1,
  cashier: 0,
  inventory_manager: 0,
  customer: 0,
});

unsubscribers.forEach((unsubscribe) => unsubscribe());
clearSubscribersForTests();
console.log("Refund request event targeting tests passed");
