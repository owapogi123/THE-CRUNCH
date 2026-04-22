import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, ChevronDown, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: number;
  orderNumber: string;
  items: OrderItem[];
  total: number;
  date: string;
  time: string;
  orderType: string;
  status: string;
  paymentCategory: string;
}

interface RawOrderRow {
  id: number;
  total: number | string;
  date?: string;
  status?: string;
  paymentMethod?: string;
  payment_method?: string;
  orderType?: string;
  order_type?: string;
  productId?: number;
  productName?: string;
  price?: number;
  quantity?: number;
}

type SalesReportPeriod = "daily" | "weekly" | "monthly" | "yearly";

// Sub-options per period — each has a key, a label, and a function that returns [start, end]
interface PeriodOption {
  key: string;
  label: string;
  getRange: () => { start: Date; end: Date };
}

function startOfDay(d: Date) { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23,59,59,999); return r; }

function getPeriodOptions(period: SalesReportPeriod): PeriodOption[] {
  const now = new Date();
  if (period === "daily") {
    return [
      { key: "today",     label: "Today",       getRange: () => ({ start: startOfDay(now), end: endOfDay(now) }) },
      { key: "yesterday", label: "Yesterday",   getRange: () => { const d = new Date(now); d.setDate(d.getDate()-1); return { start: startOfDay(d), end: endOfDay(d) }; } },
      { key: "2daysago",  label: "2 days ago",  getRange: () => { const d = new Date(now); d.setDate(d.getDate()-2); return { start: startOfDay(d), end: endOfDay(d) }; } },
      { key: "3daysago",  label: "3 days ago",  getRange: () => { const d = new Date(now); d.setDate(d.getDate()-3); return { start: startOfDay(d), end: endOfDay(d) }; } },
      { key: "4daysago",  label: "4 days ago",  getRange: () => { const d = new Date(now); d.setDate(d.getDate()-4); return { start: startOfDay(d), end: endOfDay(d) }; } },
    ];
  }
  if (period === "weekly") {
    // "This week" = Mon–today of current calendar week
    const dayOfWeek = now.getDay(); // 0=Sun
    const diffToMon = (dayOfWeek + 6) % 7;
    const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - diffToMon);
    const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate() - 1);
    const twoWeeksAgoMon = new Date(lastMonday); twoWeeksAgoMon.setDate(lastMonday.getDate() - 7);
    const twoWeeksAgoSun = new Date(lastMonday); twoWeeksAgoSun.setDate(lastMonday.getDate() - 1);
    return [
      { key: "thisweek", label: "This week",       getRange: () => ({ start: startOfDay(thisMonday), end: endOfDay(now) }) },
      { key: "lastweek", label: "Last week",       getRange: () => ({ start: startOfDay(lastMonday), end: endOfDay(lastSunday) }) },
      { key: "last7",    label: "Last 7 days",     getRange: () => { const d = new Date(now); d.setDate(d.getDate()-6); return { start: startOfDay(d), end: endOfDay(now) }; } },
      { key: "2weeksago",label: "2 weeks ago",     getRange: () => ({ start: startOfDay(twoWeeksAgoMon), end: endOfDay(twoWeeksAgoSun) }) },
    ];
  }
  if (period === "monthly") {
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
    const twoMonthsStart = new Date(now.getFullYear(), now.getMonth()-2, 1);
    const twoMonthsEnd   = new Date(now.getFullYear(), now.getMonth()-1, 0);
    const last30Start    = new Date(now); last30Start.setDate(now.getDate()-29);
    return [
      { key: "thismonth",  label: "This month",    getRange: () => ({ start: startOfDay(thisMonthStart), end: endOfDay(now) }) },
      { key: "lastmonth",  label: "Last month",    getRange: () => ({ start: startOfDay(lastMonthStart), end: endOfDay(lastMonthEnd) }) },
      { key: "last30",     label: "Last 30 days",  getRange: () => ({ start: startOfDay(last30Start), end: endOfDay(now) }) },
      { key: "2monthsago", label: "2 months ago",  getRange: () => ({ start: startOfDay(twoMonthsStart), end: endOfDay(twoMonthsEnd) }) },
    ];
  }
  // yearly
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear()-1, 0, 1);
  const lastYearEnd   = new Date(now.getFullYear()-1, 11, 31);
  return [
    { key: "thisyear", label: "This year",    getRange: () => ({ start: startOfDay(thisYearStart), end: endOfDay(now) }) },
    { key: "lastyear", label: "Last year",    getRange: () => ({ start: startOfDay(lastYearStart), end: endOfDay(lastYearEnd) }) },
  ];
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

