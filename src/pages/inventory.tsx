"use client"

import { useState, useEffect } from "react"
import { InventoryClient } from "@/components/ui/inventoryClient"
import type { Batch, InventoryItem, UnitType } from "@/components/ui/inventoryClient"
import { Sidebar } from "@/components/Sidebar"
import { apiCall } from "@/lib/api"
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

function sBadgeClass(status: string) {
  if (status === "Received" || status === "Completed") return "sm-badge sm-green"
  if (status === "Pending")   return "sm-badge sm-yellow"
  if (status === "Cancelled") return "sm-badge sm-red"
  return "sm-badge sm-gray"
}
function tBadgeClass(type: string) {
  if (type === "Stock In")   return "sm-badge sm-green"
  if (type === "Transfer")   return "sm-badge sm-blue"
  if (type === "Adjustment") return "sm-badge sm-red"
  return "sm-badge sm-gray"
}

// ─── Shared SM UI ─────────────────────────────────────────────────────────────

function SMModal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={e => e.stopPropagation()}>
        <div className="sm-mhead">
          <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{title}</span>
          <button className="sm-xbtn" onClick={onClose}>×</button>
        </div>
        <div className="sm-mbody">{children}</div>
        {footer && <div className="sm-mfoot">{footer}</div>}
      </div>
    </div>
  )
}

function SMFG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {children}
    </div>
  )
}

interface SMFIProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string }
function SMFI({ label, ...rest }: SMFIProps) {
  return <SMFG label={label}><input className="sm-finput" {...rest} /></SMFG>
}

function SMSel({ label, opts, value, onChange }: { label: string; opts: ReadonlyArray<string>; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <SMFG label={label}>
      <select className="sm-finput" value={value} onChange={onChange}>
        {opts.map(o => <option key={o}>{o}</option>)}
      </select>
    </SMFG>
  )
}

function SMSecHeader({ title, sub, cta }: { title: string; sub: string; cta?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 1 }}>{sub}</div>
      </div>
      {cta}
    </div>
  )
}

function SMTblWrap({ cols, rows, emptyHint }: { cols: string[]; rows: React.ReactNode[]; emptyHint: string }) {
  return (
    <div className="sm-tbl-wrap">
      <table className="sm-tbl">
        <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={cols.length}><div style={{ textAlign: "center", padding: "42px 0" }}><div style={{ fontSize: 13, color: "#9ca3af" }}>No records yet</div><div style={{ fontSize: 11, color: "#c4c4c4", marginTop: 3 }}>{emptyHint}</div></div></td></tr>
            : rows}
        </tbody>
      </table>
    </div>
  )
}

