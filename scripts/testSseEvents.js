const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";

const {
  EVENT_TOPICS,
  clearSubscribersForTests,
  getSubscriberCount,
  publish,
} = require("../src/services/applicationEvents");
const { createEventRouter } = require("../src/routes/eventRoutes");

const secret = process.env.JWT_SECRET || "secretkey";

function token(payload) {
  return jwt.sign(payload, secret, { expiresIn: "5m" });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(predicate, message, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(10);
  }
  assert.fail(message);
}

async function openStream(baseUrl, authToken, query = "") {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/events/stream${query}`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${authToken}`,
    },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
  assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(response.headers.get("x-accel-buffering"), "no");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const client = { controller, reader, text: "", waiters: new Set() };
  client.pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        client.text += decoder.decode(value, { stream: true });
        for (const notify of [...client.waiters]) notify();
      }
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
    }
  })();
  return client;
}

function waitForText(client, predicate, message, timeoutMs = 1_500) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!predicate(client.text)) return;
      clearTimeout(timer);
      client.waiters.delete(check);
      resolve(client.text);
    };
    const timer = setTimeout(() => {
      client.waiters.delete(check);
      reject(new Error(message));
    }, timeoutMs);
    client.waiters.add(check);
    check();
  });
}

async function closeClient(client) {
  client.controller.abort();
  await client.pump.catch(() => undefined);
}

async function main() {
  clearSubscribersForTests();
  const app = express();
  app.use("/api/events", createEventRouter({ heartbeatMs: 40 }));
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  try {
    assert.equal((await fetch(`${baseUrl}/api/events/stream`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/events/stream`, {
      headers: { Authorization: "Bearer invalid" },
    })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/events/stream`, {
      headers: { Authorization: `Bearer ${token({ userId: 9, role: "guest" })}` },
    })).status, 403);

    const expiringClient = await openStream(
      baseUrl,
      jwt.sign({ userId: 8, role: "cashier" }, secret, { expiresIn: "1s" }),
    );
    await waitForCondition(
      () => getSubscriberCount() === 1,
      "expiring stream was not registered",
    );
    await Promise.race([
      expiringClient.pump,
      wait(2_500).then(() => assert.fail("expired JWT stream was not closed")),
    ]);
    await waitForCondition(
      () => getSubscriberCount() === 0,
      "expired JWT subscriber was not cleaned up",
    );

    const staffTokens = ["administrator", "cashier", "cook", "inventory_manager"]
      .map((role, index) => token({ userId: index + 1, role }));
    for (const staffToken of staffTokens) {
      clients.push(await openStream(baseUrl, staffToken));
    }
    const customerOne = await openStream(
      baseUrl,
      token({ userId: 101, role: "customer" }),
    );
    const customerTwo = await openStream(
      baseUrl,
      token({ userId: 202, role: "customer" }),
      "?audience=staff",
    );
    clients.push(customerOne, customerTwo);

    await waitForCondition(
      () => getSubscriberCount() === 6,
      "all SSE clients should be registered",
    );
    assert.equal(getSubscriberCount("staff"), 4);
    assert.equal(getSubscriberCount("customer"), 2);
    await Promise.all(clients.map((client) => waitForText(
      client,
      (text) => text.includes("event: connected"),
      "stream did not send its connected frame",
    )));
    await waitForText(
      clients[0],
      (text) => text.includes(": heartbeat"),
      "stream heartbeat was not observed",
    );

    publish(EVENT_TOPICS.ORDERS_CHANGED, {
      reason: "order.status_updated",
      customerUserIds: [101],
    });
    await Promise.all([...clients.slice(0, 4), customerOne].map((client) =>
      waitForText(
        client,
        (text) => text.includes('"reason":"order.status_updated"'),
        "eligible client did not receive order invalidation",
      ),
    ));
    await wait(100);
    assert.equal(
      customerTwo.text.includes('"reason":"order.status_updated"'),
      false,
      "an unrelated customer received another customer's event",
    );

    const eventMatch = customerOne.text.match(/event: invalidation\ndata: (\{[^\n]+\})/);
    assert(eventMatch, "customer invalidation frame was missing");
    const customerEvent = JSON.parse(eventMatch[1]);
    assert.deepEqual(Object.keys(customerEvent).sort(), ["reason", "timestamp", "topic"]);
    assert.equal(customerEvent.topic, "orders.changed");

    publish(EVENT_TOPICS.PAYMENTS_CHANGED, { reason: "order.payment_updated" });
    await Promise.all(clients.slice(0, 4).map((client) => waitForText(
      client,
      (text) => text.includes('"reason":"order.payment_updated"'),
      "staff client did not receive payment invalidation",
    )));
    await wait(100);
    assert.equal(customerOne.text.includes('"reason":"order.payment_updated"'), false);
    assert.equal(customerTwo.text.includes('"reason":"order.payment_updated"'), false);

    await Promise.all(clients.map(closeClient));
    await waitForCondition(
      () => getSubscriberCount() === 0,
      "SSE subscriber count did not return to baseline",
    );

    console.log(JSON.stringify({
      authentication: "pass",
      tokenExpirationClosesStream: "pass",
      sseHeadersAndConnectedFrame: "pass",
      heartbeat: "pass",
      fourStaffClients: "pass",
      customerTargeting: "pass",
      minimalPayload: "pass",
      subscriberCleanup: "pass",
    }, null, 2));
  } finally {
    await Promise.all(clients.map((client) => closeClient(client).catch(() => undefined)));
    clearSubscribersForTests();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
