"use strict";

const { normalizeRole } = require("../middleware/roleAccess");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("../db/schemaProfile");

const ACTIVE_ALERT_SEVERITIES = Object.freeze(["low", "critical", "out"]);
const ADMIN_ALERT_SEVERITIES = Object.freeze(["low", "critical", "out"]);
const INVENTORY_MANAGER_ALERT_SEVERITIES = Object.freeze(["low", "critical", "out"]);

function isRedesignedProfile() {
  return getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
}

function getVisibleInventoryAlertSeverities(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "administrator") return [...ADMIN_ALERT_SEVERITIES];
  if (normalizedRole === "inventory_manager") {
    return [...INVENTORY_MANAGER_ALERT_SEVERITIES];
  }
  return [];
}

function snapshotObservedAlert(item) {
  return {
    inventoryId: Number(item.inventory_id),
    productId: Number(item.product_id) || null,
    productName: String(item.product_name || "Unnamed Product"),
    category: String(item.category || "Uncategorized"),
    unit: String(item.unit || "piece"),
    stockValue: Number(item.mainStock) || 0,
    severity: String(item.severity || "normal").toLowerCase(),
    lowThreshold: Number(item.thresholds?.low) || 0,
    criticalThreshold: Number(item.thresholds?.critical) || 0,
  };
}

function planInventoryAlertReconciliation(activeAlerts, observedItems) {
  const activeByInventoryId = new Map(
    (activeAlerts || []).map((alert) => [
      Number(alert.inventory_id ?? alert.inventoryId),
      alert,
    ]),
  );
  const observedInventoryIds = new Set();
  const resolve = [];
  const create = [];
  const refresh = [];

  for (const rawItem of observedItems || []) {
    const item = snapshotObservedAlert(rawItem);
    if (!Number.isSafeInteger(item.inventoryId) || item.inventoryId <= 0) continue;
    observedInventoryIds.add(item.inventoryId);
    const active = activeByInventoryId.get(item.inventoryId);

    if (!ACTIVE_ALERT_SEVERITIES.includes(item.severity)) {
      if (active) {
        resolve.push({ alertId: Number(active.alert_id ?? active.alertId), reason: "recovered" });
      }
      continue;
    }

    if (!active) {
      create.push(item);
      continue;
    }

    if (String(active.severity).toLowerCase() !== item.severity) {
      resolve.push({
        alertId: Number(active.alert_id ?? active.alertId),
        reason: "severity_changed",
      });
      create.push(item);
      continue;
    }

    refresh.push({
      alertId: Number(active.alert_id ?? active.alertId),
      ...item,
    });
  }

  for (const active of activeAlerts || []) {
    const inventoryId = Number(active.inventory_id ?? active.inventoryId);
    if (!observedInventoryIds.has(inventoryId)) {
      resolve.push({
        alertId: Number(active.alert_id ?? active.alertId),
        reason: "inventory_removed",
      });
    }
  }

  return { resolve, create, refresh };
}

