"use client";

import { useState, useEffect } from "react"
import { InventoryClient } from "@/components/ui/inventoryClient"
import type { Batch, InventoryItem, UnitType } from "@/components/ui/inventoryClient"
import { Sidebar } from "@/components/Sidebar"
import { api, apiCall } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import { Package, RefreshCw, Archive } from "lucide-react"

// ─── Real-time clock hook ─────────────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PageTab  = "inventory" | "movement"
type POStatus = "Pending" | "Received" | "Cancelled"
type TRStatus = "Pending" | "Completed" | "Cancelled"
type LogType  = "Stock In" | "Transfer" | "Adjustment"

interface POItem        { name: string; qty: string; unit: string; cost: string }
interface PurchaseOrder { id: string; supplier: string; branch: string; date: string; items: POItem[]; status: POStatus; total: number }
interface StockInRecord { id: string; poRef: string; branch: string; date: string; receivedBy: string; items: Array<{ name: string; qty: string; unit: string }> }
interface Transfer      { id: string; from: string; to: string; item: string; qty: string; unit: string; date: string; status: TRStatus; approvedBy: string }
interface Adjustment    { id: string; branch: string; item: string; qty: number; unit: string; reason: string; date: string; by: string }
interface StockLog      { id: string; date: string; type: LogType; item: string; qty: string; branch: string; by: string; ref: string }
interface ApiInventoryRow {
  id?: number
  product_id?: number
  inventory_id?: number
  name?: string
  product_name?: string
  category?: string
  image?: string
  stock?: number
  price?: number | string
  unit?: UnitType | string
  batches?: Batch[]
  promo?: string
  isRawMaterial?: number | boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCHES  = ["Branch A", "Branch B", "Branch C"] as const
const SUPPLIERS = ["Metro Farms", "Sunrise Supplies", "FreshVeg Co.", "Golden Grains"] as const
const SM_UNITS  = ["kg", "pcs", "liters", "boxes", "bags"] as const
const ITEMS     = ["Chicken Breast", "Beef", "Rice", "All-Purpose Flour", "Cooking Oil", "Tomatoes", "Garlic", "Soy Sauce"] as const
const REASONS   = ["Spoilage", "Damaged", "Theft", "Correction", "Wastage", "Other"] as const

const SM_TABS = [
  { key: "po",         label: "Purchase Orders" },
  { key: "stockin",    label: "Stock In"        },
  { key: "transfer",   label: "Transfer"        },
  { key: "adjustment", label: "Adjustment"      },
  { key: "logs",       label: "Logs"            },
] as const
type SMTabKey = typeof SM_TABS[number]["key"]

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback }
  catch { return fallback }
}
function saveLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* silent */ }
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Received:  "bg-green-50 text-green-700",
    Completed: "bg-green-50 text-green-700",
    Pending:   "bg-yellow-50 text-yellow-700",
    Cancelled: "bg-red-50 text-red-600",
  }
  const cls = styles[status] ?? "bg-gray-100 text-gray-500"
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    "Stock In":   "bg-green-50 text-green-700",
    "Transfer":   "bg-blue-50 text-blue-700",
    "Adjustment": "bg-red-50 text-red-600",
  }
  const cls = styles[type] ?? "bg-gray-100 text-gray-500"
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {type}
    </span>
  )
}

// ─── Shared SM UI ─────────────────────────────────────────────────────────────

function SMModal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-5 backdrop-blur-sm"
      style={{ background: "rgba(17,24,39,0.28)", animation: "fadeIn 0.18s ease" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[480px] overflow-hidden"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.1)", animation: "slideUp 0.22s cubic-bezier(.4,0,.2,1)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-[22px] py-[17px] border-b border-gray-50">
          <span className="font-bold text-[14px] text-gray-900">{title}</span>
          <button
            onClick={onClose}
            className="text-gray-400 text-[20px] leading-none px-[5px] py-[2px] rounded-[5px] hover:bg-gray-100 hover:text-gray-700 transition-all bg-transparent border-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-[22px] py-5 max-h-[58vh] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
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
  )
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[14px]">
      <label className="block text-[11px] font-bold text-gray-500 mb-[5px] uppercase tracking-[0.5px]">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputClass = "w-full px-[11px] py-2 border-[1.5px] border-gray-200 rounded-lg text-[12.5px] font-[Poppins,sans-serif] text-gray-900 outline-none bg-white transition-all focus:border-gray-400 focus:shadow-[0_0_0_3px_rgba(107,114,128,0.08)] box-border"

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string }
function FormInput({ label, ...rest }: FormInputProps) {
  return (
    <FormGroup label={label}>
      <input className={inputClass} {...rest} />
    </FormGroup>
  )
}

function FormSelect({ label, opts, value, onChange }: { label: string; opts: ReadonlyArray<string>; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <FormGroup label={label}>
      <select className={inputClass} value={value} onChange={onChange}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </FormGroup>
  )
}

function SectionHeader({ title, sub, cta }: { title: string; sub: string; cta?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-end mb-[14px]">
      <div>
        <div className="text-[13.5px] font-bold text-gray-900">{title}</div>
        <div className="text-[11.5px] text-gray-400 mt-[1px]">{sub}</div>
      </div>
      {cta}
    </div>
  )
}

