import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/authcontext";

const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  cashier: "Cashier",
  cook: "Cook",
  inventory_manager: "Stock Manager",
  customer: "Customer",
};

export function UserIdentityBanner({
  className = "",
  statusText,
  statusTone = "success",
  showRoleBadge = true,
}: {
  className?: string;
  statusText?: string;
  statusTone?: "neutral" | "success" | "warning" | "danger";
  showRoleBadge?: boolean;
}) {
  const { user } = useAuth();

  const displayName = useMemo(() => {
    const username = String(user?.username ?? "").trim();
    return username || "Unknown User";
  }, [user?.username]);

  const roleLabel = useMemo(() => {
    const role = String(user?.role ?? "").trim().toLowerCase();
    return ROLE_LABELS[role] ?? "User";
  }, [user?.role]);

  const statusToneClass = useMemo(() => {
    switch (statusTone) {
      case "neutral":
        return {
          wrapper: "border-slate-200 bg-slate-100 text-slate-600",
          dot: "bg-slate-400",
        };
      case "warning":
        return {
          wrapper: "border-amber-200 bg-amber-50 text-amber-700",
          dot: "bg-amber-400",
        };
      case "danger":
        return {
          wrapper: "border-red-200 bg-red-50 text-red-600",
          dot: "bg-red-400",
        };
      default:
        return {
          wrapper: "border-emerald-100 bg-emerald-50 text-emerald-700",
          dot: "bg-emerald-400",
        };
    }
  }, [statusTone]);

  return (
    <div
      className={`flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 shadow-sm ${className}`.trim()}
    >
      <span className="font-medium text-slate-500">Logged in:</span>
      <span className="font-semibold text-slate-800">{displayName}</span>
      <span className="text-slate-400">({roleLabel})</span>
      {showRoleBadge && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          <span>{roleLabel}</span>
        </div>
      )}
      {statusText ? (
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusToneClass.wrapper}`}
        >
          <span className={`h-2 w-2 rounded-full ${statusToneClass.dot}`} />
          <span>{statusText}</span>
        </div>
      ) : null}
    </div>
  );
}
