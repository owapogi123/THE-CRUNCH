const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  clearSubscribersForTests,
  subscribe,
} = require("../services/applicationEvents");
const {
  publishMutationEvents,
} = require("./productCacheInvalidation");
const productCacheInvalidation = require("./productCacheInvalidation");

clearSubscribersForTests();
const topics = [];
const unsubscribe = subscribe({
  audience: "staff",
  role: "administrator",
  onEvent(event) {
    topics.push(event.topic);
  },
});
const cashierTopics = [];
const unsubscribeCashier = subscribe({
  audience: "staff",
  role: "cashier",
  onEvent(event) {
    cashierTopics.push(event.topic);
  },
});

publishMutationEvents({ method: "PUT", path: "/api/inventory/12" });
assert.deepEqual(topics, ["inventory.changed"]);

topics.length = 0;
publishMutationEvents({ method: "PUT", path: "/api/products/7" });
assert.deepEqual(topics, ["products.changed", "inventory.changed"]);

topics.length = 0;
cashierTopics.length = 0;
publishMutationEvents({
  method: "PATCH",
  path: "/api/purchase-orders/PO-0001/receive",
});
assert.deepEqual(topics, ["purchaseOrders.changed", "inventory.changed"]);
assert.deepEqual(cashierTopics, ["inventory.changed"], "cashier must not receive purchase-order notifications");

topics.length = 0;
publishMutationEvents({ method: "POST", path: "/api/orders" });
assert.deepEqual(topics, [], "Order routes publish precise events themselves");

topics.length = 0;
const rejectedResponse = new EventEmitter();
rejectedResponse.statusCode = 409;
productCacheInvalidation(
  { method: "PATCH", path: "/api/purchase-orders/PO-0001/receive" },
  rejectedResponse,
  () => {},
);
rejectedResponse.emit("finish");
assert.deepEqual(topics, [], "failed receiving must not publish SSE updates");

const committedResponse = new EventEmitter();
committedResponse.statusCode = 200;
productCacheInvalidation(
  { method: "PATCH", path: "/api/purchase-orders/PO-0001/receive" },
  committedResponse,
  () => {},
);
committedResponse.emit("finish");
assert.deepEqual(
  topics,
  ["purchaseOrders.changed", "inventory.changed"],
  "successful receiving publishes both updates after the response completes",
);

unsubscribe();
unsubscribeCashier();
clearSubscribersForTests();
console.log("product cache/event invalidation tests passed");
