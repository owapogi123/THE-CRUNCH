import { useState } from "react";
import { ExpiryChip } from "../ExpiryChip";
import type { KitchenBatch } from "../../types/inventory";
import { isExpired, isExpiringSoon } from "../../utils/dateUtils";
import { fmtDate } from "../../utils/formatters";

export function KitchenBatchesSection({
  kitchenBatches,
  nonReturnableProductIds,
  onReturn,
}: {
  kitchenBatches: KitchenBatch[];
  nonReturnableProductIds: Set<number>;
  onReturn: (batch: KitchenBatch) => void;
}) {
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(
    new Set(),
  );

  const toggleBatch = (batchId: number) => {
    const newSelected = new Set(selectedBatches);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
    } else {
      newSelected.add(batchId);
    }
    setSelectedBatches(newSelected);
  };

  const handleBulkReturn = () => {
    selectedBatches.forEach((batchId) => {
      const batch = kitchenBatches.find((b) => b.kitchen_batch_id === batchId);
      if (batch && !nonReturnableProductIds.has(batch.product_id)) {
        onReturn(batch);
      }
    });
    setSelectedBatches(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-700">Kitchen Batches</h3>
          <p className="text-xs text-slate-500">
            Items currently in kitchen use {"\u2014"} reconcile or return unused
            portions
          </p>
        </div>
        {selectedBatches.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkReturn}
              className="px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition-colors"
            >
              Return {selectedBatches.size}
            </button>
          </div>
        )}
      </div>

      {kitchenBatches.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          No kitchen batches found.
        </div>
      ) : (
        <div className="space-y-2">
          {kitchenBatches.map((batch) => {
            const expired = isExpired(batch.expiry_date);
            const expiring = isExpiringSoon(batch.expiry_date);
            const isSelected = selectedBatches.has(batch.kitchen_batch_id);
            const cannotReturn = nonReturnableProductIds.has(batch.product_id);

            return (
              <div
                key={batch.kitchen_batch_id}
                className={`rounded-lg border p-3 transition-all ${
                  isSelected
                    ? "border-indigo-300 bg-indigo-50/50"
                    : expired
                      ? "border-red-200 bg-red-50/40"
                      : expiring
                        ? "border-orange-200 bg-orange-50/30"
                        : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleBatch(batch.kitchen_batch_id)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {batch.product_name}
                      </p>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        Kitchen Batch #{batch.kitchen_batch_id}
                      </span>
                      {cannotReturn && (
                        <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full">
                          No return
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      From Storage Batch #{batch.storage_batch_id} {"\u00B7"}{" "}
                      Withdrawn {fmtDate(batch.withdrawn_at)}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-700">
                      {batch.withdrawn_qty}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        {batch.unit}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {batch.used_qty > 0 && `${batch.used_qty} used \u00B7 `}
                      {batch.returned_qty > 0 &&
                        `${batch.returned_qty} returned`}
                      {batch.used_qty === 0 &&
                        batch.returned_qty === 0 &&
                        "Not yet used"}
                    </p>
                  </div>

                  <div className="w-24 text-right flex-shrink-0">
                    <ExpiryChip dateStr={batch.expiry_date} />
                  </div>

                  <div className="flex gap-1">
                    <button
                      onClick={() => onReturn(batch)}
                      disabled={cannotReturn}
                      title={
                        cannotReturn
                          ? "Sauces and similar items cannot be returned."
                          : "Return unused stock"
                      }
                      className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded hover:bg-orange-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Return
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
