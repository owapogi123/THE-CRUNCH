import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";

/* ================= TYPES ================= */

type NotificationType = "error" | "warning" | "info" | "success";

interface Notification {
  id: string;
  label: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

type ToastPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

interface NotificationSettings {
  enableToastNotifications: boolean;
  toastPosition: ToastPosition;
  toastDuration: number;
  enableConfirmDialogs: boolean;
}

/* ================= CONTEXT ================= */

const NotificationContext =
  createContext<NotificationContextValue | null>(null);

const ConfirmContext = createContext<{
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
} | null>(null);

/* ================= CONFIG ================= */

const TYPE_CONFIG = {
  success: {
    icon: <CheckCircle2 size={16} />,
    color: "#16a34a",
  },
  error: {
    icon: <XCircle size={16} />,
    color: "#dc2626",
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    color: "#d97706",
  },
  info: {
    icon: <Info size={16} />,
    color: "#2563eb",
  },
};

const NOTIFICATION_SETTINGS_STORAGE_KEY = "the-crunch.notification-settings";
const NOTIFICATION_SETTINGS_UPDATED_EVENT =
  "the-crunch:notification-settings-updated";

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enableToastNotifications: true,
  toastPosition: "top-right",
  toastDuration: 4000,
  enableConfirmDialogs: true,
};

function normalizeNotificationSettings(
  source: Record<string, unknown> | null | undefined,
): NotificationSettings {
  const toastPosition =
    source?.toastPosition === "top-left" ||
    source?.toastPosition === "bottom-right" ||
    source?.toastPosition === "bottom-left"
      ? source.toastPosition
      : "top-right";
  const toastDuration = Number(source?.toastDuration);

  return {
    enableToastNotifications:
      source?.enableToastNotifications === undefined
        ? DEFAULT_NOTIFICATION_SETTINGS.enableToastNotifications
        : source.enableToastNotifications === true ||
          source.enableToastNotifications === 1 ||
          String(source.enableToastNotifications).trim().toLowerCase() ===
            "true",
    toastPosition,
    toastDuration:
      Number.isFinite(toastDuration) && toastDuration > 0
        ? toastDuration
        : DEFAULT_NOTIFICATION_SETTINGS.toastDuration,
    enableConfirmDialogs:
      source?.enableConfirmDialogs === undefined
        ? DEFAULT_NOTIFICATION_SETTINGS.enableConfirmDialogs
        : source.enableConfirmDialogs === true ||
          source.enableConfirmDialogs === 1 ||
          String(source.enableConfirmDialogs).trim().toLowerCase() === "true",
  };
}

function readCachedNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return normalizeNotificationSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function cacheNotificationSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      NOTIFICATION_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    /* ignore cache write issues */
  }
}

/* ================= TOAST ================= */

