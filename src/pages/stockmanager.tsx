import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  type Variants,
  type Transition,
} from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
type WithdrawalType = "initial" | "supplementary" | "return";
type StockStatus = "critical" | "low" | "normal";
type Tab = "dashboard" | "withdrawal" | "alerts" | "suppliers" | "purchases";
type SupplierField = keyof Omit<Supplier, "supplier_id">;
export type POStatus = "Draft" | "Ordered" | "Received" | "Cancelled";

export interface POItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number;
  expiryDate?: string;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  contact: string;
  date: string;
  deliveryDate: string;
  status: POStatus;
  items: POItem[];
  notes: string;
  receivedBy?: string;
  receivedDate?: string;
}

interface Product {
  inventory_id: number;
  product_id: number;
  product_name: string;
  category: string;
  unit: string;
  mainStock: number;
  quantity: number;
  item_purchased: number;
  last_update: string;
  reorderPoint: number;
  criticalPoint: number;
  supplier_name: string;
  dailyWithdrawn: number;
  returned: number;
  wasted: number;
  expiryDate?: string | null;
  promo?: string;
  isRawMaterial?: boolean | number;
}

interface StockStatusRecord {
  status_id: number;
  product_id: number;
  product_name: string;
  type: WithdrawalType;
  quantity: number;
  status_date: string;
  recorded_by: string | null;
}

interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_number: string;
  delivery_schedule: string;
  product_id: number;
  email?: string;
  products_supplied?: string;
}

interface Batch {
  batch_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  remaining_qty: number;
  unit: string;
  received_date: string;
  expiry_date: string | null;
  status: "active" | "withdrawn" | "returned" | "expired";
  returned_qty: number;
  notes?: string;
  updated_at?: string;
}

interface ReconcileRow {
  product_id: number;
  inventory_id: number;
  product_name: string;
  category: string;
  unit: string;
  withdrawn: number;
  returnQty: string;
  returnDestination: "chopped" | "whole";
}

interface RawMaterialForm {
  name: string;
  category: string;
  unit: string;
  initialStock: string;
  expiryDate: string;
  price: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

const RAW_API_URL = (import.meta as { env?: { VITE_API_URL?: string } }).env
  ?.VITE_API_URL;

function resolveApiBase(): string {
  if (!RAW_API_URL) return "/api";
  const trimmed = RAW_API_URL.replace(/\/+$/, "");
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1")
  )
    return "/api";
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    /^http:\/\//i.test(trimmed)
  )
    return "/api";
  return `${trimmed}/api`;
}

const API_BASE = resolveApiBase();
function toNumber(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok)
    throw new Error(
      `API ${res.status}: ${await res.text().catch(() => "Unknown error")}`,
    );
  return res.json();
}

const api = {
  getInventory: () => apiFetch<Product[]>("/inventory"),
  getWithdrawals: () => apiFetch<StockStatusRecord[]>("/stock-status/today"),
  postWithdrawal: (body: {
    product_id: number;
    type: WithdrawalType;
    quantity: number;
    recorded_by: string | null;
  }) =>
    apiFetch<StockStatusRecord>("/stock-status", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  postSpoilage: (body: {
    product_id: number;
    quantity: number;
    recorded_by: string | null;
  }) =>
    apiFetch<{ success: boolean }>("/stock-status/spoilage", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSuppliers: () => apiFetch<Supplier[]>("/suppliers"),
  postSupplier: (body: Omit<Supplier, "supplier_id">) =>
    apiFetch<Supplier>("/suppliers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteSupplier: (id: number) =>
    apiFetch<{ success: boolean }>(`/suppliers/${id}`, { method: "DELETE" }),
  createProduct: (body: {
    name: string;
    price: number;
    quantity: number;
    category?: string;
    description?: string;
    raw_material?: boolean;
  }) =>
    apiFetch<{ message: string; id: number }>("/products", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getActiveBatches: () => apiFetch<Batch[]>("/batches/active"),
  getProductBatches: (product_id: number) =>
    apiFetch<Batch[]>(`/batches/product/${product_id}`),
  getYesterdayReturns: () => apiFetch<Batch[]>("/batches/returned/yesterday"),
  withdrawFromBatches: (body: {
    product_id: number;
    qty_needed: number;
    recorded_by: string | null;
    type?: "initial" | "supplementary";
  }) =>
    apiFetch<{
      message: string;
      batches_used: Array<{
        batch_id: number;
        received_date: string;
        expiry_date: string | null;
        taken: number;
      }>;
    }>("/batches/withdraw", { method: "POST", body: JSON.stringify(body) }),
  returnToBatch: (body: {
    batch_id: number;
    return_qty: number;
    recorded_by: string | null;
  }) =>
    apiFetch<{ message: string }>("/batches/return", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  postBatch: (body: {
    productId: number;
    productName: string;
    quantity: number;
    unit: string;
    expiresAt?: string;
  }) =>
    apiFetch<{ id: string }>("/inventory/batches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStock: (
    inventory_id: number,
    body: {
      stock: number;
      daily_withdrawn?: number;
      returned?: number;
      wasted?: number;
      reorderPoint?: number;
      criticalPoint?: number;
    },
  ) =>
    apiFetch<Product>(`/inventory/${inventory_id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  po: {
    getAll: () => apiFetch<PurchaseOrder[]>("/purchase-orders"),
    create: (body: Omit<PurchaseOrder, "id">) =>
      apiFetch<PurchaseOrder>("/purchase-orders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateStatus: (id: string, status: POStatus) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    markReceived: (
      id: string,
      receivedBy: string,
      itemExpiryDates?: Record<number, string>,
    ) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/receive`, {
        method: "PATCH",
        body: JSON.stringify({
          receivedBy,
          receivedDate: new Date().toISOString().split("T")[0],
          itemExpiryDates,
        }),
      }),
  },
};

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "alerts", label: "Alerts" },
  { id: "suppliers", label: "Suppliers" },
  { id: "purchases", label: "Purchase Orders" },
];

const PO_STATUS_STYLES: Record<
  POStatus,
  { bg: string; text: string; dot: string }
> = {
  Draft: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  Ordered: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  Received: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  Cancelled: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" },
};

const EMPTY_PO_ITEM: Omit<POItem, "id"> = {
  name: "",
  category: "",
  unit: "",
  quantity: 0,
  unitCost: 0,
};

const BLANK_SUPPLIER: Omit<Supplier, "supplier_id"> = {
  supplier_name: "",
  contact_number: "",
  delivery_schedule: "",
  product_id: 0,
  email: "",
  products_supplied: "",
};

const BLANK_RAW_MATERIAL: RawMaterialForm = {
  name: "",
  category: "Sauce",
  unit: "liter",
  initialStock: "",
  expiryDate: "",
  price: "",
  description: "",
};

const SUPPLIER_FIELDS: {
  key: SupplierField;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "supplier_name",
    label: "Company Name",
    placeholder: "e.g. FreshMill Co.",
  },
  { key: "email", label: "Email Address", placeholder: "e.g. juan@company.ph" },
  {
    key: "contact_number",
    label: "Phone Number",
    placeholder: "e.g. 0917-123-4567",
  },
  {
    key: "products_supplied",
    label: "Supplied Products",
    placeholder: "e.g. Whole Chicken",
  },
  {
    key: "delivery_schedule",
    label: "Delivery Schedule",
    placeholder: "e.g. Mon, Wed, Fri",
  },
];

const WITHDRAWAL_TYPES: WithdrawalType[] = [
  "initial",
  "supplementary",
  "return",
];

const RAW_MATERIAL_UNITS = [
  "kg",
  "g",
  "liter",
  "ml",
  "piece",
  "pack",
  "bottle",
] as const;

const STATUS_BADGE: Record<StockStatus, string> = {
  critical: "bg-red-100 text-red-600",
  low: "bg-amber-100 text-amber-600",
  normal: "bg-emerald-100 text-emerald-600",
};
const STATUS_BAR: Record<StockStatus, string> = {
  critical: "bg-red-400",
  low: "bg-amber-400",
  normal: "bg-emerald-400",
};
const STATUS_DOT: Record<StockStatus, string> = {
  critical: "bg-red-500",
  low: "bg-amber-400",
  normal: "bg-emerald-500",
};
const TYPE_BADGE: Record<WithdrawalType, string> = {
  initial: "bg-indigo-50 text-indigo-600",
  supplementary: "bg-sky-50 text-sky-600",
  return: "bg-emerald-50 text-emerald-600",
};
const KPI_ACCENT: Record<string, { border: string; value: string }> = {
  slate: { border: "border-t-slate-800", value: "text-slate-500" },
  indigo: { border: "border-t-indigo-400", value: "text-indigo-600" },
  rose: { border: "border-t-rose-400", value: "text-rose-500" },
  emerald: { border: "border-t-emerald-400", value: "text-emerald-600" },
};

const ease: Transition = { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] };
const pageVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: ease },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};
const staggerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const calcPOTotal = (items: POItem[]) =>
  items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
const isWholeChicken = (p: Product) =>
  p.category.toLowerCase().includes("whole chicken");
const isChoppedChicken = (p: Product) =>
  p.category.toLowerCase().includes("chopped chicken");
const isChicken = (p: Product) => isWholeChicken(p) || isChoppedChicken(p);
const isMenuFoodProduct = (p: Pick<Product, "category" | "promo">) =>
  String(p.promo ?? "")
    .toUpperCase()
    .trim() === "MENU FOOD" ||
  String(p.category ?? "")
    .toLowerCase()
    .trim()
    .includes("menu food");
const isReconcilable = (p: Product) =>
  !/(sauce|bottle|beverage|condiment|drink)/.test(p.category.toLowerCase());
const getStockStatus = (p: Product): StockStatus =>
  p.mainStock <= p.criticalPoint
    ? "critical"
    : p.mainStock <= p.reorderPoint
      ? "low"
      : "normal";
const formatExpiryDate = (v?: string | null) => {
  if (!v) return "No expiry";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "No expiry"
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};
const formatReceivedDate = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};
const isExpiringSoon = (e: string | null) => {
  if (!e) return false;
  const d = (new Date(e).getTime() - Date.now()) / 86400000;
  return d <= 3 && d >= 0;
};
const isExpired = (e: string | null) =>
  !!e && new Date(e).getTime() < Date.now();
