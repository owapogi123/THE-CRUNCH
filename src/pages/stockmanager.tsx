import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  motion,
  AnimatePresence,
  type Variants,
  type Transition,
} from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { useNotifications } from "@/lib/NotificationContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type WithdrawalType = "initial" | "supplementary" | "return";
type StockStatus = "critical" | "low" | "normal";
type Tab =
  | "dashboard"
  | "withdrawal"
  | "alerts"
  | "suppliers"
  | "purchases"
  | "purchase-history";
type DashboardSummaryKey = "products" | "withdrawn" | "wasted" | "returned";
export type POStatus = "Draft" | "Ordered" | "Received" | "Cancelled";

export interface POItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number;
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
  receiptNo?: string;
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
interface SupplierHistory {
  history_id: number;
  supplier_id: number;
  supplier_name: string;
  action: string;
  details?: string;
  performed_by?: string | null;
  created_at: string;
}
interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_number: string;
  product_id: number;
  email?: string;
  // Keep as a comma-separated string for API compatibility.
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

// These handle main inventory with expiry
interface StorageBatch {
  batch_id: number;
  product_id: number;
  product_name: string;
  quantity: number; // Original received
  remaining_qty: number; // What's left in storage
  unit: string;
  received_date: string;
  expiry_date: string;
  status: "active" | "expired"; // Only 2 states
}

