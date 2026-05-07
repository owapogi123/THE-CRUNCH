"use client";

import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { InventoryClient } from "@/components/ui/inventoryClient";
import type {
  Batch,
  InventoryItem,
  UnitType,
} from "@/components/ui/inventoryClient";
import { Sidebar } from "@/components/Sidebar";
import { api, apiCall } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Package, RefreshCw, Archive } from "lucide-react";
import { useNotifications } from "@/lib/NotificationContext";

// ─── Real-time clock hook ─────────────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PageTab = "menu" | "movement";
type POStatus = "Pending" | "Received" | "Cancelled";
type TRStatus = "Pending" | "Completed" | "Cancelled";
type LogType = "Stock In" | "Transfer" | "Adjustment";
type InventoryFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

interface POItem {
  name: string;
  qty: string;
  unit: string;
  cost: string;
}
interface PurchaseOrder {
  id: string;
  supplier: string;
  branch: string;
  date: string;
  items: POItem[];
  status: POStatus;
  total: number;
}
interface StockInRecord {
  id: string;
  poRef: string;
  branch: string;
  date: string;
  receivedBy: string;
  items: Array<{ name: string; qty: string; unit: string }>;
}
interface Transfer {
  id: string;
  from: string;
  to: string;
  item: string;
  qty: string;
  unit: string;
  date: string;
  status: TRStatus;
  approvedBy: string;
}
interface Adjustment {
  id: string;
  branch: string;
  item: string;
  qty: number;
  unit: string;
  reason: string;
  date: string;
  by: string;
}
interface StockLog {
  id: string;
  date: string;
  type: LogType;
  item: string;
  qty: string;
  branch: string;
  by: string;
  ref: string;
}

interface ApiInventoryRow {
  id?: number;
  product_id?: number;
  inventory_id?: number;
  item_type?: string;
  menu_code?: string;
  name?: string;
  product_name?: string;
  category?: string;
  image?: string;
  stock?: number;
  quantity?: number;
  price?: number | string;
  unit?: UnitType | string;
  batches?: Batch[];
  promo?: string;
  isRawMaterial?: number | boolean;
  description?: string;
  availability_status?: string;
  is_promotional?: number | boolean;
  promo_price?: number | string | null;
  promo_label?: string;
  dailyWithdrawn?: number;
  returned?: number;
  wasted?: number;
  soldToday?: number;
  manual_override?: number | boolean;
  manual_status?: string;
  ingredient_count?: number;
  available_servings?: number | string | null;
  ingredients?: MenuIngredientRow[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES = ["Branch A", "Branch B", "Branch C"] as const;
const SUPPLIERS = [
  "Metro Farms",
  "Sunrise Supplies",
  "FreshVeg Co.",
  "Golden Grains",
] as const;
const SM_UNITS = ["kg", "pcs", "liters", "boxes", "bags"] as const;
const ITEMS = [
  "Chicken Breast",
  "Beef",
  "Rice",
  "All-Purpose Flour",
  "Cooking Oil",
  "Tomatoes",
  "Garlic",
  "Soy Sauce",
] as const;
const REASONS = [
  "Spoilage",
  "Damaged",
  "Theft",
  "Correction",
  "Wastage",
  "Other",
] as const;

const SM_TABS = [
  { key: "po", label: "Purchase Orders" },
  { key: "stockin", label: "Stock In" },
  { key: "transfer", label: "Transfer" },
  { key: "adjustment", label: "Adjustment" },
  { key: "logs", label: "Logs" },
] as const;
type SMTabKey = (typeof SM_TABS)[number]["key"];

const INVENTORY_FILTERS: {
  key: InventoryFilter;
  label: string;
  color: string;
  activeClass: string;
}[] = [
  {
    key: "all",
    label: "All",
    color: "text-gray-500",
    activeClass: "bg-gray-700 border-gray-700 text-white",
  },
  {
    key: "in_stock",
    label: "In Stock",
    color: "text-green-600",
    activeClass: "bg-green-600 border-green-600 text-white",
  },
  {
    key: "low_stock",
    label: "Low Stock",
    color: "text-yellow-600",
    activeClass: "bg-yellow-500 border-yellow-500 text-white",
  },
  {
    key: "out_of_stock",
    label: "Out of Stock",
    color: "text-red-500",
    activeClass: "bg-red-500 border-red-500 text-white",
  },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* silent */
  }
}

// ─── Notification helper ──────────────────────────────────────────────────────

function notify(
  addNotification: ReturnType<typeof useNotifications>["addNotification"],
  label: string,
  type: "success" | "error" | "warning" | "info" = "info",
) {
  addNotification({ id: `${Date.now()}-${Math.random()}`, label, type });
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Received: "bg-green-50 text-green-700",
    Completed: "bg-green-50 text-green-700",
    Pending: "bg-yellow-50 text-yellow-700",
    Cancelled: "bg-red-50 text-red-600",
  };
  const cls = styles[status] ?? "bg-gray-100 text-gray-500";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
    >
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    "Stock In": "bg-green-50 text-green-700",
    Transfer: "bg-blue-50 text-blue-700",
    Adjustment: "bg-red-50 text-red-600",
  };
  const cls = styles[type] ?? "bg-gray-100 text-gray-500";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
    >
      {type}
    </span>
  );
}

// ─── Shared SM UI ─────────────────────────────────────────────────────────────

