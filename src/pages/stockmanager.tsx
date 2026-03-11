import React, { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence, type Variants, type Transition } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";

// ── Google Fonts: Poppins (injected inside component) ─────────────────────
// moved into StockManager's useEffect — see below

// ── Types ──────────────────────────────────────────────────────────────────
type Category       = "Dry Goods" | "Dairy" | "Produce" | "Meat" | "Beverages" | "Condiments";
type Unit           = "kg" | "L" | "pcs" | "g" | "ml";
type WithdrawalType = "initial" | "supplementary" | "return";
type StockStatus    = "critical" | "low" | "normal";
type Tab            = "dashboard" | "withdrawal" | "alerts" | "suppliers" | "reports" | "critical";
type SupplierField  = keyof Omit<Supplier, "id">;

interface Product {
  id: number;
  name: string;
  category: Category;
  unit: Unit;
  mainStock: number;
  reorderPoint: number;
  criticalPoint: number;
  supplier: string;
  lastDelivery: string;
  dailyWithdrawn: number;
  returned: number;
  wasted: number;
}

interface Delivery {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  date: string;
  supplier: string;
}

interface Withdrawal {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  type: WithdrawalType;
  time: string;
}

interface Supplier {
  id: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  products: string;
  deliverySchedule: string;
}

// ── Mock Data (replace with API calls later) ───────────────────────────────
const MOCK_PRODUCTS: Product[] = [
  { id: 1,  name: "All-Purpose Flour",  category: "Dry Goods",  unit: "kg",  mainStock: 12,   reorderPoint: 20,  criticalPoint: 8,   supplier: "FreshMill Co.",      lastDelivery: "2026-03-09", dailyWithdrawn: 5.5, returned: 0.5, wasted: 0.2 },
  { id: 2,  name: "White Sugar",        category: "Dry Goods",  unit: "kg",  mainStock: 6,    reorderPoint: 15,  criticalPoint: 5,   supplier: "SugarCane PH",       lastDelivery: "2026-03-08", dailyWithdrawn: 2.0, returned: 0,   wasted: 0.1 },
  { id: 3,  name: "Fresh Milk",         category: "Dairy",      unit: "L",   mainStock: 4,    reorderPoint: 10,  criticalPoint: 3,   supplier: "DairyFresh Inc.",     lastDelivery: "2026-03-10", dailyWithdrawn: 3.0, returned: 0,   wasted: 0.5 },
  { id: 4,  name: "Butter",             category: "Dairy",      unit: "kg",  mainStock: 2.5,  reorderPoint: 5,   criticalPoint: 2,   supplier: "DairyFresh Inc.",     lastDelivery: "2026-03-07", dailyWithdrawn: 1.0, returned: 0,   wasted: 0.0 },
  { id: 5,  name: "Eggs",               category: "Dairy",      unit: "pcs", mainStock: 144,  reorderPoint: 100, criticalPoint: 48,  supplier: "EggBasket PH",       lastDelivery: "2026-03-10", dailyWithdrawn: 36,  returned: 0,   wasted: 2.0 },
  { id: 6,  name: "Tomatoes",           category: "Produce",    unit: "kg",  mainStock: 3,    reorderPoint: 8,   criticalPoint: 3,   supplier: "FarmDirect Veggies", lastDelivery: "2026-03-10", dailyWithdrawn: 2.5, returned: 0,   wasted: 0.3 },
  { id: 7,  name: "Onions",             category: "Produce",    unit: "kg",  mainStock: 18,   reorderPoint: 10,  criticalPoint: 5,   supplier: "FarmDirect Veggies", lastDelivery: "2026-03-09", dailyWithdrawn: 1.5, returned: 0,   wasted: 0.1 },
  { id: 8,  name: "Chicken Breast",     category: "Meat",       unit: "kg",  mainStock: 5,    reorderPoint: 12,  criticalPoint: 4,   supplier: "MeatMasters PH",     lastDelivery: "2026-03-10", dailyWithdrawn: 4.0, returned: 0.5, wasted: 0.2 },
  { id: 9,  name: "Pork Belly",         category: "Meat",       unit: "kg",  mainStock: 8,    reorderPoint: 10,  criticalPoint: 4,   supplier: "MeatMasters PH",     lastDelivery: "2026-03-09", dailyWithdrawn: 3.5, returned: 0,   wasted: 0.1 },
  { id: 10, name: "Soy Sauce",          category: "Condiments", unit: "L",   mainStock: 6,    reorderPoint: 5,   criticalPoint: 2,   supplier: "CondimentKing PH",   lastDelivery: "2026-03-05", dailyWithdrawn: 0.5, returned: 0,   wasted: 0.0 },
  { id: 11, name: "Cooking Oil",        category: "Condiments", unit: "L",   mainStock: 9,    reorderPoint: 8,   criticalPoint: 4,   supplier: "CondimentKing PH",   lastDelivery: "2026-03-06", dailyWithdrawn: 1.0, returned: 0,   wasted: 0.0 },
  { id: 12, name: "Mineral Water",      category: "Beverages",  unit: "L",   mainStock: 50,   reorderPoint: 30,  criticalPoint: 10,  supplier: "AquaPure PH",        lastDelivery: "2026-03-08", dailyWithdrawn: 10,  returned: 0,   wasted: 0.0 },
];

