import { useCallback, useMemo, useState } from "react";
import { BatchRow } from "./BatchRow";
import { ExpiryChip } from "../ExpiryChip";
import type { Batch } from "../../types/inventory";
import { isExpired, isExpiringSoon } from "../../utils/dateUtils";
import { fmtInt, fmtReceivedDate, toNumber } from "../../utils/formatters";

export function FIFOBatchGrouped({
  allBatches,
  productMap,
}: {
  allBatches: Batch[];
  productMap: Map<number, { name: string; unit: string }>;
}) {
  const [viewMode, setViewMode] = useState<"delivery" | "expiry">("delivery");

  const isDisplayableBatch = useCallback((batch: Batch) => {
    const status = String(batch.status ?? "")
      .trim()
      .toLowerCase();
    const remainingQty = toNumber(batch.remaining_qty);

    return ["active", "returned", "1"].includes(status) && remainingQty > 0;
  }, []);

  const visibleBatches = useMemo(
    () => allBatches.filter(isDisplayableBatch),
    [allBatches, isDisplayableBatch],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Batch[]>();

    for (const batch of visibleBatches) {
      const receivedDate = String(batch.received_date ?? "").split("T")[0];
      const key = receivedDate || "No received date";
      map.set(key, [...(map.get(key) ?? []), batch]);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, batches], idx) => ({ date, batches, idx }));
  }, [visibleBatches]);

  const byExpiry = useMemo(
    () =>
      [...visibleBatches].sort((a, b) => {
        if (!a.expiry_date && !b.expiry_date) return 0;
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return (
          new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
        );
      }),
    [visibleBatches],
  );

  const hasVisibleBatches = visibleBatches.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        {(["delivery", "expiry"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${viewMode === mode ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {mode === "delivery" ? (
              "Delivered Date"
            ) : (
              <>
                By Nearest Expiry
                {byExpiry.some((b) => isExpiringSoon(b.expiry_date)) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
                )}
              </>
            )}
          </button>
        ))}
      </div>
      {!hasVisibleBatches && (
        <div className="text-center py-8 text-sm text-slate-400">
          No active batches found.
        </div>
      )}
      {viewMode === "delivery" &&
        grouped.map(({ date, batches, idx }) => {
          const isNext = idx === 0;
          const hasExpiringSoon = batches.some((b) => isExpiringSoon(b.expiry_date));
          const hasExpired = batches.some((b) => isExpired(b.expiry_date));
          return (
            <div
              key={date}
              className={`rounded-xl border overflow-hidden ${isNext ? "border-indigo-200 shadow-sm" : hasExpired ? "border-red-200 opacity-70" : hasExpiringSoon ? "border-orange-200" : "border-slate-100"}`}
            >
              <div
                className={`px-4 py-2.5 flex items-center justify-between ${isNext ? "bg-indigo-50" : hasExpiringSoon ? "bg-orange-50/60" : "bg-slate-50"}`}
              >
                <div className="flex items-center gap-2">
                  {isNext && (
                    <span className="text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                      PULL FIRST
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-600">
                    Delivery {"\u2014"} {fmtReceivedDate(date)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({batches.length} item type{batches.length !== 1 ? "s" : ""})
                  </span>
                </div>
                {hasExpiringSoon && !hasExpired && (
                  <span className="text-[10px] font-bold text-orange-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
                    Items expiring soon
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-50 bg-white">
                {[...batches]
                  .sort((a, b) => {
                    if (isExpired(a.expiry_date) && !isExpired(b.expiry_date)) return 1;
                    if (!isExpired(a.expiry_date) && isExpired(b.expiry_date)) return -1;
                    if (a.expiry_date && b.expiry_date) {
                      return (
                        new Date(a.expiry_date).getTime() -
                        new Date(b.expiry_date).getTime()
                      );
                    }
                    return 0;
                  })
                  .map((batch) => (
                    <BatchRow
                      key={batch.batch_id}
                      batch={batch}
                      productMap={productMap}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      {viewMode === "expiry" && hasVisibleBatches && (
        <div className="rounded-xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Soonest expiry first {"\u2014"} use these before they expire
            </span>
            <span className="text-[10px] text-slate-400">
              {byExpiry.length} batches
            </span>
          </div>
          <div className="divide-y divide-slate-50 bg-white">
            {byExpiry.map((batch, idx) => {
              const expired = isExpired(batch.expiry_date);
              const expiring = isExpiringSoon(batch.expiry_date);
              const meta = productMap.get(batch.product_id);
              const displayName =
                batch.product_name || meta?.name || `Product ${batch.product_id}`;
              const displayUnit = batch.unit || meta?.unit || "unit";
              return (
                <div
                  key={batch.batch_id}
                  className={`flex items-center gap-3 px-4 py-3 ${expired ? "bg-red-50/40 opacity-60" : expiring ? "bg-orange-50/30" : ""}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${idx === 0 && !expired ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-400"}`}
                  >
                    {idx + 1}
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${expired ? "bg-red-400" : expiring ? "bg-orange-400" : "bg-emerald-400"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">
                      {displayName}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Batch #{batch.batch_id} {"\u00B7"} Received{" "}
                      {fmtReceivedDate(batch.received_date)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-700">
                      {fmtInt(batch.remaining_qty)}
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        {displayUnit}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400">remaining</p>
                  </div>
                  <div className="w-28 text-right flex-shrink-0">
                    <ExpiryChip dateStr={batch.expiry_date} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
