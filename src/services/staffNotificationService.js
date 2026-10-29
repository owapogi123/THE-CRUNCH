"use strict";

const { normalizeRole } = require("../middleware/roleAccess");

const STAFF_NOTIFICATION_AUDIENCES = Object.freeze({
  ADMINISTRATOR: "administrator",
  INVENTORY_MANAGER: "inventory_manager",
  BOTH: "administrator,inventory_manager",
});

function canAccessStaffNotifications(role) {
  const normalized = normalizeRole(role);
  return normalized === "administrator" || normalized === "inventory_manager";
}

function getAudienceCondition(role) {
  const normalized = normalizeRole(role);
  if (!canAccessStaffNotifications(normalized)) return null;
  return {
    role: normalized,
    audiences: [normalized, STAFF_NOTIFICATION_AUDIENCES.BOTH],
  };
}

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toIsoString(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapStaffNotificationRow(row) {
  return {
    notification_id: Number(row.notification_id),
    category: String(row.category),
    event_type: String(row.event_type),
    entity_id: String(row.entity_id),
    title: String(row.title || "Notification"),
    message: String(row.message || ""),
    status: String(row.status || ""),
    metadata: normalizeMetadata(row.metadata_json),
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    resolved_at: toIsoString(row.resolved_at),
    is_read: row.read_at != null,
    read_at: toIsoString(row.read_at),
  };
}

async function createStaffNotification(database, notification) {
  const metadataJson = JSON.stringify(notification.metadata || {});
  const [result] = await database.query(
    `INSERT INTO staff_notifications
       (dedupe_key, category, event_type, entity_id, audience,
        actor_user_id, title, message, status, metadata_json,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE dedupe_key = VALUES(dedupe_key)`,
    [
      String(notification.dedupeKey),
      String(notification.category),
      String(notification.eventType),
      String(notification.entityId),
      String(notification.audience),
      Number(notification.actorUserId) || null,
      String(notification.title || "Notification"),
      String(notification.message || ""),
      String(notification.status || ""),
      metadataJson,
    ],
  );
  return {
    notificationId: Number(result?.insertId) || null,
    created: Number(result?.affectedRows) === 1,
  };
}

async function updateStaffNotificationStatus(
  database,
  { category, entityId, status, message = null, metadata = null, resolved = false },
) {
  const fields = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const values = [String(status || "")];
  if (message !== null) {
    fields.push("message = ?");
    values.push(String(message));
  }
  if (metadata !== null) {
    fields.push("metadata_json = ?");
    values.push(JSON.stringify(metadata));
  }
  if (resolved) fields.push("resolved_at = CURRENT_TIMESTAMP");
  values.push(String(category), String(entityId));
  const [result] = await database.query(
    `UPDATE staff_notifications
        SET ${fields.join(", ")}
      WHERE category = ?
        AND entity_id = ?`,
    values,
  );
  return Number(result?.affectedRows) || 0;
}

async function listStaffNotifications(database, { userId, role, limit = 200 }) {
  const audience = getAudienceCondition(role);
  if (!audience) return { notifications: [], unreadCount: 0 };
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const params = [
    userId,
    ...audience.audiences,
    userId,
    safeLimit,
  ];
  const [rows] = await database.query(
    `SELECT
       notification.notification_id,
       notification.category,
       notification.event_type,
       notification.entity_id,
       notification.title,
       notification.message,
       notification.status,
       notification.metadata_json,
       notification.actor_user_id,
       notification.created_at,
       notification.updated_at,
       notification.resolved_at,
       notification_read.read_at
     FROM staff_notifications notification
     LEFT JOIN staff_notification_reads notification_read
       ON notification_read.notification_id = notification.notification_id
      AND notification_read.user_id = ?
     WHERE notification.audience IN (?, ?)
       AND (notification.actor_user_id IS NULL OR notification.actor_user_id <> ?)
     ORDER BY notification.created_at DESC, notification.notification_id DESC
     LIMIT ?`,
    params,
  );
  const [[countRow]] = await database.query(
    `SELECT COUNT(*) AS unread_count
       FROM staff_notifications notification
       LEFT JOIN staff_notification_reads notification_read
         ON notification_read.notification_id = notification.notification_id
        AND notification_read.user_id = ?
      WHERE notification.audience IN (?, ?)
        AND (notification.actor_user_id IS NULL OR notification.actor_user_id <> ?)
        AND notification_read.notification_id IS NULL`,
    params.slice(0, -1),
  );
  return {
    notifications: rows.map(mapStaffNotificationRow),
    unreadCount: Number(countRow?.unread_count) || 0,
  };
}

async function markStaffNotificationRead(database, { notificationId, userId, role }) {
  const audience = getAudienceCondition(role);
  if (!audience) return false;
  const [result] = await database.query(
    `INSERT INTO staff_notification_reads (notification_id, user_id, read_at)
     SELECT notification.notification_id, ?, CURRENT_TIMESTAMP
       FROM staff_notifications notification
      WHERE notification.notification_id = ?
        AND notification.audience IN (?, ?)
        AND (notification.actor_user_id IS NULL OR notification.actor_user_id <> ?)
     ON DUPLICATE KEY UPDATE
       notification_id = LAST_INSERT_ID(notification_id),
       read_at = CURRENT_TIMESTAMP`,
    [userId, notificationId, ...audience.audiences, userId],
  );
  return Number(result?.affectedRows) > 0 || Number(result?.insertId) === Number(notificationId);
}

async function markAllStaffNotificationsRead(database, { userId, role }) {
  const audience = getAudienceCondition(role);
  if (!audience) return 0;
  const [result] = await database.query(
    `INSERT INTO staff_notification_reads (notification_id, user_id, read_at)
     SELECT notification.notification_id, ?, CURRENT_TIMESTAMP
       FROM staff_notifications notification
      WHERE notification.audience IN (?, ?)
        AND (notification.actor_user_id IS NULL OR notification.actor_user_id <> ?)
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    [userId, ...audience.audiences, userId],
  );
  return Number(result?.affectedRows) || 0;
}

module.exports = {
  STAFF_NOTIFICATION_AUDIENCES,
  canAccessStaffNotifications,
  createStaffNotification,
  getAudienceCondition,
  listStaffNotifications,
  mapStaffNotificationRow,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  updateStaffNotificationStatus,
};
