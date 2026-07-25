import { motion, type Variants } from "framer-motion";

const KPI_ACCENT: Record<
  string,
  { border: string; value: string; bg: string; borderColor: string }
> = {
  slate: {
    border: "border-t-slate-700",
    value: "text-slate-700",
    bg: "bg-slate-50",
    borderColor: "border-slate-200",
  },
  indigo: {
    border: "border-t-indigo-500",
    value: "text-indigo-600",
    bg: "bg-indigo-50",
    borderColor: "border-indigo-200",
  },
  yellow: {
    border: "border-t-yellow-500",
    value: "text-yellow-700",
    bg: "bg-yellow-50",
    borderColor: "border-yellow-200",
  },
  rose: {
    border: "border-t-rose-500",
    value: "text-rose-500",
    bg: "bg-rose-50",
    borderColor: "border-rose-200",
  },
  emerald: {
    border: "border-t-emerald-500",
    value: "text-emerald-600",
    bg: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  green: {
    border: "border-t-green-500",
    value: "text-green-600",
    bg: "bg-green-50",
    borderColor: "border-green-200",
  },
  orange: {
    border: "border-t-orange-500",
    value: "text-orange-600",
    bg: "bg-orange-50",
    borderColor: "border-orange-200",
  },
  red: {
    border: "border-t-red-500",
    value: "text-red-600",
    bg: "bg-red-50",
    borderColor: "border-red-200",
  },
  blue: {
    border: "border-t-blue-500",
    value: "text-blue-600",
    bg: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  sky: {
    border: "border-t-sky-500",
    value: "text-sky-600",
    bg: "bg-sky-50",
    borderColor: "border-sky-200",
  },
  amber: {
    border: "border-t-amber-500",
    value: "text-amber-600",
    bg: "bg-amber-50",
    borderColor: "border-amber-200",
  },
};

export function KPICard({
  label,
  value,
  sub,
  accent,
  onClick,
  itemVariants,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  onClick?: () => void;
  itemVariants: Variants;
}) {
  const interactive = typeof onClick === "function";
  const theme = KPI_ACCENT[accent] ?? KPI_ACCENT.slate;

  return (
    <motion.div
      variants={itemVariants}
      className={`rounded-2xl p-5 shadow-sm border-2 border-t-4 ${theme.bg} ${theme.borderColor} ${theme.border} ${interactive ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" : ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 leading-none ${theme.value}`}>
        {value}
      </p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
      {interactive && (
        <p className="text-[11px] text-slate-500 mt-3 font-medium">
          Click to view summary
        </p>
      )}
    </motion.div>
  );
}