// These track today's withdrawn amounts
interface KitchenBatch {
  kitchen_batch_id: number; // Unique ID for kitchen batch
  storage_batch_id: number; // Links to source storage batch
  product_id: number;
  product_name: string;
  withdrawn_qty: number; // Full withdrawn amount
  used_qty: number; // What kitchen actually used
  returned_qty: number; // What was returned to storage
  unit: string;
  expiry_date: string; // Inherited from storage batch
  withdrawn_at: string; // When it was withdrawn
  status: "active" | "reconciled"; // Daily lifecycle
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
  price: string;
  description: string;
}
interface ReportLineItem {
  product_id: number;
  product_name: string;
  category: string;
  unit: string;
  received: number;
  withdrawn: number;
  returned: number;
  wasted: number;
  remaining: number;
  consumptionRate: number;
}
interface ReportData {
  period: string;
  generatedAt: string;
  items: ReportLineItem[];
  totalReceived: number;
  totalWithdrawn: number;
  totalReturned: number;
  totalWasted: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const API_BASE = "/api";
function toNumber(v: unknown, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}
function fmtInt(v: unknown): string {
  return Math.round(toNumber(v)).toLocaleString();
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
    apiFetch<{
      success: boolean;
      product_id: number;
      quantity: number;
      dailyWithdrawn: number;
      wasted: number;
    }>("/stock-status/spoilage", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSuppliers: () => apiFetch<Supplier[]>("/suppliers"),
  postSupplier: (body: Omit<Supplier, "supplier_id">) =>
    apiFetch<Supplier>("/suppliers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  mergeSupplierProducts: (supplier_id: number, products: string[]) =>
    apiFetch<Supplier>(`/suppliers/${supplier_id}/products`, {
      method: "PATCH",
      body: JSON.stringify({ products }),
    }),
  removeSupplierProduct: (supplier_id: number, product_name: string) =>
    apiFetch<Supplier>(
      `/suppliers/${supplier_id}/products/${encodeURIComponent(product_name)}`,
      { method: "DELETE" },
    ),
  deleteSupplier: (id: number) =>
    apiFetch<{ success: boolean }>(`/suppliers/${id}`, { method: "DELETE" }),
  getSupplierHistory: () => apiFetch<SupplierHistory[]>("/suppliers/history"),
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
  deleteProduct: (id: number) =>
    apiFetch<{ message: string }>(`/products/${id}`, { method: "DELETE" }),
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
  reports: {
    getWeekly: (startDate: string) =>
      apiFetch<ReportData>(`/reports/weekly?start=${startDate}`),
    getMonthly: (year: number, month: number) =>
      apiFetch<ReportData>(`/reports/monthly?year=${year}&month=${month}`),
  },
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
      receiptNo: string,
      receivedBy: string,
      itemExpiryDates?: Record<number, string>,
    ) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/receive`, {
        method: "PATCH",
        body: JSON.stringify({
          receiptNo,
          receivedBy,
          receivedDate: new Date().toISOString().split("T")[0],
          itemExpiryDates,
        }),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean }>(`/purchase-orders/${id}`, {
        method: "DELETE",
      }),
  },
};

// ─── Storage Batch APIs (unchanged) ─────────────────────────────────────────
const storageApi = {
  getAll: () => apiFetch<StorageBatch[]>("/batches/active"),
  withdrawFromStorage: (body: {
    product_id: number;
    qty_needed: number;
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
      total_taken: number;
    }>("/batches/withdraw", { method: "POST", body: JSON.stringify(body) }),
};

// ─── NEW Kitchen Batch APIs ─────────────────────────────────────────────────
const kitchenApi = {
  getAll: () => apiFetch<KitchenBatch[]>("/batches/kitchen"),
  createKitchenBatch: (body: {
    product_id: number;
    quantity: number;
    type: WithdrawalType;
    recorded_by: string;
    storage_batch_id?: number;
  }) =>
    apiFetch<KitchenBatch>("/batches/kitchen", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reconcile: (kitchen_batch_id: number) =>
    apiFetch<KitchenBatch>(`/batches/kitchen/${kitchen_batch_id}/reconcile`, {
      method: "PATCH",
    }),

  returnUnused: (kitchen_batch_id: number, body?: { qty?: number }) =>
    apiFetch<KitchenBatch>(`/batches/kitchen/${kitchen_batch_id}/return`, {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    }),

  reconcileKitchenBatch: (
    withdrawal_id: number,
    body: {
      used_qty: number;
      returned_qty: number;
    },
  ) =>
    apiFetch<KitchenBatch>(`/batches/kitchen/${withdrawal_id}/reconcile`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getTodayKitchenBatches: () =>
    apiFetch<KitchenBatch[]>("/batches/kitchen/today"),

  addSupplementary: (
    kitchen_batch_id: number,
    body: { qty: number; storage_batch_id?: number },
  ) =>
    apiFetch<KitchenBatch>(`/batches/kitchen/${kitchen_batch_id}/supplement`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "alerts", label: "Alerts" },
  { id: "suppliers", label: "Suppliers" },
  { id: "purchases", label: "Purchase Orders" },
  { id: "purchase-history", label: "Purchase Order History" },
];
const PO_HISTORY_PAGE_SIZE = 10;
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
  product_id: 0,
  email: "",
  products_supplied: "",
};
const BLANK_RAW_MATERIAL: RawMaterialForm = {
  name: "",
  category: "Sauce",
  unit: "liter",
  initialStock: "",
  price: "",
  description: "",
};
const SUPPLIER_FIELDS: {
  key: keyof Omit<Supplier, "supplier_id">;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
const isExpiringSoon = (e?: string | null) => {
  if (!e) return false;
  const d = (new Date(e).getTime() - Date.now()) / 86400000;
  return d <= 3 && d >= 0;
};
const isExpired = (e?: string | null) =>
  !!e && new Date(e).getTime() < Date.now();
const daysUntilExpiry = (e?: string | null): number | null => {
  if (!e) return null;
  const d = new Date(e);
  return isNaN(d.getTime())
    ? null
    : Math.floor((d.getTime() - Date.now()) / 86400000);
};
const fmtDate = (v?: string | null) => {
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
const fmtReceivedDate = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};
const fmtFilterDate = (v: string) => {
  if (!v) return "Select date";
  return fmtReceivedDate(v);
};
const isDateInRange = (
  value: string | null | undefined,
  dateFrom: string,
  dateTo: string,
) => {
  if (!value) return false;
  const normalized = String(value).split("T")[0];
  if (!normalized) return false;
  if (dateFrom && normalized < dateFrom) return false;
  if (dateTo && normalized > dateTo) return false;
  return true;
};
function parseSupplierProducts(products_supplied?: string): string[] {
  if (!products_supplied) return [];
  return products_supplied
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function mergeSupplierProducts(existing: string, incoming: string[]): string {
  const existingArr = parseSupplierProducts(existing);
  const merged = [...new Set([...existingArr, ...incoming])];
  return merged.join(", ");
}
const getCategoryStyle = (cat: string) => {
  const c = cat.toLowerCase();
  if (c.includes("whole chicken"))
    return "bg-orange-50 text-orange-600 border-orange-100";
  if (c.includes("chopped chicken"))
    return "bg-amber-50 text-amber-700 border-amber-100";
  if (c.includes("sauce")) return "bg-rose-50 text-rose-500 border-rose-100";
  return "bg-slate-50 text-slate-500 border-slate-100";
};
function normalizeReportData(data: ReportData): ReportData {
  const deduped = new Map<number, ReportLineItem>();
  for (const item of data.items) deduped.set(item.product_id, item);
  const items = Array.from(deduped.values());
  return {
    ...data,
    items,
    totalReceived: items.reduce((s, i) => s + toNumber(i.received), 0),
    totalWithdrawn: items.reduce((s, i) => s + toNumber(i.withdrawn), 0),
    totalReturned: items.reduce((s, i) => s + toNumber(i.returned), 0),
    totalWasted: items.reduce((s, i) => s + toNumber(i.wasted), 0),
  };
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

const inputCls =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200";

function ExpiryChip({ dateStr }: { dateStr: string | null | undefined }) {
  const days = daysUntilExpiry(dateStr);
  if (!dateStr || days === null)
    return <span className="text-xs text-slate-300">—</span>;
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Expired
      </span>
    );
  if (days === 0)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block animate-pulse" />
        Expires today
      </span>
    );
  if (days <= 3)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
        {days}d left
      </span>
    );
  if (days <= 7)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-600 border border-yellow-200">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
        {days}d left
      </span>
    );
  return (
    <span className="text-xs text-slate-500 font-medium">
      {fmtDate(dateStr)}
    </span>
  );
}

function KPICard({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  onClick?: () => void;
}) {
  const interactive = typeof onClick === "function";

  return (
    <motion.div
      variants={itemVariants}
      className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${KPI_ACCENT[accent].border} ${interactive ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" : ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p
        className={`text-3xl font-bold mt-1 leading-none ${KPI_ACCENT[accent].value}`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      {interactive && (
        <p className="text-[11px] text-slate-500 mt-3 font-medium">
          Click to view summary
        </p>
      )}
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

function DashboardSummaryModal({
  open,
  title,
  subtitle,
  totalLabel,
  totalValue,
  rows,
  emptyMessage,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: string;
  rows: Array<{
    id: string;
    name: string;
    value: string;
    meta: string;
  }>;
  emptyMessage: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-slate-800">{title}</p>
              <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 transition-colors text-lg"
            >
              ×
            </button>
          </div>

          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">
              {totalLabel}
            </p>
            <p className="text-3xl font-bold text-slate-800 mt-1">
              {totalValue}
            </p>
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-6">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
                {emptyMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-slate-100 bg-white px-4 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{row.meta}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-800">
                        {row.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
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
  disabled = false,
  children,
}: {
  onClick: () => void | Promise<void>;
  variant: "primary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${variant === "primary" ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-rose-500 text-white hover:bg-rose-600"}`}
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

const TrashIcon = () => (
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
);
const CartIcon = () => (
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

// ─── Feature Components ───────────────────────────────────────────────────────

function PODetailDrawer({
  order,
  onClose,
  onStatusChange,
  onDelete,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onStatusChange: (id: string, status: POStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
      className="fixed right-0 top-0 h-full w-[440px] bg-white shadow-2xl z-50 flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 font-medium">{order.date}</p>
          <h2 className="text-lg font-semibold text-gray-800">{order.id}</h2>
        </div>
        <div className="flex items-center gap-2">
          <POBadge status={order.status} />
          {(order.status === "Draft" || order.status === "Ordered") && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="Cancel order"
            >
              <TrashIcon />
            </button>
          )}
          <CloseBtn onClick={onClose} />
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-red-100 bg-red-50 px-6 py-4"
          >
            <p className="text-sm font-semibold text-red-700 mb-1">
              Cancel this purchase order?
            </p>
            <p className="text-xs text-red-400 mb-3">
              {order.id} · {order.supplier} · {order.items.length} item
              {order.items.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-white transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={() => {
                  onDelete(order.id);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes, cancel order
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                className="py-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.category} · {item.quantity} {item.unit}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-800">
                      ₱{(item.quantity * item.unitCost).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      ₱{item.unitCost}/{item.unit}
                    </p>
                  </div>
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
        {order.status === "Received" &&
          (order.receiptNo || order.receivedBy || order.receivedDate) && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-1">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">
                Received
              </p>
              {order.receiptNo && (
                <p className="text-sm font-medium text-gray-700">
                  Receipt: {order.receiptNo}
                </p>
              )}
              {order.receivedBy && (
                <p className="text-sm font-medium text-gray-700">
                  By: {order.receivedBy}
                </p>
              )}
              {order.receivedDate && (
                <p className="text-sm text-gray-500">
                  On: {order.receivedDate}
                </p>
              )}
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
  onShowToast,
}: {
  order: PurchaseOrder;
  loading: boolean;
  onClose: () => void;
  onConfirm: (details: {
    receiptNo: string;
    receivedBy: string;
    expiryDates: Record<number, string>;
  }) => Promise<void>;
  onShowToast: (message: string, type: "success" | "error") => void;
}) {
  const [receiptNo, setReceiptNo] = useState(order.receiptNo || "");
  const [receivedBy, setReceivedBy] = useState(order.receivedBy || "");
  const [expiryDates, setExpiryDates] = useState<Record<number, string>>(() =>
    Object.fromEntries(order.items.map((item) => [item.id, ""])),
  );

  const handleConfirm = async () => {
    if (!receiptNo.trim()) {
      onShowToast(
        "Please enter the receipt number before completing the order.",
        "error",
      );
      return;
    }
    if (!receivedBy.trim()) {
      onShowToast(
        "Please enter who received the stock before completing the order.",
        "error",
      );
      return;
    }
    const missing = order.items.filter((item) => !expiryDates[item.id]?.trim());
    if (missing.length > 0) {
      onShowToast(
        "Please set an expiry date for each item before marking the order as received.",
        "error",
      );
      return;
    }
    await onConfirm({
      receiptNo: receiptNo.trim(),
      receivedBy: receivedBy.trim(),
      expiryDates,
    });
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
              Confirm actual expiry dates. Enter the date printed on each
              received item.
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{order.id}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {order.supplier} · Expected delivery {order.deliveryDate}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 px-4 py-4">
              <label className="text-xs font-semibold text-slate-500">
                Receipt No.
              </label>
              <input
                type="text"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="e.g. DR-2026-001"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div className="rounded-xl border border-slate-100 px-4 py-4">
              <label className="text-xs font-semibold text-slate-500">
                Received By
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Enter staff name"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>
          {order.items.map((item) => {
            const current = expiryDates[item.id] || "";
            const dayCount = daysUntilExpiry(current);
            const warn = current && dayCount !== null && dayCount <= 7;
            return (
              <div
                key={item.id}
                className={`rounded-xl border px-4 py-4 transition-colors ${warn ? "border-orange-200 bg-orange-50/30" : "border-slate-100"}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.category} · {item.quantity} {item.unit}
                    </p>
                  </div>
                  {current && <ExpiryChip dateStr={current} />}
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
                  <label className="text-xs font-semibold text-slate-500 pb-2">
                    Actual Expiry Date
                  </label>
                  <input
                    type="date"
                    value={current}
                    onChange={(e) =>
                      setExpiryDates((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                  />
                </div>
                {warn && dayCount !== null && (
                  <p className="text-[11px] text-orange-500 font-medium mt-2">
                    ⚠ This item will expire in {dayCount} day
                    {dayCount !== 1 ? "s" : ""} — consider whether to accept.
                  </p>
                )}
              </div>
            );
          })}
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

function POReceiptModal({
  order,
  onClose,
}: {
  order: PurchaseOrder;
  onClose: () => void;
}) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const subtotal = calcPOTotal(order.items);
  const vat = subtotal * 0.12;
  const total = subtotal + vat;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const receiptElement = document.getElementById("po-receipt-content");
    if (!receiptElement) return;

    setDownloadingPdf(true);
    try {
      const canvas = await html2canvas(receiptElement, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const renderWidth = pageWidth - margin * 2;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;
      const boundedHeight = Math.min(renderHeight, pageHeight - margin * 2);

      pdf.addImage(
        imageData,
        "PNG",
        margin,
        margin,
        renderWidth,
        boundedHeight,
      );
      pdf.save(`receipt-${order.id}.pdf`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #po-receipt-content,
          #po-receipt-content * {
            visibility: visible;
          }
          #po-receipt-content {
            position: absolute;
            inset: 0;
            margin: 0;
            width: 100%;
            max-width: none;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Purchase Order Receipt
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Printable official receipt for completed purchase orders
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
          <div
            id="po-receipt-content"
            className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <div className="border-b border-slate-200 pb-6">
              <p className="text-2xl font-bold text-slate-900">
                Restaurant Stock System
              </p>
              <p className="text-sm text-slate-500 mt-1">Official Receipt</p>
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Receipt Number
                  </p>
                  <p className="font-semibold text-slate-800 mt-1">
                    {order.receiptNo || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    PO Number
                  </p>
                  <p className="font-semibold text-slate-800 mt-1">
                    {order.id}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Date Received
                  </p>
                  <p className="font-medium text-slate-700 mt-1">
                    {order.receivedDate
                      ? fmtReceivedDate(order.receivedDate)
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Received By
                  </p>
                  <p className="font-medium text-slate-700 mt-1">
                    {order.receivedBy || "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="py-6 border-b border-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Supplier
              </p>
              <p className="text-lg font-semibold text-slate-800 mt-2">
                {order.supplier}
              </p>
              <p className="text-sm text-slate-500 mt-1">{order.contact}</p>
            </div>

            <div className="py-6">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Item",
                        "Category",
                        "Qty",
                        "Unit",
                        "Unit Cost",
                        "Amount",
                      ].map((header) => (
                        <th
                          key={header}
                          className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${
                            ["Item", "Category"].includes(header)
                              ? "text-left"
                              : "text-right"
                          }`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {item.category}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          ₱{toNumber(item.unitCost).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          ₱
                          {(
                            toNumber(item.quantity) * toNumber(item.unitCost)
                          ).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-3 text-right text-slate-500"
                      >
                        Subtotal
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        ₱{subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-3 text-right text-slate-500"
                      >
                        VAT 12%
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        ₱{vat.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-3 text-right font-semibold text-slate-800"
                      >
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-base font-bold text-slate-900">
                        ₱{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <p className="text-xs italic text-slate-400">
                This serves as your official receipt.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {downloadingPdf ? "Preparing PDF..." : "Download PDF"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreatePOModal({
  onClose,
  onCreate,
  quickOrderProducts,
  allProducts,
  allSuppliers,
  prefillProduct,
  onShowToast,
}: {
  onClose: () => void;
  onCreate: (
    po: Omit<PurchaseOrder, "id">,
    meta: { supplierId: number; itemNames: string[] },
  ) => Promise<void>;
  quickOrderProducts: Product[];
  allProducts: Product[];
  allSuppliers: Supplier[];
  prefillProduct?: {
    name: string;
    category: string;
    unit: string;
    supplier: string;
  } | null;
  onShowToast: (message: string, type: "success" | "error") => void;
}) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | "">(
    () => {
      if (!prefillProduct?.supplier) return "";
      const found = allSuppliers.find(
        (s) =>
          s.supplier_name.trim().toLowerCase() ===
          prefillProduct.supplier.trim().toLowerCase(),
      );
      return found?.supplier_id ?? "";
    },
  );
  const [notes, setNotes] = useState("");
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [activeItemSuggestionIndex, setActiveItemSuggestionIndex] = useState<
    number | null
  >(null);
  const [items, setItems] = useState<Omit<POItem, "id">[]>(() => {
    if (prefillProduct) {
      return [
        {
          name: prefillProduct.name,
          category: prefillProduct.category,
          unit: prefillProduct.unit,
          quantity: 0,
          unitCost: 0,
        },
      ];
    }
    return [{ ...EMPTY_PO_ITEM }];
  });

  const handleSupplierChange = (supplierId: string) => {
    const id = Number(supplierId);
    setSelectedSupplierId(id || "");
  };

  const selectedSupplier = allSuppliers.find(
    (s) => s.supplier_id === selectedSupplierId,
  );
  const supplierName = selectedSupplier?.supplier_name ?? "";
  const contact = selectedSupplier?.contact_number ?? "";
  const supplierProductNameSet = useMemo(
    () =>
      new Set(
        parseSupplierProducts(selectedSupplier?.products_supplied).map((name) =>
          name.toLowerCase(),
        ),
      ),
    [selectedSupplier?.products_supplied],
  );

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
  const applyProductToItem = (idx: number, product: Product) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              name: product.product_name,
              category: product.category,
              unit: product.unit,
            }
          : item,
      ),
    );
    setActiveItemSuggestionIndex(null);
  };
  const getItemSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return allProducts
      .filter((product) => !isMenuFoodProduct(product))
      .filter((product) => product.product_name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPriority = supplierProductNameSet.has(
          a.product_name.toLowerCase(),
        )
          ? 0
          : 1;
        const bPriority = supplierProductNameSet.has(
          b.product_name.toLowerCase(),
        )
          ? 0
          : 1;

        return (
          aPriority - bPriority || a.product_name.localeCompare(b.product_name)
        );
      })
      .slice(0, 6);
  };
  const addQuickOrderItem = (product: Product) => {
    setItems((p) => [
      {
        name: product.product_name,
        category: product.category,
        unit: product.unit,
        quantity: Math.max(
          1,
          Math.ceil(
            toNumber(product.reorderPoint) - toNumber(product.mainStock),
          ),
        ),
        unitCost: 0,
      },
      ...p,
    ]);
    setShowQuickOrder(false);
  };
  const addSupplierProductItem = (productName: string) => {
    const match = allProducts.find(
      (p) => p.product_name.trim().toLowerCase() === productName.toLowerCase(),
    );

    setItems((prev) => [
      {
        name: match?.product_name ?? productName,
        category: match?.category ?? "",
        unit: match?.unit ?? "",
        quantity: match
          ? Math.max(
              1,
              Math.ceil(
                toNumber(match.reorderPoint) - toNumber(match.mainStock),
              ),
            )
          : 1,
        unitCost: 0,
      },
      ...prev,
    ]);
  };
  const subtotal = items.reduce(
    (s, i) => s + toNumber(i.quantity) * toNumber(i.unitCost),
    0,
  );

  const handleSubmit = async () => {
    if (!supplierName.trim() || items.some((i) => !i.name.trim())) {
      onShowToast("Please fill in all required fields.", "error");
      return;
    }
    const unmatched = items
      .map((i) => i.name.trim())
      .filter(
        (name) =>
          !allProducts.some(
            (p) => p.product_name.trim().toLowerCase() === name.toLowerCase(),
          ),
      );
    if (unmatched.length > 0) {
      onShowToast(
        `These items don't match any product in inventory: ${unmatched.join(", ")}.`,
        "error",
      );
      return;
    }
    const today = new Date().toISOString().split("T")[0];

    try {
      await onCreate(
        {
          supplier: supplierName,
          contact,
          date: today,
          deliveryDate: today,
          status: "Draft",
          notes,
          items: items.map((item, idx) => ({
            ...item,
            id: idx + 1,
            quantity: toNumber(item.quantity),
            unitCost: toNumber(item.unitCost),
          })),
        },
        {
          supplierId: Number(selectedSupplierId),
          itemNames: items.map((item) => item.name.trim()).filter(Boolean),
        },
      );
      onClose();
    } catch {
      /* error shown via onShowToast in parent */
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-5">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">
              Supplier <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
            >
              <option value="">- Select a supplier -</option>
              {allSuppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                  {s.products_supplied ? ` · ${s.products_supplied}` : ""}
                </option>
              ))}
            </select>
          </div>
          {selectedSupplier && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                {selectedSupplier.supplier_name}
              </p>
              <p className="text-xs text-slate-500">
                {selectedSupplier.contact_number}
                {selectedSupplier.email && ` · ${selectedSupplier.email}`}
              </p>
              {parseSupplierProducts(selectedSupplier.products_supplied)
                .length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parseSupplierProducts(
                    selectedSupplier.products_supplied,
                  ).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => addSupplierProductItem(p)}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Items
                {selectedSupplier &&
                  parseSupplierProducts(selectedSupplier.products_supplied)
                    .length > 0 && (
                    <span className="ml-2 text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full normal-case">
                      click supplier items to add
                    </span>
                  )}
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
                  onClick={() => setItems((p) => [{ ...EMPTY_PO_ITEM }, ...p])}
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
                            toNumber(product.reorderPoint) -
                              toNumber(product.mainStock),
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
            <div className="space-y-2">
              <AnimatePresence>
                {items.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start rounded-lg border border-slate-100 p-2 min-w-0"
                  >
                    <div className="sm:col-span-2 min-w-0">
                      <label className="block text-[11px] text-gray-400 mb-1">
                        Item {idx + 1}
                      </label>
                      <div className="relative">
                        <input
                          value={item.name}
                          onChange={(e) => {
                            updateItem(idx, "name", e.target.value);
                            setActiveItemSuggestionIndex(idx);
                          }}
                          onFocus={() => setActiveItemSuggestionIndex(idx)}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveItemSuggestionIndex((current) =>
                                current === idx ? null : current,
                              );
                            }, 150);
                          }}
                          placeholder="Item name"
                          className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                        />
                        {activeItemSuggestionIndex === idx &&
                          getItemSuggestions(item.name).length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-20 overflow-hidden">
                              {getItemSuggestions(item.name).map((product) => (
                                <button
                                  key={product.product_id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    applyProductToItem(idx, product)
                                  }
                                  className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  <span className="block font-medium text-slate-700">
                                    {product.product_name}
                                  </span>
                                  <span className="block text-[11px] text-slate-400">
                                    {product.category}
                                    {product.unit ? ` · ${product.unit}` : ""}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                    {[
                      ["Unit", "unit", "kg / pcs"],
                      ["Qty", "quantity", "0"],
                      ["Unit Cost", "unitCost", "₱0"],
                    ].map(([lbl, field, ph]) => (
                      <div key={field} className="min-w-0">
                        <label className="block text-[11px] text-gray-400 mb-1">
                          {lbl}
                        </label>
                        <input
                          type={field === "unit" ? "text" : "number"}
                          value={(item as any)[field] || ""}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              field as keyof Omit<POItem, "id">,
                              e.target.value,
                            )
                          }
                          placeholder={ph}
                          className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="sm:col-span-2 flex justify-end text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors"
                    >
                      <TrashIcon />
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
                        Math.round(p.reorderPoint - p.mainStock),
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
                            <CartIcon />
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
  // Filter to only "returned" status batches
  const returnedBatches = batches.filter((b) => b.status === "returned");
  if (returnedBatches.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">↩</span>
          <div>
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Returned Stock (Available Today)
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Use these first (FIFO) before new batches
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors px-2 py-1 rounded-lg hover:bg-emerald-100"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <div className="px-5 pb-4 grid grid-cols-3 gap-3">
          {returnedBatches.map((b) => {
            const expiring = isExpiringSoon(b.expiry_date);
            const expired = isExpired(b.expiry_date);
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
                    <span>{fmtReceivedDate(b.received_date)}</span>
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
                        {fmtDate(b.expiry_date)}
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
    // FIXED: Include BOTH "active" AND "returned" batches
    const sorted = [...batches]
      .filter(
        (b) =>
          ["active", "returned"].includes(b.status) &&
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
      const take = Math.min(toNumber(batch.remaining_qty), remaining);
      result.push({ batch, take });
      remaining -= take;
    }
    return result;
  }, [batches, qtyNeeded]);

  const totalAvailable = batches
    .filter(
      (b) =>
        ["active", "returned"].includes(b.status) &&
        toNumber(b.remaining_qty) > 0 &&
        !isExpired(b.expiry_date),
    )
    .reduce((s, b) => s + toNumber(b.remaining_qty), 0);
  const insufficient = qtyNeeded > 0 && qtyNeeded > totalAvailable;
  if (batches.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            FIFO Batch Queue (Active + Returned)
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
          .filter((b) => toNumber(b.remaining_qty) > 0)
          .sort(
            (a, b) =>
              new Date(a.received_date).getTime() -
              new Date(b.received_date).getTime(),
          )
          .map((batch, idx) => {
            const previewRow = preview.find(
              (p) => p.batch.batch_id === batch.batch_id,
            );
            const expiring = isExpiringSoon(batch.expiry_date);
            const expired = isExpired(batch.expiry_date);
            return (
              <div
                key={batch.batch_id}
                className={`px-3.5 py-3 flex items-center gap-3 transition-colors ${previewRow ? "bg-indigo-50/60" : "bg-white"} ${expired ? "opacity-50" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Batch #{batch.batch_id}
                    </span>
                    {idx === 0 && (
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
                    <span>Received {fmtReceivedDate(batch.received_date)}</span>
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
                        Exp. {fmtDate(batch.expiry_date)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-700">
                    {toNumber(batch.remaining_qty)}{" "}
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

function BatchRow({
  batch,
  productMap,
}: {
  batch: Batch;
  productMap: Map<number, { name: string; unit: string }>;
}) {
  const expired = isExpired(batch.expiry_date);
  const expiring = isExpiringSoon(batch.expiry_date);
  const meta = productMap.get(batch.product_id);
  const displayName =
    batch.product_name || meta?.name || `Product ${batch.product_id}`;
  const displayUnit = batch.unit || meta?.unit || "unit";
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${expired ? "bg-red-50/40" : ""}`}
    >
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${expired ? "bg-red-400" : expiring ? "bg-orange-400" : "bg-emerald-400"}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 truncate">
          {displayName}
        </p>
        <p className="text-[11px] text-slate-400">Batch #{batch.batch_id}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-700">
          {batch.remaining_qty}
          <span className="text-xs font-normal text-slate-400 ml-1">
            {displayUnit}
          </span>
        </p>
        <p className="text-[10px] text-slate-400">remaining</p>
      </div>
      <div className="w-28 text-right flex-shrink-0">
        <ExpiryChip dateStr={batch.expiry_date} />
      </div>
    </div>
  );
}

function KitchenBatchQueuePreview({
  batches,
  unit,
}: {
  batches: KitchenBatch[];
  unit: string;
}) {
  const sortedBatches = useMemo(
    () =>
      [...batches].sort(
        (a, b) =>
          new Date(a.withdrawn_at).getTime() -
          new Date(b.withdrawn_at).getTime(),
      ),
    [batches],
  );

  const totalInKitchen = sortedBatches.reduce(
    (sum, batch) =>
      sum +
      Math.max(
        0,
        toNumber(batch.withdrawn_qty) -
          toNumber(batch.used_qty) -
          toNumber(batch.returned_qty),
      ),
    0,
  );

  if (sortedBatches.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Kitchen Batch Queue
          </span>
          <span className="text-[10px] text-slate-400">
            active kitchen stock for this item
          </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">
          {totalInKitchen} {unit} in kitchen
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {sortedBatches.map((batch, idx) => {
          const expiring = isExpiringSoon(batch.expiry_date);
          const expired = isExpired(batch.expiry_date);
          const availableInKitchen = Math.max(
            0,
            toNumber(batch.withdrawn_qty) -
              toNumber(batch.used_qty) -
              toNumber(batch.returned_qty),
          );

          return (
            <div
              key={batch.kitchen_batch_id}
              className={`px-3.5 py-3 flex items-center gap-3 transition-colors ${idx === 0 ? "bg-indigo-50/50" : "bg-white"} ${expired ? "opacity-50" : ""}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Kitchen Batch #{batch.kitchen_batch_id}
                  </span>
                  {idx === 0 && (
                    <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                      CURRENT
                    </span>
                  )}
                  {batch.status === "reconciled" && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                      RECONCILED
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
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 flex-wrap">
                  <span>From storage batch #{batch.storage_batch_id}</span>
                  <span>Withdrawn {fmtReceivedDate(batch.withdrawn_at)}</span>
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
                      Expires {fmtDate(batch.expiry_date)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-700">
                  {availableInKitchen}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {batch.unit}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  {batch.withdrawn_qty} withdrawn · {batch.used_qty} used ·{" "}
                  {batch.returned_qty} returned
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FIFOBatchGrouped({
  allBatches,
  productMap,
}: {
  allBatches: Batch[];
  productMap: Map<number, { name: string; unit: string }>;
}) {
  const [viewMode, setViewMode] = useState<"delivery" | "expiry">("delivery");

  const grouped = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const b of allBatches) {
      if (b.status !== "active" || b.remaining_qty <= 0) continue;
      const key = b.received_date.split("T")[0];
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, batches], idx) => ({ date, batches, idx }));
  }, [allBatches]);

  const byExpiry = useMemo(
    () =>
      allBatches
        .filter((b) => b.status === "active" && b.remaining_qty > 0)
        .sort((a, b) => {
          if (!a.expiry_date && !b.expiry_date) return 0;
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return (
            new Date(a.expiry_date).getTime() -
            new Date(b.expiry_date).getTime()
          );
        }),
    [allBatches],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        {(["delivery", "expiry"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${viewMode === mode ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {mode === "delivery" ? (
              "Delivered Date"
            ) : (
              <>
                By Nearest Expiry
                {byExpiry.some((b) => isExpiringSoon(b.expiry_date)) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
                )}
              </>
            )}
          </button>
        ))}
      </div>
      {grouped.length === 0 && (
        <div className="text-center py-8 text-sm text-slate-400">
          No active batches found.
        </div>
      )}
      {viewMode === "delivery" &&
        grouped.map(({ date, batches, idx }) => {
          const isNext = idx === 0;
          const hasExpiringSoon = batches.some((b) =>
            isExpiringSoon(b.expiry_date),
          );
          const hasExpired = batches.some((b) => isExpired(b.expiry_date));
          return (
            <div
              key={date}
              className={`rounded-xl border overflow-hidden ${isNext ? "border-indigo-200 shadow-sm" : hasExpired ? "border-red-200 opacity-70" : hasExpiringSoon ? "border-orange-200" : "border-slate-100"}`}
            >
              <div
                className={`px-4 py-2.5 flex items-center justify-between ${isNext ? "bg-indigo-50" : hasExpiringSoon ? "bg-orange-50/60" : "bg-slate-50"}`}
              >
                <div className="flex items-center gap-2">
                  {isNext && (
                    <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                      PULL FIRST
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-600">
                    Delivery — {fmtReceivedDate(date)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({batches.length} item type{batches.length !== 1 ? "s" : ""}
                    )
                  </span>
                </div>
                {hasExpiringSoon && !hasExpired && (
                  <span className="text-[10px] font-bold text-orange-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
                    Items expiring soon
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50 bg-white">
                {batches
                  .sort((a, b) => {
                    if (isExpired(a.expiry_date) && !isExpired(b.expiry_date))
                      return 1;
                    if (!isExpired(a.expiry_date) && isExpired(b.expiry_date))
                      return -1;
                    if (a.expiry_date && b.expiry_date)
                      return (
                        new Date(a.expiry_date).getTime() -
                        new Date(b.expiry_date).getTime()
                      );
                    return 0;
                  })
                  .map((batch) => (
                    <BatchRow
                      key={batch.batch_id}
                      batch={batch}
                      productMap={productMap}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      {viewMode === "expiry" && (
        <div className="rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Soonest expiry first — use these before they expire
            </span>
            <span className="text-[10px] text-slate-400">
              {byExpiry.length} batches
            </span>
          </div>
          <div className="divide-y divide-slate-50 bg-white">
            {byExpiry.map((batch, idx) => {
              const expired = isExpired(batch.expiry_date);
              const expiring = isExpiringSoon(batch.expiry_date);
              const meta = productMap.get(batch.product_id);
              const displayName =
                batch.product_name ||
                meta?.name ||
                `Product ${batch.product_id}`;
              const displayUnit = batch.unit || meta?.unit || "unit";
              return (
                <div
                  key={batch.batch_id}
                  className={`flex items-center gap-3 px-4 py-3 ${expired ? "bg-red-50/40 opacity-60" : expiring ? "bg-orange-50/30" : ""}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${idx === 0 && !expired ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-400"}`}
                  >
                    {idx + 1}
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${expired ? "bg-red-400" : expiring ? "bg-orange-400" : "bg-emerald-400"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">
                      {displayName}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Batch #{batch.batch_id} · Received{" "}
                      {fmtReceivedDate(batch.received_date)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-700">
                      {batch.remaining_qty}
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        {displayUnit}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400">remaining</p>
                  </div>
                  <div className="w-28 text-right flex-shrink-0">
                    <ExpiryChip dateStr={batch.expiry_date} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Kitchen Batches Section ──────────────────────────────────────────────────

function KitchenBatchesSection({
  kitchenBatches,
  nonReturnableProductIds,
  onReturn,
}: {
  kitchenBatches: KitchenBatch[];
  nonReturnableProductIds: Set<number>;
  onReturn: (batch: KitchenBatch) => void;
}) {
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(
    new Set(),
  );

  const toggleBatch = (batchId: number) => {
    const newSelected = new Set(selectedBatches);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
    } else {
      newSelected.add(batchId);
    }
    setSelectedBatches(newSelected);
  };

  const handleBulkReturn = () => {
    selectedBatches.forEach((batchId) => {
      const batch = kitchenBatches.find((b) => b.kitchen_batch_id === batchId);
      if (batch && !nonReturnableProductIds.has(batch.product_id)) {
        onReturn(batch);
      }
    });
    setSelectedBatches(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Kitchen Batches</h3>
          <p className="text-xs text-slate-500">
            Items currently in kitchen use — reconcile or return unused portions
          </p>
        </div>
        {selectedBatches.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkReturn}
              className="px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition-colors"
            >
              Return {selectedBatches.size}
            </button>
          </div>
        )}
      </div>

      {kitchenBatches.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          No kitchen batches found.
        </div>
      ) : (
        <div className="space-y-2">
          {kitchenBatches.map((batch) => {
            const expired = isExpired(batch.expiry_date);
            const expiring = isExpiringSoon(batch.expiry_date);
            const isSelected = selectedBatches.has(batch.kitchen_batch_id);
            const cannotReturn = nonReturnableProductIds.has(batch.product_id);

            return (
              <div
                key={batch.kitchen_batch_id}
                className={`rounded-lg border p-3 transition-all ${
                  isSelected
                    ? "border-indigo-300 bg-indigo-50/50"
                    : expired
                      ? "border-red-200 bg-red-50/40"
                      : expiring
                        ? "border-orange-200 bg-orange-50/30"
                        : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleBatch(batch.kitchen_batch_id)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {batch.product_name}
                      </p>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        Kitchen Batch #{batch.kitchen_batch_id}
                      </span>
                      {cannotReturn && (
                        <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full">
                          No return
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      From Storage Batch #{batch.storage_batch_id} · Withdrawn{" "}
                      {fmtDate(batch.withdrawn_at)}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-700">
                      {batch.withdrawn_qty}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        {batch.unit}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {batch.used_qty > 0 && `${batch.used_qty} used · `}
                      {batch.returned_qty > 0 &&
                        `${batch.returned_qty} returned`}
                      {batch.used_qty === 0 &&
                        batch.returned_qty === 0 &&
                        "Not yet used"}
                    </p>
                  </div>

                  <div className="w-24 text-right flex-shrink-0">
                    <ExpiryChip dateStr={batch.expiry_date} />
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => onReturn(batch)}
                      disabled={cannotReturn}
                      title={
                        cannotReturn
                          ? "Sauces and similar items cannot be returned."
                          : "Return unused stock"
                      }
                      className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded hover:bg-orange-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Return
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockManager() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [withdrawals, setWithdrawals] = useState<StockStatusRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  const [yesterdayReturns, setYesterdayReturns] = useState<Batch[]>([]);
  const [kitchenBatches, setKitchenBatches] = useState<KitchenBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummaryKey | null>(null);
  const [wdProductId, setWdProductId] = useState<number | null>(null);
  const [wdQty, setWdQty] = useState("");
  const [wdType, setWdType] = useState<WithdrawalType>("initial");
  const [adjProductId, setAdjProductId] = useState<number | null>(null);
  const [adjQty, setAdjQty] = useState("");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierHistory, setSupplierHistory] = useState<SupplierHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] =
    useState<Omit<Supplier, "supplier_id">>(BLANK_SUPPLIER);
  const [supplierProductInput, setSupplierProductInput] = useState("");
  const [showRawMaterialForm, setShowRawMaterialForm] = useState(false);
  const [rawMaterialForm, setRawMaterialForm] =
    useState<RawMaterialForm>(BLANK_RAW_MATERIAL);
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileItems, setReconcileItems] = useState<ReconcileRow[]>([]);
  const [poOrders, setPoOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [receiptOrder, setReceiptOrder] = useState<PurchaseOrder | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [poFilterStatus, setPoFilterStatus] = useState<POStatus | "All">("All");
  const [poLoading, setPoLoading] = useState(false);
  const [poHistoryDateFrom, setPoHistoryDateFrom] = useState("");
  const [poHistoryDateTo, setPoHistoryDateTo] = useState("");
  const [poHistoryPage, setPoHistoryPage] = useState(1);
  const poHistoryFromInputRef = useRef<HTMLInputElement | null>(null);
  const poHistoryToInputRef = useRef<HTMLInputElement | null>(null);
  const [prefillPOProduct, setPrefillPOProduct] = useState<
    | { name: string; category: string; unit: string; supplier: string }
    | null
    | undefined
  >(undefined);
  const [reportPeriod, setReportPeriod] = useState<"weekly" | "monthly">(
    "weekly",
  );
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date().getMonth() + 1,
  );
  const [selectedYear, setSelectedYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [showDashboardBackToTop, setShowDashboardBackToTop] = useState(false);
  const dashboardTopRef = useRef<HTMLDivElement | null>(null);

  const { addNotification } = useNotifications();
  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      addNotification({ id: crypto.randomUUID(), label: message, type });
    },
    [addNotification],
  );

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

  const fetchSupplierHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await api.getSupplierHistory();
      setSupplierHistory(data);
    } catch {
      /* non-critical */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const data =
        reportPeriod === "weekly"
          ? await api.reports.getWeekly(selectedWeekStart)
          : await api.reports.getMonthly(selectedYear, selectedMonth);
      setReportData(normalizeReportData(data));
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to load report.",
        "error",
      );
    } finally {
      setReportLoading(false);
    }
  }, [reportPeriod, selectedWeekStart, selectedMonth, selectedYear, showToast]);

  const scrollDashboardTo = useCallback((targetId: string) => {
    if (typeof document === "undefined") return;
    const element = document.getElementById(targetId);
    if (!element) return;
    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
      const [batchesRes, returnsRes, kitchenRes, poRes] =
        await Promise.allSettled([
          api.getActiveBatches(),
          api.getYesterdayReturns(),
          kitchenApi.getAll(),
          api.po.getAll(),
        ]);

      const candidateProducts: Product[] = inv
        .map((p) => ({
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
          isRawMaterial:
            toNumber((p as { isRawMaterial?: unknown }).isRawMaterial) === 1 ||
            p.promo === "RAW_MATERIAL",
        }))
        .filter((p) => {
          const promo = String(p.promo ?? "")
            .toUpperCase()
            .trim();
          const cat = String(p.category ?? "")
            .toLowerCase()
            .trim();
          return (
            promo === "SUPPLIES" ||
            promo === "MENU FOOD" ||
            cat.includes("suppl") ||
            cat === "ingredients" ||
            cat.includes("sauce") ||
            cat.includes("menu food") ||
            cat.includes("beverage") ||
            cat.includes("drink") ||
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
        batchesRes.status === "fulfilled" ? batchesRes.value : [],
      );
      setYesterdayReturns(
        returnsRes.status === "fulfilled" ? returnsRes.value : [],
      );
      setKitchenBatches(
        kitchenRes.status === "fulfilled" ? kitchenRes.value : [],
      );
      setPoOrders(poRes.status === "fulfilled" ? poRes.value : []);
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
  useEffect(() => {
    setReportData(null);
  }, [reportPeriod]);
  useEffect(() => {
    if (tab === "suppliers") fetchSupplierHistory();
  }, [tab, fetchSupplierHistory]);
  useEffect(() => {
    setPoHistoryPage(1);
  }, [poHistoryDateFrom, poHistoryDateTo]);
  useEffect(() => {
    if (tab !== "dashboard" && tab !== "withdrawal") {
      setShowDashboardBackToTop(false);
      return;
    }
    const handleScroll = () => {
      setShowDashboardBackToTop(window.scrollY > 260);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [tab]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const lowStock = products.filter(
    (p) => !isMenuFoodProduct(p) && getStockStatus(p) === "low",
  );
  const criticalStock = products.filter(
    (p) => !isMenuFoodProduct(p) && getStockStatus(p) === "critical",
  );
  const outOfStockItems = useMemo(
    () =>
      products.filter(
        (p) => !isMenuFoodProduct(p) && toNumber(p.mainStock) === 0,
      ),
    [products],
  );
  const alertCriticalStock = useMemo(
    () => criticalStock.filter((p) => toNumber(p.mainStock) > 0),
    [criticalStock],
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
  const selectedKitchenBatches = useMemo(
    () =>
      !wdProductId
        ? []
        : kitchenBatches
            .filter((b) => b.product_id === wdProductId)
            .sort(
              (a, b) =>
                new Date(a.withdrawn_at).getTime() -
                new Date(b.withdrawn_at).getTime(),
            ),
    [kitchenBatches, wdProductId],
  );
  const todayInitialExists = useMemo(
    () => selectedKitchenBatches.some((b) => b.status === "active"),
    [selectedKitchenBatches],
  );
  const kitchenRemaining = useMemo(
    () =>
      selectedKitchenBatches.reduce(
        (sum, b) =>
          sum + Math.max(0, b.withdrawn_qty - b.used_qty - b.returned_qty),
        0,
      ),
    [selectedKitchenBatches],
  );
  const latestKitchenBatch = useMemo(
    () =>
      selectedKitchenBatches.length > 0
        ? [...selectedKitchenBatches].sort(
            (a, b) => b.kitchen_batch_id - a.kitchen_batch_id,
          )[0]
        : null,
    [selectedKitchenBatches],
  );
  const visibleKitchenBatches = useMemo(
    () =>
      kitchenBatches.filter(
        (b) =>
          Math.max(
            0,
            toNumber(b.withdrawn_qty) -
              toNumber(b.used_qty) -
              toNumber(b.returned_qty),
          ) > 0,
      ),
    [kitchenBatches],
  );
  const mainStockProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => !isMenuFoodProduct(product))
          .map((product) => product.product_id),
      ),
    [products],
  );
  const nonReturnableProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => !isReconcilable(product))
          .map((product) => product.product_id),
      ),
    [products],
  );
  const visibleWithdrawalLogs = useMemo(
    () =>
      withdrawals.filter(
        (entry) =>
          mainStockProductIds.has(entry.product_id) &&
          ["initial", "supplementary", "return"].includes(
            String(entry.type).toLowerCase(),
          ),
      ),
    [withdrawals, mainStockProductIds],
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
  const supplierProductSuggestions = useMemo(() => {
    const q = supplierProductInput.trim().toLowerCase();
    const existing = new Set(
      parseSupplierProducts(supplierForm.products_supplied).map((item) =>
        item.toLowerCase(),
      ),
    );

    return products
      .filter((product) => !isMenuFoodProduct(product))
      .filter((product) => !existing.has(product.product_name.toLowerCase()))
      .filter((product) =>
        q ? product.product_name.toLowerCase().includes(q) : false,
      )
      .slice(0, 6);
  }, [products, supplierForm.products_supplied, supplierProductInput]);
  const mainStockProducts = useMemo(
    () => products.filter((p) => !isMenuFoodProduct(p)),
    [products],
  );
  const selectedWithdrawalProduct = useMemo(
    () => mainStockProducts.find((p) => p.product_id === wdProductId) ?? null,
    [mainStockProducts, wdProductId],
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
  const selectedSpoilageProduct = useMemo(
    () => products.find((p) => p.product_id === adjProductId) ?? null,
    [products, adjProductId],
  );
  const withdrawnToday = useMemo(
    () => selectedSpoilageProduct?.dailyWithdrawn ?? 0,
    [selectedSpoilageProduct],
  );
  const spoilageAmount = useMemo(() => parseFloat(adjQty) || 0, [adjQty]);
  const canRecordSpoilage = useMemo(
    () =>
      selectedSpoilageProduct !== null &&
      withdrawnToday > 0 &&
      spoilageAmount > 0 &&
      spoilageAmount <= withdrawnToday,
    [selectedSpoilageProduct, withdrawnToday, spoilageAmount],
  );
  const validationMessage = useMemo(() => {
    if (!selectedSpoilageProduct) return "Select a product first";
    if (withdrawnToday === 0)
      return `No withdrawal today for ${selectedSpoilageProduct.product_name}`;
    if (spoilageAmount === 0) return "Enter spoilage amount";
    if (spoilageAmount > withdrawnToday)
      return `Cannot exceed withdrawn amount (${fmtInt(withdrawnToday)} ${selectedSpoilageProduct.unit})`;
    return "";
  }, [selectedSpoilageProduct, withdrawnToday, spoilageAmount]);
  const totalWithdrawn = products.reduce(
    (s, p) => s + toNumber(p.dailyWithdrawn),
    0,
  );
  const totalWasted = products.reduce((s, p) => s + toNumber(p.wasted), 0);
  const totalReturned = products.reduce((s, p) => s + toNumber(p.returned), 0);
  const dashboardSummaryConfig = useMemo(() => {
    const productRows = [...products]
      .sort((a, b) => a.product_name.localeCompare(b.product_name))
      .map((p) => ({
        id: `product-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.mainStock)} ${p.unit}`,
        meta: `${p.category} · reorder point ${fmtInt(p.reorderPoint)}`,
      }));
    const withdrawnRows = [...products]
      .filter((p) => toNumber(p.dailyWithdrawn) > 0)
      .sort((a, b) => toNumber(b.dailyWithdrawn) - toNumber(a.dailyWithdrawn))
      .map((p) => ({
        id: `withdrawn-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.dailyWithdrawn)} ${p.unit}`,
        meta: `${p.category} · main stock ${fmtInt(p.mainStock)} ${p.unit}`,
      }));
    const wastedRows = [...products]
      .filter((p) => toNumber(p.wasted) > 0)
      .sort((a, b) => toNumber(b.wasted) - toNumber(a.wasted))
      .map((p) => ({
        id: `wasted-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.wasted)} ${p.unit}`,
        meta: `${p.category} · withdrawn today ${fmtInt(p.dailyWithdrawn)} ${p.unit}`,
      }));
    const returnedRows = [...products]
      .filter((p) => toNumber(p.returned) > 0)
      .sort((a, b) => toNumber(b.returned) - toNumber(a.returned))
      .map((p) => ({
        id: `returned-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.returned)} ${p.unit}`,
        meta: `${p.category} · current stock ${fmtInt(p.mainStock)} ${p.unit}`,
      }));

    return {
      products: {
        title: "Total Products Summary",
        subtitle: "All inventory items currently tracked in stock manager.",
        totalLabel: "Total Products",
        totalValue: products.length.toString(),
        rows: productRows,
        emptyMessage: "No products found in inventory.",
      },
      withdrawn: {
        title: "Withdrawn Today Summary",
        subtitle: "Items pulled from storage for kitchen use today.",
        totalLabel: "Total Withdrawn",
        totalValue: fmtInt(totalWithdrawn),
        rows: withdrawnRows,
        emptyMessage: "No products have been withdrawn today.",
      },
      wasted: {
        title: "Wasted Today Summary",
        subtitle: "Recorded spoilage and other waste for the day.",
        totalLabel: "Total Wasted",
        totalValue: fmtInt(totalWasted),
        rows: wastedRows,
        emptyMessage: "No wasted items recorded today.",
      },
      returned: {
        title: "Returned Today Summary",
        subtitle: "Items or quantities returned back into stock today.",
        totalLabel: "Total Returned",
        totalValue: fmtInt(totalReturned),
        rows: returnedRows,
        emptyMessage: "No returned items recorded today.",
      },
    } satisfies Record<
      DashboardSummaryKey,
      {
        title: string;
        subtitle: string;
        totalLabel: string;
        totalValue: string;
        rows: Array<{ id: string; name: string; value: string; meta: string }>;
        emptyMessage: string;
      }
    >;
  }, [products, totalReturned, totalWasted, totalWithdrawn]);
  const wholeChickenProducts = mainStockProducts.filter(isWholeChicken);
  const choppedChickenProducts = mainStockProducts.filter(isChoppedChicken);
  const otherMainStockProducts = mainStockProducts.filter((p) => !isChicken(p));
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return supplierHistory.filter((h) => {
      const matchesSearch =
        !q ||
        h.supplier_name.toLowerCase().includes(q) ||
        h.action.toLowerCase().includes(q) ||
        (h.details ?? "").toLowerCase().includes(q) ||
        (h.performed_by ?? "").toLowerCase().includes(q);
      const matchesDate = isDateInRange(
        h.created_at,
        historyDateFrom,
        historyDateTo,
      );
      return matchesSearch && matchesDate;
    });
  }, [supplierHistory, historySearch, historyDateFrom, historyDateTo]);
  const filteredPOs = useMemo(
    () =>
      poFilterStatus === "All"
        ? poOrders.filter((o) => o.status !== "Received")
        : poOrders.filter((o) => o.status === poFilterStatus),
    [poOrders, poFilterStatus],
  );
  const completedPOs = useMemo(
    () => poOrders.filter((o) => o.status === "Received"),
    [poOrders],
  );
  const filteredCompletedPOs = useMemo(
    () =>
      completedPOs.filter((o) =>
        isDateInRange(o.receivedDate, poHistoryDateFrom, poHistoryDateTo),
      ),
    [completedPOs, poHistoryDateFrom, poHistoryDateTo],
  );
  const poHistoryTotalPages = Math.max(
    1,
    Math.ceil(filteredCompletedPOs.length / PO_HISTORY_PAGE_SIZE),
  );
  const paginatedCompletedPOs = useMemo(() => {
    const start = (poHistoryPage - 1) * PO_HISTORY_PAGE_SIZE;
    return filteredCompletedPOs.slice(start, start + PO_HISTORY_PAGE_SIZE);
  }, [filteredCompletedPOs, poHistoryPage]);
  useEffect(() => {
    setPoHistoryPage((current) => Math.min(current, poHistoryTotalPages));
  }, [poHistoryTotalPages]);
  const productMap = useMemo(
    () =>
      new Map(
        products.map((p) => [
          p.product_id,
          { name: p.product_name, unit: p.unit },
        ]),
      ),
    [products],
  );

  // ── PO Actions ────────────────────────────────────────────────────────────

  const handlePOStatusChange = useCallback(
    async (id: string, status: POStatus) => {
      if (status === "Received") {
        const order = poOrders.find((o) => o.id === id);
        if (!order) {
          showToast("Purchase order not found.", "error");
          return;
        }
        setReceivingOrder(order);
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
    [poOrders, showToast],
  );

  const handlePODelete = useCallback(
    async (id: string) => {
      setPoLoading(true);
      try {
        await api.po.delete(id);
        setPoOrders((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, status: "Cancelled" as POStatus } : o,
          ),
        );
        setSelectedOrder((prev) =>
          prev?.id === id ? { ...prev, status: "Cancelled" as POStatus } : prev,
        );
        showToast("Purchase order cancelled.", "success");
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Failed to cancel order.",
          "error",
        );
      } finally {
        setPoLoading(false);
      }
    },
    [showToast],
  );

  const handleConfirmReceivePO = useCallback(
    async ({
      receiptNo,
      receivedBy,
      expiryDates,
    }: {
      receiptNo: string;
      receivedBy: string;
      expiryDates: Record<number, string>;
    }) => {
      if (!receivingOrder) return;
      setPoLoading(true);
      try {
        const updated = await api.po.markReceived(
          receivingOrder.id,
          receiptNo,
          receivedBy,
          expiryDates,
        );
        setPoOrders((prev) =>
          prev.map((o) => (o.id === receivingOrder.id ? updated : o)),
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
    [fetchAll, receivingOrder, showToast],
  );

  const handlePOCreate = useCallback(
    async (
      po: Omit<PurchaseOrder, "id">,
      meta: { supplierId: number; itemNames: string[] },
    ) => {
      setPoLoading(true);
      try {
        const created = await api.po.create(po);
        setPoOrders((prev) => [created, ...prev]);
        const matchedSupplier = suppliers.find(
          (s) => s.supplier_id === meta.supplierId,
        );

        if (matchedSupplier) {
          const incomingNames = meta.itemNames;

          if (incomingNames.length > 0) {
            setSuppliers((prev) =>
              prev.map((s) =>
                s.supplier_id === matchedSupplier.supplier_id
                  ? {
                      ...s,
                      products_supplied: mergeSupplierProducts(
                        s.products_supplied ?? "",
                        incomingNames,
                      ),
                    }
                  : s,
              ),
            );
          }

          try {
            if (incomingNames.length > 0) {
              await api.mergeSupplierProducts(
                matchedSupplier.supplier_id,
                incomingNames,
              );
            }

            const refreshedSuppliers = await api.getSuppliers();
            setSuppliers(refreshedSuppliers);
          } catch (mergeErr) {
            console.error("Failed to merge supplier products:", mergeErr);
            showToast(
              "Purchase order saved, but supplier products did not sync.",
              "error",
            );
          }
        }

        showToast("Purchase order created.", "success");

        // Notify admin of new purchase order
        addNotification({
          id: crypto.randomUUID(),
          label: `New purchase order submitted: ${created.id}`,
          type: "success",
        });
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Failed to create purchase order.",
          "error",
        );
        throw err;
      } finally {
        setPoLoading(false);
      }
    },
    [showToast, suppliers],
  );

  // ── Stock Actions ─────────────────────────────────────────────────────────

  const handleSpoilageInputChange = (value: string) => {
    const maxAllowed = selectedSpoilageProduct?.dailyWithdrawn ?? 0;
    const numValue = parseFloat(value);
    if (!value || isNaN(numValue) || numValue <= maxAllowed) setAdjQty(value);
  };

  // ─── Withdrawal lifecycle ───────────────────────────────────────────────────
  async function doWithdraw(
    product_id: number,
    qty: number,
    type: WithdrawalType,
  ) {
    setSubmitting(true);
    try {
      // Initial or Supplementary: always deduct from storage first (FIFO)
      if (type === "initial") {
        const todayBatches = await kitchenApi.getTodayKitchenBatches();
        const existing = todayBatches
          .filter((b) => b.product_id === product_id && b.status === "active")
          .sort((a, b) => b.kitchen_batch_id - a.kitchen_batch_id)[0];

        if (existing) {
          throw new Error("Initial withdrawal already done today.");
        }

        const storageResult = await storageApi.withdrawFromStorage({
          product_id,
          qty_needed: qty,
          type: "initial",
        });
        const sourceBatchId = storageResult.batches_used[0]?.batch_id;

        // Initial: always create a fresh kitchen batch for today
        const kitchenBatch = await kitchenApi.createKitchenBatch({
          product_id,
          quantity: qty,
          type,
          recorded_by: "System",
          storage_batch_id: sourceBatchId,
        });
        showToast(
          `Initial withdrawal → Kitchen Batch #${kitchenBatch.kitchen_batch_id}`,
          "success",
        );
      } else if (type === "supplementary") {
        const todayBatches = await kitchenApi.getTodayKitchenBatches();
        const existing = todayBatches
          .filter((b) => b.product_id === product_id && b.status === "active")
          .sort((a, b) => b.kitchen_batch_id - a.kitchen_batch_id)[0];

        if (!existing) {
          throw new Error(
            "No initial withdrawal found for today. Please do an initial withdrawal first before adding a supplementary.",
          );
        }

        const storageResult = await storageApi.withdrawFromStorage({
          product_id,
          qty_needed: qty,
          type: "supplementary",
        });
        const sourceBatchId = storageResult.batches_used[0]?.batch_id;

        // Supplementary: find today's existing kitchen batch and add to it
        await kitchenApi.addSupplementary(existing.kitchen_batch_id, {
          qty,
          storage_batch_id: sourceBatchId,
        });
        showToast(
          `Added ${qty} to Kitchen Batch #${existing.kitchen_batch_id}`,
          "success",
        );
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Withdrawal failed",
        "error",
      );
      throw err;
    } finally {
      setSubmitting(false);
      await fetchAll();
    }
  }

  async function submitWithdrawal() {
    const qty = parseInt(wdQty);
    if (!qty || qty <= 0 || wdProductId === null) return;
    const product = products.find((p) => p.product_id === wdProductId);
    if (!product) return;
    if (qty > product.mainStock) {
      showToast(
        `Insufficient stock. Available: ${product.mainStock} ${product.unit}`,
        "error",
      );
      return;
    }
    try {
      await doWithdraw(wdProductId, qty, wdType);
      setWdQty("");
    } catch {
      // error already shown inside doWithdraw
    }
  }

  async function submitSpoilage() {
    const qty = parseFloat(adjQty);
    if (!selectedSpoilageProduct) return;
    if (!canRecordSpoilage) {
      showToast(validationMessage || "Invalid spoilage amount.", "error");
      return;
    }
    const product = selectedSpoilageProduct;
    setSubmitting(true);
    try {
      await api.postSpoilage({
        product_id: product.product_id,
        quantity: qty,
        recorded_by: null,
      });
      await fetchAll();
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
      setSupplierProductInput("");
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

  function addProductToSupplierForm(productName: string) {
    const trimmedProduct = productName.trim();
    if (!trimmedProduct) return;

    const existing = parseSupplierProducts(supplierForm.products_supplied);
    const exists = existing.some(
      (item) => item.toLowerCase() === trimmedProduct.toLowerCase(),
    );
    if (exists) {
      setSupplierProductInput("");
      return;
    }

    setSupplierForm((prev) => ({
      ...prev,
      products_supplied: [...existing, trimmedProduct].join(", "),
    }));
    setSupplierProductInput("");
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
    setSubmitting(true);
    try {
      const existing = products.find(
        (p) => p.product_name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        await api.postBatch({
          productId: existing.product_id,
          productName: existing.product_name,
          quantity: qty,
          unit: rawMaterialForm.unit,
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

  async function handleDashboardDeleteProduct(product: Product) {
    if (
      !window.confirm(
        `Delete ${product.product_name}? This removes it from stock records.`,
      )
    )
      return;
    try {
      await api.deleteProduct(product.product_id);
      setProducts((prev) =>
        prev.filter((p) => p.product_id !== product.product_id),
      );
      showToast(`${product.product_name} deleted.`, "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to delete item.",
        "error",
      );
    }
  }


  async function handleReturnKitchenBatch(batch: KitchenBatch) {
    if (nonReturnableProductIds.has(batch.product_id)) {
      showToast("Sauces and similar items cannot be returned.", "error");
      return;
    }
    try {
      await kitchenApi.returnUnused(batch.kitchen_batch_id);
      showToast("Unused portion returned to storage.", "success");
      await fetchAll();
    } catch (err) {
      if (
        err instanceof Error &&
        /no unused quantity left to return|return quantity exceeds unused amount/i.test(
          err.message,
        )
      ) {
        await fetchAll();
      }
      showToast(
        err instanceof Error ? err.message : "Failed to return batch.",
        "error",
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'); @keyframes fadeInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div
        style={{ fontFamily: "'Poppins', sans-serif" }}
        className="min-h-screen bg-[#f5f6fa]"
      >
        <Sidebar />

        {/* ── Header ── */}
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
                      : t.id === "purchase-history"
                        ? completedPOs.length
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
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${active ? "bg-white/20 text-white" : t.id === "withdrawal" ? "bg-amber-100 text-amber-700" : t.id === "purchases" ? "bg-yellow-100 text-yellow-700" : t.id === "purchase-history" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {tab === "dashboard" && !isLoading && (
            <div className="border-t border-slate-100 px-6 pb-4 pt-2">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {[
                  {
                    label: "Main Stock Levels",
                    target: "dashboard-main-stock",
                  },
                  {
                    label: "Last Inventory Updates",
                    target: "dashboard-last-updates",
                  },
                  {
                    label: "Record Spoilage",
                    target: "dashboard-record-spoilage",
                  },
                  {
                    label: "Stock Movement Report",
                    target: "dashboard-stock-movement",
                  },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={`#${item.target}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollDashboardTo(item.target);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          )}
          {tab === "withdrawal" && !isLoading && (
            <div className="border-t border-slate-100 px-6 pb-4 pt-2">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {[
                  {
                    label: "New Withdrawal Record",
                    target: "withdrawal-new-record",
                  },
                  {
                    label: "Kitchen Batch Queue",
                    target: "withdrawal-kitchen-queue",
                  },
                  {
                    label: "FIFO Withdrawal Preview",
                    target: "withdrawal-fifo-preview",
                  },
                  {
                    label: "Delivered batches",
                    target: "withdrawal-delivered-batches",
                  },
                  {
                    label: "Currently Withdrawn",
                    target: "withdrawal-currently-withdrawn",
                  },
                  {
                    label: "Kitchen Batches",
                    target: "withdrawal-kitchen-batches",
                  },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={`#${item.target}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollDashboardTo(item.target);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </header>

        <main className="bg-white border border-slate-100 overflow-hidden shadow-sm">
          {error && (
            <div className="mb-6">
              <ErrorBanner message={error} onRetry={fetchAll} />
            </div>
          )}
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <AnimatePresence mode="wait">
              {/* ── Dashboard ── */}
              {tab === "dashboard" && (
                <motion.div
                  key="dashboard"
                  id="dashboard-top"
                  variants={pageVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  ref={dashboardTopRef}
                >
                  <motion.div
                    variants={staggerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-6 pt-6"
                  >
                    <motion.div
                      variants={staggerVariants}
                      className="grid grid-cols-4 gap-4"
                    >
                      <KPICard
                        label="Total Products"
                        value={products.length.toString()}
                        sub="in inventory"
                        accent="slate"
                        onClick={() => setDashboardSummary("products")}
                      />
                      <KPICard
                        label="Withdrawn Today"
                        value={fmtInt(totalWithdrawn)}
                        sub="units pulled"
                        accent="indigo"
                        onClick={() => setDashboardSummary("withdrawn")}
                      />
                      <KPICard
                        label="Wasted Today"
                        value={fmtInt(totalWasted)}
                        sub="units spoiled"
                        accent="rose"
                        onClick={() => setDashboardSummary("wasted")}
                      />
                      <KPICard
                        label="Returned Today"
                        value={fmtInt(totalReturned)}
                        sub="units returned"
                        accent="emerald"
                        onClick={() => setDashboardSummary("returned")}
                      />
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

                    <div
                      id="dashboard-main-stock"
                      className="scroll-mt-44"
                      style={{ scrollMarginTop: "180px" }}
                    >
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
                            Add Material
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
                                "Action",
                              ].map((h) => (
                                <th
                                  key={h}
                                  className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${["Item", "Category"].includes(h) ? "text-left" : ["Status", "Action"].includes(h) ? "text-center" : "text-right"}`}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardFilteredProducts.map((p, i) => {
                              const status = getStockStatus(p);
                              const isOutOfStock = toNumber(p.mainStock) === 0;
                              const statusDotClass = isOutOfStock
                                ? "bg-slate-500"
                                : STATUS_DOT[status];
                              const statusBarClass = isOutOfStock
                                ? "bg-slate-500"
                                : STATUS_BAR[status];
                              const statusBadgeClass = isOutOfStock
                                ? "bg-slate-100 text-slate-700"
                                : STATUS_BADGE[status];
                              const statusLabel = isOutOfStock
                                ? "Out of Stock"
                                : status;
                              const pct = Math.min(
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
                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass}`}
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
                                  <td className="py-3.5 px-4 text-right">
                                    <ExpiryChip dateStr={p.expiryDate} />
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-emerald-500 font-medium">
                                    {p.returned}
                                  </td>
                                  <td className="py-3.5 px-4 w-32">
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                      <motion.div
                                        className={`h-full rounded-full ${statusBarClass}`}
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
                                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize ${statusBadgeClass}`}
                                    >
                                      {statusLabel}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    <button
                                      onClick={() =>
                                        handleDashboardDeleteProduct(p)
                                      }
                                      className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      title={`Delete ${p.product_name}`}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            {dashboardFilteredProducts.length === 0 && (
                              <tr>
                                <td
                                  colSpan={10}
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
                    </div>

                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div
                        id="dashboard-last-updates"
                        className="scroll-mt-44"
                        style={{ scrollMarginTop: "180px" }}
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
                      </div>
                      <div
                        id="dashboard-record-spoilage"
                        className="scroll-mt-44"
                        style={{ scrollMarginTop: "180px" }}
                      >
                        <SectionCard
                          title="Record Spoilage"
                          subtitle="Limited to today's withdrawn amount"
                        >
                          <div className="p-5 space-y-4">
                            <FormField label="Select Item">
                              <StyledSelect
                                value={adjProductId ?? ""}
                                onChange={(v) => setAdjProductId(Number(v))}
                              >
                                {products.map((p) => (
                                  <option
                                    key={p.product_id}
                                    value={p.product_id}
                                  >
                                    {p.product_name} ({fmtInt(p.dailyWithdrawn)}{" "}
                                    {p.unit} withdrawn today)
                                  </option>
                                ))}
                              </StyledSelect>
                            </FormField>

                            {selectedSpoilageProduct && (
                              <div className="space-y-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold text-rose-700">
                                    Available for spoilage:{" "}
                                    <span className="font-bold">
                                      {fmtInt(
                                        selectedSpoilageProduct.dailyWithdrawn,
                                      )}{" "}
                                      {selectedSpoilageProduct.unit}
                                    </span>
                                  </p>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                      selectedSpoilageProduct.dailyWithdrawn ===
                                      0
                                        ? "bg-rose-100 text-rose-500"
                                        : "bg-amber-100 text-amber-600"
                                    }`}
                                  >
                                    {selectedSpoilageProduct.dailyWithdrawn ===
                                    0
                                      ? "NO WITHDRAWAL"
                                      : "OK"}
                                  </span>
                                </div>

                                {selectedSpoilageProduct.dailyWithdrawn ===
                                  0 && (
                                  <p className="text-xs text-rose-500">
                                    ⚠️ No stock was withdrawn today. Cannot
                                    record spoilage.
                                  </p>
                                )}
                              </div>
                            )}

                            <FormField label="Spoilage Amount">
                              <div className="relative">
                                <StyledInput
                                  type="number"
                                  value={adjQty}
                                  onChange={handleSpoilageInputChange}
                                  placeholder="0"
                                />
                                {selectedSpoilageProduct && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAdjQty(
                                        fmtInt(
                                          selectedSpoilageProduct.dailyWithdrawn,
                                        ),
                                      )
                                    }
                                    disabled={
                                      selectedSpoilageProduct.dailyWithdrawn ===
                                      0
                                    }
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Max (
                                    {fmtInt(
                                      selectedSpoilageProduct.dailyWithdrawn,
                                    )}
                                    )
                                  </button>
                                )}
                              </div>
                              {validationMessage && (
                                <p className="mt-2 text-xs text-slate-500">
                                  {validationMessage}
                                </p>
                              )}
                            </FormField>

                            <Btn
                              onClick={submitSpoilage}
                              variant="danger"
                              loading={submitting}
                              disabled={!canRecordSpoilage}
                            >
                              {submitting ? "Recording..." : "Record Spoilage"}
                            </Btn>
                          </div>
                        </SectionCard>
                      </div>
                    </motion.div>

                    {/* ── Stock Movement Report ── */}
                    <div
                      id="dashboard-stock-movement"
                      className="scroll-mt-44"
                      style={{ scrollMarginTop: "180px" }}
                    >
                      <motion.div variants={itemVariants}>
                        <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            Stock Movement Report
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Summarizes received, withdrawn, wasted, and returned
                            per item
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                            {(["weekly", "monthly"] as const).map((p) => (
                              <button
                                key={p}
                                onClick={() => setReportPeriod(p)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${reportPeriod === p ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                          {reportPeriod === "weekly" ? (
                            <input
                              type="date"
                              value={selectedWeekStart}
                              onChange={(e) =>
                                setSelectedWeekStart(e.target.value)
                              }
                              className={inputCls + " !w-40"}
                            />
                          ) : (
                            <div className="flex gap-2">
                              <select
                                value={selectedMonth}
                                onChange={(e) =>
                                  setSelectedMonth(Number(e.target.value))
                                }
                                className={inputCls + " !w-32"}
                              >
                                {Array.from({ length: 12 }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    {new Date(2000, i).toLocaleString(
                                      "default",
                                      { month: "long" },
                                    )}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                value={selectedYear}
                                onChange={(e) =>
                                  setSelectedYear(Number(e.target.value))
                                }
                                className={inputCls + " !w-24"}
                                min={2020}
                                max={2099}
                              />
                            </div>
                          )}
                          <button
                            onClick={fetchReport}
                            disabled={reportLoading}
                            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60"
                          >
                            {reportLoading
                              ? "Generating..."
                              : "Generate Report"}
                          </button>
                          {reportData && (
                            <button
                              onClick={() => {
                                const headers = [
                                  "Product",
                                  "Category",
                                  "Unit",
                                  "Received",
                                  "Withdrawn",
                                  "Returned",
                                  "Wasted",
                                  "Remaining",
                                ];
                                const rows = reportData.items.map((i) =>
                                  [
                                    i.product_name,
                                    i.category,
                                    i.unit,
                                    i.received,
                                    i.withdrawn,
                                    i.returned,
                                    i.wasted,
                                    i.remaining,
                                  ].join(","),
                                );
                                const csv = [headers.join(","), ...rows].join(
                                  "\n",
                                );
                                const blob = new Blob([csv], {
                                  type: "text/csv",
                                });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `stock-report-${reportData.period}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                            >
                              Export CSV
                            </button>
                          )}
                        </div>
                        </div>
                      </motion.div>
                    </div>

                    <motion.div variants={itemVariants}>
                      {!reportData && !reportLoading && (
                        <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-sm">
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
                                d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          <p className="text-sm text-slate-400">
                            Select a period and click{" "}
                            <span className="font-semibold text-slate-600">
                              Generate Report
                            </span>{" "}
                            to view stock movement.
                          </p>
                        </div>
                      )}
                      {reportLoading && (
                        <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-sm animate-pulse">
                          <p className="text-sm text-slate-400">
                            Building your report...
                          </p>
                        </div>
                      )}
                      {reportData && !reportLoading && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-4 gap-4">
                            {[
                              {
                                label: "Total Received",
                                value: fmtInt(reportData.totalReceived),
                                accent: "border-t-emerald-400",
                                text: "text-emerald-600",
                              },
                              {
                                label: "Total Withdrawn",
                                value: fmtInt(reportData.totalWithdrawn),
                                accent: "border-t-indigo-400",
                                text: "text-indigo-600",
                              },
                              {
                                label: "Total Returned",
                                value: fmtInt(reportData.totalReturned),
                                accent: "border-t-amber-400",
                                text: "text-amber-600",
                              },
                              {
                                label: "Total Wasted",
                                value: fmtInt(reportData.totalWasted),
                                accent: "border-t-rose-400",
                                text: "text-rose-500",
                              },
                            ].map((k) => (
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
                                <p className="text-xs text-slate-400 mt-1">
                                  {reportData.period}
                                </p>
                              </div>
                            ))}
                          </div>
                          <SectionCard
                            title={`Stock Movement — ${reportData.period}`}
                            subtitle={`Generated ${new Date(reportData.generatedAt).toLocaleString()} · ${reportData.items.length} items`}
                          >
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  {[
                                    "Item",
                                    "Category",
                                    "Received",
                                    "Withdrawn",
                                    "Returned",
                                    "Wasted",
                                    "Remaining",
                                    "Efficiency",
                                  ].map((h) => (
                                    <th
                                      key={h}
                                      className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${["Item", "Category"].includes(h) ? "text-left" : "text-right"}`}
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {reportData.items.map((item, i) => {
                                  const efficiency =
                                    item.withdrawn > 0
                                      ? Math.round(
                                          ((item.withdrawn - item.wasted) /
                                            item.withdrawn) *
                                            100,
                                        )
                                      : 100;
                                  const effColor =
                                    efficiency >= 90
                                      ? "text-emerald-600 bg-emerald-50"
                                      : efficiency >= 70
                                        ? "text-amber-600 bg-amber-50"
                                        : "text-rose-500 bg-rose-50";
                                  return (
                                    <tr
                                      key={item.product_id}
                                      style={{
                                        opacity: 0,
                                        animation:
                                          "fadeInRow 0.28s ease forwards",
                                        animationDelay: `${i * 0.04}s`,
                                      }}
                                      className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                                    >
                                      <td className="py-3.5 px-4 font-medium text-slate-800">
                                        {item.product_name}
                                      </td>
                                      <td className="py-3.5 px-4">
                                        <span
                                          className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${getCategoryStyle(item.category)}`}
                                        >
                                          {item.category}
                                        </span>
                                      </td>
                                      {[
                                        {
                                          v: item.received,
                                          c: "text-emerald-600",
                                        },
                                        {
                                          v: item.withdrawn,
                                          c: "text-indigo-500",
                                        },
                                        {
                                          v: item.returned,
                                          c: "text-amber-500",
                                        },
                                        { v: item.wasted, c: "text-rose-500" },
                                        {
                                          v: item.remaining,
                                          c: "text-slate-700",
                                        },
                                      ].map(({ v, c }, ci) => (
                                        <td
                                          key={ci}
                                          className={`py-3.5 px-4 text-right font-semibold ${c}`}
                                        >
                                          {v}{" "}
                                          <span className="text-slate-400 font-normal text-xs">
                                            {item.unit}
                                          </span>
                                        </td>
                                      ))}
                                      <td className="py-3.5 px-4 text-right">
                                        <span
                                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${effColor}`}
                                        >
                                          {efficiency}%
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </SectionCard>
                        </div>
                      )}
                    </motion.div>

                  </motion.div>
                </motion.div>
              )}

              {/* ── Withdrawal ── */}
              {tab === "withdrawal" && (
                <motion.div
                  key="withdrawal"
                  id="withdrawal-top"
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
                      id="withdrawal-new-record"
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-6"
                      style={{ scrollMarginTop: "180px" }}
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
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                {
                                  key: "initial" as const,
                                  disabled: todayInitialExists,
                                  tooltip:
                                    "Initial withdrawal already done today.",
                                },
                                {
                                  key: "supplementary" as const,
                                  disabled: !todayInitialExists,
                                  tooltip: "Do an initial withdrawal first.",
                                },
                              ].map((option) => (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() =>
                                    !option.disabled && setWdType(option.key)
                                  }
                                  disabled={option.disabled}
                                  title={
                                    option.disabled ? option.tooltip : undefined
                                  }
                                  className={`py-2.5 text-xs font-semibold rounded-xl border capitalize transition-all duration-200 ${wdType === option.key ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-500 border-slate-200"} ${option.disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-300"}`}
                                >
                                  {option.key}
                                </button>
                              ))}
                            </div>
                          </FormField>
                          <div
                            className={`text-xs px-3 py-2 rounded-xl border ${wdType === "initial" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-sky-50 text-sky-600 border-sky-100"}`}
                          >
                            {wdType === "initial" &&
                              "Opening withdrawal for today — recorded as the initial pull."}
                            {wdType === "supplementary" &&
                              "Additional pull on top of the opening withdrawal."}
                          </div>
                          {wdType === "supplementary" &&
                            kitchenRemaining > 0 &&
                            selectedWithdrawalProduct && (
                              <div className="text-xs px-3 py-2 rounded-xl border bg-amber-50 text-amber-700 border-amber-200">
                                Warning: Kitchen still has {kitchenRemaining}{" "}
                                {selectedWithdrawalProduct.unit} remaining for
                                this product. Are you sure you need a
                                supplementary withdrawal?
                              </div>
                            )}
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
                              {otherMainStockProducts.length > 0 && (
                                <optgroup label="── Other Items ──">
                                  {otherMainStockProducts.map((p) => (
                                      <option
                                        key={p.product_id}
                                        value={p.product_id}
                                      >
                                        {p.product_name} ({p.mainStock} {p.unit})
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
                              : wdType === "initial"
                                ? "Submit Opening Withdrawal"
                                : "Submit Withdrawal"}
                          </Btn>
                        </div>
                      </SectionCard>
                      <SectionCard
                        title="Today's Withdrawal Log"
                        subtitle={`${visibleWithdrawalLogs.length} entries`}
                      >
                        {visibleWithdrawalLogs.length === 0 ? (
                          <EmptyState message="No withdrawals recorded today." />
                        ) : (
                          <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                            <AnimatePresence>
                              {visibleWithdrawalLogs.map((w) => (
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
                    {selectedKitchenBatches.length > 0 && (
                      <motion.div
                        id="withdrawal-kitchen-queue"
                        variants={itemVariants}
                        style={{ scrollMarginTop: "180px" }}
                      >
                        <SectionCard
                          title="Kitchen Batch Queue"
                          subtitle="Shows batches currently withdrawn to kitchen."
                        >
                          <div className="p-4">
                            <KitchenBatchQueuePreview
                              batches={selectedKitchenBatches}
                              unit={selectedWithdrawalProduct?.unit ?? ""}
                            />
                          </div>
                        </SectionCard>
                      </motion.div>
                    )}
                    {selectedWithdrawalProduct && (
                      <motion.div
                        id="withdrawal-fifo-preview"
                        variants={itemVariants}
                        style={{ scrollMarginTop: "180px" }}
                      >
                        <SectionCard
                          title="FIFO Withdrawal Preview"
                          subtitle="For the selected item only"
                        >
                          <div className="p-4 space-y-4">
                            <div
                              className={`rounded-xl border px-4 py-3 text-sm ${
                                latestKitchenBatch
                                  ? kitchenRemaining === 0
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : "bg-emerald-50 border-emerald-200 text-emerald-700"
                                  : "bg-slate-50 border-slate-200 text-slate-600"
                              }`}
                            >
                              {latestKitchenBatch ? (
                                kitchenRemaining === 0 ? (
                                  <p className="font-medium">
                                    Kitchen Batch #
                                    {latestKitchenBatch.kitchen_batch_id} -{" "}
                                    {latestKitchenBatch.withdrawn_qty}{" "}
                                    {selectedWithdrawalProduct.unit} withdrawn
                                    {" · "}
                                    {latestKitchenBatch.used_qty}{" "}
                                    {selectedWithdrawalProduct.unit} used
                                    {" · "}
                                    {latestKitchenBatch.returned_qty}{" "}
                                    {selectedWithdrawalProduct.unit} returned
                                    {" → "}
                                    {Math.max(
                                      0,
                                      latestKitchenBatch.withdrawn_qty -
                                        latestKitchenBatch.used_qty -
                                        latestKitchenBatch.returned_qty,
                                    )}{" "}
                                    {selectedWithdrawalProduct.unit} remaining
                                    in kitchen. Kitchen stock depleted -
                                    supplementary needed.
                                  </p>
                                ) : (
                                  <p className="font-medium">
                                    Kitchen Batch #
                                    {latestKitchenBatch.kitchen_batch_id} -{" "}
                                    {latestKitchenBatch.withdrawn_qty}{" "}
                                    {selectedWithdrawalProduct.unit} withdrawn
                                    {" · "}
                                    {latestKitchenBatch.used_qty}{" "}
                                    {selectedWithdrawalProduct.unit} used
                                    {" · "}
                                    {latestKitchenBatch.returned_qty}{" "}
                                    {selectedWithdrawalProduct.unit} returned
                                    {" → "}
                                    {Math.max(
                                      0,
                                      latestKitchenBatch.withdrawn_qty -
                                        latestKitchenBatch.used_qty -
                                        latestKitchenBatch.returned_qty,
                                    )}{" "}
                                    {selectedWithdrawalProduct.unit} remaining
                                    in kitchen
                                  </p>
                                )
                              ) : (
                                <p className="font-medium">
                                  No kitchen batch yet today - do an initial
                                  withdrawal.
                                </p>
                              )}
                            </div>
                            <FIFOBatchPreview
                              batches={selectedProductBatches}
                              qtyNeeded={Number(wdQty) || 0}
                              unit={selectedWithdrawalProduct.unit}
                            />
                          </div>
                        </SectionCard>
                      </motion.div>
                    )}
                    <motion.div
                      id="withdrawal-delivered-batches"
                      variants={itemVariants}
                      style={{ scrollMarginTop: "180px" }}
                    >
                      <SectionCard
                        title="Delivered batches"
                        subtitle="Grouped by received date"
                      >
                        <div className="p-4">
                          <FIFOBatchGrouped
                            allBatches={activeBatches}
                            productMap={productMap}
                          />
                        </div>
                      </SectionCard>
                    </motion.div>
                    <motion.div
                      id="withdrawal-currently-withdrawn"
                      variants={itemVariants}
                      style={{ scrollMarginTop: "180px" }}
                    >
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
                    <motion.div
                      id="withdrawal-kitchen-batches"
                      variants={itemVariants}
                      style={{ scrollMarginTop: "180px" }}
                    >
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="p-4">
                          <KitchenBatchesSection
                            kitchenBatches={visibleKitchenBatches}
                            nonReturnableProductIds={nonReturnableProductIds}
                            onReturn={handleReturnKitchenBatch}
                          />
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {/* ── Alerts ── */}
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
                      className="grid grid-cols-3 gap-4"
                    >
                      <div className="bg-white rounded-2xl p-5 border border-t-4 border-slate-400 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">
                          Out of Stock
                        </p>
                        <p className="text-3xl font-bold text-slate-700 mt-1">
                          {outOfStockItems.length}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl p-5 border border-t-4 border-red-300 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">
                          Critical Items
                        </p>
                        <p className="text-3xl font-bold text-red-500 mt-1">
                          {alertCriticalStock.length}
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
                    {lowStock.length === 0 &&
                    alertCriticalStock.length === 0 &&
                    outOfStockItems.length === 0 ? (
                      <motion.div variants={itemVariants}>
                        <EmptyState message="All stock levels are within safe range." />
                      </motion.div>
                    ) : (
                      [
                        {
                          items: outOfStockItems,
                          label: "Out of Stock",
                          color: "slate",
                          severity: "out" as const,
                        },
                        {
                          items: alertCriticalStock,
                          label: "Critical",
                          color: "red",
                          severity: "critical" as const,
                        },
                        {
                          items: lowStock,
                          label: "Warning",
                          color: "amber",
                          severity: "low" as const,
                        },
                      ].map(({ items, label, color, severity }) =>
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
                              const status = getStockStatus(p);
                              const deficit = Math.round(
                                p.reorderPoint - p.mainStock,
                              );
                              return (
                                <motion.div
                                  key={p.inventory_id}
                                  variants={itemVariants}
                                  transition={{ delay: i * 0.06 }}
                                  className={`bg-white rounded-2xl border border-t-4 p-5 flex items-center justify-between shadow-sm mb-3 ${severity === "out" ? "border-slate-200 border-t-slate-400" : status === "critical" ? "border-red-200 border-t-red-400" : "border-amber-200 border-t-amber-400"}`}
                                >
                                  <div className="flex items-center gap-4">
                                    <div
                                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${severity === "out" ? "bg-slate-100" : status === "critical" ? "bg-red-50" : "bg-amber-50"}`}
                                    >
                                      <span
                                        className={`text-sm font-bold ${severity === "out" ? "text-slate-600" : status === "critical" ? "text-red-500" : "text-amber-500"}`}
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
                                        className={`text-xs font-medium mt-1 ${severity === "out" ? "text-slate-600" : status === "critical" ? "text-red-500" : "text-amber-500"}`}
                                      >
                                        {severity === "out"
                                          ? `No stock left. Need ${Math.max(0, deficit)} ${p.unit} to reach reorder point`
                                          : deficit > 0
                                            ? `Need ${deficit} ${p.unit} to reach reorder point`
                                            : "Below critical threshold"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      <p
                                        className={`text-2xl font-bold ${severity === "out" ? "text-slate-700" : status === "critical" ? "text-red-500" : "text-amber-500"}`}
                                      >
                                        {p.mainStock}{" "}
                                        <span className="text-sm font-normal text-slate-400">
                                          {p.unit}
                                        </span>
                                      </p>
                                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                        <span>Reorder:</span>
                                        <input
                                          type="number"
                                          defaultValue={p.reorderPoint}
                                          className="w-16 border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                                          onBlur={(e) => {
                                            const val = Number(e.target.value);
                                            if (
                                              val > 0 &&
                                              val !== p.reorderPoint
                                            )
                                              api
                                                .updateStock(p.inventory_id, {
                                                  stock: p.mainStock,
                                                  reorderPoint: val,
                                                  criticalPoint:
                                                    p.criticalPoint,
                                                })
                                                .then(fetchAll);
                                          }}
                                        />
                                        <span>Critical:</span>
                                        <input
                                          type="number"
                                          defaultValue={p.criticalPoint}
                                          className="w-16 border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                                          onBlur={(e) => {
                                            const val = Number(e.target.value);
                                            if (
                                              val > 0 &&
                                              val !== p.criticalPoint
                                            )
                                              api
                                                .updateStock(p.inventory_id, {
                                                  stock: p.mainStock,
                                                  reorderPoint: p.reorderPoint,
                                                  criticalPoint: val,
                                                })
                                                .then(fetchAll);
                                          }}
                                        />
                                      </div>
                                      <span
                                        className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${severity === "out" ? "bg-slate-100 text-slate-700" : STATUS_BADGE[status]}`}
                                      >
                                        {severity === "out"
                                          ? "Out of Stock"
                                          : status === "critical"
                                            ? "Restock Now"
                                            : "Reorder Soon"}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setTab("purchases");
                                        handleOrderNow(p);
                                      }}
                                      className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-sm ${severity === "out" ? "bg-slate-700 hover:bg-slate-800 shadow-slate-500/25" : status === "critical" ? "bg-red-500 hover:bg-red-600 shadow-red-500/25" : "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25"}`}
                                    >
                                      <CartIcon />
                                      Order Now
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        ) : null,
                      )
                    )}
                  </motion.div>
                </motion.div>
              )}

              {/* ── Suppliers ── */}
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
                        onClick={() =>
                          setShowSupplierForm((f) => {
                            const next = !f;
                            if (!next) setSupplierProductInput("");
                            return next;
                          })
                        }
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
                              <div className="col-span-3">
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                  Supplied Products
                                  <span className="ml-1 text-slate-400 font-normal">
                                    (optional — will auto-update from POs)
                                  </span>
                                </label>
                                <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50 min-h-[48px]">
                                  {parseSupplierProducts(
                                    supplierForm.products_supplied,
                                  ).map((p) => (
                                    <span
                                      key={p}
                                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700"
                                    >
                                      {p}
                                      <button
                                        onClick={() => {
                                          const updated = parseSupplierProducts(
                                            supplierForm.products_supplied,
                                          )
                                            .filter((x) => x !== p)
                                            .join(", ");
                                          setSupplierForm((prev) => ({
                                            ...prev,
                                            products_supplied: updated,
                                          }));
                                        }}
                                        className="text-slate-300 hover:text-red-400 transition-colors ml-0.5"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                  <div className="relative min-w-[220px] flex-1">
                                    <input
                                      type="text"
                                      value={supplierProductInput}
                                      onChange={(e) =>
                                        setSupplierProductInput(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          addProductToSupplierForm(
                                            supplierProductInput,
                                          );
                                        }
                                      }}
                                      placeholder="Search or type item name"
                                      className="w-full text-xs text-slate-700 bg-transparent border-none outline-none placeholder:text-slate-400"
                                    />
                                    {supplierProductSuggestions.length > 0 && (
                                      <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-slate-200 bg-white shadow-lg z-10 overflow-hidden">
                                        {supplierProductSuggestions.map(
                                          (product) => (
                                            <button
                                              key={product.product_id}
                                              type="button"
                                              onClick={() =>
                                                addProductToSupplierForm(
                                                  product.product_name,
                                                )
                                              }
                                              className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                                            >
                                              {product.product_name}
                                            </button>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                  Search existing products as you type, or press
                                  Enter to add a custom item. Products will also
                                  be added automatically when you create POs for
                                  this supplier.
                                </p>
                              </div>
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
                                <td className="py-3.5 px-4">
                                  {parseSupplierProducts(s.products_supplied)
                                    .length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {parseSupplierProducts(
                                        s.products_supplied,
                                      ).map((p) => (
                                        <span
                                          key={p}
                                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                                        >
                                          {p}
                                          <button
                                            onClick={async () => {
                                              if (!s.supplier_id) return;
                                              try {
                                                const updated =
                                                  await api.removeSupplierProduct(
                                                    s.supplier_id,
                                                    p,
                                                  );
                                                setSuppliers((prev) =>
                                                  prev.map((sup) =>
                                                    sup.supplier_id ===
                                                    s.supplier_id
                                                      ? updated
                                                      : sup,
                                                  ),
                                                );
                                                showToast(
                                                  `Removed ${p} from ${s.supplier_name}.`,
                                                  "success",
                                                );
                                              } catch (err) {
                                                showToast(
                                                  "Failed to remove product.",
                                                  "error",
                                                );
                                              }
                                            }}
                                            className="text-slate-300 hover:text-red-400 transition-colors ml-0.5"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-300 italic">
                                      No products yet
                                    </span>
                                  )}
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

                    {/* Supplier History */}
                    <motion.div variants={itemVariants}>
                      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">
                              Supplier Activity History
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Log of all supplier-related actions and changes
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={historySearch}
                              onChange={(e) => setHistorySearch(e.target.value)}
                              placeholder="Search history..."
                              className="w-52 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                            <input
                              type="date"
                              value={historyDateFrom}
                              onChange={(e) =>
                                setHistoryDateFrom(e.target.value)
                              }
                              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                            <input
                              type="date"
                              value={historyDateTo}
                              onChange={(e) => setHistoryDateTo(e.target.value)}
                              className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                            <button
                              onClick={fetchSupplierHistory}
                              disabled={historyLoading}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <svg
                                className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                              </svg>
                              Refresh
                            </button>
                          </div>
                        </div>
                        {historyLoading ? (
                          <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
                            Loading history…
                          </div>
                        ) : filteredHistory.length === 0 ? (
                          <EmptyState
                            message={
                              historySearch || historyDateFrom || historyDateTo
                                ? "No history matches your filters."
                                : "No supplier activity recorded yet."
                            }
                          />
                        ) : (
                          <>
                            <div className="hidden lg:grid grid-cols-[1.2fr_2fr_2.5fr_1.8fr_2fr] px-5 py-3 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                              <span>Date & Time</span>
                              <span>Supplier</span>
                              <span>Action</span>
                              <span>Performed By</span>
                              <span>Details</span>
                            </div>
                            <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
                              {filteredHistory.map((h, i) => {
                                const al = h.action.toLowerCase();
                                const isAdd =
                                  al.includes("add") ||
                                  al.includes("creat") ||
                                  al.includes("new");
                                const isRemove =
                                  al.includes("remov") ||
                                  al.includes("delet") ||
                                  al.includes("cancel");
                                const isUpdate =
                                  al.includes("updat") ||
                                  al.includes("edit") ||
                                  al.includes("modif") ||
                                  al.includes("chang");
                                const actionStyle = isRemove
                                  ? "bg-red-50 text-red-600 border-red-100"
                                  : isAdd
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : isUpdate
                                      ? "bg-blue-50 text-blue-600 border-blue-100"
                                      : "bg-slate-50 text-slate-500 border-slate-100";
                                const dot = isRemove
                                  ? "bg-red-400"
                                  : isAdd
                                    ? "bg-emerald-400"
                                    : isUpdate
                                      ? "bg-blue-400"
                                      : "bg-slate-300";
                                const dt = new Date(h.created_at);
                                const dateStr = isNaN(dt.getTime())
                                  ? h.created_at
                                  : dt.toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    });
                                const timeStr = isNaN(dt.getTime())
                                  ? ""
                                  : dt.toLocaleTimeString(undefined, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    });
                                return (
                                  <div
                                    key={h.history_id}
                                    style={{
                                      opacity: 0,
                                      animation:
                                        "fadeInRow 0.28s ease forwards",
                                      animationDelay: `${i * 0.03}s`,
                                    }}
                                    className="hidden lg:grid grid-cols-[1.2fr_2fr_2.5fr_1.8fr_2fr] px-5 py-3.5 hover:bg-slate-50/70 transition-colors items-center"
                                  >
                                    <div>
                                      <p className="text-xs font-medium text-slate-700">
                                        {dateStr}
                                      </p>
                                      {timeStr && (
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                          {timeStr}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`}
                                      />
                                      <p className="text-sm font-semibold text-slate-800 truncate">
                                        {h.supplier_name}
                                      </p>
                                    </div>
                                    <span
                                      className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${actionStyle}`}
                                    >
                                      {h.action}
                                    </span>
                                    <p className="text-xs text-slate-500">
                                      {h.performed_by ?? (
                                        <span className="text-slate-300 italic">
                                          System
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-slate-400 truncate">
                                      {h.details ?? "—"}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between">
                              <p className="text-[11px] text-slate-400">
                                {filteredHistory.length} record
                                {filteredHistory.length !== 1 ? "s" : ""}
                                {(historySearch ||
                                  historyDateFrom ||
                                  historyDateTo) &&
                                  " matching your filters"}
                              </p>
                              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                                {[
                                  { dot: "bg-emerald-400", label: "Added" },
                                  { dot: "bg-blue-400", label: "Updated" },
                                  { dot: "bg-red-400", label: "Removed" },
                                ].map(({ dot, label }) => (
                                  <span
                                    key={label}
                                    className="flex items-center gap-1.5"
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full ${dot}`}
                                    />
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {/* ── Purchase Orders ── */}
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
                      {[
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
                          value: poOrders.filter((o) => o.status === "Ordered")
                            .length,
                          accent: "border-t-blue-400",
                          text: "text-blue-600",
                        },
                        {
                          label: "Received",
                          value: poOrders.filter((o) => o.status === "Received")
                            .length,
                          accent: "border-t-emerald-400",
                          text: "text-emerald-600",
                        },
                      ].map((k) => (
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
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex gap-2 flex-wrap">
                        {(
                          ["All", "Draft", "Ordered", "Cancelled"] as (
                            | POStatus
                            | "All"
                          )[]
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

                    {/* Quick Order All Products */}
                    <motion.div variants={itemVariants}>
                      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-50">
                          <p className="font-semibold text-slate-800 text-sm">
                            Quick Order — All Products
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Place a PO for any product, regardless of stock
                            level
                          </p>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {products
                            .filter((p) => !isMenuFoodProduct(p))
                            .map((p, i) => {
                              const status = getStockStatus(p);
                              const pct = Math.min(
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
                                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors"
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
                                  <div className="w-full sm:w-28 sm:text-right">
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
                                    className="w-full sm:w-auto sm:flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all duration-150"
                                  >
                                    <CartIcon />
                                    Order
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

                    {/* PO List */}
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
                        <div className="hidden lg:grid grid-cols-[2fr_3fr_2fr_2fr_2fr_1.5fr_auto] px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          <span>PO No.</span>
                          <span>Supplier</span>
                          <span>Order Date</span>
                          <span>Delivery</span>
                          <span>Total</span>
                          <span>Status</span>
                          <span className="text-right">Action</span>
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
                              <div key={order.id}>
                                <div className="hidden lg:grid grid-cols-[2fr_3fr_2fr_2fr_2fr_1.5fr_auto] px-5 py-4 transition-colors items-center hover:bg-slate-50/70">
                                  <button
                                    onClick={() => setSelectedOrder(order)}
                                    className="contents text-left"
                                  >
                                    <span className="text-sm font-semibold text-slate-800">
                                      {order.id}
                                    </span>
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">
                                        {order.supplier}
                                      </p>
                                      <p className="text-xs text-slate-400">
                                        {order.items.length} item
                                        {order.items.length !== 1 ? "s" : ""}
                                      </p>
                                    </div>
                                    <span className="text-sm text-slate-500">
                                      {order.date}
                                    </span>
                                    <span className="text-sm text-slate-500">
                                      {order.deliveryDate}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-800">
                                      ₱
                                      {(
                                        calcPOTotal(order.items) * 1.12
                                      ).toLocaleString(undefined, {
                                        maximumFractionDigits: 0,
                                      })}
                                    </span>
                                    <span>
                                      <POBadge status={order.status} />
                                    </span>
                                  </button>
                                  <div className="flex justify-end">
                                    {order.status === "Draft" ||
                                    order.status === "Ordered" ? (
                                      <button
                                        onClick={() => handlePODelete(order.id)}
                                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                        title="Cancel order"
                                      >
                                        <TrashIcon />
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-300">
                                        -
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <motion.div
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: i * 0.04 }}
                                  onClick={() => setSelectedOrder(order)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSelectedOrder(order);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className="lg:hidden w-full text-left px-4 py-3 transition-colors hover:bg-slate-50/70"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-800 truncate">
                                        {order.id}
                                      </p>
                                      <p className="text-xs text-slate-500 truncate">
                                        {order.supplier}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {(order.status === "Draft" ||
                                        order.status === "Ordered") && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handlePODelete(order.id);
                                          }}
                                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                          title="Cancel order"
                                        >
                                          <TrashIcon />
                                        </button>
                                      )}
                                      <POBadge status={order.status} />
                                    </div>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                                    <span>Order: {order.date}</span>
                                    <span>Delivery: {order.deliveryDate}</span>
                                    <span className="font-semibold text-slate-700">
                                      ₱
                                      {(
                                        calcPOTotal(order.items) * 1.12
                                      ).toLocaleString(undefined, {
                                        maximumFractionDigits: 0,
                                      })}
                                    </span>
                                  </div>
                                </motion.div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
              {tab === "purchase-history" && (
                <motion.div
                  key="purchase-history"
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
                      className="grid grid-cols-1 md:grid-cols-3 gap-4"
                    >
                      {[
                        {
                          label: "Completed Orders",
                          value: filteredCompletedPOs.length,
                          accent: "border-t-emerald-400",
                          text: "text-emerald-600",
                        },
                        {
                          label: "Received Today",
                          value: filteredCompletedPOs.filter(
                            (o) =>
                              o.receivedDate ===
                              new Date().toISOString().split("T")[0],
                          ).length,
                          accent: "border-t-sky-400",
                          text: "text-sky-600",
                        },
                        {
                          label: "With Receipt Logged",
                          value: filteredCompletedPOs.filter(
                            (o) => !!o.receiptNo,
                          ).length,
                          accent: "border-t-slate-800",
                          text: "text-slate-700",
                        },
                      ].map((k) => (
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
                    <motion.div variants={itemVariants}>
                      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">
                              Purchase Order History
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Completed purchase orders only
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-400">from</span>
                            <button
                              type="button"
                              onClick={() => {
                                const input = poHistoryFromInputRef.current as
                                  | (HTMLInputElement & {
                                      showPicker?: () => void;
                                    })
                                  | null;
                                input?.showPicker?.();
                                input?.focus();
                              }}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${poHistoryDateFrom ? "border-slate-900 text-slate-900 bg-slate-900/5" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white"}`}
                            >
                              {fmtFilterDate(poHistoryDateFrom)}
                            </button>
                            <span className="text-sm text-slate-400">to</span>
                            <button
                              type="button"
                              onClick={() => {
                                const input = poHistoryToInputRef.current as
                                  | (HTMLInputElement & {
                                      showPicker?: () => void;
                                    })
                                  | null;
                                input?.showPicker?.();
                                input?.focus();
                              }}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${poHistoryDateTo ? "border-slate-900 text-slate-900 bg-slate-900/5" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white"}`}
                            >
                              {fmtFilterDate(poHistoryDateTo)}
                            </button>
                            {(poHistoryDateFrom || poHistoryDateTo) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPoHistoryDateFrom("");
                                  setPoHistoryDateTo("");
                                }}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                                title="Clear date range"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            )}
                            <input
                              ref={poHistoryFromInputRef}
                              type="date"
                              value={poHistoryDateFrom}
                              onChange={(e) => {
                                const next = e.target.value;
                                setPoHistoryDateFrom(next);
                                if (
                                  poHistoryDateTo &&
                                  next &&
                                  next > poHistoryDateTo
                                ) {
                                  setPoHistoryDateTo(next);
                                }
                              }}
                              className="sr-only"
                              tabIndex={-1}
                              aria-hidden="true"
                            />
                            <input
                              ref={poHistoryToInputRef}
                              type="date"
                              value={poHistoryDateTo}
                              onChange={(e) => {
                                const next = e.target.value;
                                setPoHistoryDateTo(next);
                                if (
                                  poHistoryDateFrom &&
                                  next &&
                                  next < poHistoryDateFrom
                                ) {
                                  setPoHistoryDateFrom(next);
                                }
                              }}
                              className="sr-only"
                              tabIndex={-1}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                        <div className="hidden lg:grid grid-cols-[1.5fr_2fr_1.5fr_1.5fr_1.5fr_1.5fr_auto] px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          <span>PO No.</span>
                          <span>Supplier</span>
                          <span>Receipt</span>
                          <span>Received By</span>
                          <span>Received On</span>
                          <span>Total</span>
                          <span className="text-right">Status</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {poLoading ? (
                            <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
                              Loading purchase order history…
                            </div>
                          ) : filteredCompletedPOs.length === 0 ? (
                            <EmptyState
                              message={
                                poHistoryDateFrom || poHistoryDateTo
                                  ? "No completed purchase orders match this date range."
                                  : "No completed purchase orders found."
                              }
                            />
                          ) : (
                            paginatedCompletedPOs.map((order, i) => (
                              <div key={order.id}>
                                <div className="hidden lg:grid grid-cols-[1.5fr_2fr_1.5fr_1.5fr_1.5fr_1.5fr_auto] px-5 py-4 transition-colors items-center hover:bg-slate-50/70">
                                  <button
                                    onClick={() => setSelectedOrder(order)}
                                    className="contents text-left"
                                  >
                                    <span className="text-sm font-semibold text-slate-800">
                                      {order.id}
                                    </span>
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">
                                        {order.supplier}
                                      </p>
                                      <p className="text-xs text-slate-400">
                                        {order.items.length} item
                                        {order.items.length !== 1 ? "s" : ""}
                                      </p>
                                    </div>
                                  </button>
                                  <div>
                                    {order.status === "Received" ? (
                                      <button
                                        onClick={() => setReceiptOrder(order)}
                                        className="px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 transition-colors"
                                      >
                                        View Receipt
                                      </button>
                                    ) : (
                                      <span className="text-sm text-slate-500">
                                        {order.receiptNo || "-"}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setSelectedOrder(order)}
                                    className="contents text-left"
                                  >
                                    <span className="text-sm text-slate-500">
                                      {order.receivedBy || "-"}
                                    </span>
                                    <span className="text-sm text-slate-500">
                                      {order.receivedDate
                                        ? fmtReceivedDate(order.receivedDate)
                                        : "-"}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-800">
                                      ₱
                                      {(
                                        calcPOTotal(order.items) * 1.12
                                      ).toLocaleString(undefined, {
                                        maximumFractionDigits: 0,
                                      })}
                                    </span>
                                    <span className="flex justify-end">
                                      <POBadge status={order.status} />
                                    </span>
                                  </button>
                                </div>
                                <motion.div
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ delay: i * 0.04 }}
                                  onClick={() => setSelectedOrder(order)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSelectedOrder(order);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className="lg:hidden w-full text-left px-4 py-3 transition-colors hover:bg-slate-50/70"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-800 truncate">
                                        {order.id}
                                      </p>
                                      <p className="text-xs text-slate-500 truncate">
                                        {order.supplier}
                                      </p>
                                    </div>
                                    <POBadge status={order.status} />
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                                    <span>
                                      Receipt: {order.receiptNo || "-"}
                                    </span>
                                    <span>
                                      Received by: {order.receivedBy || "-"}
                                    </span>
                                    <span>
                                      Date:{" "}
                                      {order.receivedDate
                                        ? fmtReceivedDate(order.receivedDate)
                                        : "-"}
                                    </span>
                                    <span className="font-semibold text-slate-700">
                                      ₱
                                      {(
                                        calcPOTotal(order.items) * 1.12
                                      ).toLocaleString(undefined, {
                                        maximumFractionDigits: 0,
                                      })}
                                    </span>
                                  </div>
                                </motion.div>
                              </div>
                            ))
                          )}
                        </div>
                        {!poLoading && filteredCompletedPOs.length > 0 && (
                          <div className="px-5 py-3 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-[11px] text-slate-400">
                              Showing{" "}
                              {(poHistoryPage - 1) * PO_HISTORY_PAGE_SIZE + 1}-
                              {Math.min(
                                poHistoryPage * PO_HISTORY_PAGE_SIZE,
                                filteredCompletedPOs.length,
                              )}{" "}
                              of {filteredCompletedPOs.length} completed order
                              {filteredCompletedPOs.length !== 1 ? "s" : ""}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setPoHistoryPage((page) =>
                                    Math.max(1, page - 1),
                                  )
                                }
                                disabled={poHistoryPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                Previous
                              </button>
                              <div className="flex items-center gap-1">
                                {Array.from(
                                  { length: poHistoryTotalPages },
                                  (_, index) => index + 1,
                                ).map((page) => (
                                  <button
                                    key={page}
                                    type="button"
                                    onClick={() => setPoHistoryPage(page)}
                                    className={`h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition-colors ${
                                      poHistoryPage === page
                                        ? "bg-slate-900 text-white"
                                        : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                                    }`}
                                  >
                                    {page}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setPoHistoryPage((page) =>
                                    Math.min(poHistoryTotalPages, page + 1),
                                  )
                                }
                                disabled={poHistoryPage === poHistoryTotalPages}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>

        <AnimatePresence>
          {(tab === "dashboard" || tab === "withdrawal") &&
            showDashboardBackToTop &&
            !isLoading && (
            <motion.button
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.92 }}
              transition={{ duration: 0.2 }}
              onClick={() =>
                scrollDashboardTo(
                  tab === "withdrawal" ? "withdrawal-top" : "dashboard-top",
                )
              }
              className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors hover:bg-slate-800"
              aria-label="Back to top"
              title="Back to top"
            >
              <span className="text-xl leading-none">↑</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Overlays ── */}
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
                onDelete={handlePODelete}
              />
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {receiptOrder && (
            <POReceiptModal
              order={receiptOrder}
              onClose={() => setReceiptOrder(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {receivingOrder && (
            <ReceivePOModal
              order={receivingOrder}
              loading={poLoading}
              onClose={() => setReceivingOrder(null)}
              onConfirm={handleConfirmReceivePO}
              onShowToast={showToast}
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
              allSuppliers={suppliers}
              prefillProduct={prefillPOProduct}
              onShowToast={showToast}
            />
          )}
        </AnimatePresence>

        {/* Add Material Modal */}
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
                    <p className="font-semibold text-slate-800">Add Material</p>
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
                    {submitting ? "Saving..." : "Save Material"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* End-of-Day Reconciliation Modal */}
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
                        .includes("chopped chicken");
                      const isWhole = item.category
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
        {dashboardSummary && (
          <DashboardSummaryModal
            open={dashboardSummary !== null}
            title={dashboardSummaryConfig[dashboardSummary].title}
            subtitle={dashboardSummaryConfig[dashboardSummary].subtitle}
            totalLabel={dashboardSummaryConfig[dashboardSummary].totalLabel}
            totalValue={dashboardSummaryConfig[dashboardSummary].totalValue}
            rows={dashboardSummaryConfig[dashboardSummary].rows}
            emptyMessage={dashboardSummaryConfig[dashboardSummary].emptyMessage}
            onClose={() => setDashboardSummary(null)}
          />
        )}
      </div>
    </>
  );
}
