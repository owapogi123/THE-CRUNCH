import { AnimatePresence, motion } from "framer-motion";

export function DashboardSummaryModal({
  open,
  title,
  subtitle,
  totalLabel,
  totalValue,
  rows,
  emptyMessage,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: string;
  rows: Array<{
    id: string;
    name: string;
    value: string;
    meta: string;
  }>;
  emptyMessage: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-slate-800">{title}</p>
              <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 transition-colors text-lg"
            >
              {"\u00D7"}
            </button>
          </div>

          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-500">
              {totalLabel}
            </p>
            <p className="text-3xl font-bold text-slate-800 mt-1">
              {totalValue}
            </p>
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-6">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
                {emptyMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-slate-100 bg-white px-4 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{row.meta}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-800">
                        {row.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
