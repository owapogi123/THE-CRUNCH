"use strict";

const assert = require("node:assert/strict");
const {
  STAFF_NOTIFICATION_AUDIENCES,
  canAccessStaffNotifications,
  createStaffNotification,
  getAudienceCondition,
  listStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  mapStaffNotificationRow,
} = require("./staffNotificationService");

assert.equal(canAccessStaffNotifications("administrator"), true);
assert.equal(canAccessStaffNotifications("Inventory Manager"), true);
for (const role of ["cashier", "cook", "customer", null]) {
  assert.equal(canAccessStaffNotifications(role), false, String(role));
}
assert.deepEqual(getAudienceCondition("administrator").audiences, [
  "administrator",
  STAFF_NOTIFICATION_AUDIENCES.BOTH,
]);
assert.deepEqual(getAudienceCondition("inventory_manager").audiences, [
  "inventory_manager",
  STAFF_NOTIFICATION_AUDIENCES.BOTH,
]);
assert.equal(
  getAudienceCondition("inventory_manager").audiences.includes(
    STAFF_NOTIFICATION_AUDIENCES.ADMINISTRATOR,
  ),
  false,
  "Administrator-only notifications must not be selected for Inventory Managers",
);

(async () => {
  const calls = [];
  let createCount = 0;
  const database = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith("INSERT INTO staff_notifications")) {
        createCount += 1;
        return [{ insertId: createCount === 1 ? 44 : 0, affectedRows: createCount === 1 ? 1 : 0 }];
      }
      if (normalized.startsWith("SELECT notification.notification_id")) {
        return [[{
          notification_id: 44,
          category: "refund_request",
          event_type: "refund_request.created",
          entity_id: "9",
          title: "Refund request · ORD-009",
          message: "Duplicate charge",
          status: "Pending",
          metadata_json: JSON.stringify({ orderNumber: "ORD-009" }),
          actor_user_id: 3,
          created_at: "2026-10-29T01:00:00.000Z",
          updated_at: "2026-10-29T01:00:00.000Z",
          resolved_at: null,
          read_at: null,
        }]];
      }
      if (normalized.startsWith("SELECT COUNT(*) AS unread_count")) {
        return [[{ unread_count: 1 }]];
      }
      if (normalized.startsWith("INSERT INTO staff_notification_reads")) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };

  const notification = {
    dedupeKey: "refund_request:order:9",
    category: "refund_request",
    eventType: "refund_request.created",
    entityId: 9,
    audience: STAFF_NOTIFICATION_AUDIENCES.ADMINISTRATOR,
    actorUserId: 3,
    title: "Refund request · ORD-009",
    message: "Duplicate charge",
    status: "Pending",
    metadata: { orderNumber: "ORD-009" },
  };
  assert.deepEqual(await createStaffNotification(database, notification), {
    notificationId: 44,
    created: true,
  });
  assert.deepEqual(await createStaffNotification(database, notification), {
    notificationId: null,
    created: false,
  });
  assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE/);

  const listed = await listStaffNotifications(database, {
    userId: 8,
    role: "administrator",
  });
  assert.equal(listed.unreadCount, 1);
  assert.equal(listed.notifications[0].is_read, false);
  assert.equal(listed.notifications[0].metadata.orderNumber, "ORD-009");
  const listCall = calls.find((call) => call.sql.startsWith("SELECT notification.notification_id"));
  assert.deepEqual(listCall.params.slice(0, 4), [
    8,
    "administrator",
    STAFF_NOTIFICATION_AUDIENCES.BOTH,
    8,
  ]);
  assert.match(listCall.sql, /actor_user_id IS NULL OR notification\.actor_user_id <> \?/);

  assert.equal(await markStaffNotificationRead(database, {
    notificationId: 44,
    userId: 8,
    role: "administrator",
  }), true);
  assert.equal(await markAllStaffNotificationsRead(database, {
    userId: 8,
    role: "administrator",
  }), 1);
  assert.equal(await markStaffNotificationRead(database, {
    notificationId: 44,
    userId: 8,
    role: "cashier",
  }), false);

  const receivedPurchaseOrderNotification = mapStaffNotificationRow({
    notification_id: "91",
    category: "purchase_order",
    event_type: "purchase_order.received",
    entity_id: "PO-0007",
    title: "Purchase order received",
    message: "Supplier · Status: Received",
    status: "Received",
    metadata_json: JSON.stringify({ poId: "PO-0007", status: "Received" }),
    actor_user_id: null,
    created_at: "2026-11-02T01:00:00.000Z",
    updated_at: "2026-11-02T01:00:00.000Z",
    resolved_at: null,
    read_at: null,
  });
  assert.equal(receivedPurchaseOrderNotification.notification_id, 91);
  assert.equal(receivedPurchaseOrderNotification.status, "Received");

  const idempotentReadQueries = [];
  const idempotentDatabase = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      idempotentReadQueries.push(normalized);
      if (normalized.startsWith("INSERT INTO staff_notification_reads")) {
        return [{ affectedRows: 0, insertId: 0 }];
      }
      if (normalized.startsWith("SELECT notification.notification_id")) {
        return [[{ notification_id: 91 }]];
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };
  assert.equal(await markStaffNotificationRead(idempotentDatabase, {
    notificationId: receivedPurchaseOrderNotification.notification_id,
    userId: 8,
    role: "administrator",
  }), true, "an already-read received-PO notification remains an idempotent success");
  const readInsertSql = idempotentReadQueries.find((sql) =>
    sql.startsWith("INSERT INTO staff_notification_reads"));
  assert.match(readInsertSql, /ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP$/);
  const duplicateUpdateSql = readInsertSql.split("ON DUPLICATE KEY UPDATE")[1];
  assert.doesNotMatch(duplicateUpdateSql, /LAST_INSERT_ID|notification_id/);
  assert.equal(
    idempotentReadQueries.some((sql) =>
      /purchase_orders|purchase_order_items|inventory|batches|receipt/i.test(sql),
    ),
    false,
    "marking a notification read must not query or mutate PO, receipt, or inventory data",
  );

  const missingDatabase = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("INSERT INTO staff_notification_reads")) {
        return [{ affectedRows: 0, insertId: 0 }];
      }
      if (normalized.startsWith("SELECT notification.notification_id")) return [[]];
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };
  assert.equal(await markStaffNotificationRead(missingDatabase, {
    notificationId: 999,
    userId: 8,
    role: "administrator",
  }), false, "a genuinely missing notification still returns not found");

  console.log("Staff notification lifecycle, visibility, and read-state tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
