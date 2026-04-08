import { useState, useRef, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { useNotifications } from "@/lib/NotificationContext";

const fontLink = document.createElement("link");
fontLink.href =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ─── Types ────────────────────────────────────────────────────────────────────

type Status  = "Completed" | "Pending" | "Cancelled" | "Refunded";
type LogType = "Sale" | "Refund" | "Void" | "Adjustment";
type Period  = "Today" | "Last 7 Days" | "Last 30 Days" | "All Time";
type TabKey  = "logs" | "orders";

interface SaleLog {
  id: string;
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
  note?: string;
  _dateObj: Date;
}

interface Order {
  id: number;
  orderNumber: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  date: string;
  time: string;
  orderType: string;
  status: string;
  paymentCategory: string;
  riderPickupTime?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDER_PAGE_SIZE = 10;
const ITEM_H          = 36;
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
] as const;
const YEAR_OFFSET = 2;

const QUICK_RANGES = [
  { label: "Today",        key: "today"     },
  { label: "Yesterday",    key: "yesterday" },
  { label: "This week",    key: "week"      },
  { label: "This month",   key: "month"     },
  { label: "Last 7 days",  key: "last7"     },
  { label: "Last 30 days", key: "last30"    },
  { label: "All time",     key: "all"       },
] as const;

type QuickKey = typeof QUICK_RANGES[number]["key"];

const statusColor: Record<Status, string> = {
  Completed: "#16a34a",
  Pending:   "#d97706",
  Cancelled: "#dc2626",
  Refunded:  "#2563eb",
};

const typeColor: Record<LogType, string> = {
  Sale:       "#f97316",
  Refund:     "#3b82f6",
  Void:       "#9ca3af",
  Adjustment: "#8b5cf6",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

function getQuickRange(key: QuickKey): { from: Date; to: Date } | null {
  if (key === "all") return null;
  const now = new Date();
  const f   = new Date(now);
  const t   = new Date(now);

  if (key === "today") {
    f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "yesterday") {
    f.setDate(now.getDate() - 1); f.setHours(0, 0, 0, 0);
    t.setDate(now.getDate() - 1); t.setHours(23, 59, 59, 999);
  } else if (key === "week") {
    f.setDate(now.getDate() - now.getDay()); f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "month") {
    f.setDate(1); f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "last7") {
    f.setDate(now.getDate() - 6); f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  } else if (key === "last30") {
    f.setDate(now.getDate() - 29); f.setHours(0, 0, 0, 0);
    t.setHours(23, 59, 59, 999);
  }

  return { from: f, to: t };
}

function filterOrdersByRange(
  orders: Order[],
  from: Date | null,
  to:   Date | null
): Order[] {
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const d = new Date(o.date);
    d.setHours(0, 0, 0, 0);
    if (from) { const f = new Date(from); f.setHours(0,0,0,0); if (d < f) return false; }
    if (to)   { const t = new Date(to);   t.setHours(0,0,0,0); if (d > t) return false; }
    return true;
  });
}

function groupByDate(logs: SaleLog[]): Record<string, SaleLog[]> {
  const g: Record<string, SaleLog[]> = {};
  logs.forEach((l) => {
    if (!g[l.date]) g[l.date] = [];
    g[l.date].push(l);
  });
  return g;
}

function getRevenueForPeriod(logs: SaleLog[], period: Period): number {
  const now   = new Date();
  const start = new Date(now);

  if      (period === "Today")        { start.setHours(0, 0, 0, 0); }
  else if (period === "Last 7 Days")  { start.setDate(now.getDate() - 6);  start.setHours(0, 0, 0, 0); }
  else if (period === "Last 30 Days") { start.setDate(now.getDate() - 29); start.setHours(0, 0, 0, 0); }

  return logs
    .filter((l) => {
      if (l.status === "Cancelled" || l.status === "Refunded") return false;
      if (period === "All Time") return true;
      return l._dateObj >= start && l._dateObj <= now;
    })
    .reduce((sum, l) => sum + l.total, 0);
}

// ─── Drum Column ─────────────────────────────────────────────────────────────

