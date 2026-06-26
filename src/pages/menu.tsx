import { useState, useCallback, useEffect, useRef, memo, useMemo } from "react";
import {
  Search, Minus, Plus, Trash2, UtensilsCrossed, Check, Clock,
  Calendar, Hash, ChevronDown, Delete, X, AlertCircle, CheckCircle2,
  Info, ShoppingBag, CreditCard, User, Package, AlertTriangle,
  FileText, History, Wifi, WifiOff, RotateCcw, MessageSquare,
  Printer, ChevronRight, Ban, Receipt,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api, apiCall, resolveAssetUrl } from "../lib/api";
import {
  fetchGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  type GeneralRestaurantSettings,
} from "../lib/restaurantSettings";
import { Sidebar } from "@/components/Sidebar";
import { useViewport } from "@/hooks/use-tablet";
import { useAuth } from "../context/authcontext";

// ─── FONT ────────────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("poppins-font")) {
  const l = document.createElement("link");
  l.id = "poppins-font";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}

const F = "'Poppins', sans-serif";
const SP = { type: "spring" as const, stiffness: 400, damping: 28 };

// ─── TYPES ───────────────────────────────────────────────────────────────────
type CustomerType = string;
type PaymentMethod = "cash" | "gcash_onsite";
type ToastType = "success" | "error" | "info" | "warning";
type OrderTypeVal = "dine-in" | "take-out" | "delivery";

interface BillingSettings { taxRate: number; serviceCharge: number; }
interface DiscountType { discount_id: number; name: string; percentage: number; is_active?: boolean | number; }
interface ToastItem { id: string; type: ToastType; message: string; }

interface MenuItem {
  id: number; name: string; price: number; category: string;
  itemType?: string; remainingStock: number; availabilityStatus: string; image?: string | null;
}
interface CartItem extends MenuItem { quantity: number; note?: string; }
interface TableItem { id: number; number: number; status: "available" | "occupied"; seats?: number; }

interface OnlineNotif {
  id: number; orderNumber: string; total: number; createdAt: string;
  orderType: string; trackingStatus: string; handoverTimestamp?: string | null;
  riderName?: string | null; paymentMethod?: string | null; paymentStatus?: string | null;
  items: { name: string; quantity: number }[];
}

interface ShiftOrder {
  id: number; orderNumber: string; total: number; createdAt: string;
  orderType: string; paymentMethod: string; customerType: string;
  items: { name: string; quantity: number; price: number }[];
  status: string; discountAmount: number; taxAmount: number;
}

interface HeldOrder {
  id: string; cart: CartItem[]; orderType: OrderTypeVal;
  paymentMethod: PaymentMethod; customerType: CustomerType;
  selectedTable: number | null; note: string; savedAt: string;
}

interface OrderPayload {
  items: { product_id: number; qty: number; subtotal: number; name: string; price: number; note?: string }[];
  total: number; order_type: OrderTypeVal; payment_method: PaymentMethod;
  payment_status?: "Paid"; proof_image_url?: string; customer_type: CustomerType;
  discount_name?: string; discount_rate?: number; discount_amount: number;
  vat_amount: number; vat_exempt_amount: number; cashierId: number | null;
  table_id: number | null; cash_tendered?: number; change_amount?: number;
  order_note?: string;
}

