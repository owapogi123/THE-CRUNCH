const EVENT_TOPICS = Object.freeze({
  ORDERS_CHANGED: "orders.changed",
  PAYMENTS_CHANGED: "payments.changed",
  INVENTORY_CHANGED: "inventory.changed",
  PRODUCTS_CHANGED: "products.changed",
  PURCHASE_ORDERS_CHANGED: "purchaseOrders.changed",
  REFUND_REQUESTS_CHANGED: "refundRequests.changed",
});

const supportedTopics = new Set(Object.values(EVENT_TOPICS));
const subscribers = new Set();
let nextSubscriberId = 1;

function normalizeCustomerIds(values) {
  return new Set(
    (Array.isArray(values) ? values : [values])
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0),
  );
}

function canReceive(subscriber, topic, customerUserIds, targetRoles) {
  if (subscriber.audience === "staff") {
    return targetRoles.size === 0 || targetRoles.has(subscriber.role);
  }
  return (
    subscriber.audience === "customer" &&
    topic === EVENT_TOPICS.ORDERS_CHANGED &&
    customerUserIds.has(subscriber.userId)
  );
}

function subscribe({ audience, userId = null, role = null, onEvent }) {
  if (audience !== "staff" && audience !== "customer") {
    throw new Error("Invalid event subscriber audience");
  }
  if (typeof onEvent !== "function") {
    throw new Error("Event subscriber requires an onEvent callback");
  }

  const subscriber = {
    id: nextSubscriberId++,
    audience,
    userId: Number(userId) || null,
    role: String(role || "").trim().toLowerCase() || null,
    onEvent,
  };
  subscribers.add(subscriber);

  let active = true;
  return () => {
    if (!active) return false;
    active = false;
    return subscribers.delete(subscriber);
  };
}

function publish(topic, { reason = "data.changed", customerUserIds = [], targetRoles = [] } = {}) {
  if (!supportedTopics.has(topic)) {
    throw new Error(`Unsupported application event topic: ${topic}`);
  }

  const targetedCustomerIds = normalizeCustomerIds(customerUserIds);
  const targetedRoles = new Set(
    (Array.isArray(targetRoles) ? targetRoles : [targetRoles])
      .map((role) => String(role || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const event = Object.freeze({
    topic,
    timestamp: new Date().toISOString(),
    reason: String(reason || "data.changed"),
  });
  let delivered = 0;

  for (const subscriber of [...subscribers]) {
    if (!canReceive(subscriber, topic, targetedCustomerIds, targetedRoles)) continue;
    try {
      subscriber.onEvent(event);
      delivered += 1;
    } catch (error) {
      console.warn("Application event subscriber failed:", error.message);
    }
  }

  return delivered;
}

function publishRefundRequestMutation({ reason = "refund_request.changed" } = {}) {
  return publish(EVENT_TOPICS.REFUND_REQUESTS_CHANGED, {
    reason,
    targetRoles: ["administrator"],
  });
}

function publishOrderMutation({
  reason,
  customerUserId = null,
  paymentChanged = false,
  inventoryChanged = false,
}) {
  const customerUserIds = customerUserId ? [customerUserId] : [];
  publish(EVENT_TOPICS.ORDERS_CHANGED, { reason, customerUserIds });
  if (paymentChanged) {
    publish(EVENT_TOPICS.PAYMENTS_CHANGED, { reason });
  }
  if (inventoryChanged) {
    publish(EVENT_TOPICS.INVENTORY_CHANGED, { reason });
  }
}

function getSubscriberCount(audience) {
  if (!audience) return subscribers.size;
  return [...subscribers].filter((entry) => entry.audience === audience).length;
}

function clearSubscribersForTests() {
  subscribers.clear();
}

module.exports = {
  EVENT_TOPICS,
  clearSubscribersForTests,
  getSubscriberCount,
  publish,
  publishOrderMutation,
  publishRefundRequestMutation,
  subscribe,
};
