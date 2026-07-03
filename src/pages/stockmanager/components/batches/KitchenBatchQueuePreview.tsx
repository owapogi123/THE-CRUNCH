import { useMemo } from "react";
import type { KitchenBatch } from "../../types/inventory";
import { isExpired, isExpiringSoon } from "../../utils/dateUtils";
import { fmtDate, fmtReceivedDate, toNumber } from "../../utils/formatters";

export function KitchenBatchQueuePreview({
  batches,
  unit,
}: {
  batches: KitchenBatch[];
  unit: string;
}) {
  const sortedBatches = useMemo(
    () =>
      [...batches].sort(
        (a, b) =>
          new Date(a.withdrawn_at).getTime() -
          new Date(b.withdrawn_at).getTime(),
      ),
    [batches],
  );

  const totalInKitchen = sortedBatches.reduce(
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

  if (sortedBatches.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Kitchen Batch Queue
          </span>
          <span className="text-[10px] text-slate-400">
            active kitchen stock for this item
          </span>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">
          {totalInKitchen} {unit || "unit"} in kitchen
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {sortedBatches.map((batch, idx) => {
          const expiring = isExpiringSoon(batch.expiry_date);
          const expired = isExpired(batch.expiry_date);
          const availableInKitchen = Math.max(
            0,
            toNumber(batch.withdrawn_qty) -
              toNumber(batch.used_qty) -
              toNumber(batch.returned_qty),
          );

          return (
            <div
              key={batch.kitchen_batch_id}
              className={`px-3.5 py-3 flex items-center gap-3 transition-colors ${idx === 0 ? "bg-indigo-50/50" : "bg-white"} ${expired ? "opacity-50" : ""}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Kitchen Batch #{batch.kitchen_batch_id}
                  </span>
                  {idx === 0 && (
                    <span className="text-[9px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                      CURRENT
                    </span>
                  )}
                  {batch.status === "reconciled" && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                      RECONCILED
                    </span>
                  )}
                  {expiring && !expired && (
                    <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                      EXPIRING
                    </span>
                  )}
                  {expired && (
                    <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                      EXPIRED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 flex-wrap">
                  <span>From storage batch #{batch.storage_batch_id}</span>
                  <span>Withdrawn {fmtReceivedDate(batch.withdrawn_at)}</span>
                  {batch.expiry_date && (
                    <span
                      className={
                        expiring && !expired
                          ? "text-orange-500 font-medium"
                          : expired
                            ? "text-red-500 font-medium"
                            : ""
                      }
                    >
                      Expires {fmtDate(batch.expiry_date)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-700">
                  {availableInKitchen}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {batch.unit}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  {batch.withdrawn_qty} withdrawn {"\u00B7"} {batch.used_qty}{" "}
                  used {"\u00B7"} {batch.returned_qty} returned
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
