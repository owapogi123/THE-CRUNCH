export type WithdrawalType = "initial" | "supplementary" | "return";
export type StockStatus = "critical" | "low" | "normal";

export type WithdrawalFormRow = {
  id: string;
  productId: number | null;
  qty: string;
};

export type Tab =
  | "dashboard"
  | "withdrawal"
  | "alerts"
  | "suppliers"
  | "purchases"
  | "purchase-history";

export type DashboardSummaryKey =
  | "products"
  | "withdrawn"
  | "wasted"
  | "returned";

export type POStatus = "Draft" | "Ordered" | "Received" | "Cancelled";

export interface POItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number;
  expectedExpiryDate?: string;
  isRawMaterial?: boolean | number;
  shelfLifeDays?: number | null;
  shelfLifeHours?: number | null;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  contact: string;
  date: string;
  deliveryDate: string;
  status: POStatus;
  items: POItem[];
  notes: string;
  receiptNo?: string;
  receivedBy?: string;
  receivedDate?: string;
}

export interface Product {
  inventory_id: number;
  product_id: number;
  item_type?: string;
  product_name: string;
  category: string;
  unit: string;
  mainStock: number;
  quantity: number;
  item_purchased: number;
  last_update: string;
  reorderPoint: number;
  criticalPoint: number;
  useDefaultThresholds?: boolean | number;
  lowStockThreshold?: number | null;
  criticalStockThreshold?: number | null;
  supplier_name: string;
  dailyWithdrawn: number;
  returned: number;
  wasted: number;
  expiryDate?: string | null;
  usableUntil?: string | null;
  shelfLifeDays?: number | null;
  shelfLifeHours?: number | null;
  promo?: string;
  isRawMaterial?: boolean | number;
}

export interface StockStatusRecord {
  status_id: number;
  product_id: number;
  product_name: string;
  type: WithdrawalType;
  quantity: number;
  status_date: string;
  recorded_by: string | null;
}

export interface SupplierHistory {
  history_id: number;
  supplier_id: number;
  supplier_name: string;
  action: string;
  details?: string;
  performed_by?: string | null;
  created_at: string;
}

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_number: string;
  product_id: number;
  email?: string;
  products_supplied?: string;
}

export interface Batch {
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

export interface StorageBatch {
  batch_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  remaining_qty: number;
  unit: string;
  received_date: string;
  expiry_date: string;
  status: "active" | "expired";
}

export interface KitchenBatch {
  kitchen_batch_id: number;
  storage_batch_id: number;
  product_id: number;
  product_name: string;
  withdrawn_qty: number;
  used_qty: number;
  returned_qty: number;
  unit: string;
  expiry_date: string;
  withdrawn_at: string;
  status: "active" | "reconciled";
}

export interface ReconcileRow {
  product_id: number;
  inventory_id: number;
  product_name: string;
  category: string;
  unit: string;
  withdrawn: number;
  returnQty: string;
  returnDestination: "chopped" | "whole";
}

export interface RawMaterialForm {
  name: string;
  category: string;
  unit: string;
  description: string;
  useDefaultThresholds: boolean;
  lowStockThreshold: string;
  criticalStockThreshold: string;
}

export interface ReportLineItem {
  product_id: number;
  product_name: string;
  category: string;
  unit: string;
  received: number;
  withdrawn: number;
  returned: number;
  wasted: number;
  remaining: number;
  consumptionRate: number;
}

export interface ReportData {
  period: string;
  generatedAt: string;
  items: ReportLineItem[];
  totalReceived: number;
  totalWithdrawn: number;
  totalReturned: number;
  totalWasted: number;
}

export interface KitchenUsageReport {
  report_id: number;
  report_date: string;
  status: "pending" | "finalized";
  prepared_by: number | null;
  prepared_by_name?: string | null;
  finalized_by: number | null;
  finalized_by_name?: string | null;
  created_at?: string | null;
  finalized_at?: string | null;
  updated_at?: string | null;
}

export interface KitchenUsageItem {
  usage_item_id?: number;
  product_id: number | null;
  product_name: string;
  category: string;
  unit: string;
  withdrawn_qty: number;
  used_qty: number;
  spoilage_qty: number;
  returned_qty: number;
  note: string;
}

export interface KitchenUsagePayload {
  report: KitchenUsageReport;
  items: KitchenUsageItem[];
}

export interface InventoryCategoryMaster {
  category_id: number;
  name: string;
  type?: "raw_material" | "ingredient" | "finished";
  date_tracking_type: "none" | "expiry" | "shelf_life";
  is_active: boolean | number;
}

export interface InventoryUnitMaster {
  unit_id: number;
  name: string;
  abbreviation?: string | null;
  is_active: boolean | number;
}

export interface StockAlertSettings {
  defaultLowStockThreshold: number;
  defaultCriticalStockThreshold: number;
}

export interface NearestTimingInfo {
  batchId: number | null;
  date: string | null;
  status: "expired" | "near" | "safe" | "none";
  label: string;
}
