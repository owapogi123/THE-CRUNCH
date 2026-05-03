"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, Bell, ClipboardList, XCircle, CheckCircle2, ChefHat, Utensils, Play, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";
import { useNotifications } from "@/lib/NotificationContext";

// ─── FONT ─────────────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("dm-sans-font")) {
  const l = document.createElement("link");
  l.id = "dm-sans-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}
const F = "'DM Sans', sans-serif";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface OrderItem { quantity: number; name: string; }
interface OrderCard {
  id: string; orderNumber: string; tableNumber: number;
  status: "dine-in" | "take-out" | "delivery";
  orderType: "dine-in" | "take-out" | "delivery";
  isOnlinePickup?: boolean;
  items: OrderItem[]; isPreparing: boolean; isReady: boolean;
  isFinished: boolean; startedAt?: number;
  createdAt?: number;
  queuedAt?: number;
  prepStartedAt?: number;
  readyAt?: number;
  currentStatus?: string;
  estimatedPrepMinutes?: number;
  dueAt?: number;
  overdue?: boolean;
  timerUpdatedBy?: number | null;
  timerUpdatedAt?: number;
}
interface KitchenUsageItem {
  usage_item_id?: number;
  product_id: number | null;
  product_name: string;
  category: string;
  unit: string;
  withdrawn_qty: number;
  used_qty: number;
  spoilage_qty: number;
  returned_qty: number;
  note: string;
}
interface KitchenUsageReport {
  report_id: number;
  report_date: string;
  status: "pending" | "finalized";
  prepared_by: number | null;
  finalized_by: number | null;
  finalized_at: string | null;
  updated_at: string | null;
}
interface KitchenUsagePayload {
  report: KitchenUsageReport;
  items: KitchenUsageItem[];
}
interface UsageProductOption {
  product_id: number;
  product_name: string;
  category: string;
  unit: string;
  dailyWithdrawn: number;
  expiryDate?: string | null;
  usableUntil?: string | null;
  shelfLifeDays?: number | null;
  shelfLifeHours?: number | null;
}

function buildUsageItem(
  product: UsageProductOption,
  existing?: KitchenUsageItem,
): KitchenUsageItem {
  return {
    usage_item_id: existing?.usage_item_id,
    product_id: product.product_id,
    product_name: product.product_name,
    category: product.category,
    unit: product.unit,
    withdrawn_qty: product.dailyWithdrawn,
    used_qty: existing?.used_qty ?? 0,
    spoilage_qty: existing?.spoilage_qty ?? 0,
    returned_qty: existing?.returned_qty ?? 0,
    note: existing?.note ?? "",
  };
}

function syncUsageItems(
  products: UsageProductOption[],
  existingItems: KitchenUsageItem[],
): KitchenUsageItem[] {
  const existingByProductId = new Map(
    existingItems
      .filter((item) => Number.isFinite(Number(item.product_id)))
      .map((item) => [Number(item.product_id), item]),
  );

  return products
    .filter((product) => product.dailyWithdrawn > 0)
    .map((product) =>
      buildUsageItem(product, existingByProductId.get(product.product_id)),
    );
}

function getUsageTotals(item: KitchenUsageItem) {
  const reported = item.used_qty + item.spoilage_qty + item.returned_qty;
  const remaining = item.withdrawn_qty - reported;
  return {
    reported,
    remaining,
    invalid: reported > item.withdrawn_qty,
  };
}

