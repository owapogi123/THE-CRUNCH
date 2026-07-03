import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { kitchenApi, storageApi } from "../services/api";
import type {
  KitchenBatch,
  Product,
  StockAlertSettings,
  StockStatusRecord,
  WithdrawalFormRow,
  WithdrawalType,
} from "../types/inventory";
import { getStockStatus } from "../utils/stockUtils";

type ToastFn = (message: string, type: "success" | "error") => void;

type UseWithdrawalsParams = {
  products: Product[];
  withdrawals: StockStatusRecord[];
  kitchenBatches: KitchenBatch[];
  mainStockProducts: Product[];
  stockAlertSettings: StockAlertSettings;
  fetchAll: () => Promise<void>;
  showToast: ToastFn;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
};

function createWithdrawalRow(): WithdrawalFormRow {
  return {
    id: crypto.randomUUID(),
    productId: null,
    qty: "",
  };
}

export function useWithdrawals({
  products,
  withdrawals,
  kitchenBatches,
  mainStockProducts,
  stockAlertSettings,
  fetchAll,
  showToast,
  setSubmitting,
}: UseWithdrawalsParams) {
  const initialRow = createWithdrawalRow();
  const [withdrawalRows, setWithdrawalRows] = useState<WithdrawalFormRow[]>([
    initialRow,
  ]);
  const [activeWithdrawalRowId, setActiveWithdrawalRowId] = useState<string>(
    initialRow.id,
  );
  const [wdType, setWdType] = useState<WithdrawalType>("initial");

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

  const mainStockProductIds = useMemo(
    () => new Set(mainStockProducts.map((p) => p.product_id)),
    [mainStockProducts],
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

  const doWithdraw = useCallback(
    async (
      product_id: number,
      qty: number,
      type: WithdrawalType,
      options?: {
        manageSubmitting?: boolean;
        refreshAfter?: boolean;
        silentError?: boolean;
      },
    ) => {
      const manageSubmitting = options?.manageSubmitting ?? true;
      const refreshAfter = options?.refreshAfter ?? true;
      const silentError = options?.silentError ?? false;
      if (manageSubmitting) setSubmitting(true);
      try {
        if (type === "initial") {
          const todayBatches = await kitchenApi.getTodayKitchenBatches();
          const existing = todayBatches
            .filter((b) => b.product_id === product_id && b.status === "active")
            .sort((a, b) => b.kitchen_batch_id - a.kitchen_batch_id)[0];
          if (existing)
            throw new Error("Initial withdrawal already done today.");
          const storageResult = await storageApi.withdrawFromStorage({
            product_id,
            qty_needed: qty,
            type: "initial",
          });
          const sourceBatchId = storageResult.batches_used[0]?.batch_id;
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
    },
    [fetchAll, showToast, setSubmitting],
  );

  const submitWithdrawal = useCallback(async () => {
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
  }, [
    withdrawalRows,
    wdType,
    products,
    doWithdraw,
    fetchAll,
    showToast,
    setSubmitting,
  ]);

  return {
    withdrawalRows,
    activeWithdrawalRowId,
    wdType,
    todayInitialExists,
    kitchenRemaining,
    visibleWithdrawalLogs,
    selectedWithdrawalProduct,
    selectedWithdrawalStatus,
    selectedWithdrawalPct,
    setWdType,
    setActiveWithdrawalRowId,
    updateWithdrawalRow,
    addWithdrawalRow,
    removeWithdrawalRow,
    submitWithdrawal,
  };
}
