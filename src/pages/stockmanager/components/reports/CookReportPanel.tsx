import { AnimatePresence, motion, type Variants } from "framer-motion";
import { SectionCard } from "../SectionCard";
import type {
  KitchenUsageItem,
  KitchenUsagePayload,
} from "../../types/inventory";
import { fmtDate, fmtInt, toNumber } from "../../utils/formatters";

type CookReportTotals = {
  withdrawn: number;
  used: number;
  spoilage: number;
  returned: number;
};

export function CookReportPanel({
  itemVariants,
  cookReport,
  cookReportItems,
  cookReportVarianceCount,
  cookReportTotals,
  cookReportOpen,
  cookReportLoading,
  cookReportFinalizing,
  onRefresh,
  onToggleOpen,
  onFinalize,
}: {
  itemVariants: Variants;
  cookReport: KitchenUsagePayload | null;
  cookReportItems: KitchenUsageItem[];
  cookReportVarianceCount: number;
  cookReportTotals: CookReportTotals;
  cookReportOpen: boolean;
  cookReportLoading: boolean;
  cookReportFinalizing: boolean;
  onRefresh: () => void;
  onToggleOpen: () => void;
  onFinalize: () => void;
}) {
  return (
    <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
      <div>
        <SectionCard
          title="Cook Report"
          subtitle={
            cookReport?.report
              ? `Daily kitchen usage for ${fmtDate(cookReport.report.report_date)}`
              : "Manual cook report for daily usage and spoilage"
          }
        >
          <div className="p-5 space-y-4">
            {!cookReport ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400 text-center">
                No cook report is available yet for today.
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                      Status
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800 capitalize">
                      {cookReport.report.status}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                      Prepared By
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {cookReport.report.prepared_by_name ??
                        (cookReport.report.prepared_by
                          ? `User #${cookReport.report.prepared_by}`
                          : "Not submitted")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                      Items Reported
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {cookReportItems.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
                      Variance Lines
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {cookReportVarianceCount}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    Withdrawn:{" "}
                    <span className="font-semibold text-slate-700">
                      {fmtInt(cookReportTotals.withdrawn)}
                    </span>
                  </span>
                  <span>{"\u2022"}</span>
                  <span>
                    Used:{" "}
                    <span className="font-semibold text-slate-700">
                      {fmtInt(cookReportTotals.used)}
                    </span>
                  </span>
                  <span>{"\u2022"}</span>
                  <span>
                    Spoilage:{" "}
                    <span className="font-semibold text-slate-700">
                      {fmtInt(cookReportTotals.spoilage)}
                    </span>
                  </span>
                  <span>{"\u2022"}</span>
                  <span>
                    Returned:{" "}
                    <span className="font-semibold text-slate-700">
                      {fmtInt(cookReportTotals.returned)}
                    </span>
                  </span>
                  <span>{"\u2022"}</span>
                  <span>
                    Last updated:{" "}
                    <span className="font-semibold text-slate-700">
                      {cookReport.report.updated_at
                        ? new Date(cookReport.report.updated_at).toLocaleString()
                        : "Not yet updated"}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={cookReportLoading}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {cookReportLoading ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleOpen}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {cookReportOpen ? "Hide Details" : "Review"}
                  </button>
                  <button
                    type="button"
                    onClick={onFinalize}
                    disabled={
                      cookReportFinalizing ||
                      cookReport.report.status === "finalized" ||
                      cookReportItems.length === 0
                    }
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {cookReportFinalizing
                      ? "Finalizing..."
                      : cookReport.report.status === "finalized"
                        ? "Finalized"
                        : "Finalize"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {cookReportOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-[1.4fr_repeat(5,minmax(0,0.8fr))] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <span>Raw Material</span>
                          <span>Withdrawn</span>
                          <span>Used</span>
                          <span>Spoilage</span>
                          <span>Returned</span>
                          <span>Variance</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {cookReportItems.map((item) => {
                            const variance =
                              toNumber(item.withdrawn_qty) -
                              toNumber(item.used_qty) -
                              toNumber(item.spoilage_qty) -
                              toNumber(item.returned_qty);

                            return (
                              <div key={item.product_id} className="px-4 py-3">
                                <div className="grid grid-cols-[1.4fr_repeat(5,minmax(0,0.8fr))] gap-3 items-start text-sm text-slate-700">
                                  <div>
                                    <p className="font-semibold text-slate-800">
                                      {item.product_name}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                      {item.category} {"\u00B7"} {item.unit}
                                    </p>
                                    {item.note && (
                                      <p className="text-xs text-slate-500 mt-2">
                                        Note: {item.note}
                                      </p>
                                    )}
                                  </div>
                                  <p>
                                    {fmtInt(item.withdrawn_qty)} {item.unit}
                                  </p>
                                  <p>
                                    {fmtInt(item.used_qty)} {item.unit}
                                  </p>
                                  <p>
                                    {fmtInt(item.spoilage_qty)} {item.unit}
                                  </p>
                                  <p>
                                    {fmtInt(item.returned_qty)} {item.unit}
                                  </p>
                                  <p
                                    className={
                                      Math.abs(variance) > 0.009
                                        ? "font-semibold text-amber-600"
                                        : "font-semibold text-emerald-600"
                                    }
                                  >
                                    {fmtInt(variance)} {item.unit}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {cookReport.report.status === "finalized" && (
                  <p className="text-xs font-medium text-emerald-600">
                    Finalized by{" "}
                    {cookReport.report.finalized_by_name ??
                      (cookReport.report.finalized_by
                        ? `User #${cookReport.report.finalized_by}`
                        : "manager")}
                    {cookReport.report.finalized_at
                      ? ` on ${new Date(cookReport.report.finalized_at).toLocaleString()}`
                      : ""}
                  </p>
                )}
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </motion.div>
  );
}
