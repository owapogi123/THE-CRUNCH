import React, { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, type Variants, type Transition } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";

// ── Types (aligned with DB schema) ─────────────────────────────────────────
type WithdrawalType = "initial" | "supplementary" | "return";
type StockStatus    = "critical" | "low" | "normal";
type Tab            = "dashboard" | "withdrawal" | "alerts" | "suppliers" | "reports" | "critical";
type SupplierField  = keyof Omit<Supplier, "supplier_id">;

// Matches: Inventory table + Stock_Status join
interface Product {
  inventory_id: number;
  product_id: number;
  product_name: string;
  category: string;
  unit: string;
  mainStock: number;        // Inventory.Stock
  quantity: number;         // Inventory.Quantity
  item_purchased: number;   // Inventory.Item_Purchased
  last_update: string;      // Inventory.Last_Update
  reorderPoint: number;
  criticalPoint: number;
  supplier_name: string;
  dailyWithdrawn: number;
  returned: number;
  wasted: number;
}

// Matches: Stock_Status table
interface StockStatusRecord {
  status_id: number;
  product_id: number;
  product_name: string;
  type: WithdrawalType;
  quantity: number;
  status_date: string;
  recorded_by: string;
}

// Matches: Suppliers table
interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_number: string;
  delivery_schedule: string;
  product_id: number;
  email?: string;
  products_supplied?: string;
}

// Matches: Reports table
interface Report {
  report_id: number;
  report_type: string;
  total_sales: number;
  total_transaction: number;
  generated_at: string;
}

// ── API Configuration ───────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";

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

// ── API Calls (mapped to your DB schema) ───────────────────────────────────
const api = {
  // GET /api/inventory  → returns Inventory JOIN Stock_Status JOIN Menu JOIN Suppliers
  getInventory:   ()                             => apiFetch<Product[]>("/inventory"),

  // GET /api/stock-status/today
  getWithdrawals: ()                             => apiFetch<StockStatusRecord[]>("/stock-status/today"),

  // POST /api/stock-status  →  { product_id, type, quantity, recorded_by }
  postWithdrawal: (body: Omit<StockStatusRecord, "status_id" | "status_date" | "product_name">) =>
    apiFetch<StockStatusRecord>("/stock-status", { method: "POST", body: JSON.stringify(body) }),

  // POST /api/stock-status/spoilage  →  { product_id, quantity, recorded_by }
  postSpoilage:   (body: { product_id: number; quantity: number; recorded_by: string }) =>
    apiFetch<{ success: boolean }>("/stock-status/spoilage", { method: "POST", body: JSON.stringify(body) }),

  // GET /api/suppliers
  getSuppliers:   ()                             => apiFetch<Supplier[]>("/suppliers"),

  // POST /api/suppliers
  postSupplier:   (body: Omit<Supplier, "supplier_id">) =>
    apiFetch<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(body) }),

  // DELETE /api/suppliers/:id
  deleteSupplier: (id: number)                   => apiFetch<{ success: boolean }>(`/suppliers/${id}`, { method: "DELETE" }),

  // GET /api/reports
  getReports:     ()                             => apiFetch<Report[]>("/reports"),

  // PUT /api/inventory/:id  →  update Stock after withdrawal/return
  updateStock:    (inventory_id: number, body: { stock: number; daily_withdrawn?: number; returned?: number; wasted?: number }) =>
    apiFetch<Product>(`/inventory/${inventory_id}`, { method: "PUT", body: JSON.stringify(body) }),
};

// ── Constants ───────────────────────────────────────────────────────────────
const BLANK_SUPPLIER: Omit<Supplier, "supplier_id"> = {
  supplier_name: "", contact_number: "", delivery_schedule: "",
  product_id: 0, email: "", products_supplied: "",
};

const SUPPLIER_FIELDS: { key: SupplierField; label: string; placeholder: string }[] = [
  { key: "supplier_name",     label: "Company Name",      placeholder: "e.g. FreshMill Co."   },
  { key: "email",             label: "Email Address",     placeholder: "e.g. juan@company.ph" },
  { key: "contact_number",    label: "Phone Number",      placeholder: "e.g. 0917-123-4567"   },
  { key: "products_supplied", label: "Supplied Products", placeholder: "e.g. Flour, Sugar"    },
  { key: "delivery_schedule", label: "Delivery Schedule", placeholder: "e.g. Mon, Wed, Fri"   },
];

const WITHDRAWAL_TYPES: WithdrawalType[] = ["initial", "supplementary", "return"];

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard",  label: "Dashboard"  },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "alerts",     label: "Alerts"     },
  { id: "suppliers",  label: "Suppliers"  },
  { id: "reports",    label: "Reports"    },
  { id: "critical",   label: "Critical"   },
];

