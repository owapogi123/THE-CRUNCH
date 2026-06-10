import { ExpiryChip } from "../ExpiryChip";
import type { Batch } from "../../types/inventory";
import { isExpired, isExpiringSoon } from "../../utils/dateUtils";

export function BatchRow({
  batch,
  productMap,
}: {
  batch: Batch;
  productMap: Map<number, { name: string; unit: string }>;
}) {
  const expired = isExpired(batch.expiry_date);
  const expiring = isExpiringSoon(batch.expiry_date);
  const meta = productMap.get(batch.product_id);
  const displayName =
    batch.product_name || meta?.name || `Product ${batch.product_id}`;
  const displayUnit = batch.unit || meta?.unit || "unit";

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${expired ? "bg-red-50/40" : ""}`}
    >
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${expired ? "bg-red-400" : expiring ? "bg-orange-400" : "bg-emerald-400"}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700 truncate">
          {displayName}
        </p>
        <p className="text-[11px] text-slate-400">Batch #{batch.batch_id}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-700">
          {batch.remaining_qty}
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
}
