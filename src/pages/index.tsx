import React, { useState, useEffect, useMemo } from "react";
import { Search, TrendingUp, Calendar, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sidebar } from "@/components/Sidebar";
import { OrdersTable } from "@/components/orders-table";
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

interface PeriodOption {
  label: string;
  value: string;
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

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKEND_NAMES = ["Sat", "Sun"];

const WEEKDAY_SLOTS = ["10am", "12pm", "2pm", "4pm", "6pm", "8pm", "10pm"];
const WEEKDAY_SLOT_RANGES: [number, number][] = [
  [10, 12],
  [12, 14],
  [14, 16],
  [16, 18],
  [18, 20],
  [20, 22],
  [22, 24],
];
const WEEKEND_SLOTS = ["11:30am", "1:30pm", "3:30pm", "5:30pm", "7:30pm"];
const WEEKEND_SLOT_RANGES: [number, number][] = [
  [11.5, 13.5],
  [13.5, 15.5],
  [15.5, 17.5],
  [17.5, 19.5],
  [19.5, 20.5],
];

const ALL_HOUR_SLOTS = [
  "10am",
  "11:30am",
  "12pm",
  "1:30pm",
  "2pm",
  "3:30pm",
  "4pm",
  "5:30pm",
  "6pm",
  "7:30pm",
  "8pm",
  "10pm",
];

const PAYMENT_COLORS: Record<string, string> = {
  GCash: "#2D5F9E",
  Cash: "#7C2D2D",
  Maya: "#1B7A5A",
  "Credit Card": "#B85E1A",
  Others: "#888680",
};

const ORDER_TYPE_COLORS = [
  "#7C2D2D",
  "#A84040",
  "#C46060",
  "#DDA0A0",
  "#EEC8C8",
];

function generatePeriodOptions(): PeriodOption[] {
  const currentYear = new Date().getFullYear();
  const options: PeriodOption[] = [
    { label: "This Month", value: "month_current" },
    { label: "Last 3 Months", value: "months_3" },
    { label: "Last 6 Months", value: "months_6" },
    { label: "Last 9 Months", value: "months_9" },
    { label: `Year ${currentYear}`, value: `year_${currentYear}` },
  ];
  for (let y = currentYear - 1; y >= currentYear - 5; y--) {
    options.push({ label: `Year ${y}`, value: `year_${y}` });
  }
  return options;
}

function filterOrdersByPeriod(orders: Order[], period: string): Order[] {
  const now = new Date();
  return orders.filter((o) => {
    if (!o.date) return false;
    const orderDate = new Date(o.date);
    if (period === "month_current") {
      return (
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getFullYear() === now.getFullYear()
      );
    }
    if (period.startsWith("months_")) {
      const months = parseInt(period.split("_")[1], 10);
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - months);
      return orderDate >= cutoff;
    }
    if (period.startsWith("year_")) {
      const year = parseInt(period.split("_")[1], 10);
      return orderDate.getFullYear() === year;
    }
    return true;
  });
}

function filterOrdersByPeriodOffset(
  orders: Order[],
  period: string,
  offsetWeeks: number,
): Order[] {
  const now = new Date();
  now.setDate(now.getDate() - offsetWeeks * 7);
  return filterOrdersByPeriod(
    orders.map((o) => ({
      ...o,
      date: shiftDateString(o.date, -offsetWeeks * 7),
    })),
    period,
  ).map((o) => ({ ...o, date: shiftDateString(o.date, offsetWeeks * 7) }));
}

function shiftDateString(dateStr: string, days: number): string {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString();
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
    .map(([type, count]) => ({
      type,
      count,
      pct: Math.round((count / total) * 100),
    }))
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
    .map(([category, count]) => ({
      category,
      count,
      pct: Math.round((count / total) * 100),
    }))
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
      const slotIndex = WEEKEND_SLOT_RANGES.findIndex(
        ([start, end]) => h >= start && h < end,
      );
      if (slotIndex === -1) continue;
      const key = `${dayName}__${WEEKEND_SLOTS[slotIndex]}`;
      counts[key] = (counts[key] ?? 0) + 1;
    } else {
      const slotIndex = WEEKDAY_SLOT_RANGES.findIndex(
        ([start, end]) => h >= start && h < end,
      );
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
      cells.push({
        day,
        hour,
        count: isOpen ? (counts[`${day}__${hour}`] ?? 0) : -1,
      });
    }
  }
  return cells;
}