function SMModal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-5 backdrop-blur-sm"
      style={{
        background: "rgba(17,24,39,0.28)",
        animation: "fadeIn 0.18s ease",
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[480px] overflow-hidden"
        style={{
          boxShadow: "0 20px 60px rgba(0,0,0,0.1)",
          animation: "slideUp 0.22s cubic-bezier(.4,0,.2,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-[22px] py-[17px] border-b border-gray-50">
          <span className="font-bold text-[14px] text-gray-900">{title}</span>
          <button
            onClick={onClose}
            className="text-gray-400 text-[20px] leading-none px-[5px] py-[2px] rounded-[5px] hover:bg-gray-100 hover:text-gray-700 transition-all bg-transparent border-none cursor-pointer"
          >
            ×
          </button>
        </div>
        <div className="px-[22px] py-5 max-h-[58vh] overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 px-[22px] py-3 border-t border-gray-50 bg-gray-50">
            {footer}
          </div>
        )}
      </div>
      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

function FormGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[14px]">
      <label className="block text-[11px] font-bold text-gray-500 mb-[5px] uppercase tracking-[0.5px]">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full px-[11px] py-2 border-[1.5px] border-gray-200 rounded-lg text-[12.5px] font-[Poppins,sans-serif] text-gray-900 outline-none bg-white transition-all focus:border-gray-400 focus:shadow-[0_0_0_3px_rgba(107,114,128,0.08)] box-border";

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}
function FormInput({ label, ...rest }: FormInputProps) {
  return (
    <FormGroup label={label}>
      <input className={inputClass} {...rest} />
    </FormGroup>
  );
}

function FormSelect({
  label,
  opts,
  value,
  onChange,
}: {
  label: string;
  opts: ReadonlyArray<string>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <FormGroup label={label}>
      <select className={inputClass} value={value} onChange={onChange}>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </FormGroup>
  );
}

function SectionHeader({
  title,
  sub,
  cta,
}: {
  title: string;
  sub: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-end mb-[14px]">
      <div>
        <div className="text-[13.5px] font-bold text-gray-900">{title}</div>
        <div className="text-[11.5px] text-gray-400 mt-[1px]">{sub}</div>
      </div>
      {cta}
    </div>
  );
}

function DataTable({
  cols,
  rows,
  emptyHint,
}: {
  cols: string[];
  rows: React.ReactNode[];
  emptyHint: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-[1.5px] border-gray-50">
            {cols.map((c) => (
              <th
                key={c}
                className="px-[14px] py-[10px] text-left text-[10.5px] font-bold text-gray-400 uppercase tracking-[0.6px]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length}>
                <div className="text-center py-[42px]">
                  <div className="text-[13px] text-gray-400">
                    No records yet
                  </div>
                  <div className="text-[11px] text-gray-300 mt-[3px]">
                    {emptyHint}
                  </div>
                </div>
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  meta,
  color,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  meta?: string;
  color: "blue" | "green" | "yellow" | "red";
  onClick?: () => void;
  active?: boolean;
}) {
  const colorMap = {
    green: { border: "#16a34a", text: "#16a34a" },
    yellow: { border: "#ca8a04", text: "#ca8a04" },
    red: { border: "#dc2626", text: "#dc2626" },
    blue: { border: "#4f46e5", text: "#4f46e5" },
  };
  const c = colorMap[color];
  return (
    <div
      className={`bg-white rounded-xl px-[18px] py-[15px] border transition-all ${
        onClick
          ? "cursor-pointer select-none hover:shadow-md"
          : "hover:shadow-md"
      } ${active ? "shadow-md ring-2" : "border-gray-100"}`}
      style={{
        borderTop: `3px solid ${c.border}`,
        outline: active ? `2px solid ${c.border}` : undefined,
        outlineOffset: active ? "2px" : undefined,
      }}
      onClick={onClick}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[0.6px] mb-[7px]"
        style={{ color: c.text }}
      >
        {label}
      </div>
      <div
        className="text-[24px] font-extrabold leading-none"
        style={{ color: c.text }}
      >
        {value}
      </div>
      {meta && <div className="text-[11px] mt-1 text-gray-400">{meta}</div>}
    </div>
  );
}

const ghostBtnClass =
  "bg-gray-100 text-gray-700 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity";
const okBtnClass =
  "bg-green-50 text-green-700 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity";
const dangerBtnClass =
  "bg-red-50 text-red-600 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity";
const primaryBtnClass =
  "bg-white text-gray-700 border border-gray-200 cursor-pointer font-[Poppins,sans-serif] font-semibold text-[12.5px] rounded-[9px] px-[18px] py-2 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-900 transition-all";

// ─── Purchase Orders ──────────────────────────────────────────────────────────

function PurchaseOrders() {
  const { addNotification } = useNotifications();
  const [pos, setPOs] = useState<PurchaseOrder[]>(() => loadLS("sm_pos", []));
  const [showCreate, setShowCreate] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [poSupplier, setPoSupplier] = useState<string>(SUPPLIERS[0]);
  const [poBranch, setPoBranch] = useState<string>(BRANCHES[0]);
  const [poDate, setPoDate] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([
    { name: ITEMS[0], qty: "", unit: "kg", cost: "" },
  ]);

  useEffect(() => {
    saveLS("sm_pos", pos);
  }, [pos]);

  function resetForm() {
    setPoSupplier(SUPPLIERS[0]);
    setPoBranch(BRANCHES[0]);
    setPoDate("");
    setPoItems([{ name: ITEMS[0], qty: "", unit: "kg", cost: "" }]);
  }
  function addPoItem() {
    setPoItems((p) => [
      ...p,
      { name: ITEMS[0], qty: "", unit: "kg", cost: "" },
    ]);
  }
  function removePoItem(i: number) {
    setPoItems((p) => p.filter((_, x) => x !== i));
  }
  function updatePoItem(i: number, field: keyof POItem, val: string) {
    setPoItems((p) =>
      p.map((it, x) => (x !== i ? it : { ...it, [field]: val })),
    );
  }
  const total = poItems.reduce(
    (s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.cost) || 0),
    0,
  );

  function submitPO() {
    if (!poDate) {
      notify(addNotification, "Please set a date.", "warning");
      return;
    }
    setPOs((p) => [
      {
        id: "PO-" + String(p.length + 1).padStart(3, "0"),
        supplier: poSupplier,
        branch: poBranch,
        date: poDate,
        items: poItems,
        status: "Pending",
        total,
      },
      ...p,
    ]);
    setShowCreate(false);
    resetForm();
    notify(addNotification, "Purchase order created successfully.", "success");
  }

  const filtered = pos.filter((p) => {
    const s = search.toLowerCase();
    return (
      (p.id.toLowerCase().includes(s) ||
        p.supplier.toLowerCase().includes(s) ||
        p.branch.toLowerCase().includes(s)) &&
      (filter === "All" || p.status === filter)
    );
  });

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total POs"
          value={pos.length}
          meta="All time"
          color="blue"
        />
        <StatCard
          label="Pending"
          value={pos.filter((p) => p.status === "Pending").length}
          meta="Awaiting"
          color="yellow"
        />
        <StatCard
          label="Received"
          value={pos.filter((p) => p.status === "Received").length}
          meta="Completed"
          color="green"
        />
        <StatCard
          label="Cancelled"
          value={pos.filter((p) => p.status === "Cancelled").length}
          meta="Voided"
          color="red"
        />
      </div>

      <SectionHeader
        title="Purchase Orders"
        sub="Manage supplier orders across all branches"
        cta={
          <button
            className={primaryBtnClass}
            onClick={() => setShowCreate(true)}
          >
            + New PO
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
            placeholder="Search PO number, supplier, branch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {["All", "Pending", "Received", "Cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-[13px] py-[5px] rounded-full text-[12px] font-semibold font-[Poppins,sans-serif] border cursor-pointer transition-all ${filter === f ? "bg-gray-700 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <DataTable
        cols={[
          "PO #",
          "Supplier",
          "Branch",
          "Date",
          "Total",
          "Status",
          "Actions",
        ]}
        emptyHint="Create a purchase order to get started."
        rows={filtered.map((po) => (
          <tr
            key={po.id}
            className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
          >
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">
              {po.id}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {po.supplier}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {po.branch}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {po.date}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-green-700">
              ₱{po.total.toLocaleString()}
            </td>
            <td className="px-[14px] py-[11px]">
              <StatusBadge status={po.status} />
            </td>
            <td className="px-[14px] py-[11px]">
              <div className="flex gap-[5px]">
                <button className={ghostBtnClass} onClick={() => setViewPO(po)}>
                  View
                </button>
                {po.status === "Pending" && (
                  <>
                    <button
                      className={okBtnClass}
                      onClick={() => {
                        setPOs((p) =>
                          p.map((x) =>
                            x.id === po.id
                              ? { ...x, status: "Received" as POStatus }
                              : x,
                          ),
                        );
                        notify(
                          addNotification,
                          `${po.id} marked as Received.`,
                          "success",
                        );
                      }}
                    >
                      Receive
                    </button>
                    <button
                      className={dangerBtnClass}
                      onClick={() => {
                        setPOs((p) =>
                          p.map((x) =>
                            x.id === po.id
                              ? { ...x, status: "Cancelled" as POStatus }
                              : x,
                          ),
                        );
                        notify(
                          addNotification,
                          `${po.id} has been cancelled.`,
                          "warning",
                        );
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      />

      {showCreate && (
        <SMModal
          title="Create Purchase Order"
          onClose={() => {
            setShowCreate(false);
            resetForm();
          }}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => {
                  setShowCreate(false);
                  resetForm();
                }}
              >
                Discard
              </button>
              <button className={primaryBtnClass} onClick={submitPO}>
                Submit PO
              </button>
            </>
          }
        >
          <FormSelect
            label="Supplier"
            opts={SUPPLIERS}
            value={poSupplier}
            onChange={(e) => setPoSupplier(e.target.value)}
          />
          <FormSelect
            label="Branch"
            opts={BRANCHES}
            value={poBranch}
            onChange={(e) => setPoBranch(e.target.value)}
          />
          <FormInput
            label="Expected Date"
            type="date"
            value={poDate}
            onChange={(e) => setPoDate(e.target.value)}
          />
          <label className="block text-[11px] font-bold text-gray-500 mb-[6px] uppercase tracking-[0.5px]">
            Order Items
          </label>
          {poItems.map((item, i) => (
            <div
              key={i}
              className="grid gap-[6px] mb-[7px] items-end"
              style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}
            >
              <select
                className={inputClass}
                value={item.name}
                onChange={(e) => updatePoItem(i, "name", e.target.value)}
              >
                {ITEMS.map((it) => (
                  <option key={it}>{it}</option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Qty"
                type="number"
                value={item.qty}
                onChange={(e) => updatePoItem(i, "qty", e.target.value)}
              />
              <select
                className={inputClass}
                value={item.unit}
                onChange={(e) => updatePoItem(i, "unit", e.target.value)}
              >
                {SM_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Cost"
                type="number"
                value={item.cost}
                onChange={(e) => updatePoItem(i, "cost", e.target.value)}
              />
              <button
                onClick={() => removePoItem(i)}
                className="bg-red-50 text-red-600 border-none rounded-[7px] px-[9px] py-[6px] cursor-pointer text-[13px] font-bold hover:opacity-75 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addPoItem}
            className="w-full mt-0.5 border-[1.5px] border-dashed border-gray-300 text-gray-400 bg-transparent rounded-lg py-[7px] text-[12px] font-semibold cursor-pointer hover:border-gray-400 hover:text-gray-600 transition-colors font-[Poppins,sans-serif]"
          >
            + Add another item
          </button>
          <div className="mt-3 px-[13px] py-[10px] bg-gray-50 rounded-[9px] flex justify-between items-center">
            <span className="text-[12px] text-gray-500 font-semibold">
              Total Amount
            </span>
            <span className="font-extrabold text-green-700 text-[15px]">
              ₱{total.toLocaleString()}
            </span>
          </div>
        </SMModal>
      )}

      {viewPO && (
        <SMModal
          title={`${viewPO.id} — Details`}
          onClose={() => setViewPO(null)}
          footer={
            <button className={ghostBtnClass} onClick={() => setViewPO(null)}>
              Close
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-[9px] mb-4">
            {(
              [
                ["Supplier", viewPO.supplier],
                ["Branch", viewPO.branch],
                ["Date", viewPO.date],
                ["Status", viewPO.status],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div
                key={k}
                className="bg-gray-50 rounded-[9px] px-[13px] py-[10px]"
              >
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.5px]">
                  {k}
                </div>
                <div className="text-[13px] font-semibold text-gray-900 mt-[3px]">
                  {v}
                </div>
              </div>
            ))}
          </div>
          <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-[0.5px]">
            Items Ordered
          </label>
          {viewPO.items.map((it, i) => (
            <div
              key={i}
              className="flex justify-between py-[9px] border-b border-gray-50 text-[13px] last:border-b-0"
            >
              <span className="text-gray-700">{it.name}</span>
              <span className="text-gray-500 font-semibold">
                {it.qty} {it.unit}
              </span>
            </div>
          ))}
          <div className="mt-[14px] text-right font-extrabold text-green-700 text-[15px]">
            ₱{viewPO.total.toLocaleString()}
          </div>
        </SMModal>
      )}
    </div>
  );
}

// ─── Stock In ─────────────────────────────────────────────────────────────────

function StockIn() {
  const { addNotification } = useNotifications();
  const [records, setRecords] = useState<StockInRecord[]>(() =>
    loadLS("sm_stockin", []),
  );
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [siPoRef, setSiPoRef] = useState("");
  const [siBranch, setSiBranch] = useState<string>(BRANCHES[0]);
  const [siDate, setSiDate] = useState("");
  const [siRecBy, setSiRecBy] = useState("");
  const [siItems, setSiItems] = useState<
    Array<{ name: string; qty: string; unit: string }>
  >([{ name: ITEMS[0], qty: "", unit: "kg" }]);

  useEffect(() => {
    saveLS("sm_stockin", records);
  }, [records]);

  function resetForm() {
    setSiPoRef("");
    setSiBranch(BRANCHES[0]);
    setSiDate("");
    setSiRecBy("");
    setSiItems([{ name: ITEMS[0], qty: "", unit: "kg" }]);
  }
  function submitSI() {
    if (!siDate || !siRecBy) {
      notify(addNotification, "Please fill all required fields.", "warning");
      return;
    }
    setRecords((p) => [
      {
        id: "SI-" + String(p.length + 1).padStart(3, "0"),
        poRef: siPoRef,
        branch: siBranch,
        date: siDate,
        receivedBy: siRecBy,
        items: siItems,
      },
      ...p,
    ]);
    setShowModal(false);
    resetForm();
    notify(addNotification, "Stock-in record saved successfully.", "success");
  }

  const filtered = records.filter((r) => {
    const s = search.toLowerCase();
    return (
      r.id.toLowerCase().includes(s) ||
      r.branch.toLowerCase().includes(s) ||
      r.receivedBy.toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Deliveries"
          value={records.length}
          meta="All time"
          color="blue"
        />
        <StatCard
          label="This Month"
          value={records.length}
          meta="March 2026"
          color="green"
        />
        <StatCard
          label="Branches Covered"
          value={new Set(records.map((r) => r.branch)).size}
          meta="Unique"
          color="yellow"
        />
        <StatCard
          label="Linked to PO"
          value={records.filter((r) => r.poRef !== "").length}
          meta="With ref"
          color="blue"
        />
      </div>

      <SectionHeader
        title="Stock In"
        sub="Record incoming deliveries and stock arrivals"
        cta={
          <button
            className={primaryBtnClass}
            onClick={() => setShowModal(true)}
          >
            + Record Stock In
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-[14px]">
        <div className="flex-1 min-w-[200px]">
          <input
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
            placeholder="Search SI number, branch, received by…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <DataTable
        cols={[
          "SI #",
          "PO Reference",
          "Branch",
          "Date",
          "Received By",
          "Items",
        ]}
        emptyHint="Record a delivery to get started."
        rows={filtered.map((r) => (
          <tr
            key={r.id}
            className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
          >
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">
              {r.id}
            </td>
            <td
              className={`px-[14px] py-[11px] text-[12.5px] ${r.poRef ? "text-indigo-600 font-semibold" : "text-gray-400"}`}
            >
              {r.poRef || "—"}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {r.branch}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {r.date}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {r.receivedBy}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
              {r.items
                .map((it) => `${it.name} (${it.qty} ${it.unit})`)
                .join(", ")}
            </td>
          </tr>
        ))}
      />

      {showModal && (
        <SMModal
          title="Record Stock In"
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                Discard
              </button>
              <button className={primaryBtnClass} onClick={submitSI}>
                Save Record
              </button>
            </>
          }
        >
          <FormInput
            label="PO Reference (optional)"
            placeholder="e.g. PO-002"
            value={siPoRef}
            onChange={(e) => setSiPoRef(e.target.value)}
          />
          <FormSelect
            label="Branch"
            opts={BRANCHES}
            value={siBranch}
            onChange={(e) => setSiBranch(e.target.value)}
          />
          <FormInput
            label="Date Received"
            type="date"
            value={siDate}
            onChange={(e) => setSiDate(e.target.value)}
          />
          <FormInput
            label="Received By"
            placeholder="Staff name"
            value={siRecBy}
            onChange={(e) => setSiRecBy(e.target.value)}
          />
          <label className="block text-[11px] font-bold text-gray-500 mb-[6px] uppercase tracking-[0.5px]">
            Items Received
          </label>
          {siItems.map((item, i) => (
            <div
              key={i}
              className="grid gap-[6px] mb-[7px] items-end"
              style={{ gridTemplateColumns: "2fr 1fr 1fr" }}
            >
              <select
                className={inputClass}
                value={item.name}
                onChange={(e) =>
                  setSiItems((p) =>
                    p.map((it, x) =>
                      x !== i ? it : { ...it, name: e.target.value },
                    ),
                  )
                }
              >
                {ITEMS.map((it) => (
                  <option key={it}>{it}</option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Qty"
                type="number"
                value={item.qty}
                onChange={(e) =>
                  setSiItems((p) =>
                    p.map((it, x) =>
                      x !== i ? it : { ...it, qty: e.target.value },
                    ),
                  )
                }
              />
              <select
                className={inputClass}
                value={item.unit}
                onChange={(e) =>
                  setSiItems((p) =>
                    p.map((it, x) =>
                      x !== i ? it : { ...it, unit: e.target.value },
                    ),
                  )
                }
              >
                {SM_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            onClick={() =>
              setSiItems((p) => [...p, { name: ITEMS[0], qty: "", unit: "kg" }])
            }
            className="w-full mt-0.5 border-[1.5px] border-dashed border-gray-300 text-gray-400 bg-transparent rounded-lg py-[7px] text-[12px] font-semibold cursor-pointer hover:border-gray-400 hover:text-gray-600 transition-colors font-[Poppins,sans-serif]"
          >
            + Add another item
          </button>
        </SMModal>
      )}
    </div>
  );
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────

function StockTransfer() {
  const { addNotification } = useNotifications();
  const [transfers, setTransfers] = useState<Transfer[]>(() =>
    loadLS("sm_transfers", []),
  );
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("All");
  const [trFrom, setTrFrom] = useState<string>(BRANCHES[0]);
  const [trTo, setTrTo] = useState<string>(BRANCHES[1]);
  const [trItem, setTrItem] = useState<string>(ITEMS[0]);
  const [trQty, setTrQty] = useState("");
  const [trUnit, setTrUnit] = useState<string>(SM_UNITS[0]);
  const [trDate, setTrDate] = useState("");

  useEffect(() => {
    saveLS("sm_transfers", transfers);
  }, [transfers]);

  function resetForm() {
    setTrFrom(BRANCHES[0]);
    setTrTo(BRANCHES[1]);
    setTrItem(ITEMS[0]);
    setTrQty("");
    setTrUnit(SM_UNITS[0]);
    setTrDate("");
  }
  function submitTR() {
    if (!trQty || !trDate) {
      notify(addNotification, "Please fill all required fields.", "warning");
      return;
    }
    if (trFrom === trTo) {
      notify(
        addNotification,
        "Source and destination branch must be different.",
        "warning",
      );
      return;
    }
    setTransfers((p) => [
      {
        id: "TR-" + String(p.length + 1).padStart(3, "0"),
        from: trFrom,
        to: trTo,
        item: trItem,
        qty: trQty,
        unit: trUnit,
        date: trDate,
        status: "Pending",
        approvedBy: "—",
      },
      ...p,
    ]);
    setShowModal(false);
    resetForm();
    notify(
      addNotification,
      "Transfer request submitted and pending approval.",
      "success",
    );
  }

  const filtered = transfers.filter(
    (t) => filter === "All" || t.status === filter,
  );

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Transfers"
          value={transfers.length}
          color="blue"
        />
        <StatCard
          label="Pending Approval"
          value={transfers.filter((t) => t.status === "Pending").length}
          meta="Needs Action"
          color="yellow"
        />
        <StatCard
          label="Completed"
          value={transfers.filter((t) => t.status === "Completed").length}
          color="green"
        />
        <StatCard
          label="Cancelled"
          value={transfers.filter((t) => t.status === "Cancelled").length}
          color="red"
        />
      </div>

      <SectionHeader
        title="Stock Transfer"
        sub="Move stock between branches with owner approval"
        cta={
          <button
            className={primaryBtnClass}
            onClick={() => setShowModal(true)}
          >
            + New Transfer
          </button>
        }
      />

        

      <DataTable
        cols={[
          "TR #",
          "From",
          "To",
          "Item",
          "Qty",
          "Date",
          "Status",
          "Approved By",
          "Actions",
        ]}
        emptyHint="No transfers recorded yet."
        rows={filtered.map((t) => (
          <tr
            key={t.id}
            className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
          >
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">
              {t.id}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {t.from}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {t.to}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {t.item}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-semibold text-gray-900">
              {t.qty} {t.unit}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {t.date}
            </td>
            <td className="px-[14px] py-[11px]">
              <StatusBadge status={t.status} />
            </td>
            <td
              className={`px-[14px] py-[11px] text-[12.5px] ${t.approvedBy === "—" ? "text-gray-400" : "text-gray-700"}`}
            >
              {t.approvedBy}
            </td>
            <td className="px-[14px] py-[11px]">
              {t.status === "Pending" && (
                <div className="flex gap-[5px]">
                  <button
                    className={okBtnClass}
                    onClick={() => {
                      setTransfers((p) =>
                        p.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                status: "Completed" as TRStatus,
                                approvedBy: "Owner",
                              }
                            : x,
                        ),
                      );
                      notify(
                        addNotification,
                        `${t.id} approved and completed.`,
                        "success",
                      );
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className={dangerBtnClass}
                    onClick={() => {
                      setTransfers((p) =>
                        p.map((x) =>
                          x.id === t.id
                            ? { ...x, status: "Cancelled" as TRStatus }
                            : x,
                        ),
                      );
                      notify(
                        addNotification,
                        `${t.id} has been cancelled.`,
                        "warning",
                      );
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </td>
          </tr>
        ))}
      />

      {showModal && (
        <SMModal
          title="New Stock Transfer"
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                Discard
              </button>
              <button className={primaryBtnClass} onClick={submitTR}>
                Submit Transfer
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-[10px]">
            <FormSelect
              label="From Branch"
              opts={BRANCHES}
              value={trFrom}
              onChange={(e) => setTrFrom(e.target.value)}
            />
            <FormSelect
              label="To Branch"
              opts={BRANCHES}
              value={trTo}
              onChange={(e) => setTrTo(e.target.value)}
            />
          </div>
          <FormSelect
            label="Item"
            opts={ITEMS}
            value={trItem}
            onChange={(e) => setTrItem(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput
              label="Quantity"
              type="number"
              placeholder="e.g. 20"
              value={trQty}
              onChange={(e) => setTrQty(e.target.value)}
            />
            <FormSelect
              label="Unit"
              opts={SM_UNITS}
              value={trUnit}
              onChange={(e) => setTrUnit(e.target.value)}
            />
          </div>
          <FormInput
            label="Transfer Date"
            type="date"
            value={trDate}
            onChange={(e) => setTrDate(e.target.value)}
          />
        </SMModal>
      )}
    </div>
  );
}

// ─── Stock Adjustment ─────────────────────────────────────────────────────────

function StockAdjustment() {
  const { addNotification } = useNotifications();
  const [adjustments, setAdjustments] = useState<Adjustment[]>(() =>
    loadLS("sm_adjustments", []),
  );
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("All");
  const [adjBranch, setAdjBranch] = useState<string>(BRANCHES[0]);
  const [adjItem, setAdjItem] = useState<string>(ITEMS[0]);
  const [adjQty, setAdjQty] = useState("");
  const [adjUnit, setAdjUnit] = useState<string>(SM_UNITS[0]);
  const [adjReason, setAdjReason] = useState<string>(REASONS[0]);
  const [adjDate, setAdjDate] = useState("");
  const [adjBy, setAdjBy] = useState("");

  useEffect(() => {
    saveLS("sm_adjustments", adjustments);
  }, [adjustments]);

  function resetForm() {
    setAdjBranch(BRANCHES[0]);
    setAdjItem(ITEMS[0]);
    setAdjQty("");
    setAdjUnit(SM_UNITS[0]);
    setAdjReason(REASONS[0]);
    setAdjDate("");
    setAdjBy("");
  }
  function submitAdj() {
    if (!adjQty || !adjDate || !adjBy) {
      notify(addNotification, "Please fill all required fields.", "warning");
      return;
    }
    setAdjustments((p) => [
      {
        id: "ADJ-" + String(p.length + 1).padStart(3, "0"),
        branch: adjBranch,
        item: adjItem,
        qty: parseFloat(adjQty) * -1,
        unit: adjUnit,
        reason: adjReason,
        date: adjDate,
        by: adjBy,
      },
      ...p,
    ]);
    setShowModal(false);
    resetForm();
    notify(addNotification, "Stock adjustment recorded.", "success");
  }

  const filtered = adjustments.filter(
    (a) => filter === "All" || a.reason === filter,
  );

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Adjustments"
          value={adjustments.length}
          color="blue"
        />
        <StatCard
          label="Spoilage"
          value={adjustments.filter((a) => a.reason === "Spoilage").length}
          color="yellow"
        />
        <StatCard
          label="Damaged"
          value={adjustments.filter((a) => a.reason === "Damaged").length}
          color="red"
        />
        <StatCard
          label="Other Reasons"
          value={
            adjustments.filter(
              (a) => a.reason !== "Spoilage" && a.reason !== "Damaged",
            ).length
          }
          color="blue"
        />
      </div>

      <SectionHeader
        title="Stock Adjustment"
        sub="Record spoilage, damage, theft, and manual corrections"
        cta={
          <button
            className={primaryBtnClass}
            onClick={() => setShowModal(true)}
          >
            + New Adjustment
          </button>
        }
      />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        {["All", ...REASONS].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-[13px] py-[5px] rounded-full text-[12px] font-semibold font-[Poppins,sans-serif] border cursor-pointer transition-all ${filter === f ? "bg-gray-700 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <DataTable
        cols={[
          "ADJ #",
          "Branch",
          "Item",
          "Adjustment",
          "Reason",
          "Date",
          "Recorded By",
        ]}
        emptyHint="No adjustments recorded yet."
        rows={filtered.map((a) => (
          <tr
            key={a.id}
            className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
          >
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">
              {a.id}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {a.branch}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {a.item}
            </td>
            <td
              className={`px-[14px] py-[11px] text-[12.5px] font-bold ${a.qty < 0 ? "text-red-600" : "text-green-700"}`}
            >
              {a.qty > 0 ? "+" : ""}
              {a.qty} {a.unit}
            </td>
            <td className="px-[14px] py-[11px]">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-50 text-yellow-700">
                {a.reason}
              </span>
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {a.date}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {a.by}
            </td>
          </tr>
        ))}
      />

      {showModal && (
        <SMModal
          title="New Stock Adjustment"
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                Discard
              </button>
              <button className={primaryBtnClass} onClick={submitAdj}>
                Save Adjustment
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-[10px]">
            <FormSelect
              label="Branch"
              opts={BRANCHES}
              value={adjBranch}
              onChange={(e) => setAdjBranch(e.target.value)}
            />
            <FormSelect
              label="Item"
              opts={ITEMS}
              value={adjItem}
              onChange={(e) => setAdjItem(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput
              label="Qty (deducted)"
              type="number"
              placeholder="e.g. 3"
              value={adjQty}
              onChange={(e) => setAdjQty(e.target.value)}
            />
            <FormSelect
              label="Unit"
              opts={SM_UNITS}
              value={adjUnit}
              onChange={(e) => setAdjUnit(e.target.value)}
            />
          </div>
          <FormSelect
            label="Reason"
            opts={REASONS}
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
          />
          <FormInput
            label="Date"
            type="date"
            value={adjDate}
            onChange={(e) => setAdjDate(e.target.value)}
          />
          <FormInput
            label="Recorded By"
            placeholder="Staff name"
            value={adjBy}
            onChange={(e) => setAdjBy(e.target.value)}
          />
        </SMModal>
      )}
    </div>
  );
}

// ─── Stock Logs ───────────────────────────────────────────────────────────────

function StockLogs() {
  const [logs] = useState<StockLog[]>(() => loadLS("sm_logs", []));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = logs.filter((l) => {
    const s = search.toLowerCase();
    return (
      (l.item.toLowerCase().includes(s) ||
        l.ref.toLowerCase().includes(s) ||
        l.by.toLowerCase().includes(s)) &&
      (filter === "All" || l.type === filter)
    );
  });

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Entries" value={logs.length} color="blue" />
        <StatCard
          label="Stock In"
          value={logs.filter((l) => l.type === "Stock In").length}
          color="green"
        />
        <StatCard
          label="Transfers"
          value={logs.filter((l) => l.type === "Transfer").length}
          color="blue"
        />
        <StatCard
          label="Adjustments"
          value={logs.filter((l) => l.type === "Adjustment").length}
          color="red"
        />
      </div>

      <SectionHeader
        title="Stock Logs"
        sub="Complete audit trail of all stock movements"
      />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
            placeholder="Search item, reference, staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {["All", "Stock In", "Transfer", "Adjustment"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-[13px] py-[5px] rounded-full text-[12px] font-semibold font-[Poppins,sans-serif] border cursor-pointer transition-all ${filter === f ? "bg-gray-700 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <DataTable
        cols={["Date", "Type", "Item", "Quantity", "Branch", "By", "Reference"]}
        emptyHint="No log entries yet."
        rows={filtered.map((l) => (
          <tr
            key={l.id}
            className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
          >
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500">
              {l.date}
            </td>
            <td className="px-[14px] py-[11px]">
              <TypeBadge type={l.type} />
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-medium text-gray-700">
              {l.item}
            </td>
            <td
              className={`px-[14px] py-[11px] text-[12.5px] font-bold ${l.qty.startsWith("+") ? "text-green-700" : "text-red-600"}`}
            >
              {l.qty}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">
              {l.branch}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500">
              {l.by}
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-semibold text-indigo-600">
              {l.ref}
            </td>
          </tr>
        ))}
      />
    </div>
  );
}

// ─── Stock Movement Tab ───────────────────────────────────────────────────────

function StockMovementTab() {
  const [activeSmTab, setActiveSmTab] = useState<SMTabKey>("po");

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
          Stock Movement
        </p>
        <h2 className="text-xl font-bold text-gray-900">Movement Records</h2>
        <p className="text-gray-500 text-sm mt-1">
          Purchase orders, deliveries, transfers, adjustments, and audit logs.
        </p>
      </div>

      <div className="flex border-b-[1.5px] border-gray-100 mb-[18px]">
        {SM_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSmTab(tab.key)}
            className={`px-4 py-2 text-[12.5px] font-semibold font-[Poppins,sans-serif] border-none bg-transparent cursor-pointer border-b-2 -mb-[1.5px] transition-all ${
              activeSmTab === tab.key
                ? "text-gray-900 border-b-gray-700"
                : "text-gray-400 border-b-transparent hover:text-gray-700 hover:bg-gray-50 rounded-t-md"
            }`}
            style={{
              borderBottom:
                activeSmTab === tab.key
                  ? "2px solid #374151"
                  : "2px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSmTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {activeSmTab === "po" && <PurchaseOrders />}
          {activeSmTab === "stockin" && <StockIn />}
          {activeSmTab === "transfer" && <StockTransfer />}
          {activeSmTab === "adjustment" && <StockAdjustment />}
          {activeSmTab === "logs" && <StockLogs />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Menu Management Tab ──────────────────────────────────────────────────────

interface MgmtProduct {
  id: number;
  rawProductId?: number;
  rawInventoryId?: number;
  menuCode: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  stock: number;
  description?: string;
  image?: string;
  availabilityStatus: string;
  manualOverride: boolean;
  manualStatus: string;
  overrideMode: ManualOverrideMode;
  availableServings?: number | null;
  isPromotional: boolean;
  promoPrice?: string;
  promoLabel?: string;
  ingredients: MenuIngredientInput[];
}

interface MenuIngredientRow {
  product_id?: number;
  product_name?: string;
  quantity_required?: number | string;
  unit?: string;
  daily_withdrawn?: number | string;
  stock?: number | string;
}

interface MenuIngredientInput {
  productId: string;
  quantityRequired: string;
  productName?: string;
  unit?: string;
  stock?: number;
}

interface IngredientOption {
  id: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
}

type ManualOverrideMode =
  | "Auto"
  | "Force Available"
  | "Force Out of Stock";

const UNIT_OPTIONS = [
  "piece",
  "kg",
  "g",
  "liter",
  "ml",
  "bottle",
  "box",
] as const;
const OVERRIDE_MODE_OPTIONS: ManualOverrideMode[] = [
  "Auto",
  "Force Available",
  "Force Out of Stock",
];

async function tryPut(endpoints: string[], payload: object): Promise<void> {
  let lastErr: unknown;
  for (const ep of endpoints) {
    try {
      await apiCall(ep, {
        method: "PUT",
        body: payload,
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/*
function MenuManagementTab() {
  const { addNotification } = useNotifications();
  const [products, setProducts] = useState<MgmtProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<MgmtProduct | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fCat, setFCat] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fUnit, setFUnit] = useState<string>(UNIT_OPTIONS[0]);
  const [fDesc, setFDesc] = useState("");
  const [fAvailabilityStatus, setFAvailabilityStatus] = useState<string>(
    AVAILABILITY_OPTIONS[0],
  );
  const [fIsPromotional, setFIsPromotional] = useState(false);
  const [fPromoPrice, setFPromoPrice] = useState("");
  const [fPromoLabel, setFPromoLabel] = useState("");
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState<string>("");

  const [eName, setEName] = useState("");
  const [eCat, setECat] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eUnit, setEUnit] = useState<string>(UNIT_OPTIONS[0]);
  const [eStock, setEStock] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eAvailabilityStatus, setEAvailabilityStatus] = useState<string>(
    AVAILABILITY_OPTIONS[0],
  );
  const [eIsPromotional, setEIsPromotional] = useState(false);
  const [ePromoPrice, setEPromoPrice] = useState("");
  const [ePromoLabel, setEPromoLabel] = useState("");
  const [eImageFile, setEImageFile] = useState<File | null>(null);
  const [eImagePreview, setEImagePreview] = useState<string>("");

  // ── Image helpers
  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function handleFImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFImageFile(file);
    setFImagePreview(URL.createObjectURL(file));
  }
  function handleEImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEImageFile(file);
    setEImagePreview(URL.createObjectURL(file));
  }

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = (await apiCall("/inventory", { method: "GET" })) as
        | ApiInventoryRow[]
        | null;
      if (data && Array.isArray(data)) {
        const rows = data.filter(
          (item) => String(item?.item_type ?? "stock_item").trim().toLowerCase() === "stock_item",
        );

        const groupedByName = new Map<string, ApiInventoryRow[]>();
        for (const item of rows) {
          const key = String(item?.product_name ?? item?.name ?? "").trim().toLowerCase();
          const group = groupedByName.get(key) ?? [];
          group.push(item);
          groupedByName.set(key, group);
        }

        const normalized = Array.from(groupedByName.values()).map((group) =>
          group.reduce((latest, current) => {
            const latestId = Number(latest?.product_id ?? latest?.id ?? latest?.inventory_id ?? 0);
            const currentId = Number(current?.product_id ?? current?.id ?? current?.inventory_id ?? 0);
            return currentId > latestId ? current : latest;
          }),
        );

        setProducts(
          normalized.map((item) => ({
            id: Number(item.product_id ?? item.inventory_id ?? item.id ?? 0),
            rawProductId: item.product_id ? Number(item.product_id) : undefined,
            rawInventoryId: item.inventory_id ? Number(item.inventory_id) : undefined,
            menuCode: String((item as any).menu_code ?? `M-${String(item.product_id ?? item.id ?? item.inventory_id ?? 0).padStart(3, "0")}`),
            name: item.name || item.product_name || "Unnamed Product",
            category: item.category || "Uncategorized",
            price: String(item.price ?? "0"),
            unit: String(item.unit ?? "piece"),
            stock: Number((item as any).quantity ?? (item as any).stock ?? 0),
            description: String((item as any).description ?? ""),
            image: item.image || "/img/placeholder.jpg",
            availabilityStatus: String(
              (item as any).availability_status ?? "Available",
            ),
            isPromotional: Boolean(Number((item as any).is_promotional ?? 0)),
            promoPrice:
              (item as any).promo_price !== null &&
              (item as any).promo_price !== undefined &&
              String((item as any).promo_price) !== ""
                ? String((item as any).promo_price)
                : "",
            promoLabel: String((item as any).promo_label ?? ""),
          })),
        );
      }
    } catch (error) {
      console.error("Failed to load products:", error);
      notify(addNotification, "Failed to load products. Please try refreshing.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  function resetAddForm() {
    setFName(""); setFCat(""); setFPrice("");
    setFDesc("");
    setFAvailabilityStatus(AVAILABILITY_OPTIONS[0]);
    setFIsPromotional(false);
    setFPromoPrice("");
    setFPromoLabel("");
    setFImageFile(null); setFImagePreview("");
  }

  function openEdit(p: MgmtProduct) {
    setEditProduct(p);
    setEName(p.name); setECat(p.category); setEPrice(p.price);
    setEStock(String(p.stock)); setEDesc(p.description ?? "");
    setEAvailabilityStatus(p.availabilityStatus || "Available");
    setEIsPromotional(Boolean(p.isPromotional));
    setEPromoPrice(p.promoPrice ?? "");
    setEPromoLabel(p.promoLabel ?? "");
    setEImageFile(null);
    setEImagePreview(p.image && p.image !== "/img/placeholder.jpg" ? p.image : "");
  }

  async function handleAdd() {
    if (!fName.trim() || !fCat.trim() || !fPrice.trim()) {
      notify(addNotification, "Please fill in Name, Category, and Price.", "warning");
      return;
    }
    try {
      setSaving(true);
      let imageUrl = "/img/placeholder.jpg";
      if (fImageFile) {
        imageUrl = await toBase64(fImageFile);
      }
      await api.post("/products", {
        name: fName.trim(), category: fCat.trim(),
        price: parseFloat(fPrice), unit: UNIT_OPTIONS[0],
        quantity: 0,
        description: fDesc.trim() || null,
        image: imageUrl,
        availability_status: fAvailabilityStatus,
        is_promotional: fIsPromotional,
        promo_price: fIsPromotional && fPromoPrice.trim() ? parseFloat(fPromoPrice) : null,
        promo_label: fIsPromotional ? fPromoLabel.trim() || null : null,
      });
      await loadProducts();
      setShowAdd(false);
      resetAddForm();
      notify(addNotification, `"${fName.trim()}" added successfully.`, "success");
    } catch (error) {
      notify(addNotification, `Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editProduct) return;
    if (!eName.trim() || !eCat.trim() || !ePrice.trim()) {
      notify(addNotification, "Please fill in Name, Category, and Price.", "warning");
      return;
    }
    try {
      setSaving(true);
      let editImageUrl: string | undefined;
      if (eImageFile) {
        editImageUrl = await toBase64(eImageFile);
      } else if (eImagePreview && eImagePreview !== "/img/placeholder.jpg") {
        editImageUrl = eImagePreview;
      }
      const payload: Record<string, unknown> = {
        name: eName.trim(), category: eCat.trim(),
        price: parseFloat(ePrice), unit: editProduct.unit || UNIT_OPTIONS[0],
        quantity: parseFloat(eStock) || 0,
        description: eDesc.trim() || null,
        availability_status: eAvailabilityStatus,
        is_promotional: eIsPromotional,
        promo_price: eIsPromotional && ePromoPrice.trim() ? parseFloat(ePromoPrice) : null,
        promo_label: eIsPromotional ? ePromoLabel.trim() || null : null,
      };
      if (editImageUrl) payload.image = editImageUrl;
      const endpointsToTry: string[] = [];
      const pid = editProduct.rawProductId ?? editProduct.id;
      const iid = editProduct.rawInventoryId;
      endpointsToTry.push(`/products/${pid}`);
      if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
      endpointsToTry.push(`/inventory/${pid}`);
      if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);
      await tryPut(endpointsToTry, payload);
      await loadProducts();
      notify(addNotification, `"${eName.trim()}" updated successfully.`, "success");
      setEditProduct(null);
    } catch (error) {
      notify(addNotification, `Failed to update: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const product = products.find((p) => p.id === id);
    const endpointsToTry: string[] = [];
    const pid = product?.rawProductId ?? id;
    const iid = product?.rawInventoryId;
    endpointsToTry.push(`/products/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
    endpointsToTry.push(`/inventory/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);
    try {
      setSaving(true);
      let lastErr: unknown;
      let deleted = false;
      for (const ep of endpointsToTry) {
        try {
          await apiCall(ep, { method: "DELETE" });
          deleted = true; break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
          lastErr = err;
        }
      }
      if (!deleted) throw lastErr;
      await loadProducts();
      setDeleteId(null);
      notify(addNotification, "Product deleted successfully.", "success");
    } catch (error) {
      notify(addNotification, `Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleStockUpdate(id: number, delta: number) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const newStock = Math.max(0, product.stock + delta);
    const payload = { quantity: newStock };
    const pid = product.rawProductId ?? id;
    const iid = product.rawInventoryId;
    const endpointsToTry: string[] = [];
    endpointsToTry.push(`/products/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
    endpointsToTry.push(`/inventory/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);
    try {
      await tryPut(endpointsToTry, payload);
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: newStock } : p)));
    } catch (error) {
      notify(addNotification, `Failed to update stock: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    }
  }

  async function handleAvailabilityToggle(product: MgmtProduct) {
    const nextStatus =
      product.availabilityStatus === "Hidden" ? "Available" : "Hidden";
    try {
      await tryPut([`/products/${product.rawProductId ?? product.id}`], {
        availability_status: nextStatus,
      });
      setProducts((prev) =>
        prev.map((entry) =>
          entry.id === product.id
            ? { ...entry, availabilityStatus: nextStatus }
            : entry,
        ),
      );
      notify(
        addNotification,
        `"${product.name}" is now ${nextStatus}.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to update availability: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }

  const filtered = products.filter((p) => {
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s) ||
      p.menuCode.toLowerCase().includes(s) ||
      String(p.promoLabel ?? "").toLowerCase().includes(s)
    );
  });

  const totalValue = products.reduce((sum, p) => {
    const price = parseFloat(String(p.price).replace(/[^0-9.]/g, "")) || 0;
    return sum + price * p.stock;
  }, 0);

  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 10).length;
  const outOfStock = products.filter((p) => p.stock === 0).length;
  const hiddenCount = products.filter((p) => p.availabilityStatus === "Hidden").length;
  const promoCount = products.filter((p) => p.isPromotional).length;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Menu Administration</p>
        <h2 className="text-xl font-bold text-gray-900">Menu Management</h2>
        <p className="text-gray-500 text-sm mt-1">Create, update, and maintain menu items, pricing, descriptions, images, units, and stock details.</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Menu Items" value={products.length} meta="In system" color="blue" />
        <StatCard label="Total Value" value={`₱${totalValue.toLocaleString()}`} meta="Stock value" color="green" />
        <StatCard label="Low Stock" value={lowStock} meta="≤ 10 units" color="yellow" />
        <StatCard label="Out of Stock" value={outOfStock} meta="Zero stock" color="red" />
      </div>

      <SectionHeader
        title="Menu Item List"
        sub="All menu and product records synced from your backend"
        cta={
          <div className="flex gap-2">
            <button className={primaryBtnClass} onClick={() => void loadProducts()} disabled={loading}>
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <button className={primaryBtnClass} onClick={() => setShowAdd(true)}>+ Add Menu Item</button>
          </div>
        }
      />

      <div className="mb-[14px]">
        <input
          className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
          placeholder="Search by name or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <motion.div
            className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-blue-500"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
          <p className="text-gray-400 text-sm">Loading products…</p>
        </div>
      ) : (
        <DataTable
          cols={["Product", "Category", "Price", "Unit", "Stock", "Actions"]}
          emptyHint="No menu items found. Try refreshing or add a new product."
          rows={filtered.map((p) => {
            const stockColor =
              p.stock === 0 ? "text-red-600 font-bold"
              : p.stock <= 10 ? "text-yellow-600 font-bold"
              : "text-gray-900 font-semibold";
            return (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
                <td className="px-[14px] py-[11px]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.image && p.image !== "/img/placeholder.jpg" ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-[10px] font-bold">{p.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-[12.5px] font-semibold text-gray-900">{p.name}</div>
                      {p.description && (
                        <div className="text-[11px] text-gray-400 max-w-[180px] truncate">{p.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-[14px] py-[11px]">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">{p.category}</span>
                </td>
                <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-green-700">
                  ₱{parseFloat(String(p.price).replace(/[^0-9.]/g, "")).toLocaleString()}
                </td>
                <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500">{p.unit}</td>
                <td className="px-[14px] py-[11px]">
                  <div className="flex items-center gap-2">
                    <button onClick={() => void handleStockUpdate(p.id, -1)} className="w-6 h-6 rounded-md bg-gray-100 text-gray-500 text-[14px] font-bold flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors border-none cursor-pointer leading-none">−</button>
                    <span className={`min-w-[36px] text-center text-[12.5px] ${stockColor}`}>{p.stock}</span>
                    <button onClick={() => void handleStockUpdate(p.id, 1)} className="w-6 h-6 rounded-md bg-gray-100 text-gray-500 text-[14px] font-bold flex items-center justify-center hover:bg-green-50 hover:text-green-600 transition-colors border-none cursor-pointer leading-none">+</button>
                    {p.stock === 0 && <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Out</span>}
                    {p.stock > 0 && p.stock <= 10 && <span className="text-[10px] font-semibold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full">Low</span>}
                  </div>
                </td>
                <td className="px-[14px] py-[11px]">
                  <div className="flex gap-[5px]">
                    <button className={ghostBtnClass} onClick={() => openEdit(p)}>Edit</button>
                    <button className={dangerBtnClass} onClick={() => setDeleteId(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        />
      )}

      {showAdd && (
        <SMModal title="Add Menu Item" onClose={() => { setShowAdd(false); resetAddForm(); }}
          footer={<>
            <button className={ghostBtnClass} onClick={() => { setShowAdd(false); resetAddForm(); }} disabled={saving}>Discard</button>
            <button className={primaryBtnClass} onClick={() => void handleAdd()} disabled={saving}>{saving ? "Saving…" : "Add Menu Item"}</button>
          </>}
        >
          <FormInput label="Menu Item Name *" placeholder="e.g. Chicken Breast" value={fName} onChange={(e) => setFName(e.target.value)} />
          <FormInput label="Category *" placeholder="e.g. Ingredients" value={fCat} onChange={(e) => setFCat(e.target.value)} />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput label="Price (₱) *" type="number" placeholder="0.00" value={fPrice} onChange={(e) => setFPrice(e.target.value)} />
            <FormGroup label="Unit"><select className={inputClass} value={fUnit} onChange={(e) => setFUnit(e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}</select></FormGroup>
          </div>
          <FormGroup label="Description (optional)"><textarea className={`${inputClass} resize-none`} rows={2} placeholder="Brief description…" value={fDesc} onChange={(e) => setFDesc(e.target.value)} /></FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden" style={{minHeight: fImagePreview ? "auto" : "80px"}}>
              {fImagePreview ? (
                <div className="relative w-full">
                  <img src={fImagePreview} alt="Preview" className="w-full h-[120px] object-cover" />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 hover:opacity-100 text-white text-[11px] font-semibold bg-black/50 px-2 py-1 rounded-md transition-opacity">Change image</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-[11px] text-gray-400 font-medium">Click to upload image</span>
                  <span className="text-[10px] text-gray-300">PNG, JPG up to 5MB</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleFImageChange} />
            </label>
            {fImagePreview && (
              <button type="button" className="mt-[6px] text-[11px] text-red-400 hover:text-red-600 font-semibold bg-transparent border-none cursor-pointer font-[Poppins,sans-serif]" onClick={() => { setFImageFile(null); setFImagePreview(""); }}>
                Remove image
              </button>
            )}
          </FormGroup>
        </SMModal>
      )}

      {editProduct && (
        <SMModal title={`Edit Menu Item — ${editProduct.name}`} onClose={() => setEditProduct(null)}
          footer={<>
            <button className={ghostBtnClass} onClick={() => setEditProduct(null)} disabled={saving}>Discard</button>
            <button className={primaryBtnClass} onClick={() => void handleEdit()} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
          </>}
        >
          <FormInput label="Menu Item Name *" placeholder="e.g. Chicken Breast" value={eName} onChange={(e) => setEName(e.target.value)} />
          <FormInput label="Category *" placeholder="e.g. Ingredients" value={eCat} onChange={(e) => setECat(e.target.value)} />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput label="Price (₱) *" type="number" placeholder="0.00" value={ePrice} onChange={(e) => setEPrice(e.target.value)} />
            <FormGroup label="Unit"><select className={inputClass} value={eUnit} onChange={(e) => setEUnit(e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}</select></FormGroup>
          </div>
          <FormInput label="Stock Qty" type="number" placeholder="0" value={eStock} onChange={(e) => setEStock(e.target.value)} />
          <FormGroup label="Description (optional)"><textarea className={`${inputClass} resize-none`} rows={2} placeholder="Brief description…" value={eDesc} onChange={(e) => setEDesc(e.target.value)} /></FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden" style={{minHeight: eImagePreview ? "auto" : "80px"}}>
              {eImagePreview ? (
                <div className="relative w-full">
                  <img src={eImagePreview} alt="Preview" className="w-full h-[120px] object-cover" />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 hover:opacity-100 text-white text-[11px] font-semibold bg-black/50 px-2 py-1 rounded-md transition-opacity">Change image</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-[11px] text-gray-400 font-medium">Click to upload image</span>
                  <span className="text-[10px] text-gray-300">PNG, JPG up to 5MB</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleEImageChange} />
            </label>
            {eImagePreview && (
              <button type="button" className="mt-[6px] text-[11px] text-red-400 hover:text-red-600 font-semibold bg-transparent border-none cursor-pointer font-[Poppins,sans-serif]" onClick={() => { setEImageFile(null); setEImagePreview(""); }}>
                Remove image
              </button>
            )}
          </FormGroup>
        </SMModal>
      )}

      {deleteId !== null && (
        <SMModal title="Delete Menu Item" onClose={() => setDeleteId(null)}
          footer={<>
            <button className={ghostBtnClass} onClick={() => setDeleteId(null)} disabled={saving}>Cancel</button>
            <button className={dangerBtnClass} onClick={() => void handleDelete(deleteId!)} disabled={saving}>{saving ? "Deleting…" : "Yes, Delete"}</button>
          </>}
        >
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Are you sure you want to delete{" "}
            <span className="font-bold text-gray-900">{products.find((p) => p.id === deleteId)?.name ?? "this menu item"}</span>
            ? This action cannot be undone.
          </p>
        </SMModal>
      )}
    </div>
  );
}
*/

function MenuAdminTab() {
  const { addNotification } = useNotifications();
  const [products, setProducts] = useState<MgmtProduct[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<MgmtProduct | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [fName, setFName] = useState("");
  const [fCat, setFCat] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fOverrideMode, setFOverrideMode] = useState<ManualOverrideMode>(
    OVERRIDE_MODE_OPTIONS[0],
  );
  const [fIngredients, setFIngredients] = useState<MenuIngredientInput[]>([]);
  const [fIsPromotional, setFIsPromotional] = useState(false);
  const [fPromoPrice, setFPromoPrice] = useState("");
  const [fPromoLabel, setFPromoLabel] = useState("");
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState("");

  const [eName, setEName] = useState("");
  const [eCat, setECat] = useState("");
  const [ePrice, setEPrice] = useState("");
  const [eStock, setEStock] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eOverrideMode, setEOverrideMode] = useState<ManualOverrideMode>(
    OVERRIDE_MODE_OPTIONS[0],
  );
  const [eIngredients, setEIngredients] = useState<MenuIngredientInput[]>([]);
  const [eIsPromotional, setEIsPromotional] = useState(false);
  const [ePromoPrice, setEPromoPrice] = useState("");
  const [ePromoLabel, setEPromoLabel] = useState("");
  const [eImageFile, setEImageFile] = useState<File | null>(null);
  const [eImagePreview, setEImagePreview] = useState("");

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function toOverrideMode(
    manualOverride: unknown,
    manualStatus: unknown,
  ): ManualOverrideMode {
    const isManual =
      manualOverride === true ||
      manualOverride === 1 ||
      String(manualOverride ?? "").trim().toLowerCase() === "true";
    if (!isManual) return "Auto";
    return String(manualStatus ?? "").trim().toLowerCase() === "out of stock"
      ? "Force Out of Stock"
      : "Force Available";
  }

  function toIngredientsInput(
    ingredients: MenuIngredientRow[] | undefined,
  ): MenuIngredientInput[] {
    return (ingredients ?? []).map((ingredient) => ({
      productId: String(ingredient.product_id ?? ""),
      quantityRequired: String(ingredient.quantity_required ?? ""),
      productName: ingredient.product_name,
      unit: ingredient.unit,
      stock: Number(ingredient.stock ?? 0),
    }));
  }

  function toOverridePayload(mode: ManualOverrideMode) {
    if (mode === "Force Available") {
      return { manual_override: true, manual_status: "Available" };
    }
    if (mode === "Force Out of Stock") {
      return { manual_override: true, manual_status: "Out of Stock" };
    }
    return { manual_override: false, manual_status: "Available" };
  }

  function buildIngredientPayload(inputs: MenuIngredientInput[]) {
    const sanitized = inputs
      .map((entry) => ({
        productId: entry.productId.trim(),
        quantityRequired: entry.quantityRequired.trim(),
      }))
      .filter(
        (entry) =>
          entry.productId.length > 0 || entry.quantityRequired.length > 0,
      );

    for (const entry of sanitized) {
      if (!entry.productId || !entry.quantityRequired) {
        throw new Error(
          "Each ingredient row needs both an ingredient and a required quantity.",
        );
      }
      if (Number(entry.quantityRequired) <= 0) {
        throw new Error("Ingredient quantities must be greater than zero.");
      }
    }

    return sanitized.map((entry) => ({
      product_id: Number(entry.productId),
      quantity_required: Number(entry.quantityRequired),
    }));
  }

  function addIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
  ) {
    setter((prev) => [...prev, { productId: "", quantityRequired: "" }]);
  }

  function updateIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
    index: number,
    field: "productId" | "quantityRequired",
    value: string,
  ) {
    setter((prev) =>
      prev.map((entry, rowIndex) =>
        rowIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function removeIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
    index: number,
  ) {
    setter((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  function renderOverrideButtons(
    value: ManualOverrideMode,
    onChange: (mode: ManualOverrideMode) => void,
  ) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {OVERRIDE_MODE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
              value === option
                ? "border-gray-800 bg-gray-800 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
            }`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  function renderIngredientsEditor(
    value: MenuIngredientInput[],
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
  ) {
    return (
      <FormGroup label="Required Ingredients">
        <div className="space-y-2">
          {value.length === 0 && (
            <p className="text-[11px] text-gray-400">
              No ingredients assigned. This menu item will fall back to the
              existing stock-based availability.
            </p>
          )}
          {value.map((ingredient, index) => (
            <div key={`${ingredient.productId}-${index}`} className="grid grid-cols-3 gap-2">
              <select
                className={inputClass}
                value={ingredient.productId}
                onChange={(e) =>
                  updateIngredientRow(setter, index, "productId", e.target.value)
                }
              >
                <option value="">Select ingredient</option>
                {ingredientOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.category})
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                placeholder="Qty required"
                value={ingredient.quantityRequired}
                onChange={(e) =>
                  updateIngredientRow(
                    setter,
                    index,
                    "quantityRequired",
                    e.target.value,
                  )
                }
              />
              <button
                type="button"
                className={dangerBtnClass}
                onClick={() => removeIngredientRow(setter, index)}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={ghostBtnClass}
            onClick={() => addIngredientRow(setter)}
          >
            + Add Ingredient
          </button>
        </div>
      </FormGroup>
    );
  }

  function normalizeManagementRows(data: ApiInventoryRow[]) {
    const rows = data.filter(
      (item) => String(item?.item_type ?? "menu_item").trim().toLowerCase() === "menu_item",
    );

    const groupedByName = new Map<string, ApiInventoryRow[]>();
    for (const item of rows) {
      const key = String(item?.product_name ?? item?.name ?? "")
        .trim()
        .toLowerCase();
      const group = groupedByName.get(key) ?? [];
      group.push(item);
      groupedByName.set(key, group);
    }

    return Array.from(groupedByName.values()).map((group) =>
      group.reduce((latest, current) => {
        const latestId = Number(
          latest?.product_id ?? latest?.id ?? latest?.inventory_id ?? 0,
        );
        const currentId = Number(
          current?.product_id ?? current?.id ?? current?.inventory_id ?? 0,
        );
        return currentId > latestId ? current : latest;
      }),
    );
  }

  const loadProducts = async () => {
    try {
      setLoading(true);
      const [menuData, stockData] = await Promise.all([
        apiCall("/products?item_type=menu_item", { method: "GET" }),
        apiCall("/inventory", { method: "GET" }),
      ]);
      const productData = Array.isArray(menuData) ? (menuData as ApiInventoryRow[]) : [];
      const inventoryData = Array.isArray(stockData) ? (stockData as ApiInventoryRow[]) : [];

      const allOptions = inventoryData
        .filter(
          (item) => String(item?.item_type ?? "stock_item").trim().toLowerCase() === "stock_item",
        )
        .map((item) => ({
          id: Number(item.product_id ?? item.id ?? item.inventory_id ?? 0),
          name: String(item.product_name ?? item.name ?? "Unnamed Product"),
          category: String(item.category ?? "Uncategorized"),
          unit: String(item.unit ?? "piece"),
          stock: Number(item.dailyWithdrawn ?? item.quantity ?? item.stock ?? 0),
        }))
        .filter((item) => item.id > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      setIngredientOptions(allOptions);

      const normalized = normalizeManagementRows(productData);
      setProducts(
        normalized.map((item) => ({
          id: Number(item.product_id ?? item.inventory_id ?? item.id ?? 0),
          rawProductId: item.product_id ? Number(item.product_id) : undefined,
          rawInventoryId: item.inventory_id
            ? Number(item.inventory_id)
            : undefined,
          menuCode: String(
            item.menu_code ??
              `M-${String(
                item.product_id ?? item.id ?? item.inventory_id ?? 0,
              ).padStart(3, "0")}`,
          ),
          name: item.name || item.product_name || "Unnamed Product",
          category: item.category || "Uncategorized",
          price: String(item.price ?? "0"),
          unit: String(item.unit ?? "piece"),
          stock: Number((item as any).quantity ?? (item as any).stock ?? 0),
          description: String((item as any).description ?? ""),
          image: item.image || "/img/placeholder.jpg",
          availabilityStatus: String(item.availability_status ?? "Available"),
          manualOverride: Boolean(Number(item.manual_override ?? 0)),
          manualStatus: String(item.manual_status ?? "Available"),
          overrideMode: toOverrideMode(
            item.manual_override,
            item.manual_status,
          ),
          availableServings:
            item.available_servings === null ||
            item.available_servings === undefined ||
            String(item.available_servings) === ""
              ? null
              : Number(item.available_servings),
          isPromotional: Boolean(Number(item.is_promotional ?? 0)),
          promoPrice:
            item.promo_price !== null &&
            item.promo_price !== undefined &&
            String(item.promo_price) !== ""
              ? String(item.promo_price)
              : "",
          promoLabel: String(item.promo_label ?? ""),
          ingredients: toIngredientsInput(item.ingredients),
        })),
      );
    } catch (error) {
      console.error("Failed to load products:", error);
      notify(
        addNotification,
        "Failed to load products. Please try refreshing.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  function resetAddForm() {
    setFName("");
    setFCat("");
    setFPrice("");
    setFDesc("");
    setFOverrideMode(OVERRIDE_MODE_OPTIONS[0]);
    setFIngredients([]);
    setFIsPromotional(false);
    setFPromoPrice("");
    setFPromoLabel("");
    setFImageFile(null);
    setFImagePreview("");
  }

  function openEdit(product: MgmtProduct) {
    setEditProduct(product);
    setEName(product.name);
    setECat(product.category);
    setEPrice(product.price);
    setEStock(String(product.stock));
    setEDesc(product.description ?? "");
    setEOverrideMode(product.overrideMode);
    setEIngredients(product.ingredients);
    setEIsPromotional(Boolean(product.isPromotional));
    setEPromoPrice(product.promoPrice ?? "");
    setEPromoLabel(product.promoLabel ?? "");
    setEImageFile(null);
    setEImagePreview(
      product.image && product.image !== "/img/placeholder.jpg"
        ? product.image
        : "",
    );
  }

  async function handleAdd() {
    if (!fName.trim() || !fCat.trim() || !fPrice.trim()) {
      notify(
        addNotification,
        "Please fill in Name, Category, and Price.",
        "warning",
      );
      return;
    }

    try {
      setSaving(true);
      let imageUrl = "/img/placeholder.jpg";
      if (fImageFile) imageUrl = await toBase64(fImageFile);
      const ingredients = buildIngredientPayload(fIngredients);
      const manualOverridePayload = toOverridePayload(fOverrideMode);

      await api.post("/products", {
        name: fName.trim(),
        category: fCat.trim(),
        item_type: "menu_item",
        price: parseFloat(fPrice),
        unit: UNIT_OPTIONS[0],
        quantity: 0,
        description: fDesc.trim() || null,
        image: imageUrl,
        ...manualOverridePayload,
        override_mode: fOverrideMode,
        is_promotional: fIsPromotional,
        promo_price:
          fIsPromotional && fPromoPrice.trim()
            ? parseFloat(fPromoPrice)
            : null,
        promo_label: fIsPromotional ? fPromoLabel.trim() || null : null,
        ingredients,
      });

      await loadProducts();
      setShowAdd(false);
      resetAddForm();
      notify(
        addNotification,
        `"${fName.trim()}" added successfully.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editProduct) return;
    if (!eName.trim() || !eCat.trim() || !ePrice.trim()) {
      notify(
        addNotification,
        "Please fill in Name, Category, and Price.",
        "warning",
      );
      return;
    }

    try {
      setSaving(true);
      let editImageUrl: string | undefined;
      if (eImageFile) {
        editImageUrl = await toBase64(eImageFile);
      } else if (eImagePreview && eImagePreview !== "/img/placeholder.jpg") {
        editImageUrl = eImagePreview;
      }

      const payload: Record<string, unknown> = {
        name: eName.trim(),
        category: eCat.trim(),
        item_type: "menu_item",
        price: parseFloat(ePrice),
        unit: editProduct.unit || UNIT_OPTIONS[0],
        quantity: parseFloat(eStock) || 0,
        description: eDesc.trim() || null,
        ...toOverridePayload(eOverrideMode),
        override_mode: eOverrideMode,
        is_promotional: eIsPromotional,
        promo_price:
          eIsPromotional && ePromoPrice.trim()
            ? parseFloat(ePromoPrice)
            : null,
        promo_label: eIsPromotional ? ePromoLabel.trim() || null : null,
        ingredients: buildIngredientPayload(eIngredients),
      };
      if (editImageUrl) payload.image = editImageUrl;

      await tryPut([`/products/${editProduct.rawProductId ?? editProduct.id}`], payload);
      await loadProducts();
      setEditProduct(null);
      notify(
        addNotification,
        `"${eName.trim()}" updated successfully.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to update: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const product = products.find((entry) => entry.id === id);
    const endpointsToTry: string[] = [];
    const pid = product?.rawProductId ?? id;
    const iid = product?.rawInventoryId;
    endpointsToTry.push(`/products/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/products/${iid}`);
    endpointsToTry.push(`/inventory/${pid}`);
    if (iid && iid !== pid) endpointsToTry.push(`/inventory/${iid}`);

    try {
      setSaving(true);
      let lastErr: unknown;
      let deleted = false;
      for (const endpoint of endpointsToTry) {
        try {
          await apiCall(endpoint, { method: "DELETE" });
          deleted = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
          lastErr = err;
        }
      }
      if (!deleted) throw lastErr;
      await loadProducts();
      setDeleteId(null);
      notify(addNotification, "Product deleted successfully.", "success");
    } catch (error) {
      notify(
        addNotification,
        `Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAvailabilityToggle(product: MgmtProduct) {
    const nextMode: ManualOverrideMode =
      product.overrideMode === "Auto" ? "Force Out of Stock" : "Auto";
    try {
      await tryPut([`/products/${product.rawProductId ?? product.id}`], {
        ...toOverridePayload(nextMode),
        override_mode: nextMode,
      });
      await loadProducts();
      notify(
        addNotification,
        `"${product.name}" override set to ${nextMode}.`,
        "success",
      );
    } catch (error) {
      notify(
        addNotification,
        `Failed to update availability: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }

  const filtered = products.filter((product) => {
    const term = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term) ||
      product.menuCode.toLowerCase().includes(term) ||
      String(product.promoLabel ?? "").toLowerCase().includes(term)
    );
  });

  const totalValue = products.reduce((sum, product) => {
    const price = parseFloat(String(product.price).replace(/[^0-9.]/g, "")) || 0;
    return sum + price * product.stock;
  }, 0);
  const hiddenCount = products.filter(
    (product) => product.availabilityStatus === "Out of Stock",
  ).length;
  const promoCount = products.filter((product) => product.isPromotional).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
          Menu Administration
        </p>
        <h2 className="text-xl font-bold text-gray-900">Menu Management</h2>
        <p className="text-gray-500 text-sm mt-1">
          Add, edit, hide, promote, and maintain menu items, prices,
          categories, descriptions, images, ingredients, and availability.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Menu Items"
          value={products.length}
          meta="In system"
          color="blue"
        />
        <StatCard
          label="Promotional"
          value={promoCount}
          meta="Special menus"
          color="green"
        />
        <StatCard
          label="Unavailable"
          value={hiddenCount}
          meta="Currently out of stock"
          color="yellow"
        />
        <StatCard
          label="Menu Value"
          value={`P${totalValue.toLocaleString()}`}
          meta={`${outOfStockCount} with zero stock record`}
          color="red"
        />
      </div>

      <SectionHeader
        title="Menu Item List"
        sub="Menu codes, pricing, promotions, and admin-controlled availability in one place"
        cta={
          <div className="flex gap-2">
            <button
              className={primaryBtnClass}
              onClick={() => void loadProducts()}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className={primaryBtnClass}
              onClick={() => setShowAdd(true)}
            >
              + Add Menu Item
            </button>
          </div>
        }
      />

      <div className="mb-[14px]">
        <input
          className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
          placeholder="Search by menu code, name, category, or promo label..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <motion.div
            className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-blue-500"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
          <p className="text-gray-400 text-sm">Loading menu items...</p>
        </div>
      ) : (
        <DataTable
          cols={[
            "Menu Code",
            "Image",
            "Name",
            "Category",
            "Price",
            "Promo",
            "Status",
            "Actions",
          ]}
          emptyHint="No menu items found. Try refreshing or add a new product."
          rows={filtered.map((product) => (
            <tr
              key={product.id}
              className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0"
            >
              <td className="px-[14px] py-[11px] text-[12px] font-bold text-indigo-600">
                {product.menuCode}
              </td>
              <td className="px-[14px] py-[11px]">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {product.image && product.image !== "/img/placeholder.jpg" ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 text-[10px] font-bold">
                      {product.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-[14px] py-[11px]">
                <div>
                  <div className="text-[12.5px] font-semibold text-gray-900">
                    {product.name}
                  </div>
                  {product.description && (
                    <div className="text-[11px] text-gray-400 max-w-[180px] truncate">
                      {product.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-[14px] py-[11px]">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
                  {product.category}
                </span>
              </td>
              <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-green-700">
                P{parseFloat(String(product.price).replace(/[^0-9.]/g, "")).toLocaleString()}
              </td>
              <td className="px-[14px] py-[11px]">
                {product.isPromotional ? (
                  <div className="flex flex-col gap-1">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pink-50 text-pink-700">
                      {product.promoLabel || "Promotional"}
                    </span>
                    {product.promoPrice && (
                      <span className="text-[11px] font-semibold text-pink-700">
                        P{parseFloat(String(product.promoPrice).replace(/[^0-9.]/g, "")).toLocaleString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[12px] text-gray-400">Standard</span>
                )}
              </td>
              <td className="px-[14px] py-[11px]">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    product.availabilityStatus === "Out of Stock"
                      ? "bg-gray-200 text-gray-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {product.availabilityStatus}
                </span>
                <div className="mt-1 text-[10px] text-gray-400">
                  {product.overrideMode === "Auto"
                    ? product.ingredients.length > 0
                      ? "Auto from ingredients"
                      : "Auto from stock fallback"
                    : product.overrideMode}
                </div>
              </td>
              <td className="px-[14px] py-[11px]">
                <div className="flex gap-[5px]">
                  <button
                    className={ghostBtnClass}
                    onClick={() => openEdit(product)}
                  >
                    Edit
                  </button>
                  <button
                    className={ghostBtnClass}
                    onClick={() => void handleAvailabilityToggle(product)}
                  >
                    {product.overrideMode === "Auto"
                      ? "Force Out"
                      : "Set Auto"}
                  </button>
                  <button
                    className={dangerBtnClass}
                    onClick={() => setDeleteId(product.id)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        />
      )}

      {showAdd && (
        <SMModal
          title="Add Menu Item"
          onClose={() => {
            setShowAdd(false);
            resetAddForm();
          }}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => {
                  setShowAdd(false);
                  resetAddForm();
                }}
                disabled={saving}
              >
                Discard
              </button>
              <button
                className={primaryBtnClass}
                onClick={() => void handleAdd()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Add Menu Item"}
              </button>
            </>
          }
        >
          <FormInput
            label="Menu Item Name *"
            placeholder="e.g. Chicken Breast"
            value={fName}
            onChange={(e) => setFName(e.target.value)}
          />
          <FormInput
            label="Category *"
            placeholder="e.g. Menu Food"
            value={fCat}
            onChange={(e) => setFCat(e.target.value)}
          />
          <FormInput
            label="Price (P) *"
            type="number"
            placeholder="0.00"
            value={fPrice}
            onChange={(e) => setFPrice(e.target.value)}
          />
          <FormGroup label="Availability Mode">
            {renderOverrideButtons(fOverrideMode, setFOverrideMode)}
          </FormGroup>
          {renderIngredientsEditor(fIngredients, setFIngredients)}
          <FormGroup label="Promotional Menu">
            <label className="flex items-center gap-2 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={fIsPromotional}
                onChange={(e) => setFIsPromotional(e.target.checked)}
              />
              Mark this menu item as promotional
            </label>
          </FormGroup>
          {fIsPromotional && (
            <div className="grid grid-cols-2 gap-[10px]">
              <FormInput
                label="Promo Price"
                type="number"
                placeholder="0.00"
                value={fPromoPrice}
                onChange={(e) => setFPromoPrice(e.target.value)}
              />
              <FormInput
                label="Promo Label"
                placeholder="e.g. Summer Special"
                value={fPromoLabel}
                onChange={(e) => setFPromoLabel(e.target.value)}
              />
            </div>
          )}
          <FormGroup label="Description (optional)">
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Brief description..."
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label
              className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden"
              style={{ minHeight: fImagePreview ? "auto" : "80px" }}
            >
              {fImagePreview ? (
                <img
                  src={fImagePreview}
                  alt="Preview"
                  className="w-full h-[120px] object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <span className="text-[11px] text-gray-400 font-medium">
                    Click to upload image
                  </span>
                  <span className="text-[10px] text-gray-300">
                    PNG, JPG up to 5MB
                  </span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setFImageFile(file);
                  setFImagePreview(URL.createObjectURL(file));
                }}
              />
            </label>
          </FormGroup>
        </SMModal>
      )}

      {editProduct && (
        <SMModal
          title={`Edit Menu Item - ${editProduct.name}`}
          onClose={() => setEditProduct(null)}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => setEditProduct(null)}
                disabled={saving}
              >
                Discard
              </button>
              <button
                className={primaryBtnClass}
                onClick={() => void handleEdit()}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          }
        >
          <div className="mb-3 text-[12px] font-semibold text-indigo-600">
            Menu Code: {editProduct.menuCode}
          </div>
          <FormInput
            label="Menu Item Name *"
            placeholder="e.g. Chicken Breast"
            value={eName}
            onChange={(e) => setEName(e.target.value)}
          />
          <FormInput
            label="Category *"
            placeholder="e.g. Menu Food"
            value={eCat}
            onChange={(e) => setECat(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput
              label="Price (P) *"
              type="number"
              placeholder="0.00"
              value={ePrice}
              onChange={(e) => setEPrice(e.target.value)}
            />
            <FormInput
              label="Stock Qty"
              type="number"
              placeholder="0"
              value={eStock}
              onChange={(e) => setEStock(e.target.value)}
            />
          </div>
          <FormGroup label="Availability Mode">
            {renderOverrideButtons(eOverrideMode, setEOverrideMode)}
            <p className="mt-2 text-[11px] text-gray-400">
              Current customer status: {editProduct.availabilityStatus}
            </p>
          </FormGroup>
          {renderIngredientsEditor(eIngredients, setEIngredients)}
          <FormGroup label="Promotional Menu">
            <label className="flex items-center gap-2 text-[12px] text-gray-700">
              <input
                type="checkbox"
                checked={eIsPromotional}
                onChange={(e) => setEIsPromotional(e.target.checked)}
              />
              Mark this menu item as promotional
            </label>
          </FormGroup>
          {eIsPromotional && (
            <div className="grid grid-cols-2 gap-[10px]">
              <FormInput
                label="Promo Price"
                type="number"
                placeholder="0.00"
                value={ePromoPrice}
                onChange={(e) => setEPromoPrice(e.target.value)}
              />
              <FormInput
                label="Promo Label"
                placeholder="e.g. Summer Special"
                value={ePromoLabel}
                onChange={(e) => setEPromoLabel(e.target.value)}
              />
            </div>
          )}
          <FormGroup label="Description (optional)">
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Brief description..."
              value={eDesc}
              onChange={(e) => setEDesc(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Menu Item Image (optional)">
            <label
              className="flex flex-col items-center justify-center w-full border-[1.5px] border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all overflow-hidden"
              style={{ minHeight: eImagePreview ? "auto" : "80px" }}
            >
              {eImagePreview ? (
                <img
                  src={eImagePreview}
                  alt="Preview"
                  className="w-full h-[120px] object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 py-5">
                  <span className="text-[11px] text-gray-400 font-medium">
                    Click to upload image
                  </span>
                  <span className="text-[10px] text-gray-300">
                    PNG, JPG up to 5MB
                  </span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setEImageFile(file);
                  setEImagePreview(URL.createObjectURL(file));
                }}
              />
            </label>
          </FormGroup>
        </SMModal>
      )}

      {deleteId !== null && (
        <SMModal
          title="Delete Menu Item"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button
                className={ghostBtnClass}
                onClick={() => setDeleteId(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className={dangerBtnClass}
                onClick={() => void handleDelete(deleteId!)}
                disabled={saving}
              >
                {saving ? "Deleting..." : "Yes, Delete"}
              </button>
            </>
          }
        >
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Are you sure you want to delete{" "}
            <span className="font-bold text-gray-900">
              {products.find((product) => product.id === deleteId)?.name ??
                "this menu item"}
            </span>
            ? This action cannot be undone.
          </p>
        </SMModal>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const now = useNow();
  const { addNotification } = useNotifications();
  const [pageTab, setPageTab] = useState<PageTab>("menu");
  const [loading, setLoading] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // ── Inventory tab filter state
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");

  const loadInventory = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const data = (await apiCall("/inventory", { method: "GET" })) as
        | ApiInventoryRow[]
        | null;
      if (data && Array.isArray(data)) {
        const inventoryRows = data.filter(
          (item) => String(item?.item_type ?? "stock_item").trim().toLowerCase() === "stock_item",
        );

        const groupedByName = new Map<string, ApiInventoryRow[]>();
        for (const item of inventoryRows) {
          const key = String(item?.product_name ?? item?.name ?? "").trim().toLowerCase();
          const group = groupedByName.get(key) ?? [];
          group.push(item);
          groupedByName.set(key, group);
        }

        const normalizedRows = Array.from(groupedByName.values()).map((group) =>
          group.reduce((latest, current) => {
            const latestId = Number(latest?.product_id ?? latest?.id ?? latest?.inventory_id ?? 0);
            const currentId = Number(current?.product_id ?? current?.id ?? current?.inventory_id ?? 0);
            return currentId > latestId ? current : latest;
          }),
        );

        setInventoryItems(
          normalizedRows.map((item) => ({
            id: Number(item.product_id ?? item.inventory_id ?? item.id ?? 0),
            name: item.name || item.product_name || "Unnamed Product",
            category: item.category || "Uncategorized",
            image: item.image || "/img/placeholder.jpg",
            incoming: 0,
            stock: Number(
              (item as any).stock ??
                (item as any).quantity ??
                (item as any).dailyWithdrawn ??
                0,
            ),
            price: item.price?.toString() || "0",
            unit: (item.unit as UnitType) || "piece",
            batches: (item.batches || []).map((b: Batch) => ({
              ...b,
              receivedAt: new Date(b.receivedAt),
              expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined,
            })),
            totalUsedToday: 0,
          })),
        );
      }
    } catch (error) {
      console.error("Failed to load inventory:", error);
      notify(addNotification, "Failed to load inventory. Please try again.", "error");
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const handleAddProduct = async (
    productData: Partial<InventoryItem> & { description?: string },
  ) => {
    try {
      const created = await api.post<{ id?: number }>("/products", {
        name: productData.name,
        category: productData.category,
        item_type: "stock_item",
        price: productData.price,
        unit: productData.unit,
        quantity: productData.stock ?? 0,
        description: productData.description ?? null,
        image: productData.image || "/img/placeholder.jpg",
      });

      const optimisticItem: InventoryItem = {
        id: Number(created?.id ?? Date.now()),
        name: String(productData.name ?? "Unnamed Product"),
        category: String(productData.category ?? "Uncategorized"),
        image: String(productData.image ?? "/img/placeholder.jpg"),
        incoming: 0,
        stock: Number(productData.stock ?? 0),
        price: String(productData.price ?? "0"),
        unit: (productData.unit as UnitType) || "piece",
        batches: [],
        totalUsedToday: 0,
      };
      setInventoryItems((prev) => [optimisticItem, ...prev]);
      void loadInventory(false);
      notify(addNotification, "Product added successfully!", "success");
    } catch (error) {
      console.error("Failed to add product:", error);
      notify(addNotification, `Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    try {
      await apiCall(`/products/${productId}`, { method: "DELETE" });
      setInventoryItems((prev) => prev.filter((item) => item.id !== productId));
      notify(addNotification, "Product deleted successfully!", "success");
    } catch (error) {
      console.error("Failed to delete product:", error);
      notify(addNotification, `Failed to delete product: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    }
  };

  // ── Derived counts for filter badges
  const inStockCount = inventoryItems.filter((i) => i.stock > 10).length;
  const lowStockCount = inventoryItems.filter((i) => i.stock > 0 && i.stock <= 10).length;
  const outOfStockCount = inventoryItems.filter((i) => i.stock === 0).length;

  // ── Filtered items passed to InventoryClient
  const filteredInventoryItems = inventoryItems.filter((item) => {
    if (inventoryFilter === "in_stock") return item.stock > 10;
    if (inventoryFilter === "low_stock") return item.stock > 0 && item.stock <= 10;
    if (inventoryFilter === "out_of_stock") return item.stock === 0;
    return true;
  });

  const totalStock = inventoryItems.reduce((sum, item) => sum + item.stock, 0);
  return (
    <div className="flex min-h-screen bg-gray-50 font-[Poppins,sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">
        {/* Page header + clock */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-2 flex items-start justify-between"
        >
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Menu Administration</p>
            <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
          </div>
          <div className="flex flex-col items-end select-none">
            <p className="text-base font-semibold text-gray-700 tabular-nums">
              {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </motion.div>

        {/* Top-level tabs */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex bg-gray-100 rounded-[14px] p-1 gap-0.5">
            {[
              { key: "menu" as PageTab, label: "Menu Management" },
              { key: "movement" as PageTab, label: "Stock Movement" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setPageTab(tab.key)}
                className={`relative px-7 py-[9px] text-[13px] font-semibold font-[Poppins,sans-serif] border-none cursor-pointer rounded-[10px] transition-colors whitespace-nowrap z-[1] ${
                  pageTab === tab.key ? "text-gray-900" : "text-gray-400 hover:text-gray-700 bg-transparent"
                }`}
              >
                {pageTab === tab.key && (
                  <motion.span
                    className="absolute inset-0 bg-white rounded-[10px] z-0"
                    style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)" }}
                    layoutId="pageTabSlider"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span className="relative z-[1]">{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ── Menu Management tab */}
          {pageTab === "menu" && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              <MenuAdminTab />
            </motion.div>
          )}

          {/* ── Menu Overview tab */}
          {false && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {/* Stat cards — clicking them sets the filter */}
              <div className="grid grid-cols-4 gap-5 mb-8">
                {[
                  {
                    label: "Total Menu Items",
                    value: inventoryItems.length,
                    filterKey: "all" as InventoryFilter,
                    icon: <Package className="w-[18px] h-[18px]" />,
                    iconBg: "bg-blue-50",
                    iconColor: "text-blue-500",
                    ringColor: "#4f46e5",
                  },
                  {
                    label: "Available Stock",
                    value: totalStock,
                    filterKey: "in_stock" as InventoryFilter,
                    icon: <Archive className="w-[18px] h-[18px]" />,
                    iconBg: "bg-emerald-50",
                    iconColor: "text-emerald-500",
                    ringColor: "#16a34a",
                  },
                  {
                    label: "Low Stock",
                    value: lowStockCount,
                    filterKey: "low_stock" as InventoryFilter,
                    icon: <RefreshCw className="w-[18px] h-[18px]" />,
                    iconBg: "bg-yellow-50",
                    iconColor: "text-yellow-500",
                    ringColor: "#ca8a04",
                  },
                  {
                    label: "Unavailable",
                    value: outOfStockCount,
                    filterKey: "out_of_stock" as InventoryFilter,
                    icon: <Package className="w-[18px] h-[18px]" />,
                    iconBg: "bg-red-50",
                    iconColor: "text-red-400",
                    ringColor: "#dc2626",
                  },
                ].map((stat, i) => {
                  const isActive = inventoryFilter === stat.filterKey;
                  return (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                      onClick={() => setInventoryFilter(stat.filterKey)}
                      className={`bg-white rounded-2xl p-5 shadow-sm border flex items-center gap-4 cursor-pointer select-none transition-all hover:shadow-md ${
                        isActive
                          ? "border-transparent shadow-md"
                          : "border-gray-100 hover:border-gray-200"
                      }`}
                      style={
                        isActive
                          ? { outline: `2px solid ${stat.ringColor}`, outlineOffset: "2px" }
                          : {}
                      }
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.iconBg} ${stat.iconColor}`}
                      >
                        {stat.icon}
                      </div>
                      <div>
                        <p className="text-[26px] font-bold text-gray-900 leading-none">
                          {stat.value}
                        </p>
                        <p className="text-[12px] text-gray-400 mt-1 font-medium">
                          {stat.label}
                        </p>
                      </div>
                      {isActive && (
                        <div
                          className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: stat.ringColor }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Filter pill buttons */}
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                <span className="text-[11.5px] text-gray-400 font-semibold uppercase tracking-[0.5px] mr-1">
                  Filter:
                </span>
                {INVENTORY_FILTERS.map((f) => {
                  const count =
                    f.key === "all"
                      ? inventoryItems.length
                      : f.key === "in_stock"
                        ? inStockCount
                        : f.key === "low_stock"
                          ? lowStockCount
                          : outOfStockCount;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setInventoryFilter(f.key)}
                      className={`px-[13px] py-[5px] rounded-full text-[12px] font-semibold font-[Poppins,sans-serif] border cursor-pointer transition-all flex items-center gap-1.5 ${
                        inventoryFilter === f.key
                          ? f.activeClass
                          : `bg-white border-gray-200 ${f.color} hover:border-gray-400 hover:bg-gray-50`
                      }`}
                    >
                      {f.label}
                      <span
                        className={`text-[10px] font-bold rounded-full px-[5px] py-[1px] ${
                          inventoryFilter === f.key
                            ? "bg-white/25 text-inherit"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                {inventoryFilter !== "all" && (
                  <button
                    onClick={() => setInventoryFilter("all")}
                    className="ml-1 text-[11.5px] text-gray-400 hover:text-gray-600 font-semibold font-[Poppins,sans-serif] bg-transparent border-none cursor-pointer underline underline-offset-2 transition-colors"
                  >
                    Clear filter
                  </button>
                )}

                <span className="ml-auto text-[11.5px] text-gray-400 font-medium">
                  Showing{" "}
                  <span className="font-bold text-gray-700">
                    {filteredInventoryItems.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-bold text-gray-700">
                    {inventoryItems.length}
                  </span>{" "}
                  products
                </span>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                <div className="mb-6">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Menu Overview</p>
                  <h2 className="text-xl font-bold text-gray-900">Menu Product Snapshot</h2>
                  <p className="text-gray-500 text-sm mt-1">Quick view of menu item availability and stock condition. Use Menu Management for full product editing.</p>
                </div>
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-24 gap-4"
                    >
                      <motion.div
                        className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-blue-500"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                      />
                      <p className="text-gray-400 text-sm">Loading inventory...</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`content-${inventoryFilter}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {filteredInventoryItems.length === 0 && inventoryFilter !== "all" ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                          <p className="text-[14px] font-semibold text-gray-500">
                            No{" "}
                            {inventoryFilter === "in_stock"
                              ? "available"
                              : inventoryFilter === "low_stock"
                                ? "low-stock"
                                : "unavailable"}{" "}
                            menu items
                          </p>
                          <p className="text-[12px] text-gray-400">
                            {inventoryFilter === "out_of_stock"
                              ? "Great — everything is stocked!"
                              : inventoryFilter === "low_stock"
                                ? "No items are running low right now."
                                : ""}
                          </p>
                          <button
                            onClick={() => setInventoryFilter("all")}
                            className={`mt-1 ${primaryBtnClass}`}
                          >
                            Show all menu items
                          </button>
                        </div>
                      ) : (
                        <InventoryClient
                          items={filteredInventoryItems}
                          onAddProduct={handleAddProduct}
                          onDeleteProduct={handleDeleteProduct}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── Stock Movement tab */}
          {pageTab === "movement" && (
            <motion.div
              key="movement"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              <StockMovementTab />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
