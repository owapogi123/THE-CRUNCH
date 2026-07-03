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

type DashboardSubTab = "main-stock" | "last-updates";

type UseDashboardParams = {
  products: Product[];
  mainStockProducts: Product[];
  stockAlertSettings: StockAlertSettings;
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >;
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

  const lowStockItems = useMemo(
    () =>
      products.filter(
        (product) =>
          !isMenuFoodProduct(product) &&
          getAlertSeverity(product, stockAlertSettings) === "low",
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
      const stockDiff = toNumber(a.mainStock) - toNumber(b.mainStock);
      if (stockDiff !== 0) return stockDiff;

      const alertDiff =
        toNumber(a.reorderPoint) - toNumber(b.reorderPoint);
      if (alertDiff !== 0) return alertDiff;

      return a.product_name.localeCompare(b.product_name);
    });
  }, [
    products,
    dashboardSearch,
    isMenuFoodProduct,
    inventoryCategoryDateTrackingLookup,
  ]);

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
        meta: `${product.category} - reorder point ${fmtInt(product.reorderPoint)}`,
      }));

    const lowRows = [...lowStockItems]
      .sort((a, b) => toNumber(a.mainStock) - toNumber(b.mainStock))
      .map((product) => ({
        id: `low-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.mainStock)} ${product.unit}`,
        meta: `${product.category} - warning level ${fmtInt(product.reorderPoint)}`,
      }));

    const criticalRows = [...alertCriticalStock]
      .sort((a, b) => toNumber(a.mainStock) - toNumber(b.mainStock))
      .map((product) => ({
        id: `critical-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.mainStock)} ${product.unit}`,
        meta: `${product.category} - critical level ${fmtInt(product.criticalPoint)}`,
      }));

    const attentionRows = [...attentionItems]
      .sort((a, b) => toNumber(a.mainStock) - toNumber(b.mainStock))
      .map((product) => ({
        id: `attention-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.mainStock)} ${product.unit}`,
        meta: `${product.category} - ${getAlertSeverity(product, stockAlertSettings)} stock`,
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
      low: {
        title: "Low Stock Summary",
        subtitle: "Items approaching their warning threshold.",
        totalLabel: "Low Stock Items",
        totalValue: lowRows.length.toString(),
        rows: lowRows,
        emptyMessage: "No low stock items found.",
      },
      critical: {
        title: "Critical Stock Summary",
        subtitle: "Items already at or below their critical threshold.",
        totalLabel: "Critical Items",
        totalValue: criticalRows.length.toString(),
        rows: criticalRows,
        emptyMessage: "No critical stock items found.",
      },
      attention: {
        title: "Needs Attention Summary",
        subtitle: "All low, critical, and out-of-stock items.",
        totalLabel: "Attention Items",
        totalValue: attentionRows.length.toString(),
        rows: attentionRows,
        emptyMessage: "No attention items right now.",
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
    alertCriticalStock,
    attentionItems,
    lowStockItems,
    stockAlertSettings,
    totalProductsCounted,
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
    lowStockItems,
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
