import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  motion,
  AnimatePresence,
  type Variants,
  type Transition,
} from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { useNotifications } from "@/lib/NotificationContext";
import { useAuth } from "../../context/authcontext";
import { api, kitchenApi, storageApi } from "./services/api";
import type {
  Batch,
  DashboardSummaryKey,
  InventoryCategoryMaster,
  InventoryUnitMaster,
  KitchenBatch,
  KitchenUsagePayload,
  Product,
  RawMaterialForm,
  ReconcileRow,
  ReportData,
  ReportLineItem,
  StockAlertSettings,
  StockStatus,
  StockStatusRecord,
  Tab,
  WithdrawalFormRow,
  WithdrawalType,
} from "./types/inventory";
import { Btn } from "./components/Btn";
import { DashboardSummaryModal } from "./components/DashboardSummaryModal";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { ExpiryChip } from "./components/ExpiryChip";
import { FormField } from "./components/FormField";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { NearestTimingCell } from "./components/NearestTimingCell";
import { RawMaterialTimingCell } from "./components/RawMaterialTimingCell";
import { SectionCard } from "./components/SectionCard";
import { StyledInput } from "./components/StyledInput";
import { StyledSelect } from "./components/StyledSelect";
import { SupplierProductsModal } from "./components/SupplierProductsModal";
import { PODetailDrawer } from "./components/purchase-orders/PODetailDrawer";
import { CreatePOModal } from "./components/purchase-orders/CreatePOModal";
import { POPrintModal } from "./components/purchase-orders/POPrintModal";
import { ReceivePOModal } from "./components/purchase-orders/ReceivePOModal";
import { AddMaterialModal } from "./components/modals/AddMaterialModal";
import { EndOfDayReconciliationModal } from "./components/modals/EndOfDayReconciliationModal";
import { FIFOBatchGrouped } from "./components/batches/FIFOBatchGrouped";
import { KitchenBatchesSection } from "./components/batches/KitchenBatchesSection";
import { KitchenBatchQueuePreview } from "./components/batches/KitchenBatchQueuePreview";
import { StockAlertRestockBanner } from "./components/batches/StockAlertRestockBanner";
import { YesterdayReturnsBanner } from "./components/batches/YesterdayReturnsBanner";
import { PurchaseHistoryTab } from "./components/tabs/PurchaseHistoryTab";
import { AlertsTab } from "./components/tabs/AlertsTab";
import { PurchaseOrdersTab } from "./components/tabs/PurchaseOrdersTab";
import { SuppliersTab } from "./components/tabs/SuppliersTab";
import { WithdrawalTab } from "./components/tabs/WithdrawalTab";
import { DashboardTab } from "./components/tabs/DashboardTab";
import { usePurchaseOrders } from "./hooks/usePurchaseOrders";
import { useSuppliers } from "./hooks/useSuppliers";
import {
  isDateInRange,
} from "./utils/dateUtils";
import {
  fmtDate,
  fmtInt,
  toNumber,
} from "./utils/formatters";
import {
  blockInvalidNumberKeys,
  sanitizeNumberInput,
} from "./utils/inputUtils";
import {
  DEFAULT_STOCK_ALERT_SETTINGS,
  getAlertSeverity,
  getAppliedThresholds,
  getNearestTimingInfo,
  getShelfLifeStatus,
  getProductUiStatus,
  getStockStatus,
  isCountedInTotalProducts,
  isMainStockDashboardCategory,
  isStrictRawMaterialCategory,
  normalizeInventoryCategoryName,
  normalizeStockAlertSettings,
} from "./utils/stockUtils";

function createWithdrawalRow(): WithdrawalFormRow {
  return {
    id: crypto.randomUUID(),
    productId: null,
    qty: "",
  };
}

const PESO = "\u20B1";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "alerts", label: "Alerts" },
  { id: "suppliers", label: "Suppliers" },
  { id: "purchases", label: "Purchase Orders" },
  { id: "purchase-history", label: "Purchase Order History" },
];
const BLANK_RAW_MATERIAL: RawMaterialForm = {
  name: "",
  category: "Sauces",
  unit: "liter",
  description: "",
  useDefaultThresholds: true,
  lowStockThreshold: "",
  criticalStockThreshold: "",
};
const RAW_MATERIAL_UNITS = [
  "kg",
  "g",
  "liter",
  "ml",
  "piece",
  "pack",
  "bottle",
  "case",
] as const;
const RAW_MATERIAL_CATEGORIES = [
  "Sauces",
  "Raw Material",
  "Ingredients",
  "Aromatics",
] as const;
const STATUS_BADGE: Record<StockStatus, string> = {
  critical: "bg-orange-100 text-orange-600",
  low: "bg-yellow-100 text-yellow-700",
  normal: "bg-emerald-100 text-emerald-600",
};
const STATUS_BAR: Record<StockStatus, string> = {
  critical: "bg-orange-400",
  low: "bg-yellow-400",
  normal: "bg-emerald-400",
};
const STATUS_DOT: Record<StockStatus, string> = {
  critical: "bg-orange-500",
  low: "bg-yellow-400",
  normal: "bg-emerald-500",
};
const TYPE_BADGE: Record<WithdrawalType, string> = {
  initial: "bg-indigo-50 text-indigo-600",
  supplementary: "bg-sky-50 text-sky-600",
  return: "bg-emerald-50 text-emerald-600",
};
const inputCls =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200";
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

const inventoryCategoryNameLookup = new Map<string, string>();
const inventoryCategoryDateTrackingLookup = new Map<
  string,
  "none" | "expiry" | "shelf_life"
>();

const isWholeChicken = (p: Product) =>
  p.category.toLowerCase().includes("whole chicken");
const isChoppedChicken = (p: Product) =>
  p.category.toLowerCase().includes("chopped chicken");
const isChicken = (p: Product) => isWholeChicken(p) || isChoppedChicken(p);
const isMenuFoodProduct = (p: Pick<Product, "item_type">) =>
  String(p.item_type ?? "")
    .trim()
    .toLowerCase() === "menu_item";
const isReconcilable = (p: Product) =>
  !/(sauce|bottle|beverage|condiment|drink)/.test(p.category.toLowerCase());
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
const MATERIAL_NAME_MAX_LENGTH = 100;
const MATERIAL_DESCRIPTION_MAX_LENGTH = 100;
const MATERIAL_NAME_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9' -]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;

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
// Main component

