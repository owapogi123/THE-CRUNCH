import { useCallback, useMemo, useState } from "react";
import type {
  DashboardSummaryKey,
  Product,
  StockAlertSettings,
} from "../types/inventory";
import { fmtInt, toNumber } from "../utils/formatters";
import {
  getAlertSeverity,
  isCountedInTotalProducts,
  isMainStockDashboardCategory,
} from "../utils/stockUtils";

type DashboardSubTab =
  | "main-stock"
  | "last-updates"
  | "record-spoilage"
  | "stock-movement"
  | "cook-report";

type UseDashboardParams = {
  products: Product[];
  mainStockProducts: Product[];
  stockAlertSettings: StockAlertSettings;
  inventoryCategoryDateTrackingLookup: Map<string, "none" | "expiry" | "shelf_life">;
  isMenuFoodProduct: (product: Pick<Product, "item_type">) => boolean;
  isWholeChicken: (product: Product) => boolean;
  isChoppedChicken: (product: Product) => boolean;
};

export function useDashboard({
  products,
  mainStockProducts,
  stockAlertSettings,
  inventoryCategoryDateTrackingLookup,
  isMenuFoodProduct,
  isWholeChicken,
  isChoppedChicken,
}: UseDashboardParams) {
  const [dashboardSubTab, setDashboardSubTab] =
    useState<DashboardSubTab>("main-stock");
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummaryKey | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState("");

  const outOfStockItems = useMemo(
    () =>
      products.filter(
        (product) =>
          !isMenuFoodProduct(product) &&
          getAlertSeverity(product, stockAlertSettings) === "out",
      ),
    [products, stockAlertSettings, isMenuFoodProduct],
  );

  const alertCriticalStock = useMemo(
    () =>
      products.filter(
        (product) =>
          !isMenuFoodProduct(product) &&
          getAlertSeverity(product, stockAlertSettings) === "critical" &&
          toNumber(product.mainStock) > 0,
      ),
    [products, stockAlertSettings, isMenuFoodProduct],
  );

  const attentionItems = useMemo(
    () =>
      products.filter(
        (product) =>
          !isMenuFoodProduct(product) &&
          getAlertSeverity(product, stockAlertSettings) !== "normal",
      ),
    [products, stockAlertSettings, isMenuFoodProduct],
  );

  const dashboardFilteredProducts = useMemo(() => {
    const q = dashboardSearch.trim().toLowerCase();
    const base = products.filter(
      (product) =>
        !isMenuFoodProduct(product) &&
        isMainStockDashboardCategory(
          product.category,
          inventoryCategoryDateTrackingLookup,
        ),
    );
    const filtered = !q
      ? base
      : base.filter(
          (product) =>
            product.product_name.toLowerCase().includes(q) ||
            product.category.toLowerCase().includes(q),
        );
    return [...filtered].sort((a, b) => {
      const diff = toNumber(b.dailyWithdrawn) - toNumber(a.dailyWithdrawn);
      return diff !== 0
        ? diff
        : a.mainStock / Math.max(1, a.reorderPoint * 2) -
            b.mainStock / Math.max(1, b.reorderPoint * 2);
    });
  }, [products, dashboardSearch, isMenuFoodProduct, inventoryCategoryDateTrackingLookup]);

  const totalWithdrawn = products.reduce(
    (sum, product) => sum + toNumber(product.dailyWithdrawn),
    0,
  );
  const totalWasted = products.reduce(
    (sum, product) => sum + toNumber(product.wasted),
    0,
  );
  const totalReturned = products.reduce(
    (sum, product) => sum + toNumber(product.returned),
    0,
  );

  const totalProductsCounted = useMemo(
    () =>
      products.filter(
        (product) =>
          isCountedInTotalProducts(product.category) &&
          !isMenuFoodProduct(product),
      ),
    [products, isMenuFoodProduct],
  );

  const dashboardSummaryConfig = useMemo(() => {
    const productRows = [...totalProductsCounted]
      .sort((a, b) => a.product_name.localeCompare(b.product_name))
      .map((product) => ({
        id: `product-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.mainStock)} ${product.unit}`,
        meta: `${product.category} · reorder point ${fmtInt(product.reorderPoint)}`,
      }));
    const withdrawnRows = [...products]
      .filter((product) => toNumber(product.dailyWithdrawn) > 0)
      .sort(
        (a, b) => toNumber(b.dailyWithdrawn) - toNumber(a.dailyWithdrawn),
      )
      .map((product) => ({
        id: `withdrawn-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.dailyWithdrawn)} ${product.unit}`,
        meta: `${product.category} · main stock ${fmtInt(product.mainStock)} ${product.unit}`,
      }));
    const wastedRows = [...products]
      .filter((product) => toNumber(product.wasted) > 0)
      .sort((a, b) => toNumber(b.wasted) - toNumber(a.wasted))
      .map((product) => ({
        id: `wasted-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.wasted)} ${product.unit}`,
        meta: `${product.category} · withdrawn today ${fmtInt(product.dailyWithdrawn)} ${product.unit}`,
      }));
    const returnedRows = [...products]
      .filter((product) => toNumber(product.returned) > 0)
      .sort((a, b) => toNumber(b.returned) - toNumber(a.returned))
      .map((product) => ({
        id: `returned-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.returned)} ${product.unit}`,
        meta: `${product.category} · current stock ${fmtInt(product.mainStock)} ${product.unit}`,
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
        title: "Released Today Summary",
        subtitle: "Items released from storage for kitchen use today.",
        totalLabel: "Total Released",
        totalValue: fmtInt(totalWithdrawn),
        rows: withdrawnRows,
        emptyMessage: "No products have been released today.",
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

  const wholeChickenProducts = useMemo(
    () => mainStockProducts.filter(isWholeChicken),
    [mainStockProducts, isWholeChicken],
  );

  const choppedChickenProducts = useMemo(
    () => mainStockProducts.filter(isChoppedChicken),
    [mainStockProducts, isChoppedChicken],
  );

  const selectedSummaryConfig = dashboardSummary
    ? dashboardSummaryConfig[dashboardSummary]
    : null;

  const selectDashboardSummary = useCallback(
    (key: DashboardSummaryKey) => setDashboardSummary(key),
    [],
  );
  const selectDashboardSubTab = useCallback(
    (tab: DashboardSubTab) => setDashboardSubTab(tab),
    [],
  );
  const closeDashboardSummary = useCallback(
    () => setDashboardSummary(null),
    [],
  );

  return {
    dashboardSubTab,
    dashboardSummary,
    dashboardSearch,
    outOfStockItems,
    alertCriticalStock,
    attentionItems,
    dashboardFilteredProducts,
    totalWithdrawn,
    totalWasted,
    totalReturned,
    totalProductsCounted,
    dashboardSummaryConfig,
    selectedSummaryConfig,
    wholeChickenProducts,
    choppedChickenProducts,
    selectDashboardSubTab,
    selectDashboardSummary,
    setDashboardSearch,
    closeDashboardSummary,
  };
}
