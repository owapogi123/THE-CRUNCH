import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api, kitchenApi } from "../services/api";
import type { Batch, KitchenBatch, Product } from "../types/inventory";
import { fmtInt, toNumber } from "../utils/formatters";

type ToastFn = (message: string, type: "success" | "error") => void;

type UseKitchenBatchesParams = {
  products: Product[];
  showToast: ToastFn;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  refreshInventory: () => Promise<void>;
  isReconcilable: (product: Product) => boolean;
};

export function useKitchenBatches({
  products,
  showToast,
  setSubmitting,
  refreshInventory,
  isReconcilable,
}: UseKitchenBatchesParams) {
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  const [yesterdayReturns, setYesterdayReturns] = useState<Batch[]>([]);
  const [kitchenBatches, setKitchenBatches] = useState<KitchenBatch[]>([]);
  const [kitchenBatchLoading, setKitchenBatchLoading] = useState(false);
  const [kitchenBatchError, setKitchenBatchError] = useState<string | null>(
    null,
  );
  const [kitchenBatchActionLoading, setKitchenBatchActionLoading] =
    useState(false);

  const fetchKitchenBatchData = useCallback(async () => {
    setKitchenBatchLoading(true);
    setKitchenBatchError(null);
    try {
      const [batchesRes, returnsRes, kitchenRes] = await Promise.allSettled([
        api.getActiveBatches(),
        api.getYesterdayReturns(),
        kitchenApi.getAll(),
      ]);

      const nextActiveBatches =
        batchesRes.status === "fulfilled" ? batchesRes.value : [];
      const nextYesterdayReturns =
        returnsRes.status === "fulfilled" ? returnsRes.value : [];
      const nextKitchenBatches =
        kitchenRes.status === "fulfilled" ? kitchenRes.value : [];

      setActiveBatches(nextActiveBatches);
      setYesterdayReturns(nextYesterdayReturns);
      setKitchenBatches(nextKitchenBatches);

      if (
        batchesRes.status !== "fulfilled" ||
        returnsRes.status !== "fulfilled" ||
        kitchenRes.status !== "fulfilled"
      ) {
        setKitchenBatchError("Failed to load kitchen batch data.");
      }

      return {
        activeBatches: nextActiveBatches,
        yesterdayReturns: nextYesterdayReturns,
        kitchenBatches: nextKitchenBatches,
      };
    } finally {
      setKitchenBatchLoading(false);
    }
  }, []);

  const visibleKitchenBatches = useMemo(
    () =>
      kitchenBatches.filter(
        (batch) =>
          Math.max(
            0,
            toNumber(batch.withdrawn_qty) -
              toNumber(batch.used_qty) -
              toNumber(batch.returned_qty),
          ) > 0,
      ),
    [kitchenBatches],
  );

  const nonReturnableProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => !isReconcilable(product))
          .map((product) => product.product_id),
      ),
    [products, isReconcilable],
  );

  const handleReturnKitchenBatch = useCallback(
    async (batch: KitchenBatch) => {
      if (nonReturnableProductIds.has(batch.product_id)) {
        showToast("Sauces and similar items cannot be returned.", "error");
        return;
      }

      setKitchenBatchActionLoading(true);
      try {
        await kitchenApi.returnUnused(batch.kitchen_batch_id);
        showToast("Unused portion returned to storage.", "success");
        await refreshInventory();
      } catch (err) {
        if (
          err instanceof Error &&
          /no unused quantity left to return|return quantity exceeds unused amount/i.test(
            err.message,
          )
        ) {
          await refreshInventory();
        }
        showToast(
          err instanceof Error ? err.message : "Failed to return batch.",
          "error",
        );
      } finally {
        setKitchenBatchActionLoading(false);
      }
    },
    [nonReturnableProductIds, refreshInventory, showToast],
  );

  const handlePastShelfLifeReturn = useCallback(
    async (product: Product) => {
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

      setKitchenBatchActionLoading(true);
      setSubmitting(true);
      try {
        for (const batch of batchesForProduct) {
          await kitchenApi.returnUnused(batch.kitchen_batch_id);
        }
        await refreshInventory();
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
        setKitchenBatchActionLoading(false);
        setSubmitting(false);
      }
    },
    [
      kitchenBatches,
      nonReturnableProductIds,
      refreshInventory,
      setSubmitting,
      showToast,
    ],
  );

  return {
    activeBatches,
    yesterdayReturns,
    kitchenBatches,
    kitchenBatchLoading,
    kitchenBatchError,
    kitchenBatchActionLoading,
    visibleKitchenBatches,
    nonReturnableProductIds,
    fetchKitchenBatchData,
    handleReturnKitchenBatch,
    handlePastShelfLifeReturn,
  };
}
