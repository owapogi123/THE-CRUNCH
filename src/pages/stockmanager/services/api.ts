import type {
  Batch,
  InventoryCategoryMaster,
  InventoryUnitMaster,
  KitchenBatch,
  KitchenUsagePayload,
  POStatus,
  Product,
  PurchaseOrder,
  ReportData,
  StockStatusRecord,
  StorageBatch,
  Supplier,
  SupplierHistory,
  WithdrawalType,
} from "../types/inventory";

export const RAW_API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000";
export const API_BASE = `${RAW_API_BASE.replace(/\/api\/?$/, "").replace(/\/$/, "")}/api`;

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = cleanPath.startsWith("/api/")
    ? cleanPath.slice(4)
    : cleanPath;
  const res = await fetch(`${API_BASE}${normalizedPath}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(
      `API ${res.status}: ${await res.text().catch(() => "Unknown error")}`,
    );
  }
  return res.json();
}

export const api = {
  getInventory: () => apiFetch<Product[]>("/inventory"),
  getSettings: () => apiFetch<Record<string, unknown>>("/settings"),
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
    menu_code?: string;
    quantity: number;
    recorded_by: string | null;
    reason?: "expired" | "past_shelf_life";
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
    item_type?: "stock_item" | "menu_item";
    use_default_thresholds?: boolean;
    low_stock_threshold?: number | null;
    critical_stock_threshold?: number | null;
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
    }>("/batches/withdraw", {
      method: "POST",
      body: JSON.stringify(body),
    }),
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
      useDefaultThresholds?: boolean;
      lowStockThreshold?: number | null;
      criticalStockThreshold?: number | null;
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
  getInventoryCategories: () =>
    apiFetch<InventoryCategoryMaster[]>(
      "/settings/inventory-categories?activeOnly=1",
    ),
  getInventoryUnits: () =>
    apiFetch<InventoryUnitMaster[]>("/settings/inventory-units?activeOnly=1"),
  getDailyUsageReport: () =>
    apiFetch<KitchenUsagePayload>(
      "/inventory/daily-usage?preferLatestPopulated=1",
    ),
  finalizeKitchenUsage: (
    reportId: number,
    body: { finalized_by: number | null },
  ) =>
    apiFetch<KitchenUsagePayload>(
      `/inventory/daily-usage/${reportId}/finalize`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
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
      itemShelfLife?: Record<
        number,
        { shelfLifeDays?: number | null; shelfLifeHours?: number | null }
      >,
    ) =>
      apiFetch<PurchaseOrder>(`/purchase-orders/${id}/receive`, {
        method: "PATCH",
        body: JSON.stringify({
          receiptNo,
          receivedBy,
          receivedDate: new Date().toISOString(),
          itemExpiryDates,
          itemShelfLife,
        }),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean }>(`/purchase-orders/${id}`, {
        method: "DELETE",
      }),
  },
};

export const storageApi = {
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
    }>("/batches/withdraw", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const kitchenApi = {
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
