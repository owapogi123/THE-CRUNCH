import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";

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

interface OrdersTableProps {
  orders?: Order[];
}

const PAGE_SIZE = 10;

const QUICK_RANGES = [
  { label: "Today",      key: "today"     },
  { label: "Yesterday",  key: "yesterday" },
  { label: "This week",  key: "week"      },
  { label: "This month", key: "month"     },
  { label: "Last 7 days",key: "last7"     },
  { label: "Last 30 days",key:"last30"    },
  { label: "All time",   key: "all"       },
] as const;

type QuickKey = typeof QUICK_RANGES[number]["key"];

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function filterByRange(orders: Order[], from: Date | null, to: Date | null): Order[] {
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const d = new Date(o.date);
    d.setHours(0, 0, 0, 0);
    if (from && d < from) return false;
    if (to   && d > to  ) return false;
    return true;
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

export function OrdersTable({ orders = [] }: OrdersTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [fromInput,   setFromInput  ] = useState("");
  const [toInput,     setToInput    ] = useState("");
  const [fromDate,    setFromDate   ] = useState<Date | null>(null);
  const [toDate,      setToDate     ] = useState<Date | null>(null);
  const [activeQuick, setActiveQuick] = useState<QuickKey | null>("all");

  const applyInputRange = (from: string, to: string) => {
    const f = from ? (() => { const d = new Date(from); d.setHours(0,  0,  0,   0); return d; })() : null;
    const t = to   ? (() => { const d = new Date(to);   d.setHours(23, 59, 59, 999); return d; })() : null;
    setFromDate(f);
    setToDate(t);
    setActiveQuick(null);
    setCurrentPage(1);
  };

  const applyQuick = (key: QuickKey) => {
    setActiveQuick(key);
    if (key === "all") {
      setFromDate(null);
      setToDate(null);
      setFromInput("");
      setToInput("");
    } else {
      const range = getQuickRange(key)!;
      setFromDate(range.from);
      setToDate(range.to);
      setFromInput(toDateInputValue(range.from));
      setToInput(toDateInputValue(range.to));
    }
    setCurrentPage(1);
  };

  const clearRange = () => {
    setFromDate(null);
    setToDate(null);
    setFromInput("");
    setToInput("");
    setActiveQuick("all");
    setCurrentPage(1);
  };

  const filtered = filterByRange(orders, fromDate, toDate);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const paginated = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const totalRevenue  = filtered.reduce((sum, o) => sum + o.total, 0);
  const completedCount = filtered.filter((o) => o.status === "Completed").length;

  const hasRange = fromDate || toDate;

  const statusBadgeClass = (status: string) =>
    status === "Completed"
      ? "bg-green-50 text-green-700 hover:bg-green-50 rounded-lg font-medium border-0"
      : "bg-yellow-50 text-yellow-700 hover:bg-yellow-50 rounded-lg font-medium border-0";

  const orderTypeBadgeClass = (orderType: string) =>
    orderType === "take-out"
      ? "bg-amber-50 text-amber-700 hover:bg-amber-50 rounded-lg font-medium border-0"
      : orderType === "delivery"
        ? "bg-blue-50 text-blue-700 hover:bg-blue-50 rounded-lg font-medium border-0"
        : "bg-rose-50 text-rose-700 hover:bg-rose-50 rounded-lg font-medium border-0";

  const formatDate = (value: string) => {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatTime = (value: string) => {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  return (
    <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
      {/* Header */}
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

        {/* Date range inputs */}
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <Input
            type="date"
            value={fromInput}
            onChange={(e) => {
              setFromInput(e.target.value);
              applyInputRange(e.target.value, toInput);
            }}
            className="w-36 h-9 rounded-xl border-gray-200 text-sm text-gray-700 focus:ring-1 focus:ring-[#4A1C1C]"
          />
          <span className="text-xs text-gray-400">to</span>
          <Input
            type="date"
            value={toInput}
            onChange={(e) => {
              setToInput(e.target.value);
              applyInputRange(fromInput, e.target.value);
            }}
            className="w-36 h-9 rounded-xl border-gray-200 text-sm text-gray-700 focus:ring-1 focus:ring-[#4A1C1C]"
          />
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

      {/* Quick range pills */}
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

      {/* Table */}
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

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
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
              .filter(
                (p) =>
                  p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1,
              )
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
  );
}