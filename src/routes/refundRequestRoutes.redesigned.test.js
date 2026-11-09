"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const state = { writes: [], readSql: [], commits: 0, rollbacks: 0 };
const connection = {
  async beginTransaction() {},
  async commit() { state.commits += 1; },
  async rollback() { state.rollbacks += 1; },
  release() {},
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT o.order_id AS id")) {
      return [[{
        id: 44,
        cashierId: 9,
        status: "Queued",
        prepStartedAt: null,
        startedAt: null,
        readyAt: null,
        orderNumberValue: 1004,
        requesterName: "Cashier Nine",
        requesterRole: "cashier",
        paymentStatus: "Paid",
      }]];
    }
    if (normalized.startsWith("SELECT refund_request_id AS id")) return [[]];
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalized)) {
      state.writes.push({ sql: normalized, params });
    }
    if (normalized.startsWith("INSERT INTO refund_requests")) return [{ insertId: 12 }];
    return [{ affectedRows: 1 }];
  },
};

mockModule("../config/db", {
  async getConnection() { return connection; },
  async query(sql) {
    state.readSql.push(String(sql).replace(/\s+/g, " ").trim());
    return [[]];
  },
});
mockModule("../services/applicationEvents", {
  publishOrderMutation() {},
  publishRefundRequestMutation() {},
});
mockModule("../services/staffNotificationService", {
  STAFF_NOTIFICATION_AUDIENCES: { ADMINISTRATOR: "administrator" },
  async createStaffNotification() {},
  async updateStaffNotificationStatus() {},
});

const router = require("./refundRequestRoutes");

function handler(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer);
  return layer.route.stack.at(-1).handle;
}

function capture() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    res: {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; },
    },
  };
}

(async () => {
  const created = capture();
  await handler("/", "post")(
    {
      user: { userId: 9, role: "cashier" },
      body: { orderId: 44, reason: "Customer changed their mind" },
    },
    created.res,
  );
  assert.equal(created.result.statusCode, 201);
  assert.equal(created.result.body.request.status, "Pending");
  const insert = state.writes.find((write) => write.sql.startsWith("INSERT INTO refund_requests"));
  assert.ok(insert);
  assert.match(insert.sql, /'pending'/);
  assert.ok(!insert.sql.includes("Order_ID"));

  const listed = capture();
  await handler("/", "get")({ query: { status: "Pending" } }, listed.res);
  assert.equal(listed.result.statusCode, 200);
  assert.deepEqual(listed.result.body, []);
  assert.ok(state.readSql.some((sql) => sql.includes("o.order_id = rr.order_id")));
  assert.ok(
    state.readSql.every(
      (sql) => !/\bJOIN Menu\b|\bFROM order_item\b|\bJOIN order_item\s/i.test(sql),
    ),
  );

  console.log("Redesigned refund-request compatibility tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
