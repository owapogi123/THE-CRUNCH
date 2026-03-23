import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  type Variants,
  type Transition,
} from "framer-motion";
import { Sidebar } from "@/components/Sidebar";

// ── Types ─────────────────────────────────────────────────────────────────────
type WithdrawalType = "initial" | "supplementary" | "return";
type StockStatus = "critical" | "low" | "normal";
type Tab = "dashboard" | "withdrawal" | "alerts" | "suppliers";
type SupplierField = keyof Omit<Supplier, "supplier_id">;

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
  recorded_by: string;
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

interface Report {
  report_id: number;
  report_type: string;
  total_sales: number;
  total_transaction: number;
  generated_at: string;
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
  batch_id?: number;
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

// ── NEW: Withdrawal reference item ────────────────────────────────────────────
// Represents one item from a saved withdrawal batch (initial or supplementary)
interface WithdrawalRefItem {
  product_id: number;
  product_name: string;
  unit: string;
  quantity: number; // original qty from that withdrawal
  editQty: string; // local edit value (empty = use original)
  selected: boolean; // whether staff wants to repeat this item
}

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json();
}

const api = {
  getInventory: () => apiFetch<Product[]>("/inventory"),
  getWithdrawals: () => apiFetch<StockStatusRecord[]>("/stock-status/today"),

  postWithdrawal: (
    body: Omit<StockStatusRecord, "status_id" | "status_date" | "product_name">,
  ) =>
    apiFetch<StockStatusRecord>("/stock-status", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  postSpoilage: (body: {
    product_id: number;
    quantity: number;
    recorded_by: string;
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
  getReports: () => apiFetch<Report[]>("/reports"),

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
    recorded_by?: string;
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
    recorded_by?: string;
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

  createDefaultBatch: (body: { product_id: number }) =>
    apiFetch<{ message: string; batch_id: number }>("/batches/default", {
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
    },
  ) =>
    apiFetch<Product>(`/inventory/${inventory_id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function isReconcilable(p: Product): boolean {
  const cat = p.category.toLowerCase();
  if (
    cat.includes("sauce") ||
    cat.includes("bottle") ||
    cat.includes("beverage") ||
    cat.includes("condiment") ||
    cat.includes("drink")
  )
    return false;
  return true;
}
function isWholeChicken(p: Product) {
  return p.category.toLowerCase().includes("whole chicken");
}
function isChoppedChicken(p: Product) {
  return p.category.toLowerCase().includes("chopped chicken");
}
function isChicken(p: Product) {
  return isWholeChicken(p) || isChoppedChicken(p);
}

function isMenuFoodProduct(p: Pick<Product, "category" | "promo">) {
  const promo = String(p.promo ?? "")
    .toUpperCase()
    .trim();
  const category = String(p.category ?? "")
    .toLowerCase()
    .trim();
  return promo === "MENU FOOD" || category.includes("menu food");
}

function getStockStatus(p: Product): StockStatus {
  if (p.mainStock <= p.criticalPoint) return "critical";
  if (p.mainStock <= p.reorderPoint) return "low";
  return "normal";
}

function formatExpiryDate(value?: string | null): string {
  if (!value) return "No expiry";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No expiry";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function formatReceivedDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function isExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const days =
    (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days <= 3 && days >= 0;
}
function isExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  return new Date(expiry).getTime() < Date.now();
}
function getCategoryStyle(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes("whole chicken"))
    return "bg-orange-50 text-orange-600 border-orange-100";
  if (cat.includes("chopped chicken"))
    return "bg-amber-50 text-amber-700 border-amber-100";
  if (cat.includes("sauce")) return "bg-rose-50 text-rose-500 border-rose-100";
  return "bg-slate-50 text-slate-500 border-slate-100";
}

// ── Storage key for today's withdrawal reference ───────────────────────────────
function getTodayKey() {
  return `withdrawal_ref_${new Date().toISOString().slice(0, 10)}`;
}
function saveWithdrawalRef(items: WithdrawalRefItem[]) {
  try {
    localStorage.setItem(getTodayKey(), JSON.stringify(items));
  } catch {
    /* silent */
  }
}
function loadWithdrawalRef(): WithdrawalRefItem[] {
  try {
    const raw = localStorage.getItem(getTodayKey());
    if (!raw) return [];

    const parsed = JSON.parse(raw) as WithdrawalRefItem[];
    return (Array.isArray(parsed) ? parsed : [])
      .map((i) => ({
        ...i,
        quantity: Math.max(0, Math.trunc(Number(i.quantity) || 0)),
        editQty:
          i.editQty === ""
            ? ""
            : String(Math.max(0, Math.trunc(Number(i.editQty) || 0))),
      }))
      .filter((i) => i.quantity > 0);
  } catch {
    return [];
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
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
const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "alerts", label: "Alerts" },
  { id: "suppliers", label: "Suppliers" },
];

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

// ── Motion ────────────────────────────────────────────────────────────────────
const smoothEase: Transition = {
  duration: 0.38,
  ease: [0.25, 0.46, 0.45, 0.94],
};
const pageVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: smoothEase },
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

// ── Sub-components ────────────────────────────────────────────────────────────
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
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${type === "success" ? "bg-emerald-600 text-white" : "bg-red-500 text-white"}`}
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
      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200"
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
      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
      className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${
        variant === "primary"
          ? "bg-slate-900 text-white hover:bg-slate-700 shadow-slate-900/20"
          : "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20"
      }`}
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

// ── Yesterday's Returns Banner ────────────────────────────────────────────────
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

// ── FIFO Batch Preview ────────────────────────────────────────────────────────
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
            const willBeUsed = !!previewRow;
            const expiring = isExpiringSoon(batch.expiry_date);
            const expired = isExpired(batch.expiry_date);
            const isFirst = idx === 0;
            return (
              <div
                key={batch.batch_id}
                className={`px-3.5 py-3 flex items-center gap-3 transition-colors ${willBeUsed ? "bg-indigo-50/60" : "bg-white"} ${expired ? "opacity-50" : ""}`}
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
                  {willBeUsed && previewRow && (
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

// ── NEW: Today's Withdrawal Reference Banner ───────────────────────────────────
/**
 * Shows the last withdrawal batch so staff can repeat individual items.
 * Each item row has:
 *   - Checkbox to select/deselect
 *   - Qty field (pre-filled, editable)
 *   - "Withdraw This" button per item
 * A "Withdraw Selected" button at the bottom handles all checked items.
 */
function WithdrawalReferenceBanner({
  items,
  onWithdrawItem,
  onWithdrawSelected,
  submitting,
  onChange,
}: {
  items: WithdrawalRefItem[];
  onWithdrawItem: (item: WithdrawalRefItem) => void;
  onWithdrawSelected: (items: WithdrawalRefItem[]) => void;
  submitting: boolean;
  onChange: (items: WithdrawalRefItem[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const selectedItems = items.filter((i) => i.selected);

  if (items.length === 0) return null;

  function toggleItem(idx: number) {
    onChange(
      items.map((it, i) =>
        i === idx ? { ...it, selected: !it.selected } : it,
      ),
    );
  }
  function setQty(idx: number, val: string) {
    if (val === "") {
      onChange(items.map((it, i) => (i === idx ? { ...it, editQty: "" } : it)));
      return;
    }

    // Opening withdrawal references should use whole-number quantities only.
    const parsed = Number(val);
    const normalized =
      Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "";
    onChange(
      items.map((it, i) => (i === idx ? { ...it, editQty: normalized } : it)),
    );
  }
  function toggleAll() {
    const allSelected = items.every((i) => i.selected);
    onChange(items.map((it) => ({ ...it, selected: !allSelected })));
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-indigo-50 border border-indigo-200 rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-indigo-100">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📋</span>
          <div>
            <p className="text-xs font-bold text-indigo-800 uppercase tracking-wider">
              Today's Withdrawal Reference
            </p>
            <p className="text-xs text-indigo-600 mt-0.5">
              Based on the last withdrawal. Select items to repeat individually
              or all at once.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-100"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Column headers */}
          <div className="px-5 pt-3 pb-1 grid grid-cols-[auto_1fr_120px_auto] gap-3 items-center">
            <button
              onClick={toggleAll}
              className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              {items.every((i) => i.selected) ? "Deselect All" : "Select All"}
            </button>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Item
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
              Qty to Withdraw
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">
              Action
            </span>
          </div>

          {/* Item rows */}
          <div className="px-5 pb-3 space-y-2">
            {items.map((item, idx) => {
              const displayQty =
                item.editQty !== "" ? item.editQty : String(item.quantity);
              return (
                <div
                  key={item.product_id}
                  className={`grid grid-cols-[auto_1fr_120px_auto] gap-3 items-center py-2.5 px-3 rounded-xl border transition-colors ${
                    item.selected
                      ? "bg-white border-indigo-200"
                      : "bg-indigo-50/40 border-transparent"
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItem(idx)}
                    className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                  />

                  {/* Item info */}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.product_name}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Reference:{" "}
                      <span className="font-medium text-slate-600">
                        {item.quantity} {item.unit}
                      </span>
                    </p>
                  </div>

                  {/* Editable qty */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={displayQty}
                      min={1}
                      step={1}
                      onChange={(e) => setQty(idx, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-center font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {item.unit}
                    </span>
                  </div>

                  {/* Per-item withdraw button */}
                  <button
                    onClick={() =>
                      onWithdrawItem({ ...item, editQty: displayQty })
                    }
                    disabled={submitting}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    Withdraw
                  </button>
                </div>
              );
            })}
          </div>

          {/* Bulk action footer */}
          {selectedItems.length > 0 && (
            <div className="px-5 py-3 border-t border-indigo-100 bg-white flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">
                {selectedItems.length} item{selectedItems.length > 1 ? "s" : ""}{" "}
                selected
              </p>
              <button
                onClick={() =>
                  onWithdrawSelected(
                    selectedItems.map((i) => ({
                      ...i,
                      editQty:
                        i.editQty !== "" ? i.editQty : String(i.quantity),
                    })),
                  )
                }
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {submitting
                  ? "Withdrawing..."
                  : `Withdraw Selected (${selectedItems.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
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

  // ── Withdrawal reference state ────────────────────────────────────────────
  // Persisted to localStorage keyed by today's date so it resets each day
  const [withdrawalRef, setWithdrawalRef] = useState<WithdrawalRefItem[]>(() =>
    loadWithdrawalRef(),
  );

  function updateWithdrawalRef(items: WithdrawalRefItem[]) {
    const normalized = items
      .map((i) => ({
        ...i,
        quantity: Math.max(0, Math.trunc(Number(i.quantity) || 0)),
      }))
      .filter((i) => i.quantity > 0);
    setWithdrawalRef(normalized);
    saveWithdrawalRef(normalized);
  }

  function adjustWithdrawalRef(product: Product, deltaQty: number) {
    const delta = Math.trunc(Number(deltaQty) || 0);
    if (!delta) return;

    const existing = loadWithdrawalRef();
    const idx = existing.findIndex((r) => r.product_id === product.product_id);

    if (idx < 0) {
      if (delta <= 0) return;
      updateWithdrawalRef([
        ...existing,
        {
          product_id: product.product_id,
          product_name: product.product_name,
          unit: product.unit,
          quantity: delta,
          editQty: "",
          selected: false,
        },
      ]);
      return;
    }

    const nextQty = Math.max(
      0,
      Math.trunc(Number(existing[idx].quantity) || 0) + delta,
    );
    const next = existing.map((r, i) =>
      i === idx ? { ...r, quantity: nextQty, editQty: "" } : r,
    );
    updateWithdrawalRef(next);
  }

  // ── Google Fonts ──────────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.innerHTML = `@keyframes fadeInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inv, wd, sup] = await Promise.all([
        api.getInventory(),
        api.getWithdrawals(),
        api.getSuppliers(),
      ]);
      const [activeBatchesResult, yesterdayReturnsResult] =
        await Promise.allSettled([
          api.getActiveBatches(),
          api.getYesterdayReturns(),
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
            .trim();
          const category = String(p.category ?? "")
            .toLowerCase()
            .trim();
          const isSupplyLike =
            promo === "SUPPLIES" ||
            promo === "MENU FOOD" ||
            category.includes("suppl") ||
            category === "ingredients" ||
            category.includes("sauce") ||
            category.includes("menu food") ||
            category.includes("beverage") ||
            category.includes("drink");
          return isSupplyLike || p.isRawMaterial;
        });

      // Keep one row per logical product name so withdrawal and inventory views stay in sync.
      const groupedByName = new Map<string, Product[]>();
      for (const item of candidateProducts) {
        const key = String(item.product_name ?? "")
          .trim()
          .toLowerCase();
        const group = groupedByName.get(key) ?? [];
        group.push(item);
        groupedByName.set(key, group);
      }

      const normalizedProducts: Product[] = Array.from(
        groupedByName.values(),
      ).map((group) => {
        const nonRaw = group.filter((item) => !item.isRawMaterial);
        const pool = nonRaw.length > 0 ? nonRaw : group;
        return pool.reduce((latest, current) =>
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

  // ── Derived ───────────────────────────────────────────────────────────────
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

  const selectedProductBatches = useMemo(() => {
    if (!wdProductId) return [];
    return activeBatches
      .filter((b) => b.product_id === wdProductId)
      .sort(
        (a, b) =>
          new Date(a.received_date).getTime() -
          new Date(b.received_date).getTime(),
      );
  }, [activeBatches, wdProductId]);

  const dashboardFilteredProducts = useMemo(() => {
    const q = dashboardSearch.trim().toLowerCase();
    const stockManagerProducts = products.filter((p) => !isMenuFoodProduct(p));
    const filtered = !q
      ? stockManagerProducts
      : stockManagerProducts.filter(
          (p) =>
            p.product_name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q),
        );
    return [...filtered].sort((a, b) => {
      const aWithdrawn = toNumber(a.dailyWithdrawn);
      const bWithdrawn = toNumber(b.dailyWithdrawn);
      if (aWithdrawn !== bWithdrawn) return bWithdrawn - aWithdrawn;
      const aPct = a.mainStock / Math.max(1, a.reorderPoint * 2);
      const bPct = b.mainStock / Math.max(1, b.reorderPoint * 2);
      return aPct - bPct;
    });
  }, [products, dashboardSearch]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
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

  const showToast = (message: string, type: "success" | "error") =>
    setToast({ message, type });

  // ── Core single-item withdrawal ───────────────────────────────────────────
  async function doWithdraw(
    product_id: number,
    qty: number,
    type: WithdrawalType,
  ) {
    const product = products.find((p) => p.product_id === product_id);
    if (!product) throw new Error("Product not found");

    try {
      if (type === "return") {
        const productBatches = await api.getProductBatches(product_id);
        const validBatch = productBatches
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
      // Fallback to legacy stock_status flow
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

  // ── Submit single withdrawal from the form ────────────────────────────────
  async function submitWithdrawal() {
    const qty = parseInt(wdQty);
    if (!qty || qty <= 0 || wdProductId === null) return;

    if (wdType !== "return" && !Number.isInteger(qty)) {
      showToast("Withdrawal quantity must be a whole number.", "error");
      return;
    }

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

      // ── Save to withdrawal reference on initial withdrawal ────────────────
      if (wdType === "initial") {
        const existing = loadWithdrawalRef();
        const existingIdx = existing.findIndex(
          (r) => r.product_id === wdProductId,
        );
        const newItem: WithdrawalRefItem = {
          product_id: wdProductId,
          product_name: product.product_name,
          unit: product.unit,
          quantity: qty,
          editQty: "",
          selected: false,
        };
        let updated: WithdrawalRefItem[];
        if (existingIdx >= 0) {
          // Update existing entry — manager may have re-done initial
          updated = existing.map((r, i) => (i === existingIdx ? newItem : r));
        } else {
          updated = [...existing, newItem];
        }
        updateWithdrawalRef(updated);
      } else if (wdType === "supplementary") {
        adjustWithdrawalRef(product, qty);
      } else if (wdType === "return") {
        adjustWithdrawalRef(product, -qty);
      }

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

  // ── Withdraw a single item from the reference banner ──────────────────────
  async function handleWithdrawRefItem(item: WithdrawalRefItem) {
    const rawQty = item.editQty !== "" ? item.editQty : String(item.quantity);
    const qtyNum = Number(rawQty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      showToast("Quantity must be a whole number.", "error");
      return;
    }
    const qty = qtyNum;
    const product = products.find((p) => p.product_id === item.product_id);
    if (!product) {
      showToast("Product not found.", "error");
      return;
    }
    if (qty > product.mainStock) {
      showToast(`Insufficient stock for ${item.product_name}.`, "error");
      return;
    }

    setSubmitting(true);
    try {
      await doWithdraw(item.product_id, qty, "supplementary");
      adjustWithdrawalRef(product, qty);
      showToast(
        `${item.product_name}: ${qty} ${item.unit} withdrawn.`,
        "success",
      );
      await fetchAll();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to withdraw.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Withdraw all selected items from the reference banner ─────────────────
  async function handleWithdrawSelectedRef(items: WithdrawalRefItem[]) {
    if (items.length === 0) return;
    setSubmitting(true);
    const errors: string[] = [];
    try {
      for (const item of items) {
        const rawQty =
          item.editQty !== "" ? item.editQty : String(item.quantity);
        const qtyNum = Number(rawQty);
        if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
          errors.push(`${item.product_name}: qty must be a whole number`);
          continue;
        }
        const qty = qtyNum;
        const product = products.find((p) => p.product_id === item.product_id);
        if (!product) {
          errors.push(`${item.product_name}: not found`);
          continue;
        }
        if (qty > product.mainStock) {
          errors.push(`${item.product_name}: insufficient stock`);
          continue;
        }
        try {
          await doWithdraw(item.product_id, qty, "supplementary");
          adjustWithdrawalRef(product, qty);
        } catch (err) {
          errors.push(
            `${item.product_name}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }
      if (errors.length > 0) {
        showToast(`Done with ${errors.length} error(s): ${errors[0]}`, "error");
      } else {
        showToast(`${items.length} item(s) withdrawn successfully.`, "success");
      }
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Submit Spoilage ───────────────────────────────────────────────────────
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

  // ── Reconciliation ────────────────────────────────────────────────────────
  function openReconcile() {
    const items: ReconcileRow[] = products
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
      }));
    setReconcileItems(items);
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
      showToast(
        `${validItems.length} item(s) reconciled. Returns logged for tomorrow.`,
        "success",
      );
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

  // ── Suppliers ─────────────────────────────────────────────────────────────
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

  function setSupplierField(field: SupplierField, value: string) {
    setSupplierForm((prev) => ({ ...prev, [field]: value }));
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
        // Existing item: only add stock batch to keep a single row per item.
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
        existing
          ? "Stock added to existing item."
          : "Raw material added to stock.",
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

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
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
              {new Date().toLocaleDateString("en-PH", {
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
                  : 0;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ fontFamily: "'Poppins', sans-serif" }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                  active
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {t.label}
                {badge > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      active
                        ? "bg-white/20 text-white"
                        : t.id === "withdrawal"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-600"
                    }`}
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
            {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
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
                    ).map((k) => {
                      const ac = KPI_ACCENT[k.accent];
                      return (
                        <motion.div
                          key={k.label}
                          variants={itemVariants}
                          className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${ac.border}`}
                        >
                          <p className="text-xs text-slate-400 font-medium">
                            {k.label}
                          </p>
                          <p
                            className={`text-3xl font-bold mt-1 leading-none ${ac.value}`}
                          >
                            {k.value}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
                        </motion.div>
                      );
                    })}
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
                            const status = getStockStatus(p);
                            const pct = Math.min(
                              100,
                              (p.mainStock / Math.max(1, p.reorderPoint * 2)) *
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
                                  "en-PH",
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

            {/* ── WITHDRAWAL ────────────────────────────────────────────────── */}
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
                  {/* Yesterday's returns */}
                  {yesterdayReturns.length > 0 && (
                    <motion.div variants={itemVariants}>
                      <YesterdayReturnsBanner batches={yesterdayReturns} />
                    </motion.div>
                  )}

                  <motion.div
                    variants={itemVariants}
                    className="grid grid-cols-2 gap-6"
                  >
                    {/* Withdrawal Form */}
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
                                className={`py-2.5 text-xs font-semibold rounded-xl border capitalize transition-all duration-200 ${
                                  wdType === t
                                    ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20"
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </FormField>

                        <div
                          className={`text-xs px-3 py-2 rounded-xl border ${
                            wdType === "initial"
                              ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                              : wdType === "supplementary"
                                ? "bg-sky-50 text-sky-600 border-sky-100"
                                : "bg-emerald-50 text-emerald-600 border-emerald-100"
                          }`}
                        >
                          {wdType === "initial" &&
                            "Opening withdrawal for today — this becomes the reference for supplementary pulls."}
                          {wdType === "supplementary" &&
                            "Additional pull — select items below to repeat or adjust from the opening withdrawal."}
                          {wdType === "return" &&
                            "Returning unused/leftover stock back to main storage."}
                        </div>

                        {/* ── Reference panel: only shown when supplementary is selected ── */}
                        {wdType === "supplementary" &&
                          withdrawalRef.length > 0 && (
                            <div className="rounded-xl border border-sky-200 overflow-hidden">
                              {/* Mini header */}
                              <div className="px-3.5 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">📋</span>
                                  <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">
                                    Opening Withdrawal Reference
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    const allSelected = withdrawalRef.every(
                                      (i) => i.selected,
                                    );
                                    updateWithdrawalRef(
                                      withdrawalRef.map((i) => ({
                                        ...i,
                                        selected: !allSelected,
                                      })),
                                    );
                                  }}
                                  className="text-[10px] font-bold text-sky-600 hover:text-sky-800 transition-colors px-2 py-1 rounded hover:bg-sky-100"
                                >
                                  {withdrawalRef.every((i) => i.selected)
                                    ? "Deselect All"
                                    : "Select All"}
                                </button>
                              </div>

                              {/* Item rows */}
                              <div className="divide-y divide-sky-50 max-h-64 overflow-y-auto">
                                {withdrawalRef.map((item, idx) => {
                                  const displayQty =
                                    item.editQty !== ""
                                      ? String(
                                          Math.max(
                                            1,
                                            Math.trunc(
                                              Number(item.editQty) || 0,
                                            ),
                                          ),
                                        )
                                      : String(
                                          Math.max(
                                            1,
                                            Math.trunc(
                                              Number(item.quantity) || 0,
                                            ),
                                          ),
                                        );
                                  const product = products.find(
                                    (p) => p.product_id === item.product_id,
                                  );
                                  const hasStock = product
                                    ? Number(displayQty) <= product.mainStock
                                    : true;
                                  return (
                                    <div
                                      key={item.product_id}
                                      className={`flex items-center gap-3 px-3.5 py-3 transition-colors ${item.selected ? "bg-white" : "bg-sky-50/30"}`}
                                    >
                                      {/* Checkbox */}
                                      <input
                                        type="checkbox"
                                        checked={item.selected}
                                        onChange={() =>
                                          updateWithdrawalRef(
                                            withdrawalRef.map((it, i) =>
                                              i === idx
                                                ? {
                                                    ...it,
                                                    selected: !it.selected,
                                                  }
                                                : it,
                                            ),
                                          )
                                        }
                                        className="w-4 h-4 rounded accent-sky-600 cursor-pointer flex-shrink-0"
                                      />

                                      {/* Name + reference qty */}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">
                                          {item.product_name}
                                        </p>
                                        <p className="text-[11px] text-slate-400">
                                          Opening:{" "}
                                          <span className="font-medium text-slate-600">
                                            {item.quantity} {item.unit}
                                          </span>
                                        </p>
                                      </div>

                                      {/* Editable qty */}
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <input
                                          type="number"
                                          value={displayQty}
                                          min={1}
                                          step={1}
                                          onChange={(e) =>
                                            updateWithdrawalRef(
                                              withdrawalRef.map((it, i) =>
                                                i === idx
                                                  ? {
                                                      ...it,
                                                      editQty:
                                                        e.target.value === ""
                                                          ? ""
                                                          : String(
                                                              Math.max(
                                                                1,
                                                                Math.trunc(
                                                                  Number(
                                                                    e.target
                                                                      .value,
                                                                  ) || 0,
                                                                ),
                                                              ),
                                                            ),
                                                    }
                                                  : it,
                                              ),
                                            )
                                          }
                                          onBlur={(e) => {
                                            const n = Math.max(
                                              1,
                                              Math.trunc(
                                                Number(e.target.value) || 0,
                                              ),
                                            );
                                            updateWithdrawalRef(
                                              withdrawalRef.map((it, i) =>
                                                i === idx
                                                  ? {
                                                      ...it,
                                                      editQty: String(n),
                                                    }
                                                  : it,
                                              ),
                                            );
                                          }}
                                          className={`w-20 border rounded-lg px-2 py-1.5 text-sm text-center font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 transition-colors ${
                                            !hasStock
                                              ? "border-red-300 focus:ring-red-200"
                                              : "border-slate-200 focus:ring-sky-200"
                                          }`}
                                        />
                                        <span className="text-xs text-slate-400">
                                          {item.unit}
                                        </span>
                                      </div>

                                      {/* Per-item withdraw button */}
                                      <button
                                        onClick={() =>
                                          handleWithdrawRefItem({
                                            ...item,
                                            editQty: displayQty,
                                          })
                                        }
                                        disabled={submitting || !hasStock}
                                        title={
                                          !hasStock ? "Insufficient stock" : ""
                                        }
                                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0"
                                      >
                                        Withdraw
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Bulk action footer */}
                              {withdrawalRef.some((i) => i.selected) && (
                                <div className="px-3.5 py-2.5 bg-white border-t border-sky-100 flex items-center justify-between">
                                  <span className="text-xs text-slate-500 font-medium">
                                    {
                                      withdrawalRef.filter((i) => i.selected)
                                        .length
                                    }{" "}
                                    item
                                    {withdrawalRef.filter((i) => i.selected)
                                      .length > 1
                                      ? "s"
                                      : ""}{" "}
                                    selected
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleWithdrawSelectedRef(
                                        withdrawalRef
                                          .filter((i) => i.selected)
                                          .map((i) => ({
                                            ...i,
                                            editQty:
                                              i.editQty !== ""
                                                ? i.editQty
                                                : String(i.quantity),
                                          })),
                                      )
                                    }
                                    disabled={submitting}
                                    className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors disabled:opacity-50"
                                  >
                                    {submitting
                                      ? "Withdrawing..."
                                      : `Withdraw Selected (${withdrawalRef.filter((i) => i.selected).length})`}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                        {/* Divider between reference panel and manual form */}
                        {wdType === "supplementary" &&
                          withdrawalRef.length > 0 && (
                            <div className="flex items-center gap-3">
                              <div className="flex-1 border-t border-slate-200" />
                              <span className="text-[11px] text-slate-400 font-medium">
                                or withdraw a different item manually
                              </span>
                              <div className="flex-1 border-t border-slate-200" />
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

                        {selectedWithdrawalProduct &&
                          selectedWithdrawalProduct.category
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

                    {/* Today's log */}
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
                                    {new Date(w.status_date).toLocaleTimeString(
                                      "en-PH",
                                      { hour: "2-digit", minute: "2-digit" },
                                    )}
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

                  {/* FIFO Batch Preview */}
                  {wdType !== "return" && selectedProductBatches.length > 0 && (
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

                  {/* Currently withdrawn */}
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

            {/* ── ALERTS ────────────────────────────────────────────────────── */}
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
                      {criticalStock.length > 0 && (
                        <motion.div variants={itemVariants} className="pt-1">
                          <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2">
                            Critical
                          </p>
                        </motion.div>
                      )}
                      {criticalStock.map((p, i) => {
                        const status = getStockStatus(p);
                        const deficit = +(p.reorderPoint - p.mainStock).toFixed(
                          2,
                        );
                        return (
                          <motion.div
                            key={p.inventory_id}
                            variants={itemVariants}
                            transition={{ delay: i * 0.06 }}
                            className={`bg-white rounded-2xl border border-t-4 p-5 flex items-center justify-between shadow-sm ${status === "critical" ? "border-red-200 border-t-red-400" : "border-amber-200 border-t-amber-400"}`}
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
                                Reorder at {p.reorderPoint} · Critical at{" "}
                                {p.criticalPoint}
                              </p>
                              <span
                                className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${STATUS_BADGE[status]}`}
                              >
                                {status === "critical"
                                  ? "Restock Now"
                                  : "Reorder Soon"}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                      {lowStock.length > 0 && (
                        <motion.div variants={itemVariants} className="pt-2">
                          <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
                            Warning
                          </p>
                        </motion.div>
                      )}
                      {lowStock.map((p, i) => {
                        const deficit = +(p.reorderPoint - p.mainStock).toFixed(
                          2,
                        );
                        return (
                          <motion.div
                            key={p.inventory_id}
                            variants={itemVariants}
                            transition={{
                              delay: (criticalStock.length + i) * 0.06,
                            }}
                            className="bg-white rounded-2xl border border-amber-200 border-t-4 border-t-amber-400 p-5 flex items-center justify-between shadow-sm"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
                                <span className="text-sm font-bold text-amber-500">
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
                                <p className="text-xs font-medium mt-1 text-amber-500">
                                  {deficit > 0
                                    ? `Need ${deficit} ${p.unit} to reach reorder point`
                                    : "Near critical threshold"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-amber-500">
                                {p.mainStock}{" "}
                                <span className="text-sm font-normal text-slate-400">
                                  {p.unit}
                                </span>
                              </p>
                              <p className="text-xs text-slate-400 mt-1">
                                Reorder at {p.reorderPoint} · Critical at{" "}
                                {p.criticalPoint}
                              </p>
                              <span className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-600">
                                Reorder Soon
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}

            {/* ── SUPPLIERS ─────────────────────────────────────────────────── */}
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
                                    value={(supplierForm[key] as string) ?? ""}
                                    onChange={(v) => setSupplierField(key, v)}
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
                                  onClick={() => removeSupplier(s.supplier_id)}
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
          </AnimatePresence>
        )}
      </main>

      {/* ── Add Raw Material Modal ──────────────────────────────────────────── */}
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

      {/* ── End-of-Day Reconciliation Modal ─────────────────────────────────── */}
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
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" />{" "}
                  Whole Chicken
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />{" "}
                  Chopped Chicken{" "}
                  <span className="ml-1 text-amber-500 font-medium">
                    (can return as whole)
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />{" "}
                  Other Meat/Protein
                </span>
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
                    const dotColor = isWhole
                      ? "bg-orange-400"
                      : isChopped
                        ? "bg-amber-500"
                        : "bg-slate-400";
                    return (
                      <div
                        key={item.product_id}
                        className={`p-4 rounded-2xl border transition-colors ${isChopped ? "bg-amber-50/60 border-amber-100" : isWhole ? "bg-orange-50/60 border-orange-100" : "bg-slate-50 border-slate-100"}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${dotColor}`}
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
                              <button
                                onClick={() =>
                                  setReconcileItems((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, returnDestination: "chopped" }
                                        : r,
                                    ),
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${item.returnDestination === "chopped" ? "bg-amber-500 text-white shadow-sm" : "text-slate-400 hover:text-amber-500"}`}
                              >
                                Chopped
                              </button>
                              <button
                                onClick={() =>
                                  setReconcileItems((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, returnDestination: "whole" }
                                        : r,
                                    ),
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${item.returnDestination === "whole" ? "bg-orange-500 text-white shadow-sm" : "text-slate-400 hover:text-orange-500"}`}
                              >
                                Whole
                              </button>
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
                      reconcileItems.filter((i) => parseFloat(i.returnQty) > 0)
                        .length === 0
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

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
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
  );
}