function computeWeeklySales(
  thisWeekOrders: Order[],
  lastWeekOrders: Order[],
): WeeklySalesPoint[] {
  const thisMap: Record<string, number> = {};
  const lastMap: Record<string, number> = {};

  for (const o of thisWeekOrders) {
    const day = DAYS_OF_WEEK[new Date(o.date).getDay()];
    thisMap[day] = (thisMap[day] ?? 0) + o.total;
  }
  for (const o of lastWeekOrders) {
    const day = DAYS_OF_WEEK[new Date(o.date).getDay()];
    lastMap[day] = (lastMap[day] ?? 0) + o.total;
  }

  return DAYS_OF_WEEK.map((day) => ({
    day,
    thisWeek: thisMap[day] ?? 0,
    lastWeek: lastMap[day] ?? 0,
  }));
}

function pickInitialPeriod(orders: Order[]): string {
  if (orders.length === 0) return "month_current";

  const now = new Date();
  const hasCurrentMonthData = orders.some((order) => {
    if (!order.date) return false;
    const date = new Date(order.date);
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  });

  if (hasCurrentMonthData) return "month_current";

  const latestOrder = orders.reduce<Date | null>((latest, order) => {
    if (!order.date) return latest;
    const date = new Date(order.date);
    if (Number.isNaN(date.getTime())) return latest;
    if (!latest || date > latest) return date;
    return latest;
  }, null);

  if (!latestOrder) return "month_current";

  const monthDiff =
    (now.getFullYear() - latestOrder.getFullYear()) * 12 +
    (now.getMonth() - latestOrder.getMonth());

  if (monthDiff <= 2) return "months_3";
  if (monthDiff <= 5) return "months_6";
  if (monthDiff <= 8) return "months_9";

  return `year_${latestOrder.getFullYear()}`;
}

interface KpiCardProps {
  label: string;
  value: string;
  trend: string;
  up: boolean | null;
}