interface DrumColProps {
  label: string;
  items: (string | number)[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

function DrumCol({ label, items, selectedIndex, onChange }: DrumColProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    curY:      -selectedIndex * ITEM_H,
    targetIdx: selectedIndex,
    vel:       0,
    startY:    0,
    startCurY: 0,
    dragging:  false,
    lastY:     0,
    lastT:     0,
  });

  function clampIdx(i: number) {
    return Math.max(0, Math.min(items.length - 1, Math.round(i)));
  }

  function updateItems(idx: number) {
    if (!innerRef.current) return;
    Array.from(innerRef.current.children).forEach((el, i) => {
      const div = el as HTMLDivElement;
      div.style.fontSize   = i === idx ? "17px" : "14px";
      div.style.fontWeight = i === idx ? "600"  : "400";
      div.style.color      = i === idx ? "#4A1C1C" : "#94a3b8";
    });
  }

  function applyY(y: number, animate: boolean) {
    if (!innerRef.current) return;
    const min     = -(items.length - 1) * ITEM_H;
    const clamped = Math.max(min, Math.min(0, y));
    state.current.curY = clamped;
    innerRef.current.style.transition = animate
      ? "transform 0.42s cubic-bezier(0.15, 1, 0.3, 1)"
      : "none";
    innerRef.current.style.transform = `translateY(${clamped}px)`;
    updateItems(clampIdx(-clamped / ITEM_H));
  }

  function snapTo(idx: number) {
    const clamped = clampIdx(idx);
    state.current.targetIdx = clamped;
    applyY(-clamped * ITEM_H, true);
    onChange(clamped);
  }

  // Sync when parent changes selectedIndex or items change
  useEffect(() => {
    const clamped = Math.max(0, Math.min(items.length - 1, selectedIndex));
    state.current.targetIdx = clamped;
    state.current.curY      = -clamped * ITEM_H;
    applyY(-clamped * ITEM_H, false);
    updateItems(clamped);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, items.length]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const s     = state.current;
    s.dragging  = true;
    s.startY    = e.clientY;
    s.startCurY = s.curY;
    s.lastY     = e.clientY;
    s.lastT     = Date.now();
    s.vel       = 0;
    if (innerRef.current) innerRef.current.style.transition = "none";
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const s = state.current;
      if (!s.dragging || !innerRef.current) return;

      const now = Date.now();
      const dt  = Math.max(1, now - s.lastT);
      s.vel     = ((e.clientY - s.lastY) / dt) * 16;
      s.lastY   = e.clientY;
      s.lastT   = now;

      const dy  = e.clientY - s.startY;
      let newY  = s.startCurY + dy;
      const min = -(items.length - 1) * ITEM_H;

      // rubber-band resistance at edges
      if (newY < min) newY = min + (newY - min) * 0.3;
      if (newY > 0)   newY = newY * 0.3;

      s.curY = newY;
      innerRef.current.style.transform = `translateY(${newY}px)`;
      updateItems(clampIdx(-newY / ITEM_H));
    }

