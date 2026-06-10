import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { Product } from "../../types/inventory";

function CartIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3h2l.4 2m0 0L7 13h10l2-8H5.4M7 13l-1.2 6.4A1 1 0 006.8 21h10.4a1 1 0 001-.8L20 13M7 13h13M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
      />
    </svg>
  );
}

export function StockAlertRestockBanner({
  criticalItems,
  lowItems,
  onOrderNow,
  getCategoryStyle,
}: {
  criticalItems: Product[];
  lowItems: Product[];
  onOrderNow: (p: Product) => void;
  getCategoryStyle: (cat: string) => string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const total = criticalItems.length + lowItems.length;
  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden border border-red-200 shadow-sm"
    >
      <div className="bg-gradient-to-r from-red-50 to-amber-50 px-5 py-3.5 flex items-center justify-between border-b border-red-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {total} item{total > 1 ? "s" : ""} need restocking
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {criticalItems.length > 0 && (
                <span className="text-red-600 font-medium">
                  {criticalItems.length} critical
                </span>
              )}
              {criticalItems.length > 0 && lowItems.length > 0 && (
                <span className="mx-1 text-slate-300">{"\u00B7"}</span>
              )}
              {lowItems.length > 0 && (
                <span className="text-amber-600 font-medium">
                  {lowItems.length} low stock
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/60"
        >
          {collapsed ? "Show items" : "Collapse"}
        </button>
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white"
          >
            {[
              {
                items: criticalItems,
                severity: "critical" as const,
                label: "\uD83D\uDD34 Critical \u2014 Order Immediately",
              },
              {
                items: lowItems,
                severity: "low" as const,
                label: "\uD83D\uDFE1 Low Stock \u2014 Reorder Soon",
              },
            ].map(({ items, severity, label }, gi) =>
              items.length > 0 ? (
                <div
                  key={severity}
                  className={
                    gi === 1 && criticalItems.length > 0
                      ? "border-t border-slate-100"
                      : ""
                  }
                >
                  <div className="px-5 pt-3 pb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${severity === "critical" ? "text-red-500" : "text-amber-500"}`}
                    >
                      {label}
                    </span>
                  </div>
                  <div className="px-4 pb-3 grid grid-cols-1 gap-2">
                    {items.map((p) => {
                      const pct = Math.min(
                        100,
                        (p.mainStock / Math.max(1, p.reorderPoint)) * 100,
                      );
                      const deficit = Math.max(
                        0,
                        Math.round(p.reorderPoint - p.mainStock),
                      );
                      return (
                        <div
                          key={p.product_id}
                          className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${severity === "critical" ? "bg-red-50/60 border-red-100 hover:bg-red-50" : "bg-amber-50/50 border-amber-100 hover:bg-amber-50"}`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${severity === "critical" ? "bg-red-500" : "bg-amber-400"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {p.product_name}
                              </p>
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${getCategoryStyle(p.category)}`}
                              >
                                {p.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {p.supplier_name}
                            </p>
                          </div>
                          <div className="flex-shrink-0 text-center min-w-[80px]">
                            <p
                              className={`text-sm font-bold ${severity === "critical" ? "text-red-600" : "text-amber-600"}`}
                            >
                              {p.mainStock}
                              <span className="text-xs font-normal text-slate-400 ml-0.5">
                                {p.unit}
                              </span>
                            </p>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${severity === "critical" ? "bg-red-400" : "bg-amber-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              of {p.reorderPoint} {p.unit} reorder
                            </p>
                          </div>
                          {deficit > 0 && (
                            <div className="flex-shrink-0 text-center min-w-[72px]">
                              <p className="text-[10px] text-slate-400">Need</p>
                              <p
                                className={`text-sm font-bold ${severity === "critical" ? "text-red-600" : "text-amber-600"}`}
                              >
                                +{deficit}{" "}
                                <span className="text-xs font-normal text-slate-400">
                                  {p.unit}
                                </span>
                              </p>
                            </div>
                          )}
                          <button
                            onClick={() => onOrderNow(p)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 shadow-sm ${severity === "critical" ? "bg-red-500 text-white hover:bg-red-600 shadow-red-500/25" : "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/25"}`}
                          >
                            <CartIcon />
                            Order Now
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