async function reconcileInventoryAlerts(database, observedItems, options = {}) {
  const ownsConnection = typeof database.getConnection === "function";
  const connection = ownsConnection ? await database.getConnection() : database;
  const observedAt = options.observedAt || new Date();
  let transactionStarted = false;

  try {
    if (typeof connection.beginTransaction === "function") {
      await connection.beginTransaction();
      transactionStarted = true;
    }
    const redesignedProfile = isRedesignedProfile();
    const [activeAlerts] = await connection.query(
      redesignedProfile
        ? `SELECT alert_id, product_id AS inventory_id, severity
             FROM inventory_alerts
            WHERE active_episode = 1
            FOR UPDATE`
        : `SELECT alert_id, inventory_id, severity
             FROM inventory_alerts
            WHERE active_episode = 1
            FOR UPDATE`,
    );
    const plan = planInventoryAlertReconciliation(activeAlerts, observedItems);

    for (const resolution of plan.resolve) {
      await connection.query(
        `UPDATE inventory_alerts
            SET active_episode = NULL,
                resolved_at = ?,
                resolution_reason = ?
          WHERE alert_id = ?
            AND active_episode = 1`,
        [observedAt, resolution.reason, resolution.alertId],
      );
    }

    for (const item of plan.create) {
      if (redesignedProfile) {
        await connection.query(
          `INSERT INTO inventory_alerts
             (product_id, product_name_snapshot, unit_name_snapshot,
              stock_value, severity, low_threshold, critical_threshold,
              active_episode, created_at, last_observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE
             product_name_snapshot = VALUES(product_name_snapshot),
             unit_name_snapshot = VALUES(unit_name_snapshot),
             stock_value = VALUES(stock_value),
             low_threshold = VALUES(low_threshold),
             critical_threshold = VALUES(critical_threshold),
             last_observed_at = VALUES(last_observed_at)`,
          [
            item.productId,
            item.productName,
            item.unit,
            item.stockValue,
            item.severity,
            item.lowThreshold,
            item.criticalThreshold,
            observedAt,
            observedAt,
          ],
        );
      } else {
        await connection.query(
          `INSERT INTO inventory_alerts
             (inventory_id, product_id, product_name, category, unit,
              stock_value, severity, low_threshold, critical_threshold,
              active_episode, created_at, last_observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON DUPLICATE KEY UPDATE
             product_id = VALUES(product_id),
             product_name = VALUES(product_name),
             category = VALUES(category),
             unit = VALUES(unit),
             stock_value = VALUES(stock_value),
             low_threshold = VALUES(low_threshold),
             critical_threshold = VALUES(critical_threshold),
             last_observed_at = VALUES(last_observed_at)`,
          [
            item.inventoryId,
            item.productId,
            item.productName,
            item.category,
            item.unit,
            item.stockValue,
            item.severity,
            item.lowThreshold,
            item.criticalThreshold,
            observedAt,
            observedAt,
          ],
        );
      }
    }

    for (const item of plan.refresh) {
      if (redesignedProfile) {
        await connection.query(
          `UPDATE inventory_alerts
              SET product_name_snapshot = ?,
                  unit_name_snapshot = ?,
                  stock_value = ?,
                  low_threshold = ?,
                  critical_threshold = ?,
                  last_observed_at = ?
            WHERE alert_id = ?
              AND active_episode = 1`,
          [
            item.productName,
            item.unit,
            item.stockValue,
            item.lowThreshold,
            item.criticalThreshold,
            observedAt,
            item.alertId,
          ],
        );
      } else {
        await connection.query(
          `UPDATE inventory_alerts
              SET product_id = ?,
                  product_name = ?,
                  category = ?,
                  unit = ?,
                  stock_value = ?,
                  low_threshold = ?,
                  critical_threshold = ?,
                  last_observed_at = ?
            WHERE alert_id = ?
              AND active_episode = 1`,
          [
            item.productId,
            item.productName,
            item.category,
            item.unit,
            item.stockValue,
            item.lowThreshold,
            item.criticalThreshold,
            observedAt,
            item.alertId,
          ],
        );
      }
    }

    if (transactionStarted) {
      await connection.commit();
      transactionStarted = false;
    }
    return plan;
  } catch (error) {
    if (transactionStarted && typeof connection.rollback === "function") {
      await connection.rollback();
      transactionStarted = false;
    }
    throw error;
  } finally {
    if (ownsConnection && typeof connection.release === "function") {
      connection.release();
    }
  }
}

