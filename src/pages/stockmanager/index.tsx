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
import {
  fetchGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  formatInSettingsTimezone,
} from "@/lib/restaurantSettings";
import { api } from "./services/api";
import type {
  InventoryAlertsPayload,
  InventoryCategoryMaster,
  InventoryUnitMaster,
  Product,
  RawMaterialForm,
  StockAlertSettings,
  StockStatus,
  Tab,
} from "./types/inventory";
import { DashboardSummaryModal } from "./components/DashboardSummaryModal";
import { ErrorBanner } from "./components/ErrorBanner";
import { ExpiryChip } from "./components/ExpiryChip";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { RawMaterialTimingCell } from "./components/RawMaterialTimingCell";
import { SectionCard } from "./components/SectionCard";
import { SupplierProductsModal } from "./components/SupplierProductsModal";
import { PODetailDrawer } from "./components/purchase-orders/PODetailDrawer";
import { CreatePOModal } from "./components/purchase-orders/CreatePOModal";
import { POPrintModal } from "./components/purchase-orders/POPrintModal";
import { ReceivePOModal } from "./components/purchase-orders/ReceivePOModal";
import { AddMaterialModal } from "./components/modals/AddMaterialModal";
import { StockAlertRestockBanner } from "./components/batches/StockAlertRestockBanner";
import { PurchaseHistoryTab } from "./components/tabs/PurchaseHistoryTab";
import { AlertsTab } from "./components/tabs/AlertsTab";
import { PurchaseOrdersTab } from "./components/tabs/PurchaseOrdersTab";
import { SuppliersTab } from "./components/tabs/SuppliersTab";
import { DashboardTab } from "./components/tabs/DashboardTab";
import { useDashboard } from "./hooks/useDashboard";
import { usePurchaseOrders } from "./hooks/usePurchaseOrders";
import { useSuppliers } from "./hooks/useSuppliers";
import { toNumber } from "./utils/formatters";
import {
  DEFAULT_STOCK_ALERT_SETTINGS,
  getAlertSeverity,
  getAppliedThresholds,
  getShelfLifeStatus,
  getProductUiStatus,
  getStockStatus,
  isStrictRawMaterialCategory,
  normalizeInventoryCategoryName,
  normalizeStockAlertSettings,
} from "./utils/stockUtils";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "alerts", label: "Alerts" },
  { id: "suppliers", label: "Suppliers" },
  { id: "purchases", label: "Purchase Orders" },
  { id: "purchase-history", label: "Purchase Order History" },
];
const ACTIVE_TAB_STORAGE_KEY = "stockmanager.activeTab";
const REMOVED_STOCK_MANAGER_TABS = new Set([
  "withdrawal",
  "kitchen",
  "kitchen-stock",
]);
const FALLBACK_TAB: Tab = "dashboard";

function isValidStockManagerTab(value: unknown): value is Tab {
  const normalized = String(value ?? "").trim().toLowerCase();
  return TABS.some((tab) => tab.id === normalized);
}

function sanitizeStockManagerTab(value: unknown): Tab {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (REMOVED_STOCK_MANAGER_TABS.has(normalized)) {
    return FALLBACK_TAB;
  }
  return isValidStockManagerTab(normalized) ? normalized : FALLBACK_TAB;
}

const BLANK_RAW_MATERIAL: RawMaterialForm = {
  name: "",
  category: "Sauces",
  unit: "liter",
  description: "",
  useDefaultThresholds: false,
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
const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  cashier: "Cashier",
  cook: "Cook",
  inventory_manager: "Stock Manager",
  customer: "Customer",
};
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
const isMenuFoodProduct = (p: Pick<Product, "item_type">) =>
  String(p.item_type ?? "")
    .trim()
    .toLowerCase() === "menu_item";
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

const EditIcon = () => (
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
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L12 15l-4 1 1-4 8.586-8.586z"
    />
  </svg>
);

