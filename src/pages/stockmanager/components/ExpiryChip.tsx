import { daysUntilExpiry } from "../utils/dateUtils";
import { fmtDate } from "../utils/formatters";

export function ExpiryChip({
  dateStr,
}: {
  dateStr: string | null | undefined;
}) {
  const days = daysUntilExpiry(dateStr);
  if (!dateStr || days === null) {
    return <span className="text-xs text-slate-300">{"\u2014"}</span>;
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Expired
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block animate-pulse" />
        Expires today
      </span>
    );
  }
  if (days <= 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse" />
        {days}d left
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-600 border border-yellow-200">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
        {days}d left
      </span>
    );
  }
  return <span className="text-xs text-slate-500 font-medium">{fmtDate(dateStr)}</span>;
}