interface HeatmapCell {
  day: string;
  hour: string;
  count: number;
}

interface TopItem {
  name: string;
  count: number;
}

interface OrderTypeBreakdown {
  type: string;
  count: number;
  pct: number;
}

interface PaymentBreakdown {
  category: string;
  count: number;
  pct: number;
}

interface WeeklySalesPoint {
  day: string;
  thisWeek: number;
  lastWeek: number;
}

interface DateRange {
  start: Date | null;
  end: Date | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKEND_NAMES = ["Sat", "Sun"];

const WEEKDAY_SLOTS = ["10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"];
const WEEKDAY_SLOT_RANGES: [number, number][] = [
  [10, 12], [12, 14], [14, 16], [16, 18], [18, 20], [20, 22], [22, 24],
];
const WEEKEND_SLOTS = ["11:30am", "1:30pm", "3:30pm", "5:30pm", "7:30pm"];
const WEEKEND_SLOT_RANGES: [number, number][] = [
  [11.5, 13.5], [13.5, 15.5], [15.5, 17.5], [17.5, 19.5], [19.5, 20.5],
];

const ALL_HOUR_SLOTS = [
  "10am", "11:30am", "12pm", "1:30pm", "2pm", "3:30pm",
  "4pm", "5:30pm", "6pm", "7:30pm", "8pm", "10pm",
];

const PAYMENT_COLORS: Record<string, string> = {
  GCash: "#2D5F9E",
  Cash: "#7C2D2D",
  Maya: "#1B7A5A",
  "Credit Card": "#B85E1A",
  Others: "#888680",
};

const ORDER_TYPE_COLORS = ["#7C2D2D", "#A84040", "#C46060", "#DDA0A0", "#EEC8C8"];

const PERIOD_LABELS: { label: string; value: SalesReportPeriod }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

const MONTH_NAMES = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
const SHORT_MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_HEADERS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatDateShort(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function filterOrdersByReportPeriod(orders: Order[], activeRange: { start: Date; end: Date } | null, dateRange?: DateRange): Order[] {
  if (dateRange?.start && dateRange?.end) {
    const start = new Date(dateRange.start); start.setHours(0,0,0,0);
    const end   = new Date(dateRange.end);   end.setHours(23,59,59,999);
    return orders.filter((o) => { if (!o.date) return false; const d = new Date(o.date); return d >= start && d <= end; });
  }
  if (activeRange) {
    return orders.filter((o) => { if (!o.date) return false; const d = new Date(o.date); return d >= activeRange.start && d <= activeRange.end; });
  }
  return orders;
}

function filterOrdersByPreviousPeriod(orders: Order[], period: SalesReportPeriod): Order[] {
  const now = new Date();
  return orders.filter((o) => {
    if (!o.date) return false;
    const d = new Date(o.date);
    if (period === "daily") {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return d.toDateString() === yesterday.toDateString();
    }
    if (period === "weekly") {
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(now.getDate() - 14);
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      return d >= twoWeeksAgo && d < oneWeekAgo;
    }
    if (period === "monthly") {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
    }
    if (period === "yearly") return d.getFullYear() === now.getFullYear() - 1;
    return false;
  });
}

function computeTopItems(orders: Order[]): TopItem[] {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      counts[item.name] = (counts[item.name] ?? 0) + item.quantity;
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function computeOrderTypes(orders: Order[]): OrderTypeBreakdown[] {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    const t = order.orderType || "Unknown";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const total = orders.length || 1;
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function computePaymentBreakdown(orders: Order[]): PaymentBreakdown[] {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    const cat = order.paymentCategory || "Others";
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  const total = orders.length || 1;
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function computeHeatmap(orders: Order[]): HeatmapCell[] {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    if (!order.date) continue;
    const d = new Date(order.date);
    const dayName = DAYS_OF_WEEK[d.getDay()];
    const isWeekend = WEEKEND_NAMES.includes(dayName);
    const h = d.getHours() + d.getMinutes() / 60;
    if (isWeekend) {
      const slotIndex = WEEKEND_SLOT_RANGES.findIndex(([start, end]) => h >= start && h < end);
      if (slotIndex === -1) continue;
      const key = `${dayName}__${WEEKEND_SLOTS[slotIndex]}`;
      counts[key] = (counts[key] ?? 0) + 1;
    } else {
      const slotIndex = WEEKDAY_SLOT_RANGES.findIndex(([start, end]) => h >= start && h < end);
      if (slotIndex === -1) continue;
      const key = `${dayName}__${WEEKDAY_SLOTS[slotIndex]}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  const cells: HeatmapCell[] = [];
  for (const day of DAYS_OF_WEEK) {
    const isWeekend = WEEKEND_NAMES.includes(day);
    const slots = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
    for (const hour of ALL_HOUR_SLOTS) {
      const isOpen = slots.includes(hour);
      cells.push({ day, hour, count: isOpen ? (counts[`${day}__${hour}`] ?? 0) : -1 });
    }
  }
  return cells;
}

function computeChartData(
  currentOrders: Order[], previousOrders: Order[],
  period: SalesReportPeriod, salesView: "sales" | "orders"
): WeeklySalesPoint[] {
  const getValue = (orders: Order[], key: string) => {
    const filtered = orders.filter((o) => {
      const d = new Date(o.date);
      if (period === "daily") return d.getHours().toString() === key;
      if (period === "weekly") return DAYS_OF_WEEK[d.getDay()] === key;
      if (period === "monthly") return d.getDate().toString() === key;
      if (period === "yearly") return d.getMonth().toString() === key;
      return false;
    });
    return salesView === "sales"
      ? filtered.reduce((s, o) => s + o.total, 0)
      : filtered.length;
  };

  if (period === "daily") {
    const hours = ["9","10","11","12","13","14","15","16","17","18","19","20","21"];
    return hours.map((h) => ({
      day: `${parseInt(h) > 12 ? parseInt(h) - 12 : h}${parseInt(h) >= 12 ? "pm" : "am"}`,
      thisWeek: getValue(currentOrders, h),
      lastWeek: getValue(previousOrders, h),
    }));
  }
  if (period === "weekly") {
    return DAYS_OF_WEEK.map((day) => ({
      day, thisWeek: getValue(currentOrders, day), lastWeek: getValue(previousOrders, day),
    }));
  }
  if (period === "monthly") {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: String(i + 1),
      thisWeek: getValue(currentOrders, String(i + 1)),
      lastWeek: getValue(previousOrders, String(i + 1)),
    }));
  }
  return SHORT_MONTH_NAMES.map((m, i) => ({
    day: m, thisWeek: getValue(currentOrders, String(i)), lastWeek: getValue(previousOrders, String(i)),
  }));
}

// ─── Date Range Picker ────────────────────────────────────────────────────────

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<Date | null>(null);
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label = value.start && value.end
    ? `${formatDateShort(value.start)} ~ ${formatDateShort(value.end)}`
    : value.start
    ? `${formatDateShort(value.start)} ~ ...`
    : "Select date range";

  const hasValue = !!(value.start || value.end);

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
  }

  function handleDayClick(day: Date) {
    if (selecting === "start") {
      onChange({ start: day, end: null });
      setSelecting("end");
    } else {
      if (value.start && day < value.start) {
        onChange({ start: day, end: value.start });
      } else {
        onChange({ start: value.start, end: day });
      }
      setSelecting("start");
      setOpen(false);
    }
  }

  function isInRange(day: Date): boolean {
    const start = value.start;
    const end = value.end ?? (selecting === "end" ? hovered : null);
    if (!start || !end) return false;
    const [a, b] = start <= end ? [start, end] : [end, start];
    return day > a && day < b;
  }

  function isStart(day: Date) { return value.start ? sameDay(day, value.start) : false; }
  function isEnd(day: Date) {
    const end = value.end ?? (selecting === "end" ? hovered : null);
    return end ? sameDay(day, end) : false;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function clearRange(e: React.MouseEvent) {
    e.stopPropagation();
    onChange({ start: null, end: null });
    setSelecting("start");
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  return (
    <div ref={ref} style={{ position: "relative", fontFamily: "'Poppins', sans-serif" }}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#FFFFFF",
          border: "1.5px solid #E8E0DC",
          borderRadius: "12px",
          padding: "8px 14px",
          cursor: "pointer",
          minWidth: "220px",
          transition: "all 0.2s ease",
          boxShadow: open ? "0 0 0 3px rgba(124,45,45,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
          outline: "none",
        }}
      >
        <Calendar size={15} color="#9B8E8E" strokeWidth={2} />
        <span style={{
          fontSize: "12px",
          color: hasValue ? "#4A1C1C" : "#B0A8A4",
          fontWeight: hasValue ? 500 : 400,
          flex: 1,
          textAlign: "left",
          letterSpacing: "0.01em",
        }}>
          {label}
        </span>
        {hasValue && (
          <span
            onClick={clearRange}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "16px", height: "16px", borderRadius: "50%",
              background: "#F0EBE6", cursor: "pointer",
            }}
          >
            <X size={10} color="#9B8E8E" />
          </span>
        )}
      </button>

      {/* Calendar Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          zIndex: 100,
          background: "#FFFFFF",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(74,28,28,0.12), 0 2px 8px rgba(0,0,0,0.06)",
          padding: "20px",
          width: "300px",
          border: "1px solid #F0EBE6",
        }}>
          {/* Month Navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <button onClick={prevMonth} style={{
              background: "#F5F0ED", border: "none", borderRadius: "8px",
              width: "30px", height: "30px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ChevronLeft size={14} color="#7C2D2D" />
            </button>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#4A1C1C", fontFamily: "'Poppins', sans-serif" }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={{
              background: "#F5F0ED", border: "none", borderRadius: "8px",
              width: "30px", height: "30px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ChevronRight size={14} color="#7C2D2D" />
            </button>
          </div>

          {/* Day Headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
            {DAY_HEADERS.map(d => (
              <div key={d} style={{
                textAlign: "center", fontSize: "10px", fontWeight: 600,
                color: "#B0A8A4", padding: "4px 0", fontFamily: "'Poppins', sans-serif",
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDay + 1;
              if (dayNum < 1 || dayNum > daysInMonth) {
                return <div key={i} />;
              }
              const day = new Date(viewYear, viewMonth, dayNum);
              const isS = isStart(day);
              const isE = isEnd(day);
              const inRange = isInRange(day);
              const isEndpoint = isS || isE;

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    height: "34px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: isEndpoint ? 600 : 400,
                    color: isEndpoint ? "#FFFFFF" : inRange ? "#7C2D2D" : "#4A1C1C",
                    background: isEndpoint ? "#7C2D2D" : inRange ? "#F5E8E8" : "transparent",
                    borderRadius: isEndpoint ? "8px" : inRange ? "0px" : "6px",
                    transition: "all 0.15s ease",
                    outline: "none",
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div style={{
            marginTop: "14px",
            paddingTop: "12px",
            borderTop: "1px solid #F0EBE6",
            fontSize: "11px",
            color: "#B0A8A4",
            textAlign: "center",
            fontFamily: "'Poppins', sans-serif",
          }}>
            {selecting === "start" ? "Click to set start date" : "Click to set end date"}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Period Dropdown ──────────────────────────────────────────────────────────

interface PeriodDropdownProps {
  selectedPeriod: SalesReportPeriod;
  selectedSubKey: string;
  onSelect: (period: SalesReportPeriod, subKey: string) => void;
  disabled?: boolean;
}

function PeriodDropdown({ selectedPeriod, selectedSubKey, onSelect, disabled }: PeriodDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allOptions = getPeriodOptions(selectedPeriod);
  const activeOpt  = allOptions.find((o) => o.key === selectedSubKey) ?? allOptions[0];
  const activeRange = activeOpt.getRange();
  const rangeLabel  = activeRange.start.toDateString() === activeRange.end.toDateString()
    ? formatDisplayDate(activeRange.start)
    : `${formatDisplayDate(activeRange.start)} – ${formatDisplayDate(activeRange.end)}`;

  const triggerLabel = `${PERIOD_LABELS.find(p => p.value === selectedPeriod)?.label} · ${activeOpt.label}`;

  return (
    <div ref={ref} style={{ position: "relative", fontFamily: "'Poppins', sans-serif" }}>
      {/* Trigger */}
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "#FFFFFF", border: "1.5px solid #E8E0DC",
          borderRadius: "12px", padding: "8px 14px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          minWidth: "220px", outline: "none",
          boxShadow: open ? "0 0 0 3px rgba(124,45,45,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
          transition: "all 0.2s ease",
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#4A1C1C", display: "block", lineHeight: 1.3 }}>
            {triggerLabel}
          </span>
          <span style={{ fontSize: "10px", color: "#B0A8A4", display: "block", marginTop: "1px" }}>
            {rangeLabel}
          </span>
        </span>
        <ChevronDown
          size={14} color="#9B8E8E"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
          background: "#FFFFFF", borderRadius: "16px", width: "260px",
          boxShadow: "0 8px 32px rgba(74,28,28,0.12), 0 2px 8px rgba(0,0,0,0.06)",
          border: "1px solid #F0EBE6", overflow: "hidden",
        }}>
          {PERIOD_LABELS.map(({ label, value: pval }, pi) => {
            const opts = getPeriodOptions(pval);
            const isActivePeriod = pval === selectedPeriod;
            return (
              <div key={pval}>
                {/* Period group header */}
                <div style={{
                  padding: "10px 16px 6px",
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
                  color: isActivePeriod ? "#7C2D2D" : "#C4B8B8",
                  textTransform: "uppercase",
                  borderTop: pi > 0 ? "1px solid #F5F0ED" : "none",
                  background: isActivePeriod ? "#FDF8F8" : "transparent",
                }}>
                  {label}
                </div>
                {/* Sub-options */}
                {opts.map((opt) => {
                  const r = opt.getRange();
                  const rl = r.start.toDateString() === r.end.toDateString()
                    ? formatDisplayDate(r.start)
                    : `${formatDisplayDate(r.start)} – ${formatDisplayDate(r.end)}`;
                  const isActive = isActivePeriod && opt.key === selectedSubKey;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => { onSelect(pval, opt.key); setOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", padding: "8px 16px",
                        background: isActive ? "#F5E8E8" : "transparent",
                        border: "none", cursor: "pointer",
                        transition: "background 0.15s ease",
                        textAlign: "left",
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#FDF5F5"; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: isActive ? 600 : 400, color: isActive ? "#7C2D2D" : "#4A1C1C" }}>
                        {opt.label}
                      </span>
                      <span style={{ fontSize: "10px", color: isActive ? "#A85050" : "#B0A8A4", marginLeft: "8px", whiteSpace: "nowrap" }}>
                        {rl}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  trend: string;
  up: boolean | null;
}

function KpiCard({ label, value, trend, up }: KpiCardProps) {
  return (
    <Card className="flex-1 bg-white rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
      <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-gray-800 mb-1">{value}</div>
      <div className={`flex items-center gap-1 text-xs font-medium ${
        up === true ? "text-green-600" : up === false ? "text-red-500" : "text-gray-400"
      }`}>
        {up === true && <TrendingUp className="h-3 w-3" />}
        {up === false && <TrendingDown className="h-3 w-3" />}
        <span>{trend}</span>
      </div>
    </Card>
  );
}

interface HeatmapProps {
  cells: HeatmapCell[];
}

function PeakHoursHeatmap({ cells }: HeatmapProps) {
  const openCells = cells.filter((c) => c.count >= 0);
  const maxCount = Math.max(...openCells.map((c) => c.count), 1);

  function getCellColor(count: number): string {
    if (count < 0) return "transparent";
    const t = count / maxCount;
    if (t === 0) return "#F0FAF4";
    const r = Math.round(220 - t * 161);
    const g = Math.round(242 - t * 105);
    const b = Math.round(228 - t * 174);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
        <div />
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-[10px] text-gray-400 pb-1">{d}</div>
        ))}
        {ALL_HOUR_SLOTS.map((hour) => (
          <React.Fragment key={`hour-${hour}`}>
            <div className="text-right text-[10px] text-gray-400 pr-1 flex items-center justify-end leading-tight">
              {hour}
            </div>
            {DAYS_OF_WEEK.map((day) => {
              const cell = cells.find((c) => c.day === day && c.hour === hour);
              const count = cell?.count ?? -1;
              const isClosed = count < 0;
              return (
                <div
                  key={`${day}-${hour}`}
                  title={isClosed ? `${day} ${hour}: Closed` : `${day} ${hour}: ${count} orders`}
                  className="rounded h-4 transition-opacity"
                  style={{
                    backgroundColor: getCellColor(count),
                    border: isClosed ? "none" : undefined,
                    cursor: isClosed ? "default" : "pointer",
                    opacity: isClosed ? 0.15 : 1,
                  }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] text-gray-400">Low</span>
        <div className="flex gap-0.5">
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => {
            const r = Math.round(220 - t * 161);
            const g = Math.round(242 - t * 105);
            const b = Math.round(228 - t * 174);
            return (
              <div key={t} className="w-4 h-3 rounded-sm" style={{
                backgroundColor: t === 0 ? "#F0FAF4" : `rgb(${r},${g},${b})`,
              }} />
            );
          })}
        </div>
        <span className="text-[10px] text-gray-400">High</span>
        <span className="ml-3 flex items-center gap-1 text-[10px] text-gray-400">
          <span className="w-4 h-3 rounded-sm inline-block bg-gray-200 opacity-40" /> Closed
        </span>
      </div>
    </div>
  );
}

interface TopItemsProps {
  items: TopItem[];
}

function TopItemsChart({ items }: TopItemsProps) {
  const maxCount = items[0]?.count ?? 1;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={item.name} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 w-4 text-right">{i + 1}</span>
          <span className="text-xs text-gray-600 w-24 truncate">{item.name}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(item.count / maxCount) * 100}%`, backgroundColor: "#7C2D2D" }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">{item.count}</span>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">No items data yet.</p>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<SalesReportPeriod>("daily");
  const [selectedSubKey, setSelectedSubKey] = useState<string>("today");
  const [salesView, setSalesView] = useState<"sales" | "orders">("sales");
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });

  const hasCustomRange = !!(dateRange.start && dateRange.end);

  // Resolve the active sub-option
  const periodOptions = useMemo(() => getPeriodOptions(selectedPeriod), [selectedPeriod]);
  const activeOption  = periodOptions.find((o) => o.key === selectedSubKey) ?? periodOptions[0];
  const activeRange   = activeOption?.getRange() ?? null;

  const filteredOrders = useMemo(
    () => filterOrdersByReportPeriod(orders, activeRange, hasCustomRange ? dateRange : undefined),
    [orders, activeRange, dateRange, hasCustomRange],
  );

  const previousOrders = useMemo(
    () => filterOrdersByPreviousPeriod(orders, selectedPeriod),
    [orders, selectedPeriod],
  );

  const totalOrders = filteredOrders.length;
  const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const activeOrders = filteredOrders.filter(
    (o) => !["Completed", "Cancelled"].includes(o.status),
  ).length;
  const completedOrders = filteredOrders.filter((o) => o.status === "Completed").length;
  const cancelledOrders = filteredOrders.filter((o) => o.status === "Cancelled").length;
  const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : "0.0";
  const cancellationRate = totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) : "0.0";

  const topItems = useMemo(() => computeTopItems(filteredOrders), [filteredOrders]);
  const orderTypes = useMemo(() => computeOrderTypes(filteredOrders), [filteredOrders]);
  const paymentBreakdown = useMemo(() => computePaymentBreakdown(filteredOrders), [filteredOrders]);
  const heatmapCells = useMemo(() => computeHeatmap(filteredOrders), [filteredOrders]);

  const chartData = useMemo(
    () => computeChartData(filteredOrders, previousOrders, selectedPeriod, salesView),
    [filteredOrders, previousOrders, selectedPeriod, salesView],
  );

  const periodLabel = PERIOD_LABELS.find((p) => p.value === selectedPeriod)?.label ?? "";
  const yAxisFormatter = (v: number) =>
    salesView === "sales"
      ? `₱${v >= 1000 ? Math.round(v / 1000) + "k" : v}`
      : String(v);

  useEffect(() => {
    const fetchFromDB = async () => {
      setIsLoadingOrders(true);
      setOrdersError(null);
      try {
        const rows = await api.get<RawOrderRow[]>("/orders");
        if (!rows?.length) { setOrders([]); return; }

        const grouped: Record<number, Order> = {};
        rows.forEach((r) => {
          if (!grouped[r.id]) {
            grouped[r.id] = {
              id: r.id,
              orderNumber: `#${r.id}`,
              items: [],
              total: Number(r.total) || 0,
              date: r.date ? new Date(r.date).toISOString() : "",
              time: r.date ? new Date(r.date).toLocaleTimeString() : "",
              orderType: r.orderType ?? r.order_type ?? "",
              status: r.status ?? "",
              paymentCategory: r.paymentMethod ?? r.payment_method ?? "",
            };
          }
          if (r.productId) {
            grouped[r.id].items.push({
              name: r.productName ?? "",
              price: r.price ?? 0,
              quantity: r.quantity ?? 1,
            });
          }
        });
        setOrders(Object.values(grouped));
      } catch (err) {
        console.error("Failed to fetch orders:", err);
        setOrdersError(err instanceof Error ? err.message : "Failed to load dashboard data.");
        setOrders([]);
      } finally {
        setIsLoadingOrders(false);
      }
    };

    fetchFromDB();
    const interval = setInterval(fetchFromDB, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">
        <div className="bg-[#FDFAF6] rounded-3xl p-8 min-h-[calc(100vh-5rem)]">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
            {/* Brand */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-2xl font-semibold text-[#4A1C1C]">The Crunch</span>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px] max-w-xl">
              <div className="relative">
                <Input
                  type="search"
                  placeholder="Search..."
                  className="w-full bg-white border-2 border-gray-200 text-gray-800 placeholder:text-gray-400 rounded-full pl-6 pr-12 h-12 shadow-sm focus:shadow-md transition-shadow"
                />
                <Button
                  size="icon"
                  className="absolute right-1 top-1 bg-gray-100 hover:bg-gray-200 rounded-full h-10 w-10 transition-all duration-300 hover:scale-105"
                >
                  <Search className="h-5 w-5 text-gray-700" />
                </Button>
              </div>
            </div>

            {/* Right Controls: Period Dropdown + Date Range Picker */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sales Report</span>
              <PeriodDropdown
                selectedPeriod={selectedPeriod}
                selectedSubKey={selectedSubKey}
                onSelect={(period, subKey) => { setSelectedPeriod(period); setSelectedSubKey(subKey); }}
                disabled={hasCustomRange}
              />
              <DateRangePicker value={dateRange} onChange={(r) => setDateRange(r)} />
            </div>
          </div>

          {/* ── Banners ── */}
          {ordersError && (
            <Card className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 shadow-sm">
              <p className="text-sm font-semibold text-red-700">Dashboard data failed to load</p>
              <p className="text-xs text-red-500 mt-1">{ordersError}</p>
            </Card>
          )}

          {!ordersError && !isLoadingOrders && orders.length > 0 && filteredOrders.length === 0 && (
            <Card className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 shadow-sm">
              <p className="text-sm font-semibold text-amber-800">
                No orders match the selected {hasCustomRange ? "date range" : "period"}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {hasCustomRange
                  ? "Try adjusting the date range."
                  : "Try selecting a different period to view sales data."}
              </p>
            </Card>
          )}

          {/* ── KPI Cards ── */}
            <div className="flex gap-4 mb-8">
            <KpiCard label="Total Orders" value={isLoadingOrders ? "..." : totalOrders.toLocaleString()} trend="Live" up={null} />
            <KpiCard label="Total Sales" value={isLoadingOrders ? "..." : `₱${totalSales.toLocaleString()}`} trend="Live" up={null} />
            <KpiCard label="Avg Order Value" value={isLoadingOrders ? "..." : `₱${avgOrderValue.toFixed(2)}`} trend="Per transaction" up={null} />
            <KpiCard label="Active Orders" value={isLoadingOrders ? "..." : activeOrders.toLocaleString()} trend="In progress" up={null} />

          </div>

          {/* ── Charts Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            <div className="lg:col-span-8">
              <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
                <div className="flex items-center justify-between mb-4">
                 <div>
  <h2 className="text-lg font-semibold text-gray-800">Order & Sales Review</h2>
  <p className="text-xs text-gray-400 mt-0.5">
    {hasCustomRange
      ? `${formatDisplayDate(dateRange.start!)} – ${formatDisplayDate(dateRange.end!)}`
      : activeRange
      ? `${formatDisplayDate(activeRange.start)}${activeRange.start.toDateString() !== activeRange.end.toDateString() ? " – " + formatDisplayDate(activeRange.end) : ""}`
      : "—"}
  </p>
              {!isLoadingOrders && (
              <p className="text-sm font-semibold text-[#7C2D2D] mt-2">
                ₱{totalSales.toLocaleString()}{" "}
              <span className="text-xs font-normal text-gray-400">
                as of {formatDisplayDate(new Date())}
              </span>
                </p>
              )}
            </div>
                  <div className="flex gap-0 bg-[#F0EBE6] rounded-xl p-1">
                    {(["sales", "orders"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setSalesView(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-200 ${
                          salesView === v
                            ? "bg-[#7C2D2D] text-white shadow-sm"
                            : "bg-transparent text-[#9B8E8E]"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 mb-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm inline-block bg-[#7C2D2D]" />
                    <span className="text-gray-500">{activeOption?.label ?? periodLabel}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm inline-block bg-gray-300" />
                    <span className="text-gray-500">Previous {periodLabel.toLowerCase()}</span>
                  </span>
                </div>

                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#9B8E8E" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#9B8E8E" }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
                    <Tooltip
                      formatter={(value: number) => [yAxisFormatter(value)]}
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                    />
                    <Line type="monotone" dataKey="thisWeek" stroke="#7C2D2D" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#7C2D2D" }} name={`This ${periodLabel.toLowerCase()}`} />
                    <Line type="monotone" dataKey="lastWeek" stroke="#C8B8B8" strokeWidth={1.5}
                      strokeDasharray="4 3" dot={{ r: 3, fill: "#C8B8B8" }} name={`Previous ${periodLabel.toLowerCase()}`} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="lg:col-span-4">
              <Card className="bg-white rounded-2xl p-6 shadow-md border-0 h-full">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment Methods</h3>
                {paymentBreakdown.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={paymentBreakdown} dataKey="count" nameKey="category"
                          cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                          {paymentBreakdown.map((entry, index) => (
                            <Cell key={entry.category}
                              fill={PAYMENT_COLORS[entry.category] ?? ORDER_TYPE_COLORS[index % ORDER_TYPE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, name: string) => [value, name]}
                          contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2">
                      {paymentBreakdown.map((entry, index) => (
                        <div key={entry.category} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{
                              backgroundColor: PAYMENT_COLORS[entry.category] ?? ORDER_TYPE_COLORS[index % ORDER_TYPE_COLORS.length],
                            }} />
                            <span className="text-gray-600">{entry.category}</span>
                          </div>
                          <span className="font-medium text-gray-800">{entry.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm text-center mt-8">No payment data yet.</p>
                )}
              </Card>
            </div>
          </div>

          {/* ── Bottom Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Peak Hours</h3>
              <PeakHoursHeatmap cells={heatmapCells} />
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Top-Selling Items</h3>
              <TopItemsChart items={topItems} />
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Order Types</h3>
              {orderTypes.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={orderTypes} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#9B8E8E" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: "#9B8E8E" }}
                      axisLine={false} tickLine={false} width={72} />
                    <Tooltip formatter={(value: number) => [`${value}%`, "Share"]}
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {orderTypes.map((entry, index) => (
                        <Cell key={entry.type} fill={ORDER_TYPE_COLORS[index % ORDER_TYPE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-sm text-center mt-8">No order type data yet.</p>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
