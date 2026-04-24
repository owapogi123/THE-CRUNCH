import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  RotateCcw,
  ChevronDown,
  Printer,
  TrendingUp,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "Completed" | "Pending" | "Cancelled" | "Refunded";
type LogType = "Sale" | "Refund" | "Void" | "Adjustment";
type Period = "Today" | "Last 7 Days" | "Last 30 Days" | "All Time";
type TabKey = "logs" | "orders";
type QuickKey =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "last7"
  | "last30"
  | "all";
type OrderStatusFilter =
  | "All"
  | "Completed"
  | "Pending"
  | "Cancelled"
  | "Refunded";

interface SaleLog {
  id: string;
  transactionId: string;
  orderId: number;
  date: string;
  time: string;
  type: LogType;
  product: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: Status;
  paymentMethod: string;
  operator: string;
  cashierName: string;
  note?: string;
  _dateObj: Date;
}

interface Order {
  id: number;
  orderNumber: string;
  transactionId: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  date: string;
  time: string;
  orderType: string;
  status: Status;
  paymentCategory: string;
  cashierName?: string;
  riderName?: string;
  handoverTimestamp?: string | null;
}

interface RawOrderRow {
  id: number;
  orderNumber?: string;
  order_number?: string;
  total?: number;
  date?: string;
  orderType?: string;
  order_type?: string;
  status?: string;
  paymentMethod?: string;
  payment_method?: string;
  productId?: number;
  productName?: string;
  price?: number;
  subtotal?: number;
  quantity?: number;
  cashierName?: string;
  cashier_name?: string;
  operatorName?: string;
  operator_name?: string;
  riderName?: string;
  rider_name?: string;
  handoverTimestamp?: string;
  handover_timestamp?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDER_PAGE_SIZE = 10;
const LOG_PAGE_SIZE = 20;
const ITEM_H = 36;
const POLL_INTERVAL_MS = 5000;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const YEAR_OFFSET = 2;

const QUICK_RANGES = [
  { label: "Today", key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "This week", key: "week" },
  { label: "This month", key: "month" },
  { label: "Last 7 days", key: "last7" },
  { label: "Last 30 days", key: "last30" },
  { label: "All time", key: "all" },
] as const;

const STATUS_COLOR: Record<Status, string> = {
  Completed: "#16a34a",
  Pending: "#d97706",
  Cancelled: "#dc2626",
  Refunded: "#2563eb",
};

const TYPE_COLOR: Record<LogType, string> = {
  Sale: "#f97316",
  Refund: "#3b82f6",
  Void: "#9ca3af",
  Adjustment: "#8b5cf6",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function getQuickRange(key: QuickKey): { from: Date; to: Date } | null {
  if (key === "all") return null;
  const now = new Date();
  const f = new Date(now);
  const t = new Date(now);

  if (key === "today") {
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "yesterday") {
    f.setDate(now.getDate() - 1);
    f.setHours(0, 0, 0, 0);
    t.setDate(now.getDate() - 1);
    t.setHours(23, 59, 59, 999);
  } else if (key === "week") {
    f.setDate(now.getDate() - now.getDay());
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "month") {
    f.setDate(1);
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "last7") {
    f.setDate(now.getDate() - 6);
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "last30") {
    f.setDate(now.getDate() - 29);
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  }

  return { from: f, to: t };
}

function isDateInRange(
  date: Date,
  from: Date | null,
  to: Date | null,
): boolean {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  if (from) {
    const f = new Date(from);
    f.setHours(0, 0, 0, 0);
    if (day < f) return false;
  }
  if (to) {
    const t = new Date(to);
    t.setHours(0, 0, 0, 0);
    if (day > t) return false;
  }
  return true;
}

function filterOrdersByRange(
  orders: Order[],
  from: Date | null,
  to: Date | null,
): Order[] {
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const d = parseDateSafe(o.date);
    return d ? isDateInRange(d, from, to) : false;
  });
}

function filterLogsByRange(
  logs: SaleLog[],
  from: Date | null,
  to: Date | null,
): SaleLog[] {
  if (!from && !to) return logs;
  return logs.filter((log) => isDateInRange(log._dateObj, from, to));
}

function groupByDate(logs: SaleLog[]): Record<string, SaleLog[]> {
  return logs.reduce(
    (acc, l) => {
      if (!acc[l.date]) acc[l.date] = [];
      acc[l.date].push(l);
      return acc;
    },
    {} as Record<string, SaleLog[]>,
  );
}

function getRevenueForPeriod(logs: SaleLog[], period: Period): number {
  const now = new Date();
  const start = new Date(now);

  if (period === "Today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "Last 7 Days") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "Last 30 Days") {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }

  return logs
    .filter((l) => {
      if (l.status !== "Completed") return false;
      if (period === "All Time") return true;
      return l._dateObj >= start && l._dateObj <= now;
    })
    .reduce((sum, l) => sum + l.total, 0);
}

function normalizeStatus(value?: string): Status {
  switch (
    String(value ?? "")
      .trim()
      .toLowerCase()
  ) {
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    default:
      return "Pending";
  }
}

function normalizeLogType(status: Status): LogType {
  if (status === "Refunded") return "Refund";
  if (status === "Cancelled") return "Void";
  return "Sale";
}

function processRawRows(rows: RawOrderRow[]): {
  logs: SaleLog[];
  orders: Order[];
} {
  if (!rows?.length) return { logs: [], orders: [] };

  type OrderAccum = {
    rows: RawOrderRow[];
    total: number;
    date: string;
    orderType: string;
    status: string;
    paymentMethod: string;
    cashierName: string;
    riderName: string;
    handoverTimestamp: string | null;
    orderNumber: string;
  };

  const orderMap: Record<number, OrderAccum> = {};

  for (const r of rows) {
    if (!orderMap[r.id]) {
      orderMap[r.id] = {
        rows: [],
        total: Number(r.total) || 0,
        date: r.date ?? "",
        orderType: r.orderType ?? r.order_type ?? "Order",
        status: r.status ?? "",
        paymentMethod:
          String(r.paymentMethod ?? r.payment_method ?? "cash").trim() ||
          "cash",
        cashierName:
          String(
            r.cashierName ??
              r.cashier_name ??
              r.operatorName ??
              r.operator_name ??
              "",
          ).trim() || "Unknown",
        riderName: String(r.riderName ?? r.rider_name ?? "").trim(),
        handoverTimestamp:
          String(r.handoverTimestamp ?? r.handover_timestamp ?? "").trim() ||
          null,
        orderNumber: String(r.orderNumber ?? r.order_number ?? "").trim(),
      };
    }

    const riderName = String(r.riderName ?? r.rider_name ?? "").trim();
    const handoverTimestamp = String(
      r.handoverTimestamp ?? r.handover_timestamp ?? "",
    ).trim();

    if (riderName) orderMap[r.id].riderName = riderName;
    if (handoverTimestamp) orderMap[r.id].handoverTimestamp = handoverTimestamp;

    orderMap[r.id].rows.push(r);
  }

  const allLogs: SaleLog[] = [];
  const ordersMap: Record<number, Order> = {};

  for (const [idStr, order] of Object.entries(orderMap)) {
    const orderId = Number(idStr);
    const orderDate = order.date ? new Date(order.date) : new Date();
    const status = normalizeStatus(order.status);
    const productNames = order.rows
      .map((r) => r.productName)
      .filter(Boolean)
      .join(", ");
    const totalQty = order.rows.reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );
    const resolvedTxnId = order.orderNumber || `#${orderId}`;

    allLogs.push({
      id: resolvedTxnId,
      transactionId: resolvedTxnId,
      orderId,
      date: orderDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      time: orderDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      type: normalizeLogType(status),
      product: productNames || `Order #${orderId}`,
      category: order.orderType,
      quantity: totalQty,
      unitPrice: order.total,
      total: order.total,
      status,
      paymentMethod: order.paymentMethod,
      operator: order.cashierName,
      cashierName: order.cashierName,
      _dateObj: orderDate,
    });

    ordersMap[orderId] = {
      id: orderId,
      orderNumber: resolvedTxnId,
      transactionId: resolvedTxnId,
      items: order.rows.map((r) => ({
        name: r.productName ?? "",
        price: Number(r.price) || 0,
        quantity: Number(r.quantity) || 1,
      })),
      total: order.total,
      date: order.date ?? "",
      time: orderDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      orderType: order.orderType,
      status,
      paymentCategory: order.paymentMethod,
      cashierName: order.cashierName,
      riderName: order.riderName || undefined,
      handoverTimestamp: order.handoverTimestamp,
    };
  }

  return {
    logs: allLogs.sort((a, b) => b._dateObj.getTime() - a._dateObj.getTime()),
    orders: Object.values(ordersMap),
  };
}

