import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import type { ReconcileRow } from "../../types/inventory";
import {
  blockInvalidNumberKeys,
  sanitizeNumberInput,
} from "../../utils/inputUtils";

type EndOfDayReconciliationModalProps = {
  reconcileItems: ReconcileRow[];
  setReconcileItems: Dispatch<SetStateAction<ReconcileRow[]>>;
  submitting: boolean;
  getCategoryStyle: (category: string) => string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

export function EndOfDayReconciliationModal({
  reconcileItems,
  setReconcileItems,
  submitting,
  getCategoryStyle,
  onClose,
  onSubmit,
}: EndOfDayReconciliationModalProps) {
  const reconcileCount = reconcileItems.filter(
    (i) => parseFloat(i.returnQty) > 0,
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800">
              End-of-Day Reconciliation
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Returns are saved on the batch {"\u2014"} staff will see them
              tomorrow morning.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-lg"
          >
            {"\u2715"}
          </button>
        </div>
        <div className="px-6 pt-4 flex items-center gap-4 text-xs text-slate-400">
          {[
            ["bg-orange-400", "Whole Chicken", ""],
            ["bg-amber-500", "Chopped Chicken", "(can return as whole)"],
            ["bg-slate-400", "Other Meat/Protein", ""],
          ].map(([dot, label, sub]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${dot} inline-block`}
              />
              {label}
              {sub && (
                <span className="ml-1 text-amber-500 font-medium">{sub}</span>
              )}
            </span>
          ))}
        </div>
        <div className="p-6 space-y-3 max-h-[26rem] overflow-y-auto">
          {reconcileItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No reconcilable items currently released.
            </p>
          ) : (
            reconcileItems.map((item, i) => {
              const isChopped = item.category
                .toLowerCase()
                .includes("chopped chicken");
              const isWhole = item.category
                .toLowerCase()
                .includes("whole chicken");
              return (
                <div
                  key={item.product_id}
                  className={`p-4 rounded-2xl border transition-colors ${isChopped ? "bg-amber-50/60 border-amber-100" : isWhole ? "bg-orange-50/60 border-orange-100" : "bg-slate-50 border-slate-100"}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${isWhole ? "bg-orange-400" : isChopped ? "bg-amber-500" : "bg-slate-400"}`}
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Released today:{" "}
                          <span className="font-medium text-slate-600">
                            {item.withdrawn} {item.unit}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getCategoryStyle(item.category)}`}
                    >
                      {item.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-slate-500 whitespace-nowrap w-20 flex-shrink-0">
                      Return qty:
                    </label>
                    <input
                      type="number"
                      value={item.returnQty}
                      placeholder="0"
                      min={0}
                      max={item.withdrawn}
                      step="0.01"
                      inputMode="decimal"
                      onKeyDown={(e) => blockInvalidNumberKeys(e)}
                      onChange={(e) =>
                        setReconcileItems((prev) =>
                          prev.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  returnQty: sanitizeNumberInput(
                                    e.target.value,
                                  ),
                                }
                              : r,
                          ),
                        )
                      }
                      className="w-28 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <span className="text-xs text-slate-400">{item.unit}</span>
                    {isChopped && parseFloat(item.returnQty) > 0 && (
                      <div className="ml-auto flex items-center gap-2 bg-white border border-amber-200 rounded-xl p-1">
                        <span className="text-[10px] text-amber-600 font-semibold ml-1">
                          Return as:
                        </span>
                        {(["chopped", "whole"] as const).map((dest) => (
                          <button
                            key={dest}
                            onClick={() =>
                              setReconcileItems((prev) =>
                                prev.map((r, j) =>
                                  j === i
                                    ? { ...r, returnDestination: dest }
                                    : r,
                                ),
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize ${item.returnDestination === dest ? (dest === "chopped" ? "bg-amber-500 text-white shadow-sm" : "bg-orange-500 text-white shadow-sm") : "text-slate-400 hover:text-amber-500"}`}
                          >
                            {dest}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {isChopped && parseFloat(item.returnQty) > 0 && (
                    <p className="text-[10px] text-slate-400 mt-2 pl-px">
                      {item.returnDestination === "whole"
                        ? "\u21A9 Excess will be returned to Whole Chicken stock"
                        : "\u21A9 Excess will stay as Chopped Chicken stock"}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {reconcileCount} item(s) to reconcile
            {reconcileCount > 0 && (
              <span className="ml-1 text-amber-600 font-medium">
                {"\u2014"} will show in tomorrow's banner
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting || reconcileCount === 0}
              className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Confirm Returns"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
