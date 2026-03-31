import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";

const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

type Status  = "Completed" | "Pending" | "Cancelled" | "Refunded";
type LogType = "Sale" | "Refund" | "Void" | "Adjustment";
type Period  = "Today" | "Last 7 Days" | "Last 30 Days" | "All Time";

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

function RevenueDropdown({
  period, setPeriod, logs,
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
              animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
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

const statusColor: Record<Status, string> = {
  Completed: "#16a34a", Pending: "#d97706", Cancelled: "#dc2626", Refunded: "#2563eb",
};
const typeColor: Record<LogType, string> = {
  Sale: "#f97316", Refund: "#3b82f6", Void: "#9ca3af", Adjustment: "#8b5cf6",
};

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

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ padding: 60, textAlign: "center", color: "#cbd5e1" }}>
      <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px", color: "#94a3b8" }}>No transactions yet</p>
      <p style={{ fontSize: 12, margin: 0 }}>
        Orders placed from the cashier view will appear here automatically.
      </p>
    </motion.div>
  );
}

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

export default function SalesReports() {
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [period,       setPeriod]       = useState<Period>("Today");
  const [logs,         setLogs]         = useState<SaleLog[]>([]);

  useEffect(() => {
    setLogs([]);
  }, []);

  const filtered = logs.filter((l) => {
    const matchStatus = filterStatus === "All" || l.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      l.id.toLowerCase().includes(q) ||
      l.product.toLowerCase().includes(q) ||
      l.paymentMethod.toLowerCase().includes(q) ||
      l.operator.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const grouped = groupByDate(filtered);
  const dates   = Object.keys(grouped);

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


        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <SummaryBar logs={logs} />
        </motion.div>


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
              <EmptyState key="empty" />
            ) : (
              dates.map((date) => {
                const entries = grouped[date];
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
          {filtered.length} of {logs.length} line items
        </p>
      </div>
    </div>
  );
}