// ── Status helpers ──────────────────────────────────────────────────────────
function getStockStatus(p: Product): StockStatus {
  if (p.mainStock <= p.criticalPoint) return "critical";
  if (p.mainStock <= p.reorderPoint)  return "low";
  return "normal";
}

const STATUS_BADGE: Record<StockStatus, string> = {
  critical: "bg-red-100 text-red-600",
  low:      "bg-amber-100 text-amber-600",
  normal:   "bg-emerald-100 text-emerald-600",
};
const STATUS_BAR: Record<StockStatus, string> = {
  critical: "bg-red-400",
  low:      "bg-amber-400",
  normal:   "bg-emerald-400",
};
const STATUS_DOT: Record<StockStatus, string> = {
  critical: "bg-red-500",
  low:      "bg-amber-400",
  normal:   "bg-emerald-500",
};
const TYPE_BADGE: Record<WithdrawalType, string> = {
  initial:       "bg-indigo-50 text-indigo-600",
  supplementary: "bg-sky-50 text-sky-600",
  return:        "bg-emerald-50 text-emerald-600",
};
const KPI_ACCENT: Record<string, { border: string; value: string }> = {
  slate:   { border: "border-t-slate-800",   value: "text-slate-500"   },
  indigo:  { border: "border-t-indigo-400",  value: "text-indigo-600"  },
  rose:    { border: "border-t-rose-400",    value: "text-rose-500"    },
  emerald: { border: "border-t-emerald-400", value: "text-emerald-600" },
};

// ── Framer Motion presets ───────────────────────────────────────────────────
const smoothEase: Transition = { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] };
const pageVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0,   transition: smoothEase },
  exit:   { opacity: 0, y: -10, transition: { duration: 0.2 } },
};
const staggerVariants: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// ── Loading Skeleton ────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white rounded-2xl p-5 h-28 border border-slate-100 shadow-sm">
            <div className="h-3 bg-slate-100 rounded w-24 mb-3" />
            <div className="h-8 bg-slate-100 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <div className="h-4 bg-slate-100 rounded w-40" />
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="px-5 py-4 border-b border-slate-50 flex gap-6">
            <div className="h-3 bg-slate-100 rounded w-40" />
            <div className="h-3 bg-slate-100 rounded w-20 ml-auto" />
            <div className="h-3 bg-slate-100 rounded w-16" />
            <div className="h-3 bg-slate-100 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Error Banner ────────────────────────────────────────────────────────────
function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
          <span className="text-red-500 font-bold text-sm">!</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-700">Failed to load data</p>
          <p className="text-xs text-red-500 mt-0.5">{message}</p>
        </div>
      </div>
      <button onClick={onRetry}
        className="px-4 py-2 bg-red-500 text-white text-xs font-semibold rounded-xl hover:bg-red-600 transition-colors">
        Retry
      </button>
    </div>
  );
}