    function onMouseUp() {
      const s = state.current;
      if (!s.dragging) return;
      s.dragging = false;
      // project forward using velocity for momentum
      const projected = clampIdx(-(s.curY + s.vel * 8) / ITEM_H);
      snapTo(projected);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function onTouchStart(e: React.TouchEvent) {
    const s     = state.current;
    s.dragging  = true;
    s.startY    = e.touches[0].clientY;
    s.startCurY = s.curY;
    s.lastY     = e.touches[0].clientY;
    s.lastT     = Date.now();
    s.vel       = 0;
    if (innerRef.current) innerRef.current.style.transition = "none";
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const s = state.current;
    if (!s.dragging || !innerRef.current) return;

    const now = Date.now();
    const dt  = Math.max(1, now - s.lastT);
    s.vel     = ((e.touches[0].clientY - s.lastY) / dt) * 16;
    s.lastY   = e.touches[0].clientY;
    s.lastT   = now;

    const dy  = e.touches[0].clientY - s.startY;
    let newY  = s.startCurY + dy;
    const min = -(items.length - 1) * ITEM_H;

    if (newY < min) newY = min + (newY - min) * 0.3;
    if (newY > 0)   newY = newY * 0.3;

    s.curY = newY;
    innerRef.current.style.transform = `translateY(${newY}px)`;
    updateItems(clampIdx(-newY / ITEM_H));
  }

  function onTouchEnd() {
    const s = state.current;
    if (!s.dragging) return;
    s.dragging = false;
    const projected = clampIdx(-(s.curY + s.vel * 8) / ITEM_H);
    snapTo(projected);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    snapTo(state.current.targetIdx + (e.deltaY > 0 ? 1 : -1));
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <p style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 1,
        textTransform: "uppercase", color: "#94a3b8",
        marginBottom: 8, fontFamily: "'Poppins', sans-serif",
      }}>
        {label}
      </p>
      <div style={{ position: "relative", height: 180, width: "100%", overflow: "hidden" }}>
        {/* fade masks */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 64, zIndex: 2, pointerEvents: "none",
          background: "linear-gradient(to bottom, #fff 20%, transparent)",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 64, zIndex: 2, pointerEvents: "none",
          background: "linear-gradient(to top, #fff 20%, transparent)",
        }} />
        {/* selection highlight */}
        <div style={{
          position: "absolute", top: "50%", left: 6, right: 6,
          height: ITEM_H, marginTop: -ITEM_H / 2,
          borderRadius: 10, background: "rgba(74,28,28,0.07)",
          border: "0.5px solid rgba(74,28,28,0.18)", zIndex: 1, pointerEvents: "none",
        }} />
        {/* scrollable inner */}
        <div
          ref={innerRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            paddingTop: 72, paddingBottom: 72,
            transform: `translateY(${-selectedIndex * ITEM_H}px)`,
            cursor: "grab", userSelect: "none",
            willChange: "transform",
          }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                height: ITEM_H,
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%",
                fontSize: i === selectedIndex ? 17 : 14,
                fontWeight: i === selectedIndex ? 600 : 400,
                color: i === selectedIndex ? "#4A1C1C" : "#94a3b8",
                transition: "color 0.15s, font-size 0.15s, font-weight 0.15s",
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

// ─── Drum Date Picker ─────────────────────────────────────────────────────────

interface DrumDatePickerProps {
  open:     boolean;
  title:    string;
  initial:  Date;
  onApply:  (date: Date) => void;
  onClose:  () => void;
}