function SMStatCard({ label, value, meta, color }: { label: string; value: number; meta?: string; color: "blue" | "green" | "yellow" | "red" }) {
  const c = { green: "#16a34a", yellow: "#ca8a04", red: "#dc2626", blue: "#4f46e5" }[color]
  return (
    <div className="sm-stat-card" style={{ borderTop: `3px solid ${c}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 7, color: c }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: c }}>{value}</div>
      {meta && <div style={{ fontSize: 11, marginTop: 4, color: "#9ca3af" }}>{meta}</div>}
    </div>
  )
}

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
      <div className="sm-stats-grid">
        <SMStatCard label="Total POs"  value={pos.length}                                       meta="All time"  color="blue"   />
        <SMStatCard label="Pending"    value={pos.filter(p => p.status === "Pending").length}   meta="Awaiting"  color="yellow" />
        <SMStatCard label="Received"   value={pos.filter(p => p.status === "Received").length}  meta="Completed" color="green"  />
        <SMStatCard label="Cancelled"  value={pos.filter(p => p.status === "Cancelled").length} meta="Voided"    color="red"    />
      </div>
      <SMSecHeader title="Purchase Orders" sub="Manage supplier orders across all branches"
        cta={<button className="sm-abtn sm-primary" onClick={() => setShowCreate(true)}>+ New PO</button>} />
      <div className="sm-filter-row">
        <div className="sm-search-wrap"><input className="sm-search-input" placeholder="Search PO number, supplier, branch…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {["All", "Pending", "Received", "Cancelled"].map(f => <button key={f} className={`sm-chip ${filter === f ? "sm-chip-on" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}
      </div>
      <SMTblWrap cols={["PO #", "Supplier", "Branch", "Date", "Total", "Status", "Actions"]} emptyHint="Create a purchase order to get started."
        rows={filtered.map(po => (
          <tr key={po.id}>
            <td style={{ fontWeight: 700, color: "#111827" }}>{po.id}</td>
            <td>{po.supplier}</td><td>{po.branch}</td><td>{po.date}</td>
            <td style={{ fontWeight: 700, color: "#16a34a" }}>₱{po.total.toLocaleString()}</td>
            <td><span className={sBadgeClass(po.status)}>{po.status}</span></td>
            <td>
              <div style={{ display: "flex", gap: 5 }}>
                <button className="sm-abtn sm-ghost" onClick={() => setViewPO(po)}>View</button>
                {po.status === "Pending" && <>
                  <button className="sm-abtn sm-ok"  onClick={() => setPOs(p => p.map(x => x.id === po.id ? { ...x, status: "Received"  as POStatus } : x))}>Receive</button>
                  <button className="sm-abtn sm-del" onClick={() => setPOs(p => p.map(x => x.id === po.id ? { ...x, status: "Cancelled" as POStatus } : x))}>Cancel</button>
                </>}
              </div>
            </td>
          </tr>
        ))}
      />
      {showCreate && (
        <SMModal title="Create Purchase Order" onClose={() => { setShowCreate(false); resetForm() }}
          footer={<><button className="sm-abtn sm-ghost" onClick={() => { setShowCreate(false); resetForm() }}>Discard</button><button className="sm-abtn sm-primary" onClick={submitPO}>Submit PO</button></>}>
          <SMSel label="Supplier" opts={SUPPLIERS} value={poSupplier} onChange={e => setPoSupplier(e.target.value)} />
          <SMSel label="Branch"   opts={BRANCHES}  value={poBranch}   onChange={e => setPoBranch(e.target.value)} />
          <SMFI  label="Expected Date" type="date" value={poDate} onChange={e => setPoDate(e.target.value)} />
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Order Items</label>
          {poItems.map((item, i) => (
            <div key={i} className="sm-irow" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}>
              <select className="sm-finput" value={item.name} onChange={e => updatePoItem(i, "name", e.target.value)}>{ITEMS.map(it => <option key={it}>{it}</option>)}</select>
              <input  className="sm-finput" placeholder="Qty"  type="number" value={item.qty}  onChange={e => updatePoItem(i, "qty",  e.target.value)} />
              <select className="sm-finput" value={item.unit}  onChange={e => updatePoItem(i, "unit", e.target.value)}>{SM_UNITS.map(u => <option key={u}>{u}</option>)}</select>
              <input  className="sm-finput" placeholder="Cost" type="number" value={item.cost} onChange={e => updatePoItem(i, "cost", e.target.value)} />
              <button className="sm-rm-btn" onClick={() => removePoItem(i)}>×</button>
            </div>
          ))}
          <button className="sm-add-row-btn" onClick={addPoItem}>+ Add another item</button>
          <div className="sm-total-box"><span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Total Amount</span><span style={{ fontWeight: 800, color: "#16a34a", fontSize: 15 }}>₱{total.toLocaleString()}</span></div>
        </SMModal>
      )}
      {viewPO && (
        <SMModal title={`${viewPO.id} — Details`} onClose={() => setViewPO(null)} footer={<button className="sm-abtn sm-ghost" onClick={() => setViewPO(null)}>Close</button>}>
          <div className="sm-detail-grid">
            {([ ["Supplier", viewPO.supplier], ["Branch", viewPO.branch], ["Date", viewPO.date], ["Status", viewPO.status] ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="sm-detail-cell"><div className="sm-detail-key">{k}</div><div className="sm-detail-val">{v}</div></div>
            ))}
          </div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Items Ordered</label>
          {viewPO.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f5f6fa", fontSize: 13 }}>
              <span style={{ color: "#374151" }}>{it.name}</span>
              <span style={{ color: "#6b7280", fontWeight: 600 }}>{it.qty} {it.unit}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, textAlign: "right", fontWeight: 800, color: "#16a34a", fontSize: 15 }}>₱{viewPO.total.toLocaleString()}</div>
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
      <div className="sm-stats-grid">
        <SMStatCard label="Total Deliveries" value={records.length}                                meta="All time"   color="blue"   />
        <SMStatCard label="This Month"        value={records.length}                                meta="March 2026" color="green"  />
        <SMStatCard label="Branches Covered"  value={new Set(records.map(r => r.branch)).size}     meta="Unique"     color="yellow" />
        <SMStatCard label="Linked to PO"      value={records.filter(r => r.poRef !== "").length}   meta="With ref"   color="blue"   />
      </div>
      <SMSecHeader title="Stock In" sub="Record incoming deliveries and stock arrivals"
        cta={<button className="sm-abtn sm-primary" onClick={() => setShowModal(true)}>+ Record Stock In</button>} />
      <div className="sm-filter-row"><div className="sm-search-wrap"><input className="sm-search-input" placeholder="Search SI number, branch, received by…" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
      <SMTblWrap cols={["SI #", "PO Reference", "Branch", "Date", "Received By", "Items"]} emptyHint="Record a delivery to get started."
        rows={filtered.map(r => (
          <tr key={r.id}>
            <td style={{ fontWeight: 700, color: "#111827" }}>{r.id}</td>
            <td style={{ color: r.poRef ? "#4f46e5" : "#9ca3af", fontWeight: r.poRef ? 600 : 400 }}>{r.poRef || "—"}</td>
            <td>{r.branch}</td><td>{r.date}</td><td>{r.receivedBy}</td>
            <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#6b7280" }}>{r.items.map(it => `${it.name} (${it.qty} ${it.unit})`).join(", ")}</td>
          </tr>
        ))}
      />
      {showModal && (
        <SMModal title="Record Stock In" onClose={() => { setShowModal(false); resetForm() }}
          footer={<><button className="sm-abtn sm-ghost" onClick={() => { setShowModal(false); resetForm() }}>Discard</button><button className="sm-abtn sm-primary" onClick={submitSI}>Save Record</button></>}>
          <SMFI  label="PO Reference (optional)" placeholder="e.g. PO-002" value={siPoRef}  onChange={e => setSiPoRef(e.target.value)} />
          <SMSel label="Branch"                   opts={BRANCHES}            value={siBranch} onChange={e => setSiBranch(e.target.value)} />
          <SMFI  label="Date Received" type="date" value={siDate} onChange={e => setSiDate(e.target.value)} />
          <SMFI  label="Received By" placeholder="Staff name" value={siRecBy} onChange={e => setSiRecBy(e.target.value)} />
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Items Received</label>
          {siItems.map((item, i) => (
            <div key={i} className="sm-irow" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
              <select className="sm-finput" value={item.name} onChange={e => setSiItems(p => p.map((it, x) => x !== i ? it : { ...it, name: e.target.value }))}>{ITEMS.map(it => <option key={it}>{it}</option>)}</select>
              <input  className="sm-finput" placeholder="Qty" type="number" value={item.qty}  onChange={e => setSiItems(p => p.map((it, x) => x !== i ? it : { ...it, qty:  e.target.value }))} />
              <select className="sm-finput" value={item.unit} onChange={e => setSiItems(p => p.map((it, x) => x !== i ? it : { ...it, unit: e.target.value }))}>{SM_UNITS.map(u => <option key={u}>{u}</option>)}</select>
            </div>
          ))}
          <button className="sm-add-row-btn" onClick={() => setSiItems(p => [...p, { name: ITEMS[0], qty: "", unit: "kg" }])}>+ Add another item</button>
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
      <div className="sm-stats-grid">
        <SMStatCard label="Total Transfers"  value={transfers.length}                                        color="blue"   />
        <SMStatCard label="Pending Approval" value={transfers.filter(t => t.status === "Pending").length}   meta="Needs Action" color="yellow" />
        <SMStatCard label="Completed"        value={transfers.filter(t => t.status === "Completed").length} color="green"  />
        <SMStatCard label="Cancelled"        value={transfers.filter(t => t.status === "Cancelled").length} color="red"    />
      </div>
      <SMSecHeader title="Stock Transfer" sub="Move stock between branches with owner approval"
        cta={<button className="sm-abtn sm-primary" onClick={() => setShowModal(true)}>+ New Transfer</button>} />
      <div className="sm-filter-row">{["All", "Pending", "Completed", "Cancelled"].map(f => <button key={f} className={`sm-chip ${filter === f ? "sm-chip-on" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
      <SMTblWrap cols={["TR #", "From", "To", "Item", "Qty", "Date", "Status", "Approved By", "Actions"]} emptyHint="No transfers recorded yet."
        rows={filtered.map(t => (
          <tr key={t.id}>
            <td style={{ fontWeight: 700, color: "#111827" }}>{t.id}</td>
            <td>{t.from}</td><td>{t.to}</td><td>{t.item}</td>
            <td style={{ fontWeight: 600 }}>{t.qty} {t.unit}</td><td>{t.date}</td>
            <td><span className={sBadgeClass(t.status)}>{t.status}</span></td>
            <td style={{ color: t.approvedBy === "—" ? "#9ca3af" : "#374151" }}>{t.approvedBy}</td>
            <td>{t.status === "Pending" && <div style={{ display: "flex", gap: 5 }}>
              <button className="sm-abtn sm-ok"  onClick={() => setTransfers(p => p.map(x => x.id === t.id ? { ...x, status: "Completed" as TRStatus, approvedBy: "Owner" } : x))}>Approve</button>
              <button className="sm-abtn sm-del" onClick={() => setTransfers(p => p.map(x => x.id === t.id ? { ...x, status: "Cancelled" as TRStatus } : x))}>Cancel</button>
            </div>}</td>
          </tr>
        ))}
      />
      {showModal && (
        <SMModal title="New Stock Transfer" onClose={() => { setShowModal(false); resetForm() }}
          footer={<><button className="sm-abtn sm-ghost" onClick={() => { setShowModal(false); resetForm() }}>Discard</button><button className="sm-abtn sm-primary" onClick={submitTR}>Submit Transfer</button></>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SMSel label="From Branch" opts={BRANCHES} value={trFrom} onChange={e => setTrFrom(e.target.value)} />
            <SMSel label="To Branch"   opts={BRANCHES} value={trTo}   onChange={e => setTrTo(e.target.value)} />
          </div>
          <SMSel label="Item" opts={ITEMS} value={trItem} onChange={e => setTrItem(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SMFI  label="Quantity" type="number" placeholder="e.g. 20" value={trQty}  onChange={e => setTrQty(e.target.value)} />
            <SMSel label="Unit"     opts={SM_UNITS}                      value={trUnit} onChange={e => setTrUnit(e.target.value)} />
          </div>
          <SMFI label="Transfer Date" type="date" value={trDate} onChange={e => setTrDate(e.target.value)} />
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
      <div className="sm-stats-grid">
        <SMStatCard label="Total Adjustments" value={adjustments.length}                                                                color="blue"   />
        <SMStatCard label="Spoilage"           value={adjustments.filter(a => a.reason === "Spoilage").length}                          color="yellow" />
        <SMStatCard label="Damaged"            value={adjustments.filter(a => a.reason === "Damaged").length}                           color="red"    />
        <SMStatCard label="Other Reasons"      value={adjustments.filter(a => a.reason !== "Spoilage" && a.reason !== "Damaged").length} color="blue"   />
      </div>
      <SMSecHeader title="Stock Adjustment" sub="Record spoilage, damage, theft, and manual corrections"
        cta={<button className="sm-abtn sm-primary" onClick={() => setShowModal(true)}>+ New Adjustment</button>} />
      <div className="sm-filter-row">{["All", ...REASONS].map(f => <button key={f} className={`sm-chip ${filter === f ? "sm-chip-on" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
      <SMTblWrap cols={["ADJ #", "Branch", "Item", "Adjustment", "Reason", "Date", "Recorded By"]} emptyHint="No adjustments recorded yet."
        rows={filtered.map(a => (
          <tr key={a.id}>
            <td style={{ fontWeight: 700, color: "#111827" }}>{a.id}</td>
            <td>{a.branch}</td><td>{a.item}</td>
            <td style={{ fontWeight: 700, color: a.qty < 0 ? "#dc2626" : "#16a34a" }}>{a.qty > 0 ? "+" : ""}{a.qty} {a.unit}</td>
            <td><span className="sm-badge sm-yellow">{a.reason}</span></td>
            <td>{a.date}</td><td>{a.by}</td>
          </tr>
        ))}
      />
      {showModal && (
        <SMModal title="New Stock Adjustment" onClose={() => { setShowModal(false); resetForm() }}
          footer={<><button className="sm-abtn sm-ghost" onClick={() => { setShowModal(false); resetForm() }}>Discard</button><button className="sm-abtn sm-primary" onClick={submitAdj}>Save Adjustment</button></>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SMSel label="Branch" opts={BRANCHES} value={adjBranch} onChange={e => setAdjBranch(e.target.value)} />
            <SMSel label="Item"   opts={ITEMS}    value={adjItem}   onChange={e => setAdjItem(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SMFI  label="Qty (deducted)" type="number" placeholder="e.g. 3" value={adjQty}  onChange={e => setAdjQty(e.target.value)} />
            <SMSel label="Unit"           opts={SM_UNITS}                     value={adjUnit} onChange={e => setAdjUnit(e.target.value)} />
          </div>
          <SMSel label="Reason"      opts={REASONS} value={adjReason} onChange={e => setAdjReason(e.target.value)} />
          <SMFI  label="Date"        type="date"    value={adjDate}   onChange={e => setAdjDate(e.target.value)} />
          <SMFI  label="Recorded By" placeholder="Staff name" value={adjBy} onChange={e => setAdjBy(e.target.value)} />
        </SMModal>
      )}
    </div>
  )
}

// ─── Stock Logs ───────────────────────────────────────────────────────────────

function StockLogs() {
  const [logs]   = useState<StockLog[]>(() => loadLS("sm_logs", []))
  const [search,  setSearch] = useState("")
  const [filter,  setFilter] = useState("All")

  const filtered = logs.filter(l => {
    const s = search.toLowerCase()
    return (l.item.toLowerCase().includes(s) || l.ref.toLowerCase().includes(s) || l.by.toLowerCase().includes(s)) && (filter === "All" || l.type === filter)
  })

  return (
    <div>
      <div className="sm-stats-grid">
        <SMStatCard label="Total Entries" value={logs.length}                                          color="blue"  />
        <SMStatCard label="Stock In"      value={logs.filter(l => l.type === "Stock In").length}   color="green" />
        <SMStatCard label="Transfers"     value={logs.filter(l => l.type === "Transfer").length}   color="blue"  />
        <SMStatCard label="Adjustments"   value={logs.filter(l => l.type === "Adjustment").length} color="red"   />
      </div>
      <SMSecHeader title="Stock Logs" sub="Complete audit trail of all stock movements" />
      <div className="sm-filter-row">
        <div className="sm-search-wrap"><input className="sm-search-input" placeholder="Search item, reference, staff…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {["All", "Stock In", "Transfer", "Adjustment"].map(f => <button key={f} className={`sm-chip ${filter === f ? "sm-chip-on" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}
      </div>
      <SMTblWrap cols={["Date", "Type", "Item", "Quantity", "Branch", "By", "Reference"]} emptyHint="No log entries yet."
        rows={filtered.map(l => (
          <tr key={l.id}>
            <td style={{ color: "#6b7280" }}>{l.date}</td>
            <td><span className={tBadgeClass(l.type)}>{l.type}</span></td>
            <td style={{ fontWeight: 500 }}>{l.item}</td>
            <td style={{ fontWeight: 700, color: l.qty.startsWith("+") ? "#16a34a" : "#dc2626" }}>{l.qty}</td>
            <td>{l.branch}</td>
            <td style={{ color: "#6b7280" }}>{l.by}</td>
            <td style={{ color: "#4f46e5", fontWeight: 600 }}>{l.ref}</td>
          </tr>
        ))}
      />
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SM_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');

  .sm-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.28); z-index: 400; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(3px); animation: sm-fo 0.18s ease; }
  @keyframes sm-fo { from { opacity:0 } to { opacity:1 } }
  .sm-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 480px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); animation: sm-slide 0.22s cubic-bezier(.4,0,.2,1); overflow: hidden; }
  @keyframes sm-slide { from { opacity:0; transform:translateY(12px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
  .sm-mhead { padding: 17px 22px 13px; border-bottom: 1px solid #f5f6fa; display: flex; justify-content: space-between; align-items: center; }
  .sm-mbody { padding: 20px 22px; max-height: 58vh; overflow-y: auto; }
  .sm-mfoot { padding: 12px 22px; border-top: 1px solid #f5f6fa; display: flex; justify-content: flex-end; gap: 8px; background: #fafafa; }
  .sm-xbtn { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 20px; line-height: 1; padding: 2px 5px; border-radius: 5px; transition: all 0.12s; }
  .sm-xbtn:hover { background: #f3f4f6; color: #374151; }
  .sm-finput { width: 100%; padding: 8px 11px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 12.5px; font-family: 'Poppins', sans-serif; color: #111827; outline: none; background: #fff; transition: border 0.14s; box-sizing: border-box; }
  .sm-finput:focus { border-color: #9ca3af; box-shadow: 0 0 0 3px rgba(107,114,128,0.08); }
  .sm-stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  .sm-stat-card { background: #fff; border-radius: 12px; padding: 15px 18px; border: 1px solid #f0f0f0; transition: box-shadow 0.18s; }
  .sm-stat-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
  .sm-filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .sm-search-wrap { flex: 1; min-width: 200px; }
  .sm-search-input { width: 100%; padding: 8px 12px; border: 1.5px solid #e5e7eb; border-radius: 9px; font-size: 12.5px; font-family: 'Poppins', sans-serif; color: #374151; outline: none; background: #fff; transition: border 0.14s; box-sizing: border-box; }
  .sm-search-input:focus { border-color: #9ca3af; }
  .sm-chip { padding: 5px 13px; border-radius: 99px; font-size: 12px; font-weight: 600; font-family: 'Poppins', sans-serif; border: 1.5px solid #e5e7eb; background: #fff; color: #6b7280; cursor: pointer; transition: all 0.13s; }
  .sm-chip:hover { border-color: #9ca3af; color: #374151; background: #f3f4f6; }
  .sm-chip-on { background: #374151; border-color: #374151; color: #fff; }
  .sm-badge { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .sm-green  { background: #f0fdf4; color: #16a34a; }
  .sm-yellow { background: #fefce8; color: #ca8a04; }
  .sm-red    { background: #fef2f2; color: #dc2626; }
  .sm-blue   { background: #eff6ff; color: #2563eb; }
  .sm-gray   { background: #f9fafb; color: #6b7280; }
  .sm-abtn { border: none; cursor: pointer; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 11.5px; border-radius: 7px; padding: 4px 11px; transition: all 0.13s; }
  .sm-abtn:hover { opacity: 0.8; }
  .sm-ghost   { background: #f5f6fa; color: #374151; }
  .sm-ok      { background: #f0fdf4; color: #16a34a; }
  .sm-del     { background: #fef2f2; color: #dc2626; }
  .sm-primary { background: #fff; color: #374151; border: 1px solid #e5e7eb; padding: 8px 18px; font-size: 12.5px; border-radius: 9px; }
  .sm-primary:hover { background: #f3f4f6; border-color: #9ca3af; color: #111827; }
  .sm-tbl-wrap { background: #fff; border-radius: 12px; border: 1px solid #f0f0f0; overflow: hidden; }
  .sm-tbl { width: 100%; border-collapse: collapse; }
  .sm-tbl thead tr { border-bottom: 1.5px solid #f5f6fa; }
  .sm-tbl thead th { padding: 10px 14px; text-align: left; font-size: 10.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; }
  .sm-tbl tbody tr { border-bottom: 1px solid #f9fafb; transition: background 0.1s; }
  .sm-tbl tbody tr:hover { background: #f9fafb; }
  .sm-tbl tbody td { padding: 11px 14px; font-size: 12.5px; color: #374151; }
  .sm-tbl tbody tr:last-child { border-bottom: none; }
  .sm-irow { display: grid; gap: 6px; margin-bottom: 7px; align-items: end; }
  .sm-add-row-btn { background: none; border: 1.5px dashed #d1d5db; color: #9ca3af; border-radius: 8px; padding: 7px; cursor: pointer; font-size: 12px; font-family: 'Poppins', sans-serif; font-weight: 600; width: 100%; transition: all 0.13s; margin-top: 2px; }
  .sm-add-row-btn:hover { border-color: #9ca3af; color: #374151; }
  .sm-rm-btn { background: #fef2f2; color: #dc2626; border: none; border-radius: 7px; padding: 6px 9px; cursor: pointer; font-size: 13px; font-weight: 700; transition: opacity 0.12s; }
  .sm-rm-btn:hover { opacity: 0.75; }
  .sm-total-box { margin-top: 12px; padding: 10px 13px; background: #f5f6fa; border-radius: 9px; display: flex; justify-content: space-between; align-items: center; }
  .sm-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-bottom: 16px; }
  .sm-detail-cell { background: #f9fafb; border-radius: 9px; padding: 10px 13px; }
  .sm-detail-key { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
  .sm-detail-val { font-size: 13px; font-weight: 600; color: #111827; margin-top: 3px; }

  /* Inner SM sub-tabs */
  .sm-tabs-bar { display: flex; border-bottom: 1.5px solid #ececec; margin-bottom: 18px; }
  .sm-tab { padding: 8px 16px; font-size: 12.5px; font-weight: 600; font-family: 'Poppins', sans-serif; border: none; background: none; cursor: pointer; color: #9ca3af; border-bottom: 2px solid transparent; margin-bottom: -1.5px; transition: all 0.15s; }
  .sm-tab:hover { color: #374151; background: #f9fafb; border-radius: 6px 6px 0 0; }
  .sm-tab-active { color: #111827; border-bottom-color: #374151; }

  /* Top-level page tabs — centered pill switcher */
  .page-tabs-wrap { display: flex; justify-content: center; margin-bottom: 32px; }
  .page-tabs-bar { display: inline-flex; background: #f3f4f6; border-radius: 14px; padding: 4px; gap: 2px; }
  .page-tab { position: relative; padding: 9px 28px; font-size: 13px; font-weight: 600; font-family: 'Poppins', sans-serif; border: none; background: transparent; cursor: pointer; color: #9ca3af; border-radius: 10px; transition: color 0.2s; z-index: 1; white-space: nowrap; }
  .page-tab:hover { color: #374151; }
  .page-tab-active { color: #111827; }
  .page-tab-slider { position: absolute; inset: 0; background: #ffffff; border-radius: 10px; box-shadow: 0 1px 6px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04); z-index: 0; }
`

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

  const loadInventory = async () => {
    try {
      setLoading(true)
      const data = await apiCall("/inventory", { method: "GET" }) as InventoryItem[] | null
      if (data && Array.isArray(data)) {
        setInventoryItems(data.map((item: InventoryItem) => ({
          id: item.id, name: item.name || "Unnamed Product", category: item.category || "Uncategorized",
          image: item.image || "/img/placeholder.jpg", incoming: 0, stock: item.stock ?? 0,
          price: item.price?.toString() || "0", unit: (item.unit as UnitType) || "piece",
          batches: (item.batches || []).map((b: Batch) => ({ ...b, receivedAt: new Date(b.receivedAt), expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined })),
          totalUsedToday: 0,
        })))
      }
    } catch (error) { console.error("Failed to load inventory:", error) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadInventory() }, [])

  const handleBatchAdded = async (item: InventoryItem, batch: Batch) => {
    try {
      await apiCall("/inventory/batches", { method: "POST", body: { productId: item.id, quantity: batch.quantity, unit: batch.unit, expiresAt: batch.expiresAt?.toISOString() } as Parameters<typeof apiCall>[1]["body"] })
      setInventoryItems(prev => prev.map(i => i.id === item.id ? { ...i, batches: [...(i.batches || []), batch], stock: i.stock + batch.quantity } : i))
    } catch (error) { console.error("Failed to add batch:", error); alert("Failed to add batch to database") }
  }

  const handleBatchReturned = async (item: InventoryItem, batchId: string, returnedQty: number) => {
    try {
      await apiCall(`/inventory/batches/${batchId}/return`, { method: "POST", body: { quantity: returnedQty, returnedAt: new Date().toISOString() } as Parameters<typeof apiCall>[1]["body"] })
      setInventoryItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: i.stock + returnedQty, batches: i.batches?.map(b => b.id === batchId ? { ...b, quantity: Math.max(0, b.quantity - returnedQty), status: (b.quantity - returnedQty <= 0 ? "returned" : "partial") as Batch["status"] } : b) || [] } : i))
    } catch (error) { console.error("Failed to return batch:", error); alert("Failed to return batch") }
  }

  const handleAddProduct = async (productData: Partial<InventoryItem> & { description?: string }) => {
    try {
      await apiCall("/products", { method: "POST", body: { name: productData.name, category: productData.category, price: productData.price, unit: productData.unit, quantity: productData.stock ?? 0, description: productData.description ?? null, image: productData.image || "/img/placeholder.jpg" } as Parameters<typeof apiCall>[1]["body"] })
      await loadInventory()
      alert("Product added successfully!")
    } catch (error) {
      console.error("Failed to add product:", error)
      alert(`Failed to add product: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const totalStock   = inventoryItems.reduce((sum, item) => sum + item.stock, 0)
  const totalBatches = inventoryItems.reduce((sum, item) => sum + (item.batches?.length || 0), 0)

  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <style>{SM_STYLES}</style>
      <Sidebar />

      <main className="flex-1 p-8 pl-24">

        {/* Page header */}
        {/* Page header + clock */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="mb-2 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Management</p>
            <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
            <p className="text-gray-500 text-sm mt-1">FIFO batch tracking — oldest stock is always used first.</p>
          </div>

          {/* ── Live Clock ── */}
          <div className="flex flex-col items-end select-none">
            <p className="text-base font-semibold text-gray-700 tabular-nums">
              {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </motion.div>

        {/* ── Top-level tabs — centered pill switcher ── */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }} className="page-tabs-wrap">
          <div className="page-tabs-bar">
            {([
              { key: "inventory" as PageTab, label: " Inventory"      },
              { key: "movement"  as PageTab, label: " Stock Movement" },
            ]).map(tab => (
              <button
                key={tab.key}
                className={`page-tab ${pageTab === tab.key ? "page-tab-active" : ""}`}
                onClick={() => setPageTab(tab.key)}
              >
                {pageTab === tab.key && (
                  <motion.span
                    className="page-tab-slider"
                    layoutId="pageTabSlider"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <span style={{ position: "relative", zIndex: 1 }}>{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">

          {pageTab === "inventory" && (
            <motion.div key="inventory" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>

              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-5 mb-8">
                {[
                  { label: "Total Products", value: inventoryItems.length, icon: <Package   className="w-5 h-5" />, color: "bg-blue-50 text-blue-600 border-blue-100"         },
                  { label: "Total Stock",    value: totalStock,             icon: <Archive   className="w-5 h-5" />, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                  { label: "Active Batches", value: totalBatches,           icon: <RefreshCw className="w-5 h-5" />, color: "bg-orange-50 text-orange-600 border-orange-100"    },
                ].map((stat, i) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${stat.color}`}>{stat.icon}</div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Inventory table */}
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24 gap-4">
                      <motion.div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-blue-500" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
                      <p className="text-gray-400 text-sm">Loading inventory...</p>
                    </motion.div>
                  ) : (
                    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      <InventoryClient items={inventoryItems} onBatchAdded={handleBatchAdded} onBatchReturned={handleBatchReturned} onAddProduct={handleAddProduct} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-3 gap-5 mt-6">
                {[
                  { desc: "Each batch is tracked with a timestamp. When consuming products, the oldest batch is used first (FIFO).", border: "border-blue-200",    bg: "bg-blue-50",    text: "text-blue-800"    },
                  { desc: "Click 'Add Batch' to input new product quantities. Optional expiry dates can be set for tracking.",        border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800" },
                  { desc: "At end of day, return unused batches. Returned quantity is sent back to main inventory.",                   border: "border-orange-200",  bg: "bg-orange-50",  text: "text-orange-800"  },
                ].map((card, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }}
                    className={`${card.bg} border ${card.border} rounded-2xl p-5`}>
                    <p className={`text-sm ${card.text} leading-relaxed`}>{card.desc}</p>
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

// ─── Stock Movement Tab content ───────────────────────────────────────────────

function StockMovementTab() {
  const [activeSmTab, setActiveSmTab] = useState<SMTabKey>("po")

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Stock Movement</p>
        <h2 className="text-xl font-bold text-gray-900">Movement Records</h2>
        <p className="text-gray-500 text-sm mt-1">Purchase orders, deliveries, transfers, adjustments, and audit logs.</p>
      </div>

      <div className="sm-tabs-bar">
        {SM_TABS.map(tab => (
          <button key={tab.key} className={`sm-tab ${activeSmTab === tab.key ? "sm-tab-active" : ""}`} onClick={() => setActiveSmTab(tab.key)}>
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