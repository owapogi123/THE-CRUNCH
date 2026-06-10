import { motion } from "framer-motion";
import { useState } from "react";
import type { Batch } from "../../types/inventory";
import { isExpired, isExpiringSoon } from "../../utils/dateUtils";
import { fmtDate, fmtReceivedDate } from "../../utils/formatters";

export function YesterdayReturnsBanner({ batches }: { batches: Batch[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const returnedBatches = batches.filter((b) => b.status === "returned");
  if (returnedBatches.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{"\u21A9"}</span>
          <div>
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Returned Stock (Available Today)
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Use these first (FIFO) before new batches
            </p>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors px-2 py-1 rounded-lg hover:bg-emerald-100"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <div className="px-5 pb-4 grid grid-cols-3 gap-3">
          {returnedBatches.map((b) => {
            const expiring = isExpiringSoon(b.expiry_date);
            const expired = isExpired(b.expiry_date);
            return (
              <div
                key={b.batch_id}
                className={`rounded-xl p-3.5 border ${expired ? "bg-red-50 border-red-200" : expiring ? "bg-orange-50 border-orange-200" : "bg-white border-amber-100"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {b.product_name}
                  </p>
                  {expired && (
                    <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full ml-1 whitespace-nowrap">
                      EXPIRED
                    </span>
                  )}
                  {expiring && !expired && (
                    <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full ml-1 whitespace-nowrap">
                      EXPIRING SOON
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <p className="text-base font-bold text-emerald-700">
                    {b.returned_qty}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {b.unit} returned
                    </span>
                  </p>
                </div>
                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Batch #{b.batch_id}</span>
                    <span className="font-medium text-slate-500">
                      {b.remaining_qty} {b.unit} available
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Received</span>
                    <span>{fmtReceivedDate(b.received_date)}</span>
                  </div>
                  {b.expiry_date && (
                    <div className="flex justify-between">
                      <span>Expires</span>
                      <span
                        className={
                          expired
                            ? "text-red-500 font-semibold"
                            : expiring
                              ? "text-orange-500 font-semibold"
                              : ""
                        }
                      >
                        {fmtDate(b.expiry_date)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
