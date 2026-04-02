import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType = "error" | "warning" | "info" | "success";

export interface Notification {
  id: string;
  label: string;
  type: NotificationType;
  /**
   * Auto-dismiss after this many ms.
   * Pass 0 for persistent (must be manually dismissed).
   * Defaults to 4000.
   */
  duration?: number;
  onClick?: () => void;
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

// ── Visual config ─────────────────────────────────────────────────────────────

interface TypeConfig {
  icon: ReactNode;
  accent: string;
  bg: string;
  text: string;
  bar: string;
}

const TYPE_CONFIG: Record<NotificationType, TypeConfig> = {
  success: {
    icon: <CheckCircle2 size={15} />,
    accent: "#16a34a",
    bg: "#f0fdf4",
    text: "#14532d",
    bar: "#4ade80",
  },
  error: {
    icon: <XCircle size={15} />,
    accent: "#dc2626",
    bg: "#fef2f2",
    text: "#7f1d1d",
    bar: "#f87171",
  },
  warning: {
    icon: <AlertTriangle size={15} />,
    accent: "#d97706",
    bg: "#fffbeb",
    text: "#78350f",
    bar: "#fbbf24",
  },
  info: {
    icon: <Info size={15} />,
    accent: "#2563eb",
    bg: "#eff6ff",
    text: "#1e3a8a",
    bar: "#60a5fa",
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ── Single toast item ─────────────────────────────────────────────────────────

interface ToastItemProps {
  notification: Notification;
  onRemove: (id: string) => void;
}

function ToastItem({ notification, onRemove }: ToastItemProps) {
  const { id, label, type, duration = 4000, onClick } = notification;
  const cfg = TYPE_CONFIG[type];

  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onRemove(id), 300);
  }, [id, onRemove]);

  // Trigger enter animation on next frame
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    if (duration === 0) return;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, dismiss]);

  const isVisible = mounted && !exiting;

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={onClick}
      style={{
        fontFamily: "'Poppins', sans-serif",
        background: cfg.bg,
        border: `1px solid ${cfg.accent}25`,
        borderLeft: `3px solid ${cfg.accent}`,
        borderRadius: "0 12px 12px 0",
        overflow: "hidden",
        minWidth: 280,
        maxWidth: 360,
        boxShadow: "0 4px 24px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        cursor: onClick ? "pointer" : "default",
        marginBottom: 8,
        transform: isVisible
          ? "translateX(0) scale(1)"
          : "translateX(110%) scale(0.96)",
        opacity: isVisible ? 1 : 0,
        transition: exiting
          ? "transform 0.28s cubic-bezier(0.4,0,1,1), opacity 0.28s ease"
          : "transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
        willChange: "transform, opacity",
      }}
    >
      {/* Progress bar */}
      {duration > 0 && (
        <div
          style={{
            height: 2,
            background: cfg.bar,
            transformOrigin: "left",
            animation: `notif-shrink ${duration}ms linear forwards`,
          }}
        />
      )}

      {/* Body */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "11px 13px",
        }}
      >
        {/* Icon */}
        <span style={{ color: cfg.accent, flexShrink: 0, marginTop: 1 }}>
          {cfg.icon}
        </span>

        {/* Message */}
        <p
          style={{
            flex: 1,
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: cfg.text,
            lineHeight: 1.5,
          }}
        >
          {label}
        </p>

        {/* Dismiss */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          aria-label="Dismiss notification"
          style={{
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: cfg.accent,
            opacity: 0.45,
            padding: 2,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.45")}
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ── Toast container (portaled) ────────────────────────────────────────────────

function ToastContainer() {
  const { notifications, removeNotification } = useNotifications();

  return createPortal(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500&display=swap');
        @keyframes notif-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
      <div
        aria-label="Notifications"
        style={{
          position: "fixed",
          top: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        {notifications.map((n) => (
          <div key={n.id} style={{ pointerEvents: "all" }}>
            <ToastItem notification={n} onRemove={removeNotification} />
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((n: Notification) => {
    setNotifications((prev) => {
      // Replace in-place if same id already exists — prevents duplicates
      const exists = prev.some((x) => x.id === n.id);
      return exists
        ? prev.map((x) => (x.id === n.id ? n : x))
        : [...prev, n];
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification, clearAll }}
    >
      {children}
      {/* Toast UI is rendered here via portal — no extra component needed */}
      <ToastContainer />
    </NotificationContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used inside <NotificationProvider>");
  }
  return ctx;
}