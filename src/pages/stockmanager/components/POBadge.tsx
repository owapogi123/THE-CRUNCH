import type { POStatus } from "../types/inventory";

const PO_STATUS_STYLES: Record<
  POStatus,
  { bg: string; text: string; dot: string }
> = {
  Draft: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  Ordered: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  Received: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  Cancelled: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" },
};

export function POBadge({ status }: { status: POStatus }) {
  const s = PO_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
