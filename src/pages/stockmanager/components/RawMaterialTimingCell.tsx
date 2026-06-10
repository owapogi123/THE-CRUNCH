import type { Product } from "../types/inventory";
import { formatShelfLife, fmtDateTime } from "../utils/formatters";
import {
  getProductUiStatus,
  getShelfLifeStatusSummary,
} from "../utils/stockUtils";

export function RawMaterialTimingCell({ product }: { product: Product }) {
  const uiStatus = getProductUiStatus(product);
  const status = getShelfLifeStatusSummary(product);
  const statusClass =
    uiStatus === "Out of Stock"
      ? "bg-slate-100 text-slate-700 border border-slate-200"
      : status === "Past Shelf Life"
        ? "bg-red-100 text-red-600 border border-red-200"
        : status === "Near End of Shelf Life"
          ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200";

  return (
    <div className="text-right space-y-1">
      <p className="text-xs font-semibold text-slate-700">
        Shelf Life:{" "}
        <span className="font-normal text-slate-500">
          {formatShelfLife(product.shelfLifeDays, product.shelfLifeHours)}
        </span>
      </p>
      <p className="text-[11px] text-slate-500">
        Usable Until: {fmtDateTime(product.usableUntil)}
      </p>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}
      >
        {uiStatus === "Out of Stock" ? uiStatus : status}
      </span>
    </div>
  );
}