function DrumDatePicker({ open, title, initial, onApply, onClose }: DrumDatePickerProps) {
  const [monthIdx, setMonthIdx] = useState(initial.getMonth());
  const [dayIdx,   setDayIdx  ] = useState(initial.getDate() - 1);
  const [yearIdx,  setYearIdx ] = useState(YEAR_OFFSET);
  const [days,     setDays    ] = useState<number[]>([]);

  const now   = new Date();
  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() - YEAR_OFFSET + i);

  useEffect(() => {
    const year  = years[yearIdx] ?? now.getFullYear();
    const count = daysInMonth(monthIdx, year);
    const newDays = Array.from({ length: count }, (_, i) => i + 1);
    setDays(newDays);
    setDayIdx((prev) => Math.min(prev, count - 1));
  }, [monthIdx, yearIdx]);

  useEffect(() => {
    if (!open) return;
    const targetYear = initial.getFullYear();
    const yi = years.findIndex((y) => y === targetYear);
    setMonthIdx(initial.getMonth());
    setDayIdx(initial.getDate() - 1);
    setYearIdx(yi >= 0 ? yi : YEAR_OFFSET);
  }, [open]);

  function handleApply() {
    const year   = years[yearIdx] ?? now.getFullYear();
    const month  = monthIdx;
    const maxDay = daysInMonth(month, year);
    const day    = Math.min(dayIdx + 1, maxDay);
    onApply(new Date(year, month, day));
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Blurred backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(6px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.28 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.35)",
            }}
          />

          {/* Modal */}
          <motion.div
            key="sheet"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            style={{
              position: "absolute",
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
            {/* Handle bar */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, marginBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: "#e2e8f0" }} />
            </div>

            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 20px 14px",
              borderBottom: "0.5px solid #f1f5f9",
            }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: 0 }}>{title}</p>
              <button
                onClick={onClose}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "0.5px solid #e2e8f0", background: "#f8fafc",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, color: "#94a3b8", lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Drum columns */}
            <div style={{
              display: "flex",
              gap: 0,
              padding: "8px 16px 0",
              justifyContent: "center",
              maxWidth: 360,
              margin: "0 auto",
            }}>
              <DrumCol
                label="Month"
                items={MONTHS as unknown as string[]}
                selectedIndex={monthIdx}
                onChange={setMonthIdx}
              />
              <div style={{ width: 1, background: "#f1f5f9", margin: "40px 4px 0" }} />
              <DrumCol
                label="Day"
                items={days}
                selectedIndex={Math.min(dayIdx, days.length - 1)}
                onChange={setDayIdx}
              />
              <div style={{ width: 1, background: "#f1f5f9", margin: "40px 4px 0" }} />
              <DrumCol
                label="Year"
                items={years}
                selectedIndex={yearIdx}
                onChange={setYearIdx}
              />
            </div>

            {/* Footer buttons */}
            <div style={{ display: "flex", gap: 10, padding: "20px 20px 0" }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 12,
                  border: "0.5px solid #e2e8f0", background: "#f8fafc",
                  fontSize: 13, fontWeight: 500, color: "#64748b",
                  cursor: "pointer", fontFamily: "'Poppins', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                style={{
                  flex: 2, padding: "11px 0", borderRadius: 12,
                  border: "none", background: "#4A1C1C",
                  fontSize: 13, fontWeight: 600, color: "#fff",
                  cursor: "pointer", fontFamily: "'Poppins', sans-serif",
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

function RevenueDropdown({
  period,
  setPeriod,
  logs,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  logs: SaleLog[];
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const periods: Period[] = ["Today", "Last 7 Days", "Last 30 Days", "All Time"];
  const revenue           = getRevenueForPeriod(logs, period);

  const now   = new Date();
  const start = new Date(now);
  if      (period === "Today")        { start.setHours(0, 0, 0, 0); }
  else if (period === "Last 7 Days")  { start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); }
  else if (period === "Last 30 Days") { start.setDate(now.getDate() - 29); start.setHours(0, 0, 0, 0); }

  const inPeriod = period === "All Time"
    ? logs
    : logs.filter(l => l._dateObj >= start && l._dateObj <= now);

  const completedCount = inPeriod.filter(l => l.status === "Completed").length;
  const pendingCount   = inPeriod.filter(l => l.status === "Pending").length;
  const cancelledCount = inPeriod.filter(l => l.status === "Cancelled").length;
  const refundedCount  = inPeriod.filter(l => l.status === "Refunded").length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 280 }}>
      <motion.div
        whileHover={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
        onClick={() => setOpen(!open)}
        style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
          padding: "18px 20px", cursor: "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Total Revenue
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>{period}</span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              style={{ color: "#94a3b8", fontSize: 10, display: "inline-block", lineHeight: 1 }}>▼</motion.span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={`${period}-${revenue}`}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }}
            style={{ color: "#0f172a", fontSize: 28, fontWeight: 700, margin: "0 0 4px", letterSpacing: -0.5 }}>
            ₱{revenue.toLocaleString()}
          </motion.p>
        </AnimatePresence>

        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          {[
            { label: "Completed", count: completedCount, color: "#16a34a" },
            { label: "Pending",   count: pendingCount,   color: "#d97706" },
            { label: "Cancelled", count: cancelledCount, color: "#dc2626" },
            { label: "Refunded",  count: refundedCount,  color: "#2563eb" },
          ].map(s => (
            <span key={s.label} style={{ fontSize: 10, color: s.color, fontWeight: 600, background: `${s.color}12`, padding: "2px 8px", borderRadius: 99 }}>
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
              position: "absolute", top: "calc(100% + 8px)", right: 0,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
              boxShadow: "0 8px 30px rgba(0,0,0,0.1)", overflow: "hidden", zIndex: 50, minWidth: "100%",
            }}
          >
            {periods.map((p) => (
              <motion.div
                key={p} whileHover={{ background: "#f8fafc" }}
                onClick={() => { setPeriod(p); setOpen(false); }}
                style={{
                  padding: "11px 18px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  borderBottom: "1px solid #f8fafc",
                }}
              >
                <span style={{
                  color: period === p ? "#0f172a" : "#64748b", fontSize: 13,
                  fontWeight: period === p ? 600 : 400, fontFamily: "'Poppins', sans-serif",
                }}>{p}</span>
                {period === p && <span style={{ color: "#f97316", fontSize: 12 }}>✓</span>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Log Row ──────────────────────────────────────────────────────────────────

function LogRow({ log, index }: { log: SaleLog; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.28, ease: "easeOut" }}>

      <motion.div
        onClick={() => setOpen(!open)}
        whileHover={{ backgroundColor: "#fafafa" }}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 20px", cursor: "pointer",
          borderBottom: "1px solid #f1f5f9",
          backgroundColor: "#fff", transition: "background 0.15s",
        }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: typeColor[log.type], flexShrink: 0 }} />
        <span style={{ color: "#94a3b8", fontSize: 12, width: 72, flexShrink: 0 }}>{log.time}</span>
        <span style={{ color: "#1e293b", fontSize: 13, fontWeight: 500, flex: 1 }}>{log.product}</span>
        <span style={{ color: "#94a3b8", fontSize: 11, width: 80, flexShrink: 0 }}>{log.paymentMethod}</span>
        <span style={{ color: typeColor[log.type], fontSize: 11, fontWeight: 600, width: 70, textAlign: "center", flexShrink: 0 }}>{log.type}</span>
        <span style={{ color: "#94a3b8", fontSize: 12, width: 40, flexShrink: 0 }}>×{log.quantity}</span>
        <span style={{
          color: log.status === "Cancelled" || log.status === "Refunded" ? "#dc2626" : "#0f172a",
          fontSize: 14, fontWeight: 600, width: 100, textAlign: "right", flexShrink: 0,
          textDecoration: log.status === "Cancelled" ? "line-through" : "none",
        }}>
          {log.total === 0 ? "—" : `₱${Math.abs(log.total).toLocaleString()}`}
        </span>
        <span style={{ color: statusColor[log.status], fontSize: 11, fontWeight: 600, width: 80, textAlign: "right", flexShrink: 0 }}>{log.status}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
          style={{ color: "#cbd5e1", fontSize: 10, width: 16, textAlign: "center", flexShrink: 0 }}>▼</motion.span>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ padding: "14px 20px 14px 42px", display: "flex", gap: 32, flexWrap: "wrap" }}>
              {[
                { label: "Transaction ID",  value: log.id },
                { label: "Payment Method",  value: log.paymentMethod },
                { label: "Unit Price",      value: `₱${log.unitPrice.toLocaleString()}` },
                { label: "Quantity",        value: `${log.quantity} pcs` },
                { label: "Subtotal",        value: `₱${log.total.toLocaleString()}` },
                { label: "Order Status",    value: log.status },
              ].map((f) => (
                <div key={f.label}>
                  <p style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, letterSpacing: 1, margin: "0 0 2px", textTransform: "uppercase" }}>
                    {f.label}
                  </p>
                  <p style={{
                    color: f.label === "Order Status" ? statusColor[log.status as Status] : "#334155",
                    fontSize: 13, fontWeight: 500, margin: 0,
                  }}>
                    {f.value}
                  </p>
                </div>
              ))}
              {log.note && (
                <div>
                  <p style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, letterSpacing: 1, margin: "0 0 2px", textTransform: "uppercase" }}>Note</p>
                  <p style={{ color: "#d97706", fontSize: 13, fontWeight: 500, margin: 0 }}>⚠ {log.note}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ padding: 60, textAlign: "center", color: "#cbd5e1" }}>
      <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px", color: "#94a3b8" }}>No transactions yet</p>
      <p style={{ fontSize: 12, margin: 0 }}>{message}</p>
    </motion.div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ logs }: { logs: SaleLog[] }) {
  const completed = logs.filter(l => l.status === "Completed");
  const pending   = logs.filter(l => l.status === "Pending");
  const cancelled = logs.filter(l => l.status === "Cancelled");
  const refunded  = logs.filter(l => l.status === "Refunded");

  const completedRevenue = completed.reduce((s, l) => s + l.total, 0);
  const pendingRevenue   = pending.reduce((s, l) => s + l.total, 0);
  const refundedRevenue  = refunded.reduce((s, l) => s + l.total, 0);

  const stats = [
    { label: "Completed Sales", value: `₱${completedRevenue.toLocaleString()}`, sub: `${completed.length} items`, color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
    { label: "Pending Orders",  value: `₱${pendingRevenue.toLocaleString()}`,   sub: `${pending.length} items`,   color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    { label: "Cancelled",       value: `${cancelled.length} orders`,             sub: "voided",                    color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    { label: "Refunded",        value: `₱${refundedRevenue.toLocaleString()}`,   sub: `${refunded.length} orders`, color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  ];

  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
      {stats.map((s) => (
        <motion.div
          key={s.label}
          whileHover={{ y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
          style={{
            flex: 1, minWidth: 160,
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 14, padding: "16px 20px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
          <p style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600, margin: "0 0 6px", letterSpacing: 1, textTransform: "uppercase" }}>
            {s.label}
          </p>
          <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: "0 0 2px" }}>{s.value}</p>
          <p style={{ color: "#94a3b8", fontSize: 11, margin: 0 }}>{s.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab({ orders }: { orders: Order[] }) {
  const now = new Date();

  const [currentPage,   setCurrentPage  ] = useState(1);
  const [fromDate,      setFromDate     ] = useState<Date | null>(null);
  const [toDate,        setToDate       ] = useState<Date | null>(null);
  const [activeQuick,   setActiveQuick  ] = useState<QuickKey | null>("all");
  const [pickerOpen,    setPickerOpen   ] = useState(false);
  const [pickerTarget,  setPickerTarget ] = useState<"from" | "to">("from");
  const [pickerInitial, setPickerInitial] = useState<Date>(now);

  function openDatePicker(target: "from" | "to") {
    const ref = target === "from" ? (fromDate ?? now) : (toDate ?? now);
    setPickerTarget(target);
    setPickerInitial(ref);
    setPickerOpen(true);
  }

  function handlePickerApply(date: Date) {
    if (pickerTarget === "from") {
      if (toDate && date > toDate) {
        setFromDate(date);
        setToDate(date);
      } else {
        setFromDate(date);
      }
    } else {
      if (fromDate && date < fromDate) {
        setToDate(fromDate);
      } else {
        setToDate(date);
      }
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

  const filtered    = filterOrdersByRange(orders, fromDate, toDate);
  const totalPages  = Math.max(1, Math.ceil(filtered.length / ORDER_PAGE_SIZE));
  const sorted      = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const paginated   = sorted.slice((currentPage - 1) * ORDER_PAGE_SIZE, currentPage * ORDER_PAGE_SIZE);
  const totalRevenue   = filtered.reduce((sum, o) => sum + o.total, 0);
  const completedCount = filtered.filter((o) => o.status === "Completed").length;
  const hasRange    = !!(fromDate || toDate);

  const statusBadgeClass = (status: string) =>
    status === "Completed"
      ? "bg-green-50 text-green-700 hover:bg-green-50 rounded-lg font-medium border-0"
      : status === "Pending"
      ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-50 rounded-lg font-medium border-0"
      : "bg-red-50 text-red-700 hover:bg-red-50 rounded-lg font-medium border-0";

  const orderTypeBadgeClass = (orderType: string) =>
    orderType === "take-out"
      ? "bg-amber-50 text-amber-700 hover:bg-amber-50 rounded-lg font-medium border-0"
      : orderType === "delivery"
        ? "bg-blue-50 text-blue-700 hover:bg-blue-50 rounded-lg font-medium border-0"
        : "bg-rose-50 text-rose-700 hover:bg-rose-50 rounded-lg font-medium border-0";

  function formatDate(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatTime(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  const fromLabel = fromDate ? formatDisplayDate(fromDate) : "Select date";
  const toLabel   = toDate   ? formatDisplayDate(toDate)   : "Select date";

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
            <h3 className="text-base font-semibold text-gray-800">Orders</h3>
            {hasRange && (
              <p className="text-xs text-gray-400 mt-0.5">
                {filtered.length} order{filtered.length !== 1 ? "s" : ""} ·{" "}
                <span className="text-green-600 font-medium">{completedCount} completed</span>{" "}
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
              {fromLabel}
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
              {toLabel}
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

        <div className="flex gap-2 flex-wrap mb-5">
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

        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 hover:bg-transparent">
              <TableHead className="text-gray-700 font-semibold">Order ID</TableHead>
              <TableHead className="text-gray-700 font-semibold">Date</TableHead>
              <TableHead className="text-gray-700 font-semibold">Time</TableHead>
              <TableHead className="text-gray-700 font-semibold">Order Type</TableHead>
              <TableHead className="text-gray-700 font-semibold">Status</TableHead>
              <TableHead className="text-gray-700 font-semibold">Payment</TableHead>
              <TableHead className="text-gray-700 font-semibold text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-10">
                  {orders.length === 0
                    ? "No orders yet. Orders will appear here once the cashier processes them."
                    : "No orders found for the selected date range."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((order) => (
                <TableRow
                  key={order.id}
                  className="border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <TableCell className="font-medium text-gray-900">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell className="text-gray-600 whitespace-nowrap">
                    {formatDate(order.date)}
                  </TableCell>
                  <TableCell className="text-gray-800 text-base font-semibold whitespace-nowrap">
                    {formatTime(order.date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={orderTypeBadgeClass(order.orderType)}>
                      {order.orderType || "-"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusBadgeClass(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-blue-600 font-medium">
                    {order.paymentCategory}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900 text-right">
                    ₱{order.total.toLocaleString()}
                  </TableCell>
                </TableRow>
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

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="text-gray-400 text-sm px-1">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={currentPage === p ? "default" : "outline"}
                      size="icon"
                      className={`h-8 w-8 rounded-lg text-sm ${
                        currentPage === p
                          ? "bg-[#4A1C1C] hover:bg-[#3a1515] text-white border-0"
                          : ""
                      }`}
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalesReports() {
  const [activeTab,    setActiveTab   ] = useState<TabKey>("logs");
  const [search,       setSearch      ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [period,       setPeriod      ] = useState<Period>("Today");
  const [logs,         setLogs        ] = useState<SaleLog[]>([]);
  const [orders,       setOrders      ] = useState<Order[]>([]);

  useEffect(() => { setLogs([]);   }, []);
  useEffect(() => { setOrders([]); }, []);

  const filteredLogs = logs.filter((l) => {
    const matchStatus = filterStatus === "All" || l.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      l.id.toLowerCase().includes(q) ||
      l.product.toLowerCase().includes(q) ||
      l.paymentMethod.toLowerCase().includes(q) ||
      l.operator.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const grouped = groupByDate(filteredLogs);
  const dates   = Object.keys(grouped);

  const TAB_STYLES = (key: TabKey) =>
    `text-xs font-semibold px-4 py-2 rounded-full border transition-colors cursor-pointer ${
      activeTab === key
        ? "bg-[#0f172a] text-white border-[#0f172a]"
        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
    }`;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Poppins', sans-serif" }}>

      <Sidebar />

      <div style={{ padding: "40px 40px 40px 88px" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 28 }}>
          <div>
            <p style={{ color: "#f97316", fontSize: 11, fontWeight: 700, letterSpacing: 2, margin: "0 0 6px" }}>THE CRUNCH</p>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#0f172a" }}>Sales & Reports</h1>
            <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 13 }}>
              Transaction history & audit trail
            </p>
          </div>
          <RevenueDropdown period={period} setPeriod={setPeriod} logs={logs} />
        </motion.div>

        {/* Summary bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <SummaryBar logs={logs} />
        </motion.div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button className={TAB_STYLES("logs")}   onClick={() => setActiveTab("logs")}>Sales Logs</button>
          <button className={TAB_STYLES("orders")} onClick={() => setActiveTab("orders")}>Orders</button>
        </div>

        {/* ── Sales Logs Tab ── */}
        {activeTab === "logs" && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.35 }}
              style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, payment method, or transaction ID..."
                style={{
                  flex: 1, minWidth: 220, background: "#fff", border: "1px solid #e2e8f0",
                  borderRadius: 99, padding: "10px 18px", fontSize: 13, color: "#1e293b",
                  outline: "none", fontFamily: "'Poppins', sans-serif",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["All", "Completed", "Pending", "Cancelled", "Refunded"] as const).map((s) => (
                  <motion.button
                    key={s} whileTap={{ scale: 0.95 }}
                    onClick={() => setFilterStatus(s)}
                    style={{
                      background: filterStatus === s ? "#0f172a" : "#fff",
                      border: "1px solid #e2e8f0", borderRadius: 99,
                      color: filterStatus === s ? "#fff" : "#64748b",
                      padding: "8px 18px", fontSize: 12, fontWeight: 500,
                      cursor: "pointer", fontFamily: "'Poppins', sans-serif",
                      transition: "all 0.15s",
                    }}>
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }}
              style={{
                background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
                overflow: "hidden", boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
              }}>

              {/* Table header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "10px 20px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc",
              }}>
                <div style={{ width: 8, flexShrink: 0 }} />
                {[
                  { label: "TIME",    width: 72 },
                  { label: "PRODUCT", flex: 1 },
                  { label: "PAYMENT", width: 80 },
                  { label: "TYPE",    width: 70 },
                  { label: "QTY",     width: 40 },
                  { label: "AMOUNT",  width: 100, align: "right" },
                  { label: "STATUS",  width: 80,  align: "right" },
                ].map((col) => (
                  <span
                    key={col.label}
                    style={{
                      color: "#94a3b8", fontSize: 10, fontWeight: 600, letterSpacing: 1,
                      ...(col.flex ? { flex: col.flex } : { width: col.width, flexShrink: 0 }),
                      ...(col.align ? { textAlign: col.align as any } : {}),
                    }}>
                    {col.label}
                  </span>
                ))}
                <div style={{ width: 16, flexShrink: 0 }} />
              </div>

              {/* Rows grouped by date */}
              <AnimatePresence>
                {dates.length === 0 ? (
                  <EmptyState key="empty" message="Orders placed from the cashier view will appear here automatically." />
                ) : (
                  dates.map((date) => {
                    const entries    = grouped[date];
                    const dayRevenue = entries
                      .filter(l => l.status !== "Cancelled" && l.status !== "Refunded")
                      .reduce((s, l) => s + l.total, 0);

                    return (
                      <div key={date}>
                        <div style={{
                          padding: "8px 20px", background: "#f8fafc",
                          borderBottom: "1px solid #f1f5f9", borderTop: "1px solid #f1f5f9",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{date}</span>
                          <span style={{ color: "#cbd5e1", fontSize: 11 }}>
                            {entries.length} records · ₱{dayRevenue.toLocaleString()} revenue
                          </span>
                        </div>
                        {entries.map((log, i) => (
                          <LogRow key={log.id} log={log} index={i} />
                        ))}
                      </div>
                    );
                  })
                )}
              </AnimatePresence>
            </motion.div>

            <p style={{ color: "#cbd5e1", fontSize: 11, textAlign: "center", marginTop: 20, fontWeight: 500 }}>
              {filteredLogs.length} of {logs.length} line items
            </p>
          </>
        )}

        {/* ── Orders Tab ── */}
        {activeTab === "orders" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <OrdersTab orders={orders} />
          </motion.div>
        )}

      </div>
    </div>
  );
}