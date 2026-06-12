import { motion, type Variants } from "framer-motion";
import { SectionCard } from "../SectionCard";
import type { ReportData } from "../../types/inventory";
import { fmtInt } from "../../utils/formatters";
import {
  blockInvalidNumberKeys,
  sanitizeNumberInput,
} from "../../utils/inputUtils";

type ReportPeriod = "weekly" | "monthly";

export function StockMovementReportPanel({
  itemVariants,
  inputCls,
  reportPeriod,
  reportData,
  reportLoading,
  selectedWeekStart,
  selectedMonth,
  selectedYear,
  onReportPeriodChange,
  onSelectedWeekStartChange,
  onSelectedMonthChange,
  onSelectedYearChange,
  onFetchReport,
  onExportCsv,
  getCategoryStyle,
}: {
  itemVariants: Variants;
  inputCls: string;
  reportPeriod: ReportPeriod;
  reportData: ReportData | null;
  reportLoading: boolean;
  selectedWeekStart: string;
  selectedMonth: number;
  selectedYear: number;
  onReportPeriodChange: (period: ReportPeriod) => void;
  onSelectedWeekStartChange: (value: string) => void;
  onSelectedMonthChange: (value: number) => void;
  onSelectedYearChange: (value: number) => void;
  onFetchReport: () => void;
  onExportCsv: () => void;
  getCategoryStyle: (category: string) => string;
}) {
  return (
    <>
      <div
        id="dashboard-stock-movement"
        className="scroll-mt-44"
        style={{ scrollMarginTop: "180px" }}
      >
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Stock Movement Report
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Summarizes received, withdrawn, wasted, and returned per item
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                {(["weekly", "monthly"] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => onReportPeriodChange(period)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${reportPeriod === period ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {period}
                  </button>
                ))}
              </div>
              {reportPeriod === "weekly" ? (
                <input
                  type="date"
                  value={selectedWeekStart}
                  onChange={(e) => onSelectedWeekStartChange(e.target.value)}
                  className={inputCls + " !w-40"}
                />
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedMonth}
                    onChange={(e) => onSelectedMonthChange(Number(e.target.value))}
                    className={inputCls + " !w-32"}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i).toLocaleString("default", {
                          month: "long",
                        })}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => {
                      const nextValue = sanitizeNumberInput(e.target.value, {
                        allowDecimal: false,
                      });
                      if (nextValue) {
                        onSelectedYearChange(Number(nextValue));
                      }
                    }}
                    className={inputCls + " !w-24"}
                    min={2020}
                    max={2099}
                    step="1"
                    inputMode="numeric"
                    onKeyDown={(e) =>
                      blockInvalidNumberKeys(e, { allowDecimal: false })
                    }
                  />
                </div>
              )}
              <button
                onClick={onFetchReport}
                disabled={reportLoading}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60"
              >
                {reportLoading ? "Generating..." : "Generate Report"}
              </button>
              {reportData && (
                <button
                  onClick={onExportCsv}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
      <motion.div variants={itemVariants}>
        {!reportData && !reportLoading && (
          <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-5 h-5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-slate-400">
              Select a period and click{" "}
              <span className="font-semibold text-slate-600">
                Generate Report
              </span>{" "}
              to view stock movement.
            </p>
          </div>
        )}
        {reportLoading && (
          <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-sm animate-pulse">
            <p className="text-sm text-slate-400">Building your report...</p>
          </div>
        )}
        {reportData && !reportLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  label: "Total Received",
                  value: fmtInt(reportData.totalReceived),
                  accent: "border-t-emerald-400",
                  text: "text-emerald-600",
                },
                {
                  label: "Total Withdrawn",
                  value: fmtInt(reportData.totalWithdrawn),
                  accent: "border-t-indigo-400",
                  text: "text-indigo-600",
                },
                {
                  label: "Total Returned",
                  value: fmtInt(reportData.totalReturned),
                  accent: "border-t-amber-400",
                  text: "text-amber-600",
                },
                {
                  label: "Total Wasted",
                  value: fmtInt(reportData.totalWasted),
                  accent: "border-t-rose-400",
                  text: "text-rose-500",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${card.accent}`}
                >
                  <p className="text-xs text-slate-400 font-medium">
                    {card.label}
                  </p>
                  <p
                    className={`text-3xl font-bold mt-1 leading-none ${card.text}`}
                  >
                    {card.value}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {reportData.period}
                  </p>
                </div>
              ))}
            </div>
            <SectionCard
              title={`Stock Movement \u2014 ${reportData.period}`}
              subtitle={`Generated ${new Date(reportData.generatedAt).toLocaleString()} \u00B7 ${reportData.items.length} items`}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {[
                      "Item",
                      "Category",
                      "Received",
                      "Withdrawn",
                      "Returned",
                      "Wasted",
                      "Remaining",
                      "Efficiency",
                    ].map((header) => (
                      <th
                        key={header}
                        className={`py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${["Item", "Category"].includes(header) ? "text-left" : "text-right"}`}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.items.map((item, index) => {
                    const efficiency =
                      item.withdrawn > 0
                        ? Math.round(
                            ((item.withdrawn - item.wasted) / item.withdrawn) *
                              100,
                          )
                        : 100;
                    const effColor =
                      efficiency >= 90
                        ? "text-emerald-600 bg-emerald-50"
                        : efficiency >= 70
                          ? "text-amber-600 bg-amber-50"
                          : "text-rose-500 bg-rose-50";

                    return (
                      <tr
                        key={item.product_id}
                        style={{
                          opacity: 0,
                          animation: "fadeInRow 0.28s ease forwards",
                          animationDelay: `${index * 0.04}s`,
                        }}
                        className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-medium text-slate-800">
                          {item.product_name}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${getCategoryStyle(item.category)}`}
                          >
                            {item.category}
                          </span>
                        </td>
                        {[
                          { v: item.received, c: "text-emerald-600" },
                          { v: item.withdrawn, c: "text-indigo-500" },
                          { v: item.returned, c: "text-amber-500" },
                          { v: item.wasted, c: "text-rose-500" },
                          { v: item.remaining, c: "text-slate-700" },
                        ].map(({ v, c }, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={`py-3.5 px-4 text-right font-semibold ${c}`}
                          >
                            {v}{" "}
                            <span className="text-slate-400 font-normal text-xs">
                              {item.unit}
                            </span>
                          </td>
                        ))}
                        <td className="py-3.5 px-4 text-right">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${effColor}`}
                          >
                            {efficiency}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </SectionCard>
          </div>
        )}
      </motion.div>
    </>
  );
}