function ToastItem({
  notification,
  onRemove,
  defaultDuration,
}: {
  notification: Notification;
  onRemove: (id: string) => void;
  defaultDuration: number;
}) {
  const { id, label, type } = notification;
  const duration = notification.duration ?? defaultDuration;
  const cfg = TYPE_CONFIG[type];

  useEffect(() => {
    const timer = setTimeout(() => onRemove(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        minWidth: 260,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        borderLeft: `4px solid ${cfg.color}`,
      }}
    >
      <span style={{ color: cfg.color }}>{cfg.icon}</span>

      <span style={{ flex: 1, fontSize: 13, color: "#334155" }}>
        {label}
      </span>

      <button
        onClick={() => onRemove(id)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          opacity: 0.5,
        }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

function ToastContainer({
  settings,
}: {
  settings: NotificationSettings;
}) {
  const { notifications, removeNotification } = useNotifications();
  if (!settings.enableToastNotifications) return null;
  const positionStyle = useMemo(() => {
    const isTop = settings.toastPosition.startsWith("top");
    const isRight = settings.toastPosition.endsWith("right");
    return {
      top: isTop ? 24 : "auto",
      bottom: isTop ? "auto" : 24,
      right: isRight ? 24 : "auto",
      left: isRight ? "auto" : 24,
      alignItems: isRight ? "flex-end" : "flex-start",
    } as const;
  }, [settings.toastPosition]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 9999,
        ...positionStyle,
      }}
    >
      <AnimatePresence>
        {notifications.map((n) => (
          <ToastItem
            key={n.id}
            notification={n}
            onRemove={removeNotification}
            defaultDuration={settings.toastDuration}
          />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

/* ================= CONFIRM MODAL ================= */

function ConfirmDialog({
  state,
  onResponse,
}: {
  state: ConfirmState;
  onResponse: (v: boolean) => void;
}) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.30)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          padding: 20,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onResponse(false);
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{
            width: "100%",
            maxWidth: 480,
            background: "#f8fafc",
            borderRadius: 20,
            padding: 24,
            border: "1px solid #e2e8f0",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 16,
            }}
          >
            {state.title ?? "Confirm Action"}
          </h2>

          <div
            style={{
              fontSize: 14,
              color: "#475569",
              lineHeight: 1.6,
              marginBottom: 24,
            }}
          >
            {state.message}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <button
              onClick={() => onResponse(false)}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "1px solid #cbd5f5",
                background: "#f1f5f9",
                color: "#64748b",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {state.cancelLabel ?? "Cancel"}
            </button>

            <button
              onClick={() => onResponse(true)}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "none",
                background: state.danger ? "#dc2626" : "#0f172a",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {state.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

/* ================= PROVIDER ================= */

export function NotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [confirmState, setConfirmState] =
    useState<ConfirmState | null>(null);
  const [settings, setSettings] = useState<NotificationSettings>(() =>
    readCachedNotificationSettings(),
  );

  useEffect(() => {
    if (!settings.enableToastNotifications) {
      setNotifications([]);
    }
  }, [settings.enableToastNotifications]);

  useEffect(() => {
    let cancelled = false;

    const applySettings = (next: Record<string, unknown> | null | undefined) => {
      const normalized = normalizeNotificationSettings(next);
      if (cancelled) return;
      setSettings(normalized);
      cacheNotificationSettings(normalized);
    };

    const loadSettings = async () => {
      try {
        const data = await api.get<Record<string, unknown>>("/settings");
        applySettings(data && typeof data === "object" ? data : null);
      } catch {
        /* keep cached defaults */
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== NOTIFICATION_SETTINGS_STORAGE_KEY) return;
      try {
        applySettings(event.newValue ? JSON.parse(event.newValue) : null);
      } catch {
        applySettings(null);
      }
    };

    const handleSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown> | undefined>)
        .detail;
      applySettings(detail ?? null);
    };

    void loadSettings();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      NOTIFICATION_SETTINGS_UPDATED_EVENT,
      handleSettingsUpdated,
    );

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        NOTIFICATION_SETTINGS_UPDATED_EVENT,
        handleSettingsUpdated,
      );
    };
  }, []);

  const addNotification = useCallback((n: Notification) => {
    if (!settings.enableToastNotifications) return;
    setNotifications((prev) => [...prev, n]);
  }, [settings.enableToastNotifications]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    if (!settings.enableConfirmDialogs) {
      const fallbackMessage =
        typeof opts.message === "string" || typeof opts.message === "number"
          ? String(opts.message)
          : "Are you sure you want to continue?";
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        return Promise.resolve(
          window.confirm(
            [opts.title, fallbackMessage].filter(Boolean).join("\n\n"),
          ),
        );
      }
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...opts, resolve });
    });
  }, [settings.enableConfirmDialogs]);

  const handleConfirmResponse = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification, clearAll }}
    >
      <ConfirmContext.Provider value={{ confirm }}>
        {children}
        <ToastContainer settings={settings} />
        {confirmState && (
          <ConfirmDialog
            state={confirmState}
            onResponse={handleConfirmResponse}
          />
        )}
      </ConfirmContext.Provider>
    </NotificationContext.Provider>
  );
}

/* ================= HOOKS ================= */

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used inside NotificationProvider"
    );
  return ctx;
}

export function useConfirm(): (
  opts: ConfirmOptions
) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx)
    throw new Error(
      "useConfirm must be used inside NotificationProvider"
    );
  return ctx.confirm;
}
