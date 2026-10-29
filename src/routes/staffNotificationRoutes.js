"use strict";

const router = require("express").Router();
const db = require("../config/db");
const { requireRoleAccess } = require("../middleware/cookViewAccess");
const {
  listStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
} = require("../services/staffNotificationService");

const requireStaffNotificationAccess = requireRoleAccess(
  ["administrator", "inventory_manager"],
  "Administrative notification access denied",
);

function authenticatedUserId(req) {
  const userId = Number(req.user?.userId);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

router.get("/", requireStaffNotificationAccess, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return res.status(401).json({ message: "Invalid authenticated user" });
    const result = await listStaffNotifications(db, {
      userId,
      role: req.user?.role,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json(result);
  } catch (error) {
    console.error("GET /staff-notifications error:", error);
    return res.status(500).json({ message: "Unable to load notifications" });
  }
});

router.post("/read-all", requireStaffNotificationAccess, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    if (!userId) return res.status(401).json({ message: "Invalid authenticated user" });
    const markedCount = await markAllStaffNotificationsRead(db, {
      userId,
      role: req.user?.role,
    });
    return res.json({ message: "Notifications marked as read", markedCount });
  } catch (error) {
    console.error("POST /staff-notifications/read-all error:", error);
    return res.status(500).json({ message: "Unable to mark notifications as read" });
  }
});

router.post("/:notificationId/read", requireStaffNotificationAccess, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const notificationId = Number(req.params.notificationId);
    if (!userId) return res.status(401).json({ message: "Invalid authenticated user" });
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ message: "Invalid notification id" });
    }
    const marked = await markStaffNotificationRead(db, {
      notificationId,
      userId,
      role: req.user?.role,
    });
    if (!marked) return res.status(404).json({ message: "Notification not found" });
    return res.json({ message: "Notification marked as read", notificationId });
  } catch (error) {
    console.error("POST /staff-notifications/:id/read error:", error);
    return res.status(500).json({ message: "Unable to mark notification as read" });
  }
});

module.exports = router;
