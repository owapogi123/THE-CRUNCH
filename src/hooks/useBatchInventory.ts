import { useState, useCallback } from "react";
import {
  consumeFromBatchesFIFO,
  getTotalActiveBatchQuantity,
  getOldestActiveBatch,
} from "@/lib/batchUtils";
import type { Batch } from "@/lib/batchUtils";

type AffectedBatch = {
  batchId: string;
  quantityConsumed: number;
};

export interface InventoryItemWithBatches {
  id: number;
  name: string;
  category: string;
  image: string;
  incoming: number;
  stock: number;
  price: string;
  unit: string;
  batches: Batch[];
  totalUsedToday: number;
}

interface UseBatchInventoryReturn {
  items: InventoryItemWithBatches[];
  addBatch: (
    itemId: number,
    quantity: number,
    unit: string,
    expiryDate?: Date,
  ) => void;
  removeBatch: (itemId: number, batchId: string) => void;
  consumeProduct: (
    itemId: number,
    quantity: number,
  ) => { success: boolean; message: string; affected: AffectedBatch[] };
  returnBatchQuantity: (
    itemId: number,
    batchId: string,
    quantity: number,
  ) => void;
  getTotalBatchQuantity: (itemId: number) => number;
  getOldestBatch: (itemId: number) => Batch | null;
  updateBatchStatus: (
    itemId: number,
    batchId: string,
    status: "active" | "partial" | "returned",
  ) => void;
  clearExpiredBatches: (itemId: number) => number;
  setItems: (items: InventoryItemWithBatches[]) => void;
}

/**
 * Custom hook for managing batch inventory with FIFO operations
 * @param initialItems - Initial inventory items
 * @returns Object containing inventory state and batch operations
 */
export function useBatchInventory(
  initialItems: InventoryItemWithBatches[],
): UseBatchInventoryReturn {
  const [items, setItems] = useState<InventoryItemWithBatches[]>(initialItems);

  /**
   * Add a new batch to an item
   */
  const addBatch = useCallback(
    (itemId: number, quantity: number, unit: string, expiryDate?: Date) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                batches: [
                  ...(item.batches || []),
                  {
                    id: `batch-${Date.now()}-${Math.random()}`,
                    productId: itemId,
                    quantity,
                    unit,
                    receivedAt: new Date(),
                    expiresAt: expiryDate,
                    status: "active" as const,
                  },
                ],
              }
            : item,
        ),
      );
    },
    [],
  );

  /**
   * Remove a batch completely
   */
  const removeBatch = useCallback((itemId: number, batchId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              batches: item.batches?.filter((b) => b.id !== batchId) || [],
            }
          : item,
      ),
    );
  }, []);

  /**
   * Consume product quantity using FIFO method
   */
  const consumeProduct = useCallback((itemId: number, quantity: number) => {
    let affectedBatches: AffectedBatch[] = [];

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const result = consumeFromBatchesFIFO(item.batches || [], quantity);
        affectedBatches = result.batchesAffected;

        if (result.remainingQuantity > 0) {
          return {
            ...item,
            totalUsedToday: item.totalUsedToday + result.consumed,
          };
        }

        const updatedBatches =
          item.batches?.map((batch) => {
            const affected = result.batchesAffected.find(
              (a) => a.batchId === batch.id,
            );
            if (affected) {
              const newQuantity = batch.quantity - affected.quantityConsumed;
              return {
                ...batch,
                quantity: newQuantity,
                status: newQuantity <= 0 ? ("partial" as const) : batch.status,
              };
            }
            return batch;
          }) || [];

        return {
          ...item,
          batches: updatedBatches,
          totalUsedToday: item.totalUsedToday + result.consumed,
        };
      }),
    );

    const success = affectedBatches.length > 0;
    return {
      success,
      message: success
        ? "Product consumed successfully"
        : "Insufficient batch quantity",
      affected: affectedBatches,
    };
  }, []);

  /**
   * Return unused batch quantity
   */
  const returnBatchQuantity = useCallback(
    (itemId: number, batchId: string, quantity: number) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                batches:
                  item.batches?.map((batch) =>
                    batch.id === batchId
                      ? {
                          ...batch,
                          quantity: Math.max(0, batch.quantity - quantity),
                          status:
                            batch.quantity - quantity <= 0
                              ? ("returned" as const)
                              : ("partial" as const),
                        }
                      : batch,
                  ) || [],
              }
            : item,
        ),
      );
    },
    [],
  );

  /**
   * Get total quantity of active batches for an item
   */
  const getTotalBatchQuantity = useCallback(
    (itemId: number): number => {
      const item = items.find((i) => i.id === itemId);
      return item ? getTotalActiveBatchQuantity(item.batches || []) : 0;
    },
    [items],
  );

  /**
   * Get oldest active batch for an item
   */
  const getOldestBatch = useCallback(
    (itemId: number): Batch | null => {
      const item = items.find((i) => i.id === itemId);
      return item ? getOldestActiveBatch(item.batches || []) : null;
    },
    [items],
  );

  /**
   * Update batch status
   */
  const updateBatchStatus = useCallback(
    (
      itemId: number,
      batchId: string,
      status: "active" | "partial" | "returned",
    ) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                batches:
                  item.batches?.map((batch) =>
                    batch.id === batchId ? { ...batch, status } : batch,
                  ) || [],
              }
            : item,
        ),
      );
    },
    [],
  );

  /**
   * Remove expired batches from an item
   */
  const clearExpiredBatches = useCallback((itemId: number): number => {
    let clearedCount = 0;

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              batches:
                item.batches?.filter((batch) => {
                  const isExpired =
                    batch.expiresAt && new Date() > batch.expiresAt;
                  if (isExpired) clearedCount++;
                  return !isExpired;
                }) || [],
            }
          : item,
      ),
    );

    return clearedCount;
  }, []);

  return {
    items,
    addBatch,
    removeBatch,
    consumeProduct,
    returnBatchQuantity,
    getTotalBatchQuantity,
    getOldestBatch,
    updateBatchStatus,
    clearExpiredBatches,
    setItems,
  };
}
