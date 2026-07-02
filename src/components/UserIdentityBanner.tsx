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
  title,
  subtitle,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  className?: string;
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

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Logged-In User
          </p>
          <p className="mt-1 truncate text-lg font-semibold text-slate-900">
            {displayName}
          </p>
          <p className="text-sm text-slate-500">{roleLabel}</p>
          {(title || subtitle) && (
            <div className="mt-3">
              {title && (
                <p className="text-sm font-semibold text-slate-800">{title}</p>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500">{subtitle}</p>
              )}
            </div>
          )}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          <span>{roleLabel}</span>
        </div>
      </div>
    </div>
  );
}