const getCategoryStyle = (cat: string) => {
  const c = cat.toLowerCase();
  if (c.includes("whole chicken"))
    return "bg-orange-50 text-orange-600 border-orange-100";
  if (c.includes("chopped chicken"))
    return "bg-amber-50 text-amber-700 border-amber-100";
  if (c.includes("sauce")) return "bg-rose-50 text-rose-500 border-rose-100";
  return "bg-slate-50 text-slate-500 border-slate-100";
};

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-5 h-28 border border-slate-100 shadow-sm"
          >
            <div className="h-3 bg-slate-100 rounded w-24 mb-3" />
            <div className="h-8 bg-slate-100 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
          <span className="text-red-500 font-bold text-sm">!</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-700">
            Failed to load data
          </p>
          <p className="text-xs text-red-500 mt-0.5">{message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-500 text-white text-xs font-semibold rounded-xl hover:bg-red-600 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${type === "success" ? "bg-emerald-600" : "bg-red-500"} text-white`}
    >
      <span>{type === "success" ? "✓" : "✕"}</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 opacity-70 hover:opacity-100 text-xs"
      >
        ✕
      </button>
    </motion.div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-50">
        <p className="font-semibold text-slate-800 text-sm">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200";

function StyledInput({
  type,
  value,
  onChange,
  placeholder,
}: {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

function StyledSelect({
  value,
  onChange,
  children,
  disabled = false,
}: {
  value: number | string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </select>
  );
}

function Btn({
  onClick,
  variant,
  loading = false,
  children,
}: {
  onClick: () => void;
  variant: "primary" | "danger";
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${variant === "primary" ? "bg-slate-900 text-white hover:bg-slate-700 shadow-slate-900/20" : "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20"}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <svg
          className="w-5 h-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

function POBadge({ status }: { status: POStatus }) {
  const s = PO_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-gray-400 hover:text-gray-600 transition-colors"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  );
}

function PODetailDrawer({
  order,
  onClose,
  onStatusChange,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onStatusChange: (id: string, status: POStatus) => void;
}) {
  const total = calcPOTotal(order.items);
  const tax = total * 0.12;
  const nextStatus: Partial<Record<POStatus, POStatus>> = {
    Draft: "Ordered",
    Ordered: "Received",
  };
  const next = nextStatus[order.status];
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 font-medium">{order.date}</p>
          <h2 className="text-lg font-semibold text-gray-800">{order.id}</h2>
        </div>
        <div className="flex items-center gap-3">
          <POBadge status={order.status} />
          <CloseBtn onClick={onClose} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <div className="bg-gray-50 rounded-xl p-4 space-y-1">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Supplier
          </p>
          <p className="font-semibold text-gray-800">{order.supplier}</p>
          <p className="text-sm text-gray-500">{order.contact}</p>
          <p className="text-sm text-gray-500">
            Delivery:{" "}
            <span className="font-medium text-gray-700">
              {order.deliveryDate}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">
            Order Items
          </p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {item.category} · {item.quantity} {item.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">
                    ₱{(item.quantity * item.unitCost).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">
                    ₱{item.unitCost}/{item.unit}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>₱{total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>VAT (12%)</span>
            <span>₱{tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-800 pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>
              ₱
              {(total + tax).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
        {order.notes && (
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
              Notes
            </p>
            <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
              {order.notes}
            </p>
          </div>
        )}
        {order.status === "Received" && order.receivedBy && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-1">
            <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">
              Received
            </p>
            <p className="text-sm font-medium text-gray-700">
              By: {order.receivedBy}
            </p>
            <p className="text-sm text-gray-500">On: {order.receivedDate}</p>
          </div>
        )}
      </div>
      {next && (
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => onStatusChange(order.id, next)}
            className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            {next === "Ordered" ? "Send to Supplier" : "Mark as Received"}
          </button>
        </div>
      )}
    </motion.div>
  );
}

function ReceivePOModal({
  order,
  loading,
  onClose,
  onConfirm,
}: {
  order: PurchaseOrder;
  loading: boolean;
  onClose: () => void;
  onConfirm: (expiryDates: Record<number, string>) => Promise<void>;
}) {
  const [expiryDates, setExpiryDates] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      order.items.map((item) => [item.id, item.expiryDate || ""]),
    ),
  );

  const handleConfirm = async () => {
    const missingItems = order.items.filter(
      (item) => !expiryDates[item.id]?.trim(),
    );
    if (missingItems.length > 0) {
      alert(
        "Please set an expiry date for each item before marking the order as received.",
      );
      return;
    }
    await onConfirm(expiryDates);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Receive Purchase Order
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Set expiry dates now, before stock is added to inventory.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{order.id}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {order.supplier} · Expected delivery {order.deliveryDate}
            </p>
          </div>

          {order.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_180px] gap-4 items-end rounded-xl border border-slate-100 px-4 py-4"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {item.name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.category} · {item.quantity} {item.unit}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDates[item.id] || ""}
                  onChange={(e) =>
                    setExpiryDates((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Receiving..." : "Confirm Receive"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface CreatePOModalProps {
  onClose: () => void;
  onCreate: (po: Omit<PurchaseOrder, "id">) => Promise<void>;
  quickOrderProducts: Product[];
  allProducts: Product[];
  prefillProduct?: {
    name: string;
    category: string;
    unit: string;
    supplier: string;
  } | null;
}

function CreatePOModal({
  onClose,
  onCreate,
  quickOrderProducts,
  allProducts,
  prefillProduct,
}: CreatePOModalProps) {
  const [supplier, setSupplier] = useState(prefillProduct?.supplier ?? "");
  const [contact, setContact] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [items, setItems] = useState<Omit<POItem, "id">[]>([
    prefillProduct
      ? {
          name: prefillProduct.name,
          category: prefillProduct.category,
          unit: prefillProduct.unit,
          quantity: 0,
          unitCost: 0,
        }
      : { ...EMPTY_PO_ITEM },
  ]);

  const updateItem = (
    idx: number,
    field: keyof Omit<POItem, "id">,
    value: string | number,
  ) =>
    setItems((p) =>
      p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  const removeItem = (idx: number) =>
    setItems((p) => p.filter((_, i) => i !== idx));
  const addQuickOrderItem = (product: Product) => {
    setItems((p) => [
      ...p,
      {
        name: product.product_name,
        category: product.category,
        unit: product.unit,
        quantity: Math.max(
          1,
          Math.ceil(Number(product.reorderPoint) - Number(product.mainStock)),
        ),
        unitCost: 0,
      },
    ]);
    setShowQuickOrder(false);
  };

  const subtotal = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.unitCost),
    0,
  );

  const handleSubmit = async () => {
    if (!supplier || !deliveryDate || items.some((i) => !i.name)) return;
    const unmatched = items
      .map((i) => i.name.trim())
      .filter(
        (name) =>
          !allProducts.some(
            (p) => p.product_name.trim().toLowerCase() === name.toLowerCase(),
          ),
      );
    if (unmatched.length > 0) {
      alert(
        `These items don't match any product in inventory:\n• ${unmatched.join("\n• ")}\n\nPlease correct the names before saving.`,
      );
      return;
    }
    try {
      await onCreate({
        supplier,
        contact,
        date: new Date().toISOString().split("T")[0],
        deliveryDate,
        status: "Draft",
        notes,
        items: items.map((item, idx) => ({
          ...item,
          id: idx + 1,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
        })),
      });
      onClose();
    } catch {
      /* keep open */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              New Purchase Order
            </h2>
            {prefillProduct && (
              <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Pre-filled from stock alert: {prefillProduct.name}
              </p>
            )}
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Supplier Name", supplier, setSupplier, "e.g. Fresh Farms Co."],
              ["Contact Number", contact, setContact, "09XXXXXXXXX"],
            ].map(([label, val, setter, ph]) => (
              <div key={label as string}>
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  {label as string}
                </label>
                <input
                  value={val as string}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                  placeholder={ph as string}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">
              Expected Delivery Date
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Items
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowQuickOrder((p) => !p)}
                  disabled={quickOrderProducts.length === 0}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Quick Order
                </button>
                <button
                  onClick={() => setItems((p) => [...p, { ...EMPTY_PO_ITEM }])}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Item
                </button>
              </div>
            </div>
            {showQuickOrder && quickOrderProducts.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide px-0.5">
                  Products Needing Reorder
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {quickOrderProducts.map((product) => (
                    <button
                      key={product.product_id}
                      onClick={() => addQuickOrderItem(product)}
                      className="w-full text-left rounded-lg bg-white border border-amber-100 hover:border-amber-300 px-3 py-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {product.product_name}
                        </span>
                        <span className="text-[11px] font-semibold text-amber-700 whitespace-nowrap">
                          Need{" "}
                          {Math.max(
                            0,
                            Number(product.reorderPoint) -
                              Number(product.mainStock),
                          )}{" "}
                          {product.unit}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {product.category}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1 mb-1">
              <span className="col-span-4">Item</span>
              <span className="col-span-2">Unit</span>
              <span className="col-span-2">Qty</span>
              <span className="col-span-3">Unit Cost</span>
              <span className="col-span-1" />
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {items.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(idx, "name", e.target.value)}
                      placeholder="Item name"
                      className="col-span-4 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                    />
                    <input
                      value={item.unit}
                      onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      placeholder="kg / pcs"
                      className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                    />
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) =>
                        updateItem(idx, "quantity", e.target.value)
                      }
                      placeholder="0"
                      className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                    />
                    <input
                      type="number"
                      value={item.unitCost || ""}
                      onChange={(e) =>
                        updateItem(idx, "unitCost", e.target.value)
                      }
                      placeholder="₱0"
                      className="col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                    />
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="col-span-1 flex justify-center text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          {subtotal > 0 && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-500">Estimated Subtotal</span>
              <span className="text-sm font-semibold text-gray-800">
                ₱{subtotal.toLocaleString()}
              </span>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions for supplier..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            Save as Draft
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StockAlertRestockBanner({
  criticalItems,
  lowItems,
  onOrderNow,
}: {
  criticalItems: Product[];
  lowItems: Product[];
  onOrderNow: (p: Product) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const total = criticalItems.length + lowItems.length;
  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden border border-red-200 shadow-sm"
    >
      <div className="bg-gradient-to-r from-red-50 to-amber-50 px-5 py-3.5 flex items-center justify-between border-b border-red-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {total} item{total > 1 ? "s" : ""} need restocking
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {criticalItems.length > 0 && (
                <span className="text-red-600 font-medium">
                  {criticalItems.length} critical
                </span>
              )}
              {criticalItems.length > 0 && lowItems.length > 0 && (
                <span className="mx-1 text-slate-300">·</span>
              )}
              {lowItems.length > 0 && (
                <span className="text-amber-600 font-medium">
                  {lowItems.length} low stock
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/60"
        >
          {collapsed ? "Show items" : "Collapse"}
        </button>
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white"
          >
            {[
              {
                items: criticalItems,
                severity: "critical" as const,
                label: "🔴 Critical — Order Immediately",
              },
              {
                items: lowItems,
                severity: "low" as const,
                label: "🟡 Low Stock — Reorder Soon",
              },
            ].map(({ items, severity, label }, gi) =>
              items.length > 0 ? (
                <div
                  key={severity}
                  className={
                    gi === 1 && criticalItems.length > 0
                      ? "border-t border-slate-100"
                      : ""
                  }
                >
                  <div className="px-5 pt-3 pb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${severity === "critical" ? "text-red-500" : "text-amber-500"}`}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="px-4 pb-3 grid grid-cols-1 gap-2">
                    {items.map((p) => {
                      const pct = Math.min(
                        100,
                        (p.mainStock / Math.max(1, p.reorderPoint)) * 100,
                      );
                      const deficit = Math.max(
                        0,
                        +(p.reorderPoint - p.mainStock).toFixed(2),
                      );
                      return (
                        <div
                          key={p.product_id}
                          className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${severity === "critical" ? "bg-red-50/60 border-red-100 hover:bg-red-50" : "bg-amber-50/50 border-amber-100 hover:bg-amber-50"}`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${severity === "critical" ? "bg-red-500" : "bg-amber-400"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {p.product_name}
                              </p>
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${getCategoryStyle(p.category)}`}
                              >
                                {p.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {p.supplier_name}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-center min-w-[80px]">
                            <p
                              className={`text-sm font-bold ${severity === "critical" ? "text-red-600" : "text-amber-600"}`}
                            >
                              {p.mainStock}
                              <span className="text-xs font-normal text-slate-400 ml-0.5">
                                {p.unit}
                              </span>
                            </p>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${severity === "critical" ? "bg-red-400" : "bg-amber-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              of {p.reorderPoint} {p.unit} reorder
                            </p>
                          </div>
                          {deficit > 0 && (
                            <div className="flex-shrink-0 text-center min-w-[72px]">
                              <p className="text-[10px] text-slate-400">Need</p>
                              <p
                                className={`text-sm font-bold ${severity === "critical" ? "text-red-600" : "text-amber-600"}`}
                              >
                                +{deficit}{" "}
                                <span className="text-xs font-normal text-slate-400">
                                  {p.unit}
                                </span>
                              </p>
                            </div>
                          )}
                          <button
                            onClick={() => onOrderNow(p)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 shadow-sm ${severity === "critical" ? "bg-red-500 text-white hover:bg-red-600 shadow-red-500/25" : "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/25"}`}
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                              />
                            </svg>
                            Order Now
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function YesterdayReturnsBanner({ batches }: { batches: Batch[] }) {
  const [collapsed, setCollapsed] = useState(false);
  if (batches.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">↩</span>
          <div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              Returned Stock From Yesterday
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Use these first before pulling from new batches
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs font-semibold text-amber-600 hover:text-amber-800 transition-colors px-2 py-1 rounded-lg hover:bg-amber-100"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <div className="px-5 pb-4 grid grid-cols-3 gap-3">
          {batches.map((b) => {
            const expiring = isExpiringSoon(b.expiry_date),
              expired = isExpired(b.expiry_date);
            return (
              <div
                key={b.batch_id}
                className={`rounded-xl p-3.5 border ${expired ? "bg-red-50 border-red-200" : expiring ? "bg-orange-50 border-orange-200" : "bg-white border-amber-100"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {b.product_name}
                  </p>
                  {expired && (
                    <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full ml-1 whitespace-nowrap">
                      EXPIRED
                    </span>
                  )}
                  {expiring && !expired && (
                    <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full ml-1 whitespace-nowrap">
                      EXPIRING SOON
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <p className="text-base font-bold text-emerald-700">
                    {b.returned_qty}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {b.unit} returned
                    </span>
                  </p>
                </div>
                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Batch #{b.batch_id}</span>
                    <span className="font-medium text-slate-500">
                      {b.remaining_qty} {b.unit} available
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Received</span>
                    <span>{formatReceivedDate(b.received_date)}</span>
                  </div>
                  {b.expiry_date && (
                    <div className="flex justify-between">
                      <span>Expires</span>
                      <span
                        className={
                          expired
                            ? "text-red-500 font-semibold"
                            : expiring
                              ? "text-orange-500 font-semibold"
                              : ""
                        }
                      >
                        {formatExpiryDate(b.expiry_date)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function FIFOBatchPreview({
  batches,
  qtyNeeded,
  unit,
}: {
  batches: Batch[];
  qtyNeeded: number;
  unit: string;
}) {
  const preview = useMemo(() => {
    if (!qtyNeeded || qtyNeeded <= 0) return [];
    const sorted = [...batches]
      .filter(
        (b) =>
          b.status === "active" &&
          b.remaining_qty > 0 &&
          !isExpired(b.expiry_date),
      )
      .sort(
        (a, b) =>
          new Date(a.received_date).getTime() -
          new Date(b.received_date).getTime(),
      );
    let remaining = qtyNeeded;
    const result: Array<{ batch: Batch; take: number }> = [];
    for (const batch of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(batch.remaining_qty, remaining);
      result.push({ batch, take });
      remaining -= take;
    }
    return result;
  }, [batches, qtyNeeded]);

  const totalAvailable = batches
    .filter(
      (b) =>
        b.status === "active" &&
        b.remaining_qty > 0 &&
        !isExpired(b.expiry_date),
    )
    .reduce((s, b) => s + b.remaining_qty, 0);
  const insufficient = qtyNeeded > 0 && qtyNeeded > totalAvailable;
  if (batches.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            FIFO Batch Queue
          </span>
          <span className="text-[10px] text-slate-400">
            — oldest pulled first
          </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">
          {totalAvailable} {unit} total available
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {batches
          .filter((b) => b.remaining_qty > 0)
          .sort(
            (a, b) =>
              new Date(a.received_date).getTime() -
              new Date(b.received_date).getTime(),
          )
          .map((batch, idx) => {
            const previewRow = preview.find(
              (p) => p.batch.batch_id === batch.batch_id,
            );
            const expiring = isExpiringSoon(batch.expiry_date),
              expired = isExpired(batch.expiry_date),
              isFirst = idx === 0;
            return (
              <div
                key={batch.batch_id}
                className={`px-3.5 py-3 flex items-center gap-3 transition-colors ${previewRow ? "bg-indigo-50/60" : "bg-white"} ${expired ? "opacity-50" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${isFirst ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Batch #{batch.batch_id}
                    </span>
                    {isFirst && (
                      <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                        NEXT
                      </span>
                    )}
                    {expiring && !expired && (
                      <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                        EXPIRING
                      </span>
                    )}
                    {expired && (
                      <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                        EXPIRED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                    <span>
                      Received {formatReceivedDate(batch.received_date)}
                    </span>
                    {batch.expiry_date && (
                      <span
                        className={
                          expiring && !expired
                            ? "text-orange-500 font-medium"
                            : expired
                              ? "text-red-500 font-medium"
                              : ""
                        }
                      >
                        Exp. {formatExpiryDate(batch.expiry_date)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-700">
                    {batch.remaining_qty}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {unit}
                    </span>
                  </p>
                  {previewRow && (
                    <p className="text-xs font-semibold text-indigo-600 mt-0.5">
                      −{previewRow.take} {unit} will be pulled
                    </p>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      {insufficient && (
        <div className="px-3.5 py-2.5 bg-red-50 border-t border-red-100">
          <p className="text-xs font-semibold text-red-600">
            ⚠ Insufficient stock — need {qtyNeeded} {unit} but only{" "}
            {totalAvailable} {unit} available
          </p>
        </div>
      )}
      {preview.length > 0 && !insufficient && (
        <div className="px-3.5 py-2.5 bg-indigo-50 border-t border-indigo-100 flex justify-between items-center">
          <span className="text-[11px] text-indigo-600 font-medium">
            Pulling from {preview.length} batch{preview.length > 1 ? "es" : ""}
          </span>
          <span className="text-xs font-bold text-indigo-700">
            {qtyNeeded} {unit} total
          </span>
        </div>
      )}
    </div>
  );
}

export default function StockManager() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [withdrawals, setWithdrawals] = useState<StockStatusRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  const [yesterdayReturns, setYesterdayReturns] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [wdProductId, setWdProductId] = useState<number | null>(null);
  const [wdQty, setWdQty] = useState("");
  const [wdType, setWdType] = useState<WithdrawalType>("initial");
  const [adjProductId, setAdjProductId] = useState<number | null>(null);
  const [adjQty, setAdjQty] = useState("");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] =
    useState<Omit<Supplier, "supplier_id">>(BLANK_SUPPLIER);
  const [showRawMaterialForm, setShowRawMaterialForm] = useState(false);
  const [rawMaterialForm, setRawMaterialForm] =
    useState<RawMaterialForm>(BLANK_RAW_MATERIAL);
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileItems, setReconcileItems] = useState<ReconcileRow[]>([]);
  const [poOrders, setPoOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [poFilterStatus, setPoFilterStatus] = useState<POStatus | "All">("All");
  const [poLoading, setPoLoading] = useState(false);
  const [prefillPOProduct, setPrefillPOProduct] = useState<
    | { name: string; category: string; unit: string; supplier: string }
    | null
    | undefined
  >(undefined);

  const showToast = (message: string, type: "success" | "error") =>
    setToast({ message, type });

  const handleOrderNow = useCallback((product: Product) => {
    setPrefillPOProduct({
      name: product.product_name,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier_name ?? "",
    });
  }, []);

  const handleClosePOModal = useCallback(() => {
    setPrefillPOProduct(undefined);
  }, []);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inv, wd, sup] = await Promise.all([
        api.getInventory(),
        api.getWithdrawals(),
        api.getSuppliers(),
      ]);
      const [activeBatchesResult, yesterdayReturnsResult, poOrdersResult] =
        await Promise.allSettled([
          api.getActiveBatches(),
          api.getYesterdayReturns(),
          api.po.getAll(),
        ]);

      const candidateProducts: Product[] = inv
        .map((p) => {
          const rawMaterialFlag =
            Number((p as { isRawMaterial?: unknown }).isRawMaterial) === 1;
          return {
            ...p,
            inventory_id: toNumber(p.inventory_id),
            product_id: toNumber(p.product_id),
            mainStock: toNumber(p.mainStock),
            quantity: toNumber(p.quantity),
            item_purchased: toNumber(p.item_purchased),
            reorderPoint: toNumber(p.reorderPoint),
            criticalPoint: toNumber(p.criticalPoint),
            dailyWithdrawn: toNumber(p.dailyWithdrawn),
            returned: toNumber(p.returned),
            wasted: toNumber(p.wasted),
            expiryDate: p.expiryDate ? String(p.expiryDate) : null,
            promo: typeof p.promo === "string" ? p.promo : "",
            isRawMaterial: rawMaterialFlag || p.promo === "RAW_MATERIAL",
          };
        })
        .filter((p) => {
          const promo = String(p.promo ?? "")
              .toUpperCase()
              .trim(),
            category = String(p.category ?? "")
              .toLowerCase()
              .trim();
          return (
            promo === "SUPPLIES" ||
            promo === "MENU FOOD" ||
            category.includes("suppl") ||
            category === "ingredients" ||
            category.includes("sauce") ||
            category.includes("menu food") ||
            category.includes("beverage") ||
            category.includes("drink") ||
            p.isRawMaterial
          );
        });

      const groupedByName = new Map<string, Product[]>();
      for (const item of candidateProducts) {
        const key = String(item.product_name ?? "")
          .trim()
          .toLowerCase();
        groupedByName.set(key, [...(groupedByName.get(key) ?? []), item]);
      }
      const normalizedProducts: Product[] = Array.from(
        groupedByName.values(),
      ).map((group) => {
        const pool = group.filter((i) => !i.isRawMaterial);
        return (pool.length > 0 ? pool : group).reduce((latest, current) =>
          toNumber(current.product_id) > toNumber(latest.product_id)
            ? current
            : latest,
        );
      });

      setProducts(normalizedProducts);
      setWithdrawals(
        wd.map((r) => ({
          ...r,
          status_id: toNumber(r.status_id),
          product_id: toNumber(r.product_id),
          quantity: toNumber(r.quantity),
        })),
      );
      setSuppliers(sup);
      setActiveBatches(
        activeBatchesResult.status === "fulfilled"
          ? activeBatchesResult.value
          : [],
      );
      setYesterdayReturns(
        yesterdayReturnsResult.status === "fulfilled"
          ? yesterdayReturnsResult.value
          : [],
      );
      setPoOrders(
        poOrdersResult.status === "fulfilled" ? poOrdersResult.value : [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    if (products.length > 0) {
      if (wdProductId === null) setWdProductId(products[0].product_id);
      if (adjProductId === null) setAdjProductId(products[0].product_id);
    }
  }, [products, wdProductId, adjProductId]);

  const lowStock = products.filter(
    (p) => !isMenuFoodProduct(p) && getStockStatus(p) === "low",
  );
  const criticalStock = products.filter(
    (p) => !isMenuFoodProduct(p) && getStockStatus(p) === "critical",
  );
  const attentionItems = useMemo(
    () =>
      products.filter(
        (p) => !isMenuFoodProduct(p) && getStockStatus(p) !== "normal",
      ),
    [products],
  );
  const poQuickOrderProducts = useMemo(() => {
    const m = new Map<number, Product>();
    [...criticalStock, ...lowStock].forEach((p) => {
      if (!m.has(p.product_id)) m.set(p.product_id, p);
    });
    return Array.from(m.values());
  }, [criticalStock, lowStock]);
  const selectedProductBatches = useMemo(
    () =>
      !wdProductId
        ? []
        : activeBatches
            .filter((b) => b.product_id === wdProductId)
            .sort(
              (a, b) =>
                new Date(a.received_date).getTime() -
                new Date(b.received_date).getTime(),
            ),
    [activeBatches, wdProductId],
  );
  const dashboardFilteredProducts = useMemo(() => {
    const q = dashboardSearch.trim().toLowerCase();
    const base = products.filter((p) => !isMenuFoodProduct(p));
    const filtered = !q
      ? base
      : base.filter(
          (p) =>
            p.product_name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q),
        );
    return [...filtered].sort((a, b) => {
      const diff = toNumber(b.dailyWithdrawn) - toNumber(a.dailyWithdrawn);
      return diff !== 0
        ? diff
        : a.mainStock / Math.max(1, a.reorderPoint * 2) -
            b.mainStock / Math.max(1, b.reorderPoint * 2);
    });
  }, [products, dashboardSearch]);
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return !q
      ? suppliers
      : suppliers.filter(
          (s) =>
            s.supplier_name.toLowerCase().includes(q) ||
            (s.products_supplied ?? "").toLowerCase().includes(q),
        );
  }, [suppliers, supplierSearch]);
  const selectedWithdrawalProduct = useMemo(
    () => products.find((p) => p.product_id === wdProductId) ?? null,
    [products, wdProductId],
  );
  const selectedWithdrawalStatus = selectedWithdrawalProduct
    ? getStockStatus(selectedWithdrawalProduct)
    : "normal";
  const selectedWithdrawalPct = selectedWithdrawalProduct
    ? Math.min(
        100,
        Math.round(
          (selectedWithdrawalProduct.mainStock /
            Math.max(1, selectedWithdrawalProduct.reorderPoint)) *
            100,
        ),
      )
    : 0;
  const totalWithdrawn = products.reduce(
    (s, p) => s + toNumber(p.dailyWithdrawn),
    0,
  );
  const totalWasted = products.reduce((s, p) => s + toNumber(p.wasted), 0);
  const totalReturned = products.reduce((s, p) => s + toNumber(p.returned), 0);
  const wholeChickenProducts = products.filter(isWholeChicken);
  const choppedChickenProducts = products.filter(isChoppedChicken);

  const filteredPOs = useMemo(
    () =>
      poFilterStatus === "All"
        ? poOrders
        : poOrders.filter((o) => o.status === poFilterStatus),
    [poOrders, poFilterStatus],
  );
  // ── PO actions ────────────────────────────────────────────────────────────
  const handlePOStatusChange = useCallback(
    async (id: string, status: POStatus) => {
      if (status === "Received") {
        const orderToReceive = poOrders.find((order) => order.id === id);
        if (!orderToReceive) {
          showToast("Purchase order not found.", "error");
          return;
        }
        setReceivingOrder(orderToReceive);
        setSelectedOrder(null);
        return;
      }

      setPoLoading(true);
      try {
        const updated = await api.po.updateStatus(id, status);

        setPoOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
        setSelectedOrder((prev) => (prev?.id === id ? updated : prev));
        showToast(`Purchase order moved to ${status}.`, "success");
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Failed to update purchase order status.",
          "error",
        );
      } finally {
        setPoLoading(false);
      }
    },
    [poOrders],
  );

  const handleCloseReceivePO = useCallback(() => {
    setReceivingOrder(null);
  }, []);

  const handleConfirmReceivePO = useCallback(
    async (expiryDates: Record<number, string>) => {
      if (!receivingOrder) return;

      setPoLoading(true);
      try {
        const updated = await api.po.markReceived(
          receivingOrder.id,
          "Staff on Duty",
          expiryDates,
        );
        setPoOrders((prev) =>
          prev.map((order) =>
            order.id === receivingOrder.id ? updated : order,
          ),
        );
        setSelectedOrder((prev) =>
          prev?.id === receivingOrder.id ? updated : prev,
        );
        setReceivingOrder(null);
        await fetchAll();
        showToast(
          "Purchase order received and stock batches added.",
          "success",
        );
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Failed to receive purchase order.",
          "error",
        );
      } finally {
        setPoLoading(false);
      }
    },
    [fetchAll, receivingOrder],
  );

  const handlePOCreate = useCallback(async (po: Omit<PurchaseOrder, "id">) => {
    setPoLoading(true);
    try {
      const created = await api.po.create(po);
      setPoOrders((prev) => [created, ...prev]);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to create purchase order.",
        "error",
      );
      throw err;
    } finally {
      setPoLoading(false);
    }
  }, []);

  async function doWithdraw(
    product_id: number,
    qty: number,
    type: WithdrawalType,
  ) {
    const product = products.find((p) => p.product_id === product_id);
    if (!product) throw new Error("Product not found");
    try {
      if (type === "return") {
        const batches = await api.getProductBatches(product_id);
        const validBatch = batches
          .filter((b) => ["active", "withdrawn", "returned"].includes(b.status))
          .sort(
            (a, b) =>
              new Date(b.received_date).getTime() -
              new Date(a.received_date).getTime(),
          )[0];
        if (!validBatch) throw new Error("No batch found to return to.");
        await api.returnToBatch({
          batch_id: validBatch.batch_id,
          return_qty: qty,
          recorded_by: null,
        });
      } else {
        await api.withdrawFromBatches({
          product_id,
          qty_needed: qty,
          type,
          recorded_by: null,
        });
      }
    } catch {
      const newRecord = await api.postWithdrawal({
        product_id,
        type,
        quantity: qty,
        recorded_by: null,
      });
      setWithdrawals((prev) => [newRecord, ...prev]);
      const updatedStock =
        type === "return"
          ? +(product.mainStock + qty).toFixed(2)
          : Math.max(0, +(product.mainStock - qty).toFixed(2));
      await api.updateStock(product.inventory_id, {
        stock: updatedStock,
        daily_withdrawn:
          type === "return"
            ? Math.max(0, +(product.dailyWithdrawn - qty).toFixed(2))
            : +(product.dailyWithdrawn + qty).toFixed(2),
        returned:
          type === "return"
            ? +(product.returned + qty).toFixed(2)
            : product.returned,
      });
    }
  }

  async function submitWithdrawal() {
    const qty = parseInt(wdQty);
    if (!qty || qty <= 0 || wdProductId === null) return;
    const product = products.find((p) => p.product_id === wdProductId);
    if (!product) return;
    if (wdType !== "return" && qty > product.mainStock) {
      showToast(
        `Insufficient stock. Available: ${product.mainStock} ${product.unit}`,
        "error",
      );
      return;
    }
    setSubmitting(true);
    try {
      await doWithdraw(wdProductId, qty, wdType);
      setWdQty("");
      showToast(
        wdType === "return" ? "Return recorded!" : "Withdrawal recorded!",
        "success",
      );
      await fetchAll();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to submit.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSpoilage() {
    const qty = parseFloat(adjQty);
    if (!qty || qty <= 0 || adjProductId === null) return;
    const product = products.find((p) => p.product_id === adjProductId);
    if (!product) return;
    setSubmitting(true);
    try {
      await api.postSpoilage({
        product_id: adjProductId,
        quantity: qty,
        recorded_by: null,
      });
      const updatedStock = Math.max(0, +(product.mainStock - qty).toFixed(2));
      await api.updateStock(product.inventory_id, {
        stock: updatedStock,
        wasted: +(product.wasted + qty).toFixed(2),
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.product_id === adjProductId
            ? {
                ...p,
                mainStock: updatedStock,
                wasted: +(p.wasted + qty).toFixed(2),
              }
            : p,
        ),
      );
      setAdjQty("");
      showToast("Spoilage recorded.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to record spoilage.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openReconcile() {
    setReconcileItems(
      products
        .filter((p) => isReconcilable(p) && p.dailyWithdrawn > 0)
        .map((p) => ({
          product_id: p.product_id,
          inventory_id: p.inventory_id,
          product_name: p.product_name,
          category: p.category,
          unit: p.unit,
          withdrawn: p.dailyWithdrawn,
          returnQty: "",
          returnDestination: "chopped" as const,
        })),
    );
    setShowReconcile(true);
  }

  async function submitReconciliation() {
    const validItems = reconcileItems.filter(
      (i) => parseFloat(i.returnQty) > 0,
    );
    if (validItems.length === 0) return;
    setSubmitting(true);
    try {
      for (const item of validItems) {
        const qty = parseFloat(item.returnQty);
        const sourceProduct = products.find(
          (p) => p.product_id === item.product_id,
        );
        if (!sourceProduct) continue;
        const returnAsWhole =
          isChoppedChicken(sourceProduct) && item.returnDestination === "whole";
        const targetProductId = returnAsWhole
          ? ((
              products.find(
                (p) =>
                  isWholeChicken(p) &&
                  p.supplier_name === sourceProduct.supplier_name,
              ) ?? products.find((p) => isWholeChicken(p))
            )?.product_id ?? item.product_id)
          : item.product_id;
        const batchList = await api.getProductBatches(targetProductId);
        const targetBatch = batchList
          .filter((b) => ["active", "withdrawn", "returned"].includes(b.status))
          .sort(
            (a, b) =>
              new Date(b.received_date).getTime() -
              new Date(a.received_date).getTime(),
          )[0];
        if (!targetBatch) {
          showToast(`No batch found for ${item.product_name}`, "error");
          continue;
        }
        await api.returnToBatch({
          batch_id: targetBatch.batch_id,
          return_qty: qty,
          recorded_by: null,
        });
      }
      setShowReconcile(false);
      showToast(`${validItems.length} item(s) reconciled.`, "success");
      await fetchAll();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Reconciliation failed.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function addSupplier() {
    if (!supplierForm.supplier_name.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.postSupplier(supplierForm);
      setSuppliers((prev) => [...prev, created]);
      setSupplierForm(BLANK_SUPPLIER);
      setShowSupplierForm(false);
      showToast("Supplier added successfully!", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to add supplier.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSupplier(id: number) {
    try {
      await api.deleteSupplier(id);
      setSuppliers((prev) => prev.filter((s) => s.supplier_id !== id));
      showToast("Supplier removed.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to remove supplier.",
        "error",
      );
    }
  }

  async function addRawMaterial() {
    const name = rawMaterialForm.name.trim();
    const qty = Number(rawMaterialForm.initialStock);
    const price = Number(rawMaterialForm.price || 0);
    if (!name) {
      showToast("Please enter a raw material name.", "error");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast("Initial stock must be greater than 0.", "error");
      return;
    }
    if (!rawMaterialForm.expiryDate) {
      showToast("Please select an expiry date.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const normalizedName = name.toLowerCase();
      const existing = products.find(
        (p) => p.product_name.trim().toLowerCase() === normalizedName,
      );
      if (existing) {
        await api.postBatch({
          productId: existing.product_id,
          productName: existing.product_name,
          quantity: qty,
          unit: rawMaterialForm.unit,
          expiresAt: rawMaterialForm.expiryDate,
        });
      } else {
        const created = await api.createProduct({
          name,
          price: Number.isFinite(price) ? price : 0,
          quantity: 0,
          category: rawMaterialForm.category.trim(),
          description: rawMaterialForm.description.trim() || undefined,
          raw_material: true,
        });
        await api.postBatch({
          productId: created.id,
          productName: name,
          quantity: qty,
          unit: rawMaterialForm.unit,
          expiresAt: rawMaterialForm.expiryDate,
        });
      }
      await fetchAll();
      setRawMaterialForm(BLANK_RAW_MATERIAL);
      setShowRawMaterialForm(false);
      showToast(
        existing ? "Stock added to existing item." : "Raw material added.",
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to add raw material.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const cartIcon = (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'); @keyframes fadeInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div
        style={{ fontFamily: "'Poppins', sans-serif" }}
        className="min-h-screen bg-[#f5f6fa]"
      >
        <Sidebar />

        <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
          <div className="pl-25 pr-8 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                Stock Manager
              </h2>
              <p className="text-xs text-slate-400 font-light mt-0.5">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {yesterdayReturns.length > 0 && (
                <button
                  onClick={() => setTab("withdrawal")}
                  className="px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold border border-amber-200 flex items-center gap-1.5"
                >
                  ↩ {yesterdayReturns.length} return
                  {yesterdayReturns.length > 1 ? "s" : ""} from yesterday
                </button>
              )}
              <button
                onClick={openReconcile}
                className="px-4 py-2 text-xs font-semibold bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors"
              >
                End-of-Day Reconciliation
              </button>
              {attentionItems.length > 0 && (
                <button
                  onClick={() => setTab("alerts")}
                  className="px-3.5 py-1.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold border border-red-200 animate-pulse"
                >
                  {attentionItems.length} item
                  {attentionItems.length > 1 ? "s" : ""} need attention
                </button>
              )}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <span
                  className={`w-2 h-2 rounded-full ${isLoading ? "bg-amber-400" : "bg-emerald-400"}`}
                />
                <span className="text-xs font-medium text-slate-600">
                  {isLoading ? "Syncing" : "Up to date"}
                </span>
              </div>
            </div>
          </div>
          <div className="pb-3 flex items-center justify-center gap-2">
            {TABS.map((t) => {
              const badge =
                t.id === "alerts"
                  ? attentionItems.length
                  : t.id === "withdrawal"
                    ? yesterdayReturns.length
                    : t.id === "purchases"
                      ? poOrders.filter((o) => o.status === "Draft").length
                      : 0;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{ fontFamily: "'Poppins', sans-serif" }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${active ? "bg-slate-900 text-white border-slate-900 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`}
                >
                  {t.label}
                  {badge > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${active ? "bg-white/20 text-white" : t.id === "withdrawal" ? "bg-amber-100 text-amber-700" : t.id === "purchases" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"}`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        <main className="px-8 py-8">
          {error && (
            <div className="mb-6">
              <ErrorBanner message={error} onRetry={fetchAll} />
            </div>
          )}
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <AnimatePresence mode="wait">
              {tab === "dashboard" && (
                <motion.div
                  key="dashboard"
                  variants={pageVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <motion.div
                    variants={staggerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-6"
                  >
                    <motion.div
                      variants={staggerVariants}
                      className="grid grid-cols-4 gap-4"
                    >
                      {(
                        [
                          {
                            label: "Total Products",
                            value: products.length.toString(),
                            sub: "in inventory",
                            accent: "slate",
                          },
                          {
                            label: "Withdrawn Today",
                            value: totalWithdrawn.toFixed(1),
                            sub: "units pulled",
                            accent: "indigo",
                          },
                          {
                            label: "Wasted Today",
                            value: totalWasted.toFixed(2),
                            sub: "units spoiled",
                            accent: "rose",
                          },
                          {
                            label: "Returned Today",
                            value: totalReturned.toFixed(2),
                            sub: "units returned",
                            accent: "emerald",
                          },
                        ] as {
                          label: string;
                          value: string;
                          sub: string;
                          accent: string;
                        }[]
                      ).map((k) => (
                        <motion.div
                          key={k.label}
                          variants={itemVariants}
                          className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${KPI_ACCENT[k.accent].border}`}
                        >
                          <p className="text-xs text-slate-400 font-medium">
                            {k.label}
                          </p>
                          <p
                            className={`text-3xl font-bold mt-1 leading-none ${KPI_ACCENT[k.accent].value}`}
                          >
                            {k.value}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
                        </motion.div>
                      ))}
                    </motion.div>

                    {(wholeChickenProducts.length > 0 ||
                      choppedChickenProducts.length > 0) && (
                      <motion.div
                        variants={itemVariants}
                        className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4 flex items-center gap-6"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🐔</span>
                          <span className="text-xs font-bold text-orange-700 uppercase tracking-wider">
                            Chicken Inventory
                          </span>
                        </div>
                        <div className="flex gap-6 flex-1">
                          {wholeChickenProducts.map((p) => (
                            <div
                              key={p.product_id}
                              className="flex items-center gap-3"
                            >
                              <div className="w-2 h-2 rounded-full bg-orange-400" />
                              <div>
                                <p className="text-xs text-orange-600 font-medium">
                                  Whole Chicken
                                </p>
                                <p className="text-sm font-bold text-orange-800">
                                  {p.mainStock}{" "}
                                  <span className="text-xs font-normal text-orange-500">
                                    {p.unit}
                                  </span>
                                </p>
                              </div>
                            </div>
                          ))}
                          {wholeChickenProducts.length > 0 &&
                            choppedChickenProducts.length > 0 && (
                              <div className="flex items-center text-orange-200 text-lg font-light">
                                →
                              </div>
                            )}
                          {choppedChickenProducts.map((p) => (
                            <div
                              key={p.product_id}
                              className="flex items-center gap-3"
                            >
                              <div className="w-2 h-2 rounded-full bg-amber-500" />
                              <div>
                                <p className="text-xs text-amber-600 font-medium">
                                  Chopped Chicken
                                </p>
                                <p className="text-sm font-bold text-amber-800">
                                  {p.mainStock}{" "}
                                  <span className="text-xs font-normal text-amber-500">
                                    {p.unit}
                                  </span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-orange-400 italic">
                          Delivered whole → chopped separately in inventory
                        </p>
                      </motion.div>
                    )}

                    <motion.div variants={itemVariants}>
                      <SectionCard
                        title="Main Stock Levels"
                        subtitle="Raw materials added from Stock Manager"
                      >
                        <div className="px-4 pt-4 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                          <input
                            type="text"
                            value={dashboardSearch}
                            onChange={(e) => setDashboardSearch(e.target.value)}
                            placeholder="Search by item name or category..."
                            className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                          <button
                            onClick={() => setShowRawMaterialForm(true)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            Add Raw Material
                          </button>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              {[
                                "Item",
                                "Category",
                                "Main Stock",
                                "Qty Purchased",
                                "Withdrawn",
                                "Expiry Date",
                                "Returned",
                                "Level",
                                "Status",
                              ].map((h) => (
                                <th
                                  key={h}
                                  className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${["Item", "Category"].includes(h) ? "text-left" : h === "Status" ? "text-center" : "text-right"}`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardFilteredProducts.map((p, i) => {
                              const status = getStockStatus(p),
                                pct = Math.min(
                                  100,
                                  (p.mainStock /
                                    Math.max(1, p.reorderPoint * 2)) *
                                    100,
                                );
                              return (
                                <tr
                                  key={p.inventory_id}
                                  style={{
                                    opacity: 0,
                                    animation: `fadeInRow 0.28s ease forwards`,
                                    animationDelay: `${i * 0.04}s`,
                                  }}
                                  className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                                >
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`}
                                      />
                                      <span className="font-medium text-slate-800">
                                        {p.product_name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <span
                                      className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${getCategoryStyle(p.category)}`}
                                    >
                                      {p.category}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                                    {p.mainStock}{" "}
                                    <span className="text-slate-400 font-normal text-xs">
                                      {p.unit}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-slate-500">
                                    {p.item_purchased}
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-indigo-500 font-medium">
                                    {p.dailyWithdrawn}
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-slate-600 font-medium">
                                    {formatExpiryDate(p.expiryDate)}
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-emerald-500 font-medium">
                                    {p.returned}
                                  </td>
                                  <td className="py-3.5 px-4 w-32">
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                      <motion.div
                                        className={`h-full rounded-full ${STATUS_BAR[status]}`}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pct}%` }}
                                        transition={{
                                          duration: 0.7,
                                          delay: i * 0.05,
                                          ease: "easeOut",
                                        }}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize ${STATUS_BADGE[status]}`}
                                    >
                                      {status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                            {dashboardFilteredProducts.length === 0 && (
                              <tr>
                                <td
                                  colSpan={9}
                                  className="py-8 text-center text-slate-400 text-sm"
                                >
                                  No items match your search.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </SectionCard>
                    </motion.div>

                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-4"
                    >
                      <SectionCard
                        title="Last Inventory Updates"
                        subtitle="Most recently updated items"
                      >
                        <div className="divide-y divide-slate-50">
                          {[...products]
                            .sort(
                              (a, b) =>
                                new Date(b.last_update).getTime() -
                                new Date(a.last_update).getTime(),
                            )
                            .slice(0, 6)
                            .map((p, i) => (
                              <motion.div
                                key={p.inventory_id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.07 }}
                                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors"
                              >
                                <div>
                                  <p className="text-sm font-medium text-slate-700">
                                    {p.product_name}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {p.supplier_name}
                                  </p>
                                </div>
                                <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                  {new Date(p.last_update).toLocaleDateString(
                                    undefined,
                                    { month: "short", day: "numeric" },
                                  )}
                                </span>
                              </motion.div>
                            ))}
                        </div>
                      </SectionCard>
                      <SectionCard
                        title="Record Spoilage"
                        subtitle="Log wasted items — updates Inventory.Stock"
                      >
                        <div className="p-5 space-y-4">
                          <FormField label="Select Item">
                            <StyledSelect
                              value={adjProductId ?? ""}
                              onChange={(v) => setAdjProductId(Number(v))}
                            >
                              {products.map((p) => (
                                <option key={p.product_id} value={p.product_id}>
                                  {p.product_name}
                                </option>
                              ))}
                            </StyledSelect>
                          </FormField>
                          <FormField label="Quantity Wasted">
                            <StyledInput
                              type="number"
                              value={adjQty}
                              onChange={setAdjQty}
                              placeholder="Enter amount"
                            />
                          </FormField>
                          <Btn
                            onClick={submitSpoilage}
                            variant="danger"
                            loading={submitting}
                          >
                            {submitting ? "Saving..." : "Record Spoilage"}
                          </Btn>
                        </div>
                      </SectionCard>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {tab === "withdrawal" && (
                <motion.div
                  key="withdrawal"
                  variants={pageVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <motion.div
                    variants={staggerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-6"
                  >
                    {yesterdayReturns.length > 0 && (
                      <motion.div variants={itemVariants}>
                        <YesterdayReturnsBanner batches={yesterdayReturns} />
                      </motion.div>
                    )}
                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-6"
                    >
                      <SectionCard
                        title="New Withdrawal Record"
                        subtitle={
                          wdType === "initial"
                            ? "Opening withdrawal — sets the day's reference"
                            : "FIFO — oldest batch pulled first"
                        }
                      >
                        <div className="p-5 space-y-4">
                          <FormField label="Record Type">
                            <div className="grid grid-cols-3 gap-2">
                              {WITHDRAWAL_TYPES.map((t) => (
                                <button
                                  key={t}
                                  onClick={() => setWdType(t)}
                                  className={`py-2.5 text-xs font-semibold rounded-xl border capitalize transition-all duration-200 ${wdType === t ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"}`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </FormField>
                          <div
                            className={`text-xs px-3 py-2 rounded-xl border ${wdType === "initial" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : wdType === "supplementary" ? "bg-sky-50 text-sky-600 border-sky-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}
                          >
                            {wdType === "initial" &&
                              "Opening withdrawal for today — recorded as the initial pull."}
                            {wdType === "supplementary" &&
                              "Additional pull on top of the opening withdrawal."}
                            {wdType === "return" &&
                              "Returning unused/leftover stock back to main storage."}
                          </div>
                          <FormField label="Select Item">
                            <StyledSelect
                              value={wdProductId ?? ""}
                              onChange={(v) => setWdProductId(Number(v))}
                            >
                              {wholeChickenProducts.length > 0 && (
                                <optgroup label="── Whole Chicken ──">
                                  {wholeChickenProducts.map((p) => (
                                    <option
                                      key={p.product_id}
                                      value={p.product_id}
                                    >
                                      {p.product_name} ({p.mainStock} {p.unit})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {choppedChickenProducts.length > 0 && (
                                <optgroup label="── Chopped Chicken ──">
                                  {choppedChickenProducts.map((p) => (
                                    <option
                                      key={p.product_id}
                                      value={p.product_id}
                                    >
                                      {p.product_name} ({p.mainStock} {p.unit})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {products.filter((p) => !isChicken(p)).length >
                                0 && (
                                <optgroup label="── Other Items ──">
                                  {products
                                    .filter((p) => !isChicken(p))
                                    .map((p) => (
                                      <option
                                        key={p.product_id}
                                        value={p.product_id}
                                      >
                                        {p.product_name} ({p.mainStock} {p.unit}
                                        )
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                            </StyledSelect>
                          </FormField>
                          {selectedWithdrawalProduct &&
                            selectedWithdrawalStatus !== "normal" && (
                              <div
                                className={`text-xs px-3 py-2 rounded-xl border ${selectedWithdrawalStatus === "critical" ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}
                              >
                                {selectedWithdrawalStatus === "critical"
                                  ? "Critical stock warning"
                                  : "Low stock warning"}
                                : {selectedWithdrawalProduct.product_name} is at{" "}
                                {selectedWithdrawalPct}% of reorder level (
                                {selectedWithdrawalProduct.mainStock}{" "}
                                {selectedWithdrawalProduct.unit} left).
                              </div>
                            )}
                          {selectedWithdrawalProduct?.category
                            .toLowerCase()
                            .includes("sauce") && (
                            <div className="text-xs px-3 py-2 rounded-xl border bg-rose-50 text-rose-500 border-rose-100">
                              ⚠️ Sauce items are not reconciled at end-of-day.
                              Once withdrawn, they are considered consumed.
                            </div>
                          )}
                          <FormField label="Quantity">
                            <StyledInput
                              type="number"
                              value={wdQty}
                              onChange={setWdQty}
                              placeholder="Enter amount"
                            />
                          </FormField>
                          <Btn
                            onClick={submitWithdrawal}
                            variant="primary"
                            loading={submitting}
                          >
                            {submitting
                              ? "Saving..."
                              : wdType === "return"
                                ? "Record Return"
                                : wdType === "initial"
                                  ? "Submit Opening Withdrawal"
                                  : "Submit Withdrawal"}
                          </Btn>
                        </div>
                      </SectionCard>
                      <SectionCard
                        title="Today's Withdrawal Log"
                        subtitle={`${withdrawals.length} entries`}
                      >
                        {withdrawals.length === 0 ? (
                          <EmptyState message="No withdrawals recorded today." />
                        ) : (
                          <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                            <AnimatePresence>
                              {withdrawals.map((w) => (
                                <motion.div
                                  key={w.status_id}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  transition={{ duration: 0.28 }}
                                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-slate-700">
                                      {w.product_name}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      {new Date(
                                        w.status_date,
                                      ).toLocaleTimeString(undefined, {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                      {w.recorded_by && (
                                        <>
                                          {" "}
                                          ·{" "}
                                          <span className="text-slate-500">
                                            {w.recorded_by}
                                          </span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    <span
                                      className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_BADGE[w.type]}`}
                                    >
                                      {w.type}
                                    </span>
                                    <span
                                      className={`text-sm font-semibold ${w.type === "return" ? "text-amber-600" : "text-slate-700"}`}
                                    >
                                      −{w.quantity}
                                    </span>
                                  </div>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        )}
                      </SectionCard>
                    </motion.div>
                    {wdType !== "return" &&
                      selectedProductBatches.length > 0 && (
                        <motion.div variants={itemVariants}>
                          <SectionCard
                            title={`Batch Queue — ${selectedWithdrawalProduct?.product_name ?? ""}`}
                            subtitle="FIFO order: batch with the oldest received date is pulled first"
                          >
                            <div className="p-4">
                              <FIFOBatchPreview
                                batches={selectedProductBatches}
                                qtyNeeded={parseFloat(wdQty) || 0}
                                unit={selectedWithdrawalProduct?.unit ?? ""}
                              />
                            </div>
                          </SectionCard>
                        </motion.div>
                      )}
                    <motion.div variants={itemVariants}>
                      <SectionCard
                        title="Currently Withdrawn"
                        subtitle="Stock pulled for today's preparation — net of returns"
                      >
                        {products.filter((p) => p.dailyWithdrawn > 0).length ===
                        0 ? (
                          <EmptyState message="No stock withdrawn today." />
                        ) : (
                          <div className="grid grid-cols-4 divide-x divide-slate-100">
                            {products
                              .filter((p) => p.dailyWithdrawn > 0)
                              .map((p, i) => (
                                <motion.div
                                  key={p.inventory_id}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.07 }}
                                  className="p-5 hover:bg-slate-50/50 transition-colors"
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <p className="text-xs text-slate-400 truncate font-medium">
                                      {p.product_name}
                                    </p>
                                    {isReconcilable(p) ? (
                                      <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100 whitespace-nowrap">
                                        reconcilable
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold text-rose-400 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-100 whitespace-nowrap">
                                        no return
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-2xl font-bold text-slate-800 mt-1.5 leading-none">
                                    {p.dailyWithdrawn}
                                    <span className="text-sm text-slate-400 font-normal ml-1">
                                      {p.unit}
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-400 mt-1.5">
                                    Returned:{" "}
                                    <span className="text-emerald-500 font-medium">
                                      {p.returned} {p.unit}
                                    </span>
                                  </p>
                                </motion.div>
                              ))}
                          </div>
                        )}
                      </SectionCard>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {tab === "alerts" && (
                <motion.div
                  key="alerts"
                  variants={pageVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <motion.div
                    variants={staggerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-4"
                  >
                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div className="bg-white rounded-2xl p-5 border border-t-4 border-red-300 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">
                          Critical Items
                        </p>
                        <p className="text-3xl font-bold text-red-500 mt-1">
                          {criticalStock.length}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl p-5 border border-t-4 border-amber-300 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">
                          Warning Items
                        </p>
                        <p className="text-3xl font-bold text-amber-500 mt-1">
                          {lowStock.length}
                        </p>
                      </div>
                    </motion.div>
                    {lowStock.length === 0 && criticalStock.length === 0 ? (
                      <motion.div variants={itemVariants}>
                        <EmptyState message="All stock levels are within safe range." />
                      </motion.div>
                    ) : (
                      <>
                        {(
                          [
                            {
                              items: criticalStock,
                              label: "Critical",
                              color: "red",
                            },
                            {
                              items: lowStock,
                              label: "Warning",
                              color: "amber",
                            },
                          ] as {
                            items: Product[];
                            label: string;
                            color: string;
                          }[]
                        ).map(({ items, label, color }) =>
                          items.length > 0 ? (
                            <div key={label}>
                              <motion.div
                                variants={itemVariants}
                                className="pt-1"
                              >
                                <p
                                  className={`text-xs font-semibold text-${color}-500 uppercase tracking-wider mb-2`}
                                >
                                  {label}
                                </p>
                              </motion.div>
                              {items.map((p, i) => {
                                const status = getStockStatus(p),
                                  deficit = +(
                                    p.reorderPoint - p.mainStock
                                  ).toFixed(2);
                                return (
                                  <motion.div
                                    key={p.inventory_id}
                                    variants={itemVariants}
                                    transition={{ delay: i * 0.06 }}
                                    className={`bg-white rounded-2xl border border-t-4 p-5 flex items-center justify-between shadow-sm mb-3 ${status === "critical" ? "border-red-200 border-t-red-400" : "border-amber-200 border-t-amber-400"}`}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${status === "critical" ? "bg-red-50" : "bg-amber-50"}`}
                                      >
                                        <span
                                          className={`text-sm font-bold ${status === "critical" ? "text-red-500" : "text-amber-500"}`}
                                        >
                                          !
                                        </span>
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="font-semibold text-slate-800">
                                            {p.product_name}
                                          </p>
                                          <span
                                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${getCategoryStyle(p.category)}`}
                                          >
                                            {p.category}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                          {p.supplier_name}
                                        </p>
                                        <p
                                          className={`text-xs font-medium mt-1 ${status === "critical" ? "text-red-500" : "text-amber-500"}`}
                                        >
                                          {deficit > 0
                                            ? `Need ${deficit} ${p.unit} to reach reorder point`
                                            : "Below critical threshold"}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="text-right">
                                        <p
                                          className={`text-2xl font-bold ${status === "critical" ? "text-red-500" : "text-amber-500"}`}
                                        >
                                          {p.mainStock}{" "}
                                          <span className="text-sm font-normal text-slate-400">
                                            {p.unit}
                                          </span>
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                          Reorder at {p.reorderPoint} · Critical
                                          at {p.criticalPoint}
                                        </p>
                                        <span
                                          className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${STATUS_BADGE[status]}`}
                                        >
                                          {status === "critical"
                                            ? "Restock Now"
                                            : "Reorder Soon"}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setTab("purchases");
                                          handleOrderNow(p);
                                        }}
                                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-sm ${status === "critical" ? "bg-red-500 hover:bg-red-600 shadow-red-500/25" : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25"}`}
                                      >
                                        {cartIcon}Order Now
                                      </button>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          ) : null,
                        )}
                      </>
                    )}
                  </motion.div>
                </motion.div>
              )}

              {tab === "suppliers" && (
                <motion.div
                  key="suppliers"
                  variants={pageVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <motion.div
                    variants={staggerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <motion.div
                      variants={itemVariants}
                      className="flex justify-end"
                    >
                      <button
                        onClick={() => setShowSupplierForm((f) => !f)}
                        className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-all duration-200 shadow-md shadow-slate-900/20"
                      >
                        {showSupplierForm ? "Cancel" : "Add Supplier"}
                      </button>
                    </motion.div>
                    <AnimatePresence>
                      {showSupplierForm && (
                        <motion.div
                          key="sup-form"
                          initial={{ opacity: 0, y: -10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.98 }}
                          transition={{ duration: 0.22 }}
                        >
                          <SectionCard
                            title="New Supplier"
                            subtitle="Posts to Suppliers table"
                          >
                            <div className="p-5 grid grid-cols-3 gap-4">
                              {SUPPLIER_FIELDS.map(
                                ({ key, label, placeholder }) => (
                                  <FormField key={key} label={label}>
                                    <StyledInput
                                      type="text"
                                      value={
                                        (supplierForm[key] as string) ?? ""
                                      }
                                      onChange={(v) =>
                                        setSupplierForm((p) => ({
                                          ...p,
                                          [key]: v,
                                        }))
                                      }
                                      placeholder={placeholder}
                                    />
                                  </FormField>
                                ),
                              )}
                              <div className="col-span-3 pt-1">
                                <Btn
                                  onClick={addSupplier}
                                  variant="primary"
                                  loading={submitting}
                                >
                                  {submitting ? "Saving..." : "Save Supplier"}
                                </Btn>
                              </div>
                            </div>
                          </SectionCard>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <motion.div variants={itemVariants}>
                      <SectionCard
                        title="Supplier Directory"
                        subtitle={`${filteredSuppliers.length} supplier${filteredSuppliers.length === 1 ? "" : "s"} shown`}
                      >
                        <div className="px-4 pt-4">
                          <input
                            type="text"
                            value={supplierSearch}
                            onChange={(e) => setSupplierSearch(e.target.value)}
                            placeholder="Search by company or supplied products..."
                            className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              {[
                                "Supplier ID",
                                "Company",
                                "Contact Number",
                                "Products Supplied",
                                "Delivery Schedule",
                                "",
                              ].map((h) => (
                                <th
                                  key={h}
                                  className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSuppliers.map((s, i) => (
                              <tr
                                key={s.supplier_id}
                                style={{
                                  opacity: 0,
                                  animation: `fadeInRow 0.28s ease forwards`,
                                  animationDelay: `${i * 0.04}s`,
                                }}
                                className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                              >
                                <td className="py-3.5 px-4 text-xs text-slate-400 font-mono">
                                  #{s.supplier_id}
                                </td>
                                <td className="py-3.5 px-4">
                                  <p className="font-semibold text-slate-800">
                                    {s.supplier_name}
                                  </p>
                                  {s.email && (
                                    <p className="text-xs text-slate-400">
                                      {s.email}
                                    </p>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-slate-600 text-xs">
                                  {s.contact_number}
                                </td>
                                <td className="py-3.5 px-4 text-slate-600 text-xs">
                                  {s.products_supplied ?? "—"}
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                                    {s.delivery_schedule}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() =>
                                      removeSupplier(s.supplier_id)
                                    }
                                    className="text-xs text-slate-300 hover:text-red-400 transition-colors font-medium"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filteredSuppliers.length === 0 && (
                          <EmptyState message="No suppliers found for this search." />
                        )}
                      </SectionCard>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {tab === "purchases" && (
                <motion.div
                  key="purchases"
                  variants={pageVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <motion.div
                    variants={staggerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-5"
                  >
                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-4 gap-4"
                    >
                      {(
                        [
                          {
                            label: "Total Orders",
                            value: poOrders.length,
                            accent: "border-t-slate-800",
                            text: "text-slate-700",
                          },
                          {
                            label: "Draft",
                            value: poOrders.filter((o) => o.status === "Draft")
                              .length,
                            accent: "border-t-yellow-400",
                            text: "text-yellow-600",
                          },
                          {
                            label: "Ordered",
                            value: poOrders.filter(
                              (o) => o.status === "Ordered",
                            ).length,
                            accent: "border-t-blue-400",
                            text: "text-blue-600",
                          },
                          {
                            label: "Received",
                            value: poOrders.filter(
                              (o) => o.status === "Received",
                            ).length,
                            accent: "border-t-emerald-400",
                            text: "text-emerald-600",
                          },
                        ] as {
                          label: string;
                          value: number;
                          accent: string;
                          text: string;
                        }[]
                      ).map((k) => (
                        <div
                          key={k.label}
                          className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${k.accent}`}
                        >
                          <p className="text-xs text-slate-400 font-medium">
                            {k.label}
                          </p>
                          <p
                            className={`text-3xl font-bold mt-1 leading-none ${k.text}`}
                          >
                            {k.value}
                          </p>
                        </div>
                      ))}
                    </motion.div>

                    {(criticalStock.length > 0 || lowStock.length > 0) && (
                      <motion.div variants={itemVariants}>
                        <StockAlertRestockBanner
                          criticalItems={criticalStock}
                          lowItems={lowStock}
                          onOrderNow={handleOrderNow}
                        />
                      </motion.div>
                    )}

                    <motion.div
                      variants={itemVariants}
                      className="flex items-center justify-between"
                    >
                      <div className="flex gap-2 flex-wrap">
                        {(
                          [
                            "All",
                            "Draft",
                            "Ordered",
                            "Received",
                            "Cancelled",
                          ] as (POStatus | "All")[]
                        ).map((s) => (
                          <button
                            key={s}
                            onClick={() => setPoFilterStatus(s)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${poFilterStatus === s ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setPrefillPOProduct(null)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        New PO
                      </button>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">
                              Quick Order — All Products
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Place a PO for any product, regardless of stock
                              level
                            </p>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {products
                            .filter((p) => !isMenuFoodProduct(p))
                            .map((p, i) => {
                              const status = getStockStatus(p),
                                pct = Math.min(
                                  100,
                                  (p.mainStock / Math.max(1, p.reorderPoint)) *
                                    100,
                                );
                              return (
                                <motion.div
                                  key={p.product_id}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: i * 0.03 }}
                                  className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors"
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-800 truncate">
                                        {p.product_name}
                                      </p>
                                      {status !== "normal" && (
                                        <span
                                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status === "critical" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}
                                        >
                                          {status === "critical"
                                            ? "Critical"
                                            : "Low"}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400">
                                      {p.supplier_name}
                                    </p>
                                  </div>
                                  <div className="flex-shrink-0 w-28 text-right">
                                    <p className="text-xs font-semibold text-slate-600 mb-1">
                                      {p.mainStock}
                                      <span className="text-slate-400 font-normal ml-0.5">
                                        {p.unit}
                                      </span>
                                    </p>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${STATUS_BAR[status]}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleOrderNow(p)}
                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all duration-150"
                                  >
                                    {cartIcon}Order
                                  </button>
                                </motion.div>
                              );
                            })}
                          {products.filter((p) => !isMenuFoodProduct(p))
                            .length === 0 && (
                            <EmptyState message="No products found in inventory." />
                          )}
                        </div>
                      </div>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-50">
                          <p className="font-semibold text-slate-800 text-sm">
                            Purchase Orders
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {filteredPOs.length} order
                            {filteredPOs.length !== 1 ? "s" : ""} shown
                          </p>
                        </div>
                        <div className="grid grid-cols-12 px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          <span className="col-span-2">PO No.</span>
                          <span className="col-span-3">Supplier</span>
                          <span className="col-span-2">Order Date</span>
                          <span className="col-span-2">Delivery</span>
                          <span className="col-span-2">Total</span>
                          <span className="col-span-1">Status</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {poLoading ? (
                            <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
                              Loading purchase orders…
                            </div>
                          ) : filteredPOs.length === 0 ? (
                            <EmptyState message="No purchase orders found." />
                          ) : (
                            filteredPOs.map((order, i) => (
                              <motion.button
                                key={order.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => setSelectedOrder(order)}
                                className="grid grid-cols-12 px-5 py-4 w-full text-left hover:bg-slate-50/70 transition-colors items-center"
                              >
                                <span className="col-span-2 text-sm font-semibold text-slate-800">
                                  {order.id}
                                </span>
                                <div className="col-span-3">
                                  <p className="text-sm font-medium text-slate-800">
                                    {order.supplier}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {order.items.length} item
                                    {order.items.length !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <span className="col-span-2 text-sm text-slate-500">
                                  {order.date}
                                </span>
                                <span className="col-span-2 text-sm text-slate-500">
                                  {order.deliveryDate}
                                </span>
                                <span className="col-span-2 text-sm font-semibold text-slate-800">
                                  ₱
                                  {(
                                    calcPOTotal(order.items) * 1.12
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                  })}
                                </span>
                                <span className="col-span-1">
                                  <POBadge status={order.status} />
                                </span>
                              </motion.button>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>

        <AnimatePresence>
          {selectedOrder && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedOrder(null)}
                className="fixed inset-0 bg-black/10 z-40"
              />
              <PODetailDrawer
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onStatusChange={handlePOStatusChange}
              />
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {receivingOrder && (
            <ReceivePOModal
              order={receivingOrder}
              loading={poLoading}
              onClose={handleCloseReceivePO}
              onConfirm={handleConfirmReceivePO}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {prefillPOProduct !== undefined && (
            <CreatePOModal
              onClose={handleClosePOModal}
              onCreate={handlePOCreate}
              quickOrderProducts={poQuickOrderProducts}
              allProducts={products}
              prefillProduct={prefillPOProduct}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showRawMaterialForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden"
              >
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">
                      Add Raw Material
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Add items like chicken, sauces, and other ingredients.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRawMaterialForm(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors text-lg"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <FormField label="Material Name">
                      <StyledInput
                        type="text"
                        value={rawMaterialForm.name}
                        onChange={(v) =>
                          setRawMaterialForm((p) => ({ ...p, name: v }))
                        }
                        placeholder="e.g. Whole Chicken"
                      />
                    </FormField>
                  </div>
                  <FormField label="Category">
                    <StyledInput
                      type="text"
                      value={rawMaterialForm.category}
                      onChange={(v) =>
                        setRawMaterialForm((p) => ({ ...p, category: v }))
                      }
                      placeholder="e.g. Sauce, Chopped Chicken"
                    />
                  </FormField>
                  <FormField label="Unit">
                    <StyledSelect
                      value={rawMaterialForm.unit}
                      onChange={(v) =>
                        setRawMaterialForm((p) => ({ ...p, unit: v }))
                      }
                    >
                      {RAW_MATERIAL_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </StyledSelect>
                  </FormField>
                  <FormField label="Initial Stock">
                    <StyledInput
                      type="number"
                      value={rawMaterialForm.initialStock}
                      onChange={(v) =>
                        setRawMaterialForm((p) => ({ ...p, initialStock: v }))
                      }
                      placeholder="e.g. 20"
                    />
                  </FormField>
                  <FormField label="Expiry Date">
                    <StyledInput
                      type="date"
                      value={rawMaterialForm.expiryDate}
                      onChange={(v) =>
                        setRawMaterialForm((p) => ({ ...p, expiryDate: v }))
                      }
                      placeholder=""
                    />
                  </FormField>
                  <FormField label="Price (optional)">
                    <StyledInput
                      type="number"
                      value={rawMaterialForm.price}
                      onChange={(v) =>
                        setRawMaterialForm((p) => ({ ...p, price: v }))
                      }
                      placeholder="e.g. 180"
                    />
                  </FormField>
                  <div className="col-span-2">
                    <FormField label="Description (optional)">
                      <StyledInput
                        type="text"
                        value={rawMaterialForm.description}
                        onChange={(v) =>
                          setRawMaterialForm((p) => ({ ...p, description: v }))
                        }
                        placeholder="Optional notes"
                      />
                    </FormField>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowRawMaterialForm(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addRawMaterial}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    {submitting ? "Saving..." : "Save Raw Material"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showReconcile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
              >
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">
                      End-of-Day Reconciliation
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Returns are saved on the batch — staff will see them
                      tomorrow morning.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowReconcile(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors text-lg"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-6 pt-4 flex items-center gap-4 text-xs text-slate-400">
                  {[
                    ["bg-orange-400", "Whole Chicken", ""],
                    [
                      "bg-amber-500",
                      "Chopped Chicken",
                      "(can return as whole)",
                    ],
                    ["bg-slate-400", "Other Meat/Protein", ""],
                  ].map(([dot, label, sub]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${dot} inline-block`}
                      />
                      {label}
                      {sub && (
                        <span className="ml-1 text-amber-500 font-medium">
                          {sub}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <div className="p-6 space-y-3 max-h-[26rem] overflow-y-auto">
                  {reconcileItems.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No reconcilable items currently withdrawn.
                    </p>
                  ) : (
                    reconcileItems.map((item, i) => {
                      const isChopped = item.category
                          .toLowerCase()
                          .includes("chopped chicken"),
                        isWhole = item.category
                          .toLowerCase()
                          .includes("whole chicken");
                      return (
                        <div
                          key={item.product_id}
                          className={`p-4 rounded-2xl border transition-colors ${isChopped ? "bg-amber-50/60 border-amber-100" : isWhole ? "bg-orange-50/60 border-orange-100" : "bg-slate-50 border-slate-100"}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${isWhole ? "bg-orange-400" : isChopped ? "bg-amber-500" : "bg-slate-400"}`}
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">
                                  {item.product_name}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Withdrawn today:{" "}
                                  <span className="font-medium text-slate-600">
                                    {item.withdrawn} {item.unit}
                                  </span>
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getCategoryStyle(item.category)}`}
                            >
                              {item.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-slate-500 whitespace-nowrap w-20 flex-shrink-0">
                              Return qty:
                            </label>
                            <input
                              type="number"
                              value={item.returnQty}
                              placeholder="0"
                              min={0}
                              max={item.withdrawn}
                              onChange={(e) =>
                                setReconcileItems((prev) =>
                                  prev.map((r, j) =>
                                    j === i
                                      ? { ...r, returnQty: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                              className="w-28 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                            <span className="text-xs text-slate-400">
                              {item.unit}
                            </span>
                            {isChopped && parseFloat(item.returnQty) > 0 && (
                              <div className="ml-auto flex items-center gap-2 bg-white border border-amber-200 rounded-xl p-1">
                                <span className="text-[10px] text-amber-600 font-semibold ml-1">
                                  Return as:
                                </span>
                                {(["chopped", "whole"] as const).map((dest) => (
                                  <button
                                    key={dest}
                                    onClick={() =>
                                      setReconcileItems((prev) =>
                                        prev.map((r, j) =>
                                          j === i
                                            ? { ...r, returnDestination: dest }
                                            : r,
                                        ),
                                      )
                                    }
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize ${item.returnDestination === dest ? (dest === "chopped" ? "bg-amber-500 text-white shadow-sm" : "bg-orange-500 text-white shadow-sm") : "text-slate-400 hover:text-amber-500"}`}
                                  >
                                    {dest}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {isChopped && parseFloat(item.returnQty) > 0 && (
                            <p className="text-[10px] text-slate-400 mt-2 pl-px">
                              {item.returnDestination === "whole"
                                ? "↩ Excess will be returned to Whole Chicken stock"
                                : "↩ Excess will stay as Chopped Chicken stock"}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {
                      reconcileItems.filter((i) => parseFloat(i.returnQty) > 0)
                        .length
                    }{" "}
                    item(s) to reconcile
                    {reconcileItems.filter((i) => parseFloat(i.returnQty) > 0)
                      .length > 0 && (
                      <span className="ml-1 text-amber-600 font-medium">
                        — will show in tomorrow's banner
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowReconcile(false)}
                      className="px-5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitReconciliation}
                      disabled={
                        submitting ||
                        reconcileItems.filter(
                          (i) => parseFloat(i.returnQty) > 0,
                        ).length === 0
                      }
                      className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60"
                    >
                      {submitting ? "Saving..." : "Confirm Returns"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
