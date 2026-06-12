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
import { api } from "./services/api";
import type {
  InventoryCategoryMaster,
  InventoryUnitMaster,
  Product,
  RawMaterialForm,
  ReconcileRow,
  StockAlertSettings,
  StockStatus,
  StockStatusRecord,
  Tab,
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
import { CookReportPanel } from "./components/reports/CookReportPanel";
import { StockMovementReportPanel } from "./components/reports/StockMovementReportPanel";
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
import { useDashboard } from "./hooks/useDashboard";
import { useKitchenBatches } from "./hooks/useKitchenBatches";
import { usePurchaseOrders } from "./hooks/usePurchaseOrders";
import { useStockReports } from "./hooks/useStockReports";
import { useSuppliers } from "./hooks/useSuppliers";
import { useWithdrawals } from "./hooks/useWithdrawals";
import {
  fmtInt,
  toNumber,
} from "./utils/formatters";
import {
  DEFAULT_STOCK_ALERT_SETTINGS,
  getAlertSeverity,
  getAppliedThresholds,
  getNearestTimingInfo,
  getShelfLifeStatus,
  getProductUiStatus,
  getStockStatus,
  isStrictRawMaterialCategory,
  normalizeInventoryCategoryName,
  normalizeStockAlertSettings,
} from "./utils/stockUtils";

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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disposingProductId, setDisposingProductId] = useState<number | null>(
    null,
  );
  const [adjProductId, setAdjProductId] = useState<number | null>(null);
  const [adjQty, setAdjQty] = useState("");
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
  const [showDashboardBackToTop, setShowDashboardBackToTop] = useState(false);
  const dashboardTopRef = useRef<HTMLDivElement | null>(null);
  const refreshInventoryRef = useRef<() => Promise<void>>(async () => {});
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
  const refreshInventory = useCallback(
    () => refreshInventoryRef.current(),
    [],
  );
  const supplier = useSuppliers({
    products,
    tab,
    showToast,
    setSubmitting,
    isMenuFoodProduct,
  });
  const kitchen = useKitchenBatches({
    products,
    showToast,
    setSubmitting,
    refreshInventory,
    isReconcilable,
  });
  const reports = useStockReports({ showToast });

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

      const [, cookReportRes] = await Promise.allSettled([
        kitchen.fetchKitchenBatchData(),
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
      reports.applyCookReportPayload(
        cookReportRes.status === "fulfilled" ? cookReportRes.value : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [
    kitchen.fetchKitchenBatchData,
    reports.applyCookReportPayload,
    supplier.fetchSuppliers,
  ]);
  refreshInventoryRef.current = fetchAll;

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    if (tab !== "dashboard") return;
    const interval = window.setInterval(() => {
      void reports.fetchCookReport(true);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [tab, reports.fetchCookReport]);
  useEffect(() => {
    if (products.length > 0) {
      if (adjProductId === null) setAdjProductId(products[0].product_id);
    }
  }, [products, adjProductId]);
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
  const mainStockProducts = useMemo(
    () => products.filter((p) => !isMenuFoodProduct(p)),
    [products],
  );
  const dashboard = useDashboard({
    products,
    mainStockProducts,
    stockAlertSettings,
    inventoryCategoryDateTrackingLookup,
    isMenuFoodProduct,
    isWholeChicken,
    isChoppedChicken,
  });
  const withdrawal = useWithdrawals({
    products,
    withdrawals,
    kitchenBatches: kitchen.kitchenBatches,
    mainStockProducts,
    stockAlertSettings,
    fetchAll,
    showToast,
    setSubmitting,
  });
  useEffect(() => {
    if (tab !== "dashboard") return;
    dashboard.selectDashboardSubTab("main-stock");
  }, [tab, dashboard.selectDashboardSubTab]);
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
              {kitchen.yesterdayReturns.length > 0 && (
                <button
                  onClick={() => setTab("withdrawal")}
                  className="px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold border border-amber-200 flex items-center gap-1.5"
                >
                  {"\u21A9"} {kitchen.yesterdayReturns.length} return
                  {kitchen.yesterdayReturns.length > 1 ? "s" : ""} from yesterday
                </button>
              )}
              <button
                onClick={openReconcile}
                className="px-4 py-2 text-xs font-semibold bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors"
              >
                End-of-Day Reconciliation
              </button>
              {dashboard.attentionItems.length > 0 && (
                <button
                  onClick={() => setTab("alerts")}
                  className="px-3.5 py-1.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold border border-red-200 animate-pulse"
                >
                  {dashboard.attentionItems.length} item
                  {dashboard.attentionItems.length > 1 ? "s" : ""} need attention
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
                  ? dashboard.attentionItems.length
                  : t.id === "withdrawal"
                    ? kitchen.yesterdayReturns.length
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
                    onClick={() => dashboard.selectDashboardSubTab(item.id)}
                    className={`relative border-none bg-transparent px-6 py-3 text-sm font-semibold transition-colors duration-200 ${
                      dashboard.dashboardSubTab === item.id
                        ? "text-blue-600"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                    style={{ fontFamily: "'Poppins', sans-serif" }}
                  >
                    {item.label}
                    <span
                      className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-opacity duration-200 ${
                        dashboard.dashboardSubTab === item.id
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
                  totalProductsValue={dashboard.totalProductsCounted.length.toString()}
                  totalWithdrawnValue={fmtInt(dashboard.totalWithdrawn)}
                  totalWastedValue={fmtInt(dashboard.totalWasted)}
                  totalReturnedValue={fmtInt(dashboard.totalReturned)}
                  wholeChickenProducts={dashboard.wholeChickenProducts}
                  choppedChickenProducts={dashboard.choppedChickenProducts}
                  dashboardSubTab={dashboard.dashboardSubTab}
                  onSummarySelect={dashboard.selectDashboardSummary}
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
                                value={dashboard.dashboardSearch}
                                onChange={(e) =>
                                  dashboard.setDashboardSearch(e.target.value)
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
                                {dashboard.dashboardFilteredProducts.map((p, i) => {
                                  const shelfLifeStatus = p.isRawMaterial
                                    ? getShelfLifeStatus({
                                        usableUntil: p.usableUntil,
                                        shelfLifeDays: p.shelfLifeDays,
                                        shelfLifeHours: p.shelfLifeHours,
                                      })
                                    : null;
                                  const nearestTiming = getNearestTimingInfo(
                                    p,
                                    kitchen.activeBatches,
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
                                                void kitchen.handlePastShelfLifeReturn(
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
                                {dashboard.dashboardFilteredProducts.length === 0 && (
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
                    <CookReportPanel
                      itemVariants={itemVariants}
                      cookReport={reports.cookReport}
                      cookReportItems={reports.cookReportItems}
                      cookReportVarianceCount={reports.cookReportVarianceCount}
                      cookReportTotals={reports.cookReportTotals}
                      cookReportOpen={reports.cookReportOpen}
                      cookReportLoading={reports.cookReportLoading}
                      cookReportFinalizing={reports.cookReportFinalizing}
                      onRefresh={() => {
                        void reports.fetchCookReport();
                      }}
                      onToggleOpen={reports.toggleCookReportOpen}
                      onFinalize={reports.handleFinalizeCookReport}
                    />
                  }
                  stockMovementContent={
                    <StockMovementReportPanel
                      itemVariants={itemVariants}
                      inputCls={inputCls}
                      reportPeriod={reports.reportPeriod}
                      reportData={reports.reportData}
                      reportLoading={reports.reportLoading}
                      selectedWeekStart={reports.selectedWeekStart}
                      selectedMonth={reports.selectedMonth}
                      selectedYear={reports.selectedYear}
                      onReportPeriodChange={reports.setReportPeriod}
                      onSelectedWeekStartChange={reports.setSelectedWeekStart}
                      onSelectedMonthChange={reports.setSelectedMonth}
                      onSelectedYearChange={reports.setSelectedYear}
                      onFetchReport={reports.fetchReport}
                      onExportCsv={reports.exportReportCsv}
                      getCategoryStyle={getCategoryStyle}
                    />
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
                  wdType={withdrawal.wdType}
                  todayInitialExists={withdrawal.todayInitialExists}
                  kitchenRemaining={withdrawal.kitchenRemaining}
                  selectedWithdrawalProduct={withdrawal.selectedWithdrawalProduct}
                  withdrawalRows={withdrawal.withdrawalRows}
                  activeWithdrawalRowId={withdrawal.activeWithdrawalRowId}
                  wholeChickenProducts={dashboard.wholeChickenProducts}
                  choppedChickenProducts={dashboard.choppedChickenProducts}
                  otherMainStockProducts={otherMainStockProducts}
                  selectedWithdrawalStatus={withdrawal.selectedWithdrawalStatus}
                  selectedWithdrawalPct={withdrawal.selectedWithdrawalPct}
                  visibleWithdrawalLogs={withdrawal.visibleWithdrawalLogs}
                  products={products}
                  submitting={submitting}
                  typeBadge={TYPE_BADGE}
                  yesterdayReturnsBanner={
                    kitchen.yesterdayReturns.length > 0 ? (
                      <motion.div variants={itemVariants}>
                        <YesterdayReturnsBanner batches={kitchen.yesterdayReturns} />
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
                          {kitchen.visibleKitchenBatches.length > 0 ? (
                            <KitchenBatchQueuePreview
                              batches={kitchen.visibleKitchenBatches}
                              unit={
                                withdrawal.selectedWithdrawalProduct?.unit ?? ""
                              }
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
                            allBatches={kitchen.activeBatches}
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
                            kitchenBatches={kitchen.visibleKitchenBatches}
                            nonReturnableProductIds={kitchen.nonReturnableProductIds}
                            onReturn={kitchen.handleReturnKitchenBatch}
                          />
                        </div>
                      </div>
                    </motion.div>
                  }
                  setWdType={withdrawal.setWdType}
                  setActiveWithdrawalRowId={withdrawal.setActiveWithdrawalRowId}
                  updateWithdrawalRow={withdrawal.updateWithdrawalRow}
                  removeWithdrawalRow={withdrawal.removeWithdrawalRow}
                  addWithdrawalRow={withdrawal.addWithdrawalRow}
                  submitWithdrawal={withdrawal.submitWithdrawal}
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
                  alertCriticalStock={dashboard.alertCriticalStock}
                  outOfStockItems={dashboard.outOfStockItems}
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
        {dashboard.dashboardSummary && dashboard.selectedSummaryConfig && (
          <DashboardSummaryModal
            open={dashboard.dashboardSummary !== null}
            title={dashboard.selectedSummaryConfig.title}
            subtitle={dashboard.selectedSummaryConfig.subtitle}
            totalLabel={dashboard.selectedSummaryConfig.totalLabel}
            totalValue={dashboard.selectedSummaryConfig.totalValue}
            rows={dashboard.selectedSummaryConfig.rows}
            emptyMessage={dashboard.selectedSummaryConfig.emptyMessage}
            onClose={dashboard.closeDashboardSummary}
          />
        )}
      </div>
    </>
  );
}