// ─── Print Helper ─────────────────────────────────────────────────────────────

function triggerPrint(
  revenue: number,
  period: Period,
  logs: SaleLog[],
  orders: Order[],
) {
  const completed = logs.filter((l) => l.status === "Completed");
  const pending = logs.filter((l) => l.status === "Pending");
  const cancelled = logs.filter((l) => l.status === "Cancelled");
  const refunded = logs.filter((l) => l.status === "Refunded");

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const completedOrders = orders
    .filter((o) => o.status === "Completed")
    .sort(
      (a, b) =>
        (parseDateSafe(b.date)?.getTime() ?? 0) -
        (parseDateSafe(a.date)?.getTime() ?? 0),
    );

  const rows = completedOrders
    .map((o, i) => {
      const fmtDate =
        parseDateSafe(o.date)?.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }) ?? "—";
      const fmtHandover =
        parseDateSafe(o.handoverTimestamp)?.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }) ?? "—";
      return `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}">
          <td>${o.transactionId}</td>
          <td>${fmtDate}</td>
          <td>${o.time}</td>
          <td style="max-width:200px">${o.items.map((it) => `${it.name} ×${it.quantity}`).join(", ")}</td>
          <td>${o.orderType === "delivery" ? (o.riderName ?? "—") : "—"}</td>
          <td>${o.orderType === "delivery" ? fmtHandover : "—"}</td>
          <td>${o.cashierName ?? "—"}</td>
          <td style="text-transform:capitalize;color:#2563eb">${o.paymentCategory}</td>
          <td style="text-align:right;font-weight:700">₱${o.total.toLocaleString()}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Sales Report – ${period}</title>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Poppins', sans-serif; background: #fff; color: #0f172a; padding: 40px 48px; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #f1f5f9; }
        .header-brand { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #f97316; text-transform: uppercase; margin-bottom: 6px; }
        .header-title { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
        .header-period { font-size: 12px; color: #94a3b8; }
        .header-meta { text-align: right; }
        .header-meta p { font-size: 11px; color: #94a3b8; margin-bottom: 2px; }
        .header-meta strong { font-size: 13px; font-weight: 600; color: #334155; }
        .revenue-hero { background: #0f172a; border-radius: 14px; padding: 20px 24px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .revenue-label { font-size: 10px; color: #94a3b8; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
        .revenue-amount { font-size: 32px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
        .revenue-stats { display: flex; gap: 28px; }
        .stat-item { text-align: center; }
        .stat-number { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
        .stat-label { font-size: 10px; color: #64748b; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
        .summary-card { border-radius: 10px; padding: 14px 16px; }
        .summary-card-label { font-size: 9px; font-weight: 700; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
        .summary-card-value { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
        .summary-card-sub { font-size: 10px; color: #94a3b8; }
        .section-title { font-size: 11px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
        colgroup col:nth-child(1) { width: 10%; } colgroup col:nth-child(2) { width: 9%; }
        colgroup col:nth-child(3) { width: 8%; }  colgroup col:nth-child(4) { width: 21%; }
        colgroup col:nth-child(5) { width: 11%; } colgroup col:nth-child(6) { width: 14%; }
        colgroup col:nth-child(7) { width: 10%; } colgroup col:nth-child(8) { width: 8%; }
        colgroup col:nth-child(9) { width: 9%; }
        thead tr { background: #f8fafc; }
        thead th { padding: 9px 10px; text-align: left; font-size: 9px; font-weight: 700; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
        thead th:last-child { text-align: right; }
        tbody td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; word-break: break-word; overflow-wrap: break-word; white-space: normal; vertical-align: top; line-height: 1.4; }
        tbody td:last-child { text-align: right; font-weight: 700; }
        tfoot td { padding: 12px 10px; border-top: 2px solid #e2e8f0; font-weight: 700; font-size: 13px; }
        tr { page-break-inside: avoid; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #cbd5e1; }
        @page { margin: 12mm; size: A4; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <p class="header-brand">The Crunch</p>
          <p class="header-title">Sales Report</p>
          <p class="header-period">Period: ${period}</p>
        </div>
        <div class="header-meta">
          <p>Generated</p>
          <strong>${dateLabel}</strong>
          <p style="margin-top:2px">${timeLabel}</p>
        </div>
      </div>
      <div class="revenue-hero">
        <div>
          <p class="revenue-label">Total Revenue</p>
          <p class="revenue-amount">₱${revenue.toLocaleString()}</p>
        </div>
        <div class="revenue-stats">
          <div class="stat-item"><p class="stat-number" style="color:#4ade80">${completed.length}</p><p class="stat-label">Completed</p></div>
          <div class="stat-item"><p class="stat-number" style="color:#fbbf24">${pending.length}</p><p class="stat-label">Pending</p></div>
          <div class="stat-item"><p class="stat-number" style="color:#f87171">${cancelled.length}</p><p class="stat-label">Cancelled</p></div>
          <div class="stat-item"><p class="stat-number" style="color:#60a5fa">${refunded.length}</p><p class="stat-label">Refunded</p></div>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-card" style="background:#f0fdf4;border:1px solid #bbf7d0">
          <p class="summary-card-label">Completed Revenue</p>
          <p class="summary-card-value" style="color:#16a34a">₱${completed.reduce((s, l) => s + l.total, 0).toLocaleString()}</p>
          <p class="summary-card-sub">${completed.length} orders</p>
        </div>
        <div class="summary-card" style="background:#fffbeb;border:1px solid #fde68a">
          <p class="summary-card-label">Pending Orders</p>
          <p class="summary-card-value" style="color:#d97706">₱${pending.reduce((s, l) => s + l.total, 0).toLocaleString()}</p>
          <p class="summary-card-sub">${pending.length} orders</p>
        </div>
        <div class="summary-card" style="background:#fef2f2;border:1px solid #fecaca">
          <p class="summary-card-label">Cancelled</p>
          <p class="summary-card-value" style="color:#dc2626">${cancelled.length} orders</p>
          <p class="summary-card-sub">voided</p>
        </div>
        <div class="summary-card" style="background:#eff6ff;border:1px solid #bfdbfe">
          <p class="summary-card-label">Refunded</p>
          <p class="summary-card-value" style="color:#2563eb">₱${refunded.reduce((s, l) => s + l.total, 0).toLocaleString()}</p>
          <p class="summary-card-sub">${refunded.length} orders</p>
        </div>
      </div>
      <p class="section-title">Completed Orders (${completedOrders.length})</p>
      <table>
        <colgroup><col/><col/><col/><col/><col/><col/><col/><col/><col/></colgroup>
        <thead>
          <tr>
            <th>Txn ID</th><th>Date</th><th>Time</th><th>Items</th>
            <th>Rider</th><th>Handover</th><th>Cashier</th><th>Payment</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="8" style="text-align:right;color:#0f172a">Total Revenue</td>
            <td style="text-align:right;color:#16a34a;font-size:15px">₱${revenue.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      <p class="footer">Auto-generated by The Crunch POS System · Confidential</p>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

// ─── Drum Picker Column ────────────────────────────────────────────────────────

interface DrumColProps {
  label: string;
  items: (string | number)[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

function DrumCol({ label, items, selectedIndex, onChange }: DrumColProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    curY: -selectedIndex * ITEM_H,
    targetIdx: selectedIndex,
    vel: 0,
    startY: 0,
    startCurY: 0,
    dragging: false,
    lastY: 0,
    lastT: 0,
  });

  function clamp(i: number) {
    return Math.max(0, Math.min(items.length - 1, Math.round(i)));
  }

  function updateItems(idx: number) {
    if (!innerRef.current) return;
    Array.from(innerRef.current.children).forEach((el, i) => {
      const div = el as HTMLDivElement;
      div.style.fontSize = i === idx ? "17px" : "14px";
      div.style.fontWeight = i === idx ? "600" : "400";
      div.style.color = i === idx ? "#4A1C1C" : "#94a3b8";
    });
  }

  function applyY(y: number, animate: boolean) {
    if (!innerRef.current) return;
    const min = -(items.length - 1) * ITEM_H;
    const clamped = Math.max(min, Math.min(0, y));
    state.current.curY = clamped;
    innerRef.current.style.transition = animate
      ? "transform 0.42s cubic-bezier(0.15, 1, 0.3, 1)"
      : "none";
    innerRef.current.style.transform = `translateY(${clamped}px)`;
    updateItems(clamp(-clamped / ITEM_H));
  }

  function snapTo(idx: number) {
    const i = clamp(idx);
    state.current.targetIdx = i;
    applyY(-i * ITEM_H, true);
    onChange(i);
  }

  useEffect(() => {
    const i = clamp(selectedIndex);
    state.current.targetIdx = i;
    state.current.curY = -i * ITEM_H;
    applyY(-i * ITEM_H, false);
    updateItems(i);
  }, [selectedIndex, items.length]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const s = state.current;
    s.dragging = true;
    s.startY = e.clientY;
    s.startCurY = s.curY;
    s.lastY = e.clientY;
    s.lastT = Date.now();
    s.vel = 0;
    if (innerRef.current) innerRef.current.style.transition = "none";
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const s = state.current;
      if (!s.dragging || !innerRef.current) return;
      const now = Date.now();
      const dt = Math.max(1, now - s.lastT);
      s.vel = ((e.clientY - s.lastY) / dt) * 16;
      s.lastY = e.clientY;
      s.lastT = now;
      let newY = s.startCurY + (e.clientY - s.startY);
      const min = -(items.length - 1) * ITEM_H;
      if (newY < min) newY = min + (newY - min) * 0.3;
      if (newY > 0) newY = newY * 0.3;
      s.curY = newY;
      innerRef.current.style.transform = `translateY(${newY}px)`;
      updateItems(clamp(-newY / ITEM_H));
    }
    function onMouseUp() {
      const s = state.current;
      if (!s.dragging) return;
      s.dragging = false;
      snapTo(clamp(-(s.curY + s.vel * 8) / ITEM_H));
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [items.length]);

  function onTouchStart(e: React.TouchEvent) {
    const s = state.current;
    s.dragging = true;
    s.startY = e.touches[0].clientY;
    s.startCurY = s.curY;
    s.lastY = e.touches[0].clientY;
    s.lastT = Date.now();
    s.vel = 0;
    if (innerRef.current) innerRef.current.style.transition = "none";
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const s = state.current;
    if (!s.dragging || !innerRef.current) return;
    const now = Date.now();
    const dt = Math.max(1, now - s.lastT);
    s.vel = ((e.touches[0].clientY - s.lastY) / dt) * 16;
    s.lastY = e.touches[0].clientY;
    s.lastT = now;
    let newY = s.startCurY + (e.touches[0].clientY - s.startY);
    const min = -(items.length - 1) * ITEM_H;
    if (newY < min) newY = min + (newY - min) * 0.3;
    if (newY > 0) newY = newY * 0.3;
    s.curY = newY;
    innerRef.current.style.transform = `translateY(${newY}px)`;
    updateItems(clamp(-newY / ITEM_H));
  }

  function onTouchEnd() {
    const s = state.current;
    if (!s.dragging) return;
    s.dragging = false;
    snapTo(clamp(-(s.curY + s.vel * 8) / ITEM_H));
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    snapTo(state.current.targetIdx + (e.deltaY > 0 ? 1 : -1));
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#94a3b8",
          marginBottom: 8,
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        {label}
      </p>
      <div
        style={{
          position: "relative",
          height: 180,
          width: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 64,
            zIndex: 2,
            pointerEvents: "none",
            background: "linear-gradient(to bottom, #fff 20%, transparent)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 64,
            zIndex: 2,
            pointerEvents: "none",
            background: "linear-gradient(to top, #fff 20%, transparent)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 6,
            right: 6,
            height: ITEM_H,
            marginTop: -ITEM_H / 2,
            borderRadius: 10,
            background: "rgba(74,28,28,0.07)",
            border: "0.5px solid rgba(74,28,28,0.18)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
        <div
          ref={innerRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 72,
            paddingBottom: 72,
            transform: `translateY(${-selectedIndex * ITEM_H}px)`,
            cursor: "grab",
            userSelect: "none",
            willChange: "transform",
          }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                height: ITEM_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                fontSize: i === selectedIndex ? 17 : 14,
                fontWeight: i === selectedIndex ? 600 : 400,
                color: i === selectedIndex ? "#4A1C1C" : "#94a3b8",
                transition: "color 0.15s, font-size 0.15s",
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Drum Date Picker ──────────────────────────────────────────────────────────

interface DrumDatePickerProps {
  open: boolean;
  title: string;
  initial: Date;
  onApply: (date: Date) => void;
  onClose: () => void;
}

function DrumDatePicker({
  open,
  title,
  initial,
  onApply,
  onClose,
}: DrumDatePickerProps) {
  const now = new Date();
  const years = Array.from(
    { length: 10 },
    (_, i) => now.getFullYear() - YEAR_OFFSET + i,
  );

  const [monthIdx, setMonthIdx] = useState(initial.getMonth());
  const [dayIdx, setDayIdx] = useState(initial.getDate() - 1);
  const [yearIdx, setYearIdx] = useState(YEAR_OFFSET);
  const [days, setDays] = useState<number[]>([]);

  useEffect(() => {
    const year = years[yearIdx] ?? now.getFullYear();
    const count = daysInMonth(monthIdx, year);
    setDays(Array.from({ length: count }, (_, i) => i + 1));
    setDayIdx((prev) => Math.min(prev, count - 1));
  }, [monthIdx, yearIdx]);

  useEffect(() => {
    if (!open) return;
    const yi = years.findIndex((y) => y === initial.getFullYear());
    setMonthIdx(initial.getMonth());
    setDayIdx(initial.getDate() - 1);
    setYearIdx(yi >= 0 ? yi : YEAR_OFFSET);
  }, [open]);

  function handleApply() {
    const year = years[yearIdx] ?? now.getFullYear();
    const maxDay = daysInMonth(monthIdx, year);
    onApply(new Date(year, monthIdx, Math.min(dayIdx + 1, maxDay)));
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
            }}
          />
          <motion.div
            key="sheet"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: "30%",
              left: "35%",
              transform: "translate(-50%, -50%)",
              zIndex: 201,
              width: 420,
              background: "#fff",
              borderRadius: 20,
              border: "0.5px solid #e2e8f0",
              paddingBottom: 32,
              fontFamily: "'Poppins', sans-serif",
              boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: 12,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 99,
                  background: "#e2e8f0",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 20px 14px",
                borderBottom: "0.5px solid #f1f5f9",
              }}
            >
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {title}
              </p>
              <button
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "0.5px solid #e2e8f0",
                  background: "#f8fafc",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  color: "#94a3b8",
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                padding: "8px 16px 0",
                justifyContent: "center",
                maxWidth: 360,
                margin: "0 auto",
              }}
            >
              <DrumCol
                label="Month"
                items={MONTHS as unknown as string[]}
                selectedIndex={monthIdx}
                onChange={setMonthIdx}
              />
              <div
                style={{
                  width: 1,
                  background: "#f1f5f9",
                  margin: "40px 4px 0",
                }}
              />
              <DrumCol
                label="Day"
                items={days}
                selectedIndex={Math.min(dayIdx, days.length - 1)}
                onChange={setDayIdx}
              />
              <div
                style={{
                  width: 1,
                  background: "#f1f5f9",
                  margin: "40px 4px 0",
                }}
              />
              <DrumCol
                label="Year"
                items={years}
                selectedIndex={yearIdx}
                onChange={setYearIdx}
              />
            </div>
            <div style={{ display: "flex", gap: 10, padding: "20px 20px 0" }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 12,
                  border: "0.5px solid #e2e8f0",
                  background: "#f8fafc",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#64748b",
                  cursor: "pointer",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                style={{
                  flex: 2,
                  padding: "11px 0",
                  borderRadius: 12,
                  border: "none",
                  background: "#4A1C1C",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                Apply
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Revenue Dropdown ─────────────────────────────────────────────────────────

interface RevenueDropdownProps {
  period: Period;
  setPeriod: (p: Period) => void;
  logs: SaleLog[];
  orders: Order[];
}

function RevenueDropdown({
  period,
  setPeriod,
  logs,
  orders,
}: RevenueDropdownProps) {
  const [open, setOpen] = useState(false);
  const [printToast, setPrintToast] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const periods: Period[] = [
    "Today",
    "Last 7 Days",
    "Last 30 Days",
    "All Time",
  ];
  const revenue = getRevenueForPeriod(logs, period);

  const now = new Date();
  const start = new Date(now);
  if (period === "Today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "Last 7 Days") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "Last 30 Days") {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }

  const inPeriod =
    period === "All Time"
      ? logs
      : logs.filter((l) => l._dateObj >= start && l._dateObj <= now);
  const completedCount = inPeriod.filter(
    (l) => l.status === "Completed",
  ).length;
  const pendingCount = inPeriod.filter((l) => l.status === "Pending").length;
  const cancelledCount = inPeriod.filter(
    (l) => l.status === "Cancelled",
  ).length;
  const refundedCount = inPeriod.filter((l) => l.status === "Refunded").length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handlePrint() {
    setOpen(false);
    triggerPrint(revenue, period, logs, orders);
    setPrintToast(true);
    setTimeout(() => setPrintToast(false), 3000);
  }

  return (
    <>
      <AnimatePresence>
        {printToast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ duration: 0.22 }}
            style={{
              position: "fixed",
              top: 20,
              right: 24,
              zIndex: 9999,
              background: "#0f172a",
              borderRadius: 12,
              padding: "12px 18px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <Printer size={14} color="#4ade80" />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>
              Print dialog opened
            </span>
            <span style={{ fontSize: 11, color: "#64748b" }}>
              · {period} report
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={ref}
        style={{ position: "relative", minWidth: 280, zIndex: 100 }}
      >
        <motion.div
          whileHover={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
          onClick={() => setOpen(!open)}
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: "18px 20px",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
            userSelect: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                color: "#94a3b8",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              Total Revenue
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>
                {period}
              </span>
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  color: "#94a3b8",
                  fontSize: 10,
                  display: "inline-block",
                }}
              >
                ▼
              </motion.span>
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={`${period}-${revenue}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.18 }}
              style={{
                color: "#0f172a",
                fontSize: 28,
                fontWeight: 700,
                margin: "0 0 8px",
                letterSpacing: -0.5,
              }}
            >
              ₱{revenue.toLocaleString()}
            </motion.p>
          </AnimatePresence>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Completed", count: completedCount, color: "#16a34a" },
              { label: "Pending", count: pendingCount, color: "#d97706" },
              { label: "Cancelled", count: cancelledCount, color: "#dc2626" },
              { label: "Refunded", count: refundedCount, color: "#2563eb" },
            ].map((s) => (
              <span
                key={s.label}
                style={{
                  fontSize: 10,
                  color: s.color,
                  fontWeight: 600,
                  background: `${s.color}18`,
                  padding: "2px 8px",
                  borderRadius: 99,
                }}
              >
                {s.label}: {s.count}
              </span>
            ))}
          </div>
        </motion.div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
                zIndex: 9999,
                minWidth: "100%",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 16px 6px",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    color: "#cbd5e1",
                    textTransform: "uppercase",
                  }}
                >
                  Select Period
                </span>
              </div>

              {periods.map((p) => (
                <motion.div
                  key={p}
                  whileHover={{ background: "#f8fafc" }}
                  onClick={() => {
                    setPeriod(p);
                    setOpen(false);
                  }}
                  style={{
                    padding: "11px 16px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid #f8fafc",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: period === p ? "#0f172a" : "#f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <TrendingUp
                        size={12}
                        color={period === p ? "#fff" : "#94a3b8"}
                      />
                    </div>
                    <div>
                      <span
                        style={{
                          color: period === p ? "#0f172a" : "#64748b",
                          fontSize: 13,
                          fontWeight: period === p ? 600 : 400,
                          fontFamily: "'Poppins', sans-serif",
                          display: "block",
                        }}
                      >
                        {p}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "#cbd5e1",
                          fontFamily: "'Poppins', sans-serif",
                        }}
                      >
                        ₱{getRevenueForPeriod(logs, p).toLocaleString()} revenue
                      </span>
                    </div>
                  </div>
                  {period === p && (
                    <span style={{ color: "#f97316", fontSize: 12 }}>✓</span>
                  )}
                </motion.div>
              ))}

              <div
                style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }}
              />
              <div style={{ padding: "8px 16px 4px" }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    color: "#cbd5e1",
                    textTransform: "uppercase",
                  }}
                >
                  Actions
                </span>
              </div>

              <motion.div
                whileHover={{ background: "#fef9f0" }}
                onClick={handlePrint}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderTop: "1px solid #f8fafc",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#4A1C1C",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(74,28,28,0.25)",
                  }}
                >
                  <Printer size={16} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0f172a",
                      fontFamily: "'Poppins', sans-serif",
                    }}
                  >
                    Print Sales Report
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 11,
                      color: "#94a3b8",
                      fontFamily: "'Poppins', sans-serif",
                    }}
                  >
                    {period} · ₱{revenue.toLocaleString()} · {completedCount}{" "}
                    completed
                  </p>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "#f0fdf4",
                    color: "#16a34a",
                    border: "1px solid #bbf7d0",
                    whiteSpace: "nowrap",
                  }}
                >
                  PDF ready
                </div>
              </motion.div>

              <div style={{ padding: "8px 16px 12px", background: "#f8fafc" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 10,
                    color: "#94a3b8",
                    lineHeight: 1.6,
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  Includes: revenue summary, completed orders, cashier
                  breakdown, payment methods
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─── Refund Modal ──────────────────────────────────────────────────────────────

interface RefundModalProps {
  open: boolean;
  log: SaleLog | null;
  order: Order | null;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

function RefundModal({
  open,
  log,
  order,
  onConfirm,
  onClose,
  loading,
}: RefundModalProps) {
  const txnId = log?.transactionId ?? order?.transactionId ?? "";
  const product =
    log?.product ?? (order ? order.items.map((i) => i.name).join(", ") : "");
  const total = log?.total ?? order?.total ?? 0;
  const cashierName = log?.cashierName ?? order?.cashierName ?? "—";
  const paymentMethod = log?.paymentMethod ?? order?.paymentCategory ?? "—";

  return (
    <AnimatePresence>
      {open && (log || order) && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !loading && onClose()}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(4px)",
            }}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: "25%",
              left: "34%",
              transform: "translate(-50%, -50%)",
              zIndex: 301,
              width: 460,
              background: "#fff",
              borderRadius: 20,
              boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
              fontFamily: "'Poppins', sans-serif",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ height: 4, background: "#e2e8f0" }} />
            <div style={{ padding: "24px 24px 22px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <RotateCcw size={18} color="#dc2626" />
                </div>
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    Confirm Refund
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "14px 16px",
                  marginBottom: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {[
                  { label: "Transaction ID", value: txnId },
                  { label: "Product", value: product },
                  { label: "Amount", value: `₱${total.toLocaleString()}` },
                  { label: "Cashier", value: cashierName },
                  { label: "Payment", value: paymentMethod },
                ].map((f) => (
                  <div
                    key={f.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 16,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        fontWeight: 600,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        flexShrink: 0,
                        paddingTop: 2,
                      }}
                    >
                      {f.label}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: "right",
                        wordBreak: "break-word",
                        maxWidth: "65%",
                        lineHeight: 1.5,
                        color:
                          f.label === "Amount"
                            ? "#dc2626"
                            : f.label === "Transaction ID"
                              ? "#111"
                              : "#1e293b",
                        fontFamily:
                          f.label === "Transaction ID"
                            ? "'Poppins', monospace"
                            : undefined,
                        letterSpacing:
                          f.label === "Transaction ID" ? "0.03em" : undefined,
                      }}
                    >
                      {f.value}
                    </span>
                  </div>
                ))}
              </div>

              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.65,
                }}
              >
                Are you sure you want to refund{" "}
                <strong style={{ color: "#0f172a" }}>
                  ₱{total.toLocaleString()}
                </strong>{" "}
                for <strong style={{ color: "#0f172a" }}>{product}</strong>? The
                order status will be updated to{" "}
                <span style={{ color: "#2563eb", fontWeight: 600 }}>
                  Refunded
                </span>
                .
              </p>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "11px 0",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#64748b",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "'Poppins', sans-serif",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  disabled={loading}
                  style={{
                    flex: 2,
                    padding: "11px 0",
                    borderRadius: 12,
                    border: "none",
                    background: loading ? "#f87171" : "#dc2626",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "'Poppins', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    opacity: loading ? 0.85 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.8,
                          ease: "linear",
                        }}
                        style={{ display: "inline-block" }}
                      >
                        <RotateCcw size={13} />
                      </motion.span>
                      Processing…
                    </>
                  ) : (
                    <>
                      <RotateCcw size={13} /> Confirm Refund
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ logs }: { logs: SaleLog[] }) {
  const completed = logs.filter((l) => l.status === "Completed");
  const pending = logs.filter((l) => l.status === "Pending");
  const cancelled = logs.filter((l) => l.status === "Cancelled");
  const refunded = logs.filter((l) => l.status === "Refunded");

  const stats = [
    {
      label: "Completed Sales",
      value: `₱${completed.reduce((s, l) => s + l.total, 0).toLocaleString()}`,
      sub: `${completed.length} items`,
      color: "#16a34a",
      bg: "#f0fdf4",
      border: "#bbf7d0",
    },
    {
      label: "Pending Orders",
      value: `₱${pending.reduce((s, l) => s + l.total, 0).toLocaleString()}`,
      sub: `${pending.length} items`,
      color: "#d97706",
      bg: "#fffbeb",
      border: "#fde68a",
    },
    {
      label: "Cancelled",
      value: `${cancelled.length} orders`,
      sub: "voided",
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fecaca",
    },
    {
      label: "Refunded",
      value: `₱${refunded.reduce((s, l) => s + l.total, 0).toLocaleString()}`,
      sub: `${refunded.length} orders`,
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe",
    },
  ];

  return (
    <div
      style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}
    >
      {stats.map((s) => (
        <motion.div
          key={s.label}
          whileHover={{ y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          style={{
            flex: 1,
            minWidth: 160,
            background: s.bg,
            border: `1px solid ${s.border}`,
            borderRadius: 14,
            padding: "16px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <p
            style={{
              color: "#94a3b8",
              fontSize: 10,
              fontWeight: 600,
              margin: "0 0 6px",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {s.label}
          </p>
          <p
            style={{
              color: s.color,
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 2px",
            }}
          >
            {s.value}
          </p>
          <p style={{ color: "#94a3b8", fontSize: 11, margin: 0 }}>{s.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log, index }: { log: SaleLog; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.28, ease: "easeOut" }}
    >
      <motion.div
        onClick={() => setOpen(!open)}
        whileHover={{ backgroundColor: "#fafafa" }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 20px",
          cursor: "pointer",
          borderBottom: "1px solid #f1f5f9",
          backgroundColor: "#fff",
          transition: "background 0.15s",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: TYPE_COLOR[log.type],
            flexShrink: 0,
          }}
        />
        <span
          style={{ color: "#94a3b8", fontSize: 12, width: 72, flexShrink: 0 }}
        >
          {log.time}
        </span>
        <span
          style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, flex: 1 }}
        >
          {log.product}
        </span>
        <span
          style={{ color: "#94a3b8", fontSize: 11, width: 80, flexShrink: 0 }}
        >
          {log.paymentMethod}
        </span>
        <span
          style={{
            color: TYPE_COLOR[log.type],
            fontSize: 11,
            fontWeight: 600,
            width: 70,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          {log.type}
        </span>
        <span
          style={{ color: "#94a3b8", fontSize: 12, width: 40, flexShrink: 0 }}
        >
          ×{log.quantity}
        </span>
        <span
          style={{
            color: "#0f172a",
            fontSize: 14,
            fontWeight: 600,
            width: 100,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {log.total === 0 ? "—" : `₱${Math.abs(log.total).toLocaleString()}`}
        </span>
        <span
          style={{
            color: STATUS_COLOR["Completed"],
            fontSize: 11,
            fontWeight: 600,
            width: 80,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          Completed
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            color: "#cbd5e1",
            fontSize: 10,
            width: 16,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          ▼
        </motion.span>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{
              overflow: "hidden",
              background: "#f8fafc",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <div
              style={{
                padding: "14px 20px 14px 42px",
                display: "flex",
                gap: 32,
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              {[
                { label: "Transaction ID", value: log.transactionId },
                { label: "Cashier", value: log.cashierName },
                { label: "Payment Method", value: log.paymentMethod },
                {
                  label: "Unit Price",
                  value: `₱${log.unitPrice.toLocaleString()}`,
                },
                { label: "Quantity", value: `${log.quantity} pcs` },
                { label: "Subtotal", value: `₱${log.total.toLocaleString()}` },
                { label: "Order Status", value: "Completed" },
              ].map((f) => (
                <div key={f.label}>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      margin: "0 0 2px",
                      textTransform: "uppercase",
                    }}
                  >
                    {f.label}
                  </p>
                  <p
                    style={{
                      color:
                        f.label === "Order Status"
                          ? STATUS_COLOR["Completed"]
                          : f.label === "Cashier"
                            ? "#4A1C1C"
                            : f.label === "Transaction ID"
                              ? "#111"
                              : "#334155",
                      fontSize: 13,
                      fontWeight: ["Cashier", "Transaction ID"].includes(
                        f.label,
                      )
                        ? 600
                        : 500,
                      margin: 0,
                      fontFamily:
                        f.label === "Transaction ID"
                          ? "'Poppins', monospace"
                          : undefined,
                      letterSpacing:
                        f.label === "Transaction ID" ? "0.03em" : undefined,
                    }}
                  >
                    {f.value}
                  </p>
                </div>
              ))}
              {log.note && (
                <div>
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      margin: "0 0 2px",
                      textTransform: "uppercase",
                    }}
                  >
                    Note
                  </p>
                  <p
                    style={{
                      color: "#d97706",
                      fontSize: 13,
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    ⚠ {log.note}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ padding: 60, textAlign: "center", color: "#cbd5e1" }}
    >
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: "0 0 6px",
          color: "#94a3b8",
        }}
      >
        No completed transactions yet
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>{message}</p>
    </motion.div>
  );
}

// ─── Log Pagination ────────────────────────────────────────────────────────────

interface LogPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function LogPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: LogPaginationProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(
      (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1,
    )
    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 px-1">
      <span className="text-sm text-gray-500">
        Showing {start}–{end} of {totalCount} sales
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageNumbers.map((p, idx) =>
          p === "..." ? (
            <span key={`e-${idx}`} className="text-gray-400 text-sm px-1">
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={currentPage === p ? "default" : "outline"}
              size="icon"
              className={`h-8 w-8 rounded-lg text-sm ${currentPage === p ? "bg-[#4A1C1C] hover:bg-[#3a1515] text-white border-0" : ""}`}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Order Row ─────────────────────────────────────────────────────────────────

const statusStyle: Record<string, { bg: string; text: string }> = {
  Completed: { bg: "#f0fdf4", text: "#16a34a" },
  Pending: { bg: "#fffbeb", text: "#d97706" },
  Cancelled: { bg: "#fef2f2", text: "#dc2626" },
  Refunded: { bg: "#eff6ff", text: "#2563eb" },
};

const orderTypeStyle: Record<string, { bg: string; text: string }> = {
  "take-out": { bg: "#fffbeb", text: "#d97706" },
  delivery: { bg: "#eff6ff", text: "#2563eb" },
  "dine-in": { bg: "#fff1f2", text: "#e11d48" },
};

function OrderRow({
  order,
  index,
  onRefund,
}: {
  order: Order;
  index: number;
  onRefund: (order: Order) => void;
}) {
  const [open, setOpen] = useState(false);

  const sc = statusStyle[order.status] ?? { bg: "#f1f5f9", text: "#64748b" };
  const otb = orderTypeStyle[order.orderType] ?? {
    bg: "#f1f5f9",
    text: "#64748b",
  };

  const fmtDate = (v?: string | null) => {
    const d = parseDateSafe(v);
    return d
      ? d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";
  };
  const fmtTime = (v?: string | null) => {
    const d = parseDateSafe(v);
    return d
      ? d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "—";
  };

  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  const canRefund = order.status === "Completed";
  const isDelivery = order.orderType === "delivery";

  const orderTypeLabel =
    order.orderType === "dine-in"
      ? "Dine In"
      : order.orderType === "take-out"
        ? "Take Out"
        : order.orderType || "—";

  return (
    <>
      <TableRow
        className="border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell className="font-medium text-gray-900">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="text-gray-400"
            >
              <ChevronDown size={14} />
            </motion.div>
            <span
              style={{
                fontFamily: "'Poppins', monospace",
                letterSpacing: "0.02em",
              }}
            >
              {order.transactionId}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-gray-600 whitespace-nowrap">
          {fmtDate(order.date)}
        </TableCell>
        <TableCell className="text-gray-800 font-semibold whitespace-nowrap">
          {fmtTime(order.date)}
        </TableCell>
        <TableCell>
          <span
            style={{
              background: otb.bg,
              color: otb.text,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 99,
            }}
          >
            {orderTypeLabel}
          </span>
        </TableCell>
        <TableCell>
          <span
            style={{
              background: sc.bg,
              color: sc.text,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 99,
            }}
          >
            {order.status}
          </span>
        </TableCell>
        <TableCell className="text-blue-600 font-medium capitalize">
          {order.paymentCategory}
        </TableCell>
        <TableCell className="font-semibold text-gray-900 text-right">
          ₱{order.total.toLocaleString()}
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {open && (
          <tr>
            <td colSpan={7} style={{ padding: 0, border: "none" }}>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                <div
                  style={{
                    background: "#f8fafc",
                    borderBottom: "2px solid #e2e8f0",
                    padding: "20px 24px 20px 36px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      marginBottom: 16,
                    }}
                  >
                    {[
                      { label: "Transaction ID", value: order.transactionId },
                      { label: "Date", value: fmtDate(order.date) },
                      { label: "Time", value: fmtTime(order.date) },
                      { label: "Cashier", value: order.cashierName || "—" },
                      ...(isDelivery
                        ? [
                            { label: "Rider", value: order.riderName || "—" },
                            {
                              label: "Handover",
                              value:
                                fmtTime(order.handoverTimestamp) === "—"
                                  ? "—"
                                  : `${fmtDate(order.handoverTimestamp)} ${fmtTime(order.handoverTimestamp)}`,
                            },
                          ]
                        : []),
                      { label: "Total Qty", value: `${totalQty} pcs` },
                      {
                        label: "Subtotal",
                        value: `₱${order.total.toLocaleString()}`,
                      },
                      { label: "Payment", value: order.paymentCategory },
                      {
                        label: "Order Status",
                        value: order.status,
                        isStatus: true,
                      },
                    ].map((f, i, arr) => (
                      <div
                        key={f.label}
                        style={{
                          minWidth: 130,
                          flex: "0 0 auto",
                          paddingRight: 32,
                          paddingBottom: 12,
                          borderRight:
                            i < arr.length - 1 ? "1px solid #e2e8f0" : "none",
                          marginRight: i < arr.length - 1 ? 32 : 0,
                        }}
                      >
                        <p
                          style={{
                            color: "#94a3b8",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: 1.2,
                            margin: "0 0 4px",
                            textTransform: "uppercase",
                          }}
                        >
                          {f.label}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            fontWeight: [
                              "Cashier",
                              "Subtotal",
                              "Transaction ID",
                            ].includes(f.label)
                              ? 700
                              : 500,
                            color: (f as any).isStatus
                              ? (statusStyle[order.status]?.text ?? "#64748b")
                              : f.label === "Subtotal"
                                ? "#0f172a"
                                : f.label === "Cashier"
                                  ? "#4A1C1C"
                                  : f.label === "Transaction ID"
                                    ? "#111"
                                    : "#334155",
                            fontFamily:
                              f.label === "Transaction ID"
                                ? "'Poppins', monospace"
                                : undefined,
                            letterSpacing:
                              f.label === "Transaction ID"
                                ? "0.03em"
                                : undefined,
                          }}
                        >
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: canRefund ? 16 : 0 }}>
                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 1.2,
                        margin: "0 0 8px",
                        textTransform: "uppercase",
                      }}
                    >
                      Items Ordered
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {order.items.length > 0 ? (
                        order.items.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: "#fff",
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontWeight: 500,
                              color: "#334155",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                background: "#f1f5f9",
                                borderRadius: 4,
                                padding: "1px 6px",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#64748b",
                              }}
                            >
                              ×{item.quantity}
                            </span>
                            {item.name}
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>
                              ₱{item.price.toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: 12 }}>
                          No items
                        </span>
                      )}
                    </div>
                  </div>

                  {canRefund && (
                    <motion.button
                      whileHover={{
                        scale: 1.02,
                        boxShadow: "0 4px 16px rgba(220,38,38,0.18)",
                      }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRefund(order);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 18px",
                        borderRadius: 10,
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#dc2626",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      <RotateCcw size={13} /> Refund Order
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Orders Tab ────────────────────────────────────────────────────────────────

const ORDER_STATUS_FILTERS: OrderStatusFilter[] = [
  "All",
  "Completed",
  "Pending",
  "Cancelled",
  "Refunded",
];

const statusActiveColor: Record<OrderStatusFilter, string> = {
  All: "bg-[#0f172a] text-white border-[#0f172a]",
  Completed: "bg-green-700 text-white border-green-700",
  Pending: "bg-yellow-600 text-white border-yellow-600",
  Cancelled: "bg-red-600 text-white border-red-600",
  Refunded: "bg-blue-600 text-white border-blue-600",
};

function OrdersTab({
  orders,
  onRefund,
}: {
  orders: Order[];
  onRefund: (order: Order) => void;
}) {
  const now = new Date();
  const [currentPage, setCurrentPage] = useState(1);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [activeQuick, setActiveQuick] = useState<QuickKey | null>("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("All");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"from" | "to">("from");
  const [pickerInitial, setPickerInitial] = useState<Date>(now);

  function openDatePicker(target: "from" | "to") {
    setPickerTarget(target);
    setPickerInitial(target === "from" ? (fromDate ?? now) : (toDate ?? now));
    setPickerOpen(true);
  }

  function handlePickerApply(date: Date) {
    if (pickerTarget === "from") {
      setFromDate(date);
      if (toDate && date > toDate) setToDate(date);
    } else {
      setToDate(date);
      if (fromDate && date < fromDate) setToDate(fromDate);
    }
    setActiveQuick(null);
    setCurrentPage(1);
    setPickerOpen(false);
  }

  function clearRange() {
    setFromDate(null);
    setToDate(null);
    setActiveQuick("all");
    setCurrentPage(1);
  }

  function applyQuick(key: QuickKey) {
    setActiveQuick(key);
    if (key === "all") {
      setFromDate(null);
      setToDate(null);
    } else {
      const range = getQuickRange(key)!;
      setFromDate(range.from);
      setToDate(range.to);
    }
    setCurrentPage(1);
  }

  const dateFiltered = filterOrdersByRange(orders, fromDate, toDate);
  const filtered =
    statusFilter === "All"
      ? dateFiltered
      : dateFiltered.filter((o) => o.status === statusFilter);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ORDER_PAGE_SIZE));

  const sorted = [...filtered].sort(
    (a, b) =>
      (parseDateSafe(b.date)?.getTime() ?? -Infinity) -
      (parseDateSafe(a.date)?.getTime() ?? -Infinity),
  );
  const paginated = sorted.slice(
    (currentPage - 1) * ORDER_PAGE_SIZE,
    currentPage * ORDER_PAGE_SIZE,
  );

  const totalRevenue = filtered.reduce((sum, o) => sum + o.total, 0);
  const completedCount = filtered.filter(
    (o) => o.status === "Completed",
  ).length;
  const hasRange = !!(fromDate || toDate);

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(
      (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1,
    )
    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  return (
    <>
      <DrumDatePicker
        open={pickerOpen}
        title={pickerTarget === "from" ? "Select from date" : "Select to date"}
        initial={pickerInitial}
        onApply={handlePickerApply}
        onClose={() => setPickerOpen(false)}
      />

      <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800">
              Order History
            </h3>
            {(hasRange || statusFilter !== "All") && (
              <p className="text-xs text-gray-400 mt-0.5">
                {filtered.length} order{filtered.length !== 1 ? "s" : ""} ·{" "}
                <span className="text-green-600 font-medium">
                  {completedCount} completed
                </span>{" "}
                ·{" "}
                <span className="text-gray-600 font-medium">
                  ₱{totalRevenue.toLocaleString()} revenue
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <button
              onClick={() => openDatePicker("from")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                fromDate
                  ? "border-[#4A1C1C] text-[#4A1C1C] bg-[#4A1C1C]/5"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 bg-white"
              }`}
            >
              {fromDate ? formatDisplayDate(fromDate) : "Select date"}
            </button>
            <span className="text-xs text-gray-400">to</span>
            <button
              onClick={() => openDatePicker("to")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                toDate
                  ? "border-[#4A1C1C] text-[#4A1C1C] bg-[#4A1C1C]/5"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 bg-white"
              }`}
            >
              {toDate ? formatDisplayDate(toDate) : "Select date"}
            </button>
            {hasRange && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-gray-400 hover:text-gray-600"
                onClick={clearRange}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => applyQuick(r.key)}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                activeQuick === r.key
                  ? "bg-[#4A1C1C] text-white border-[#4A1C1C]"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap mb-5">
          {ORDER_STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setCurrentPage(1);
              }}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                statusFilter === s
                  ? statusActiveColor[s]
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 hover:bg-transparent">
              {[
                "Transaction ID",
                "Date",
                "Time",
                "Order Type",
                "Status",
                "Payment",
                "Amount",
              ].map((h) => (
                <TableHead
                  key={h}
                  className={`text-gray-700 font-semibold${h === "Amount" ? " text-right" : ""}`}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-gray-400 py-10"
                >
                  {orders.length === 0
                    ? "No orders yet. Orders will appear here once the cashier processes them."
                    : "No orders found for the selected filters."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((order, i) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  index={i}
                  onRefund={onRefund}
                />
              ))
            )}
          </TableBody>
        </Table>

        {filtered.length > ORDER_PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Showing {(currentPage - 1) * ORDER_PAGE_SIZE + 1}–
              {Math.min(currentPage * ORDER_PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length} orders
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((p, idx) =>
                p === "..." ? (
                  <span key={`e-${idx}`} className="text-gray-400 text-sm px-1">
                    ...
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={currentPage === p ? "default" : "outline"}
                    size="icon"
                    className={`h-8 w-8 rounded-lg text-sm ${currentPage === p ? "bg-[#4A1C1C] hover:bg-[#3a1515] text-white border-0" : ""}`}
                    onClick={() => setCurrentPage(p as number)}
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SalesReports() {
  const now = new Date();

  // ── Core state ──
  const [logs, setLogs] = useState<SaleLog[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<TabKey>("logs");
  const [search, setSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [period, setPeriod] = useState<Period>("Today");

  // ── Refund state ──
  const [refundLog, setRefundLog] = useState<SaleLog | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);

  // ── Log date filter state ──
  const [logFromDate, setLogFromDate] = useState<Date | null>(null);
  const [logToDate, setLogToDate] = useState<Date | null>(null);
  const [activeLogQuick, setActiveLogQuick] = useState<QuickKey | null>("all");
  const [logPickerOpen, setLogPickerOpen] = useState(false);
  const [logPickerTarget, setLogPickerTarget] = useState<"from" | "to">("from");
  const [logPickerInitial, setLogPickerInitial] = useState<Date>(now);

  // ── Data fetching ──
  const fetchSalesData = useCallback(async () => {
    try {
      const rows = await api.get<RawOrderRow[]>("/orders");
      const { logs: l, orders: o } = processRawRows(rows ?? []);
      setLogs(l);
      setOrders(o);
    } catch (err) {
      console.error("Failed to fetch sales data:", err);
    }
  }, []);

  useEffect(() => {
    fetchSalesData();
    const interval = setInterval(fetchSalesData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSalesData]);

  // Reset log page when search/date filters change
  useEffect(() => {
    setLogPage(1);
  }, [search, logFromDate, logToDate]);

  // ── Log date picker handlers ──
  function openLogDatePicker(target: "from" | "to") {
    setLogPickerTarget(target);
    setLogPickerInitial(
      target === "from" ? (logFromDate ?? now) : (logToDate ?? now),
    );
    setLogPickerOpen(true);
  }

  function handleLogPickerApply(date: Date) {
    if (logPickerTarget === "from") {
      setLogFromDate(date);
      if (logToDate && date > logToDate) setLogToDate(date);
    } else {
      setLogToDate(date);
      if (logFromDate && date < logFromDate) setLogToDate(logFromDate);
    }
    setActiveLogQuick(null);
    setLogPage(1);
    setLogPickerOpen(false);
  }

  function clearLogRange() {
    setLogFromDate(null);
    setLogToDate(null);
    setActiveLogQuick("all");
    setLogPage(1);
  }

  function applyLogQuick(key: QuickKey) {
    setActiveLogQuick(key);
    if (key === "all") {
      setLogFromDate(null);
      setLogToDate(null);
    } else {
      const range = getQuickRange(key)!;
      setLogFromDate(range.from);
      setLogToDate(range.to);
    }
    setLogPage(1);
  }

  // ── Refund handler ──
  async function handleRefundConfirm() {
    const orderId = refundLog?.orderId ?? refundOrder?.id;
    if (orderId == null) return;

    setRefundLoading(true);
    try {
      await api.patch(`/orders/${orderId}`, { status: "Refunded" });
      await fetchSalesData();
    } catch (err) {
      console.error("Refund failed:", err);
    } finally {
      setRefundLoading(false);
      setRefundLog(null);
      setRefundOrder(null);
    }
  }

  // ── Derived log data ──
  const completedLogs = logs.filter((l) => l.status === "Completed");
  const dateFilteredLogs = filterLogsByRange(
    completedLogs,
    logFromDate,
    logToDate,
  );

  const filteredLogs = dateFilteredLogs.filter((l) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      l.transactionId.toLowerCase().includes(q) ||
      l.product.toLowerCase().includes(q) ||
      l.paymentMethod.toLowerCase().includes(q) ||
      l.cashierName.toLowerCase().includes(q)
    );
  });

  const logTotalPages = Math.max(
    1,
    Math.ceil(filteredLogs.length / LOG_PAGE_SIZE),
  );
  const paginatedLogs = filteredLogs.slice(
    (logPage - 1) * LOG_PAGE_SIZE,
    logPage * LOG_PAGE_SIZE,
  );
  const grouped = groupByDate(paginatedLogs);
  const dates = Object.keys(grouped);
  const hasLogRange = !!(logFromDate || logToDate);

  const tabs: {
    key: TabKey;
    label: string;
    count: number;
    icon: React.ReactNode;
  }[] = [
    {
      key: "logs",
      label: "Sales Logs",
      count: completedLogs.length,
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M9 7h6M9 11h6M9 15h4" />
        </svg>
      ),
    },
    {
      key: "orders",
      label: "Order History",
      count: orders.length,
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8v4l2 2" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      <Sidebar />

      <RefundModal
        open={!!(refundLog || refundOrder)}
        log={refundLog}
        order={refundOrder}
        onConfirm={handleRefundConfirm}
        onClose={() => {
          if (!refundLoading) {
            setRefundLog(null);
            setRefundOrder(null);
          }
        }}
        loading={refundLoading}
      />

      <DrumDatePicker
        open={logPickerOpen}
        title={
          logPickerTarget === "from" ? "Select from date" : "Select to date"
        }
        initial={logPickerInitial}
        onApply={handleLogPickerApply}
        onClose={() => setLogPickerOpen(false)}
      />

      <div style={{ padding: "40px 40px 40px 88px" }}>
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
            marginBottom: 28,
          }}
        >
          <div>
            <p
              style={{
                color: "#f97316",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 2,
                margin: "0 0 6px",
              }}
            >
              THE CRUNCH
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: 26,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Sales & Reports
            </h1>
            <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 13 }}>
              Transaction history & audit trail
            </p>
          </div>
          <RevenueDropdown
            period={period}
            setPeriod={setPeriod}
            logs={logs}
            orders={orders}
          />
        </motion.div>

        {/* ── Summary Bar ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <SummaryBar logs={logs} />
        </motion.div>

        {/* ── Tabs ── */}
        <div
          style={{
            display: "inline-flex",
            gap: 4,
            marginBottom: 20,
            background: "#f1f5f9",
            borderRadius: 99,
            padding: 4,
          }}
        >
          {tabs.map(({ key, label, count, icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 14px",
                  borderRadius: 99,
                  border: "none",
                  background: active ? "#fff" : "transparent",
                  cursor: "pointer",
                  fontFamily: "'Poppins', sans-serif",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? "#0f172a" : "#94a3b8",
                  boxShadow: active ? "0 1px 6px rgba(0,0,0,0.10)" : "none",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    color: active ? "#0f172a" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {icon}
                </span>
                {label}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 20,
                    height: 20,
                    padding: "0 6px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    background: active ? "#0f172a" : "#cbd5e1",
                    color: active ? "#fff" : "#64748b",
                    transition: "all 0.2s",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Sales Logs Tab ── */}
        {activeTab === "logs" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.35 }}
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 20,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by transaction ID, product, cashier, or payment method…"
                style={{
                  flex: 1,
                  minWidth: 220,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 99,
                  padding: "10px 18px",
                  fontSize: 13,
                  color: "#1e293b",
                  outline: "none",
                  fontFamily: "'Poppins', sans-serif",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <button
                  onClick={() => openLogDatePicker("from")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: logFromDate
                      ? "1px solid #4A1C1C"
                      : "1px solid #e5e7eb",
                    background: logFromDate ? "rgba(74,28,28,0.05)" : "#fff",
                    color: logFromDate ? "#4A1C1C" : "#6b7280",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  {logFromDate ? formatDisplayDate(logFromDate) : "Select date"}
                </button>
                <span style={{ color: "#9ca3af", fontSize: 12 }}>to</span>
                <button
                  onClick={() => openLogDatePicker("to")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: logToDate
                      ? "1px solid #4A1C1C"
                      : "1px solid #e5e7eb",
                    background: logToDate ? "rgba(74,28,28,0.05)" : "#fff",
                    color: logToDate ? "#4A1C1C" : "#6b7280",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  {logToDate ? formatDisplayDate(logToDate) : "Select date"}
                </button>
                {hasLogRange && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-gray-400 hover:text-gray-600"
                    onClick={clearLogRange}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 99,
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#16a34a",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#16a34a",
                    display: "inline-block",
                  }}
                />
                Showing completed sales only
              </div>
            </motion.div>

            {/* Quick ranges */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              {QUICK_RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => applyLogQuick(r.key)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border:
                      activeLogQuick === r.key
                        ? "1px solid #4A1C1C"
                        : "1px solid #e5e7eb",
                    background:
                      activeLogQuick === r.key ? "#4A1C1C" : "#f9fafb",
                    color: activeLogQuick === r.key ? "#fff" : "#6b7280",
                    cursor: "pointer",
                    fontFamily: "'Poppins', sans-serif",
                    transition: "all 0.2s",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Log list */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.35 }}
              style={{
                background: "#fff",
                borderRadius: 16,
                border: "1px solid #e2e8f0",
                overflow: "hidden",
                boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
              }}
            >
              {/* Column headers */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 20px",
                  borderBottom: "1px solid #f1f5f9",
                  background: "#f8fafc",
                }}
              >
                <div style={{ width: 8, flexShrink: 0 }} />
                {[
                  { label: "TIME", width: 72 },
                  { label: "PRODUCT", flex: 1 },
                  { label: "PAYMENT", width: 80 },
                  { label: "TYPE", width: 70 },
                  { label: "QTY", width: 40 },
                  { label: "AMOUNT", width: 100, align: "right" },
                  { label: "STATUS", width: 80, align: "right" },
                ].map((col) => (
                  <span
                    key={col.label}
                    style={{
                      color: "#94a3b8",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      ...(col.flex
                        ? { flex: col.flex }
                        : { width: col.width, flexShrink: 0 }),
                      ...(col.align ? { textAlign: col.align as any } : {}),
                    }}
                  >
                    {col.label}
                  </span>
                ))}
                <div style={{ width: 16, flexShrink: 0 }} />
              </div>

              <AnimatePresence>
                {dates.length === 0 ? (
                  <EmptyState
                    key="empty"
                    message={
                      search || hasLogRange
                        ? "No completed sales found for the selected filters."
                        : "Completed orders from the cashier view will appear here automatically."
                    }
                  />
                ) : (
                  dates.map((date) => {
                    const entries = grouped[date];
                    const dayRevenue = entries.reduce((s, l) => s + l.total, 0);
                    return (
                      <div key={date}>
                        <div
                          style={{
                            padding: "8px 20px",
                            background: "#f8fafc",
                            borderBottom: "1px solid #f1f5f9",
                            borderTop: "1px solid #f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            style={{
                              color: "#64748b",
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: 0.5,
                            }}
                          >
                            {date}
                          </span>
                          <span style={{ color: "#cbd5e1", fontSize: 11 }}>
                            {entries.length} records · ₱
                            {dayRevenue.toLocaleString()} revenue
                          </span>
                        </div>
                        {entries.map((log, i) => (
                          <LogRow key={log.transactionId} log={log} index={i} />
                        ))}
                      </div>
                    );
                  })
                )}
              </AnimatePresence>

              {filteredLogs.length > LOG_PAGE_SIZE && (
                <div style={{ padding: "0 16px 16px" }}>
                  <LogPagination
                    currentPage={logPage}
                    totalPages={logTotalPages}
                    totalCount={filteredLogs.length}
                    pageSize={LOG_PAGE_SIZE}
                    onPageChange={(p) => {
                      setLogPage(p);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </div>
              )}
            </motion.div>

            <p
              style={{
                color: "#cbd5e1",
                fontSize: 11,
                textAlign: "center",
                marginTop: 20,
                fontWeight: 500,
              }}
            >
              {filteredLogs.length} of {completedLogs.length} completed sales
              {(search || hasLogRange) && " matching your filters"}
            </p>
          </>
        )}

        {/* ── Orders Tab ── */}
        {activeTab === "orders" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <OrdersTab
              orders={orders}
              onRefund={(order) => setRefundOrder(order)}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