function DataTable({ cols, rows, emptyHint }: { cols: string[]; rows: React.ReactNode[]; emptyHint: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-[1.5px] border-gray-50">
            {cols.map(c => (
              <th key={c} className="px-[14px] py-[10px] text-left text-[10.5px] font-bold text-gray-400 uppercase tracking-[0.6px]">
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
                  <div className="text-[13px] text-gray-400">No records yet</div>
                  <div className="text-[11px] text-gray-300 mt-[3px]">{emptyHint}</div>
                </div>
              </td>
            </tr>
          ) : rows}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ label, value, meta, color }: { label: string; value: number; meta?: string; color: "blue" | "green" | "yellow" | "red" }) {
  const colorMap = {
    green:  { border: "#16a34a", text: "#16a34a" },
    yellow: { border: "#ca8a04", text: "#ca8a04" },
    red:    { border: "#dc2626", text: "#dc2626" },
    blue:   { border: "#4f46e5", text: "#4f46e5" },
  }
  const c = colorMap[color]
  return (
    <div
      className="bg-white rounded-xl px-[18px] py-[15px] border border-gray-100 hover:shadow-md transition-shadow"
      style={{ borderTop: `3px solid ${c.border}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.6px] mb-[7px]" style={{ color: c.text }}>
        {label}
      </div>
      <div className="text-[24px] font-extrabold leading-none" style={{ color: c.text }}>
        {value}
      </div>
      {meta && <div className="text-[11px] mt-1 text-gray-400">{meta}</div>}
    </div>
  )
}

const ghostBtnClass  = "bg-gray-100 text-gray-700 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity"
const okBtnClass     = "bg-green-50 text-green-700 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity"
const dangerBtnClass = "bg-red-50 text-red-600 border-none cursor-pointer font-[Poppins,sans-serif] font-semibold text-[11.5px] rounded-[7px] px-[11px] py-1 hover:opacity-80 transition-opacity"
const primaryBtnClass = "bg-white text-gray-700 border border-gray-200 cursor-pointer font-[Poppins,sans-serif] font-semibold text-[12.5px] rounded-[9px] px-[18px] py-2 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-900 transition-all"

// ─── Purchase Orders ──────────────────────────────────────────────────────────

function PurchaseOrders() {
  const [pos,        setPOs]        = useState<PurchaseOrder[]>(() => loadLS("sm_pos", []))
  const [showCreate, setShowCreate] = useState(false)
  const [viewPO,     setViewPO]     = useState<PurchaseOrder | null>(null)
  const [search,     setSearch]     = useState("")
  const [filter,     setFilter]     = useState("All")
  const [poSupplier, setPoSupplier] = useState<string>(SUPPLIERS[0])
  const [poBranch,   setPoBranch]   = useState<string>(BRANCHES[0])
  const [poDate,     setPoDate]     = useState("")
  const [poItems,    setPoItems]    = useState<POItem[]>([{ name: ITEMS[0], qty: "", unit: "kg", cost: "" }])

  useEffect(() => { saveLS("sm_pos", pos) }, [pos])

  function resetForm() { setPoSupplier(SUPPLIERS[0]); setPoBranch(BRANCHES[0]); setPoDate(""); setPoItems([{ name: ITEMS[0], qty: "", unit: "kg", cost: "" }]) }
  function addPoItem() { setPoItems(p => [...p, { name: ITEMS[0], qty: "", unit: "kg", cost: "" }]) }
  function removePoItem(i: number) { setPoItems(p => p.filter((_, x) => x !== i)) }
  function updatePoItem(i: number, field: keyof POItem, val: string) { setPoItems(p => p.map((it, x) => x !== i ? it : { ...it, [field]: val })) }
  const total = poItems.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.cost) || 0), 0)

  function submitPO() {
    if (!poDate) return alert("Please set a date.")
    setPOs(p => [{ id: "PO-" + String(p.length + 1).padStart(3, "0"), supplier: poSupplier, branch: poBranch, date: poDate, items: poItems, status: "Pending", total }, ...p])
    setShowCreate(false); resetForm()
  }

  const filtered = pos.filter(p => {
    const s = search.toLowerCase()
    return (p.id.toLowerCase().includes(s) || p.supplier.toLowerCase().includes(s) || p.branch.toLowerCase().includes(s)) && (filter === "All" || p.status === filter)
  })

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total POs"  value={pos.length}                                       meta="All time"  color="blue"   />
        <StatCard label="Pending"    value={pos.filter(p => p.status === "Pending").length}   meta="Awaiting"  color="yellow" />
        <StatCard label="Received"   value={pos.filter(p => p.status === "Received").length}  meta="Completed" color="green"  />
        <StatCard label="Cancelled"  value={pos.filter(p => p.status === "Cancelled").length} meta="Voided"    color="red"    />
      </div>

      <SectionHeader
        title="Purchase Orders"
        sub="Manage supplier orders across all branches"
        cta={<button className={primaryBtnClass} onClick={() => setShowCreate(true)}>+ New PO</button>}
      />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
            placeholder="Search PO number, supplier, branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {["All", "Pending", "Received", "Cancelled"].map(f => (
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
        cols={["PO #", "Supplier", "Branch", "Date", "Total", "Status", "Actions"]}
        emptyHint="Create a purchase order to get started."
        rows={filtered.map(po => (
          <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">{po.id}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{po.supplier}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{po.branch}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{po.date}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-green-700">₱{po.total.toLocaleString()}</td>
            <td className="px-[14px] py-[11px]"><StatusBadge status={po.status} /></td>
            <td className="px-[14px] py-[11px]">
              <div className="flex gap-[5px]">
                <button className={ghostBtnClass} onClick={() => setViewPO(po)}>View</button>
                {po.status === "Pending" && <>
                  <button className={okBtnClass}     onClick={() => setPOs(p => p.map(x => x.id === po.id ? { ...x, status: "Received"  as POStatus } : x))}>Receive</button>
                  <button className={dangerBtnClass} onClick={() => setPOs(p => p.map(x => x.id === po.id ? { ...x, status: "Cancelled" as POStatus } : x))}>Cancel</button>
                </>}
              </div>
            </td>
          </tr>
        ))}
      />

      {showCreate && (
        <SMModal
          title="Create Purchase Order"
          onClose={() => { setShowCreate(false); resetForm() }}
          footer={
            <>
              <button className={ghostBtnClass}   onClick={() => { setShowCreate(false); resetForm() }}>Discard</button>
              <button className={primaryBtnClass} onClick={submitPO}>Submit PO</button>
            </>
          }
        >
          <FormSelect label="Supplier" opts={SUPPLIERS} value={poSupplier} onChange={e => setPoSupplier(e.target.value)} />
          <FormSelect label="Branch"   opts={BRANCHES}  value={poBranch}   onChange={e => setPoBranch(e.target.value)} />
          <FormInput  label="Expected Date" type="date" value={poDate} onChange={e => setPoDate(e.target.value)} />

          <label className="block text-[11px] font-bold text-gray-500 mb-[6px] uppercase tracking-[0.5px]">Order Items</label>
          {poItems.map((item, i) => (
            <div key={i} className="grid gap-[6px] mb-[7px] items-end" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}>
              <select className={inputClass} value={item.name} onChange={e => updatePoItem(i, "name", e.target.value)}>
                {ITEMS.map(it => <option key={it}>{it}</option>)}
              </select>
              <input  className={inputClass} placeholder="Qty"  type="number" value={item.qty}  onChange={e => updatePoItem(i, "qty",  e.target.value)} />
              <select className={inputClass} value={item.unit}  onChange={e => updatePoItem(i, "unit", e.target.value)}>
                {SM_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
              <input  className={inputClass} placeholder="Cost" type="number" value={item.cost} onChange={e => updatePoItem(i, "cost", e.target.value)} />
              <button
                onClick={() => removePoItem(i)}
                className="bg-red-50 text-red-600 border-none rounded-[7px] px-[9px] py-[6px] cursor-pointer text-[13px] font-bold hover:opacity-75 transition-opacity"
              >×</button>
            </div>
          ))}

          <button
            onClick={addPoItem}
            className="w-full mt-0.5 border-[1.5px] border-dashed border-gray-300 text-gray-400 bg-transparent rounded-lg py-[7px] text-[12px] font-semibold cursor-pointer hover:border-gray-400 hover:text-gray-600 transition-colors font-[Poppins,sans-serif]"
          >
            + Add another item
          </button>

          <div className="mt-3 px-[13px] py-[10px] bg-gray-50 rounded-[9px] flex justify-between items-center">
            <span className="text-[12px] text-gray-500 font-semibold">Total Amount</span>
            <span className="font-extrabold text-green-700 text-[15px]">₱{total.toLocaleString()}</span>
          </div>
        </SMModal>
      )}

      {viewPO && (
        <SMModal
          title={`${viewPO.id} — Details`}
          onClose={() => setViewPO(null)}
          footer={<button className={ghostBtnClass} onClick={() => setViewPO(null)}>Close</button>}
        >
          <div className="grid grid-cols-2 gap-[9px] mb-4">
            {([["Supplier", viewPO.supplier], ["Branch", viewPO.branch], ["Date", viewPO.date], ["Status", viewPO.status]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded-[9px] px-[13px] py-[10px]">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.5px]">{k}</div>
                <div className="text-[13px] font-semibold text-gray-900 mt-[3px]">{v}</div>
              </div>
            ))}
          </div>

          <label className="block text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-[0.5px]">Items Ordered</label>
          {viewPO.items.map((it, i) => (
            <div key={i} className="flex justify-between py-[9px] border-b border-gray-50 text-[13px] last:border-b-0">
              <span className="text-gray-700">{it.name}</span>
              <span className="text-gray-500 font-semibold">{it.qty} {it.unit}</span>
            </div>
          ))}
          <div className="mt-[14px] text-right font-extrabold text-green-700 text-[15px]">₱{viewPO.total.toLocaleString()}</div>
        </SMModal>
      )}
    </div>
  )
}

// ─── Stock In ─────────────────────────────────────────────────────────────────

function StockIn() {
  const [records,   setRecords]   = useState<StockInRecord[]>(() => loadLS("sm_stockin", []))
  const [showModal, setShowModal] = useState(false)
  const [search,    setSearch]    = useState("")
  const [siPoRef,   setSiPoRef]   = useState("")
  const [siBranch,  setSiBranch]  = useState<string>(BRANCHES[0])
  const [siDate,    setSiDate]    = useState("")
  const [siRecBy,   setSiRecBy]   = useState("")
  const [siItems,   setSiItems]   = useState<Array<{ name: string; qty: string; unit: string }>>([{ name: ITEMS[0], qty: "", unit: "kg" }])

  useEffect(() => { saveLS("sm_stockin", records) }, [records])

  function resetForm() { setSiPoRef(""); setSiBranch(BRANCHES[0]); setSiDate(""); setSiRecBy(""); setSiItems([{ name: ITEMS[0], qty: "", unit: "kg" }]) }
  function submitSI() {
    if (!siDate || !siRecBy) return alert("Please fill all required fields.")
    setRecords(p => [{ id: "SI-" + String(p.length + 1).padStart(3, "0"), poRef: siPoRef, branch: siBranch, date: siDate, receivedBy: siRecBy, items: siItems }, ...p])
    setShowModal(false); resetForm()
  }

  const filtered = records.filter(r => { const s = search.toLowerCase(); return r.id.toLowerCase().includes(s) || r.branch.toLowerCase().includes(s) || r.receivedBy.toLowerCase().includes(s) })

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Deliveries" value={records.length}                                meta="All time"   color="blue"   />
        <StatCard label="This Month"        value={records.length}                                meta="March 2026" color="green"  />
        <StatCard label="Branches Covered"  value={new Set(records.map(r => r.branch)).size}     meta="Unique"     color="yellow" />
        <StatCard label="Linked to PO"      value={records.filter(r => r.poRef !== "").length}   meta="With ref"   color="blue"   />
      </div>

      <SectionHeader
        title="Stock In"
        sub="Record incoming deliveries and stock arrivals"
        cta={<button className={primaryBtnClass} onClick={() => setShowModal(true)}>+ Record Stock In</button>}
      />

      <div className="flex items-center gap-2 mb-[14px]">
        <div className="flex-1 min-w-[200px]">
          <input
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
            placeholder="Search SI number, branch, received by…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <DataTable
        cols={["SI #", "PO Reference", "Branch", "Date", "Received By", "Items"]}
        emptyHint="Record a delivery to get started."
        rows={filtered.map(r => (
          <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">{r.id}</td>
            <td className={`px-[14px] py-[11px] text-[12.5px] ${r.poRef ? "text-indigo-600 font-semibold" : "text-gray-400"}`}>{r.poRef || "—"}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{r.branch}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{r.date}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{r.receivedBy}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
              {r.items.map(it => `${it.name} (${it.qty} ${it.unit})`).join(", ")}
            </td>
          </tr>
        ))}
      />

      {showModal && (
        <SMModal
          title="Record Stock In"
          onClose={() => { setShowModal(false); resetForm() }}
          footer={
            <>
              <button className={ghostBtnClass}   onClick={() => { setShowModal(false); resetForm() }}>Discard</button>
              <button className={primaryBtnClass} onClick={submitSI}>Save Record</button>
            </>
          }
        >
          <FormInput  label="PO Reference (optional)" placeholder="e.g. PO-002" value={siPoRef}  onChange={e => setSiPoRef(e.target.value)} />
          <FormSelect label="Branch"                   opts={BRANCHES}            value={siBranch} onChange={e => setSiBranch(e.target.value)} />
          <FormInput  label="Date Received" type="date" value={siDate} onChange={e => setSiDate(e.target.value)} />
          <FormInput  label="Received By" placeholder="Staff name" value={siRecBy} onChange={e => setSiRecBy(e.target.value)} />

          <label className="block text-[11px] font-bold text-gray-500 mb-[6px] uppercase tracking-[0.5px]">Items Received</label>
          {siItems.map((item, i) => (
            <div key={i} className="grid gap-[6px] mb-[7px] items-end" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <select className={inputClass} value={item.name} onChange={e => setSiItems(p => p.map((it, x) => x !== i ? it : { ...it, name: e.target.value }))}>
                {ITEMS.map(it => <option key={it}>{it}</option>)}
              </select>
              <input  className={inputClass} placeholder="Qty" type="number" value={item.qty}  onChange={e => setSiItems(p => p.map((it, x) => x !== i ? it : { ...it, qty:  e.target.value }))} />
              <select className={inputClass} value={item.unit} onChange={e => setSiItems(p => p.map((it, x) => x !== i ? it : { ...it, unit: e.target.value }))}>
                {SM_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          ))}

          <button
            onClick={() => setSiItems(p => [...p, { name: ITEMS[0], qty: "", unit: "kg" }])}
            className="w-full mt-0.5 border-[1.5px] border-dashed border-gray-300 text-gray-400 bg-transparent rounded-lg py-[7px] text-[12px] font-semibold cursor-pointer hover:border-gray-400 hover:text-gray-600 transition-colors font-[Poppins,sans-serif]"
          >
            + Add another item
          </button>
        </SMModal>
      )}
    </div>
  )
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────

function StockTransfer() {
  const [transfers, setTransfers] = useState<Transfer[]>(() => loadLS("sm_transfers", []))
  const [showModal, setShowModal] = useState(false)
  const [filter,    setFilter]    = useState("All")
  const [trFrom,    setTrFrom]    = useState<string>(BRANCHES[0])
  const [trTo,      setTrTo]      = useState<string>(BRANCHES[1])
  const [trItem,    setTrItem]    = useState<string>(ITEMS[0])
  const [trQty,     setTrQty]     = useState("")
  const [trUnit,    setTrUnit]    = useState<string>(SM_UNITS[0])
  const [trDate,    setTrDate]    = useState("")

  useEffect(() => { saveLS("sm_transfers", transfers) }, [transfers])

  function resetForm() { setTrFrom(BRANCHES[0]); setTrTo(BRANCHES[1]); setTrItem(ITEMS[0]); setTrQty(""); setTrUnit(SM_UNITS[0]); setTrDate("") }
  function submitTR() {
    if (!trQty || !trDate) return alert("Please fill all required fields.")
    if (trFrom === trTo)   return alert("Source and destination must be different.")
    setTransfers(p => [{ id: "TR-" + String(p.length + 1).padStart(3, "0"), from: trFrom, to: trTo, item: trItem, qty: trQty, unit: trUnit, date: trDate, status: "Pending", approvedBy: "—" }, ...p])
    setShowModal(false); resetForm()
  }

  const filtered = transfers.filter(t => filter === "All" || t.status === filter)

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Transfers"  value={transfers.length}                                        color="blue"   />
        <StatCard label="Pending Approval" value={transfers.filter(t => t.status === "Pending").length}   meta="Needs Action" color="yellow" />
        <StatCard label="Completed"        value={transfers.filter(t => t.status === "Completed").length} color="green"  />
        <StatCard label="Cancelled"        value={transfers.filter(t => t.status === "Cancelled").length} color="red"    />
      </div>

      <SectionHeader
        title="Stock Transfer"
        sub="Move stock between branches with owner approval"
        cta={<button className={primaryBtnClass} onClick={() => setShowModal(true)}>+ New Transfer</button>}
      />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        {["All", "Pending", "Completed", "Cancelled"].map(f => (
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
        cols={["TR #", "From", "To", "Item", "Qty", "Date", "Status", "Approved By", "Actions"]}
        emptyHint="No transfers recorded yet."
        rows={filtered.map(t => (
          <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">{t.id}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{t.from}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{t.to}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{t.item}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-semibold text-gray-900">{t.qty} {t.unit}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{t.date}</td>
            <td className="px-[14px] py-[11px]"><StatusBadge status={t.status} /></td>
            <td className={`px-[14px] py-[11px] text-[12.5px] ${t.approvedBy === "—" ? "text-gray-400" : "text-gray-700"}`}>{t.approvedBy}</td>
            <td className="px-[14px] py-[11px]">
              {t.status === "Pending" && (
                <div className="flex gap-[5px]">
                  <button className={okBtnClass}     onClick={() => setTransfers(p => p.map(x => x.id === t.id ? { ...x, status: "Completed" as TRStatus, approvedBy: "Owner" } : x))}>Approve</button>
                  <button className={dangerBtnClass} onClick={() => setTransfers(p => p.map(x => x.id === t.id ? { ...x, status: "Cancelled" as TRStatus } : x))}>Cancel</button>
                </div>
              )}
            </td>
          </tr>
        ))}
      />

      {showModal && (
        <SMModal
          title="New Stock Transfer"
          onClose={() => { setShowModal(false); resetForm() }}
          footer={
            <>
              <button className={ghostBtnClass}   onClick={() => { setShowModal(false); resetForm() }}>Discard</button>
              <button className={primaryBtnClass} onClick={submitTR}>Submit Transfer</button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-[10px]">
            <FormSelect label="From Branch" opts={BRANCHES} value={trFrom} onChange={e => setTrFrom(e.target.value)} />
            <FormSelect label="To Branch"   opts={BRANCHES} value={trTo}   onChange={e => setTrTo(e.target.value)} />
          </div>
          <FormSelect label="Item" opts={ITEMS} value={trItem} onChange={e => setTrItem(e.target.value)} />
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput  label="Quantity" type="number" placeholder="e.g. 20" value={trQty}  onChange={e => setTrQty(e.target.value)} />
            <FormSelect label="Unit"     opts={SM_UNITS}                      value={trUnit} onChange={e => setTrUnit(e.target.value)} />
          </div>
          <FormInput label="Transfer Date" type="date" value={trDate} onChange={e => setTrDate(e.target.value)} />
        </SMModal>
      )}
    </div>
  )
}

// ─── Stock Adjustment ─────────────────────────────────────────────────────────

function StockAdjustment() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>(() => loadLS("sm_adjustments", []))
  const [showModal,   setShowModal]   = useState(false)
  const [filter,      setFilter]      = useState("All")
  const [adjBranch,   setAdjBranch]   = useState<string>(BRANCHES[0])
  const [adjItem,     setAdjItem]     = useState<string>(ITEMS[0])
  const [adjQty,      setAdjQty]      = useState("")
  const [adjUnit,     setAdjUnit]     = useState<string>(SM_UNITS[0])
  const [adjReason,   setAdjReason]   = useState<string>(REASONS[0])
  const [adjDate,     setAdjDate]     = useState("")
  const [adjBy,       setAdjBy]       = useState("")

  useEffect(() => { saveLS("sm_adjustments", adjustments) }, [adjustments])

  function resetForm() { setAdjBranch(BRANCHES[0]); setAdjItem(ITEMS[0]); setAdjQty(""); setAdjUnit(SM_UNITS[0]); setAdjReason(REASONS[0]); setAdjDate(""); setAdjBy("") }
  function submitAdj() {
    if (!adjQty || !adjDate || !adjBy) return alert("Please fill all required fields.")
    setAdjustments(p => [{ id: "ADJ-" + String(p.length + 1).padStart(3, "0"), branch: adjBranch, item: adjItem, qty: parseFloat(adjQty) * -1, unit: adjUnit, reason: adjReason, date: adjDate, by: adjBy }, ...p])
    setShowModal(false); resetForm()
  }

  const filtered = adjustments.filter(a => filter === "All" || a.reason === filter)

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Adjustments" value={adjustments.length}                                                                color="blue"   />
        <StatCard label="Spoilage"           value={adjustments.filter(a => a.reason === "Spoilage").length}                          color="yellow" />
        <StatCard label="Damaged"            value={adjustments.filter(a => a.reason === "Damaged").length}                           color="red"    />
        <StatCard label="Other Reasons"      value={adjustments.filter(a => a.reason !== "Spoilage" && a.reason !== "Damaged").length} color="blue"   />
      </div>

      <SectionHeader
        title="Stock Adjustment"
        sub="Record spoilage, damage, theft, and manual corrections"
        cta={<button className={primaryBtnClass} onClick={() => setShowModal(true)}>+ New Adjustment</button>}
      />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        {["All", ...REASONS].map(f => (
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
        cols={["ADJ #", "Branch", "Item", "Adjustment", "Reason", "Date", "Recorded By"]}
        emptyHint="No adjustments recorded yet."
        rows={filtered.map(a => (
          <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
            <td className="px-[14px] py-[11px] text-[12.5px] font-bold text-gray-900">{a.id}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{a.branch}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{a.item}</td>
            <td className={`px-[14px] py-[11px] text-[12.5px] font-bold ${a.qty < 0 ? "text-red-600" : "text-green-700"}`}>
              {a.qty > 0 ? "+" : ""}{a.qty} {a.unit}
            </td>
            <td className="px-[14px] py-[11px]">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-50 text-yellow-700">{a.reason}</span>
            </td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{a.date}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{a.by}</td>
          </tr>
        ))}
      />

      {showModal && (
        <SMModal
          title="New Stock Adjustment"
          onClose={() => { setShowModal(false); resetForm() }}
          footer={
            <>
              <button className={ghostBtnClass}   onClick={() => { setShowModal(false); resetForm() }}>Discard</button>
              <button className={primaryBtnClass} onClick={submitAdj}>Save Adjustment</button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-[10px]">
            <FormSelect label="Branch" opts={BRANCHES} value={adjBranch} onChange={e => setAdjBranch(e.target.value)} />
            <FormSelect label="Item"   opts={ITEMS}    value={adjItem}   onChange={e => setAdjItem(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <FormInput  label="Qty (deducted)" type="number" placeholder="e.g. 3" value={adjQty}  onChange={e => setAdjQty(e.target.value)} />
            <FormSelect label="Unit"           opts={SM_UNITS}                     value={adjUnit} onChange={e => setAdjUnit(e.target.value)} />
          </div>
          <FormSelect label="Reason"      opts={REASONS} value={adjReason} onChange={e => setAdjReason(e.target.value)} />
          <FormInput  label="Date"        type="date"    value={adjDate}   onChange={e => setAdjDate(e.target.value)} />
          <FormInput  label="Recorded By" placeholder="Staff name" value={adjBy} onChange={e => setAdjBy(e.target.value)} />
        </SMModal>
      )}
    </div>
  )
}

// ─── Stock Logs ───────────────────────────────────────────────────────────────

function StockLogs() {
  const [logs]          = useState<StockLog[]>(() => loadLS("sm_logs", []))
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("All")

  const filtered = logs.filter(l => {
    const s = search.toLowerCase()
    return (l.item.toLowerCase().includes(s) || l.ref.toLowerCase().includes(s) || l.by.toLowerCase().includes(s)) && (filter === "All" || l.type === filter)
  })

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Entries" value={logs.length}                                          color="blue"  />
        <StatCard label="Stock In"      value={logs.filter(l => l.type === "Stock In").length}   color="green" />
        <StatCard label="Transfers"     value={logs.filter(l => l.type === "Transfer").length}   color="blue"  />
        <StatCard label="Adjustments"   value={logs.filter(l => l.type === "Adjustment").length} color="red"   />
      </div>

      <SectionHeader title="Stock Logs" sub="Complete audit trail of all stock movements" />

      <div className="flex items-center gap-2 mb-[14px] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            className="w-full px-3 py-2 border-[1.5px] border-gray-200 rounded-[9px] text-[12.5px] font-[Poppins,sans-serif] text-gray-700 outline-none bg-white transition-all focus:border-gray-400 box-border"
            placeholder="Search item, reference, staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {["All", "Stock In", "Transfer", "Adjustment"].map(f => (
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
        rows={filtered.map(l => (
          <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-b-0">
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500">{l.date}</td>
            <td className="px-[14px] py-[11px]"><TypeBadge type={l.type} /></td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-medium text-gray-700">{l.item}</td>
            <td className={`px-[14px] py-[11px] text-[12.5px] font-bold ${l.qty.startsWith("+") ? "text-green-700" : "text-red-600"}`}>{l.qty}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-700">{l.branch}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] text-gray-500">{l.by}</td>
            <td className="px-[14px] py-[11px] text-[12.5px] font-semibold text-indigo-600">{l.ref}</td>
          </tr>
        ))}
      />
    </div>
  )
}

// ─── Stock Movement Tab ───────────────────────────────────────────────────────

function StockMovementTab() {
  const [activeSmTab, setActiveSmTab] = useState<SMTabKey>("po")

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Stock Movement</p>
        <h2 className="text-xl font-bold text-gray-900">Movement Records</h2>
        <p className="text-gray-500 text-sm mt-1">Purchase orders, deliveries, transfers, adjustments, and audit logs.</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b-[1.5px] border-gray-100 mb-[18px]">
        {SM_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSmTab(tab.key)}
            className={`px-4 py-2 text-[12.5px] font-semibold font-[Poppins,sans-serif] border-none bg-transparent cursor-pointer border-b-2 -mb-[1.5px] transition-all ${
              activeSmTab === tab.key
                ? "text-gray-900 border-b-gray-700"
                : "text-gray-400 border-b-transparent hover:text-gray-700 hover:bg-gray-50 rounded-t-md"
            }`}
            style={{ borderBottom: activeSmTab === tab.key ? "2px solid #374151" : "2px solid transparent" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeSmTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {activeSmTab === "po"         && <PurchaseOrders />}
          {activeSmTab === "stockin"    && <StockIn />}
          {activeSmTab === "transfer"   && <StockTransfer />}
          {activeSmTab === "adjustment" && <StockAdjustment />}
          {activeSmTab === "logs"       && <StockLogs />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const now              = useNow()
  const [pageTab,        setPageTab]        = useState<PageTab>("inventory")
  const [loading,        setLoading]        = useState(true)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([
    { id: 1, name: "Chicken Breast", category: "Main",        image: "/img/placeholder.jpg", incoming: 50,  stock: 120, price: "₱250", unit: "kg"     as UnitType, batches: [{ id: "batch-1", productId: 1, quantity: 30, unit: "kg"     as UnitType, receivedAt: new Date(Date.now() - 2 * 86400000), status: "active" }, { id: "batch-2", productId: 1, quantity: 25, unit: "kg"     as UnitType, receivedAt: new Date(Date.now() - 86400000), status: "active" }], totalUsedToday: 0 },
    { id: 2, name: "Rice",           category: "Ingredients", image: "/img/placeholder.jpg", incoming: 100, stock: 500, price: "₱40",  unit: "kg"     as UnitType, batches: [{ id: "batch-3", productId: 2, quantity: 50, unit: "kg"     as UnitType, receivedAt: new Date(),                              status: "active" }], totalUsedToday: 0 },
    { id: 3, name: "Coke 2L",        category: "Beverages",   image: "/img/placeholder.jpg", incoming: 20,  stock: 45,  price: "₱85",  unit: "bottle" as UnitType, batches: [{ id: "batch-4", productId: 3, quantity: 12, unit: "bottle" as UnitType, receivedAt: new Date(Date.now() - 3 * 86400000), status: "active" }, { id: "batch-5", productId: 3, quantity: 15, unit: "bottle" as UnitType, receivedAt: new Date(),                              status: "active" }], totalUsedToday: 0 },
    { id: 4, name: "Cooking Oil",    category: "Ingredients", image: "/img/placeholder.jpg", incoming: 15,  stock: 80,  price: "₱180", unit: "bottle" as UnitType, batches: [{ id: "batch-6", productId: 4, quantity: 8,  unit: "bottle" as UnitType, receivedAt: new Date(Date.now() - 5 * 86400000), status: "active" }], totalUsedToday: 0 },
    { id: 5, name: "Egg",            category: "Ingredients", image: "/img/placeholder.jpg", incoming: 30,  stock: 120, price: "₱8",   unit: "piece"  as UnitType, batches: [{ id: "batch-7", productId: 5, quantity: 60, unit: "piece"  as UnitType, receivedAt: new Date(Date.now() - 86400000),     status: "active" }], totalUsedToday: 0 },
  ])

  const loadInventory = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true)
      const data = await apiCall("/inventory", { method: "GET" }) as ApiInventoryRow[] | null
      if (data && Array.isArray(data)) {
        const inventoryRows = data.filter((item) => {
          const promo    = String(item?.promo    ?? "").toUpperCase().trim()
          const category = String(item?.category ?? "").toLowerCase().trim()
          return promo === "SUPPLIES" || promo === "MENU FOOD" || category.includes("suppl") || category.includes("menu food")
        })

        const groupedByName = new Map<string, ApiInventoryRow[]>()
        for (const item of inventoryRows) {
          const key = String(item?.product_name ?? item?.name ?? "").trim().toLowerCase()
          const group = groupedByName.get(key) ?? []
          group.push(item)
          groupedByName.set(key, group)
        }

        const normalizedRows = Array.from(groupedByName.values()).map((group) =>
          group.reduce((latest, current) => {
            const latestId  = Number(latest?.product_id  ?? latest?.id  ?? latest?.inventory_id  ?? 0)
            const currentId = Number(current?.product_id ?? current?.id ?? current?.inventory_id ?? 0)
            return currentId > latestId ? current : latest
          })
        )

        setInventoryItems(
          normalizedRows.map((item) => ({
            id:       Number(item.id ?? item.product_id ?? item.inventory_id ?? 0),
            name:     item.name || item.product_name || "Unnamed Product",
            category: item.category || "Uncategorized",
            image:    item.image    || "/img/placeholder.jpg",
            incoming: 0,
            stock:    Number((item as any).quantity ?? (item as any).stock ?? (item as any).dailyWithdrawn ?? 0),
            price:    item.price?.toString() || "0",
            unit:     (item.unit as UnitType) || "piece",
            batches:  (item.batches || []).map((b: Batch) => ({
              ...b,
              receivedAt: new Date(b.receivedAt),
              expiresAt:  b.expiresAt ? new Date(b.expiresAt) : undefined,
            })),
            totalUsedToday: 0,
          }))
        )
      }
    } catch (error) { console.error("Failed to load inventory:", error) }
    finally         { if (showLoader) setLoading(false) }
  }

  useEffect(() => { loadInventory() }, [])

  const handleAddProduct = async (productData: Partial<InventoryItem> & { description?: string }) => {
    try {
      const created = await api.post<{ id?: number }>("/products", {
        name:        productData.name,
        category:    productData.category,
        price:       productData.price,
        unit:        productData.unit,
        quantity:    productData.stock ?? 0,
        description: productData.description ?? null,
        image:       productData.image || "/img/placeholder.jpg",
      })

      const optimisticItem: InventoryItem = {
        id:             Number(created?.id ?? Date.now()),
        name:           String(productData.name     ?? "Unnamed Product"),
        category:       String(productData.category ?? "Uncategorized"),
        image:          String(productData.image    ?? "/img/placeholder.jpg"),
        incoming:       0,
        stock:          Number(productData.stock    ?? 0),
        price:          String(productData.price    ?? "0"),
        unit:           (productData.unit as UnitType) || "piece",
        batches:        [],
        totalUsedToday: 0,
      }
      setInventoryItems(prev => [optimisticItem, ...prev])
      void loadInventory(false)
      alert("Product added successfully!")
    } catch (error) {
      console.error("Failed to add product:", error)
      alert(`Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const handleDeleteProduct = async (productId: number) => {
    try {
      await apiCall(`/products/${productId}`, { method: "DELETE" })
      setInventoryItems(prev => prev.filter(item => item.id !== productId))
      alert("Product deleted successfully!")
    } catch (error) {
      console.error("Failed to delete product:", error)
      alert(`Failed to delete product: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const totalStock   = inventoryItems.reduce((sum, item) => sum + item.stock, 0)
  const totalBatches = inventoryItems.reduce((sum, item) => sum + (item.batches?.length || 0), 0)

  return (
    <div className="flex min-h-screen bg-gray-50 font-[Poppins,sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">

        {/* Page header + clock */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="mb-2 flex items-start justify-between"
        >
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Management</p>
            <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
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

        {/* Top-level tabs — centered pill switcher */}
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex bg-gray-100 rounded-[14px] p-1 gap-0.5">
            {([
              { key: "inventory" as PageTab, label: "Inventory"      },
              { key: "movement"  as PageTab, label: "Stock Movement" },
            ]).map(tab => (
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

          {pageTab === "inventory" && (
            <motion.div key="inventory" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-5 mb-8">
                {[
                  { label: "Total Products", value: inventoryItems.length, icon: <Package   className="w-5 h-5" />, colorCls: "bg-blue-50 text-blue-600 border-blue-100"         },
                  { label: "Total Stock",    value: totalStock,             icon: <Archive   className="w-5 h-5" />, colorCls: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                  { label: "Active Batches", value: totalBatches,           icon: <RefreshCw className="w-5 h-5" />, colorCls: "bg-orange-50 text-orange-600 border-orange-100"    },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${stat.colorCls}`}>
                      {stat.icon}
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24 gap-4">
                      <motion.div
                        className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-blue-500"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                      />
                      <p className="text-gray-400 text-sm">Loading inventory...</p>
                    </motion.div>
                  ) : (
                    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      <InventoryClient items={inventoryItems} onAddProduct={handleAddProduct} onDeleteProduct={handleDeleteProduct} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-3 gap-5 mt-6">
                {[
                  { desc: "Each batch is tracked with a timestamp. When consuming products, the oldest batch is used first (FIFO).", borderCls: "border-blue-200",    bgCls: "bg-blue-50",    textCls: "text-blue-800"    },
                  { desc: "Click 'Add Batch' to input new product quantities. Optional expiry dates can be set for tracking.",        borderCls: "border-emerald-200", bgCls: "bg-emerald-50", textCls: "text-emerald-800" },
                  { desc: "At end of day, return unused batches. Returned quantity is sent back to main inventory.",                   borderCls: "border-orange-200",  bgCls: "bg-orange-50",  textCls: "text-orange-800"  },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }}
                    className={`${card.bgCls} border ${card.borderCls} rounded-2xl p-5`}
                  >
                    <p className={`text-sm ${card.textCls} leading-relaxed`}>{card.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {pageTab === "movement" && (
            <motion.div key="movement" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              <StockMovementTab />
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  )
}