export default function StockManager() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboardSubTab, setDashboardSubTab] = useState<
    | "main-stock"
    | "last-updates"
    | "record-spoilage"
    | "stock-movement"
    | "cook-report"
  >("main-stock");
  type WithdrawalSubTab =
    | "new-record"
    | "kitchen-queue"
    | "delivered-batches"
    | "currently-withdrawn"
    | "kitchen-batches";
  const [withdrawalSubTab, setWithdrawalSubTab] =
    useState<WithdrawalSubTab>("new-record");
  const [products, setProducts] = useState<Product[]>([]);
  const [withdrawals, setWithdrawals] = useState<StockStatusRecord[]>([]);
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  const [yesterdayReturns, setYesterdayReturns] = useState<Batch[]>([]);
  const [kitchenBatches, setKitchenBatches] = useState<KitchenBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disposingProductId, setDisposingProductId] = useState<number | null>(
    null,
  );
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummaryKey | null>(null);
  const [withdrawalRows, setWithdrawalRows] = useState<WithdrawalFormRow[]>([
    createWithdrawalRow(),
  ]);
  const [activeWithdrawalRowId, setActiveWithdrawalRowId] = useState<string>(
    () => withdrawalRows[0].id,
  );
  const [wdType, setWdType] = useState<WithdrawalType>("initial");
  const [adjProductId, setAdjProductId] = useState<number | null>(null);
  const [adjQty, setAdjQty] = useState("");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [showRawMaterialForm, setShowRawMaterialForm] = useState(false);
  const [rawMaterialForm, setRawMaterialForm] =
    useState<RawMaterialForm>(BLANK_RAW_MATERIAL);
  const [inventoryCategories, setInventoryCategories] = useState<
    InventoryCategoryMaster[]
  >([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnitMaster[]>(
    [],
  );
  const [stockAlertSettings, setStockAlertSettings] =
    useState<StockAlertSettings>(DEFAULT_STOCK_ALERT_SETTINGS);
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileItems, setReconcileItems] = useState<ReconcileRow[]>([]);
  const [cookReport, setCookReport] = useState<KitchenUsagePayload | null>(
    null,
  );
  const [cookReportOpen, setCookReportOpen] = useState(false);
  const [cookReportFinalizing, setCookReportFinalizing] = useState(false);
  const [cookReportLoading, setCookReportLoading] = useState(false);
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
  const currentStaffDisplayName = useMemo(() => {
    const authUser = user as
      | (typeof user & { full_name?: string | null })
      | null;
    const fullName = String(authUser?.full_name ?? "").trim();
    const username = String(user?.username ?? "").trim();
    return fullName || username;
  }, [user]);

  const { addNotification } = useNotifications();
  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      addNotification({ id: crypto.randomUUID(), label: message, type });
    },
    [addNotification],
  );
  const supplier = useSuppliers({
    products,
    tab,
    showToast,
    setSubmitting,
    isMenuFoodProduct,
  });

  const normalizeKitchenUsagePayload = useCallback(
    (payload: KitchenUsagePayload): KitchenUsagePayload => ({
      report: {
        ...payload.report,
        report_id: toNumber(payload.report.report_id),
        prepared_by:
          payload.report.prepared_by == null
            ? null
            : toNumber(payload.report.prepared_by),
        finalized_by:
          payload.report.finalized_by == null
            ? null
            : toNumber(payload.report.finalized_by),
      },
      items: Array.isArray(payload.items)
        ? payload.items.map((item) => ({
            ...item,
            usage_item_id:
              (item as { usage_item_id?: unknown }).usage_item_id == null
                ? undefined
                : toNumber((item as { usage_item_id?: unknown }).usage_item_id),
            product_id:
              item.product_id == null ? null : toNumber(item.product_id),
            withdrawn_qty: toNumber(item.withdrawn_qty),
            used_qty: toNumber(item.used_qty),
            spoilage_qty: toNumber(item.spoilage_qty),
            returned_qty: toNumber(
              (item as { returned_qty?: unknown }).returned_qty,
            ),
            note: typeof item.note === "string" ? item.note : "",
          }))
        : [],
    }),
    [],
  );

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

  const fetchCookReport = useCallback(
    async (silent = false) => {
      if (!silent) setCookReportLoading(true);
      try {
        const payload = await api.getDailyUsageReport();
        const normalized = normalizeKitchenUsagePayload(payload);
        setCookReport(normalized);
        if (normalized.items.length > 0) {
          setCookReportOpen(true);
        }
      } catch (err) {
        if (!silent) {
          showToast(
            err instanceof Error ? err.message : "Failed to load cook report.",
            "error",
          );
        }
      } finally {
        if (!silent) setCookReportLoading(false);
      }
    },
    [normalizeKitchenUsagePayload, showToast],
  );

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
    setIsRefreshing(true);
    setError(null);
    try {
      const [invRes, wdRes, supRes, categoryRes, unitRes, settingsRes] =
        await Promise.allSettled([
          api.getInventory(),
          api.getWithdrawals(),
          supplier.fetchSuppliers(),
          api.getInventoryCategories(),
          api.getInventoryUnits(),
          api.getSettings(),
        ]);

      if (
        invRes.status !== "fulfilled" ||
        wdRes.status !== "fulfilled" ||
        supRes.status !== "fulfilled"
      ) {
        throw new Error("Failed to load data.");
      }

      const inv = invRes.value;
      const wd = wdRes.value;
      const categoryList =
        categoryRes.status === "fulfilled" ? categoryRes.value : [];
      const unitList = unitRes.status === "fulfilled" ? unitRes.value : [];
      const nextStockAlertSettings =
        settingsRes.status === "fulfilled"
          ? normalizeStockAlertSettings(settingsRes.value)
          : DEFAULT_STOCK_ALERT_SETTINGS;
      inventoryCategoryNameLookup.clear();
      inventoryCategoryDateTrackingLookup.clear();
      for (const category of categoryList) {
        inventoryCategoryNameLookup.set(
          normalizeInventoryCategoryName(category.name),
          category.name,
        );
        inventoryCategoryDateTrackingLookup.set(
          normalizeInventoryCategoryName(category.name),
          category.date_tracking_type ?? "none",
        );
      }
      setInventoryCategories(categoryList);
      setInventoryUnits(unitList);
      setStockAlertSettings(nextStockAlertSettings);

      const [batchesRes, returnsRes, kitchenRes, cookReportRes] =
        await Promise.allSettled([
          api.getActiveBatches(),
          api.getYesterdayReturns(),
          kitchenApi.getAll(),
          api.getDailyUsageReport(),
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
          useDefaultThresholds:
            (p as { useDefaultThresholds?: unknown }).useDefaultThresholds ===
              undefined ||
            (p as { useDefaultThresholds?: unknown }).useDefaultThresholds ===
              null
              ? true
              : Boolean(
                  Number(
                    (p as { useDefaultThresholds?: unknown })
                      .useDefaultThresholds,
                  ),
                ),
          lowStockThreshold:
            (p as { lowStockThreshold?: unknown }).lowStockThreshold ===
              undefined ||
            (p as { lowStockThreshold?: unknown }).lowStockThreshold === null
              ? null
              : toNumber(
                  (p as { lowStockThreshold?: unknown }).lowStockThreshold,
                ),
          criticalStockThreshold:
            (p as { criticalStockThreshold?: unknown })
              .criticalStockThreshold === undefined ||
            (p as { criticalStockThreshold?: unknown })
              .criticalStockThreshold === null
              ? null
              : toNumber(
                  (p as { criticalStockThreshold?: unknown })
                    .criticalStockThreshold,
                ),
          dailyWithdrawn: toNumber(p.dailyWithdrawn),
          returned: toNumber(p.returned),
          wasted: toNumber(p.wasted),
          expiryDate: p.expiryDate ? String(p.expiryDate) : null,
          usableUntil: p.usableUntil ? String(p.usableUntil) : null,
          shelfLifeDays:
            p.shelfLifeDays !== undefined && p.shelfLifeDays !== null
              ? toNumber(p.shelfLifeDays)
              : null,
          shelfLifeHours:
            p.shelfLifeHours !== undefined && p.shelfLifeHours !== null
              ? toNumber(p.shelfLifeHours)
              : null,
          item_type:
            typeof (p as { item_type?: unknown }).item_type === "string"
              ? String((p as { item_type?: unknown }).item_type)
              : "stock_item",
          promo: typeof p.promo === "string" ? p.promo : "",
          isRawMaterial: isStrictRawMaterialCategory(
            typeof p.category === "string" ? p.category : "",
            inventoryCategoryDateTrackingLookup,
          ),
        }))
        .filter(
          (p) =>
            String(p.item_type ?? "stock_item")
              .trim()
              .toLowerCase() === "stock_item",
        );

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
      setActiveBatches(
        batchesRes.status === "fulfilled" ? batchesRes.value : [],
      );
      setYesterdayReturns(
        returnsRes.status === "fulfilled" ? returnsRes.value : [],
      );
      setKitchenBatches(
        kitchenRes.status === "fulfilled" ? kitchenRes.value : [],
      );
      setCookReport(
        cookReportRes.status === "fulfilled"
          ? normalizeKitchenUsagePayload(cookReportRes.value)
          : null,
      );
      if (
        cookReportRes.status === "fulfilled" &&
        cookReportRes.value.items.length > 0
      ) {
        setCookReportOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [normalizeKitchenUsagePayload, supplier.fetchSuppliers]);

  const handleFinalizeCookReport = useCallback(async () => {
    if (!cookReport?.report?.report_id) return;

    setCookReportFinalizing(true);
    try {
      const rawUserId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : null;
      const finalizedBy =
        rawUserId && Number.isFinite(Number(rawUserId))
          ? Number(rawUserId)
          : null;
      const payload = await api.finalizeKitchenUsage(
        cookReport.report.report_id,
        {
          finalized_by: finalizedBy,
        },
      );
      setCookReport(normalizeKitchenUsagePayload(payload));
      showToast("Cook report finalized.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to finalize cook report.",
        "error",
      );
    } finally {
      setCookReportFinalizing(false);
    }
  }, [cookReport, normalizeKitchenUsagePayload, showToast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    if (tab !== "dashboard") return;
    const interval = window.setInterval(() => {
      void fetchCookReport(true);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [tab, fetchCookReport]);
  useEffect(() => {
    if (tab !== "dashboard") return;
    setDashboardSubTab("main-stock");
  }, [tab]);
  useEffect(() => {
    if (products.length > 0) {
      if (adjProductId === null) setAdjProductId(products[0].product_id);
    }
  }, [products, adjProductId]);
  useEffect(() => {
    if (withdrawalRows.length === 0) {
      const nextRow = createWithdrawalRow();
      setWithdrawalRows([nextRow]);
      setActiveWithdrawalRowId(nextRow.id);
      return;
    }
    if (!withdrawalRows.some((row) => row.id === activeWithdrawalRowId)) {
      setActiveWithdrawalRowId(withdrawalRows[0].id);
    }
  }, [withdrawalRows, activeWithdrawalRowId]);
  useEffect(() => {
    setReportData(null);
  }, [reportPeriod]);
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

  const lowStock = products.filter(
    (p) =>
      !isMenuFoodProduct(p) &&
      getAlertSeverity(p, stockAlertSettings) === "low",
  );
  const criticalStock = products.filter(
    (p) =>
      !isMenuFoodProduct(p) &&
      getAlertSeverity(p, stockAlertSettings) === "critical",
  );
  const po = usePurchaseOrders({
    criticalStock,
    lowStock,
    suppliers: supplier.suppliers,
    setSuppliers: supplier.setSuppliers,
    refreshInventory: fetchAll,
    showToast,
    addNotification,
  });
  const outOfStockItems = useMemo(
    () =>
      products.filter(
        (p) =>
          !isMenuFoodProduct(p) &&
          getAlertSeverity(p, stockAlertSettings) === "out",
      ),
    [products, stockAlertSettings],
  );
  const alertCriticalStock = useMemo(
    () => criticalStock.filter((p) => toNumber(p.mainStock) > 0),
    [criticalStock],
  );
  const attentionItems = useMemo(
    () =>
      products.filter(
        (p) =>
          !isMenuFoodProduct(p) &&
          getAlertSeverity(p, stockAlertSettings) !== "normal",
      ),
    [products, stockAlertSettings],
  );
  const mainStockProducts = useMemo(
    () => products.filter((p) => !isMenuFoodProduct(p)),
    [products],
  );
  const activeWithdrawalRow = useMemo(
    () =>
      withdrawalRows.find((row) => row.id === activeWithdrawalRowId) ??
      withdrawalRows[0] ??
      null,
    [withdrawalRows, activeWithdrawalRowId],
  );
  const activeWithdrawalProductId = activeWithdrawalRow?.productId ?? null;
  const selectedKitchenBatches = useMemo(
    () =>
      !activeWithdrawalProductId
        ? []
        : kitchenBatches
            .filter((b) => b.product_id === activeWithdrawalProductId)
            .sort(
              (a, b) =>
                new Date(a.withdrawn_at).getTime() -
                new Date(b.withdrawn_at).getTime(),
            ),
    [kitchenBatches, activeWithdrawalProductId],
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
    const base = products.filter(
      (p) =>
        !isMenuFoodProduct(p) &&
        isMainStockDashboardCategory(
          p.category,
          inventoryCategoryDateTrackingLookup,
        ),
    );
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
  const activeInventoryCategoryOptions = useMemo(() => {
    const names = inventoryCategories
      .filter(
        (category) => category.is_active === true || category.is_active === 1,
      )
      .map((category) => category.name.trim())
      .filter(Boolean);
    return names.length > 0 ? names : [...RAW_MATERIAL_CATEGORIES];
  }, [inventoryCategories]);
  const activeInventoryUnitOptions = useMemo(() => {
    const names = inventoryUnits
      .filter((unit) => unit.is_active === true || unit.is_active === 1)
      .map((unit) => unit.name.trim())
      .filter(Boolean);
    return names.length > 0 ? names : [...RAW_MATERIAL_UNITS];
  }, [inventoryUnits]);
  const cookReportItems = useMemo(() => cookReport?.items ?? [], [cookReport]);
  const cookReportVarianceCount = useMemo(
    () =>
      cookReportItems.filter(
        (item) =>
          Math.abs(
            toNumber(item.withdrawn_qty) -
              toNumber(item.used_qty) -
              toNumber(item.spoilage_qty),
          ) > 0.009,
      ).length,
    [cookReportItems],
  );
  const cookReportTotals = useMemo(
    () =>
      cookReportItems.reduce(
        (sum, item) => ({
          withdrawn: sum.withdrawn + toNumber(item.withdrawn_qty),
          used: sum.used + toNumber(item.used_qty),
          spoilage: sum.spoilage + toNumber(item.spoilage_qty),
          returned: sum.returned + toNumber(item.returned_qty),
        }),
        { withdrawn: 0, used: 0, spoilage: 0, returned: 0 },
      ),
    [cookReportItems],
  );
  const selectedWithdrawalProduct = useMemo(
    () =>
      mainStockProducts.find(
        (p) => p.product_id === activeWithdrawalProductId,
      ) ?? null,
    [mainStockProducts, activeWithdrawalProductId],
  );
  const selectedWithdrawalStatus = selectedWithdrawalProduct
    ? getStockStatus(selectedWithdrawalProduct, stockAlertSettings)
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
  const totalProductsCounted = useMemo(
    () =>
      products.filter(
        (p) => isCountedInTotalProducts(p.category) && !isMenuFoodProduct(p),
      ),
    [products],
  );
  const dashboardSummaryConfig = useMemo(() => {
    const productRows = [...totalProductsCounted]
      .sort((a, b) => a.product_name.localeCompare(b.product_name))
      .map((p) => ({
        id: `product-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.mainStock)} ${p.unit}`,
        meta: `${p.category} \u00B7 reorder point ${fmtInt(p.reorderPoint)}`,
      }));
    const withdrawnRows = [...products]
      .filter((p) => toNumber(p.dailyWithdrawn) > 0)
      .sort((a, b) => toNumber(b.dailyWithdrawn) - toNumber(a.dailyWithdrawn))
      .map((p) => ({
        id: `withdrawn-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.dailyWithdrawn)} ${p.unit}`,
        meta: `${p.category} \u00B7 main stock ${fmtInt(p.mainStock)} ${p.unit}`,
      }));
    const wastedRows = [...products]
      .filter((p) => toNumber(p.wasted) > 0)
      .sort((a, b) => toNumber(b.wasted) - toNumber(a.wasted))
      .map((p) => ({
        id: `wasted-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.wasted)} ${p.unit}`,
        meta: `${p.category} \u00B7 withdrawn today ${fmtInt(p.dailyWithdrawn)} ${p.unit}`,
      }));
    const returnedRows = [...products]
      .filter((p) => toNumber(p.returned) > 0)
      .sort((a, b) => toNumber(b.returned) - toNumber(a.returned))
      .map((p) => ({
        id: `returned-${p.product_id}`,
        name: p.product_name,
        value: `${fmtInt(p.returned)} ${p.unit}`,
        meta: `${p.category} \u00B7 current stock ${fmtInt(p.mainStock)} ${p.unit}`,
      }));

    return {
      products: {
        title: "Total Products Summary",
        subtitle: "All inventory items currently tracked in stock manager.",
        totalLabel: "Total Products",
        totalValue: totalProductsCounted.length.toString(),
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
  }, [
    products,
    totalProductsCounted,
    totalReturned,
    totalWasted,
    totalWithdrawn,
  ]);
  const wholeChickenProducts = mainStockProducts.filter(isWholeChicken);
  const choppedChickenProducts = mainStockProducts.filter(isChoppedChicken);
  const otherMainStockProducts = mainStockProducts.filter((p) => !isChicken(p));
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

  const handleSpoilageInputChange = (value: string) => {
    const maxAllowed = selectedSpoilageProduct?.dailyWithdrawn ?? 0;
    const numValue = parseFloat(value);
    if (!value || isNaN(numValue) || numValue <= maxAllowed) setAdjQty(value);
  };

  async function doWithdraw(
    product_id: number,
    qty: number,
    type: WithdrawalType,
    options?: {
      manageSubmitting?: boolean;
      refreshAfter?: boolean;
      silentError?: boolean;
    },
  ) {
    const manageSubmitting = options?.manageSubmitting ?? true;
    const refreshAfter = options?.refreshAfter ?? true;
    const silentError = options?.silentError ?? false;
    if (manageSubmitting) setSubmitting(true);
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
          `Initial withdrawal \u00B7 Kitchen Batch #${kitchenBatch.kitchen_batch_id}`,
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
      if (!silentError) {
        showToast(
          err instanceof Error ? err.message : "Withdrawal failed",
          "error",
        );
      }
      throw err;
    } finally {
      if (manageSubmitting) setSubmitting(false);
      if (refreshAfter) await fetchAll();
    }
  }

  function updateWithdrawalRow(
    rowId: string,
    patch: Partial<WithdrawalFormRow>,
  ) {
    setWithdrawalRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  }

  function addWithdrawalRow() {
    const nextRow = createWithdrawalRow();
    setWithdrawalRows((current) => [...current, nextRow]);
    setActiveWithdrawalRowId(nextRow.id);
  }

  function removeWithdrawalRow(rowId: string) {
    setWithdrawalRows((current) => {
      if (current.length <= 1) return current;
      return current.filter((row) => row.id !== rowId);
    });
  }

  async function submitWithdrawal() {
    const mergedRows = new Map<number, { product: Product; qty: number }>();

    for (const row of withdrawalRows) {
      if (row.productId === null) {
        showToast("Please select an item for every withdrawal row.", "error");
        return;
      }
      if (!row.qty.trim()) {
        showToast("Please enter a quantity for every withdrawal row.", "error");
        return;
      }

      const qty = parseInt(row.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        showToast("Withdrawal quantity must be greater than zero.", "error");
        return;
      }

      const product = products.find((p) => p.product_id === row.productId);
      if (!product) {
        showToast("One of the selected products could not be found.", "error");
        return;
      }

      const existing = mergedRows.get(row.productId);
      if (existing) {
        existing.qty += qty;
      } else {
        mergedRows.set(row.productId, { product, qty });
      }
    }

    if (mergedRows.size === 0) {
      showToast("Add at least one withdrawal item before submitting.", "error");
      return;
    }

    try {
      setSubmitting(true);
      for (const { product, qty } of mergedRows.values()) {
        if (qty > product.mainStock) {
          showToast(
            `Insufficient stock for ${product.product_name}. Available: ${product.mainStock} ${product.unit}`,
            "error",
          );
          return;
        }

        try {
          await doWithdraw(product.product_id, qty, wdType, {
            manageSubmitting: false,
            refreshAfter: false,
            silentError: true,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Withdrawal failed";
          showToast(`Failed on ${product.product_name}: ${message}`, "error");
          return;
        }
      }

      const resetRow = createWithdrawalRow();
      setWithdrawalRows([resetRow]);
      setActiveWithdrawalRowId(resetRow.id);
      showToast("Withdrawals submitted successfully.", "success");
    } finally {
      await fetchAll();
      setSubmitting(false);
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

  async function addRawMaterial() {
    const name = rawMaterialForm.name.trim();
    const description = rawMaterialForm.description.trim();
    const customLowStockThreshold =
      rawMaterialForm.lowStockThreshold.trim() === ""
        ? null
        : Number(rawMaterialForm.lowStockThreshold);
    const customCriticalStockThreshold =
      rawMaterialForm.criticalStockThreshold.trim() === ""
        ? null
        : Number(rawMaterialForm.criticalStockThreshold);
    if (!name) {
      showToast("Please enter a raw material name.", "error");
      return;
    }
    if (name.length < 2 || name.length > MATERIAL_NAME_MAX_LENGTH) {
      showToast("Material name must be between 2 and 100 characters.", "error");
      return;
    }
    if (!MATERIAL_NAME_PATTERN.test(name)) {
      showToast(
        "Material name may only use letters, numbers, spaces, apostrophes, and hyphens.",
        "error",
      );
      return;
    }
    if (description.length > MATERIAL_DESCRIPTION_MAX_LENGTH) {
      showToast("Description must not exceed 100 characters.", "error");
      return;
    }
    const existing = products.find(
      (p) => p.product_name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      showToast("This material already exists in inventory.", "error");
      return;
    }
    if (!rawMaterialForm.useDefaultThresholds) {
      if (
        customLowStockThreshold === null ||
        !Number.isFinite(customLowStockThreshold) ||
        customLowStockThreshold < 0
      ) {
        showToast("Please enter a valid custom low stock threshold.", "error");
        return;
      }
      if (
        customCriticalStockThreshold === null ||
        !Number.isFinite(customCriticalStockThreshold) ||
        customCriticalStockThreshold < 0
      ) {
        showToast(
          "Please enter a valid custom critical stock threshold.",
          "error",
        );
        return;
      }
      if (customCriticalStockThreshold > customLowStockThreshold) {
        showToast(
          "Critical threshold cannot be greater than warning threshold.",
          "error",
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await api.createProduct({
        name,
        price: 0,
        quantity: 0,
        category: rawMaterialForm.category.trim(),
        description: description || undefined,
        raw_material: isStrictRawMaterialCategory(
          rawMaterialForm.category,
          inventoryCategoryDateTrackingLookup,
        ),
        item_type: "stock_item",
        use_default_thresholds: rawMaterialForm.useDefaultThresholds,
        low_stock_threshold: rawMaterialForm.useDefaultThresholds
          ? null
          : customLowStockThreshold,
        critical_stock_threshold: rawMaterialForm.useDefaultThresholds
          ? null
          : customCriticalStockThreshold,
      });
      await fetchAll();
      setRawMaterialForm(BLANK_RAW_MATERIAL);
      setShowRawMaterialForm(false);
      showToast("Raw material added.", "success");
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

  async function handlePastShelfLifeDispose(product: Product) {
    const qty = toNumber(product.dailyWithdrawn);
    if (qty <= 0) {
      showToast("No withdrawn quantity is available to dispose.", "error");
      return;
    }
    if (
      !window.confirm(
        `Dispose ${fmtInt(qty)} ${product.unit} of ${product.product_name}? This will record spoilage from today's withdrawn quantity.`,
      )
    ) {
      return;
    }

    setDisposingProductId(product.product_id);
    try {
      await api.postSpoilage({
        product_id: product.product_id,
        menu_code: `M-${String(product.product_id).padStart(3, "0")}`,
        quantity: qty,
        recorded_by: null,
        reason: product.isRawMaterial ? "past_shelf_life" : "expired",
      });
      await fetchAll();
      showToast("Expired stock recorded as spoilage.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to dispose expired stock.",
        "error",
      );
    } finally {
      setDisposingProductId(null);
    }
  }

  async function handlePastShelfLifeReturn(product: Product) {
    if (nonReturnableProductIds.has(product.product_id)) {
      showToast(
        "This expired item cannot be returned with the current flow.",
        "error",
      );
      return;
    }

    const batchesForProduct = kitchenBatches.filter((batch) => {
      if (batch.product_id !== product.product_id) return false;
      const availableQty =
        toNumber(batch.withdrawn_qty) -
        toNumber(batch.used_qty) -
        toNumber(batch.returned_qty);
      return batch.status === "active" && availableQty > 0;
    });

    if (batchesForProduct.length === 0) {
      showToast("No active kitchen batches are available to return.", "error");
      return;
    }

    const totalQty = batchesForProduct.reduce(
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

    if (
      !window.confirm(
        `Return ${fmtInt(totalQty)} ${product.unit} of ${product.product_name} from kitchen batches?`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      for (const batch of batchesForProduct) {
        await kitchenApi.returnUnused(batch.kitchen_batch_id);
      }
      await fetchAll();
      showToast(
        "Expired stock returned using existing kitchen return flow.",
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to return expired stock.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'); @keyframes fadeInRow { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }`}</style>
      <div
        style={{ fontFamily: "'Poppins', sans-serif" }}
        className="min-h-screen bg-[#f5f6fa]"
      >
        <Sidebar />

        {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Header ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
        <header className="bg-white border-b border-slate-100 sticky top-0 z-30 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 pt-20 md:px-6 md:pt-24 lg:px-8 lg:pt-4 lg:pl-24">
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
            <div className="flex flex-wrap items-center gap-3">
              {yesterdayReturns.length > 0 && (
                <button
                  onClick={() => setTab("withdrawal")}
                  className="px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold border border-amber-200 flex items-center gap-1.5"
                >
                  {"\u21A9"} {yesterdayReturns.length} return
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
                  className={`w-2 h-2 rounded-full ${isLoading || isRefreshing ? "bg-amber-400" : "bg-emerald-400"}`}
                />
                <span className="text-xs font-medium text-slate-600">
                  {isLoading || isRefreshing ? "Syncing" : "Up to date"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-start gap-2 overflow-x-auto px-4 pb-3 md:px-6 lg:justify-center lg:px-8 lg:pl-24">
            {TABS.map((t) => {
              const badge =
                t.id === "alerts"
                  ? attentionItems.length
                  : t.id === "withdrawal"
                    ? yesterdayReturns.length
                    : t.id === "purchases"
                      ? po.poOrders.filter((o) => o.status === "Draft").length
                      : t.id === "purchase-history"
                        ? po.completedPOs.length
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
            <div className="border-t border-slate-100 px-4 pt-2">
              <div className="mx-auto flex w-full max-w-5xl items-end justify-center gap-6 border-b border-slate-200">
                {[
                  {
                    id: "main-stock" as const,
                    label: "Main Stock Levels",
                  },
                  {
                    id: "last-updates" as const,
                    label: "Last Inventory Updates",
                  },
                  {
                    id: "record-spoilage" as const,
                    label: "Record Spoilage",
                  },
                  {
                    id: "stock-movement" as const,
                    label: "Stock Movement Report",
                  },
                  {
                    id: "cook-report" as const,
                    label: "Cook Report",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setDashboardSubTab(item.id)}
                    className={`relative border-none bg-transparent px-6 py-3 text-sm font-semibold transition-colors duration-200 ${
                      dashboardSubTab === item.id
                        ? "text-blue-600"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                    style={{ fontFamily: "'Poppins', sans-serif" }}
                  >
                    {item.label}
                    <span
                      className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-opacity duration-200 ${
                        dashboardSubTab === item.id
                          ? "bg-blue-500 opacity-100"
                          : "bg-transparent opacity-0"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === "withdrawal" && !isLoading && (
            <div className="border-t border-slate-100 px-6 pb-0 pt-2">
              <div className="mx-auto flex w-full max-w-5xl items-end justify-center gap-6 border-b border-slate-200">
                {[
                  {
                    label: "New Withdrawal Record",
                    id: "new-record" as const,
                  },
                  {
                    label: "Kitchen Batch Queue",
                    id: "kitchen-queue" as const,
                  },
                  {
                    label: "Delivered batches",
                    id: "delivered-batches" as const,
                  },
                  {
                    label: "Currently Withdrawn",
                    id: "currently-withdrawn" as const,
                  },
                  {
                    label: "Kitchen Batches",
                    id: "kitchen-batches" as const,
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setWithdrawalSubTab(item.id)}
                    className={`relative flex-shrink-0 border-none bg-transparent px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ${
                      withdrawalSubTab === item.id
                        ? "text-blue-600"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                    style={{ fontFamily: "'Poppins', sans-serif" }}
                  >
                    {item.label}
                    <span
                      className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-opacity duration-200 ${
                        withdrawalSubTab === item.id
                          ? "bg-blue-500 opacity-100"
                          : "bg-transparent opacity-0"
                      }`}
                    />
                  </button>
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
              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Dashboard ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
              {tab === "dashboard" && (
                <DashboardTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  dashboardTopRef={dashboardTopRef}
                  totalProductsValue={totalProductsCounted.length.toString()}
                  totalWithdrawnValue={fmtInt(totalWithdrawn)}
                  totalWastedValue={fmtInt(totalWasted)}
                  totalReturnedValue={fmtInt(totalReturned)}
                  wholeChickenProducts={wholeChickenProducts}
                  choppedChickenProducts={choppedChickenProducts}
                  dashboardSubTab={dashboardSubTab}
                  onSummarySelect={setDashboardSummary}
                  mainStockContent={
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
                                onChange={(e) =>
                                  setDashboardSearch(e.target.value)
                                }
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
                                    "Shelf Life / Expiry",
                                    "Nearest Expiry / Shelf Life",
                                    "Returned",
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
                                  const shelfLifeStatus = p.isRawMaterial
                                    ? getShelfLifeStatus({
                                        usableUntil: p.usableUntil,
                                        shelfLifeDays: p.shelfLifeDays,
                                        shelfLifeHours: p.shelfLifeHours,
                                      })
                                    : null;
                                  const nearestTiming = getNearestTimingInfo(
                                    p,
                                    activeBatches,
                                  );
                                  const hasPastShelfLife =
                                    shelfLifeStatus === "Past Shelf Life";
                                  const uiStatus = getProductUiStatus(p);
                                  const status = getStockStatus(
                                    p,
                                    stockAlertSettings,
                                  );
                                  const isOutOfStock =
                                    uiStatus === "Out of Stock";
                                  const statusDotClass = isOutOfStock
                                    ? "bg-slate-500"
                                    : STATUS_DOT[status];
                                  const statusBadgeClass = isOutOfStock
                                    ? "bg-slate-100 text-slate-700"
                                    : p.isRawMaterial
                                      ? uiStatus === "Past Shelf Life"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-emerald-100 text-emerald-700"
                                      : STATUS_BADGE[status];
                                  const statusLabel = p.isRawMaterial
                                    ? uiStatus
                                    : isOutOfStock
                                      ? "Out of Stock"
                                      : status;
                                  return (
                                    <tr
                                      key={p.inventory_id}
                                      style={{
                                        opacity: 0,
                                        animation: `fadeInRow 0.28s ease forwards`,
                                        animationDelay: `${i * 0.04}s`,
                                      }}
                                      className={`border-b transition-colors ${
                                        hasPastShelfLife
                                          ? "border-red-100 bg-red-50/30 hover:bg-red-50/50 opacity-80"
                                          : "border-slate-50 hover:bg-slate-50/70"
                                      }`}
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
                                        <div className="inline-flex flex-col items-end gap-1">
                                          <span>
                                            {p.mainStock}{" "}
                                            <span className="text-slate-400 font-normal text-xs">
                                              {p.unit}
                                            </span>
                                          </span>
                                          {hasPastShelfLife && (
                                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-semibold">
                                              Expired
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3.5 px-4 text-right text-slate-500">
                                        {p.item_purchased}
                                      </td>
                                      <td className="py-3.5 px-4 text-right text-indigo-500 font-medium">
                                        {p.dailyWithdrawn}
                                      </td>
                                      <td className="py-3.5 px-4 text-right">
                                        {p.isRawMaterial ? (
                                          <RawMaterialTimingCell product={p} />
                                        ) : (
                                          <ExpiryChip dateStr={p.expiryDate} />
                                        )}
                                      </td>
                                      <td className="py-3.5 px-4 text-right">
                                        <NearestTimingCell
                                          info={nearestTiming}
                                        />
                                      </td>
                                      <td className="py-3.5 px-4 text-right text-emerald-500 font-medium">
                                        {p.returned}
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        <span
                                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize ${statusBadgeClass}`}
                                        >
                                          {statusLabel}
                                        </span>
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        {hasPastShelfLife ? (
                                          <div className="relative z-10 flex items-center justify-center gap-2 pointer-events-auto">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void handlePastShelfLifeDispose(
                                                  p,
                                                );
                                              }}
                                              disabled={
                                                disposingProductId ===
                                                  p.product_id ||
                                                toNumber(p.dailyWithdrawn) <= 0
                                              }
                                              className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[11px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                              title={`Dispose expired ${p.product_name}`}
                                            >
                                              {disposingProductId ===
                                              p.product_id
                                                ? "Disposing..."
                                                : "Dispose"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void handlePastShelfLifeReturn(
                                                  p,
                                                );
                                              }}
                                              disabled={submitting}
                                              className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                              title={`Return expired ${p.product_name}`}
                                            >
                                              Return
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              void handleDashboardDeleteProduct(
                                                p,
                                              );
                                            }}
                                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            title={`Delete ${p.product_name}`}
                                          >
                                            <TrashIcon />
                                          </button>
                                        )}
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
                      }
                  lastUpdatesContent={
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
                                      {new Date(
                                        p.last_update,
                                      ).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                  </motion.div>
                                ))}
                            </div>
                          </SectionCard>
                        </div>
                    </motion.div>
                  }
                  recordSpoilageContent={
                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-4"
                    >
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
                                      {p.product_name} (
                                      {fmtInt(p.dailyWithdrawn)} {p.unit}{" "}
                                      withdrawn today)
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
                                      {"\u26A0\uFE0F"} No stock was withdrawn
                                      today. Cannot record spoilage.
                                    </p>
                                  )}
                                </div>
                              )}

                              <FormField label="Spoilage Amount">
                                <div className="relative">
                                  <StyledInput
                                    type="number"
                                    min={1}
                                    step="0.01"
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
                                {submitting
                                  ? "Recording..."
                                  : "Record Spoilage"}
                              </Btn>
                            </div>
                          </SectionCard>
                        </div>
                    </motion.div>
                  }
                  cookReportContent={
                    <motion.div
                      variants={itemVariants}
                      className="grid grid-cols-2 gap-4"
                    >
                        <div>
                          <SectionCard
                            title="Cook Report"
                            subtitle={
                              cookReport?.report
                                ? `Daily kitchen usage for ${fmtDate(cookReport.report.report_date)}`
                                : "Manual cook report for daily usage and spoilage"
                            }
                          >
                            <div className="p-5 space-y-4">
                              {!cookReport ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400 text-center">
                                  No cook report is available yet for today.
                                </div>
                              ) : (
                                <>
                                  <div className="grid gap-3 md:grid-cols-4">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                                        Status
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-800 capitalize">
                                        {cookReport.report.status}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                                        Prepared By
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-800">
                                        {cookReport.report.prepared_by_name ??
                                          (cookReport.report.prepared_by
                                            ? `User #${cookReport.report.prepared_by}`
                                            : "Not submitted")}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                                        Items Reported
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-800">
                                        {cookReportItems.length}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                                        Variance Lines
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-800">
                                        {cookReportVarianceCount}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span>
                                      Withdrawn:{" "}
                                      <span className="font-semibold text-slate-700">
                                        {fmtInt(cookReportTotals.withdrawn)}
                                      </span>
                                    </span>
                                    <span>{"\u2022"}</span>
                                    <span>
                                      Used:{" "}
                                      <span className="font-semibold text-slate-700">
                                        {fmtInt(cookReportTotals.used)}
                                      </span>
                                    </span>
                                    <span>{"\u2022"}</span>
                                    <span>
                                      Spoilage:{" "}
                                      <span className="font-semibold text-slate-700">
                                        {fmtInt(cookReportTotals.spoilage)}
                                      </span>
                                    </span>
                                    <span>{"\u2022"}</span>
                                    <span>
                                      Returned:{" "}
                                      <span className="font-semibold text-slate-700">
                                        {fmtInt(cookReportTotals.returned)}
                                      </span>
                                    </span>
                                    <span>{"\u2022"}</span>
                                    <span>
                                      Last updated:{" "}
                                      <span className="font-semibold text-slate-700">
                                        {cookReport.report.updated_at
                                          ? new Date(
                                              cookReport.report.updated_at,
                                            ).toLocaleString()
                                          : "Not yet updated"}
                                      </span>
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void fetchCookReport();
                                      }}
                                      disabled={cookReportLoading}
                                      className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {cookReportLoading
                                        ? "Refreshing..."
                                        : "Refresh"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCookReportOpen((open) => !open)
                                      }
                                      className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                      {cookReportOpen
                                        ? "Hide Details"
                                        : "Review"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleFinalizeCookReport}
                                      disabled={
                                        cookReportFinalizing ||
                                        cookReport.report.status ===
                                          "finalized" ||
                                        cookReportItems.length === 0
                                      }
                                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      {cookReportFinalizing
                                        ? "Finalizing..."
                                        : cookReport.report.status ===
                                            "finalized"
                                          ? "Finalized"
                                          : "Finalize"}
                                    </button>
                                  </div>

                                  <AnimatePresence initial={false}>
                                    {cookReportOpen && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.18 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                          <div className="grid grid-cols-[1.4fr_repeat(5,minmax(0,0.8fr))] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                            <span>Raw Material</span>
                                            <span>Withdrawn</span>
                                            <span>Used</span>
                                            <span>Spoilage</span>
                                            <span>Returned</span>
                                            <span>Variance</span>
                                          </div>
                                          <div className="divide-y divide-slate-100">
                                            {cookReportItems.map((item) => {
                                              const variance =
                                                toNumber(item.withdrawn_qty) -
                                                toNumber(item.used_qty) -
                                                toNumber(item.spoilage_qty) -
                                                toNumber(item.returned_qty);

                                              return (
                                                <div
                                                  key={item.product_id}
                                                  className="px-4 py-3"
                                                >
                                                  <div className="grid grid-cols-[1.4fr_repeat(5,minmax(0,0.8fr))] gap-3 items-start text-sm text-slate-700">
                                                    <div>
                                                      <p className="font-semibold text-slate-800">
                                                        {item.product_name}
                                                      </p>
                                                      <p className="text-xs text-slate-400 mt-1">
                                                        {item.category}{" "}
                                                        {"\u00B7"} {item.unit}
                                                      </p>
                                                      {item.note && (
                                                        <p className="text-xs text-slate-500 mt-2">
                                                          Note: {item.note}
                                                        </p>
                                                      )}
                                                    </div>
                                                    <p>
                                                      {fmtInt(
                                                        item.withdrawn_qty,
                                                      )}{" "}
                                                      {item.unit}
                                                    </p>
                                                    <p>
                                                      {fmtInt(item.used_qty)}{" "}
                                                      {item.unit}
                                                    </p>
                                                    <p>
                                                      {fmtInt(
                                                        item.spoilage_qty,
                                                      )}{" "}
                                                      {item.unit}
                                                    </p>
                                                    <p>
                                                      {fmtInt(
                                                        item.returned_qty,
                                                      )}{" "}
                                                      {item.unit}
                                                    </p>
                                                    <p
                                                      className={
                                                        Math.abs(variance) >
                                                        0.009
                                                          ? "font-semibold text-amber-600"
                                                          : "font-semibold text-emerald-600"
                                                      }
                                                    >
                                                      {fmtInt(variance)}{" "}
                                                      {item.unit}
                                                    </p>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>

                                  {cookReport.report.status === "finalized" && (
                                    <p className="text-xs font-medium text-emerald-600">
                                      Finalized by{" "}
                                      {cookReport.report.finalized_by_name ??
                                        (cookReport.report.finalized_by
                                          ? `User #${cookReport.report.finalized_by}`
                                          : "manager")}
                                      {cookReport.report.finalized_at
                                        ? ` on ${new Date(cookReport.report.finalized_at).toLocaleString()}`
                                        : ""}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </SectionCard>
                        </div>
                    </motion.div>
                  }
                  stockMovementContent={
                    <>
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
                                Summarizes received, withdrawn, wasted, and
                                returned per item
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
                                    onChange={(e) => {
                                      const nextValue = sanitizeNumberInput(
                                        e.target.value,
                                        { allowDecimal: false },
                                      );
                                      if (nextValue) {
                                        setSelectedYear(Number(nextValue));
                                      }
                                    }}
                                    className={inputCls + " !w-24"}
                                    min={2020}
                                    max={2099}
                                    step="1"
                                    inputMode="numeric"
                                    onKeyDown={(e) =>
                                      blockInvalidNumberKeys(e, {
                                        allowDecimal: false,
                                      })
                                    }
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
                                    const csv = [
                                      headers.join(","),
                                      ...rows,
                                    ].join("\n");
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
                              title={`Stock Movement \u2014 ${reportData.period}`}
                              subtitle={`Generated ${new Date(reportData.generatedAt).toLocaleString()} \u00B7 ${reportData.items.length} items`}
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
                                          {
                                            v: item.wasted,
                                            c: "text-rose-500",
                                          },
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
                    </>
                  }
                />
              )}

              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Withdrawal ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
              {tab === "withdrawal" && (
                <WithdrawalTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  withdrawalSubTab={withdrawalSubTab}
                  wdType={wdType}
                  todayInitialExists={todayInitialExists}
                  kitchenRemaining={kitchenRemaining}
                  selectedWithdrawalProduct={selectedWithdrawalProduct}
                  withdrawalRows={withdrawalRows}
                  activeWithdrawalRowId={activeWithdrawalRowId}
                  wholeChickenProducts={wholeChickenProducts}
                  choppedChickenProducts={choppedChickenProducts}
                  otherMainStockProducts={otherMainStockProducts}
                  selectedWithdrawalStatus={selectedWithdrawalStatus}
                  selectedWithdrawalPct={selectedWithdrawalPct}
                  visibleWithdrawalLogs={visibleWithdrawalLogs}
                  products={products}
                  submitting={submitting}
                  typeBadge={TYPE_BADGE}
                  yesterdayReturnsBanner={
                    yesterdayReturns.length > 0 ? (
                      <motion.div variants={itemVariants}>
                        <YesterdayReturnsBanner batches={yesterdayReturns} />
                      </motion.div>
                    ) : null
                  }
                  kitchenQueueContent={
                    <motion.div variants={itemVariants}>
                      <SectionCard
                        title="Kitchen Batch Queue"
                        subtitle="Shows batches currently withdrawn to kitchen."
                      >
                        <div className="p-4">
                          {visibleKitchenBatches.length > 0 ? (
                            <KitchenBatchQueuePreview
                              batches={visibleKitchenBatches}
                              unit={selectedWithdrawalProduct?.unit ?? ""}
                            />
                          ) : (
                            <EmptyState message="No kitchen batches are currently queued." />
                          )}
                        </div>
                      </SectionCard>
                    </motion.div>
                  }
                  deliveredBatchesContent={
                    <motion.div variants={itemVariants}>
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
                  }
                  kitchenBatchesContent={
                    <motion.div variants={itemVariants}>
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
                  }
                  setWdType={setWdType}
                  setActiveWithdrawalRowId={setActiveWithdrawalRowId}
                  updateWithdrawalRow={updateWithdrawalRow}
                  removeWithdrawalRow={removeWithdrawalRow}
                  addWithdrawalRow={addWithdrawalRow}
                  submitWithdrawal={submitWithdrawal}
                  isReconcilable={isReconcilable}
                />
              )}

              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Alerts ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
              {tab === "alerts" && (
                <AlertsTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  stockAlertSettings={stockAlertSettings}
                  products={products}
                  lowStock={lowStock}
                  alertCriticalStock={alertCriticalStock}
                  outOfStockItems={outOfStockItems}
                  setTab={setTab}
                  handleOrderNow={po.handleOrderNow}
                  isMenuFoodProduct={isMenuFoodProduct}
                  getAlertSeverity={getAlertSeverity}
                  getStockStatus={getStockStatus}
                  getAppliedThresholds={getAppliedThresholds}
                  getCategoryStyle={getCategoryStyle}
                  statusBadge={STATUS_BADGE}
                  toNumber={toNumber}
                />
              )}

              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Suppliers ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
              {tab === "suppliers" && (
                <SuppliersTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  showSupplierForm={supplier.showSupplierForm}
                  supplierForm={supplier.supplierForm}
                  supplierProductInput={supplier.supplierProductInput}
                  supplierProductSuggestions={supplier.supplierProductSuggestions}
                  filteredSuppliers={supplier.filteredSuppliers}
                  supplierSearch={supplier.supplierSearch}
                  historySearch={supplier.historySearch}
                  historyDateFrom={supplier.historyDateFrom}
                  historyDateTo={supplier.historyDateTo}
                  historyLoading={supplier.historyLoading}
                  filteredHistory={supplier.filteredHistory}
                  supplierFields={supplier.supplierFields}
                  submitting={submitting}
                  setShowSupplierForm={supplier.setShowSupplierForm}
                  setSupplierProductInput={supplier.setSupplierProductInput}
                  setSupplierForm={supplier.setSupplierForm}
                  setSupplierSearch={supplier.setSupplierSearch}
                  setHistorySearch={supplier.setHistorySearch}
                  setHistoryDateFrom={supplier.setHistoryDateFrom}
                  setHistoryDateTo={supplier.setHistoryDateTo}
                  setEditingSupplier={supplier.setEditingSupplier}
                  addProductToSupplierForm={supplier.addProductToSupplierForm}
                  addSupplier={supplier.addSupplier}
                  removeSupplier={supplier.removeSupplier}
                  handleRemoveSupplierProduct={
                    supplier.handleRemoveSupplierProduct
                  }
                  fetchSupplierHistory={supplier.fetchSupplierHistory}
                />
              )}

              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Purchase Orders ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
              {tab === "purchases" && (
                <PurchaseOrdersTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  poOrders={po.poOrders}
                  lowStock={lowStock}
                  criticalStock={criticalStock}
                  poFilterStatus={po.poFilterStatus}
                  filteredPOs={po.filteredPOs}
                  poLoading={po.poLoading}
                  products={products}
                  stockAlertSettings={stockAlertSettings}
                  peso={PESO}
                  statusDot={STATUS_DOT}
                  statusBar={STATUS_BAR}
                  restockBanner={
                    <StockAlertRestockBanner
                      criticalItems={criticalStock}
                      lowItems={lowStock}
                      onOrderNow={po.handleOrderNow}
                      getCategoryStyle={getCategoryStyle}
                    />
                  }
                  setPoFilterStatus={po.setPoFilterStatus}
                  onNewPO={() => po.setPrefillPOProduct(null)}
                  onOrderNow={po.handleOrderNow}
                  isMenuFoodProduct={isMenuFoodProduct}
                  getStockStatus={getStockStatus}
                  onSelectOrder={po.setSelectedOrder}
                  onPrintOrder={po.setPrintOrder}
                  onDeleteOrder={po.handlePODelete}
                />
              )}
              {tab === "purchase-history" && (
                <PurchaseHistoryTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  filteredCompletedPOs={po.filteredCompletedPOs}
                  paginatedCompletedPOs={po.paginatedCompletedPOs}
                  poLoading={po.poLoading}
                  poHistoryDateFrom={po.poHistoryDateFrom}
                  poHistoryDateTo={po.poHistoryDateTo}
                  poHistoryFromInputRef={po.poHistoryFromInputRef}
                  poHistoryToInputRef={po.poHistoryToInputRef}
                  poHistoryPage={po.poHistoryPage}
                  poHistoryTotalPages={po.poHistoryTotalPages}
                  poHistoryPageSize={po.poHistoryPageSize}
                  peso={PESO}
                  setPoHistoryDateFrom={po.setPoHistoryDateFrom}
                  setPoHistoryDateTo={po.setPoHistoryDateTo}
                  setPoHistoryPage={po.setPoHistoryPage}
                  setSelectedOrder={po.setSelectedOrder}
                  setPrintOrder={po.setPrintOrder}
                />
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
                <span className="text-xl leading-none">{"\u2191"}</span>
              </motion.button>
            )}
        </AnimatePresence>

        {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Overlays ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
        <AnimatePresence>
          {po.selectedOrder && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => po.setSelectedOrder(null)}
                className="fixed inset-0 bg-black/10 z-40"
              />
              <PODetailDrawer
                order={po.selectedOrder}
                inventoryCategoryNameLookup={inventoryCategoryNameLookup}
                inventoryCategoryDateTrackingLookup={
                  inventoryCategoryDateTrackingLookup
                }
                onClose={() => po.setSelectedOrder(null)}
                onStatusChange={po.handlePOStatusChange}
                onDelete={po.handlePODelete}
                onPrint={po.setPrintOrder}
              />
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {po.printOrder && (
            <POPrintModal
              order={po.printOrder}
              onClose={() => po.setPrintOrder(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {po.receivingOrder && (
            <ReceivePOModal
              order={po.receivingOrder}
              loading={po.poLoading}
              currentStaffName={currentStaffDisplayName}
              inventoryCategoryNameLookup={inventoryCategoryNameLookup}
              inventoryCategoryDateTrackingLookup={
                inventoryCategoryDateTrackingLookup
              }
              onClose={() => po.setReceivingOrder(null)}
              onConfirm={po.handleConfirmReceivePO}
              onShowToast={showToast}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {po.prefillPOProduct !== undefined && (
            <CreatePOModal
              onClose={po.handleClosePOModal}
              onCreate={po.handlePOCreate}
              quickOrderProducts={po.poQuickOrderProducts}
              allProducts={products}
              allSuppliers={supplier.suppliers}
              prefillProduct={po.prefillPOProduct}
              onShowToast={showToast}
              isMenuFoodProduct={isMenuFoodProduct}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {supplier.editingSupplier && (
            <SupplierProductsModal
              supplier={supplier.editingSupplier}
              allProducts={products}
              loading={submitting}
              onClose={() => supplier.setEditingSupplier(null)}
              onSaveProducts={supplier.saveSupplierProducts}
              onRemoveProduct={supplier.handleRemoveSupplierProduct}
            />
          )}
        </AnimatePresence>

        {/* Add Material Modal */}
        <AnimatePresence>
          {showRawMaterialForm && (
            <AddMaterialModal
              rawMaterialForm={rawMaterialForm}
              setRawMaterialForm={setRawMaterialForm}
              activeInventoryCategoryOptions={activeInventoryCategoryOptions}
              activeInventoryUnitOptions={activeInventoryUnitOptions}
              materialNameMaxLength={MATERIAL_NAME_MAX_LENGTH}
              materialDescriptionMaxLength={MATERIAL_DESCRIPTION_MAX_LENGTH}
              submitting={submitting}
              onClose={() => setShowRawMaterialForm(false)}
              onSave={addRawMaterial}
            />
          )}
        </AnimatePresence>

        {/* End-of-Day Reconciliation Modal */}
        <AnimatePresence>
          {showReconcile && (
            <EndOfDayReconciliationModal
              reconcileItems={reconcileItems}
              setReconcileItems={setReconcileItems}
              submitting={submitting}
              getCategoryStyle={getCategoryStyle}
              onClose={() => setShowReconcile(false)}
              onSubmit={submitReconciliation}
            />
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
