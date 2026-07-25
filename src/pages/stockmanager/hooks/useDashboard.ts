import { useCallback, useMemo, useState } from "react";
import type {
  DashboardSummaryKey,
  Product,
  PurchaseOrder,
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
  purchaseOrders: PurchaseOrder[];
  completedPurchaseOrders: PurchaseOrder[];
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
  purchaseOrders,
  completedPurchaseOrders,
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

  const normalStockItems = useMemo(
    () =>
      products.filter(
        (product) =>
          !isMenuFoodProduct(product) &&
          getAlertSeverity(product, stockAlertSettings) === "normal",
      ),
    [products, stockAlertSettings, isMenuFoodProduct],
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

    const normalRows = [...normalStockItems]
      .sort((a, b) => a.product_name.localeCompare(b.product_name))
      .map((product) => ({
        id: `normal-${product.product_id}`,
        name: product.product_name,
        value: `${fmtInt(product.mainStock)} ${product.unit}`,
        meta: `${product.category} - within safe stock range`,
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

    const outRows = [...outOfStockItems]
      .sort((a, b) => a.product_name.localeCompare(b.product_name))
      .map((product) => ({
        id: `out-${product.product_id}`,
        name: product.product_name,
        value: `0 ${product.unit}`,
        meta: `${product.category} - reorder point ${fmtInt(product.reorderPoint)}`,
      }));

    const toPurchaseOrderRows = (orders: PurchaseOrder[], prefix: string) =>
      orders.map((order) => ({
        id: `${prefix}-${order.id}`,
        name: order.id,
        value: `${order.items.length} item${order.items.length === 1 ? "" : "s"}`,
        meta: `${order.supplier} - ${order.status} - ${order.receivedDate || order.deliveryDate || order.date}`,
      }));
    const draftOrders = purchaseOrders.filter((order) => order.status === "Draft");
    const orderedOrders = purchaseOrders.filter((order) => order.status === "Ordered");
    const receivedOrders = purchaseOrders.filter((order) => order.status === "Received");
    const receivedTodayOrders = completedPurchaseOrders.filter(
      (order) => order.receivedDate === new Date().toISOString().split("T")[0],
    );
    const receiptOrders = completedPurchaseOrders.filter((order) => !!order.receiptNo);

    return {
      products: {
        title: "Total Products Summary",
        subtitle: "All inventory items currently tracked in stock manager.",
        totalLabel: "Total Products",
        totalValue: totalProductsCounted.length.toString(),
        rows: productRows,
        emptyMessage: "No products found in inventory.",
      },
      normal: {
        title: "Normal Stock Summary",
        subtitle: "Inventory items currently within their safe stock range.",
        totalLabel: "Normal Stock Items",
        totalValue: normalRows.length.toString(),
        rows: normalRows,
        emptyMessage: "No items are currently in the normal stock range.",
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
      out: {
        title: "Out of Stock Summary",
        subtitle: "Inventory items with no stock remaining.",
        totalLabel: "Out of Stock Items",
        totalValue: outRows.length.toString(),
        rows: outRows,
        emptyMessage: "No items are out of stock.",
      },
      attention: {
        title: "Needs Attention Summary",
        subtitle: "All low, critical, and out-of-stock items.",
        totalLabel: "Attention Items",
        totalValue: attentionRows.length.toString(),
        rows: attentionRows,
        emptyMessage: "No attention items right now.",
      },
      poAll: {
        title: "Purchase Orders Summary",
        subtitle: "All current purchase orders across every status.",
        totalLabel: "Purchase Orders",
        totalValue: purchaseOrders.length.toString(),
        rows: toPurchaseOrderRows(purchaseOrders, "po"),
        emptyMessage: "No purchase orders found.",
      },
      poDraft: {
        title: "Draft Purchase Orders",
        subtitle: "Purchase orders that have not yet been placed.",
        totalLabel: "Draft Orders",
        totalValue: draftOrders.length.toString(),
        rows: toPurchaseOrderRows(draftOrders, "draft"),
        emptyMessage: "No draft purchase orders found.",
      },
      poOrdered: {
        title: "Ordered Purchase Orders",
        subtitle: "Purchase orders currently awaiting delivery.",
        totalLabel: "Ordered",
        totalValue: orderedOrders.length.toString(),
        rows: toPurchaseOrderRows(orderedOrders, "ordered"),
        emptyMessage: "No ordered purchase orders found.",
      },
      poReceived: {
        title: "Received Purchase Orders",
        subtitle: "Purchase orders already received into inventory.",
        totalLabel: "Received",
        totalValue: receivedOrders.length.toString(),
        rows: toPurchaseOrderRows(receivedOrders, "received"),
        emptyMessage: "No received purchase orders found.",
      },
      historyCompleted: {
        title: "Completed Purchase Order History",
        subtitle: "Completed orders in the selected history date range.",
        totalLabel: "Completed Orders",
        totalValue: completedPurchaseOrders.length.toString(),
        rows: toPurchaseOrderRows(completedPurchaseOrders, "history"),
        emptyMessage: "No completed purchase orders match this date range.",
      },
      historyToday: {
        title: "Purchase Orders Received Today",
        subtitle: "Completed purchase orders received today.",
        totalLabel: "Received Today",
        totalValue: receivedTodayOrders.length.toString(),
        rows: toPurchaseOrderRows(receivedTodayOrders, "today"),
        emptyMessage: "No purchase orders were received today.",
      },
      historyReceipt: {
        title: "Purchase Orders With Receipts",
        subtitle: "Completed purchase orders with a receipt number logged.",
        totalLabel: "Receipts Logged",
        totalValue: receiptOrders.length.toString(),
        rows: toPurchaseOrderRows(receiptOrders, "receipt"),
        emptyMessage: "No completed purchase orders have receipts logged.",
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
    completedPurchaseOrders,
    lowStockItems,
    normalStockItems,
    outOfStockItems,
    purchaseOrders,
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