function getUsageTimingState(product: UsageProductOption): {
  tone: "expired" | "warning";
  label: string;
} | null {
  const targetDate = product.usableUntil || product.expiryDate;
  if (!targetDate) return null;

  const targetMs = new Date(targetDate).getTime();
  if (!Number.isFinite(targetMs)) return null;

  const remainingMs = targetMs - Date.now();
  if (remainingMs <= 0) {
    return {
      tone: "expired",
      label: product.usableUntil ? "Past Shelf Life" : "Expired",
    };
  }

  if (remainingMs <= 24 * 60 * 60 * 1000) {
    return {
      tone: "warning",
      label: product.usableUntil ? "Near End of Shelf Life" : "Near Expiry",
    };
  }

  return null;
}

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine";
      gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.2);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch {}
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function OrderTimer({
  dueAt,
  baseAt,
  estimatedPrepMinutes,
  orderNumber,
}: {
  dueAt: number;
  baseAt: number;
  estimatedPrepMinutes: number;
  orderNumber: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const notifiedRef = useRef(false);
  const soundRef = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.max(Math.floor((Date.now() - baseAt) / 1000), 0);
      setElapsed(s);
      if (Date.now() >= dueAt) {
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          if (Notification.permission === "granted")
            new Notification("Order overdue", { body: `${orderNumber} needs attention in the cook queue.`, icon: "/favicon.ico" });
        }
        if (!soundRef.current) { soundRef.current = true; playAlertSound(); }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [baseAt, dueAt, orderNumber]);

  const totalSeconds = Math.max(estimatedPrepMinutes * 60, 60);
  const remaining = Math.floor((dueAt - Date.now()) / 1000);
  const overdue = remaining <= 0;
  const display = overdue ? Math.abs(remaining) : remaining;
  const mins = Math.floor(display / 60);
  const secs = display % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const progress = Math.min(elapsed / totalSeconds, 1);
  const warn = !overdue && elapsed > totalSeconds * 0.75;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        padding: "5px 10px", borderRadius: 7, marginBottom: 6,
        background: overdue ? "#fef2f2" : warn ? "#fffbeb" : "#f8fafc",
        color: overdue ? "#dc2626" : warn ? "#d97706" : "#475569",
        fontSize: 11, fontWeight: 600, fontFamily: F,
      }}>
        {overdue ? <AlertCircle size={11} /> : <Clock size={11} />}
        {overdue ? `+${timeStr}` : timeStr}
      </div>
      <div style={{ height: 2, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, borderRadius: 99, transition: "width 1s linear",
          background: overdue ? "#ef4444" : warn ? "#f59e0b" : "#94a3b8" }} />
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Order() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifPermission, setNotifPermission] = useState(Notification.permission);
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [servedCount, setServedCount] = useState(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageSaving, setUsageSaving] = useState(false);
  const [usageReport, setUsageReport] = useState<KitchenUsageReport | null>(null);
  const [usageItems, setUsageItems] = useState<KitchenUsageItem[]>([]);
  const [usageProducts, setUsageProducts] = useState<UsageProductOption[]>([]);
  const { addNotification } = useNotifications();

  const fetchAll = async () => {
    try {
      const [queue, all] = await Promise.all([
        api.get<OrderCard[]>("/orders/queue"),
        api.get<{ id?: number | string; orderId?: number | string; status: string }[]>("/orders"),
      ]);
      setOrders((queue ?? []).filter((o) => !o.isFinished));
      setServedCount(new Set((all ?? []).filter((o) => {
        const status = String(o.status || "").toLowerCase();
        return status === "completed" || status === "picked up";
      }).map((o) => String(o.id ?? o.orderId))).size);
    } catch (e) { console.error(e); }
  };

  const fetchUsage = async () => {
    try {
      setUsageLoading(true);
      const [data, inventory] = await Promise.all([
        api.get<KitchenUsagePayload>("/inventory/daily-usage?status=pending"),
        api.get<Array<Record<string, unknown>>>("/inventory"),
      ]);
      const nextProducts = (inventory ?? []).map((item) => ({
        product_id: Number(item.product_id ?? item.id ?? 0),
        product_name: String(item.product_name ?? item.name ?? ""),
        category: String(item.category ?? ""),
        unit: String(item.unit ?? "unit"),
        dailyWithdrawn: Number(item.dailyWithdrawn ?? 0),
        expiryDate: item.expiryDate ? String(item.expiryDate) : null,
        usableUntil: item.usableUntil ? String(item.usableUntil) : null,
        shelfLifeDays:
          item.shelfLifeDays === undefined || item.shelfLifeDays === null
            ? null
            : Number(item.shelfLifeDays),
        shelfLifeHours:
          item.shelfLifeHours === undefined || item.shelfLifeHours === null
            ? null
            : Number(item.shelfLifeHours),
      }));

      setUsageReport(data.report);
      setUsageProducts(nextProducts);
      setUsageItems(syncUsageItems(nextProducts, data.items ?? []));
    } catch (e) {
      console.error(e);
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 3000); return () => clearInterval(i); }, []);
  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { void fetchUsage(); }, []);

  const patch = async (id: string, body: object) => {
    try {
      await api.patch(`/orders/${id}`, body);
      fetchAll();
      return true;
    } catch (error) {
      addNotification({
        id: crypto.randomUUID(),
        label:
          error instanceof Error
            ? error.message
            : "Failed to update order status.",
        type: "error",
      });
      return false;
    }
  };
  const handleStart  = (id: string) => patch(id, { status: "preparing" });
  const handleReady = async (order: OrderCard) => {
    try {
      await api.patch(`/orders/${order.id}`, { status: "Ready for Pickup" });
      if (order.orderType !== "delivery") {
        await api.patch(`/orders/${order.id}`, { status: "Completed" });
      }
      fetchAll();
    } catch (error) {
      addNotification({
        id: crypto.randomUUID(),
        label:
          error instanceof Error
            ? error.message
            : "Failed to complete order.",
        type: "error",
      });
    }
  };
  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try { await api.patch(`/orders/${id}`, { status: "Cancelled" }); fetchAll(); }
    catch {} finally { setCancellingId(null); }
  };
  const userId = (() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();
  const handleTimerAdjust = async (order: OrderCard, deltaMinutes: number) => {
    const current = Math.max(order.estimatedPrepMinutes ?? 10, 1);
    const next = Math.max(current + deltaMinutes, 1);
    try {
      await api.patch(`/orders/${order.id}`, {
        estimatedPrepMinutes: next,
        timerUpdatedBy: userId,
      });
      fetchAll();
    } catch (error) {
      console.error("Failed to update cook timer:", error);
    }
  };
  const updateUsageItem = (
    index: number,
    field: "used_qty" | "spoilage_qty" | "returned_qty" | "note",
    value: string,
  ) => {
    setUsageItems((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === "note") {
        return { ...item, [field]: value };
      }
      return { ...item, [field]: Math.max(0, Number(value) || 0) };
    }));
  };
  const saveUsage = async () => {
    try {
      setUsageSaving(true);
      const data = await api.post<KitchenUsagePayload>("/inventory/daily-usage", {
        report_date: usageReport?.report_date,
        created_by: userId,
        items: usageItems.map((item) => ({
          product_id: item.product_id,
          used_qty: item.used_qty,
          spoilage_qty: item.spoilage_qty,
          returned_qty: item.returned_qty,
          note: item.note,
        })),
      });
      setUsageReport(data.report);
      addNotification({
        id: crypto.randomUUID(),
        label: "Report submitted for review.",
        type: "success",
      });
      await fetchUsage();
    } catch (e) {
      console.error(e);
      addNotification({
        id: crypto.randomUUID(),
        label:
          e instanceof Error
            ? `Failed to save daily usage report: ${e.message}`
            : "Failed to save daily usage report.",
        type: "error",
      });
    } finally {
      setUsageSaving(false);
    }
  };

  const fmt = (d: Date) => {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  };
  const fmtDate = (d: Date) => {
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  };

  const newCount  = orders.filter((o) => !o.isPreparing && !o.isReady).length;
  const prepCount = orders.filter((o) => o.isPreparing && !o.isReady).length;
  const readyCount = orders.filter((o) => o.isReady).length;

  const STATUS_LABEL: Record<string, string> = { "dine-in": "Dine In", "take-out": "Take Out", "delivery": "Delivery" };
  const usageHasErrors = usageItems.some((item) => getUsageTotals(item).invalid);
  const usageInputDisabled = usageReport?.status === "finalized";
  const usageSubmitDisabled =
    usageSaving || usageInputDisabled || usageHasErrors || usageItems.length === 0;

  const renderUsageForm = () => {
    if (usageLoading) {
      return <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Loading report...</p>;
    }

    if (usageItems.length === 0) {
      return (
        <div style={{ border: "1px dashed #d1d5db", borderRadius: 14, padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
          No kitchen stock has been withdrawn yet for today.
        </div>
      );
    }

    return (
      <>
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            Enter today&apos;s actual used, wasted, and returned quantities for each withdrawn stock item.
          </p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {usageItems.map((item, index) => {
            const product = usageProducts.find((entry) => entry.product_id === item.product_id);
            const timingState = product ? getUsageTimingState(product) : null;
            const { remaining, invalid } = getUsageTotals(item);
            const cardBorderColor =
              timingState?.tone === "expired"
                ? "#fecaca"
                : timingState?.tone === "warning"
                  ? "#fde68a"
                  : "#e5e7eb";
            const cardBackground =
              timingState?.tone === "expired"
                ? "#fff7f7"
                : timingState?.tone === "warning"
                  ? "#fffdf5"
                  : "#fcfcfc";
            const chipBackground =
              timingState?.tone === "expired" ? "#fef2f2" : "#fffbeb";
            const chipColor =
              timingState?.tone === "expired" ? "#b91c1c" : "#b45309";

            return (
              <div
                key={item.usage_item_id ?? item.product_id ?? `usage-${index}`}
                style={{
                  border: `1px solid ${cardBorderColor}`,
                  borderRadius: 16,
                  padding: 14,
                  background: cardBackground,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 4 }}>
                      {item.product_name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{item.category}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>•</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{item.unit}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <div style={{ borderRadius: 999, background: "#f3f4f6", color: "#374151", fontSize: 11, fontWeight: 600, padding: "6px 10px" }}>
                      Withdrawn: {item.withdrawn_qty} {item.unit}
                    </div>
                    {timingState && (
                      <div style={{ borderRadius: 999, background: chipBackground, color: chipColor, fontSize: 11, fontWeight: 700, padding: "6px 10px" }}>
                        {timingState.label}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Used</div>
                    <input type="number" min="0" step="0.01" value={item.used_qty === 0 ? "" : item.used_qty} onChange={(e) => updateUsageItem(index, "used_qty", e.target.value)} placeholder="0" disabled={usageInputDisabled} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12, fontFamily: F, outline: "none", background: usageInputDisabled ? "#f8fafc" : "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Wasted</div>
                    <input type="number" min="0" step="0.01" value={item.spoilage_qty === 0 ? "" : item.spoilage_qty} onChange={(e) => updateUsageItem(index, "spoilage_qty", e.target.value)} placeholder="0" disabled={usageInputDisabled} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12, fontFamily: F, outline: "none", background: usageInputDisabled ? "#f8fafc" : "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Returned</div>
                    <input type="number" min="0" step="0.01" value={item.returned_qty === 0 ? "" : item.returned_qty} onChange={(e) => updateUsageItem(index, "returned_qty", e.target.value)} placeholder="0" disabled={usageInputDisabled} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12, fontFamily: F, outline: "none", background: usageInputDisabled ? "#f8fafc" : "#fff" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Remaining</div>
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${invalid ? "#fecaca" : "#e5e7eb"}`, fontSize: 12, fontFamily: F, background: invalid ? "#fef2f2" : "#f8fafc", color: invalid ? "#b91c1c" : "#111", fontWeight: 600 }}>
                      {remaining} {item.unit}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: invalid ? 8 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
                  <input value={item.note} onChange={(e) => updateUsageItem(index, "note", e.target.value)} placeholder="Optional notes for this item" disabled={usageInputDisabled} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12, fontFamily: F, outline: "none", background: usageInputDisabled ? "#f8fafc" : "#fff" }} />
                </div>

                {invalid && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
                    Total reported quantity cannot be greater than withdrawn stock.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={() => { void saveUsage(); }} disabled={usageSubmitDisabled} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #111", background: usageSubmitDisabled ? "#9ca3af" : "#111", color: "#fff", fontSize: 12, fontWeight: 600, cursor: usageSubmitDisabled ? "not-allowed" : "pointer", fontFamily: F }}>
            {usageSaving ? "Submitting..." : "Submit for Review"}
          </button>
        </div>
      </>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", fontFamily: F }}>
      <Sidebar />

      <div style={{ paddingLeft: 96 }}>

        {/* ── Header ── */}
        <div style={{ padding: "28px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>

          {/* Left: brand + clock */}
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ChefHat size={15} color="#111" />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#111", letterSpacing: "0.1em", textTransform: "uppercase" }}>Cook View</span>
            </div>
            <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#111", lineHeight: 1.1 }}>{fmt(currentTime)}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{fmtDate(currentTime)}</div>
            </div>
          </div>

          {/* Right: stats */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "New",     val: newCount,    dim: false },
              { label: "Cooking", val: prepCount,   dim: false },
              { label: "Ready",   val: readyCount,  dim: false },
              { label: "Served",  val: servedCount, dim: true  },
            ].map(({ label, val, dim }) => (
              <div key={label} style={{
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
                padding: "10px 18px", textAlign: "center", minWidth: 64,
              }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: dim ? "#d1d5db" : "#111", lineHeight: 1 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Notification banner ── */}
        {notifPermission !== "granted" && (
          <div style={{ padding: "12px 32px 0" }}>
            <button onClick={() => Notification.requestPermission().then(setNotifPermission)}
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, background: "#fff",
                border: "1px solid #e5e7eb", color: "#6b7280", padding: "7px 14px", borderRadius: 9, cursor: "pointer", fontFamily: F }}>
              <Bell size={11} /> Enable notifications for order alerts
            </button>
          </div>
        )}

        {/* ── Queue ── */}
        <div style={{ padding: "16px 32px 0", display: "none" }}>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <button
              onClick={() => setUsageOpen((v) => !v)}
              style={{ width: "100%", background: "#fff", border: "none", padding: "15px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: F }}
            >
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111", letterSpacing: "0.08em", textTransform: "uppercase" }}>Daily Usage Report</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  {usageReport ? `Status: ${usageReport.status}` : "Preparing today's kitchen usage sheet"}
                </div>
              </div>
              <motion.div animate={{ rotate: usageOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <AlertCircle size={14} color="#9ca3af" />
              </motion.div>
            </button>

            <AnimatePresence initial={false}>
              {usageOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: "hidden", borderTop: "1px solid #f3f4f6" }}
                >
                  <div style={{ padding: 16 }}>
                    {renderUsageForm()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div style={{ padding: "24px 32px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <ClipboardList size={13} color="#9ca3af" />
            <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Order Queue</span>
            {orders.length > 0 && (
              <span style={{ background: "#f3f4f6", color: "#6b7280", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99 }}>
                {orders.length}
              </span>
            )}
          </div>

          {orders.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "80px 0", gap: 10, background: "#fff", borderRadius: 20, border: "1px solid #e5e7eb" }}>
              <Utensils size={28} color="#e5e7eb" />
              <p style={{ fontSize: 12, color: "#d1d5db", margin: 0 }}>No pending orders. New orders will appear here.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
              <AnimatePresence mode="popLayout">
                {orders.map((order) => {
                  const isNew = !order.isPreparing && !order.isReady;
                  const isPrep = order.isPreparing && !order.isReady;
                  const isReady = order.isReady;
                  const isCancelling = cancellingId === order.id;
                  const timerEditable = isNew || isPrep;
                  const timerBase = order.prepStartedAt;
                  const estimatedPrepMinutes = Math.max(order.estimatedPrepMinutes ?? 10, 1);

                  return (
                    <motion.div
                      key={order.id} layout
                      initial={{ opacity: 0, y: 12, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 320, damping: 28 } }}
                      exit={{ opacity: 0, scale: 0.94, y: -8, transition: { duration: 0.22 } }}
                      whileHover={{ y: -2, transition: { duration: 0.12 } }}
                      style={{
                        background: "#fff", borderRadius: 16,
                        border: `1px solid ${order.overdue ? "#fecaca" : "#e5e7eb"}`,
                        overflow: "hidden", display: "flex", flexDirection: "column",
                      }}
                    >
                      {/* Thin state line at top */}
                      <div style={{ height: 2, background: order.overdue ? "#ef4444" : isReady ? "#111" : isPrep ? "#d1d5db" : "#f3f4f6" }} />

                      <div style={{ padding: "14px 14px 14px", flex: 1, display: "flex", flexDirection: "column" }}>

                        {/* Order number + type */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{order.orderNumber}</span>
                          <span style={{ fontSize: 10, fontWeight: 500, color: "#9ca3af", background: "#f9fafb",
                            border: "1px solid #f3f4f6", padding: "2px 8px", borderRadius: 99 }}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </span>
                        </div>

                        {/* Timer */}
                        {isPrep && timerBase && order.dueAt && (
                          <OrderTimer
                            baseAt={timerBase}
                            dueAt={order.dueAt}
                            estimatedPrepMinutes={estimatedPrepMinutes}
                            orderNumber={order.orderNumber}
                          />
                        )}

                        {isPrep && order.overdue && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            padding: "5px 10px", borderRadius: 7, marginBottom: 10,
                            background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 600 }}>
                            <AlertCircle size={11} /> Overdue
                          </div>
                        )}

                        {timerEditable && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Prep Timer
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#111" }}>
                                {estimatedPrepMinutes} min
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => handleTimerAdjust(order, -1)}
                                style={{
                                  flex: 1, padding: "6px 0", borderRadius: 9, border: "1px solid #e5e7eb",
                                  background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600,
                                  cursor: "pointer", fontFamily: F,
                                }}>
                                -1 min
                              </button>
                              <button
                                onClick={() => handleTimerAdjust(order, 1)}
                                style={{
                                  flex: 1, padding: "6px 0", borderRadius: 9, border: "1px solid #e5e7eb",
                                  background: "#fff", color: "#374151", fontSize: 11, fontWeight: 600,
                                  cursor: "pointer", fontFamily: F,
                                }}>
                                +1 min
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Ready badge */}
                        {isReady && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            padding: "5px 10px", borderRadius: 7, marginBottom: 10,
                            background: "#f9fafb", color: "#374151", fontSize: 11, fontWeight: 500 }}>
                            <CheckCircle2 size={11} color="#111" /> {order.isOnlinePickup ? "Ready for Pickup" : "Ready to serve"}
                          </div>
                        )}

                        {/* Items */}
                        <div style={{ flex: 1, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}>
                          {order.items.map((item, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "baseline" }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", minWidth: 20 }}>{item.quantity}×</span>
                              <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>{item.name}</span>
                            </div>
                          ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {/* Start */}
                            <button onClick={() => isNew && handleStart(order.id)} disabled={!isNew}
                              style={{
                                flex: 1, padding: "7px 0", borderRadius: 9, fontSize: 11, fontWeight: 500,
                                cursor: isNew ? "pointer" : "not-allowed", fontFamily: F,
                                border: "1px solid",
                                borderColor: isNew ? "#e5e7eb" : "#f3f4f6",
                                background: isNew ? "#fff" : "#fafafa",
                                color: isNew ? "#374151" : "#d1d5db",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                                transition: "all 0.12s",
                              }}>
                              <Play size={9} /> Start
                            </button>

                            {/* Ready / Served */}
                            {!isReady ? (
                              <button onClick={() => isPrep && handleReady(order)} disabled={!isPrep}
                                style={{
                                  flex: 1, padding: "7px 0", borderRadius: 9, fontSize: 11, fontWeight: 500,
                                  cursor: isPrep ? "pointer" : "not-allowed", fontFamily: F,
                                  border: "1px solid",
                                  borderColor: isPrep ? "#d1d5db" : "#f3f4f6",
                                  background: isPrep ? "#f9fafb" : "#fafafa",
                                  color: isPrep ? "#374151" : "#d1d5db",
                                  transition: "all 0.12s",
                                }}>
                                {order.orderType === "delivery" ? "Ready for Pickup" : "Complete"}
                              </button>
                            ) : order.orderType === "delivery" ? (
                              <button
                                disabled
                                style={{
                                  flex: 1, padding: "7px 0", borderRadius: 9, fontSize: 11, fontWeight: 600,
                                  cursor: "not-allowed", fontFamily: F,
                                  border: "1px solid #e5e7eb", background: "#f9fafb", color: "#9ca3af",
                                  transition: "all 0.12s",
                                }}>
                                Awaiting Cashier
                              </button>
                            ) : null}
                          </div>

                          {/* Cancel */}
                          <button onClick={() => !isCancelling && !isReady && handleCancel(order.id)}
                            disabled={isCancelling || isReady}
                            style={{
                              width: "100%", padding: "6px 0", borderRadius: 9, fontSize: 11, fontWeight: 500,
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                              cursor: (isCancelling || isReady) ? "not-allowed" : "pointer", fontFamily: F,
                              border: "1px solid",
                              borderColor: (isCancelling || isReady) ? "#f3f4f6" : "#e5e7eb",
                              background: "transparent",
                              color: (isCancelling || isReady) ? "#d1d5db" : "#9ca3af",
                              transition: "all 0.12s",
                            }}>
                            <XCircle size={10} />
                            {isCancelling ? "Cancelling…" : "Cancel"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          <div style={{ paddingTop: 24 }}>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <button
                onClick={() => setUsageOpen((v) => !v)}
                style={{ width: "100%", background: "#fff", border: "none", padding: "15px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: F }}
              >
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111", letterSpacing: "0.08em", textTransform: "uppercase" }}>Daily Usage Report</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                    {usageReport ? `Status: ${usageReport.status}` : "Preparing today's kitchen usage sheet"}
                  </div>
                </div>
                <motion.div animate={{ rotate: usageOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <AlertCircle size={14} color="#9ca3af" />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {usageOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden", borderTop: "1px solid #f3f4f6" }}
                  >
                    <div style={{ padding: 16 }}>
                      {renderUsageForm()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
