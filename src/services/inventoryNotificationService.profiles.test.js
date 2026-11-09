"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const {
  listInventoryNotifications,
  reconcileInventoryAlerts,
} = require("./inventoryNotificationService");

(async () => {
  const writes = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/^SELECT alert_id, product_id AS inventory_id, severity/i.test(normalized)) {
        return [[]];
      }
      if (/^INSERT INTO inventory_alerts/i.test(normalized)) {
        writes.push({ sql: normalized, params });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected redesigned alert reconciliation SQL: ${normalized}`);
    },
  };

  const plan = await reconcileInventoryAlerts(connection, [{
    inventory_id: 41,
    product_id: 41,
    product_name: "Cooking Oil",
    category: "Raw Materials",
    unit: "L",
    mainStock: 2,
    severity: "low",
    thresholds: { low: 5, critical: 1 },
  }]);
  assert.equal(plan.create.length, 1);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /product_name_snapshot/i);
  assert.match(writes[0].sql, /unit_name_snapshot/i);
  assert.doesNotMatch(writes[0].sql, /\binventory_id\b|\bcategory\b/);
  assert.deepEqual(writes[0].params.slice(0, 7), [
    41,
    "Cooking Oil",
    "L",
    2,
    "low",
    5,
    1,
  ]);

  const readSql = [];
  const readDb = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      readSql.push(normalized);
      if (/^SELECT alert\.alert_id/i.test(normalized)) {
        return [[{
          alert_id: 9,
          inventory_id: 41,
          product_id: 41,
          product_name: "Cooking Oil",
          category: "",
          unit: "L",
          stock_value: 2,
          severity: "low",
          low_threshold: 5,
          critical_threshold: 1,
          created_at: new Date("2026-11-09T00:00:00.000Z"),
          last_observed_at: new Date("2026-11-09T00:00:00.000Z"),
          resolved_at: null,
          resolution_reason: null,
          read_at: null,
        }]];
      }
      if (/^SELECT COUNT\(\*\) AS unread_count/i.test(normalized)) {
        return [[{ unread_count: 1 }]];
      }
      throw new Error(`Unexpected redesigned alert read SQL: ${normalized}`);
    },
  };
  const notifications = await listInventoryNotifications(readDb, {
    userId: 7,
    role: "inventory_manager",
  });
  assert.equal(notifications.unreadCount, 1);
  assert.equal(notifications.notifications[0].inventory_id, 41);
  assert.equal(notifications.notifications[0].product_name, "Cooking Oil");
  assert.match(readSql[0], /product_name_snapshot AS product_name/i);
  assert.match(readSql[0], /unit_name_snapshot AS unit/i);
  assert.doesNotMatch(readSql[0], /alert\.product_name(?:,|\s)/i);

  console.log("inventory notification legacy/redesigned column-profile tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
