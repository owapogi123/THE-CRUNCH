import type { NearestTimingInfo } from "../types/inventory";
import { fmtDateTime } from "../utils/formatters";

export function NearestTimingCell({ info }: { info: NearestTimingInfo }) {
  const toneClass =
    info.status === "expired"
      ? "text-red-600"
      : info.status === "near"
        ? "text-amber-600"
        : info.status === "safe"
          ? "text-slate-700"
          : "text-slate-400";
  const badgeClass =
    info.status === "expired"
      ? "bg-red-100 text-red-700 border border-red-200"
      : info.status === "near"
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : info.status === "safe"
          ? "bg-slate-100 text-slate-600 border border-slate-200"
          : "bg-slate-50 text-slate-400 border border-slate-200";

  if (!info.date) {
    return <span className="text-xs text-slate-400">No batch date</span>;
  }

  return (
    <div className="text-right space-y-1">
      {info.batchId !== null && (
        <p className="text-xs font-semibold text-slate-600">
          Batch #{info.batchId}
        </p>
      )}
      <p className={`text-[11px] font-medium ${toneClass}`}>
        {fmtDateTime(info.date)}
      </p>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
      >
        {info.label}
      </span>
    </div>
  );
}