const MOCK_DELIVERIES: Delivery[] = [
  { id: 1, productId: 1,  productName: "All-Purpose Flour",  quantity: 25,  date: "Mar 9",  supplier: "FreshMill Co."      },
  { id: 2, productId: 3,  productName: "Fresh Milk",         quantity: 10,  date: "Mar 10", supplier: "DairyFresh Inc."    },
  { id: 3, productId: 5,  productName: "Eggs",               quantity: 180, date: "Mar 10", supplier: "EggBasket PH"       },
  { id: 4, productId: 8,  productName: "Chicken Breast",     quantity: 10,  date: "Mar 10", supplier: "MeatMasters PH"     },
  { id: 5, productId: 6,  productName: "Tomatoes",           quantity: 8,   date: "Mar 10", supplier: "FarmDirect Veggies" },
];

const MOCK_WITHDRAWALS: Withdrawal[] = [
  { id: 1, productId: 1, productName: "All-Purpose Flour", quantity: 3.5, type: "initial",       time: "08:15 AM" },
  { id: 2, productId: 8, productName: "Chicken Breast",    quantity: 2.0, type: "initial",       time: "09:00 AM" },
  { id: 3, productId: 3, productName: "Fresh Milk",        quantity: 1.5, type: "initial",       time: "09:30 AM" },
  { id: 4, productId: 5, productName: "Eggs",              quantity: 12,  type: "supplementary", time: "11:00 AM" },
  { id: 5, productId: 8, productName: "Chicken Breast",    quantity: 0.5, type: "return",        time: "12:30 PM" },
];

const MOCK_SUPPLIERS: Supplier[] = [
  { id: 1, name: "FreshMill Co.",      contact: "Ramon Aquino",   email: "ramon@freshmill.ph",     phone: "0917-123-4567", products: "Flour, Cornstarch, Breadcrumbs",   deliverySchedule: "Mon, Thu"       },
  { id: 2, name: "DairyFresh Inc.",    contact: "Maria Santos",   email: "maria@dairyfresh.ph",    phone: "0918-234-5678", products: "Milk, Butter, Cream, Cheese",      deliverySchedule: "Tue, Fri"       },
  { id: 3, name: "EggBasket PH",       contact: "Jose Reyes",     email: "jose@eggbasket.ph",      phone: "0919-345-6789", products: "Eggs (white, brown)",              deliverySchedule: "Mon, Wed, Fri"  },
  { id: 4, name: "FarmDirect Veggies", contact: "Linda Cruz",     email: "linda@farmdirect.ph",    phone: "0920-456-7890", products: "Tomatoes, Onions, Garlic, Greens", deliverySchedule: "Daily"          },
  { id: 5, name: "MeatMasters PH",     contact: "Carlos Dela Vega",email: "carlos@meatmasters.ph", phone: "0921-567-8901", products: "Chicken, Pork, Beef",              deliverySchedule: "Mon, Wed, Fri"  },
];

// ── Constants (UI-only) ────────────────────────────────────────────────────
const BLANK_SUPPLIER: Omit<Supplier, "id"> = {
  name: "", contact: "", email: "", phone: "", products: "", deliverySchedule: "",
};

