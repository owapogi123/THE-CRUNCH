"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  getVisibleInventoryAlertSeverities,
  listInventoryNotifications,
  markAllInventoryNotificationsRead,
  markInventoryNotificationRead,
  planInventoryAlertReconciliation,
} = require("./inventoryNotificationService");

function observed(severity, stock = 4) {
  return {
    inventory_id: 11,
    product_id: 21,
    product_name: "Test Ingredient",
    category: "Ingredients",
    unit: "kg",
    mainStock: stock,
    severity,
    thresholds: { low: 10, critical: 5 },
  };
}

function createReadStateDb() {
  const now = new Date("2026-10-29T08:00:00.000Z");
  const alerts = [
    { alert_id: 1, inventory_id: 1, severity: "low", product_name: "Low" },
    { alert_id: 2, inventory_id: 2, severity: "critical", product_name: "Critical" },
    { alert_id: 3, inventory_id: 3, severity: "out", product_name: "Out" },
  ].map((alert) => ({
    product_id: alert.inventory_id,
    category: "Test",
    unit: "piece",
    stock_value: 1,
    low_threshold: 10,
    critical_threshold: 5,
    created_at: now,
    last_observed_at: now,
    resolved_at: null,
    resolution_reason: null,
    ...alert,
  }));
  const reads = new Map();

  return {
    reads,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("INSERT INTO inventory_alert_reads")) {
        const userId = Number(params[0]);
        const isOne = normalized.includes("alert.alert_id = ?");
        const alertId = isOne ? Number(params[1]) : null;
        const severities = params.slice(isOne ? 2 : 1).map(String);
        const matches = alerts.filter(
          (alert) =>
            severities.includes(alert.severity) &&
            (alertId == null || alert.alert_id === alertId),
        );
        for (const alert of matches) {
          reads.set(`${alert.alert_id}:${userId}`, now);
        }
        return [{ affectedRows: matches.length }];
      }
      if (normalized.startsWith("SELECT COUNT(*) AS unread_count")) {
        const userId = Number(params[0]);
        const severities = params.slice(1).map(String);
        const unread = alerts.filter(
          (alert) =>
            severities.includes(alert.severity) &&
            !reads.has(`${alert.alert_id}:${userId}`),
        ).length;
        return [[{ unread_count: unread }]];
      }
      if (normalized.startsWith("SELECT alert.alert_id")) {
        const userId = Number(params[0]);
        const severities = params.slice(1, -1).map(String);
        return [alerts
          .filter((alert) => severities.includes(alert.severity))
          .map((alert) => ({
            ...alert,
            read_at: reads.get(`${alert.alert_id}:${userId}`) || null,
          }))];
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };
}

(async () => {
  assert.deepEqual(getVisibleInventoryAlertSeverities("administrator"), [
    "low",
    "critical",
    "out",
  ]);
  assert.deepEqual(getVisibleInventoryAlertSeverities("inventory_manager"), [
    "critical",
    "out",
  ]);
  for (const role of ["cashier", "cook", "customer", ""]) {
    assert.deepEqual(getVisibleInventoryAlertSeverities(role), []);
  }

  const created = planInventoryAlertReconciliation([], [observed("low", 8)]);
  assert.equal(created.create.length, 1);
  assert.equal(created.resolve.length, 0);

  const activeLow = [{ alert_id: 101, inventory_id: 11, severity: "low" }];
  const duplicateRefresh = planInventoryAlertReconciliation(
    activeLow,
    [observed("low", 7)],
  );
  assert.equal(duplicateRefresh.create.length, 0);
  assert.equal(duplicateRefresh.resolve.length, 0);
  assert.equal(duplicateRefresh.refresh[0].alertId, 101);

  const severityChange = planInventoryAlertReconciliation(
    activeLow,
    [observed("critical", 4)],
  );
  assert.deepEqual(severityChange.resolve, [
    { alertId: 101, reason: "severity_changed" },
  ]);
  assert.equal(severityChange.create[0].severity, "critical");

  const recovered = planInventoryAlertReconciliation(
    [{ alert_id: 102, inventory_id: 11, severity: "critical" }],
    [observed("normal", 20)],
  );
  assert.deepEqual(recovered.resolve, [{ alertId: 102, reason: "recovered" }]);
  assert.equal(recovered.create.length, 0);

  const recurrence = planInventoryAlertReconciliation([], [observed("low", 9)]);
  assert.equal(recurrence.create.length, 1, "a recovered item starts a new episode");

  const removed = planInventoryAlertReconciliation(activeLow, []);
  assert.deepEqual(removed.resolve, [
    { alertId: 101, reason: "inventory_removed" },
  ]);

  const db = createReadStateDb();
  const userOneBefore = await listInventoryNotifications(db, {
    userId: 10,
    role: "administrator",
  });
  assert.equal(userOneBefore.unreadCount, 3);
  assert.equal(userOneBefore.notifications.every((alert) => !alert.is_read), true);

  assert.equal(await markInventoryNotificationRead(db, {
    alertId: 1,
    userId: 10,
    role: "administrator",
  }), true);
  const userOneAfter = await listInventoryNotifications(db, {
    userId: 10,
    role: "administrator",
  });
  const userTwoBefore = await listInventoryNotifications(db, {
    userId: 20,
    role: "administrator",
  });
  assert.equal(userOneAfter.unreadCount, 2);
  assert.equal(userOneAfter.notifications.find((alert) => alert.alert_id === 1).is_read, true);
  assert.equal(userTwoBefore.unreadCount, 3, "read state must be independent per user");

  const managerBefore = await listInventoryNotifications(db, {
    userId: 20,
    role: "inventory_manager",
  });
  assert.deepEqual(
    managerBefore.notifications.map((alert) => alert.severity).sort(),
    ["critical", "out"],
  );
  assert.equal(managerBefore.unreadCount, 2);
  assert.equal(await markAllInventoryNotificationsRead(db, {
    userId: 20,
    role: "inventory_manager",
  }), 2);
  const managerAfter = await listInventoryNotifications(db, {
    userId: 20,
    role: "inventory_manager",
  });
  assert.equal(managerAfter.unreadCount, 0);
  const userTwoAsAdmin = await listInventoryNotifications(db, {
    userId: 20,
    role: "administrator",
  });
  assert.equal(userTwoAsAdmin.unreadCount, 1, "mark-all respects role visibility");

  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "2026-10-29_inventory-notification-lifecycle.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS inventory_alerts/i);
  assert.match(migration, /UNIQUE KEY uq_inventory_alerts_active \(inventory_id, active_episode\)/i);
  assert.match(migration, /PRIMARY KEY \(alert_id, user_id\)/i);

  console.log("Inventory notification lifecycle tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
