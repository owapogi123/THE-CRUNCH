import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import type {
  KitchenUsagePayload,
  ReportData,
  ReportLineItem,
} from "../types/inventory";
import { toNumber } from "../utils/formatters";

type ToastFn = (message: string, type: "success" | "error") => void;
type ReportPeriod = "weekly" | "monthly";

type UseStockReportsParams = {
  showToast: ToastFn;
};

function normalizeReportData(data: ReportData): ReportData {
  const deduped = new Map<number, ReportLineItem>();
  for (const item of data.items) deduped.set(item.product_id, item);
  const items = Array.from(deduped.values());
  return {
    ...data,
    items,
    totalReceived: items.reduce((sum, item) => sum + toNumber(item.received), 0),
    totalWithdrawn: items.reduce((sum, item) => sum + toNumber(item.withdrawn), 0),
    totalReturned: items.reduce((sum, item) => sum + toNumber(item.returned), 0),
    totalWasted: items.reduce((sum, item) => sum + toNumber(item.wasted), 0),
  };
}

function normalizeKitchenUsagePayload(
  payload: KitchenUsagePayload,
): KitchenUsagePayload {
  return {
    report: {
      ...payload.report,
      report_id: toNumber(payload.report.report_id),
      prepared_by:
        payload.report.prepared_by == null
          ? null
          : toNumber(payload.report.prepared_by),
      finalized_by:
        payload.report.finalized_by == null
          ? null
          : toNumber(payload.report.finalized_by),
    },
    items: Array.isArray(payload.items)
      ? payload.items.map((item) => ({
          ...item,
          usage_item_id:
            (item as { usage_item_id?: unknown }).usage_item_id == null
              ? undefined
              : toNumber((item as { usage_item_id?: unknown }).usage_item_id),
          product_id: item.product_id == null ? null : toNumber(item.product_id),
          withdrawn_qty: toNumber(item.withdrawn_qty),
          used_qty: toNumber(item.used_qty),
          spoilage_qty: toNumber(item.spoilage_qty),
          returned_qty: toNumber((item as { returned_qty?: unknown }).returned_qty),
          note: typeof item.note === "string" ? item.note : "",
        }))
      : [],
  };
}

export function useStockReports({ showToast }: UseStockReportsParams) {
  const [cookReport, setCookReport] = useState<KitchenUsagePayload | null>(null);
  const [cookReportOpen, setCookReportOpen] = useState(false);
  const [cookReportFinalizing, setCookReportFinalizing] = useState(false);
  const [cookReportLoading, setCookReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("weekly");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date().getMonth() + 1,
  );
  const [selectedYear, setSelectedYear] = useState(
    () => new Date().getFullYear(),
  );

  const applyCookReportPayload = useCallback((payload: KitchenUsagePayload | null) => {
    if (!payload) {
      setCookReport(null);
      return;
    }

    const normalized = normalizeKitchenUsagePayload(payload);
    setCookReport(normalized);
    if (normalized.items.length > 0) {
      setCookReportOpen(true);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const data =
        reportPeriod === "weekly"
          ? await api.reports.getWeekly(selectedWeekStart)
          : await api.reports.getMonthly(selectedYear, selectedMonth);
      setReportData(normalizeReportData(data));
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to load report.",
        "error",
      );
    } finally {
      setReportLoading(false);
    }
  }, [reportPeriod, selectedWeekStart, selectedMonth, selectedYear, showToast]);

  const fetchCookReport = useCallback(
    async (silent = false) => {
      if (!silent) setCookReportLoading(true);
      try {
        const payload = await api.getDailyUsageReport();
        applyCookReportPayload(payload);
      } catch (err) {
        if (!silent) {
          showToast(
            err instanceof Error ? err.message : "Failed to load cook report.",
            "error",
          );
        }
      } finally {
        if (!silent) setCookReportLoading(false);
      }
    },
    [applyCookReportPayload, showToast],
  );

  const handleFinalizeCookReport = useCallback(async () => {
    if (!cookReport?.report?.report_id) return;

    setCookReportFinalizing(true);
    try {
      const rawUserId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : null;
      const finalizedBy =
        rawUserId && Number.isFinite(Number(rawUserId))
          ? Number(rawUserId)
          : null;
      const payload = await api.finalizeKitchenUsage(cookReport.report.report_id, {
        finalized_by: finalizedBy,
      });
      applyCookReportPayload(payload);
      showToast("Cook report finalized.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to finalize cook report.",
        "error",
      );
    } finally {
      setCookReportFinalizing(false);
    }
  }, [applyCookReportPayload, cookReport, showToast]);

  const exportReportCsv = useCallback(() => {
    if (!reportData || typeof document === "undefined") return;

    const headers = [
      "Product",
      "Category",
      "Unit",
      "Received",
      "Withdrawn",
      "Returned",
      "Wasted",
      "Remaining",
    ];
    const rows = reportData.items.map((item) =>
      [
        item.product_name,
        item.category,
        item.unit,
        item.received,
        item.withdrawn,
        item.returned,
        item.wasted,
        item.remaining,
      ].join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `stock-report-${reportData.period}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [reportData]);

  const toggleCookReportOpen = useCallback(() => {
    setCookReportOpen((open) => !open);
  }, []);

  useEffect(() => {
    setReportData(null);
  }, [reportPeriod]);

  const cookReportItems = useMemo(() => cookReport?.items ?? [], [cookReport]);

  const cookReportVarianceCount = useMemo(
    () =>
      cookReportItems.filter(
        (item) =>
          Math.abs(
            toNumber(item.withdrawn_qty) -
              toNumber(item.used_qty) -
              toNumber(item.spoilage_qty),
          ) > 0.009,
      ).length,
    [cookReportItems],
  );

  const cookReportTotals = useMemo(
    () =>
      cookReportItems.reduce(
        (sum, item) => ({
          withdrawn: sum.withdrawn + toNumber(item.withdrawn_qty),
          used: sum.used + toNumber(item.used_qty),
          spoilage: sum.spoilage + toNumber(item.spoilage_qty),
          returned: sum.returned + toNumber(item.returned_qty),
        }),
        { withdrawn: 0, used: 0, spoilage: 0, returned: 0 },
      ),
    [cookReportItems],
  );

  return {
    cookReport,
    cookReportOpen,
    cookReportFinalizing,
    cookReportLoading,
    reportPeriod,
    reportData,
    reportLoading,
    selectedWeekStart,
    selectedMonth,
    selectedYear,
    cookReportItems,
    cookReportVarianceCount,
    cookReportTotals,
    setReportPeriod,
    setSelectedWeekStart,
    setSelectedMonth,
    setSelectedYear,
    applyCookReportPayload,
    fetchReport,
    fetchCookReport,
    handleFinalizeCookReport,
    exportReportCsv,
    toggleCookReportOpen,
  };
}
