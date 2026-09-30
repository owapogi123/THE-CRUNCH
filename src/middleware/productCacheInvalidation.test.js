const assert = require("node:assert/strict");
const {
  clearSubscribersForTests,
  subscribe,
} = require("../services/applicationEvents");
const {
  publishMutationEvents,
} = require("./productCacheInvalidation");

clearSubscribersForTests();
const topics = [];
const unsubscribe = subscribe({
  audience: "staff",
  onEvent(event) {
    topics.push(event.topic);
  },
});

publishMutationEvents({ method: "PUT", path: "/api/inventory/12" });
assert.deepEqual(topics, ["inventory.changed"]);

topics.length = 0;
publishMutationEvents({ method: "PUT", path: "/api/products/7" });
assert.deepEqual(topics, ["products.changed", "inventory.changed"]);

topics.length = 0;
publishMutationEvents({
  method: "PATCH",
  path: "/api/purchase-orders/PO-0001/receive",
});
assert.deepEqual(topics, ["purchaseOrders.changed", "inventory.changed"]);

topics.length = 0;
publishMutationEvents({ method: "POST", path: "/api/orders" });
assert.deepEqual(topics, [], "Order routes publish precise events themselves");

unsubscribe();
clearSubscribersForTests();
console.log("product cache/event invalidation tests passed");
