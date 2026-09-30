const express = require("express");
const jwt = require("jsonwebtoken");
const { normalizeRole } = require("../middleware/roleAccess");
const { subscribe } = require("../services/applicationEvents");
const { getJwtSecret } = require("../services/jwtConfig");

const STAFF_ROLES = new Set([
  "administrator",
  "cashier",
  "inventory_manager",
  "cook",
]);
const CUSTOMER_ROLES = new Set(["customer", "user", "costumer"]);
const DEFAULT_HEARTBEAT_MS = 20_000;
const MAX_PENDING_CHUNKS = 20;

function authenticateEventStream(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const token = authHeader.slice("Bearer ".length).trim();
    req.user = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const role = normalizeRole(req.user?.role);
  if (!STAFF_ROLES.has(role) && !CUSTOMER_ROLES.has(role)) {
    return res.status(403).json({ message: "Event stream access denied" });
  }
  if (CUSTOMER_ROLES.has(role)) {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(403).json({ message: "Customer event identity is invalid" });
    }
  }
  return next();
}

function formatEvent(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function createEventRouter({ heartbeatMs = DEFAULT_HEARTBEAT_MS } = {}) {
  const router = express.Router();

  router.get("/stream", authenticateEventStream, (req, res) => {
    const role = normalizeRole(req.user?.role);
    const audience = CUSTOMER_ROLES.has(role) ? "customer" : "staff";
    const userId = audience === "customer" ? Number(req.user.userId) : null;
    const pendingChunks = [];
    let blocked = false;
    let closed = false;
    let unsubscribe = () => false;
    let heartbeat = null;
    let expiryTimer = null;

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (expiryTimer) clearTimeout(expiryTimer);
      pendingChunks.length = 0;
      unsubscribe();
    };

    const flushPending = () => {
      if (closed) return;
      blocked = false;
      while (pendingChunks.length > 0 && !blocked) {
        blocked = !res.write(pendingChunks.shift());
      }
      if (blocked) res.once("drain", flushPending);
    };

    const write = (chunk) => {
      if (closed || res.destroyed) return;
      if (blocked) {
        pendingChunks.push(chunk);
        if (pendingChunks.length > MAX_PENDING_CHUNKS) {
          cleanup();
          res.destroy();
        }
        return;
      }
      blocked = !res.write(chunk);
      if (blocked) res.once("drain", flushPending);
    };

    write("retry: 1000\n\n");
    write(formatEvent("connected", { timestamp: new Date().toISOString() }));

    unsubscribe = subscribe({
      audience,
      userId,
      onEvent(event) {
        write(formatEvent("invalidation", event));
      },
    });

    const safeHeartbeatMs = Math.max(25, Number(heartbeatMs) || DEFAULT_HEARTBEAT_MS);
    heartbeat = setInterval(() => write(": heartbeat\n\n"), safeHeartbeatMs);
    heartbeat.unref?.();

    const expiresAtMs = Number(req.user?.exp) * 1000;
    if (Number.isFinite(expiresAtMs)) {
      expiryTimer = setTimeout(() => {
        write(formatEvent("auth-expired", { timestamp: new Date().toISOString() }));
        res.end();
        cleanup();
      }, Math.max(0, expiresAtMs - Date.now()));
      expiryTimer.unref?.();
    }

    req.on("aborted", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  });

  return router;
}

const router = createEventRouter();
module.exports = router;
module.exports.createEventRouter = createEventRouter;