function KpiCard({ label, value, trend, up }: KpiCardProps) {
  return (
    <Card className="bg-white rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
      <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-3xl font-bold text-gray-800 mb-1">{value}</div>
      <div
        className={`flex items-center gap-1 text-xs font-medium ${up === true ? "text-green-600" : up === false ? "text-red-500" : "text-gray-400"}`}
      >
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
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}
      >
        <div />
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-[10px] text-gray-400 pb-1">
            {d}
          </div>
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
                  title={
                    isClosed
                      ? `${day} ${hour}: Closed`
                      : `${day} ${hour}: ${count} orders`
                  }
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
              <div
                key={t}
                className="w-4 h-3 rounded-sm"
                style={{
                  backgroundColor: t === 0 ? "#F0FAF4" : `rgb(${r},${g},${b})`,
                }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-gray-400">High</span>
        <span className="ml-3 flex items-center gap-1 text-[10px] text-gray-400">
          <span className="w-4 h-3 rounded-sm inline-block bg-gray-200 opacity-40" />{" "}
          Closed
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
          <span className="text-[10px] text-gray-400 w-4 text-right">
            {i + 1}
          </span>
          <span className="text-xs text-gray-600 w-24 truncate">
            {item.name}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.count / maxCount) * 100}%`,
                backgroundColor: "#7C2D2D",
              }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right">
            {item.count}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">
          No items data yet.
        </p>
      )}
    </div>
  );
}
export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [salesView, setSalesView] = useState<"sales" | "orders">("sales");
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const periodOptions = useMemo(() => generatePeriodOptions(), []);
  const filteredOrders = useMemo(
    () => filterOrdersByPeriod(orders, selectedPeriod),
    [orders, selectedPeriod],
  );
  const totalOrders = filteredOrders.length;
  const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const activeOrders = filteredOrders.filter(
    (o) => !["Completed", "Cancelled"].includes(o.status),
  ).length;
  const completedOrders = filteredOrders.filter(
    (o) => o.status === "Completed",
  ).length;
  const cancelledOrders = filteredOrders.filter(
    (o) => o.status === "Cancelled",
  ).length;
  const completionRate =
    totalOrders > 0
      ? ((completedOrders / totalOrders) * 100).toFixed(1)
      : "0.0";
  const cancellationRate =
    totalOrders > 0
      ? ((cancelledOrders / totalOrders) * 100).toFixed(1)
      : "0.0";

  const topItems = useMemo(
    () => computeTopItems(filteredOrders),
    [filteredOrders],
  );
  const orderTypes = useMemo(
    () => computeOrderTypes(filteredOrders),
    [filteredOrders],
  );
  const paymentBreakdown = useMemo(
    () => computePaymentBreakdown(filteredOrders),
    [filteredOrders],
  );
  const heatmapCells = useMemo(
    () => computeHeatmap(filteredOrders),
    [filteredOrders],
  );

  const lastWeekOrders = useMemo(
    () => filterOrdersByPeriodOffset(orders, selectedPeriod, 1),
    [orders, selectedPeriod],
  );
  const weeklySalesData = useMemo(
    () => computeWeeklySales(filteredOrders, lastWeekOrders),
    [filteredOrders, lastWeekOrders],
  );

  const weeklyChartData = useMemo(
    () =>
      weeklySalesData.map((p) => ({
        day: p.day,
        thisWeek:
          salesView === "sales"
            ? p.thisWeek
            : filteredOrders.filter(
                (o) => DAYS_OF_WEEK[new Date(o.date).getDay()] === p.day,
              ).length,
        lastWeek:
          salesView === "sales"
            ? p.lastWeek
            : lastWeekOrders.filter(
                (o) => DAYS_OF_WEEK[new Date(o.date).getDay()] === p.day,
              ).length,
      })),
    [weeklySalesData, salesView, filteredOrders, lastWeekOrders],
  );

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
        if (!rows?.length) {
          setOrders([]);
          setSelectedPeriod((current) => current || "month_current");
          return;
        }

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

        const normalizedOrders = Object.values(grouped);
        setOrders(normalizedOrders);
        setSelectedPeriod(
          (current) => current || pickInitialPeriod(normalizedOrders),
        );
      } catch (err) {
        console.error("Failed to fetch orders:", err);
        setOrdersError(
          err instanceof Error ? err.message : "Failed to load dashboard data.",
        );
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
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img
                src="src/assets/img/logo.jpg"
                alt="The Crunch Logo"
                className="w-12 h-12 rounded-full"
              />
              <span className="text-2xl font-semibold text-[#4A1C1C]">
                The Crunch
              </span>
            </div>

            <div className="flex-1 max-w-2xl mx-8">
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

            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#4A1C1C]" />
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-44 border-2 border-[#4A1C1C]/20 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow text-[#4A1C1C] font-medium">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {ordersError && (
            <Card className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 shadow-sm">
              <p className="text-sm font-semibold text-red-700">
                Dashboard data failed to load
              </p>
              <p className="text-xs text-red-500 mt-1">{ordersError}</p>
            </Card>
          )}

          {!ordersError &&
            !isLoadingOrders &&
            orders.length > 0 &&
            filteredOrders.length === 0 && (
              <Card className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 shadow-sm">
                <p className="text-sm font-semibold text-amber-800">
                  No orders match the selected period
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  The dashboard has order data in the backend, but none for this
                  filter. Change the period to view recent sales.
                </p>
              </Card>
            )}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            <KpiCard
              label="Total Orders"
              value={isLoadingOrders ? "..." : totalOrders.toLocaleString()}
              trend="Live"
              up={null}
            />
            <KpiCard
              label="Total Sales"
              value={
                isLoadingOrders ? "..." : `₱${totalSales.toLocaleString()}`
              }
              trend="Live"
              up={null}
            />
            <KpiCard
              label="Avg Order Value"
              value={isLoadingOrders ? "..." : `₱${avgOrderValue.toFixed(2)}`}
              trend="Per transaction"
              up={null}
            />
            <KpiCard
              label="Active Orders"
              value={isLoadingOrders ? "..." : activeOrders.toLocaleString()}
              trend="In progress"
              up={null}
            />
            <KpiCard
              label="Completion Rate"
              value={isLoadingOrders ? "..." : `${completionRate}%`}
              trend="Of all orders"
              up={isLoadingOrders ? null : parseFloat(completionRate) >= 90}
            />
            <KpiCard
              label="Cancellation Rate"
              value={isLoadingOrders ? "..." : `${cancellationRate}%`}
              trend="Of all orders"
              up={isLoadingOrders ? null : parseFloat(cancellationRate) <= 5}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            <div className="lg:col-span-8">
              <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Order & Sales Review
                  </h2>
                  <div className="flex gap-2">
                    <Select
                      value={salesView}
                      onValueChange={(v) =>
                        setSalesView(v as "sales" | "orders")
                      }
                    >
                      <SelectTrigger className="w-28 border-gray-200 rounded-xl bg-white shadow-sm text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="orders">Orders</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-4 mb-3 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm inline-block bg-[#7C2D2D]" />
                    <span className="text-gray-500">This period</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm inline-block bg-gray-300" />
                    <span className="text-gray-500">Previous period</span>
                  </span>
                </div>

                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={weeklyChartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE6" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12, fill: "#9B8E8E" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#9B8E8E" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={yAxisFormatter}
                    />
                    <Tooltip
                      formatter={(value: number) => [yAxisFormatter(value)]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="thisWeek"
                      stroke="#7C2D2D"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#7C2D2D" }}
                      name="This period"
                    />
                    <Line
                      type="monotone"
                      dataKey="lastWeek"
                      stroke="#C8B8B8"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={{ r: 3, fill: "#C8B8B8" }}
                      name="Previous period"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="lg:col-span-4">
              <Card className="bg-white rounded-2xl p-6 shadow-md border-0 h-full">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Payment Methods
                </h3>
                {paymentBreakdown.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={paymentBreakdown}
                          dataKey="count"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                        >
                          {paymentBreakdown.map((entry, index) => (
                            <Cell
                              key={entry.category}
                              fill={
                                PAYMENT_COLORS[entry.category] ??
                                ORDER_TYPE_COLORS[
                                  index % ORDER_TYPE_COLORS.length
                                ]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            value,
                            name,
                          ]}
                          contentStyle={{
                            borderRadius: 12,
                            border: "none",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2">
                      {paymentBreakdown.map((entry, index) => (
                        <div
                          key={entry.category}
                          className="flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-sm inline-block"
                              style={{
                                backgroundColor:
                                  PAYMENT_COLORS[entry.category] ??
                                  ORDER_TYPE_COLORS[
                                    index % ORDER_TYPE_COLORS.length
                                  ],
                              }}
                            />
                            <span className="text-gray-600">
                              {entry.category}
                            </span>
                          </div>
                          <span className="font-medium text-gray-800">
                            {entry.pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm text-center mt-8">
                    No payment data yet.
                  </p>
                )}
              </Card>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Peak Hours
              </h3>
              <PeakHoursHeatmap cells={heatmapCells} />
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Top-Selling Items
              </h3>
              <TopItemsChart items={topItems} />
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Order Types
              </h3>
              {orderTypes.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={orderTypes}
                    layout="vertical"
                    margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#F0EBE6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#9B8E8E" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, 100]}
                    />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ fontSize: 11, fill: "#9B8E8E" }}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, "Share"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {orderTypes.map((entry, index) => (
                        <Cell
                          key={entry.type}
                          fill={
                            ORDER_TYPE_COLORS[index % ORDER_TYPE_COLORS.length]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-400 text-sm text-center mt-8">
                  No order type data yet.
                </p>
              )}
            </Card>
          </div>
          <OrdersTable orders={filteredOrders} />
        </div>
      </main>
    </div>
  );
}