function validateMaterialThresholds(form: RawMaterialForm) {
  const lowStockThreshold =
    form.lowStockThreshold.trim() === "" ? null : Number(form.lowStockThreshold);
  const criticalStockThreshold =
    form.criticalStockThreshold.trim() === ""
      ? null
      : Number(form.criticalStockThreshold);

  if (form.useDefaultThresholds) {
    return {
      ok: true,
      lowStockThreshold: null,
      criticalStockThreshold: null,
      message: "",
    } as const;
  }

  if (
    lowStockThreshold === null ||
    !Number.isFinite(lowStockThreshold) ||
    lowStockThreshold < 0
  ) {
    return {
      ok: false,
      lowStockThreshold,
      criticalStockThreshold,
      message: "Please enter a valid warning stock level.",
    } as const;
  }

  if (
    criticalStockThreshold === null ||
    !Number.isFinite(criticalStockThreshold) ||
    criticalStockThreshold < 0
  ) {
    return {
      ok: false,
      lowStockThreshold,
      criticalStockThreshold,
      message: "Please enter a valid critical stock level.",
    } as const;
  }

  if (criticalStockThreshold > lowStockThreshold) {
    return {
      ok: false,
      lowStockThreshold,
      criticalStockThreshold,
      message: "Critical stock level cannot be greater than warning stock level.",
    } as const;
  }

  return {
    ok: true,
    lowStockThreshold,
    criticalStockThreshold,
    message: "",
  } as const;
}
// Main component