function toIsoString(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapNotificationRow(row) {
  return {
    alert_id: Number(row.alert_id),
    inventory_id: Number(row.inventory_id),
    product_id: row.product_id == null ? null : Number(row.product_id),
    product_name: String(row.product_name || "Unnamed Product"),
    category: String(row.category || "Uncategorized"),
    unit: String(row.unit || "piece"),
    mainStock: Number(row.stock_value) || 0,
    severity: String(row.severity),
    thresholds: {
      low: Number(row.low_threshold) || 0,
      critical: Number(row.critical_threshold) || 0,
    },
    created_at: toIsoString(row.created_at),
    last_observed_at: toIsoString(row.last_observed_at),
    resolved_at: toIsoString(row.resolved_at),
    resolution_reason: row.resolution_reason || null,
    is_active: row.resolved_at == null,
    // A resolved episode remains available as history, but it is no longer an
    // actionable unread alert and must not keep the header badge lit.
    is_read: row.read_at != null || row.resolved_at != null,
    read_at: toIsoString(row.read_at),
  };
}

async function listInventoryNotifications(database, { userId, role, limit = 200 }) {
  const severities = getVisibleInventoryAlertSeverities(role);
  if (severities.length === 0) return { notifications: [], unreadCount: 0 };
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const placeholders = severities.map(() => "?").join(", ");
  const [rows] = await database.query(
    isRedesignedProfile()
      ? `SELECT
       alert.alert_id,
       alert.product_id AS inventory_id,
       alert.product_id,
       alert.product_name_snapshot AS product_name,
       '' AS category,
       alert.unit_name_snapshot AS unit,
       alert.stock_value,
       alert.severity,
       alert.low_threshold,
       alert.critical_threshold,
       alert.created_at,
       alert.last_observed_at,
       alert.resolved_at,
       alert.resolution_reason,
       alert_read.read_at
     FROM inventory_alerts alert
     LEFT JOIN inventory_alert_reads alert_read
       ON alert_read.alert_id = alert.alert_id
      AND alert_read.user_id = ?
     WHERE alert.severity IN (${placeholders})
     ORDER BY alert.created_at DESC, alert.alert_id DESC
     LIMIT ?`
      : `SELECT
       alert.alert_id,
       alert.inventory_id,
       alert.product_id,
       alert.product_name,
       alert.category,
       alert.unit,
       alert.stock_value,
       alert.severity,
       alert.low_threshold,
       alert.critical_threshold,
       alert.created_at,
       alert.last_observed_at,
       alert.resolved_at,
       alert.resolution_reason,
       alert_read.read_at
     FROM inventory_alerts alert
     LEFT JOIN inventory_alert_reads alert_read
       ON alert_read.alert_id = alert.alert_id
      AND alert_read.user_id = ?
     WHERE alert.severity IN (${placeholders})
     ORDER BY alert.created_at DESC, alert.alert_id DESC
     LIMIT ?`,
    [userId, ...severities, safeLimit],
  );
  const [[countRow]] = await database.query(
    `SELECT COUNT(*) AS unread_count
       FROM inventory_alerts alert
       LEFT JOIN inventory_alert_reads alert_read
         ON alert_read.alert_id = alert.alert_id
        AND alert_read.user_id = ?
      WHERE alert.severity IN (${placeholders})
        AND alert.resolved_at IS NULL
        AND alert_read.alert_id IS NULL`,
    [userId, ...severities],
  );
  return {
    notifications: rows.map(mapNotificationRow),
    unreadCount: Number(countRow?.unread_count) || 0,
  };
}

async function markInventoryNotificationRead(database, { alertId, userId, role }) {
  const severities = getVisibleInventoryAlertSeverities(role);
  if (severities.length === 0) return false;
  const placeholders = severities.map(() => "?").join(", ");
  const [result] = await database.query(
    `INSERT INTO inventory_alert_reads (alert_id, user_id, read_at)
     SELECT alert.alert_id, ?, CURRENT_TIMESTAMP
       FROM inventory_alerts alert
      WHERE alert.alert_id = ?
        AND alert.severity IN (${placeholders})
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    [userId, alertId, ...severities],
  );
  return Number(result?.affectedRows) > 0;
}

async function markAllInventoryNotificationsRead(database, { userId, role }) {
  const severities = getVisibleInventoryAlertSeverities(role);
  if (severities.length === 0) return 0;
  const placeholders = severities.map(() => "?").join(", ");
  const [result] = await database.query(
    `INSERT INTO inventory_alert_reads (alert_id, user_id, read_at)
     SELECT alert.alert_id, ?, CURRENT_TIMESTAMP
       FROM inventory_alerts alert
      WHERE alert.severity IN (${placeholders})
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    [userId, ...severities],
  );
  return Number(result?.affectedRows) || 0;
}

module.exports = {
  ACTIVE_ALERT_SEVERITIES,
  getVisibleInventoryAlertSeverities,
  listInventoryNotifications,
  mapNotificationRow,
  markAllInventoryNotificationsRead,
  markInventoryNotificationRead,
  planInventoryAlertReconciliation,
  reconcileInventoryAlerts,
};
