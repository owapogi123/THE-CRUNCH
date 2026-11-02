"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const mysql = require("mysql2/promise");
const { markStaffNotificationRead } = require("./staffNotificationService");

const enabled = process.env.RUN_NOTIFICATION_MYSQL_TEST === "1";
const host = process.env.NOTIFICATION_TEST_MYSQL_HOST || "127.0.0.1";
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

test("mark-as-read SQL is accepted by MySQL and remains idempotent", {
  skip: enabled ? false : "set RUN_NOTIFICATION_MYSQL_TEST=1 for the isolated MySQL integration test",
}, async (t) => {
  assert.ok(localHosts.has(host), "notification SQL integration tests only permit a local MySQL host");

  const connection = await mysql.createConnection({
    host,
    port: Number(process.env.NOTIFICATION_TEST_MYSQL_PORT || 3306),
    user: process.env.NOTIFICATION_TEST_MYSQL_USER || "root",
    password: process.env.NOTIFICATION_TEST_MYSQL_PASSWORD || "",
    database: process.env.NOTIFICATION_TEST_MYSQL_DATABASE || "mysql",
    multipleStatements: false,
  });
  t.after(() => connection.end());

  await connection.query("DROP TEMPORARY TABLE IF EXISTS staff_notification_reads");
  await connection.query("DROP TEMPORARY TABLE IF EXISTS staff_notifications");
  await connection.query(`CREATE TEMPORARY TABLE staff_notifications (
    notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    audience VARCHAR(64) NOT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    PRIMARY KEY (notification_id)
  ) ENGINE=InnoDB`);
  await connection.query(`CREATE TEMPORARY TABLE staff_notification_reads (
    notification_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id)
  ) ENGINE=InnoDB`);

  const [accessible] = await connection.query(
    "INSERT INTO staff_notifications (audience, actor_user_id) VALUES (?, NULL)",
    ["administrator,inventory_manager"],
  );
  const [wrongAudience] = await connection.query(
    "INSERT INTO staff_notifications (audience, actor_user_id) VALUES (?, NULL)",
    ["inventory_manager"],
  );
  const [ownNotification] = await connection.query(
    "INSERT INTO staff_notifications (audience, actor_user_id) VALUES (?, ?)",
    ["administrator", 8],
  );

  const notificationId = Number(accessible.insertId);
  assert.deepEqual(await Promise.all([
    markStaffNotificationRead(connection, {
      notificationId,
      userId: 8,
      role: "administrator",
    }),
    markStaffNotificationRead(connection, {
      notificationId,
      userId: 8,
      role: "administrator",
    }),
  ]), [true, true]);

  const [[readCount]] = await connection.query(
    "SELECT COUNT(*) AS count FROM staff_notification_reads WHERE notification_id = ? AND user_id = ?",
    [notificationId, 8],
  );
  assert.equal(Number(readCount.count), 1, "repeated acknowledgement creates one read state");

  assert.equal(await markStaffNotificationRead(connection, {
    notificationId: Number(wrongAudience.insertId),
    userId: 8,
    role: "administrator",
  }), false, "a notification outside the role audience remains inaccessible");
  assert.equal(await markStaffNotificationRead(connection, {
    notificationId: Number(ownNotification.insertId),
    userId: 8,
    role: "administrator",
  }), false, "the actor cannot acknowledge a notification hidden from their feed");
  assert.equal(await markStaffNotificationRead(connection, {
    notificationId: 999999,
    userId: 8,
    role: "administrator",
  }), false, "a missing notification remains not found");

  const [[inaccessibleReadCount]] = await connection.query(
    "SELECT COUNT(*) AS count FROM staff_notification_reads WHERE notification_id IN (?, ?)",
    [Number(wrongAudience.insertId), Number(ownNotification.insertId)],
  );
  assert.equal(Number(inaccessibleReadCount.count), 0);
});