interface ReceiptData {
  orderNumber: string; date: string; time: string; items: CartItem[];
  subtotal: number; discountName: string; discountAmount: number;
  taxAmount: number; serviceChargeAmount: number; paidAmount: number;
  cashTendered: number; changeAmount: number; orderType: string;
  paymentMethod: string; customerType: CustomerType;
  restaurantSettings: GeneralRestaurantSettings; orderNote?: string;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const isFood = (item: MenuItem) =>
  String(item.itemType ?? "menu_item").trim().toLowerCase() === "menu_item";

const isUnavailableStatus = (value: unknown) =>
  ["unavailable", "out of stock", "hidden", "not configured"].includes(
    String(value ?? "").trim().toLowerCase()
  );

const isPaidStatus = (value?: string | null) =>
  String(value || "").trim().toLowerCase() === "paid";

const fmt = (n: number) => {
  const [int, dec] = n.toFixed(2).split(".");
  return (dec === "00" ? int : `${int}.${dec}`).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const getNow = () => {
  const d = new Date();
  return {
    date: d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
};

const DEFAULT_BILLING_SETTINGS: BillingSettings = { taxRate: 0, serviceCharge: 0 };
const DEFAULT_DISCOUNT_TYPES: DiscountType[] = [
  { discount_id: 1, name: "Regular customer", percentage: 0, is_active: true },
  { discount_id: 2, name: "PWD", percentage: 20, is_active: true },
  { discount_id: 3, name: "Senior Citizen", percentage: 20, is_active: true },
];

const computePricing = (subtotal: number, billing: BillingSettings, discountRate: number) => {
  const safeSubtotal = Number(subtotal || 0);
  const safeDiscountRate = Math.max(0, Number(discountRate || 0));
  const discountAmount = safeSubtotal * (safeDiscountRate / 100);
  const taxAmount = safeSubtotal * (billing.taxRate / 100);
  const serviceChargeAmount = safeSubtotal * (billing.serviceCharge / 100);
  return {
    subtotal: safeSubtotal, discountAmount, taxAmount, serviceChargeAmount,
    amountDue: safeSubtotal - discountAmount + taxAmount + serviceChargeAmount,
  };
};

const mapProducts = (data: Record<string, unknown>[]): MenuItem[] => {
  const map = new Map<string, Record<string, unknown>>();
  for (const p of data ?? []) {
    if (String(p.item_type ?? "menu_item").trim().toLowerCase() !== "menu_item") continue;
    const key = String(p.product_name ?? p.name ?? "").trim().toLowerCase();
    const ex = map.get(key);
    if (!ex || Number(p.product_id ?? p.id ?? 0) > Number(ex.product_id ?? ex.id ?? 0)) map.set(key, p);
  }
  return Array.from(map.values()).map((p) => ({
    id: Number(p.product_id ?? p.id),
    name: String(p.product_name ?? p.name ?? `Product #${p.id}`),
    price: Number(p.price ?? 0),
    category: String(p.category ?? "UNCATEGORIZED").toUpperCase(),
    itemType: String(p.item_type ?? "menu_item"),
    remainingStock: Number(p.stock ?? p.quantity ?? p.dailyWithdrawn ?? 0),
    availabilityStatus: String(p.availability_status ?? "Available"),
    image: p.image ? resolveAssetUrl(String(p.image)) : null,
  }));
};

const mapTables = (data: Record<string, unknown>[]): TableItem[] =>
  (data ?? []).map((t) => ({
    id: Number(t.id ?? t.table_id),
    number: Number(t.number ?? t.table_number ?? t.id),
    status: (t.status as "available" | "occupied") ?? "available",
    seats: t.seats ? Number(t.seats) : undefined,
  }));

const formatOrderTimestamp = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

const formatPaymentMethodLabel = (paymentMethod?: string | null) => {
  const normalized = String(paymentMethod || "").toLowerCase().trim();
  if (!normalized) return "—";
  if (normalized === "gcash") return "GCash";
  if (normalized === "cash on pickup" || normalized === "cash_on_pickup") return "Cash on Pickup";
  if (normalized === "cash") return "Cash";
  if (["gcash_onsite", "onsite gcash / e-payment", "onsite e-payment"].includes(normalized))
    return "Onsite GCash / E-Payment";
  return paymentMethod || "—";
};

// ─── RECEIPT HTML BUILDER ────────────────────────────────────────────────────
const buildReceiptHtml = ({
  orderNumber, date, time, items, paidAmount, cashTendered, changeAmount,
  orderType, paymentMethod, customerType, subtotal, discountName, discountAmount,
  taxAmount, serviceChargeAmount, restaurantSettings, orderNote,
}: ReceiptData) => {
  const currency = restaurantSettings.currency || "PHP";
  const paymentMethodLabel =
    paymentMethod === "cash" ? "Cash"
    : paymentMethod === "gcash_onsite" ? "Onsite E-Payment"
    : paymentMethod;

  const itemRows = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}${item.note ? `<br/><small style="color:#9ca3af">${escapeHtml(item.note)}</small>` : ""}</td>
      <td class="qty">${item.quantity}</td>
      <td class="amount">PHP ${fmt(item.price)}</td>
      <td class="amount">PHP ${fmt(item.price * item.quantity)}</td>
    </tr>
  `).join("");

  const pricingRows = `
    <div class="line"><span>Subtotal</span><strong>${currency} ${fmt(subtotal)}</strong></div>
    <div class="line"><span>Discount${discountName ? ` (${escapeHtml(discountName)})` : ""}</span><strong>-${currency} ${fmt(discountAmount)}</strong></div>
    <div class="line"><span>Tax</span><strong>${currency} ${fmt(taxAmount)}</strong></div>
    <div class="line"><span>Service Charge</span><strong>${currency} ${fmt(serviceChargeAmount)}</strong></div>
  `;

  const cashRows = paymentMethod === "cash"
    ? `<div class="line"><span>Cash Tendered</span><strong>${currency} ${fmt(cashTendered)}</strong></div>
       <div class="line"><span>Change</span><strong>${currency} ${fmt(changeAmount)}</strong></div>` : "";

  const headerMeta = [restaurantSettings.tagline, restaurantSettings.address, restaurantSettings.phone, restaurantSettings.email]
    .filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  const noteSection = orderNote
    ? `<div style="margin:12px 0;padding:8px 12px;background:#f9fafb;border-radius:8px;border:1px dashed #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Order Note</p>
        <p style="margin:0;font-size:12px;color:#374151;">${escapeHtml(orderNote)}</p>
       </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt ${escapeHtml(orderNumber)}</title>
  <style>
    body { font-family: ${F}; background: #f5f5f5; color: #111; margin: 0; padding: 24px; }
    .receipt { max-width: 420px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 24px; box-sizing: border-box; }
    .header { text-align: center; padding-bottom: 16px; border-bottom: 1px dashed #d1d5db; margin-bottom: 16px; }
    .header h1 { font-size: 22px; margin: 0 0 4px; }
    .header p, .meta p, .footer p { margin: 0; color: #6b7280; font-size: 12px; line-height: 1.6; }
    .txn-badge { display: inline-block; margin-top: 10px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px 12px; }
    .txn-badge .txn-label { font-size: 9px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; display: block; }
    .txn-badge .txn-value { font-size: 13px; font-weight: 700; color: #111; letter-spacing: 0.04em; }
    .meta, .summary { display: grid; gap: 8px; margin-bottom: 16px; }
    .line { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { padding: 8px 0; border-bottom: 1px dashed #e5e7eb; font-size: 12px; text-align: left; vertical-align: top; }
    .qty { text-align: center; width: 44px; }
    .amount { text-align: right; white-space: nowrap; }
    .total { padding-top: 12px; border-top: 1px solid #111; margin-top: 12px; font-size: 15px; }
    .footer { margin-top: 20px; text-align: center; border-top: 1px dashed #d1d5db; padding-top: 16px; }
    @media print { body { background: #fff; padding: 0; } .receipt { border: none; border-radius: 0; max-width: none; padding: 0; } }
  </style>
</head>
<body>
  <main class="receipt">
    <section class="header">
      <h1>${escapeHtml(restaurantSettings.restaurantName)}</h1>
      <p>Official Sales Receipt</p>
      ${headerMeta}
      <div class="txn-badge">
        <span class="txn-label">Transaction ID</span>
        <span class="txn-value">${escapeHtml(orderNumber)}</span>
      </div>
    </section>
    <section class="meta">
      <div class="line"><span>Date</span><strong>${escapeHtml(date)}</strong></div>
      <div class="line"><span>Time</span><strong>${escapeHtml(time)}</strong></div>
      <div class="line"><span>Order Type</span><strong>${escapeHtml(orderType)}</strong></div>
      <div class="line"><span>Payment</span><strong>${escapeHtml(paymentMethodLabel)}</strong></div>
      <div class="line"><span>Discount Type</span><strong>${escapeHtml(customerType || discountName || "Regular customer")}</strong></div>
    </section>
    ${noteSection}
    <table>
      <thead><tr><th>Item</th><th class="qty">Qty</th><th class="amount">Price</th><th class="amount">Subtotal</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <section class="summary">
      ${pricingRows}
      ${cashRows}
      <div class="line total"><span>Total Paid</span><strong>${currency} ${fmt(paidAmount)}</strong></div>
    </section>
    <section class="footer">
      <p>Thank you for your order.</p>
      <p>Please keep this receipt for your records.</p>
    </section>
  </main>
</body>
</html>`;
};

// ─── KOT HTML BUILDER ────────────────────────────────────────────────────────
const buildKOTHtml = (orderNumber: string, items: CartItem[], orderType: string, tableNumber?: string, orderNote?: string) => {
  const { date, time } = getNow();
  const itemRows = items.map((item) => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-bottom:1px dashed #ccc;">
      <div>
        <span style="font-size:18px;font-weight:700;">${item.name}</span>
        ${item.note ? `<div style="font-size:12px;color:#555;margin-top:2px;">Note: ${escapeHtml(item.note)}</div>` : ""}
      </div>
      <span style="font-size:22px;font-weight:900;margin-left:16px;">×${item.quantity}</span>
    </div>
  `).join("");
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><title>KOT ${escapeHtml(orderNumber)}</title>
<style>body{font-family:monospace;padding:16px;max-width:300px;margin:0 auto;}h2{text-align:center;font-size:14px;margin:0 0 4px;}@media print{body{padding:0;}}</style>
</head>
<body>
  <h2>KITCHEN ORDER TICKET</h2>
  <p style="text-align:center;font-size:20px;font-weight:900;margin:8px 0;">${escapeHtml(orderNumber)}</p>
  <p style="text-align:center;font-size:12px;color:#555;margin:0 0 4px;">${escapeHtml(date)} ${escapeHtml(time)}</p>
  <p style="text-align:center;font-size:13px;font-weight:700;text-transform:uppercase;margin:0 0 12px;">${escapeHtml(orderType)}${tableNumber ? ` — Table ${escapeHtml(tableNumber)}` : ""}</p>
  <hr style="border:2px solid #000;margin-bottom:12px;"/>
  ${itemRows}
  ${orderNote ? `<div style="margin-top:12px;padding:8px;border:2px dashed #000;"><strong>Note:</strong> ${escapeHtml(orderNote)}</div>` : ""}
</body>
</html>`;
};

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const btn = (bg: string, color: string, extra?: object) => ({
  width: "100%", padding: "13px", background: bg, color, border: "none",
  borderRadius: 12, fontSize: 13, fontWeight: 500, fontFamily: F, cursor: "pointer", ...extra,
});

// ─── SPINNER ─────────────────────────────────────────────────────────────────
const Spinner = memo(({ size = 20, light = false }: { size?: number; light?: boolean }) => (
  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
    style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${light ? "rgba(255,255,255,0.3)" : "#eee"}`, borderTopColor: light ? "#fff" : "#555", flexShrink: 0 }} />
));

// ─── TOAST SYSTEM ────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  const config: Record<ToastType, { bg: string; border: string; icon: React.ReactNode; iconColor: string }> = {
    error: { bg: "#fff1f2", border: "#fecaca", iconColor: "#dc2626", icon: <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} /> },
    success: { bg: "#f0fdf4", border: "#bbf7d0", iconColor: "#16a34a", icon: <CheckCircle2 style={{ width: 15, height: 15, flexShrink: 0 }} /> },
    info: { bg: "#eff6ff", border: "#bfdbfe", iconColor: "#2563eb", icon: <Info style={{ width: 15, height: 15, flexShrink: 0 }} /> },
    warning: { bg: "#fffbeb", border: "#fde68a", iconColor: "#d97706", icon: <AlertTriangle style={{ width: 15, height: 15, flexShrink: 0 }} /> },
  };
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none", maxWidth: 340, width: "calc(100vw - 48px)" }}>
      <AnimatePresence>
        {toasts.map((toast) => {
          const c = config[toast.type];
          return (
            <motion.div key={toast.id} layout initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", pointerEvents: "auto", fontFamily: F }}>
              <span style={{ color: c.iconColor, marginTop: 1 }}>{c.icon}</span>
              <p style={{ fontSize: 12, fontWeight: 500, color: "#111", flex: 1, margin: 0, lineHeight: 1.5 }}>{toast.message}</p>
              <button onClick={() => onDismiss(toast.id)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", flexShrink: 0, marginTop: 1 }}>
                <X style={{ width: 13, height: 13, color: "#9ca3af" }} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const toast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);
  return { toasts, toast, dismiss };
}

// ─── ONLINE INDICATOR ────────────────────────────────────────────────────────
function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 99999, background: "#dc2626", color: "#fff", borderRadius: 99, padding: "6px 14px", display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, fontFamily: F, boxShadow: "0 4px 16px rgba(220,38,38,0.3)" }}>
          <WifiOff style={{ width: 13, height: 13 }} />
          No connection — orders cannot be placed
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── PAYMENT STATUS BADGE ────────────────────────────────────────────────────
function PaymentStatusBadge({ paymentStatus }: { paymentStatus?: string | null }) {
  const normalizedStatus = String(paymentStatus || "").toLowerCase().trim();
  const isPaid = normalizedStatus === "paid";
  const label = normalizedStatus === "pending payment" || !normalizedStatus ? "Unpaid" : isPaid ? "Paid" : paymentStatus || "Unpaid";
  return isPaid ? (
    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "#dcfce7", color: "#15803d", display: "inline-flex", alignItems: "center", gap: 3, border: "1px solid #bbf7d0", whiteSpace: "nowrap" }}>{label}</span>
  ) : (
    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "#fef9c3", color: "#a16207", border: "1px solid #fde68a", whiteSpace: "nowrap" }}>{label}</span>
  );
}

// ─── CUSTOM SELECT ────────────────────────────────────────────────────────────
const CustomSelect = memo(({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <div style={{ position: "relative" }}>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", padding: "7px 24px 7px 10px", fontSize: 11, fontFamily: F, border: "1px solid #efefef", borderRadius: 9, background: "#fafafa", color: "#444", outline: "none", appearance: "none", cursor: "pointer" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    <ChevronDown style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, color: "#bbb", pointerEvents: "none" }} />
  </div>
));

// ─── CONFIRM CANCEL MODAL ────────────────────────────────────────────────────
function ConfirmCancelModal({ show, message, onConfirm, onCancel, confirming }: {
  show: boolean; message: string; confirming: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            onClick={confirming ? undefined : onCancel}
            style={{ position: "fixed", inset: 0, zIndex: 99998, backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 320, borderRadius: 18, overflow: "hidden", border: "1px solid #e5e7eb", pointerEvents: "auto", fontFamily: F }}>
              <div style={{ padding: "22px 20px 14px" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Ban style={{ width: 16, height: 16, color: "#dc2626" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 6 }}>Cancel Order?</p>
                <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>{message}</p>
              </div>
              <div style={{ padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: 7 }}>
                <motion.button whileTap={{ scale: 0.98 }} onClick={onConfirm} disabled={confirming}
                  style={{ ...btn("#dc2626", "#fff"), cursor: confirming ? "not-allowed" : "pointer", opacity: confirming ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {confirming ? <><Spinner size={13} light />Cancelling…</> : "Yes, Cancel Order"}
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} disabled={confirming}
                  style={{ ...btn("#f3f4f6", "#6b7280"), padding: "10px", fontSize: 12, cursor: confirming ? "not-allowed" : "pointer" }}>
                  Keep Order
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── PROCEED CONFIRM MODAL ───────────────────────────────────────────────────
function ProceedConfirmModal({ show, order, confirming, onConfirm, onCancel }: {
  show: boolean; order: OnlineNotif | null; confirming: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!order) return null;
  const orderTime = (() => {
    try { return new Date(order.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }); }
    catch { return order.createdAt; }
  })();
  const payLabel = formatPaymentMethodLabel(order.paymentMethod);
  const isPaid = isPaidStatus(order.paymentStatus);

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={confirming ? undefined : onCancel}
            style={{ position: "fixed", inset: 0, zIndex: 99998, backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.55)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 380, borderRadius: 20, overflow: "hidden", border: "1px solid #e5e7eb", pointerEvents: "auto", fontFamily: F, boxShadow: "0 24px 60px rgba(0,0,0,0.14)" }}>
              <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ShoppingBag style={{ width: 14, height: 14, color: "#16a34a" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Confirm Order</p>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0, lineHeight: 1.2 }}>{order.orderNumber}</p>
                    </div>
                  </div>
                  <button onClick={confirming ? undefined : onCancel} disabled={confirming}
                    style={{ background: "transparent", border: "none", cursor: confirming ? "not-allowed" : "pointer", padding: 4, display: "flex", alignItems: "center", borderRadius: 6, opacity: confirming ? 0.4 : 1 }}>
                    <X style={{ width: 15, height: 15, color: "#9ca3af" }} />
                  </button>
                </div>
              </div>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { icon: <Package style={{ width: 10, height: 10, color: "#9ca3af" }} />, label: "Order Type", value: order.orderType, capitalize: true },
                    { icon: <Clock style={{ width: 10, height: 10, color: "#9ca3af" }} />, label: "Placed At", value: orderTime },
                    { icon: <CreditCard style={{ width: 10, height: 10, color: "#9ca3af" }} />, label: "Payment", value: payLabel },
                  ].map(({ icon, label, value, capitalize }) => (
                    <div key={label} style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, padding: "9px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>{icon}<span style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span></div>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#111", margin: 0, textTransform: capitalize ? "capitalize" : "none" }}>{value}</p>
                    </div>
                  ))}
                  <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <User style={{ width: 10, height: 10, color: "#9ca3af" }} />
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pay Status</span>
                    </div>
                    <PaymentStatusBadge paymentStatus={order.paymentStatus} />
                  </div>
                </div>
              </div>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", maxHeight: 160, overflowY: "auto" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Order Items</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {order.items.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280" }}>{item.quantity}×</span>
                      </div>
                      <span style={{ fontSize: 12, color: "#374151" }}>{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>Order Total</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>₱{Number(order.total).toFixed(2)}</span>
                </div>
                {!isPaid && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "9px 12px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <AlertTriangle style={{ width: 13, height: 13, color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 11, color: "#92400e", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                      Payment is still <strong>unpaid</strong>. Proceeding will mark this as paid and queue it for preparation. Verify with the customer before confirming.
                    </p>
                  </motion.div>
                )}
                {isPaid && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: "9px 12px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <CheckCircle2 style={{ width: 13, height: 13, color: "#16a34a", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 11, color: "#166534", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                      Payment confirmed. Proceeding will queue this order for kitchen preparation.
                    </p>
                  </motion.div>
                )}
              </div>
              <div style={{ padding: "14px 20px 18px", display: "flex", flexDirection: "column", gap: 7 }}>
                <motion.button whileHover={{ opacity: confirming ? 1 : 0.88 }} whileTap={confirming ? {} : { scale: 0.98 }} disabled={confirming} onClick={onConfirm}
                  style={{ ...btn("#16a34a", "#fff"), cursor: confirming ? "not-allowed" : "pointer", opacity: confirming ? 0.65 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {confirming ? <><Spinner size={13} light />Processing…</> : "Confirm & Proceed to Queue"}
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} disabled={confirming}
                  style={{ ...btn("#f3f4f6", "#6b7280"), padding: "10px", fontSize: 12, cursor: confirming ? "not-allowed" : "pointer", opacity: confirming ? 0.5 : 1 }}>
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
const ProductCard = memo(({ item, onAdd, inCart }: { item: MenuItem; onAdd: (i: MenuItem) => void; inCart: boolean }) => {
  const out = isUnavailableStatus(item.availabilityStatus);
  return (
    <motion.button layout onClick={() => !out && onAdd(item)} disabled={out}
      whileHover={!out ? { y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.07)" } : {}}
      whileTap={!out ? { scale: 0.96 } : {}} transition={SP}
      style={{ position: "relative", width: "100%", textAlign: "left", overflow: "hidden", borderRadius: 14, background: "#fff", border: `1px solid ${inCart ? "#111" : "#efefef"}`, opacity: out ? 0.4 : 1, cursor: out ? "not-allowed" : "pointer", fontFamily: F, padding: 0 }}>
      <div style={{ width: "100%", aspectRatio: "1", background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {item.image ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <UtensilsCrossed style={{ width: 22, height: 22, color: "#ddd" }} />}
      </div>
      <div style={{ padding: "9px 10px 10px" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "#222", lineHeight: 1.35, marginBottom: 7 }}>{item.name}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>₱{fmt(item.price)}</span>
          {!isFood(item) && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 5, background: out ? "#fff0f0" : "#f5f5f5", color: out ? "#f87171" : "#bbb" }}>
              {out ? "Out" : item.remainingStock}
            </span>
          )}
        </div>
      </div>
      <AnimatePresence>
        {inCart && (
          <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={SP}
            style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check style={{ width: 9, height: 9, color: "#fff" }} strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
});

// ─── CART ROW ─────────────────────────────────────────────────────────────────
const CartRow = memo(({ item, onRemove, onQty, onNoteChange }: {
  item: CartItem; onRemove: (id: number) => void; onQty: (id: number, d: number) => void;
  onNoteChange: (id: number, note: string) => void;
}) => {
  const [showNote, setShowNote] = useState(false);

  const qtyBtn = (delta: number, icon: React.ReactNode) => (
    <motion.button whileTap={{ scale: 0.85 }} onClick={() => onQty(item.id, delta)}
      style={{ width: 22, height: 22, borderRadius: 7, border: "1px solid #eee", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon}
    </motion.button>
  );

  return (
    <motion.div layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={SP}
      style={{ padding: "10px 0", borderBottom: "1px solid #f5f5f5", fontFamily: F }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
          {item.image ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <UtensilsCrossed style={{ width: 13, height: 13, color: "#ddd" }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#222", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{item.name}</p>
          <p style={{ fontSize: 10, color: "#bbb", marginTop: 1, marginBottom: 0 }}>₱{fmt(item.price)}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {qtyBtn(-1, <Minus style={{ width: 10, height: 10, color: "#666" }} />)}
          {/* Direct qty input */}
          <input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0) onQty(item.id, val - item.quantity);
            }}
            style={{ width: 32, textAlign: "center", fontSize: 11, fontWeight: 600, color: "#111", border: "1px solid #eee", borderRadius: 6, padding: "2px 0", fontFamily: F, background: "#fff", outline: "none" }}
          />
          {qtyBtn(1, <Plus style={{ width: 10, height: 10, color: "#666" }} />)}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#111", minWidth: 40, textAlign: "right" }}>₱{fmt(item.price * item.quantity)}</span>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowNote((p) => !p)}
          title="Add note"
          style={{ width: 22, height: 22, border: "none", background: item.note ? "#eff6ff" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, flexShrink: 0 }}>
          <MessageSquare style={{ width: 11, height: 11, color: item.note ? "#2563eb" : "#ccc" }} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => onRemove(item.id)}
          style={{ width: 22, height: 22, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
          <Trash2 style={{ width: 12, height: 12, color: "#ccc" }} />
        </motion.button>
      </div>
      <AnimatePresence>
        {showNote && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
            <input
              placeholder="Special instruction (e.g. no onions)…"
              value={item.note || ""}
              onChange={(e) => onNoteChange(item.id, e.target.value)}
              maxLength={120}
              style={{ width: "100%", marginTop: 7, padding: "7px 10px", fontSize: 11, fontFamily: F, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa", color: "#333", outline: "none", boxSizing: "border-box" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── HELD ORDER BADGE ────────────────────────────────────────────────────────
function HeldOrdersBadge({ held, onRestore, onDiscard }: {
  held: HeldOrder[]; onRestore: (h: HeldOrder) => void; onDiscard: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (held.length === 0) return null;
  return (
    <div style={{ position: "relative" }}>
      <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOpen((p) => !p)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px", borderRadius: 20, border: "1px solid #f59e0b", background: open ? "#fef3c7" : "#fffbeb", cursor: "pointer", fontFamily: F }}>
        <RotateCcw style={{ width: 11, height: 11, color: "#d97706" }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "#d97706" }}>Held</span>
        <span style={{ fontSize: 10, fontWeight: 700, background: "#f59e0b", color: "#fff", borderRadius: 99, padding: "1px 6px" }}>{held.length}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ display: "flex" }}>
          <ChevronDown style={{ width: 11, height: 11, color: "#d97706" }} />
        </motion.div>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }}
            style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 9999, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.10)", minWidth: 260, overflow: "hidden", fontFamily: F }}>
            <div style={{ padding: "10px 14px 6px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Held Orders</p>
            </div>
            {held.map((h) => (
              <div key={h.id} style={{ padding: "10px 14px", borderTop: "1px solid #f5f5f5", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#111", margin: "0 0 2px" }}>{h.cart.length} item{h.cart.length !== 1 ? "s" : ""} · {h.orderType}</p>
                  <p style={{ fontSize: 10, color: "#9ca3af", margin: 0 }}>{h.savedAt}</p>
                  <p style={{ fontSize: 10, color: "#6b7280", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {h.cart.map((c) => `${c.name}×${c.quantity}`).join(", ")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => { onRestore(h); setOpen(false); }}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                    Restore
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => onDiscard(h.id)}
                    style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                    <Trash2 style={{ width: 11, height: 11 }} />
                  </motion.button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SHIFT HISTORY MODAL ──────────────────────────────────────────────────────
function ShiftHistoryModal({ show, orders, loading, onClose, onVoid, voidingId, restaurantSettings }: {
  show: boolean; orders: ShiftOrder[]; loading: boolean; onClose: () => void;
  onVoid: (id: number, orderNumber: string) => void; voidingId: number | null;
  restaurantSettings: GeneralRestaurantSettings;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const totalRevenue = orders.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.total, 0);
  const totalOrders = orders.filter((o) => o.status !== "Cancelled").length;

  const handleReprintReceipt = (order: ShiftOrder) => {
    const { date, time } = getNow();
    const html = buildReceiptHtml({
      orderNumber: order.orderNumber, date, time,
      items: order.items.map((i) => ({ ...i, id: 0, category: "", itemType: "menu_item", remainingStock: 0, availabilityStatus: "Available", quantity: i.quantity })),
      subtotal: order.total + order.discountAmount - order.taxAmount,
      discountName: order.customerType, discountAmount: order.discountAmount,
      taxAmount: order.taxAmount, serviceChargeAmount: 0,
      paidAmount: order.total, cashTendered: order.total, changeAmount: 0,
      orderType: order.orderType, paymentMethod: order.paymentMethod,
      customerType: order.customerType, restaurantSettings,
    });
    const w = window.open("", "_blank", "width=420,height=760");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
    w.focus(); w.onload = () => w.print();
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, zIndex: 99998, backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 480, maxHeight: "88vh", borderRadius: 20, overflow: "hidden", border: "1px solid #e5e7eb", pointerEvents: "auto", fontFamily: F, display: "flex", flexDirection: "column" }}>
              {/* Header */}
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <History style={{ width: 14, height: 14, color: "#2563eb" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Shift Summary</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Today's Orders</p>
                  </div>
                </div>
                <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, borderRadius: 6 }}>
                  <X style={{ width: 15, height: 15, color: "#9ca3af" }} />
                </button>
              </div>

              {/* Stats */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, flexShrink: 0 }}>
                {[
                  { label: "Orders", value: String(totalOrders), color: "#111" },
                  { label: "Revenue", value: `₱${fmt(totalRevenue)}`, color: "#16a34a" },
                  { label: "Voided", value: String(orders.filter((o) => o.status === "Cancelled").length), color: "#dc2626" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                    <p style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>{label}</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Orders list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {loading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120 }}>
                    <Spinner />
                  </div>
                ) : orders.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 120, gap: 8 }}>
                    <Receipt style={{ width: 28, height: 28, color: "#e5e7eb" }} />
                    <p style={{ fontSize: 12, color: "#bbb" }}>No orders placed yet this shift</p>
                  </div>
                ) : (
                  orders.map((order) => {
                    const isCancelled = order.status === "Cancelled";
                    const isExpanded = expanded === order.id;
                    return (
                      <div key={order.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                        <div style={{ padding: "12px 20px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isCancelled ? "#9ca3af" : "#111", textDecoration: isCancelled ? "line-through" : "none" }}>{order.orderNumber}</span>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: isCancelled ? "#fee2e2" : "#dcfce7", color: isCancelled ? "#dc2626" : "#16a34a" }}>{order.status}</span>
                              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: "#f3f4f6", color: "#6b7280", textTransform: "capitalize" }}>{order.orderType}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#6b7280" }}>{new Date(order.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: isCancelled ? "#9ca3af" : "#111" }}>₱{fmt(order.total)}</span>
                              <span style={{ fontSize: 10, color: "#9ca3af" }}>{formatPaymentMethodLabel(order.paymentMethod)}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setExpanded(isExpanded ? null : order.id)}
                              style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fafafa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.18 }}>
                                <ChevronRight style={{ width: 12, height: 12, color: "#6b7280" }} />
                              </motion.div>
                            </motion.button>
                            {!isCancelled && (
                              <>
                                <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleReprintReceipt(order)}
                                  title="Reprint receipt"
                                  style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fafafa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <Printer style={{ width: 12, height: 12, color: "#6b7280" }} />
                                </motion.button>
                                <motion.button whileTap={{ scale: 0.95 }} onClick={() => onVoid(order.id, order.orderNumber)}
                                  disabled={voidingId === order.id}
                                  title="Void order"
                                  style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #fecaca", background: "#fff1f2", cursor: voidingId === order.id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: voidingId === order.id ? 0.5 : 1 }}>
                                  {voidingId === order.id ? <Spinner size={11} /> : <Ban style={{ width: 11, height: 11, color: "#dc2626" }} />}
                                </motion.button>
                              </>
                            )}
                          </div>
                        </div>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                              <div style={{ padding: "0 20px 12px" }}>
                                <div style={{ background: "#fafafa", borderRadius: 10, padding: "10px 12px", border: "1px solid #f0f0f0" }}>
                                  {order.items.map((item, i) => (
                                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < order.items.length - 1 ? "1px dashed #eee" : "none" }}>
                                      <span style={{ fontSize: 11, color: "#374151" }}>{item.name} ×{item.quantity}</span>
                                      <span style={{ fontSize: 11, fontWeight: 500, color: "#111" }}>₱{fmt(item.price * item.quantity)}</span>
                                    </div>
                                  ))}
                                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>Total</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>₱{fmt(order.total)}</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── RIDER HANDOVER MODAL ─────────────────────────────────────────────────────
function RiderHandoverModal({ show, order, riderName, handoverTime, saving, onChange, onConfirm, onCancel }: {
  show: boolean; order: OnlineNotif | null; riderName: string; handoverTime: string;
  saving: boolean; onChange: (value: string) => void; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {show && order && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={saving ? undefined : onCancel}
            style={{ position: "fixed", inset: 0, zIndex: 99998, backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.6)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 336, borderRadius: 20, overflow: "hidden", border: "1px solid #ebebeb", pointerEvents: "auto", fontFamily: F }}>
              <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid #f5f5f5" }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Delivery Handover</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: 0 }}>{order.orderNumber}</p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>Record the rider before marking this delivery as handed over.</p>
              </div>
              <div style={{ padding: "16px 18px 18px" }}>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Rider Name</p>
                  <input value={riderName} onChange={(e) => onChange(e.target.value)} placeholder="Enter rider name" disabled={saving}
                    style={{ width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: F, border: `1px solid ${riderName.trim() ? "#111" : "#efefef"}`, borderRadius: 10, background: "#fafafa", color: "#333", outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Handover Time</p>
                  <div style={{ width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: F, border: "1px solid #efefef", borderRadius: 10, background: "#f5f5f5", color: "#333", boxSizing: "border-box" }}>
                    {handoverTime || "—"}
                  </div>
                </div>
                <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Order Type</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#065f46", textTransform: "capitalize" }}>{order.orderType}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>₱{Number(order.total).toFixed(2)}</span>
                  </div>
                </div>
                <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} disabled={saving || !riderName.trim()} onClick={onConfirm}
                  style={{ ...btn("#111", "#fff", { marginBottom: 6 }), cursor: saving || !riderName.trim() ? "not-allowed" : "pointer", opacity: saving || !riderName.trim() ? 0.45 : 1 }}>
                  {saving ? "Saving..." : "Confirm Handover"}
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} disabled={saving}
                  style={{ ...btn("transparent", "#bbb"), padding: "9px", fontSize: 12, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── AMOUNT ENTRY MODAL ───────────────────────────────────────────────────────
function AmountEntryModal({ show, amountDue, paymentMethod, onConfirm, onCancel }: {
  show: boolean; amountDue: number; paymentMethod: PaymentMethod;
  onConfirm: (payload: { tendered: number; selectedImage?: File; proofFileName?: string }) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState("");
  const [proofFileName, setProofFileName] = useState("");
  const [proofError, setProofError] = useState("");

  useEffect(() => {
    if (show) { setInput(""); setSelectedImage(null); setPreviewURL(""); setProofFileName(""); setProofError(""); }
  }, [show]);
  useEffect(() => { return () => { if (previewURL) URL.revokeObjectURL(previewURL); }; }, [previewURL]);

  const tendered = parseFloat(input) || 0;
  const change = tendered - amountDue;
  const enough = tendered >= amountDue;
  const KEYS = ["1","2","3","4","5","6","7","8","9","⌫","0","00"];
  const QUICK = [50,100,200,500,1000].filter((d) => d >= amountDue);

  const handleKey = (k: string) => {
    if (k === "⌫") return setInput((p) => p.slice(0, -1));
    if (k === "00") return setInput((p) => (p === "" ? "" : p + "00"));
    if (k === "." && input.includes(".")) return;
    const di = input.indexOf(".");
    if (di !== -1 && input.length - di > 2) return;
    setInput((p) => p + k);
  };

  const handleProofSelected = (file?: File | null) => {
    if (!file) { if (previewURL) URL.revokeObjectURL(previewURL); setSelectedImage(null); setPreviewURL(""); setProofFileName(""); setProofError(""); return; }
    if (!file.type.startsWith("image/")) { setProofError("Please upload an image file for the payment proof."); if (previewURL) URL.revokeObjectURL(previewURL); setSelectedImage(null); setPreviewURL(""); setProofFileName(""); return; }
    if (file.size > 5 * 1024 * 1024) { setProofError("Payment proof image must be 5 MB or smaller."); if (previewURL) URL.revokeObjectURL(previewURL); setSelectedImage(null); setPreviewURL(""); setProofFileName(""); return; }
    if (previewURL) URL.revokeObjectURL(previewURL);
    setSelectedImage(file); setPreviewURL(URL.createObjectURL(file)); setProofFileName(file.name || `payment-proof-${Date.now()}.jpg`); setProofError("");
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 99998, backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.6)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 320, maxHeight: "90vh", borderRadius: 20, border: "1px solid #ebebeb", pointerEvents: "auto", fontFamily: F, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "22px 22px 16px", borderBottom: "1px solid #f5f5f5", flexShrink: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Amount due</p>
                <p style={{ fontSize: 28, fontWeight: 600, color: "#111", margin: 0 }}>₱{fmt(amountDue)}</p>
              </div>
              <div style={{ padding: "14px 18px 18px", overflowY: "auto", flex: 1 }}>
                {paymentMethod === "cash" ? (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Cash tendered</p>
                    <div style={{ background: "#fafafa", border: `1.5px solid ${input ? "#111" : "#e5e5e5"}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, marginBottom: 10, minHeight: 44 }}>
                      <span style={{ fontSize: 14, color: "#aaa" }}>₱</span>
                      <span style={{ fontSize: 20, fontWeight: 600, color: input ? "#111" : "#ccc", flex: 1 }}>{input || "0"}</span>
                    </div>
                    {QUICK.length > 0 && (
                      <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                        {QUICK.slice(0, 5).map((a) => (
                          <motion.button key={a} whileTap={{ scale: 0.94 }} onClick={() => setInput(String(a))}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #efefef", background: "#f7f7f7", fontSize: 11, fontWeight: 500, color: "#555", cursor: "pointer", fontFamily: F }}>
                            ₱{a}
                          </motion.button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        { label: "Change", val: enough && input ? `₱${fmt(change)}` : "—", color: enough && input ? "#16a34a" : "#ddd" },
                        { label: "Tendered", val: input ? `₱${fmt(tendered)}` : "—", color: input ? "#111" : "#ddd" },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 10, color: "#bbb", marginBottom: 3 }}>{label}</p>
                          <p style={{ fontSize: 16, fontWeight: 600, color, margin: 0 }}>{val}</p>
                        </div>
                      ))}
                    </div>
                    <AnimatePresence>
                      {input && !enough && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          style={{ fontSize: 11, color: "#f87171", marginBottom: 8, fontWeight: 500 }}>
                          ₱{fmt(amountDue - tendered)} short
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                      {KEYS.map((k) => (
                        <motion.button key={k} whileTap={{ scale: 0.9 }} onClick={() => handleKey(k)}
                          style={{ padding: "12px", borderRadius: 9, border: "1px solid #eee", background: k === "⌫" ? "#fafafa" : "#fff", fontSize: k === "⌫" ? 13 : 15, fontWeight: 500, color: k === "⌫" ? "#999" : "#222", cursor: "pointer", fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {k === "⌫" ? <Delete style={{ width: 14, height: 14, color: "#999" }} /> : k}
                        </motion.button>
                      ))}
                    </div>
                    <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} disabled={!input || !enough} onClick={() => onConfirm({ tendered })}
                      style={{ ...btn("#16a34a", "#fff", { marginBottom: 6 }), cursor: !input || !enough ? "not-allowed" : "pointer", opacity: !input || !enough ? 0.4 : 1 }}>
                      Confirm Payment
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} style={{ ...btn("transparent", "#bbb"), padding: "9px", fontSize: 12 }}>Cancel</motion.button>
                  </>
                ) : (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 14, padding: "16px 16px 12px", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: "#0070BA", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>G</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0070BA" }}>Onsite GCash / E-Payment</span>
                      </div>
                      <img src="/gcashQR1.png" alt="GCash QR" style={{ width: 164, height: 164, borderRadius: 10, objectFit: "contain", background: "#fff", border: "1px solid #efefef" }} />
                      <p style={{ fontSize: 10, color: "#aaa", marginTop: 10, textAlign: "center", lineHeight: 1.6 }}>Ask the customer to scan, then upload or capture the proof below.</p>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 2 }}>₱{fmt(amountDue)}</p>
                    </div>
                    <div style={{ background: previewURL ? "#eff6ff" : "#fffbeb", border: `1px solid ${previewURL ? "#bfdbfe" : "#fde68a"}`, borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
                      <p style={{ fontSize: 11, color: previewURL ? "#1d4ed8" : "#92400e", lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
                        {previewURL ? "Payment status: Pending Verification. Review the proof image, then click Confirm Payment." : "Upload or capture the payment proof first. Payment will stay pending until the cashier confirms it."}
                      </p>
                    </div>
                    <div style={{ marginBottom: 14, border: "1px solid #f0f0f0", borderRadius: 12, padding: 12, background: "#fff" }}>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Proof Image</label>
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => handleProofSelected(e.currentTarget.files?.[0] ?? null)}
                        style={{ width: "100%", fontFamily: F, fontSize: 12, color: "#444", marginBottom: previewURL ? 12 : 0 }} />
                      {proofError && <p style={{ fontSize: 11, color: "#dc2626", margin: "8px 0 0", fontWeight: 500 }}>{proofError}</p>}
                      {previewURL && (
                        <div>
                          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb", background: "#fafafa", marginBottom: 8 }}>
                            <img src={previewURL} alt="Payment proof preview" style={{ width: "100%", maxHeight: 220, objectFit: "contain", display: "block", background: "#fff" }} />
                          </div>
                          <p style={{ fontSize: 11, color: "#666", margin: "0 0 8px", wordBreak: "break-word" }}>{proofFileName}</p>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => handleProofSelected(null)}
                              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#555", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                              Remove Image
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} disabled={!selectedImage}
                      onClick={() => onConfirm({ tendered: amountDue, selectedImage: selectedImage ?? undefined, proofFileName })}
                      style={{ ...btn("#0070BA", "#fff", { marginBottom: 6 }), cursor: !selectedImage ? "not-allowed" : "pointer", opacity: !selectedImage ? 0.45 : 1 }}>
                      Confirm Payment
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} style={{ ...btn("transparent", "#bbb"), padding: "9px", fontSize: 12 }}>Cancel</motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── SUCCESS MODAL ────────────────────────────────────────────────────────────
function SuccessModal({
  show, onClose, orderNumber, savedCart, paidAmount, cashTendered, changeAmount,
  orderType, paymentMethod, customerType, subtotal, discountAmount, taxAmount,
  serviceChargeAmount, restaurantSettings, orderNote,
}: {
  show: boolean; onClose: () => void; orderNumber: string; savedCart: CartItem[];
  paidAmount: number; cashTendered: number; changeAmount: number; orderType: string;
  paymentMethod: string; customerType: CustomerType; subtotal: number;
  discountAmount: number; taxAmount: number; serviceChargeAmount: number;
  restaurantSettings: GeneralRestaurantSettings; orderNote: string;
}) {
  const { date, time } = getNow();
  const receiptHtml = useMemo(() => buildReceiptHtml({
    orderNumber, date, time, items: savedCart, subtotal, discountName: customerType,
    discountAmount, taxAmount, serviceChargeAmount, paidAmount, cashTendered, changeAmount,
    orderType, paymentMethod, customerType, restaurantSettings, orderNote,
  }), [orderNumber, savedCart, subtotal, customerType, discountAmount, taxAmount, serviceChargeAmount, paidAmount, cashTendered, changeAmount, orderType, paymentMethod, restaurantSettings, orderNote]);

  const handlePrintReceipt = () => {
    if (typeof window === "undefined") return;
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "width=420,height=760");
    if (!w) return;
    w.focus();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handlePrintKOT = () => {
    if (typeof window === "undefined") return;
    const kotHtml = buildKOTHtml(orderNumber, savedCart, orderType, undefined, orderNote);
    const blob = new Blob([kotHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "width=300,height=500");
    if (!w) return;
    w.focus();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleDownloadReceipt = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `receipt-${orderNumber.replace(/[^a-zA-Z0-9-_]/g, "") || "order"}.html`;
    document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 99998, backdropFilter: "blur(6px)", background: "rgba(0,0,0,0.6)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 320, maxHeight: "90vh", borderRadius: 20, overflow: "hidden", border: "1px solid #ebebeb", pointerEvents: "auto", fontFamily: F, display: "flex", flexDirection: "column" }}>
              <div style={{ overflowY: "auto", flex: 1 }}>
                <div style={{ padding: "28px 22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 460, damping: 24, delay: 0.08 }}
                    style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <Check style={{ width: 20, height: 20, color: "#22c55e" }} strokeWidth={2.5} />
                  </motion.div>
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 6 }}>Order placed successfully</p>
                    <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.65, fontWeight: 400, marginBottom: 10 }}>We'll start preparing right away!</p>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", background: "#f5f5f5", border: "1px solid #e5e7eb", borderRadius: 10, padding: "6px 14px" }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Transaction ID</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111", letterSpacing: "0.04em" }}>{orderNumber}</span>
                    </div>
                  </motion.div>
                </div>
                <div style={{ borderTop: "1px solid #f5f5f5" }} />
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {[
                    { icon: <Hash style={{ width: 11, height: 11 }} />, label: "Txn ID", value: orderNumber },
                    { icon: <Calendar style={{ width: 11, height: 11 }} />, label: "Date", value: date },
                    { icon: <Clock style={{ width: 11, height: 11 }} />, label: "Time", value: time },
                  ].map(({ icon, label: l, value }, i) => (
                    <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 6px", borderRight: i < 2 ? "1px solid #f5f5f5" : "none", textAlign: "center" }}>
                      <span style={{ color: "#ddd", marginBottom: 3 }}>{icon}</span>
                      <p style={{ fontSize: 9, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{l}</p>
                      <p style={{ fontSize: 10, fontWeight: 500, color: "#374151", lineHeight: 1.3, wordBreak: "break-all" }}>{value}</p>
                    </div>
                  ))}
                </motion.div>
                <div style={{ borderTop: "1px solid #f5f5f5" }} />
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }} style={{ padding: "10px 16px 4px", display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {[orderType, paymentMethod, customerType].filter(Boolean).map((b) => (
                    <span key={b} style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#f5f5f5", color: "#777", textTransform: "capitalize" }}>{b}</span>
                  ))}
                </motion.div>
                {orderNote && (
                  <div style={{ margin: "0 16px 10px", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Order Note</p>
                    <p style={{ fontSize: 11, color: "#1d4ed8", margin: 0 }}>{orderNote}</p>
                  </div>
                )}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} style={{ padding: "4px 16px 10px", maxHeight: 120, overflowY: "auto" }}>
                  {savedCart.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #f5f5f5" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#777" }}>{item.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 500, background: "#f5f5f5", color: "#aaa", padding: "1px 5px", borderRadius: 4, marginLeft: 5 }}>×{item.quantity}</span>
                        </div>
                        {item.note && <p style={{ fontSize: 10, color: "#9ca3af", margin: "2px 0 0" }}>{item.note}</p>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#374151" }}>₱{fmt(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </motion.div>
                <div style={{ margin: "0 16px 14px", border: "1px solid #f5f5f5", borderRadius: 12, overflow: "hidden" }}>
                  {[["Subtotal", subtotal], ["Discount", discountAmount], ["Tax", taxAmount], ["Service Charge", serviceChargeAmount]].map(([labelText, value]) => (
                    <div key={String(labelText)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px dashed #f5f5f5" }}>
                      <span style={{ fontSize: 11, color: "#bbb" }}>{labelText}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}>₱{fmt(Number(value))}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f9f9f9" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#777" }}>Total Paid</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: "#111" }}>₱{fmt(paidAmount)}</span>
                  </div>
                  {paymentMethod === "cash" && changeAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#f0fdf4", borderTop: "1px dashed #bbf7d0" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#16a34a" }}>Change</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>₱{fmt(changeAmount)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, borderTop: "1px solid #f5f5f5" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, paddingTop: 14 }}>
                  <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} onClick={handlePrintReceipt}
                    style={{ ...btn("#111", "#fff"), fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <Printer style={{ width: 13, height: 13 }} /> Receipt
                  </motion.button>
                  <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} onClick={handlePrintKOT}
                    style={{ ...btn("#374151", "#fff"), fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <FileText style={{ width: 13, height: 13 }} /> KOT
                  </motion.button>
                </div>
                <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} onClick={handleDownloadReceipt}
                  style={{ ...btn("#f3f4f6", "#374151"), fontSize: 12 }}>Download Receipt</motion.button>
                <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} onClick={onClose}
                  style={{ ...btn("#16a34a", "#fff"), fontSize: 12 }}>New Order</motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function CashierView() {
  const { width } = useViewport();
  const isCompact = width < 1100;
  const { user } = useAuth();
  const isFirstPoll = useRef(true);
  const { toasts, toast, dismiss } = useToast();

  // ── Core state ──
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderTypeVal>("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerType, setCustomerType] = useState<CustomerType>("Regular customer");
  const [orderNote, setOrderNote] = useState("");
  const [billingSettings, setBillingSettings] = useState<BillingSettings>(DEFAULT_BILLING_SETTINGS);
  const [discountTypes, setDiscountTypes] = useState<DiscountType[]>(DEFAULT_DISCOUNT_TYPES);
  const [restaurantSettings, setRestaurantSettings] = useState<GeneralRestaurantSettings>(GENERAL_SETTINGS_DEFAULTS);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [tablesSupported, setTablesSupported] = useState(true);

  // ── Modal / UI state ──
  const [showAmountEntry, setShowAmountEntry] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showShiftHistory, setShowShiftHistory] = useState(false);
  const [savedCart, setSavedCart] = useState<CartItem[]>([]);
  const [savedMeta, setSavedMeta] = useState({ orderType: "dine-in", paymentMethod: "cash", customerType: "Regular customer" as CustomerType });
  const [savedPricing, setSavedPricing] = useState({ subtotal: 0, discountAmount: 0, taxAmount: 0, serviceChargeAmount: 0, amountDue: 0 });
  const [savedCash, setSavedCash] = useState({ tendered: 0, change: 0 });
  const [savedOrderNote, setSavedOrderNote] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [placing, setPlacing] = useState(false);

  // ── Online orders ──
  const [onlineOrderNotifs, setOnlineOrderNotifs] = useState<OnlineNotif[]>([]);
  const [readyPickupOrders, setReadyPickupOrders] = useState<OnlineNotif[]>([]);
  const [deliveryHandoverOrders, setDeliveryHandoverOrders] = useState<OnlineNotif[]>([]);
  const [handedToRiderOrders, setHandedToRiderOrders] = useState<OnlineNotif[]>([]);
  const [handoverOrder, setHandoverOrder] = useState<OnlineNotif | null>(null);
  const [riderNameInput, setRiderNameInput] = useState("");
  const [handoverTime, setHandoverTime] = useState("");
  const [savingHandover, setSavingHandover] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [deliveryHandoverOpen, setDeliveryHandoverOpen] = useState(false);
  const [proceedConfirmOrder, setProceedConfirmOrder] = useState<OnlineNotif | null>(null);
  const [proceedConfirming, setProceedConfirming] = useState(false);

  // ── NEW: Cancel confirm ──
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  const [cancellingOnlineId, setCancellingOnlineId] = useState<number | null>(null);

  // ── NEW: Held orders (in-memory only, no localStorage) ──
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);

  // ── NEW: Shift history ──
  const [shiftOrders, setShiftOrders] = useState<ShiftOrder[]>([]);
  const [shiftOrdersLoading, setShiftOrdersLoading] = useState(false);
  const [voidingOrderId, setVoidingOrderId] = useState<number | null>(null);

  // ── NEW: Connectivity ──
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // ── NEW: Show order note input ──
  const [showOrderNote, setShowOrderNote] = useState(false);

  const TABS = [
    { key: "ALL", label: "All items", match: [] as string[] },
    { key: "WHOLE_HALF", label: "Whole & Half Chicken", match: ["WHOLE & HALF CHICKEN", "WHOLE AND HALF CHICKEN", "CHICKEN"] },
    { key: "RICE_MEALS", label: "Rice Meals", match: ["RICE MEALS", "RICE MEAL", "MENU FOOD"] },
    { key: "SIDES", label: "Sides", match: ["SIDES", "SIDE DISH", "SIDE DISHES", "SUPPLIES"] },
    { key: "FRUIT_SODA", label: "Fruit Soda", match: ["FRUIT SODA", "FRUIT SODAS", "DRINKS", "BEVERAGES"] },
  ];

  // ── Connectivity listener ──
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); toast("success", "Connection restored."); };
    const handleOffline = () => { setIsOnline(false); toast("error", "Lost connection. Orders cannot be placed until reconnected."); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [toast]);

  // ── Pause polling when tab is hidden ──
  const isPageVisible = useRef(true);
  useEffect(() => {
    const handleVisibility = () => { isPageVisible.current = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── Load products ──
  useEffect(() => {
    setLoadingProducts(true);
    api.get<Record<string, unknown>[]>("/products?item_type=menu_item")
      .then((d) => { setProducts(mapProducts(d ?? [])); setProductsError(""); })
      .catch(() => setProductsError("Failed to load menu items."))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<Record<string, unknown>>("/settings")
      .then((data) => {
        if (cancelled) return;
        setBillingSettings({ taxRate: Math.max(0, Number(data?.taxRate || 0)), serviceCharge: Math.max(0, Number(data?.serviceCharge || 0)) });
      })
      .catch(() => { if (!cancelled) setBillingSettings(DEFAULT_BILLING_SETTINGS); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<DiscountType[]>("/settings/discount-types")
      .then((data) => {
        if (cancelled) return;
        const next = Array.isArray(data) && data.length > 0 ? data : DEFAULT_DISCOUNT_TYPES;
        setDiscountTypes(next);
        setCustomerType((prev) => next.some((item) => item.name === prev) ? prev : next[0].name);
      })
      .catch(() => {
        if (!cancelled) {
          setDiscountTypes(DEFAULT_DISCOUNT_TYPES);
          setCustomerType((prev) => DEFAULT_DISCOUNT_TYPES.some((item) => item.name === prev) ? prev : DEFAULT_DISCOUNT_TYPES[0].name);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGeneralSettings().then((data) => { if (!cancelled) setRestaurantSettings(data); });
    return () => { cancelled = true; };
  }, []);

  // ── Load tables ──
  useEffect(() => {
    if (orderType !== "dine-in") { setSelectedTable(null); return; }
    if (!tablesSupported) { setTables([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiCall<Record<string, unknown>[]>("/tables", { method: "GET", suppressErrorStatuses: [404] });
        if (cancelled) return;
        setTables(mapTables(data ?? []));
      } catch (error) {
        if (cancelled) return;
        const status = typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : null;
        if (status === 404) setTablesSupported(false);
        else toast("warning", "Could not load tables. Table selection unavailable.");
        setTables([]);
      }
    })();
    return () => { cancelled = true; };
  }, [orderType, tablesSupported]);

  // ── Poll online orders (paused when tab hidden) ──
  useEffect(() => {
    const poll = async () => {
      if (!isPageVisible.current) return;
      try {
        const [reviewData, readyData, deliveryData] = await Promise.all([
          api.get<OnlineNotif[]>("/orders/new-online"),
          api.get<OnlineNotif[]>("/orders/ready-pickup"),
          api.get<OnlineNotif[]>("/orders/delivery-handover"),
        ]);
        const isFirst = isFirstPoll.current;
        if (isFirst) isFirstPoll.current = false;
        setOnlineOrderNotifs((prev) => {
          const next = reviewData ?? [];
          if (!isFirst && next.length > prev.length && next.length > 0) setNotifOpen(true);
          return next;
        });
        setReadyPickupOrders((readyData ?? []).filter((o) => isPaidStatus(o.paymentStatus)));
        setDeliveryHandoverOrders((prev) => {
          const next = (deliveryData ?? []).filter((o) => isPaidStatus(o.paymentStatus));
          if (!isFirst && next.length > prev.length && next.length > 0) setDeliveryHandoverOpen(true);
          return next;
        });
      } catch (err) {
        console.warn("[poll] online-order fetch failed:", err);
      }
    };
    poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, []);

  // ── Load shift history when modal opens ──
  const loadShiftOrders = useCallback(async () => {
    setShiftOrdersLoading(true);
    try {
      const cashierId = getCashierId();
      const data = await api.get<ShiftOrder[]>(`/orders/shift?cashierId=${cashierId}`);
      setShiftOrders(Array.isArray(data) ? data : []);
    } catch {
      toast("error", "Could not load shift orders.");
      setShiftOrders([]);
    } finally {
      setShiftOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showShiftHistory) loadShiftOrders();
  }, [showShiftHistory, loadShiftOrders]);

  const getCashierId = () => {
    const authUserId = Number(user?.userId ?? 0);
    return Number.isFinite(authUserId) && authUserId > 0 ? authUserId : null;
  };

  const updateQueueOrder = async (id: number, payload: Record<string, unknown>) => {
    await api.patch(`/orders/${id}`, payload);
  };

  const openRiderHandover = (order: OnlineNotif) => {
    setHandoverOrder(order);
    setRiderNameInput(order.riderName ?? "");
    setHandoverTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const closeRiderHandover = () => {
    if (savingHandover) return;
    setHandoverOrder(null); setRiderNameInput(""); setHandoverTime("");
  };

  const handleProceedOnlineOrderClick = (order: OnlineNotif) => setProceedConfirmOrder(order);

  const handleProceedOnlineOrderConfirm = async () => {
    if (!proceedConfirmOrder) return;
    const order = proceedConfirmOrder;
    setProceedConfirming(true);
    try {
      await updateQueueOrder(order.id, { status: "Queued", paymentStatus: "Paid", cashierId: getCashierId() });
      setOnlineOrderNotifs((prev) => prev.filter((o) => o.id !== order.id));
      setProceedConfirmOrder(null);
      toast("success", `Order ${order.orderNumber} confirmed and moved to cook queue.`);
    } catch {
      toast("error", "Failed to confirm order. Please try again.");
    } finally {
      setProceedConfirming(false);
    }
  };

  // ── Cancel with confirmation ──
  const handleCancelOnlineOrderConfirmed = async () => {
    if (cancelConfirmId === null) return;
    setCancellingOnlineId(cancelConfirmId);
    try {
      await updateQueueOrder(cancelConfirmId, { status: "Cancelled", cashierId: getCashierId() });
      setOnlineOrderNotifs((prev) => prev.filter((o) => o.id !== cancelConfirmId));
      toast("info", "Order has been cancelled.");
    } catch {
      toast("error", "Failed to cancel order. Please try again.");
    } finally {
      setCancellingOnlineId(null);
      setCancelConfirmId(null);
    }
  };

  const handleConfirmPickup = async (id: number) => {
    try {
      await updateQueueOrder(id, { status: "Completed", cashierId: getCashierId() });
      setReadyPickupOrders((prev) => prev.filter((o) => o.id !== id));
      toast("success", "Customer pickup confirmed successfully.");
    } catch {
      toast("error", "Failed to confirm customer pickup. Please try again.");
    }
  };

  const handleRiderHandover = async () => {
    if (!handoverOrder || !riderNameInput.trim()) return;
    const handoverTimestamp = new Date().toISOString();
    try {
      setSavingHandover(true);
      await updateQueueOrder(handoverOrder.id, { status: "Completed", cashierId: getCashierId(), handoverTimestamp, riderName: riderNameInput.trim() });
      setDeliveryHandoverOrders((prev) => prev.filter((o) => o.id !== handoverOrder.id));
      setHandedToRiderOrders((prev) => [{ ...handoverOrder, trackingStatus: "Completed", handoverTimestamp, riderName: riderNameInput.trim() }, ...prev.filter((o) => o.id !== handoverOrder.id)]);
      setHandoverOrder(null); setRiderNameInput("");
      toast("success", `Order handed to rider ${riderNameInput.trim()}.`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to record rider handover.");
    } finally {
      setSavingHandover(false);
    }
  };

  // ── Hold order ──
  const handleHoldOrder = useCallback(() => {
    if (cart.length === 0) return;
    const held: HeldOrder = {
      id: `${Date.now()}`,
      cart: [...cart],
      orderType, paymentMethod, customerType, selectedTable, note: orderNote,
      savedAt: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true }),
    };
    setHeldOrders((prev) => [...prev, held]);
    setCart([]); setOrderNote(""); setShowOrderNote(false);
    toast("info", "Order held. Restore it anytime from the Held button.");
  }, [cart, orderType, paymentMethod, customerType, selectedTable, orderNote]);

  const handleRestoreHeld = useCallback((h: HeldOrder) => {
    if (cart.length > 0) {
      toast("warning", "Clear the current cart before restoring a held order.");
      return;
    }
    setCart(h.cart); setOrderType(h.orderType); setPaymentMethod(h.paymentMethod);
    setCustomerType(h.customerType); setSelectedTable(h.selectedTable);
    setOrderNote(h.note); setShowOrderNote(!!h.note);
    setHeldOrders((prev) => prev.filter((o) => o.id !== h.id));
  }, [cart.length]);

  const handleDiscardHeld = useCallback((id: string) => {
    setHeldOrders((prev) => prev.filter((o) => o.id !== id));
    toast("info", "Held order discarded.");
  }, []);

  // ── Void order from shift history ──
  const handleVoidOrder = async (id: number, orderNum: string) => {
    setVoidingOrderId(id);
    try {
      await api.patch(`/orders/${id}`, { status: "Cancelled", cashierId: getCashierId() });
      setShiftOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "Cancelled" } : o));
      toast("info", `Order ${orderNum} voided.`);
    } catch {
      toast("error", "Failed to void order. Please try again.");
    } finally {
      setVoidingOrderId(null);
    }
  };

  // ── Derived ──
  const filtered = useMemo(() => products.filter((p) => {
    const cu = p.category.toUpperCase();
    const tabOk = selectedCategory === "ALL" || (TABS.find((t) => t.key === selectedCategory)?.match ?? []).some((m) => cu.includes(m));
    return tabOk && p.name.toLowerCase().includes(searchQuery.toLowerCase());
  }), [products, selectedCategory, searchQuery]);

  const totalQty = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const gross = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);
  const selectedDiscount = useMemo(() =>
    discountTypes.find((item) => item.name === customerType) || DEFAULT_DISCOUNT_TYPES[0],
    [discountTypes, customerType]
  );
  const pricing = useMemo(() =>
    computePricing(gross, billingSettings, Number(selectedDiscount?.percentage || 0)),
    [gross, billingSettings, selectedDiscount]
  );

  const addToCart = useCallback((item: MenuItem) => {
    if (isUnavailableStatus(item.availabilityStatus)) return;
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      if (ex) {
        const next = ex.quantity + 1;
        if (item.remainingStock > 0 && next > item.remainingStock && !isFood(item)) return prev;
        return prev.map((c) => c.id === item.id ? { ...c, quantity: next } : c);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: number) => setCart((p) => p.filter((c) => c.id !== id)), []);

  const updateQty = useCallback((id: number, delta: number) => {
    const prod = products.find((p) => p.id === id);
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = Math.max(0, item.quantity + delta);
        if ((prod?.remainingStock ?? 0) > 0 && next > (prod?.remainingStock ?? 0) && !isFood(item)) return item;
        return { ...item, quantity: next };
      }).filter((i) => i.quantity > 0)
    );
  }, [products]);

  const updateItemNote = useCallback((id: number, note: string) => {
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, note } : item));
  }, []);

  const handleAmountConfirmed = async ({ tendered, selectedImage, proofFileName }: { tendered: number; selectedImage?: File; proofFileName?: string }) => {
    if (!isOnline) { toast("error", "No connection. Cannot place order."); return; }
    setShowAmountEntry(false);
    setPlacing(true);
    const discountRate = Number(selectedDiscount?.percentage || 0);
    const { subtotal, discountAmount, taxAmount, serviceChargeAmount, amountDue } = computePricing(gross, billingSettings, discountRate);
    const change = Math.max(0, tendered - amountDue);
    let proofImageUrl: string | undefined;

    if (paymentMethod === "gcash_onsite") {
      if (!selectedImage) { toast("error", "Please upload or capture the onsite e-payment proof first."); setPlacing(false); return; }
      try {
        const formData = new FormData();
        formData.append("proof", selectedImage, proofFileName || selectedImage.name || `payment-proof-${Date.now()}.jpg`);
        const upload = await api.post<{ fileUrl: string }>("/upload-proof", formData);
        proofImageUrl = upload.fileUrl;
      } catch {
        toast("error", "Failed to upload the payment proof. Please try again.");
        setPlacing(false); return;
      }
    }

    const payload: OrderPayload = {
      items: cart.map((i) => ({ product_id: i.id, qty: i.quantity, subtotal: i.price * i.quantity, name: i.name, price: i.price, ...(i.note ? { note: i.note } : {}) })),
      total: amountDue, order_type: orderType, payment_method: paymentMethod,
      ...(paymentMethod === "gcash_onsite" && { payment_status: "Paid" as const, proof_image_url: proofImageUrl }),
      customer_type: customerType, discount_name: customerType, discount_rate: discountRate,
      discount_amount: discountAmount, vat_amount: taxAmount, vat_exempt_amount: 0,
      cashierId: getCashierId(), table_id: orderType === "dine-in" ? selectedTable : null,
      ...(paymentMethod === "cash" && { cash_tendered: tendered, change_amount: change }),
      ...(orderNote.trim() && { order_note: orderNote.trim() }),
    };

    try {
      const res = await api.post<{ orderNumber?: string }>("/orders", payload);
      const num = res?.orderNumber ?? `#${Math.floor(10000 + Math.random() * 90000)}`;
      setSavedCart([...cart]); setSavedMeta({ orderType, paymentMethod, customerType });
      setSavedPricing({ subtotal, discountAmount, taxAmount, serviceChargeAmount, amountDue });
      setSavedCash({ tendered, change }); setSavedOrderNote(orderNote);
      setOrderNumber(num); setShowSuccess(true);
      if (selectedTable !== null) setTables((prev) => prev.map((t) => t.id === selectedTable ? { ...t, status: "occupied" } : t));
    } catch (err) {
      console.error("Order failed:", err);
      toast("error", "Failed to submit order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const resetOrder = () => {
    setShowSuccess(false); setCart([]); setSavedCart([]);
    setOrderType("dine-in"); setPaymentMethod("cash");
    setCustomerType(discountTypes[0]?.name || "Regular customer");
    setSelectedTable(null); setSavedCash({ tendered: 0, change: 0 });
    setOrderNote(""); setShowOrderNote(false);
  };

  const onlineTotal = onlineOrderNotifs.length + readyPickupOrders.length;
  const deliveryPendingCount = deliveryHandoverOrders.filter((o) => !o.handoverTimestamp && !["handed to rider","out for delivery"].includes(o.trackingStatus.toLowerCase())).length + handedToRiderOrders.length;

  return (
    <>
      <Sidebar />
      <OnlineIndicator isOnline={isOnline} />

      <div style={{ display: "flex", flexDirection: isCompact ? "column" : "row", height: isCompact ? "auto" : "100vh", minHeight: "100vh", overflow: isCompact ? "auto" : "hidden", fontFamily: F, background: "#fff", paddingLeft: isCompact ? 0 : 80, paddingTop: isCompact ? 72 : 0 }}>

        {/* ── LEFT: Menu ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: isCompact ? "visible" : "hidden", minWidth: 0 }}>
          <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>

            {/* Top bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 16, fontWeight: 600, color: "#111", fontFamily: F }}>Menu</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>

                {/* Connectivity dot */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: isOnline ? "#f0fdf4" : "#fef2f2", border: `1px solid ${isOnline ? "#bbf7d0" : "#fecaca"}` }}>
                  {isOnline
                    ? <Wifi style={{ width: 11, height: 11, color: "#16a34a" }} />
                    : <WifiOff style={{ width: 11, height: 11, color: "#dc2626" }} />}
                  <span style={{ fontSize: 10, fontWeight: 600, color: isOnline ? "#16a34a" : "#dc2626" }}>{isOnline ? "Online" : "Offline"}</span>
                </div>

                {/* Held orders */}
                <HeldOrdersBadge held={heldOrders} onRestore={handleRestoreHeld} onDiscard={handleDiscardHeld} />

                {/* Shift history */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowShiftHistory(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px", borderRadius: 20, border: "1px solid #efefef", background: "#fafafa", cursor: "pointer", fontFamily: F }}>
                  <History style={{ width: 11, height: 11, color: "#6b7280" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>History</span>
                </motion.button>

                {/* Online Orders */}
                <motion.button onClick={() => setNotifOpen((p) => !p)} whileTap={{ scale: 0.95 }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px", borderRadius: 20, border: `1px solid ${onlineTotal > 0 ? "#16a34a" : "#efefef"}`, background: onlineTotal > 0 ? notifOpen ? "#e8f9ef" : "#f0fdf4" : "#fafafa", cursor: "pointer", fontFamily: F, boxShadow: onlineTotal > 0 ? "0 0 0 3px rgba(22,163,74,0.08)" : "none", transition: "all 0.2s" }}>
                  {onlineTotal > 0 && <motion.div animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", flexShrink: 0 }} />}
                  <span style={{ fontSize: 11, fontWeight: 600, color: onlineTotal > 0 ? "#16a34a" : "#bbb" }}>Online Orders</span>
                  {onlineTotal > 0 && (
                    <motion.span key={onlineTotal} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SP}
                      style={{ fontSize: 10, fontWeight: 700, background: "#16a34a", color: "#fff", borderRadius: 99, padding: "1px 6px", minWidth: 16, textAlign: "center" }}>
                      {onlineTotal}
                    </motion.span>
                  )}
                  <motion.div animate={{ rotate: notifOpen ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ display: "flex", alignItems: "center" }}>
                    <ChevronDown style={{ width: 11, height: 11, color: onlineTotal > 0 ? "#16a34a" : "#ccc" }} />
                  </motion.div>
                </motion.button>

                {/* Delivery Handover */}
                <motion.button onClick={() => setDeliveryHandoverOpen((p) => !p)} whileTap={{ scale: 0.95 }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px", borderRadius: 20, border: `1px solid ${deliveryPendingCount > 0 ? "#111" : "#efefef"}`, background: deliveryPendingCount > 0 ? deliveryHandoverOpen ? "#f3f4f6" : "#fafafa" : "#fafafa", cursor: "pointer", fontFamily: F, transition: "all 0.2s" }}>
                  {deliveryPendingCount > 0 && <motion.div animate={{ scale: [1, 1.4, 1], opacity: [1, 0.45, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} style={{ width: 7, height: 7, borderRadius: "50%", background: "#111", flexShrink: 0 }} />}
                  <span style={{ fontSize: 11, fontWeight: 600, color: deliveryPendingCount > 0 ? "#111" : "#bbb" }}>Delivery Handover</span>
                  {deliveryPendingCount > 0 && (
                    <motion.span key={deliveryPendingCount} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SP}
                      style={{ fontSize: 10, fontWeight: 700, background: "#111", color: "#fff", borderRadius: 99, padding: "1px 6px", minWidth: 16, textAlign: "center" }}>
                      {deliveryPendingCount}
                    </motion.span>
                  )}
                  <motion.div animate={{ rotate: deliveryHandoverOpen ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ display: "flex", alignItems: "center" }}>
                    <ChevronDown style={{ width: 11, height: 11, color: deliveryPendingCount > 0 ? "#111" : "#ccc" }} />
                  </motion.div>
                </motion.button>
              </div>
            </div>

            {/* Online Orders Panel */}
            <AnimatePresence>
              {notifOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} style={{ overflow: "hidden", marginBottom: 14 }}>
                  <div style={{ border: "1px solid #d1fae5", borderRadius: 12, background: "#f9fef9", overflow: "hidden" }}>
                    {onlineOrderNotifs.length === 0 && readyPickupOrders.length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center" }}>
                        <p style={{ fontSize: 11, color: "#bbb", fontFamily: F, margin: 0 }}>No online pickup orders waiting for cashier action</p>
                      </div>
                    ) : (
                      <div>
                        {onlineOrderNotifs.length > 0 && (
                          <div style={{ padding: "10px 14px 8px", borderBottom: readyPickupOrders.length > 0 ? "1px solid #d1fae5" : "none" }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#166534", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Awaiting Cashier Review</p>
                          </div>
                        )}
                        <AnimatePresence>
                          {onlineOrderNotifs.map((notif, idx) => (
                            <motion.div key={notif.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, height: 0, padding: 0 }} transition={{ delay: idx * 0.04, ...SP }}
                              style={{ display: "grid", gap: 10, padding: "12px 14px", borderBottom: idx < onlineOrderNotifs.length - 1 ? "1px solid #d1fae5" : "none" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{notif.orderNumber}</span>
                                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "#dcfce7", color: "#166534" }}>{notif.trackingStatus}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 9, fontWeight: 500, padding: "1px 7px", borderRadius: 99, background: "#d1fae5", color: "#065f46", textTransform: "capitalize" }}>{notif.orderType}</span>
                                    <span style={{ fontSize: 9, color: "#6b7280" }}>{new Date(notif.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>₱{Number(notif.total).toFixed(2)}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                    <span style={{ fontSize: 10, color: "#374151" }}>Payment: {formatPaymentMethodLabel(notif.paymentMethod)}</span>
                                    <PaymentStatusBadge paymentStatus={notif.paymentStatus} />
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                  <motion.button whileTap={{ scale: 0.95 }}
                                    onClick={() => setCancelConfirmId(notif.id)}
                                    disabled={cancellingOnlineId === notif.id}
                                    style={{ padding: "7px 11px", borderRadius: 9, border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626", cursor: cancellingOnlineId === notif.id ? "not-allowed" : "pointer", fontSize: 10.5, fontWeight: 600, fontFamily: F, opacity: cancellingOnlineId === notif.id ? 0.5 : 1, display: "flex", alignItems: "center", gap: 5 }}>
                                    {cancellingOnlineId === notif.id ? <Spinner size={11} /> : null}
                                    Cancel
                                  </motion.button>
                                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleProceedOnlineOrderClick(notif)}
                                    style={{ padding: "7px 11px", borderRadius: 9, border: "1px solid #16a34a", background: "#16a34a", color: "#fff", cursor: "pointer", fontSize: 10.5, fontWeight: 600, fontFamily: F }}>
                                    Proceed to Order
                                  </motion.button>
                                </div>
                              </div>
                              <div style={{ display: "grid", gap: 5 }}>
                                {notif.items.map((item, i) => (
                                  <span key={`${notif.id}-${i}`} style={{ fontSize: 10.5, color: "#374151" }}>{item.quantity}x {item.name}</span>
                                ))}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        {readyPickupOrders.length > 0 && (
                          <div style={{ padding: "10px 14px 8px", borderTop: onlineOrderNotifs.length > 0 ? "1px solid #d1fae5" : "none" }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#166534", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Ready for Pickup</p>
                          </div>
                        )}
                        <AnimatePresence>
                          {readyPickupOrders.map((notif, idx) => (
                            <motion.div key={`ready-${notif.id}`} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, height: 0, padding: 0 }} transition={{ delay: idx * 0.04, ...SP }}
                              style={{ display: "grid", gap: 10, padding: "12px 14px", borderTop: idx > 0 ? "1px solid #d1fae5" : "none" }}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{notif.orderNumber}</span>
                                    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "#dcfce7", color: "#166534" }}>{notif.trackingStatus}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 9, fontWeight: 500, padding: "1px 7px", borderRadius: 99, background: "#d1fae5", color: "#065f46", textTransform: "capitalize" }}>{notif.orderType}</span>
                                    <span style={{ fontSize: 9, color: "#6b7280" }}>{new Date(notif.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>₱{Number(notif.total).toFixed(2)}</span>
                                    <PaymentStatusBadge paymentStatus={notif.paymentStatus} />
                                  </div>
                                </div>
                                <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleConfirmPickup(notif.id)}
                                  style={{ padding: "7px 11px", borderRadius: 9, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontSize: 10.5, fontWeight: 600, fontFamily: F, flexShrink: 0 }}>
                                  Confirm Pickup
                                </motion.button>
                              </div>
                              <div style={{ display: "grid", gap: 5 }}>
                                {notif.items.map((item, i) => (
                                  <span key={`ready-${notif.id}-${i}`} style={{ fontSize: 10.5, color: "#374151" }}>{item.quantity}x {item.name}</span>
                                ))}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delivery Handover Panel */}
            <AnimatePresence>
              {deliveryHandoverOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} style={{ overflow: "hidden", marginBottom: 14 }}>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fcfcfc", overflow: "hidden" }}>
                    {(() => {
                      const pending = deliveryHandoverOrders.filter((o) => !o.handoverTimestamp && !["handed to rider","out for delivery"].includes(o.trackingStatus.toLowerCase()));
                      return pending.length === 0 && handedToRiderOrders.length === 0 ? (
                        <div style={{ padding: "16px", textAlign: "center" }}>
                          <p style={{ fontSize: 11, color: "#bbb", fontFamily: F, margin: 0 }}>No delivery orders waiting for rider handover</p>
                        </div>
                      ) : (
                        <div>
                          {pending.length > 0 && (
                            <div style={{ padding: "10px 14px 8px" }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: "#111", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Ready for Rider Handover</p>
                            </div>
                          )}
                          <AnimatePresence>
                            {pending.map((notif, idx) => (
                              <motion.div key={`delivery-${notif.id}`} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, height: 0, padding: 0 }} transition={{ delay: idx * 0.04, ...SP }}
                                style={{ display: "grid", gap: 10, padding: "12px 14px", borderTop: idx > 0 ? "1px solid #e5e7eb" : "none" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{notif.orderNumber}</span>
                                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "#f3f4f6", color: "#111" }}>{notif.trackingStatus}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 9, fontWeight: 500, padding: "1px 7px", borderRadius: 99, background: "#f3f4f6", color: "#4b5563", textTransform: "capitalize" }}>{notif.orderType}</span>
                                      <span style={{ fontSize: 9, color: "#6b7280" }}>{new Date(notif.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>₱{Number(notif.total).toFixed(2)}</span>
                                    </div>
                                  </div>
                                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => openRiderHandover(notif)}
                                    style={{ padding: "7px 11px", borderRadius: 9, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontSize: 10.5, fontWeight: 600, fontFamily: F, flexShrink: 0 }}>
                                    Handed to Rider
                                  </motion.button>
                                </div>
                                <div style={{ display: "grid", gap: 5 }}>
                                  {notif.items.map((item, i) => (
                                    <span key={`delivery-handover-${notif.id}-${i}`} style={{ fontSize: 10.5, color: "#374151" }}>{item.quantity}x {item.name}</span>
                                  ))}
                                </div>
                                <span style={{ fontSize: 10, color: "#9ca3af" }}>Record this once the rider physically collects the order</span>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                          {handedToRiderOrders.length > 0 && (
                            <div style={{ padding: "10px 14px 8px", borderTop: pending.length > 0 ? "1px solid #e5e7eb" : "none" }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: "#111", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>Handed to Rider</p>
                            </div>
                          )}
                          <AnimatePresence>
                            {handedToRiderOrders.map((notif, idx) => (
                              <motion.div key={`handover-${notif.id}`} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, height: 0, padding: 0 }} transition={{ delay: idx * 0.04, ...SP }}
                                style={{ display: "grid", gap: 10, padding: "12px 14px", borderTop: idx > 0 ? "1px solid #e5e7eb" : "none" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                  <div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{notif.orderNumber}</span>
                                    {notif.riderName && <p style={{ fontSize: 10, color: "#6b7280", margin: "2px 0 0" }}>Rider: {notif.riderName}</p>}
                                  </div>
                                  <span style={{ fontSize: 10, color: "#9ca3af", textAlign: "right" }}>{formatOrderTimestamp(notif.handoverTimestamp)}</span>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <Search style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#bbb" }} />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search items…"
                style={{ width: "100%", padding: "9px 12px 9px 32px", fontSize: 12, fontFamily: F, border: "1px solid #efefef", borderRadius: 10, background: "#fafafa", color: "#333", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Category Tabs */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 14, scrollbarWidth: "none" }}>
              {TABS.map((tab) => (
                <motion.button key={tab.key} whileTap={{ scale: 0.96 }} onClick={() => setSelectedCategory(tab.key)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", borderColor: selectedCategory === tab.key ? "#111" : "#efefef", background: selectedCategory === tab.key ? "#111" : "#fff", color: selectedCategory === tab.key ? "#fff" : "#888", fontSize: 11, fontWeight: 500, fontFamily: F, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {tab.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
            {loadingProducts ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}><Spinner /></div>
            ) : productsError ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 10 }}>
                <p style={{ fontSize: 12, color: "#f87171", fontFamily: F }}>{productsError}</p>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => {
                  setLoadingProducts(true);
                  api.get<Record<string, unknown>[]>("/products?item_type=menu_item")
                    .then((d) => { setProducts(mapProducts(d ?? [])); setProductsError(""); })
                    .catch(() => setProductsError("Failed to load menu items."))
                    .finally(() => setLoadingProducts(false));
                }} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #e5e7eb", background: "#fff", color: "#555", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F, display: "flex", alignItems: "center", gap: 6 }}>
                  <RotateCcw style={{ width: 12, height: 12 }} /> Retry
                </motion.button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8 }}>
                <UtensilsCrossed style={{ width: 28, height: 28, color: "#ddd" }} />
                <p style={{ fontSize: 12, color: "#ccc", fontFamily: F }}>No items found</p>
              </div>
            ) : (
              <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                {filtered.map((item) => (
                  <ProductCard key={item.id} item={item} onAdd={addToCart} inCart={cart.some((c) => c.id === item.id)} />
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart ── */}
        <div style={{ width: isCompact ? "100%" : 280, flexShrink: 0, borderLeft: isCompact ? "none" : "1px solid #f0f0f0", borderTop: isCompact ? "1px solid #f0f0f0" : "none", display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ padding: "20px 18px 14px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "#111", fontFamily: F }}>Current Order</h2>
              <p style={{ fontSize: 11, color: "#bbb", marginTop: 1, fontFamily: F }}>{totalQty === 0 ? "No items yet" : `${totalQty} item${totalQty > 1 ? "s" : ""}`}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Hold button */}
              <AnimatePresence>
                {cart.length > 0 && (
                  <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SP}
                    whileTap={{ scale: 0.9 }} onClick={handleHoldOrder} title="Hold order"
                    style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #f59e0b", background: "#fffbeb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <RotateCcw style={{ width: 12, height: 12, color: "#d97706" }} />
                  </motion.button>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {totalQty > 0 && (
                  <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={SP}
                    style={{ background: "#111", color: "#fff", fontSize: 10, fontWeight: 600, borderRadius: 20, padding: "2px 8px" }}>
                    {totalQty}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
            <AnimatePresence>
              {cart.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ height: "100%", minHeight: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 40 }}>
                  <UtensilsCrossed style={{ width: 28, height: 28, color: "#ddd" }} />
                  <p style={{ fontSize: 12, color: "#ccc", fontFamily: F }}>Add items to start</p>
                </motion.div>
              ) : (
                cart.map((item) => (
                  <CartRow key={item.id} item={item} onRemove={removeFromCart} onQty={updateQty} onNoteChange={updateItemNote} />
                ))
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={SP}
                style={{ padding: "14px 18px 18px", borderTop: "1px solid #f5f5f5", flexShrink: 0 }}>

                {/* Pricing breakdown */}
                <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                  {[
                    { label: "Subtotal", val: fmt(gross), color: "#999" },
                    { label: `Discount (${fmt(Number(selectedDiscount?.percentage || 0))}%)`, val: fmt(pricing.discountAmount), color: "#16a34a", prefix: "-₱" },
                    { label: `Tax (${fmt(billingSettings.taxRate)}%)`, val: fmt(pricing.taxAmount), color: "#999" },
                    { label: `Service Charge (${fmt(billingSettings.serviceCharge)}%)`, val: fmt(pricing.serviceChargeAmount), color: "#999" },
                  ].map(({ label, val, color, prefix }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px dashed #f0f0f0" }}>
                      <span style={{ fontSize: 11, color: "#bbb" }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color }}>{prefix ?? "₱"}{val}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f5f5f5" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#777" }}>Total</span>
                    <motion.span key={pricing.amountDue} initial={{ scale: 0.95, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.15 }}
                      style={{ fontSize: 19, fontWeight: 600, color: "#111", fontFamily: F }}>
                      ₱{fmt(pricing.amountDue)}
                    </motion.span>
                  </div>
                </div>

                {/* Selects */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <CustomSelect value={orderType} onChange={(v) => setOrderType(v as OrderTypeVal)} options={[{ value: "dine-in", label: "Dine in" }, { value: "take-out", label: "Take out" }, { value: "delivery", label: "Delivery" }]} />
                  <CustomSelect value={paymentMethod} onChange={(v) => setPaymentMethod(v as PaymentMethod)} options={[{ value: "cash", label: "Cash" }, { value: "gcash_onsite", label: "Onsite GCash / E-Payment" }]} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <CustomSelect value={customerType} onChange={(v) => setCustomerType(v as CustomerType)}
                    options={discountTypes.map((dt) => ({ value: dt.name, label: `${dt.name} (${fmt(Number(dt.percentage || 0))}%)` }))} />
                </div>

                {/* Table select */}
                {orderType === "dine-in" && tables.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <CustomSelect value={selectedTable !== null ? String(selectedTable) : ""} onChange={(v) => setSelectedTable(v ? Number(v) : null)}
                      options={[{ value: "", label: "Select table…" }, ...tables.map((t) => ({ value: String(t.id), label: `Table ${t.number}${t.status === "occupied" ? " (occupied)" : ""}` }))]} />
                  </div>
                )}

                {/* Order note */}
                <div style={{ marginBottom: 8 }}>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowOrderNote((p) => !p)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: `1px solid ${showOrderNote || orderNote ? "#bfdbfe" : "#e5e7eb"}`, background: showOrderNote || orderNote ? "#eff6ff" : "#fafafa", cursor: "pointer", fontFamily: F, fontSize: 11, fontWeight: 500, color: showOrderNote || orderNote ? "#2563eb" : "#9ca3af" }}>
                    <MessageSquare style={{ width: 11, height: 11 }} />
                    {orderNote ? "Edit order note" : "Add order note"}
                    {orderNote && <span style={{ background: "#2563eb", color: "#fff", borderRadius: 99, padding: "0px 5px", fontSize: 9, fontWeight: 700 }}>1</span>}
                  </motion.button>
                  <AnimatePresence>
                    {showOrderNote && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                        <textarea
                          value={orderNote}
                          onChange={(e) => setOrderNote(e.target.value)}
                          placeholder="e.g. Extra rice, no spicy, birthday order…"
                          maxLength={240}
                          rows={2}
                          style={{ width: "100%", marginTop: 6, padding: "8px 10px", fontSize: 11, fontFamily: F, border: "1px solid #bfdbfe", borderRadius: 9, background: "#eff6ff", color: "#1e40af", outline: "none", resize: "none", boxSizing: "border-box" }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Pay button */}
                <motion.button
                  onClick={() => { if (!placing && cart.length > 0 && isOnline) setShowAmountEntry(true); }}
                  disabled={placing || !isOnline}
                  whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
                  style={{ ...btn(isOnline ? "#16a34a" : "#9ca3af", "#fff"), cursor: placing || !isOnline ? "not-allowed" : "pointer", opacity: placing ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.01em" }}>
                  {placing ? (<><Spinner size={14} light />Processing…</>) : !isOnline ? "Offline — Cannot Place Order" : `Pay ₱${fmt(pricing.amountDue)}`}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Modals ── */}
      <ConfirmCancelModal
        show={cancelConfirmId !== null}
        message="This will permanently cancel the online order. The customer will need to be notified separately."
        confirming={cancellingOnlineId !== null}
        onConfirm={handleCancelOnlineOrderConfirmed}
        onCancel={() => setCancelConfirmId(null)}
      />

      <ProceedConfirmModal
        show={proceedConfirmOrder !== null}
        order={proceedConfirmOrder}
        confirming={proceedConfirming}
        onConfirm={() => { void handleProceedOnlineOrderConfirm(); }}
        onCancel={() => { if (!proceedConfirming) setProceedConfirmOrder(null); }}
      />

      <AmountEntryModal
        show={showAmountEntry}
        amountDue={pricing.amountDue}
        paymentMethod={paymentMethod}
        onConfirm={(payload) => { void handleAmountConfirmed(payload); }}
        onCancel={() => setShowAmountEntry(false)}
      />

      <RiderHandoverModal
        show={handoverOrder !== null}
        order={handoverOrder}
        riderName={riderNameInput}
        handoverTime={handoverTime}
        saving={savingHandover}
        onChange={setRiderNameInput}
        onConfirm={() => { void handleRiderHandover(); }}
        onCancel={closeRiderHandover}
      />

      <SuccessModal
        show={showSuccess}
        onClose={resetOrder}
        orderNumber={orderNumber}
        savedCart={savedCart}
        paidAmount={savedPricing.amountDue}
        cashTendered={savedCash.tendered}
        changeAmount={savedCash.change}
        orderType={savedMeta.orderType}
        paymentMethod={savedMeta.paymentMethod}
        customerType={savedMeta.customerType}
        subtotal={savedPricing.subtotal}
        discountAmount={savedPricing.discountAmount}
        taxAmount={savedPricing.taxAmount}
        serviceChargeAmount={savedPricing.serviceChargeAmount}
        restaurantSettings={restaurantSettings}
        orderNote={savedOrderNote}
      />

      <ShiftHistoryModal
        show={showShiftHistory}
        orders={shiftOrders}
        loading={shiftOrdersLoading}
        onClose={() => setShowShiftHistory(false)}
        onVoid={handleVoidOrder}
        voidingId={voidingOrderId}
        restaurantSettings={restaurantSettings}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}