export default function StockManager() {
  const { user } = useAuth();
  const [restaurantSettings, setRestaurantSettings] = useState(
    GENERAL_SETTINGS_DEFAULTS,
  );
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") {
      return FALLBACK_TAB;
    }
    return sanitizeStockManagerTab(
      window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY),
    );
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRawMaterialForm, setShowRawMaterialForm] = useState(false);
  const [rawMaterialForm, setRawMaterialForm] =
    useState<RawMaterialForm>(BLANK_RAW_MATERIAL);
  const [editingMaterial, setEditingMaterial] = useState<Product | null>(null);
  const [inventoryCategories, setInventoryCategories] = useState<
    InventoryCategoryMaster[]
  >([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnitMaster[]>(
    [],
  );
  const [stockAlertSettings, setStockAlertSettings] =
    useState<StockAlertSettings>(DEFAULT_STOCK_ALERT_SETTINGS);
  const [backendAlerts, setBackendAlerts] =
    useState<InventoryAlertsPayload | null>(null);
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
  const currentStaffRoleLabel = useMemo(() => {
    const role = String(user?.role ?? "").trim().toLowerCase();
    return ROLE_LABELS[role] ?? "User";
  }, [user?.role]);

  const { addNotification } = useNotifications();
  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      addNotification({ id: crypto.randomUUID(), label: message, type });
    },
    [addNotification],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchGeneralSettings().then((settings) => {
      if (!cancelled) {
        setRestaurantSettings(settings);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const supplier = useSuppliers({
    products,
    tab: sanitizeStockManagerTab(tab),
    showToast,
    setSubmitting,
    isMenuFoodProduct,
  });

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
      const [
        invRes,
        supRes,
        categoryRes,
        unitRes,
        settingsRes,
        alertRes,
      ] =
        await Promise.allSettled([
          api.getInventory(),
          supplier.fetchSuppliers(),
          api.getInventoryCategories(),
          api.getInventoryUnits(),
          api.getSettings(),
          api.getInventoryAlerts(),
        ]);

      if (
        invRes.status !== "fulfilled" ||
        supRes.status !== "fulfilled"
      ) {
        throw new Error("Failed to load data.");
      }

      const inv = invRes.value;
      const categoryList =
        categoryRes.status === "fulfilled" ? categoryRes.value : [];
      const unitList = unitRes.status === "fulfilled" ? unitRes.value : [];
      const nextStockAlertSettings =
        settingsRes.status === "fulfilled"
          ? normalizeStockAlertSettings(settingsRes.value)
          : DEFAULT_STOCK_ALERT_SETTINGS;
      setBackendAlerts(alertRes.status === "fulfilled" ? alertRes.value : null);
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
          description:
            typeof (p as { description?: unknown }).description === "string"
              ? String((p as { description?: unknown }).description)
              : "",
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [supplier.fetchSuppliers]);
  refreshInventoryRef.current = fetchAll;

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    if (sanitizeStockManagerTab(tab) !== "dashboard") {
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
  useEffect(() => {
    const safeTab = sanitizeStockManagerTab(tab);
    if (safeTab !== tab) {
      setTab(safeTab);
    }
  }, [tab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    const safeStoredTab = sanitizeStockManagerTab(storedTab);
    if (storedTab !== safeStoredTab) {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, safeStoredTab);
    }
    window.localStorage.setItem(
      ACTIVE_TAB_STORAGE_KEY,
      sanitizeStockManagerTab(tab),
    );
  }, [tab]);

  const activeTab = sanitizeStockManagerTab(tab);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    dashboard.selectDashboardSubTab("main-stock");
  }, [activeTab, dashboard.selectDashboardSubTab]);
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

  async function addRawMaterial() {
    const name = rawMaterialForm.name.trim();
    const description = rawMaterialForm.description.trim();
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
    const thresholdValidation = validateMaterialThresholds(rawMaterialForm);
    if (!thresholdValidation.ok) {
      showToast(thresholdValidation.message, "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.createProduct({
        name,
        price: 0,
        quantity: 0,
        unit: rawMaterialForm.unit.trim(),
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
          : thresholdValidation.lowStockThreshold,
        critical_stock_threshold: rawMaterialForm.useDefaultThresholds
          ? null
          : thresholdValidation.criticalStockThreshold,
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

  function openEditMaterial(product: Product) {
    setEditingMaterial(product);
    setRawMaterialForm({
      name: product.product_name,
      category: product.category,
      unit: product.unit,
      description: product.description ?? "",
      useDefaultThresholds:
        product.useDefaultThresholds === true ||
        product.useDefaultThresholds === 1,
      lowStockThreshold:
        product.lowStockThreshold == null
          ? ""
          : String(product.lowStockThreshold),
      criticalStockThreshold:
        product.criticalStockThreshold == null
          ? ""
          : String(product.criticalStockThreshold),
    });
    setShowRawMaterialForm(true);
  }

  async function saveEditedMaterial() {
    if (!editingMaterial) return;

    const name = rawMaterialForm.name.trim();
    const description = rawMaterialForm.description.trim();
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
    const duplicate = products.find(
      (p) =>
        p.product_id !== editingMaterial.product_id &&
        p.product_name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      showToast("This material already exists in inventory.", "error");
      return;
    }

    const thresholdValidation = validateMaterialThresholds(rawMaterialForm);
    if (!thresholdValidation.ok) {
      showToast(thresholdValidation.message, "error");
      return;
    }

    setSubmitting(true);
    try {
      await api.updateProduct(editingMaterial.product_id, {
        name,
        unit: rawMaterialForm.unit.trim(),
        category: rawMaterialForm.category.trim(),
        description: description || "",
        use_default_thresholds: rawMaterialForm.useDefaultThresholds,
        low_stock_threshold: rawMaterialForm.useDefaultThresholds
          ? null
          : thresholdValidation.lowStockThreshold,
        critical_stock_threshold: rawMaterialForm.useDefaultThresholds
          ? null
          : thresholdValidation.criticalStockThreshold,
      });
      await fetchAll();
      setEditingMaterial(null);
      setRawMaterialForm(BLANK_RAW_MATERIAL);
      setShowRawMaterialForm(false);
      showToast("Material updated.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to update material.",
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
          <div className="flex flex-wrap items-start gap-3 px-4 py-3 pt-20 md:px-6 md:pt-24 lg:flex-nowrap lg:items-center lg:gap-4 lg:px-8 lg:pt-4 lg:pl-24">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight text-slate-800">
                Stock Manager
              </h2>
              <p className="mt-0.5 text-xs font-light text-slate-400">
                {formatInSettingsTimezone(new Date(), restaurantSettings, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="order-3 basis-full sm:order-2 sm:basis-auto lg:order-2 lg:mx-auto">
              <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                <span className="font-medium text-slate-500">Logged in:</span>
                <span className="font-semibold text-slate-800">
                  {currentStaffDisplayName || "Unknown User"}
                </span>
                <span className="text-slate-400">
                  ({currentStaffRoleLabel})
                </span>
              </div>
            </div>
            <div className="order-2 ml-auto flex flex-wrap items-center justify-end gap-3 sm:order-3 lg:order-3">
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
                  : t.id === "purchases"
                    ? po.poOrders.filter((o) => o.status === "Draft").length
                    : t.id === "purchase-history"
                      ? po.completedPOs.length
                        : 0;
              const active = activeTab === t.id;
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
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${active ? "bg-white/20 text-white" : t.id === "purchases" ? "bg-yellow-100 text-yellow-700" : t.id === "purchase-history" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {activeTab === "dashboard" && !isLoading && (
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
              {activeTab === "dashboard" && (
                <DashboardTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  dashboardTopRef={dashboardTopRef}
                  totalProductsValue={dashboard.totalProductsCounted.length.toString()}
                  lowStockValue={dashboard.lowStockItems.length.toString()}
                  criticalStockValue={dashboard.alertCriticalStock.length.toString()}
                  attentionValue={dashboard.attentionItems.length.toString()}
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
                                onClick={() => {
                                  setEditingMaterial(null);
                                  setRawMaterialForm(BLANK_RAW_MATERIAL);
                                  setShowRawMaterialForm(true);
                                }}
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
                                    "Shelf Life / Expiry",
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
                                {(dashboard.dashboardFilteredProducts ?? []).map((p, i) => {
                                  const shelfLifeStatus = p.isRawMaterial
                                    ? getShelfLifeStatus({
                                        usableUntil: p.usableUntil,
                                        shelfLifeDays: p.shelfLifeDays,
                                        shelfLifeHours: p.shelfLifeHours,
                                      })
                                    : null;
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
                                      <td className="py-3.5 px-4 text-right">
                                        {p.isRawMaterial ? (
                                          <RawMaterialTimingCell product={p} />
                                        ) : (
                                          <ExpiryChip dateStr={p.expiryDate} />
                                        )}
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        <span
                                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium capitalize ${statusBadgeClass}`}
                                        >
                                          {statusLabel}
                                        </span>
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              openEditMaterial(p);
                                            }}
                                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                            title={`Edit ${p.product_name}`}
                                          >
                                            <EditIcon />
                                          </button>
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
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {(dashboard.dashboardFilteredProducts?.length ?? 0) === 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
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
                                      {formatInSettingsTimezone(p.last_update, restaurantSettings, {
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
                />
              )}

              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Withdrawal ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}

              {/* ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ Alerts ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†'Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†'Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ */}
              {activeTab === "alerts" && (
                <AlertsTab
                  pageVariants={pageVariants}
                  staggerVariants={staggerVariants}
                  itemVariants={itemVariants}
                  stockAlertSettings={stockAlertSettings}
                  backendAlerts={backendAlerts}
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
              {activeTab === "suppliers" && (
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
              {activeTab === "purchases" && (
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
              {activeTab === "purchase-history" && (
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
          {activeTab === "dashboard" && showDashboardBackToTop && !isLoading && (
              <motion.button
                initial={{ opacity: 0, y: 16, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.92 }}
                transition={{ duration: 0.2 }}
                onClick={() => scrollDashboardTo("dashboard-top")}
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
              defaultLowStockThreshold={
                stockAlertSettings.defaultLowStockThreshold
              }
              defaultCriticalStockThreshold={
                stockAlertSettings.defaultCriticalStockThreshold
              }
              submitting={submitting}
              mode={editingMaterial ? "edit" : "add"}
              onClose={() => {
                setShowRawMaterialForm(false);
                setEditingMaterial(null);
                setRawMaterialForm(BLANK_RAW_MATERIAL);
              }}
              onSave={editingMaterial ? saveEditedMaterial : addRawMaterial}
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
