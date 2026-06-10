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

  return (
    <motion.div
      variants={itemVariants}
      className={`rounded-2xl p-5 shadow-sm border-2 border-t-4 ${KPI_ACCENT[accent].bg} ${KPI_ACCENT[accent].borderColor} ${KPI_ACCENT[accent].border} ${interactive ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md" : ""}`}
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
      <p
        className={`text-3xl font-bold mt-1 leading-none ${KPI_ACCENT[accent].value}`}
      >
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