const SUPPLIER_FIELDS: { key: SupplierField; label: string; placeholder: string }[] = [
  { key: "name",             label: "Company Name",      placeholder: "e.g. FreshMill Co."   },
  { key: "contact",          label: "Contact Person",    placeholder: "e.g. Juan dela Cruz"  },
  { key: "email",            label: "Email Address",     placeholder: "e.g. juan@company.ph" },
  { key: "phone",            label: "Phone Number",      placeholder: "e.g. 0917-123-4567"   },
  { key: "products",         label: "Supplied Products", placeholder: "e.g. Flour, Sugar"    },
  { key: "deliverySchedule", label: "Delivery Schedule", placeholder: "e.g. Mon, Wed, Fri"   },
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

// ── Status helpers ─────────────────────────────────────────────────────────
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

// ── Framer Motion presets ──────────────────────────────────────────────────
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

function rowAnim(_i: number) { return {}; } // kept for compatibility, no longer used for motion.tr

// ── Loading Skeleton ───────────────────────────────────────────────────────
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

// ── Error Banner ───────────────────────────────────────────────────────────
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

// ── Main Component ─────────────────────────────────────────────────────────
export default function StockManager() {
  const [tab, setTab] = useState<Tab>("dashboard");

  // ── Data state ────────────────────────────────────────────────────────
  const [products,    setProducts]    = useState<Product[]>([]);
  const [deliveries,  setDeliveries]  = useState<Delivery[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [suppliers,   setSuppliers]   = useState<Supplier[]>([]);

  // ── UI / loading state ─────────────────────────────────────────────────
  const [isLoading,  setIsLoading]  = useState<boolean>(true);
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ── Form state ─────────────────────────────────────────────────────────
  const [wdProductId,  setWdProductId]  = useState<number | null>(null);
  const [wdQty,        setWdQty]        = useState<string>("");
  const [wdType,       setWdType]       = useState<WithdrawalType>("initial");
  const [adjProductId, setAdjProductId] = useState<number | null>(null);
  const [adjQty,       setAdjQty]       = useState<string>("");

  const [showSupplierForm, setShowSupplierForm] = useState<boolean>(false);
  const [supplierForm,     setSupplierForm]     = useState<Omit<Supplier, "id">>(BLANK_SUPPLIER);

  // ── Google Fonts + keyframes ───────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap";
    document.head.appendChild(link);

    const style = document.createElement("style");
    style.innerHTML = `@keyframes fadeInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  // ── Live clock ─────────────────────────────────────────────────────────
  const [clock, setClock] = useState<string>(
    new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Load mock data (swap this out for real API calls later) ────────────
  async function fetchAll(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      // ── TODO: Replace these with your real API calls when backend is ready ──
      // const [productsRes, deliveriesRes, withdrawalsRes, suppliersRes] = await Promise.all([
      //   fetch("/api/products"),
      //   fetch("/api/deliveries"),
      //   fetch("/api/withdrawals/today"),
      //   fetch("/api/suppliers"),
      // ]);
      // const products    = await productsRes.json();
      // const deliveries  = await deliveriesRes.json();
      // const withdrawals = await withdrawalsRes.json();
      // const suppliers   = await suppliersRes.json();
      // ── END TODO ─────────────────────────────────────────────────────────

      // Simulate a brief network delay so the loading skeleton is visible
      await new Promise(res => setTimeout(res, 600));

      setProducts(MOCK_PRODUCTS);
      setDeliveries(MOCK_DELIVERIES);
      setWithdrawals(MOCK_WITHDRAWALS);
      setSuppliers(MOCK_SUPPLIERS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  // Set default selects once products load
  useEffect(() => {
    if (products.length > 0) {
      if (wdProductId === null)  setWdProductId(products[0].id);
      if (adjProductId === null) setAdjProductId(products[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // ── Derived values ─────────────────────────────────────────────────────
  const lowStock      = products.filter(p => getStockStatus(p) === "low");
  const criticalStock = products.filter(p => getStockStatus(p) === "critical");
  const normalStock   = products.filter(p => getStockStatus(p) === "normal");
  const totalWithdrawn = products.reduce((s, p) => s + p.dailyWithdrawn, 0);
  const totalWasted    = products.reduce((s, p) => s + p.wasted, 0);
  const totalReturned  = products.reduce((s, p) => s + p.returned, 0);

  // ── Actions (local state — wire to API later) ──────────────────────────

  async function submitWithdrawal(): Promise<void> {
    const qty = parseFloat(wdQty);
    if (!qty || qty <= 0 || wdProductId === null) return;
    const product = products.find(p => p.id === wdProductId);
    if (!product) return;

    setSubmitting(true);
    try {
      // TODO: POST /api/withdrawals  →  const newEntry: Withdrawal = await res.json();
      const now = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const newWithdrawal: Withdrawal = {
        id:          Date.now(),
        productId:   wdProductId,
        productName: product.name,
        quantity:    qty,
        type:        wdType,
        time:        now,
      };
      setWithdrawals(prev => [newWithdrawal, ...prev]);

      // Update product stock locally
      // TODO: replace with GET /api/products/:id  after backend is ready
      setProducts(prev => prev.map(p => {
        if (p.id !== wdProductId) return p;
        if (wdType === "return") {
          return { ...p, mainStock: +(p.mainStock + qty).toFixed(2), returned: +(p.returned + qty).toFixed(2), dailyWithdrawn: Math.max(0, +(p.dailyWithdrawn - qty).toFixed(2)) };
        }
        return { ...p, mainStock: Math.max(0, +(p.mainStock - qty).toFixed(2)), dailyWithdrawn: +(p.dailyWithdrawn + qty).toFixed(2) };
      }));

      setWdQty("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit withdrawal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSpoilage(): Promise<void> {
    const qty = parseFloat(adjQty);
    if (!qty || qty <= 0 || adjProductId === null) return;

    setSubmitting(true);
    try {
      // TODO: POST /api/spoilage
      setProducts(prev => prev.map(p => {
        if (p.id !== adjProductId) return p;
        return { ...p, mainStock: Math.max(0, +(p.mainStock - qty).toFixed(2)), wasted: +(p.wasted + qty).toFixed(2) };
      }));
      setAdjQty("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record spoilage.");
    } finally {
      setSubmitting(false);
    }
  }

  async function addSupplier(): Promise<void> {
    if (!supplierForm.name.trim()) return;
    setSubmitting(true);
    try {
      // TODO: POST /api/suppliers  →  const created: Supplier = await res.json();
      const newSupplier: Supplier = { id: Date.now(), ...supplierForm };
      setSuppliers(prev => [...prev, newSupplier]);
      setSupplierForm(BLANK_SUPPLIER);
      setShowSupplierForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add supplier.");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSupplier(id: number): Promise<void> {
    try {
      // TODO: DELETE /api/suppliers/:id
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove supplier.");
    }
  }

  function setSupplierField(field: SupplierField, value: string): void {
    setSupplierForm(prev => ({ ...prev, [field]: value }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }} className="min-h-screen bg-[#f5f6fa]">

      <Sidebar />

        {/* Top bar */}
        <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
          {/* Title row */}
          <div className="pl-25 pr-8 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Stock Manager</h2>
              <p className="text-xs text-slate-400 font-light mt-0.5">
                {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <span className={`w-2 h-2 rounded-full ${isLoading ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ animation: "pulse 2s infinite" }} />
              <span className="text-xs font-medium text-slate-600">{clock}</span>
            </div>
          </div>

          {/* Pill tabs row — centered */}
          <div className="pb-3 flex items-center justify-center gap-2">
            {TABS.map((t) => {
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
                      active
                        ? "bg-white/20 text-white"
                        : t.id === "critical" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                    }`}>{badge}</span>
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

            {/* ── DASHBOARD ───────────────────────────────────────────── */}
            {tab === "dashboard" && (
              <motion.div key="dashboard" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-6">

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

                  <motion.div variants={itemVariants}>
                    <SectionCard title="Main Stock Levels" subtitle="Live overview of all inventory items">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {["Item","Category","Main Stock","Withdrawn","Wasted","Returned","Level","Status"].map(h => (
                              <th key={h} className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${["Item","Category"].includes(h) ? "text-left" : h === "Status" ? "text-center" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p, i) => {
                            const status = getStockStatus(p);
                            const pct    = Math.min(100, (p.mainStock / (p.reorderPoint * 2)) * 100);
                            const ra     = rowAnim(i);
                            return (
                              <tr key={p.id}
                                style={{ opacity: 0, animation: `fadeInRow 0.28s ease forwards`, animationDelay: `${i * 0.04}s` }}
                                className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                                    <span className="font-medium text-slate-800">{p.name}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-slate-400 text-xs">{p.category}</td>
                                <td className="py-3.5 px-4 text-right font-semibold text-slate-700">{p.mainStock} <span className="text-slate-400 font-normal text-xs">{p.unit}</span></td>
                                <td className="py-3.5 px-4 text-right text-indigo-500 font-medium">{p.dailyWithdrawn}</td>
                                <td className="py-3.5 px-4 text-right text-rose-400 font-medium">{p.wasted}</td>
                                <td className="py-3.5 px-4 text-right text-emerald-500 font-medium">{p.returned}</td>
                                <td className="py-3.5 px-4 w-32">
                                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <motion.div className={`h-full rounded-full ${STATUS_BAR[status]}`}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${pct}%` }}
                                      transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }}
                                    />
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

                  <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
                    <SectionCard title="Recent Deliveries" subtitle="Latest stock received">
                      <div className="divide-y divide-slate-50">
                        {deliveries.map((d, i) => (
                          <motion.div key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}
                            className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-slate-700">{d.productName}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{d.supplier} · {d.date}</p>
                            </div>
                            <span className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">+{d.quantity}</span>
                          </motion.div>
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard title="Record Spoilage" subtitle="Manually adjust for wasted items">
                      <div className="p-5 space-y-4">
                        <FormField label="Select Item">
                          <StyledSelect value={adjProductId ?? ""} onChange={v => setAdjProductId(Number(v))}>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

            {/* ── WITHDRAWAL ──────────────────────────────────────────── */}
            {tab === "withdrawal" && (
              <motion.div key="withdrawal" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-6">
                  <motion.div variants={itemVariants} className="grid grid-cols-2 gap-6">

                    <SectionCard title="New Withdrawal Record" subtitle="Log stock removed for kitchen preparation">
                      <div className="p-5 space-y-4">
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
                        <FormField label="Select Item">
                          <StyledSelect value={wdProductId ?? ""} onChange={v => setWdProductId(Number(v))}>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.mainStock} {p.unit})</option>)}
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

                    <SectionCard title="Today's Log" subtitle={`${withdrawals.length} entries recorded`}>
                      {withdrawals.length === 0 ? (
                        <EmptyState message="No withdrawals recorded today." />
                      ) : (
                        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                          <AnimatePresence>
                            {withdrawals.map(w => (
                              <motion.div key={w.id}
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.28, ease: "easeOut" }}
                                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors">
                                <div>
                                  <p className="text-sm font-medium text-slate-700">{w.productName}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{w.time}</p>
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

                  <motion.div variants={itemVariants}>
                    <SectionCard title="Currently Withdrawn" subtitle="Stock pulled for today's preparation">
                      {products.filter(p => p.dailyWithdrawn > 0).length === 0 ? (
                        <EmptyState message="No stock withdrawn today." />
                      ) : (
                        <div className="grid grid-cols-4 divide-x divide-slate-100">
                          {products.filter(p => p.dailyWithdrawn > 0).map((p, i) => (
                            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                              className="p-5 hover:bg-slate-50/50 transition-colors">
                              <p className="text-xs text-slate-400 truncate font-medium">{p.name}</p>
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

            {/* ── ALERTS ──────────────────────────────────────────────── */}
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
                        <motion.div key={p.id} variants={itemVariants} transition={{ delay: i * 0.06 }}
                          className={`bg-white rounded-2xl border border-t-4 p-5 flex items-center justify-between shadow-sm ${
                            status === "critical" ? "border-red-200 border-t-red-400" : "border-amber-200 border-t-amber-400"
                          }`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${status === "critical" ? "bg-red-50" : "bg-amber-50"}`}>
                              <span className={`text-sm font-bold ${status === "critical" ? "text-red-500" : "text-amber-500"}`}>!</span>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{p.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{p.category} · {p.supplier}</p>
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

            {/* ── SUPPLIERS ───────────────────────────────────────────── */}
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
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}    transition={{ duration: 0.22 }}>
                        <SectionCard title="New Supplier" subtitle="Add a new supplier to the records">
                          <div className="p-5 grid grid-cols-3 gap-4">
                            {SUPPLIER_FIELDS.map(({ key, label, placeholder }) => (
                              <FormField key={key} label={label}>
                                <StyledInput type="text" value={supplierForm[key]} onChange={v => setSupplierField(key, v)} placeholder={placeholder} />
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

                  {suppliers.map((s, i) => (
                    <motion.div key={s.id} variants={itemVariants} transition={{ delay: i * 0.05 }}
                      className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
                      <div className="flex items-start justify-between">
                        <div className="grid grid-cols-4 gap-6 flex-1">
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Company</p>
                            <p className="font-semibold text-slate-800">{s.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{s.contact}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Contact</p>
                            <p className="text-sm text-slate-700">{s.email}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{s.phone}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Products</p>
                            <p className="text-sm text-slate-600">{s.products}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Schedule</p>
                            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">{s.deliverySchedule}</span>
                          </div>
                        </div>
                        <button onClick={() => removeSupplier(s.id)}
                          className="ml-4 text-xs text-slate-300 hover:text-red-400 transition-colors font-medium">Remove</button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            )}

            {/* ── REPORTS ─────────────────────────────────────────────── */}
            {tab === "reports" && (
              <motion.div key="reports" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-6">
                  <motion.div variants={staggerVariants} className="grid grid-cols-3 gap-4">
                    {([
                      { label: "Items Received (Week)", value: deliveries.reduce((s,d) => s+d.quantity, 0).toString(), accent: "emerald" },
                      { label: "Total Used Today",       value: totalWithdrawn.toFixed(1),                              accent: "indigo"  },
                      { label: "Total Wasted",           value: totalWasted.toFixed(2),                                 accent: "rose"    },
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

                  <motion.div variants={itemVariants}>
                    <SectionCard title="Consumption Summary" subtitle="Detailed breakdown per product">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            {["Item","Received","Used","Remaining","Wasted","Waste %","Movement"].map(h => (
                              <th key={h} className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${h === "Item" ? "text-left" : h === "Movement" ? "text-center" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p, i) => {
                            const received     = deliveries.filter(d => d.productId === p.id).reduce((s,d) => s+d.quantity, 0);
                            const wastePercent = p.dailyWithdrawn > 0 ? ((p.wasted / p.dailyWithdrawn) * 100).toFixed(1) : "0.0";
                            const isFast       = p.dailyWithdrawn >= 3;
                            return (
                              <tr key={p.id}
                                style={{ opacity: 0, animation: `fadeInRow 0.28s ease forwards`, animationDelay: `${i * 0.04}s` }}
                                className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                                <td className="py-3.5 px-4 font-medium text-slate-800">{p.name}</td>
                                <td className="py-3.5 px-4 text-right text-emerald-500 font-medium">{received > 0 ? `+${received}` : "—"}</td>
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

            {/* ── CRITICAL ────────────────────────────────────────────── */}
            {tab === "critical" && (
              <motion.div key="critical" variants={pageVariants} initial="hidden" animate="show" exit="exit">
                <motion.div variants={staggerVariants} initial="hidden" animate="show" className="space-y-4">
                  {criticalStock.length === 0 ? (
                    <motion.div variants={itemVariants}><EmptyState message="No items in critical condition." /></motion.div>
                  ) : (
                    criticalStock.map((p, i) => (
                      <motion.div key={p.id} variants={itemVariants} transition={{ delay: i * 0.07 }}
                        className="bg-white border border-slate-100 border-t-4 border-t-red-400 rounded-2xl p-6 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
                            <span className="text-red-500 font-bold text-lg">!</span>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-base">{p.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{p.category} · Last delivery: {p.lastDelivery}</p>
                            <p className="text-xs text-slate-500 mt-1">Supplier: <span className="font-semibold text-slate-700">{p.supplier}</span></p>
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
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">About This Module</p>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Critical stock items have fallen below the defined threshold. Contact suppliers immediately and prioritize restocking to prevent production downtime and maintain smooth operations.
                    </p>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        )}
        </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
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