import type {
  Batch,
  NearestTimingInfo,
  POItem,
  Product,
  PurchaseOrder,
  StockAlertSettings,
  StockStatus,
} from "../types/inventory";
import { daysUntilExpiry, isExpired, isExpiringSoon } from "./dateUtils";
import { formatShelfLife, fmtDateTime, toNumber } from "./formatters";

export const DEFAULT_STOCK_ALERT_SETTINGS: StockAlertSettings = {
  defaultLowStockThreshold: 10,
  defaultCriticalStockThreshold: 5,
};

export function normalizeInventoryCategoryName(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getInventoryCategoryDateTrackingType(
  value: string | null | undefined,
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >,
): "none" | "expiry" | "shelf_life" {
  const normalized = normalizeInventoryCategoryName(value);
  if (inventoryCategoryDateTrackingLookup.has(normalized)) {
    return inventoryCategoryDateTrackingLookup.get(normalized) ?? "none";
  }
  return "none";
}

function getLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function resolveInventoryCategoryMatch(
  value: string | null | undefined,
  inventoryCategoryNameLookup: Map<string, string>,
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >,
): {
  matchedCategory: string | null;
  dateTrackingType: "none" | "expiry" | "shelf_life";
} {
  const normalizedCategory = normalizeInventoryCategoryName(value);
  const directMatch =
    inventoryCategoryNameLookup.get(normalizedCategory) ?? null;
  if (directMatch) {
    return {
      matchedCategory: directMatch,
      dateTrackingType:
        inventoryCategoryDateTrackingLookup.get(normalizedCategory) ?? "none",
    };
  }

  let bestMatchKey: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const key of inventoryCategoryNameLookup.keys()) {
    const distance = getLevenshteinDistance(normalizedCategory, key);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatchKey = key;
    }
  }

  if (bestMatchKey && bestDistance <= 2) {
    return {
      matchedCategory: inventoryCategoryNameLookup.get(bestMatchKey) ?? null,
      dateTrackingType:
        inventoryCategoryDateTrackingLookup.get(bestMatchKey) ?? "none",
    };
  }

  return {
    matchedCategory: null,
    dateTrackingType: "none",
  };
}

export const normalizeStockAlertSettings = (
  source: Record<string, unknown> | null | undefined,
): StockAlertSettings => {
  const defaultCriticalStockThreshold = Math.max(
    0,
    toNumber(
      source?.defaultCriticalStockThreshold ?? source?.criticalStockThreshold,
      DEFAULT_STOCK_ALERT_SETTINGS.defaultCriticalStockThreshold,
    ),
  );
  const defaultLowStockThreshold = Math.max(
    defaultCriticalStockThreshold,
    toNumber(
      source?.defaultLowStockThreshold ?? source?.lowStockThreshold,
      DEFAULT_STOCK_ALERT_SETTINGS.defaultLowStockThreshold,
    ),
  );

  return {
    defaultLowStockThreshold,
    defaultCriticalStockThreshold,
  };
};

export const getAlertSeverity = (
  p: Product,
  settings: StockAlertSettings,
): "out" | "critical" | "low" | "normal" => {
  const stock = toNumber(p.mainStock);
  const appliedThresholds = getAppliedThresholds(p, settings);

  if (stock <= 0) return "out";
  if (stock <= appliedThresholds.critical) return "critical";
  if (stock <= appliedThresholds.low) return "low";
  return "normal";
};

export const getAppliedThresholds = (
  p: Pick<
    Product,
    "useDefaultThresholds" | "lowStockThreshold" | "criticalStockThreshold"
  >,
  settings: StockAlertSettings,
) => {
  const useDefaultThresholds =
    p.useDefaultThresholds === undefined ||
    p.useDefaultThresholds === null ||
    p.useDefaultThresholds === true ||
    p.useDefaultThresholds === 1;
  const low = useDefaultThresholds
    ? settings.defaultLowStockThreshold
    : toNumber(p.lowStockThreshold, settings.defaultLowStockThreshold);
  const critical = useDefaultThresholds
    ? settings.defaultCriticalStockThreshold
    : toNumber(
        p.criticalStockThreshold,
        settings.defaultCriticalStockThreshold,
      );

  return {
    useDefaultThresholds,
    low: Math.max(critical, low),
    critical: Math.max(0, critical),
  };
};

export const getStockStatus = (
  p: Product,
  settings: StockAlertSettings,
): StockStatus =>
  getAlertSeverity(p, settings) === "critical"
    ? "critical"
    : getAlertSeverity(p, settings) === "low"
      ? "low"
      : "normal";

export function getShelfLifeDurationMs(
  days?: number | null,
  hours?: number | null,
): number {
  return (
    (Math.max(0, toNumber(days)) * 24 + Math.max(0, toNumber(hours))) *
    60 *
    60 *
    1000
  );
}

export function getShelfLifeStatus({
  usableUntil,
  shelfLifeDays,
  shelfLifeHours,
}: {
  usableUntil?: string | null;
  shelfLifeDays?: number | null;
  shelfLifeHours?: number | null;
}): "Usable" | "Near End of Shelf Life" | "Past Shelf Life" {
  const usableUntilMs = usableUntil ? new Date(usableUntil).getTime() : NaN;
  if (!Number.isFinite(usableUntilMs)) return "Usable";

  const remainingMs = usableUntilMs - Date.now();
  if (remainingMs <= 0) return "Past Shelf Life";

  const totalMs = getShelfLifeDurationMs(shelfLifeDays, shelfLifeHours);
  const nearThresholdMs =
    totalMs > 0 ? Math.max(totalMs * 0.2, 60 * 60 * 1000) : 24 * 60 * 60 * 1000;
  return remainingMs <= nearThresholdMs ? "Near End of Shelf Life" : "Usable";
}