// ── Toast Notification ──────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${
        type === "success" ? "bg-emerald-600 text-white" : "bg-red-500 text-white"
      }`}>
      <span>{type === "success" ? "✓" : "✕"}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100 text-xs">✕</button>
    </motion.div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function StockManager() {
  const [tab, setTab] = useState<Tab>("dashboard");

  // ── Data state (from API) ─────────────────────────────────────────────
  const [products,    setProducts]    = useState<Product[]>([]);
  const [withdrawals, setWithdrawals] = useState<StockStatusRecord[]>([]);
  const [suppliers,   setSuppliers]   = useState<Supplier[]>([]);
  const [reports,     setReports]     = useState<Report[]>([]);

  // ── UI state ──────────────────────────────────────────────────────────
  const [isLoading,  setIsLoading]  = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── Form state ────────────────────────────────────────────────────────
  const [wdProductId,  setWdProductId]  = useState<number | null>(null);
  const [wdQty,        setWdQty]        = useState("");
  const [wdType,       setWdType]       = useState<WithdrawalType>("initial");
  const [adjProductId, setAdjProductId] = useState<number | null>(null);
  const [adjQty,       setAdjQty]       = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm,     setSupplierForm]     = useState<Omit<Supplier, "supplier_id">>(BLANK_SUPPLIER);

  // ── Reconciliation modal state ────────────────────────────────────────
  const [showReconcile,   setShowReconcile]   = useState(false);
  const [reconcileItems,  setReconcileItems]  = useState<{ product_id: number; product_name: string; unit: string; withdrawn: number; returnQty: string }[]>([]);

  // ── Live clock ────────────────────────────────────────────────────────
  const [clock, setClock] = useState(
    new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  useEffect(() => {
    const t = setInterval(() =>
      setClock(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    , 1000);
    return () => clearInterval(t);
  }, []);

  // ── Google Fonts ──────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.innerHTML = `@keyframes fadeInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(link); document.head.removeChild(style); };
  }, []);

  // ── Fetch all data from backend ───────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inv, wd, sup, rep] = await Promise.all([
        api.getInventory(),
        api.getWithdrawals(),
        api.getSuppliers(),
        api.getReports(),
      ]);

      const normalizedProducts: Product[] = inv.map((p) => ({
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
      }));

      const normalizedWithdrawals: StockStatusRecord[] = wd.map((r) => ({
        ...r,
        status_id: toNumber(r.status_id),
        product_id: toNumber(r.product_id),
        quantity: toNumber(r.quantity),
      }));

      const normalizedReports: Report[] = rep.map((r) => ({
        ...r,
        report_id: toNumber(r.report_id),
        total_sales: toNumber(r.total_sales),
        total_transaction: toNumber(r.total_transaction),
      }));

      setProducts(normalizedProducts);
      setWithdrawals(normalizedWithdrawals);
      setSuppliers(sup);
      setReports(normalizedReports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (products.length > 0) {
      if (wdProductId  === null) setWdProductId(products[0].product_id);
      if (adjProductId === null) setAdjProductId(products[0].product_id);
    }
  }, [products]);

  // ── Derived values ────────────────────────────────────────────────────
  const lowStock      = products.filter(p => getStockStatus(p) === "low");
  const criticalStock = products.filter(p => getStockStatus(p) === "critical");
  const totalWithdrawn = products.reduce((s, p) => s + toNumber(p.dailyWithdrawn), 0);
  const totalWasted    = products.reduce((s, p) => s + toNumber(p.wasted), 0);
  const totalReturned  = products.reduce((s, p) => s + toNumber(p.returned), 0);

  const showToast = (message: string, type: "success" | "error") => setToast({ message, type });

  // ── Submit Withdrawal → POST /api/stock-status ─────────────────────────
  async function submitWithdrawal() {
    const qty = parseFloat(wdQty);
    if (!qty || qty <= 0 || wdProductId === null) return;
    const product = products.find(p => p.product_id === wdProductId);
    if (!product) return;

    setSubmitting(true);
    try {
      const newRecord = await api.postWithdrawal({
        product_id:  wdProductId,
        type:        wdType,
        quantity:    qty,
        recorded_by: "Admin", // TODO: replace with logged-in user from auth context
      });

      setWithdrawals(prev => [newRecord, ...prev]);

      // Update inventory stock locally (optimistic), then sync PUT /api/inventory/:id
      const updatedStock = wdType === "return"
        ? +(product.mainStock + qty).toFixed(2)
        : Math.max(0, +(product.mainStock - qty).toFixed(2));

      await api.updateStock(product.inventory_id, {
        stock:           updatedStock,
        daily_withdrawn: wdType === "return"
          ? Math.max(0, +(product.dailyWithdrawn - qty).toFixed(2))
          : +(product.dailyWithdrawn + qty).toFixed(2),
        returned: wdType === "return" ? +(product.returned + qty).toFixed(2) : product.returned,
      });

      setProducts(prev => prev.map(p => {
        if (p.product_id !== wdProductId) return p;
        if (wdType === "return") {
          return { ...p, mainStock: updatedStock, returned: +(p.returned + qty).toFixed(2), dailyWithdrawn: Math.max(0, +(p.dailyWithdrawn - qty).toFixed(2)) };
        }
        return { ...p, mainStock: updatedStock, dailyWithdrawn: +(p.dailyWithdrawn + qty).toFixed(2) };
      }));

      setWdQty("");
      showToast("Withdrawal recorded successfully!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to submit withdrawal.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Submit Spoilage → POST /api/stock-status/spoilage ─────────────────
  async function submitSpoilage() {
    const qty = parseFloat(adjQty);
    if (!qty || qty <= 0 || adjProductId === null) return;
    const product = products.find(p => p.product_id === adjProductId);
    if (!product) return;

    setSubmitting(true);
    try {
      await api.postSpoilage({ product_id: adjProductId, quantity: qty, recorded_by: "Admin" });

      const updatedStock = Math.max(0, +(product.mainStock - qty).toFixed(2));
      await api.updateStock(product.inventory_id, { stock: updatedStock, wasted: +(product.wasted + qty).toFixed(2) });

      setProducts(prev => prev.map(p =>
        p.product_id === adjProductId
          ? { ...p, mainStock: updatedStock, wasted: +(p.wasted + qty).toFixed(2) }
          : p
      ));
      setAdjQty("");
      showToast("Spoilage recorded.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to record spoilage.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── End-of-Day Reconciliation (Bulk Return) ────────────────────────────
  function openReconcile() {
    const items = products
      .filter(p => p.dailyWithdrawn > 0)
      .map(p => ({ product_id: p.product_id, product_name: p.product_name, unit: p.unit, withdrawn: p.dailyWithdrawn, returnQty: "" }));
    setReconcileItems(items);
    setShowReconcile(true);
  }

  async function submitReconciliation() {
    const validItems = reconcileItems.filter(i => parseFloat(i.returnQty) > 0);
    if (validItems.length === 0) return;
    setSubmitting(true);
    try {
      for (const item of validItems) {
        const qty = parseFloat(item.returnQty);
        const product = products.find(p => p.product_id === item.product_id);
        if (!product) continue;

        await api.postWithdrawal({ product_id: item.product_id, type: "return", quantity: qty, recorded_by: "Admin" });
        const updatedStock = +(product.mainStock + qty).toFixed(2);
        await api.updateStock(product.inventory_id, {
          stock:           updatedStock,
          daily_withdrawn: Math.max(0, +(product.dailyWithdrawn - qty).toFixed(2)),
          returned:        +(product.returned + qty).toFixed(2),
        });
        setProducts(prev => prev.map(p =>
          p.product_id === item.product_id
            ? { ...p, mainStock: updatedStock, returned: +(p.returned + qty).toFixed(2), dailyWithdrawn: Math.max(0, +(p.dailyWithdrawn - qty).toFixed(2)) }
            : p
        ));
      }
      setShowReconcile(false);
      showToast(`${validItems.length} item(s) reconciled and returned to stock.`, "success");
      await fetchAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reconciliation failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Add Supplier → POST /api/suppliers ───────────────────────────────
  async function addSupplier() {
    if (!supplierForm.supplier_name.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.postSupplier(supplierForm);
      setSuppliers(prev => [...prev, created]);
      setSupplierForm(BLANK_SUPPLIER);
      setShowSupplierForm(false);
      showToast("Supplier added successfully!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add supplier.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Remove Supplier → DELETE /api/suppliers/:id ───────────────────────
  async function removeSupplier(id: number) {
    try {
      await api.deleteSupplier(id);
      setSuppliers(prev => prev.filter(s => s.supplier_id !== id));
      showToast("Supplier removed.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove supplier.", "error");
    }
  }

  function setSupplierField(field: SupplierField, value: string) {
    setSupplierForm(prev => ({ ...prev, [field]: value }));
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }} className="min-h-screen bg-[#f5f6fa]">
      <Sidebar />

      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
        <div className="pl-25 pr-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Stock Manager</h2>
            <p className="text-xs text-slate-400 font-light mt-0.5">
              {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openReconcile}
              className="px-4 py-2 text-xs font-semibold bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors">
              End-of-Day Reconciliation
            </button>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <span className={`w-2 h-2 rounded-full ${isLoading ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ animation: "pulse 2s infinite" }} />
              <span className="text-xs font-medium text-slate-600">{clock}</span>
            </div>
          </div>
        </div>

        {/* Tab pills */}
        <div className="pb-3 flex items-center justify-center gap-2">
          {TABS.map(t => {
            const badge  = t.id === "alerts" ? lowStock.length : t.id === "critical" ? criticalStock.length : 0;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ fontFamily: "'Poppins', sans-serif" }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                  active
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}>
                {t.label}
                {badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    active ? "bg-white/20 text-white"
                      : t.id === "critical" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="px-8 py-8">
        {error && <div className="mb-6"><ErrorBanner message={error} onRetry={fetchAll} /></div>}

        {isLoading ? <LoadingSkeleton /> : (
          <AnimatePresence mode="wait">

            {/* ── DASHBOARD ─────────────────────────────────────────────── */}
            {tab === "dashboard" && (
              <motion.div key="dashboard" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-6">

                  {/* KPI Cards */}
                  <motion.div variants={staggerVariants} className="grid grid-cols-4 gap-4">
                    {([
                      { label: "Total Products",  value: products.length.toString(), sub: "in inventory",   accent: "slate"   },
                      { label: "Withdrawn Today", value: totalWithdrawn.toFixed(1),  sub: "units pulled",   accent: "indigo"  },
                      { label: "Wasted Today",    value: totalWasted.toFixed(2),     sub: "units spoiled",  accent: "rose"    },
                      { label: "Returned Today",  value: totalReturned.toFixed(2),   sub: "units returned", accent: "emerald" },
                    ] as { label: string; value: string; sub: string; accent: string }[]).map(k => {
                      const ac = KPI_ACCENT[k.accent];
                      return (
                        <motion.div key={k.label} variants={itemVariants}
                          className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${ac.border}`}>
                          <p className="text-xs text-slate-400 font-medium">{k.label}</p>
                          <p className={`text-3xl font-bold mt-1 leading-none ${ac.value}`}>{k.value}</p>
                          <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  {/* Inventory Table */}
                  <motion.div variants={itemVariants}>
                    <SectionCard title="Main Stock Levels" subtitle="Live overview from Inventory table">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {["Item","Category","Main Stock","Qty Purchased","Withdrawn","Wasted","Returned","Level","Status"].map(h => (
                              <th key={h} className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${["Item","Category"].includes(h) ? "text-left" : h === "Status" ? "text-center" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p, i) => {
                            const status = getStockStatus(p);
                            const pct    = Math.min(100, (p.mainStock / Math.max(1, p.reorderPoint * 2)) * 100);
                            return (
                              <tr key={p.inventory_id}
                                style={{ opacity: 0, animation: `fadeInRow 0.28s ease forwards`, animationDelay: `${i * 0.04}s` }}
                                className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                                    <span className="font-medium text-slate-800">{p.product_name}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-slate-400 text-xs">{p.category}</td>
                                <td className="py-3.5 px-4 text-right font-semibold text-slate-700">{p.mainStock} <span className="text-slate-400 font-normal text-xs">{p.unit}</span></td>
                                <td className="py-3.5 px-4 text-right text-slate-500">{p.item_purchased}</td>
                                <td className="py-3.5 px-4 text-right text-indigo-500 font-medium">{p.dailyWithdrawn}</td>
                                <td className="py-3.5 px-4 text-right text-rose-400 font-medium">{p.wasted}</td>
                                <td className="py-3.5 px-4 text-right text-emerald-500 font-medium">{p.returned}</td>
                                <td className="py-3.5 px-4 w-32">
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <motion.div className={`h-full rounded-full ${STATUS_BAR[status]}`}
                                      initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                      transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }} />
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize ${STATUS_BADGE[status]}`}>{status}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </SectionCard>
                  </motion.div>

                  {/* Bottom row */}
                  <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
                    {/* Last update tracker */}
                    <SectionCard title="Last Inventory Updates" subtitle="Most recently updated items (Inventory.Last_Update)">
                      <div className="divide-y divide-slate-50">
                        {[...products]
                          .sort((a, b) => new Date(b.last_update).getTime() - new Date(a.last_update).getTime())
                          .slice(0, 6)
                          .map((p, i) => (
                          <motion.div key={p.inventory_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.07 }}
                            className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-slate-700">{p.product_name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{p.supplier_name}</p>
                            </div>
                            <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                              {new Date(p.last_update).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </SectionCard>

                    {/* Record Spoilage */}
                    <SectionCard title="Record Spoilage" subtitle="Log wasted items — updates Inventory.Stock">
                      <div className="p-5 space-y-4">
                        <FormField label="Select Item">
                          <StyledSelect value={adjProductId ?? ""} onChange={v => setAdjProductId(Number(v))}>
                            {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                          </StyledSelect>
                        </FormField>
                        <FormField label="Quantity Wasted">
                          <StyledInput type="number" value={adjQty} onChange={setAdjQty} placeholder="Enter amount" />
                        </FormField>
                        <Btn onClick={submitSpoilage} variant="danger" loading={submitting}>
                          {submitting ? "Saving..." : "Record Spoilage"}
                        </Btn>
                      </div>
                    </SectionCard>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* ── WITHDRAWAL ────────────────────────────────────────────── */}
            {tab === "withdrawal" && (
              <motion.div key="withdrawal" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-6">
                  <motion.div variants={itemVariants} className="grid grid-cols-2 gap-6">

                    {/* Withdrawal Form */}
                    <SectionCard title="New Withdrawal Record" subtitle="Posts to Stock_Status table">
                      <div className="p-5 space-y-4">
                        {/* Type selector */}
                        <FormField label="Record Type">
                          <div className="grid grid-cols-3 gap-2">
                            {WITHDRAWAL_TYPES.map(t => (
                              <button key={t} onClick={() => setWdType(t)}
                                className={`py-2.5 text-xs font-semibold rounded-xl border capitalize transition-all duration-200 ${
                                  wdType === t
                                    ? "bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/20"
                                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                                }`}>{t}</button>
                            ))}
                          </div>
                        </FormField>

                        {/* Type descriptions */}
                        <div className={`text-xs px-3 py-2 rounded-xl border ${
                          wdType === "initial"       ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                          wdType === "supplementary" ? "bg-sky-50 text-sky-600 border-sky-100" :
                                                       "bg-emerald-50 text-emerald-600 border-emerald-100"
                        }`}>
                          {wdType === "initial"       && "Initial pull for today's kitchen preparation."}
                          {wdType === "supplementary" && "Additional pull if the initial batch was insufficient."}
                          {wdType === "return"        && "Returning unused/leftover stock back to main storage."}
                        </div>

                        <FormField label="Select Item">
                          <StyledSelect value={wdProductId ?? ""} onChange={v => setWdProductId(Number(v))}>
                            {products.map(p => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.product_name} ({p.mainStock} {p.unit})
                              </option>
                            ))}
                          </StyledSelect>
                        </FormField>
                        <FormField label="Quantity">
                          <StyledInput type="number" value={wdQty} onChange={setWdQty} placeholder="Enter amount" />
                        </FormField>
                        <Btn onClick={submitWithdrawal} variant="primary" loading={submitting}>
                          {submitting ? "Saving..." : "Submit Record"}
                        </Btn>
                      </div>
                    </SectionCard>

                    {/* Today's log */}
                    <SectionCard title="Today's Stock_Status Log" subtitle={`${withdrawals.length} entries from API`}>
                      {withdrawals.length === 0 ? (
                        <EmptyState message="No withdrawals recorded today." />
                      ) : (
                        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                          <AnimatePresence>
                            {withdrawals.map(w => (
                              <motion.div key={w.status_id}
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.28 }}
                                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors">
                                <div>
                                  <p className="text-sm font-medium text-slate-700">{w.product_name}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {new Date(w.status_date).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                                    {w.recorded_by && <> · <span className="text-slate-500">{w.recorded_by}</span></>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2.5">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_BADGE[w.type]}`}>{w.type}</span>
                                  <span className={`text-sm font-semibold ${w.type === "return" ? "text-emerald-500" : "text-slate-700"}`}>
                                    {w.type === "return" ? "+" : "−"}{w.quantity}
                                  </span>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      )}
                    </SectionCard>
                  </motion.div>

                  {/* Currently withdrawn */}
                  <motion.div variants={itemVariants}>
                    <SectionCard title="Currently Withdrawn" subtitle="Stock pulled for today's preparation — net of returns">
                      {products.filter(p => p.dailyWithdrawn > 0).length === 0 ? (
                        <EmptyState message="No stock withdrawn today." />
                      ) : (
                        <div className="grid grid-cols-4 divide-x divide-slate-100">
                          {products.filter(p => p.dailyWithdrawn > 0).map((p, i) => (
                            <motion.div key={p.inventory_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                              className="p-5 hover:bg-slate-50/50 transition-colors">
                              <p className="text-xs text-slate-400 truncate font-medium">{p.product_name}</p>
                              <p className="text-2xl font-bold text-slate-800 mt-1.5 leading-none">
                                {p.dailyWithdrawn}<span className="text-sm text-slate-400 font-normal ml-1">{p.unit}</span>
                              </p>
                              <p className="text-xs text-slate-400 mt-1.5">Returned: <span className="text-emerald-500 font-medium">{p.returned} {p.unit}</span></p>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* ── ALERTS ────────────────────────────────────────────────── */}
            {tab === "alerts" && (
              <motion.div key="alerts" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-4">
                  <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-5 border border-t-4 border-amber-300 shadow-sm">
                      <p className="text-xs text-slate-400 font-medium">Low Stock Items</p>
                      <p className="text-3xl font-bold text-amber-500 mt-1">{lowStock.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-t-4 border-red-300 shadow-sm">
                      <p className="text-xs text-slate-400 font-medium">Critical Items</p>
                      <p className="text-3xl font-bold text-red-500 mt-1">{criticalStock.length}</p>
                    </div>
                  </motion.div>

                  {lowStock.length === 0 && criticalStock.length === 0 ? (
                    <motion.div variants={itemVariants}><EmptyState message="All stock levels are within safe range." /></motion.div>
                  ) : (
                    [...criticalStock, ...lowStock].map((p, i) => {
                      const status  = getStockStatus(p);
                      const deficit = +(p.reorderPoint - p.mainStock).toFixed(2);
                      return (
                        <motion.div key={p.inventory_id} variants={itemVariants} transition={{ delay: i * 0.06 }}
                          className={`bg-white rounded-2xl border border-t-4 p-5 flex items-center justify-between shadow-sm ${
                            status === "critical" ? "border-red-200 border-t-red-400" : "border-amber-200 border-t-amber-400"
                          }`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${status === "critical" ? "bg-red-50" : "bg-amber-50"}`}>
                              <span className={`text-sm font-bold ${status === "critical" ? "text-red-500" : "text-amber-500"}`}>!</span>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{p.product_name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{p.category} · {p.supplier_name}</p>
                              <p className={`text-xs font-medium mt-1 ${status === "critical" ? "text-red-500" : "text-amber-500"}`}>
                                {deficit > 0 ? `Need ${deficit} ${p.unit} to reach reorder point` : "Below critical threshold"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${status === "critical" ? "text-red-500" : "text-amber-500"}`}>
                              {p.mainStock} <span className="text-sm font-normal text-slate-400">{p.unit}</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Reorder at {p.reorderPoint} · Critical at {p.criticalPoint}</p>
                            <span className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${STATUS_BADGE[status]}`}>
                              {status === "critical" ? "Restock Now" : "Reorder Soon"}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </motion.div>
              </motion.div>
            )}

            {/* ── SUPPLIERS ─────────────────────────────────────────────── */}
            {tab === "suppliers" && (
              <motion.div key="suppliers" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-5">
                  <motion.div variants={itemVariants} className="flex justify-end">
                    <button onClick={() => setShowSupplierForm(f => !f)}
                      className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-all duration-200 shadow-md shadow-slate-900/20">
                      {showSupplierForm ? "Cancel" : "Add Supplier"}
                    </button>
                  </motion.div>

                  <AnimatePresence>
                    {showSupplierForm && (
                      <motion.div key="sup-form"
                        initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.22 }}>
                        <SectionCard title="New Supplier" subtitle="Posts to Suppliers table">
                          <div className="p-5 grid grid-cols-3 gap-4">
                            {SUPPLIER_FIELDS.map(({ key, label, placeholder }) => (
                              <FormField key={key} label={label}>
                                <StyledInput type="text" value={(supplierForm[key] as string) ?? ""} onChange={v => setSupplierField(key, v)} placeholder={placeholder} />
                              </FormField>
                            ))}
                            <div className="col-span-3 pt-1">
                              <Btn onClick={addSupplier} variant="primary" loading={submitting}>
                                {submitting ? "Saving..." : "Save Supplier"}
                              </Btn>
                            </div>
                          </div>
                        </SectionCard>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Suppliers table */}
                  <motion.div variants={itemVariants}>
                    <SectionCard title="Supplier Directory" subtitle={`${suppliers.length} suppliers from Suppliers table`}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {["Supplier ID","Company","Contact Number","Products Supplied","Delivery Schedule",""].map(h => (
                              <th key={h} className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {suppliers.map((s, i) => (
                            <tr key={s.supplier_id}
                              style={{ opacity: 0, animation: `fadeInRow 0.28s ease forwards`, animationDelay: `${i * 0.04}s` }}
                              className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 px-4 text-xs text-slate-400 font-mono">#{s.supplier_id}</td>
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-slate-800">{s.supplier_name}</p>
                                {s.email && <p className="text-xs text-slate-400">{s.email}</p>}
                              </td>
                              <td className="py-3.5 px-4 text-slate-600 text-xs">{s.contact_number}</td>
                              <td className="py-3.5 px-4 text-slate-600 text-xs">{s.products_supplied ?? "—"}</td>
                              <td className="py-3.5 px-4">
                                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">{s.delivery_schedule}</span>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button onClick={() => removeSupplier(s.supplier_id)}
                                  className="text-xs text-slate-300 hover:text-red-400 transition-colors font-medium">Remove</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {suppliers.length === 0 && <EmptyState message="No suppliers found." />}
                    </SectionCard>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* ── REPORTS ───────────────────────────────────────────────── */}
            {tab === "reports" && (
              <motion.div key="reports" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-6">

                  {/* Report KPIs */}
                  <motion.div variants={staggerVariants} className="grid grid-cols-3 gap-4">
                    {([
                      { label: "Total Sales (Reports)",       value: `₱${reports.reduce((s,r) => s+r.total_sales, 0).toLocaleString()}`, accent: "emerald" },
                      { label: "Total Transactions",          value: reports.reduce((s,r) => s+r.total_transaction, 0).toString(),        accent: "indigo"  },
                      { label: "Total Wasted (Inventory)",    value: totalWasted.toFixed(2),                                              accent: "rose"    },
                    ] as { label: string; value: string; accent: string }[]).map(k => {
                      const ac = KPI_ACCENT[k.accent];
                      return (
                        <motion.div key={k.label} variants={itemVariants}
                          className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${ac.border}`}>
                          <p className="text-xs text-slate-400 font-medium">{k.label}</p>
                          <p className={`text-3xl font-bold mt-1 leading-none ${ac.value}`}>{k.value}</p>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  {/* Reports table from DB */}
                  <motion.div variants={itemVariants}>
                    <SectionCard title="Generated Reports" subtitle="From Reports table — report history">
                      {reports.length === 0 ? (
                        <EmptyState message="No reports generated yet." />
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              {["Report ID","Type","Total Sales","Transactions","Generated At"].map(h => (
                                <th key={h} className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${h === "Type" || h === "Report ID" || h === "Generated At" ? "text-left" : "text-right"}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {reports.map((r, i) => (
                              <tr key={r.report_id}
                                style={{ opacity: 0, animation: `fadeInRow 0.28s ease forwards`, animationDelay: `${i * 0.04}s` }}
                                className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                                <td className="py-3.5 px-4 text-xs text-slate-400 font-mono">#{r.report_id}</td>
                                <td className="py-3.5 px-4">
                                  <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg capitalize">{r.report_type}</span>
                                </td>
                                <td className="py-3.5 px-4 text-right text-emerald-600 font-semibold">₱{r.total_sales.toLocaleString()}</td>
                                <td className="py-3.5 px-4 text-right text-indigo-600 font-medium">{r.total_transaction}</td>
                                <td className="py-3.5 px-4 text-slate-500 text-xs">
                                  {new Date(r.generated_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </SectionCard>
                  </motion.div>

                  {/* Consumption summary */}
                  <motion.div variants={itemVariants}>
                    <SectionCard title="Consumption Summary" subtitle="Detailed breakdown per Inventory item">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {["Item","Qty Purchased","Used","Remaining","Wasted","Waste %","Movement"].map(h => (
                              <th key={h} className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${h === "Item" ? "text-left" : h === "Movement" ? "text-center" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p, i) => {
                            const wastePercent = p.dailyWithdrawn > 0 ? ((p.wasted / p.dailyWithdrawn) * 100).toFixed(1) : "0.0";
                            const isFast = p.dailyWithdrawn >= 3;
                            return (
                              <tr key={p.inventory_id}
                                style={{ opacity: 0, animation: `fadeInRow 0.28s ease forwards`, animationDelay: `${i * 0.04}s` }}
                                className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                                <td className="py-3.5 px-4 font-medium text-slate-800">{p.product_name}</td>
                                <td className="py-3.5 px-4 text-right text-slate-500">{p.item_purchased}</td>
                                <td className="py-3.5 px-4 text-right text-indigo-500 font-medium">{p.dailyWithdrawn}</td>
                                <td className="py-3.5 px-4 text-right font-semibold text-slate-700">{p.mainStock}</td>
                                <td className="py-3.5 px-4 text-right text-rose-400 font-medium">{p.wasted}</td>
                                <td className="py-3.5 px-4 text-right text-slate-400">{wastePercent}%</td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isFast ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                                    {isFast ? "Fast" : "Slow"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </SectionCard>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* ── CRITICAL ──────────────────────────────────────────────── */}
            {tab === "critical" && (
              <motion.div key="critical" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-4">
                  {criticalStock.length === 0 ? (
                    <motion.div variants={itemVariants}><EmptyState message="No items in critical condition." /></motion.div>
                  ) : (
                    criticalStock.map((p, i) => (
                      <motion.div key={p.inventory_id} variants={itemVariants} transition={{ delay: i * 0.07 }}
                        className="bg-white border border-slate-100 border-t-4 border-t-red-400 rounded-2xl p-6 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
                            <span className="text-red-500 font-bold text-lg">!</span>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-base">{p.product_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{p.category} · Last update: {new Date(p.last_update).toLocaleDateString("en-PH")}</p>
                            <p className="text-xs text-slate-500 mt-1">Supplier: <span className="font-semibold text-slate-700">{p.supplier_name}</span></p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-red-500">{p.mainStock}<span className="text-sm text-slate-400 font-normal ml-1">{p.unit}</span></p>
                          <p className="text-xs text-slate-400 mt-1">Critical at {p.criticalPoint} · Reorder at {p.reorderPoint}</p>
                          <span className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-600">Immediate Action Required</span>
                        </div>
                      </motion.div>
                    ))
                  )}

                  <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">About Critical Stock</p>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Items shown here have fallen below their defined critical threshold in the Inventory table. Contact suppliers immediately and prioritize restocking to prevent production downtime.
                    </p>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </main>

      {/* ── End-of-Day Reconciliation Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showReconcile && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">End-of-Day Reconciliation</p>
                  <p className="text-xs text-slate-400 mt-0.5">Record leftover stock returned to main storage</p>
                </div>
                <button onClick={() => setShowReconcile(false)} className="text-slate-400 hover:text-slate-600 transition-colors text-lg">✕</button>
              </div>
              <div className="p-6 space-y-3 max-h-96 overflow-y-auto">
                {reconcileItems.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No items currently withdrawn.</p>
                ) : (
                  reconcileItems.map((item, i) => (
                    <div key={item.product_id} className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 rounded-xl">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{item.product_name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Withdrawn: {item.withdrawn} {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2 w-48">
                        <label className="text-xs text-slate-500 whitespace-nowrap">Return qty:</label>
                        <input
                          type="number" value={item.returnQty} placeholder="0"
                          max={item.withdrawn}
                          onChange={e => setReconcileItems(prev => prev.map((r, j) => j === i ? { ...r, returnQty: e.target.value } : r))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                        />
                        <span className="text-xs text-slate-400">{item.unit}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button onClick={() => setShowReconcile(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                <button onClick={submitReconciliation} disabled={submitting}
                  className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60">
                  {submitting ? "Saving..." : "Confirm Returns"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
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

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function StyledInput({ type, value, onChange, placeholder }: {
  type: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200"
    />
  );
}

function StyledSelect({ value, onChange, children, disabled = false }: {
  value: number | string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
      {children}
    </select>
  );
}

function Btn({ onClick, variant, loading = false, children }: {
  onClick: () => void; variant: "primary" | "danger"; loading?: boolean; children: ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${
        variant === "primary"
          ? "bg-slate-900 text-white hover:bg-slate-700 shadow-slate-900/20"
          : "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20"
      }`}>
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}