export function getProductUiStatus(
  product: Pick<
    Product,
    "mainStock" | "usableUntil" | "shelfLifeDays" | "shelfLifeHours"
  >,
): "Out of Stock" | "Past Shelf Life" | "Usable" {
  if (toNumber(product.mainStock) <= 0) return "Out of Stock";

  const shelfLifeStatus = getShelfLifeStatus({
    usableUntil: product.usableUntil,
    shelfLifeDays: product.shelfLifeDays,
    shelfLifeHours: product.shelfLifeHours,
  });

  return shelfLifeStatus === "Past Shelf Life" ? "Past Shelf Life" : "Usable";
}

export function getShelfLifeStatusSummary(product: Product) {
  return getShelfLifeStatus({
    usableUntil: product.usableUntil,
    shelfLifeDays: product.shelfLifeDays,
    shelfLifeHours: product.shelfLifeHours,
  });
}

export function getNearestTimingInfo(
  product: Product,
  activeBatches: Batch[],
): NearestTimingInfo {
  const productBatches = activeBatches
    .filter(
      (batch) =>
        batch.product_id === product.product_id &&
        toNumber(batch.remaining_qty) > 0,
    )
    .sort(
      (a, b) =>
        new Date(a.received_date).getTime() -
        new Date(b.received_date).getTime(),
    );

  if (product.isRawMaterial) {
    const usableUntil = product.usableUntil ?? null;
    const usableUntilMs = usableUntil ? new Date(usableUntil).getTime() : NaN;
    if (!Number.isFinite(usableUntilMs)) {
      return {
        batchId: productBatches[0]?.batch_id ?? null,
        date: null,
        status: "none",
        label: "No batch date",
      };
    }

    const shelfLifeStatus = getShelfLifeStatus({
      usableUntil,
      shelfLifeDays: product.shelfLifeDays,
      shelfLifeHours: product.shelfLifeHours,
    });

    return {
      batchId: productBatches[0]?.batch_id ?? null,
      date: usableUntil,
      status:
        shelfLifeStatus === "Past Shelf Life"
          ? "expired"
          : shelfLifeStatus === "Near End of Shelf Life"
            ? "near"
            : "safe",
      label:
        shelfLifeStatus === "Past Shelf Life"
          ? "Expired / Past Shelf Life"
          : shelfLifeStatus === "Near End of Shelf Life"
            ? "Near Expiry"
            : "Safe",
    };
  }

  const datedBatches = productBatches
    .filter((batch) => !!batch.expiry_date)
    .sort((a, b) => {
      const aMs = new Date(a.expiry_date as string).getTime();
      const bMs = new Date(b.expiry_date as string).getTime();
      return aMs - bMs;
    });

  const earliestBatch = datedBatches[0];
  if (!earliestBatch?.expiry_date) {
    return {
      batchId: null,
      date: null,
      status: "none",
      label: "No batch date",
    };
  }

  const date = earliestBatch.expiry_date;
  return {
    batchId: earliestBatch.batch_id,
    date,
    status: isExpired(date)
      ? "expired"
      : isExpiringSoon(date)
        ? "near"
        : "safe",
    label: isExpired(date)
      ? "Expired / Past Shelf Life"
      : isExpiringSoon(date)
        ? "Near Expiry"
        : "Safe",
  };
}

export function isStrictRawMaterialCategory(
  value: string | null | undefined,
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >,
): boolean {
  return (
    getInventoryCategoryDateTrackingType(
      value,
      inventoryCategoryDateTrackingLookup,
    ) === "shelf_life"
  );
}

export function isMainStockDashboardCategory(
  value: string | null | undefined,
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >,
): boolean {
  const normalized = normalizeInventoryCategoryName(value);
  if (inventoryCategoryDateTrackingLookup.has(normalized)) return true;
  return (
    normalized.includes("sauces") ||
    normalized === "raw material" ||
    normalized === "raw materials" ||
    normalized === "ingredients" ||
    normalized === "ingridients" ||
    normalized === "aromatics"
  );
}

export function isCountedInTotalProducts(value?: string | null): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized !== "good";
}

export function getPOItemDateTrackingType(
  item: POItem,
  inventoryCategoryNameLookup: Map<string, string>,
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >,
): "none" | "expiry" | "shelf_life" {
  const itemCategory = String(item.category ?? "");
  const { matchedCategory, dateTrackingType } = resolveInventoryCategoryMatch(
    itemCategory,
    inventoryCategoryNameLookup,
    inventoryCategoryDateTrackingLookup,
  );
  console.log("PO DATE TRACKING DEBUG", {
    itemName: item.name,
    itemCategory,
    matchedCategory,
    dateTrackingType,
  });
  return dateTrackingType;
}

export function getPOItemUsableUntil(
  order: Pick<PurchaseOrder, "receivedDate">,
  item: Pick<POItem, "shelfLifeDays" | "shelfLifeHours">,
): string | null {
  const baseMs = order.receivedDate
    ? new Date(order.receivedDate).getTime()
    : NaN;
  if (!Number.isFinite(baseMs)) return null;

  const durationMs = getShelfLifeDurationMs(
    item.shelfLifeDays,
    item.shelfLifeHours,
  );
  if (durationMs <= 0) return null;

  return new Date(baseMs + durationMs).toISOString();
}

export const shelfLifeHelpers = {
  daysUntilExpiry,
  fmtDateTime,
  formatShelfLife,
  getShelfLifeStatus,
};
