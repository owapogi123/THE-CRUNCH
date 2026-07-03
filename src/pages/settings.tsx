import { useState, useEffect } from "react";
import { Lock, ChevronDown, ChevronUp, Star, MessageSquare } from "lucide-react";
import { useAuth } from "../context/authcontext";
import { api } from "../lib/api";
import { saveGeneralSettings, syncGeneralSettings } from "../lib/restaurantSettings";

// ─── Constants ────────────────────────────────────────────────────────────────
export const FONT = "'Poppins', sans-serif";
export const ACCENT = "#e05a1e";

// ─── Types ────────────────────────────────────────────────────────────────────
export type UserRole =
  | "administrator"
  | "manager"
  | "staff"
  | "cashier"
  | "cook"
  | "inventory_manager";
export type TabKey =
  | "business" | "users" | "roles" | "inventory" | "products"
  | "ordering" | "payment" | "receipt" | "billing" | "notifications"
  | "kitchen" | "delivery" | "reports" | "security" | "backup"
  | "audit" | "personal" | "feedback";

export interface RestaurantSettings {
  restaurantName: string; tagline: string; email: string; phone: string; address: string;
  currency: string; timezone: string;
  weekdayOpenTime: string; weekdayCloseTime: string; weekendOpenTime: string; weekendCloseTime: string;
  storeStatusMode: "auto" | "manual_open" | "manual_closed";
  defaultLowStockThreshold: string; defaultCriticalStockThreshold: string;
  taxRate: string; serviceCharge: string; enableToastNotifications: boolean;
  toastPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  toastDuration: string; enableConfirmDialogs: boolean;
  acceptOnlineOrders: boolean; minimumOrderAmount: string;
  deliveryRadius: string; deliveryFee: string; sessionTimeout: string;
}

export const DEFAULT: RestaurantSettings = {
  restaurantName: "The Crunch", tagline: "", email: "", phone: "", address: "", currency: "PHP", timezone: "Asia/Manila",
  weekdayOpenTime: "10:00", weekdayCloseTime: "22:00",
  weekendOpenTime: "11:00", weekendCloseTime: "20:30",
  storeStatusMode: "auto", defaultLowStockThreshold: "", defaultCriticalStockThreshold: "",
  taxRate: "", serviceCharge: "", enableToastNotifications: true,
  toastPosition: "top-right", toastDuration: "4000", enableConfirmDialogs: true,
  acceptOnlineOrders: true, minimumOrderAmount: "", deliveryRadius: "", deliveryFee: "",
  sessionTimeout: "30",
};

export interface FeedbackEntry {
  id: string; reviewerName: string; productName: string;
  rating: number; message: string; createdAt: string;
}

function readString(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeSettingsState(
  source: Record<string, unknown> | null | undefined,
): RestaurantSettings {
  return {
    restaurantName: readString(source?.restaurantName, DEFAULT.restaurantName),
    tagline: readString(source?.tagline),
    email: readString(source?.email),
    phone: readString(source?.phone),
    address: readString(source?.address),
    currency: readString(source?.currency, DEFAULT.currency),
    timezone: readString(source?.timezone, DEFAULT.timezone),
    weekdayOpenTime: readString(
      source?.weekdayOpenTime,
      DEFAULT.weekdayOpenTime,
    ),
    weekdayCloseTime: readString(
      source?.weekdayCloseTime,
      DEFAULT.weekdayCloseTime,
    ),
    weekendOpenTime: readString(
      source?.weekendOpenTime,
      DEFAULT.weekendOpenTime,
    ),
    weekendCloseTime: readString(
      source?.weekendCloseTime,
      DEFAULT.weekendCloseTime,
    ),
    storeStatusMode:
      source?.storeStatusMode === "manual_open" ||
      source?.storeStatusMode === "manual_closed"
        ? source.storeStatusMode
        : "auto",
    defaultLowStockThreshold: readString(source?.defaultLowStockThreshold),
    defaultCriticalStockThreshold: readString(
      source?.defaultCriticalStockThreshold,
    ),
    taxRate: readString(source?.taxRate),
    serviceCharge: readString(source?.serviceCharge),
    enableToastNotifications: readBoolean(
      source?.enableToastNotifications,
      true,
    ),
    toastPosition:
      source?.toastPosition === "top-left" ||
      source?.toastPosition === "bottom-right" ||
      source?.toastPosition === "bottom-left"
        ? source.toastPosition
        : "top-right",
    toastDuration: readString(source?.toastDuration, DEFAULT.toastDuration),
    enableConfirmDialogs: readBoolean(source?.enableConfirmDialogs, true),
    acceptOnlineOrders: readBoolean(source?.acceptOnlineOrders, true),
    minimumOrderAmount: readString(source?.minimumOrderAmount),
    deliveryRadius: readString(source?.deliveryRadius),
    deliveryFee: readString(source?.deliveryFee),
    sessionTimeout: readString(source?.sessionTimeout, DEFAULT.sessionTimeout),
  };
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────
const ADMIN_ONLY: TabKey[] = ["users", "roles", "security", "backup", "audit"];

export function canAccess(role: UserRole, tab: TabKey): boolean {
  if (role === "administrator") return true;
  if (role === "manager") return !ADMIN_ONLY.includes(tab);
  return tab === "personal";
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  input: {
    fontFamily: FONT, fontSize: "0.85rem", color: "#1c1a18", background: "#f7f6f5",
    border: "1px solid #ececec", borderRadius: 8, padding: "9px 12px",
    width: "100%", outline: "none", transition: "border-color .15s, box-shadow .15s",
  } as React.CSSProperties,
  pillSelect: {
    fontFamily: FONT, fontSize: "0.85rem", fontWeight: 500, color: "#1c1a18",
    background: "#f0eeec", border: "none", borderRadius: 99, padding: "9px 16px",
    cursor: "pointer", outline: "none", appearance: "none" as const,
  } as React.CSSProperties,
  btn: {
    fontFamily: FONT, fontSize: "0.82rem", fontWeight: 500, cursor: "pointer",
    borderRadius: 10, padding: "10px 16px", border: "none",
    background: "#f0eeec", color: "#1c1a18", textAlign: "left" as const,
    transition: "all .15s",
  } as React.CSSProperties,
  accentBtn: {
    fontFamily: FONT, fontSize: "0.82rem", fontWeight: 500, cursor: "pointer",
    borderRadius: 10, padding: "10px 16px", border: "none",
    background: "#1c1a18", color: "#fff", textAlign: "left" as const,
    transition: "all .15s",
  } as React.CSSProperties,
};

// ─── Primitives ───────────────────────────────────────────────────────────────
export function SI({ value, onChange, type = "text", placeholder = "" }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  const [f, setF] = useState(false);
  return (
    <input
      style={{ ...S.input, borderColor: f ? ACCENT : "#ececec", boxShadow: f ? `0 0 0 3px rgba(224,90,30,.1)` : "none" }}
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
    />
  );
}

export function SS({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select
        style={{ ...S.pillSelect, paddingRight: 34 }}
        value={value} onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} color="#9e9891" style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
      }} />
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)}
      style={{
        position: "relative", width: 44, height: 24, borderRadius: 99, border: "none",
        cursor: "pointer", background: value ? "#1c1a18" : "#e4e1dc", padding: 0, flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.18)", transition: "left .18s",
      }} />
    </button>
  );
}

export function FR({ label, last = false, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "175px minmax(0,1fr)", alignItems: "center",
      gap: 16, padding: "20px 0", borderBottom: last ? "none" : "1px solid #ececec",
    }}>
      <p style={{ fontFamily: FONT, fontSize: "0.85rem", fontWeight: 500, color: "#1c1a18", margin: 0 }}>{label}</p>
      {children}
    </div>
  );
}

export function TR({ label, desc, value, onChange, last = false }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "20px 0", borderBottom: last ? "none" : "1px solid #ececec", gap: 16,
    }}>
      <div>
        <p style={{ fontFamily: FONT, fontSize: "0.85rem", fontWeight: 500, color: "#1c1a18", margin: 0 }}>{label}</p>
        {desc && <p style={{ fontFamily: FONT, fontSize: "0.74rem", color: "#9e9891", margin: "3px 0 0", lineHeight: 1.6 }}>{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

export function Card({ title: _title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: FONT, fontSize: "0.74rem", color: "#b0aaa3", padding: "10px 0 18px", lineHeight: 1.6, margin: 0 }}>{children}</p>;
}

// ─── Locked overlay ───────────────────────────────────────────────────────────
export function LockedSection({ tabLabel }: { tabLabel: string }) {
  return (
    <div style={{
      background: "#f7f6f5", borderRadius: 16,
      padding: "48px 32px", textAlign: "center",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 12, background: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
      }}>
        <Lock size={22} color={ACCENT} />
      </div>
      <p style={{ fontFamily: FONT, fontSize: "0.9rem", fontWeight: 600, color: "#1c1a18", margin: "0 0 8px" }}>Access Restricted</p>
      <p style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#9e9891", margin: 0, lineHeight: 1.7, maxWidth: 300, marginInline: "auto" }}>
        You do not have permission to access <strong style={{ color: "#5a5652" }}>{tabLabel}</strong>. Contact your administrator.
      </p>
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────
export function BusinessTab({ s, setStr }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void }) {
  return <>
    <Card title="Restaurant Identity">
      <FR label="Business name"><SI value={s.restaurantName} onChange={(v) => setStr("restaurantName", v)} placeholder="The Crunch" /></FR>
      <FR label="Tagline" last><SI value={s.tagline} onChange={(v) => setStr("tagline", v)} placeholder="Crunch into flavor" /></FR>
    </Card>
    <Card title="Regional Settings">
      <FR label="Currency">
        <SS
          value={s.currency}
          onChange={(v) => setStr("currency", v)}
          options={[
            { value: "PHP", label: "Philippine Peso (PHP)" },
            { value: "USD", label: "US Dollar (USD)" },
            { value: "EUR", label: "Euro (EUR)" },
          ]}
        />
      </FR>
      <FR label="Time zone" last>
        <SI value={s.timezone} onChange={(v) => setStr("timezone", v)} placeholder="Asia/Manila" />
      </FR>
    </Card>
    <Card title="Contact Details">
      <FR label="Email"><SI value={s.email} onChange={(v) => setStr("email", v)} type="email" placeholder="contact@thecrunch.ph" /></FR>
      <FR label="Phone"><SI value={s.phone} onChange={(v) => setStr("phone", v)} placeholder="+63 912 345 6789" /></FR>
      <FR label="Address" last><SI value={s.address} onChange={(v) => setStr("address", v)} placeholder="123 Food St, Manila" /></FR>
    </Card>
    <Card title="Operating Hours">
      <FR label="Weekday open"><SI value={s.weekdayOpenTime} onChange={(v) => setStr("weekdayOpenTime", v)} type="time" /></FR>
      <FR label="Weekday close"><SI value={s.weekdayCloseTime} onChange={(v) => setStr("weekdayCloseTime", v)} type="time" /></FR>
      <FR label="Weekend open"><SI value={s.weekendOpenTime} onChange={(v) => setStr("weekendOpenTime", v)} type="time" /></FR>
      <FR label="Weekend close" last><SI value={s.weekendCloseTime} onChange={(v) => setStr("weekendCloseTime", v)} type="time" /></FR>
    </Card>
  </>;
}

export function UsersTab() {
  return (
    <Card title="User Management">
      <div style={{ padding: "20px", color: "#9e9891", fontFamily: FONT, fontSize: "0.78rem", lineHeight: 1.7 }}>
        Connect <strong style={{ color: "#5a5652" }}>/api/users</strong> to enable user creation, editing, deactivation, and password reset.
      </div>
      <div style={{ display: "flex", gap: 8, padding: "0 20px 20px", flexWrap: "wrap" }}>
        {["Create user", "Edit user", "Deactivate", "Reset password"].map((a) => (
          <button key={a} style={S.btn}>{a}</button>
        ))}
      </div>
    </Card>
  );
}

export function RolesTab() {
  const roles = ["Administrator", "Manager", "Staff"];
  const matrix: [string, boolean, boolean, boolean][] = [
    ["Business Info", true, true, false],
    ["User Management", true, false, false],
    ["Inventory", true, true, false],
    ["Products", true, true, false],
    ["Online Orders", true, true, false],
    ["Payment Config", true, false, false],
    ["Tax & Charges", true, true, false],
    ["Reports", true, true, false],
    ["Security", true, false, false],
    ["Backup & Restore", true, false, false],
    ["Audit Logs", true, false, false],
  ];
  return (
    <Card title="Permission Matrix">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f0ede8" }}>
              <th style={{ padding: "11px 20px", textAlign: "left", color: "#9e9891", fontWeight: 500, width: "50%" }}>Feature</th>
              {roles.map((r) => <th key={r} style={{ padding: "11px 14px", textAlign: "center", color: "#5a5652", fontWeight: 600 }}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.map(([perm, a, m, st], i) => (
              <tr key={perm} style={{ borderBottom: i < matrix.length - 1 ? "1px solid #f0ede8" : "none" }}>
                <td style={{ padding: "10px 20px", color: "#484340", fontWeight: 500 }}>{perm}</td>
                {[a, m, st].map((has, j) => (
                  <td key={j} style={{ padding: "10px 14px", textAlign: "center" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 20, height: 20, borderRadius: 5,
                      background: has ? "rgba(224,90,30,.1)" : "#f5f4f2",
                      color: has ? ACCENT : "#c8c4be", fontSize: "0.68rem", fontWeight: 700,
                    }}>{has ? "✓" : "—"}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function InventoryTab({ s, setStr }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void }) {
  return <>
    <Card title="Stock Alert Thresholds">
      <FR label="Low stock threshold"><SI value={s.defaultLowStockThreshold} onChange={(v) => setStr("defaultLowStockThreshold", v)} type="number" placeholder="e.g. 10" /></FR>
      <FR label="Critical threshold" last><SI value={s.defaultCriticalStockThreshold} onChange={(v) => setStr("defaultCriticalStockThreshold", v)} type="number" placeholder="e.g. 5" /></FR>
    </Card>
    <Card title="Unit Types & Suppliers">
      <div style={{ padding: "16px 20px", color: "#9e9891", fontFamily: FONT, fontSize: "0.78rem", lineHeight: 1.7 }}>
        Unit types and supplier management connect to <strong style={{ color: "#5a5652" }}>/api/inventory/config</strong>.
      </div>
    </Card>
  </>;
}

export function ProductsTab() {
  const cats = ["Boneless Chicken", "Drinks", "Sides", "Combos"];
  return (
    <Card title="Product Categories">
      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        {cats.map((c) => (
          <div key={c} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fafaf9", border: "1px solid #eae7e2", borderRadius: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 500, color: "#484340" }}>{c}</span>
            <span style={{ fontFamily: FONT, fontSize: "0.67rem", color: "#15803d", background: "rgba(34,197,94,.1)", padding: "2px 9px", borderRadius: 99, fontWeight: 500 }}>Active</span>
          </div>
        ))}
      </div>
      <Hint>Manage variants, add-ons, and availability via <strong style={{ color: "#7a7470" }}>/api/products/config</strong>.</Hint>
    </Card>
  );
}

export function OrderingTab({ s, setStr, setBool }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void; setBool: (k: keyof RestaurantSettings, v: boolean) => void }) {
  return <>
    <Card title="Online Ordering">
      <TR label="Accept online orders" desc="Allow customers to place orders from your online menu." value={s.acceptOnlineOrders} onChange={(v) => setBool("acceptOnlineOrders", v)} />
      <FR label="Minimum order (₱)" last><SI value={s.minimumOrderAmount} onChange={(v) => setStr("minimumOrderAmount", v)} type="number" placeholder="e.g. 150" /></FR>
    </Card>
    <Card title="Order Mode">
      <FR label="Store status">
        <SS value={s.storeStatusMode} onChange={(v) => setStr("storeStatusMode", v as RestaurantSettings["storeStatusMode"])}
          options={[{ value: "auto", label: "Auto (follow schedule)" }, { value: "manual_open", label: "Force Open" }, { value: "manual_closed", label: "Force Closed" }]} />
      </FR>
      <FR label="Scheduling" last>
        <span style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#9e9891" }}>Connects to <strong style={{ color: "#7a7470" }}>/api/orders/schedule</strong>.</span>
      </FR>
    </Card>
  </>;
}

export function PaymentTab() {
  const methods = [
    { name: "Cash", enabled: true },
    { name: "GCash", enabled: true },
    { name: "Maya", enabled: false },
    { name: "QR Payment", enabled: true },
  ];
  return (
    <Card title="Payment Methods">
      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        {methods.map((m) => (
          <div key={m.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fafaf9", border: "1px solid #eae7e2", borderRadius: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 500, color: "#484340" }}>{m.name}</span>
            <span style={{ fontFamily: FONT, fontSize: "0.67rem", fontWeight: 500, color: m.enabled ? "#15803d" : "#9e9891", background: m.enabled ? "rgba(34,197,94,.1)" : "#f5f4f2", padding: "2px 9px", borderRadius: 99 }}>
              {m.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        ))}
      </div>
      <Hint>Payment toggles sync with <strong style={{ color: "#7a7470" }}>/api/payment/methods</strong>.</Hint>
    </Card>
  );
}

export function ReceiptTab() {
  return (
    <Card title="Receipt Customization">
      {[["Receipt header", "e.g. Thank you for choosing The Crunch!"], ["Receipt footer", "e.g. Follow us @thecrunch"], ["QR code URL", "https://thecrunch.ph/menu"]].map(([lbl, ph], i, arr) => (
        <FR key={lbl} label={lbl} last={i === arr.length - 1}><SI value="" onChange={() => {}} placeholder={ph} /></FR>
      ))}
    </Card>
  );
}

export function BillingTab({ s, setStr }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void }) {
  return (
    <Card title="Tax & Charges">
      <FR label="VAT rate (%)"><SI value={s.taxRate} onChange={(v) => setStr("taxRate", v)} type="number" placeholder="e.g. 12" /></FR>
      <FR label="Service charge (%)" last><SI value={s.serviceCharge} onChange={(v) => setStr("serviceCharge", v)} type="number" placeholder="e.g. 10" /></FR>
    </Card>
  );
}

export function NotifTab({ s, setStr, setBool }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void; setBool: (k: keyof RestaurantSettings, v: boolean) => void }) {
  return <>
    <Card title="Alert Channels">
      <TR label="Toast notifications" value={s.enableToastNotifications} onChange={(v) => setBool("enableToastNotifications", v)} />
      <TR label="New order alerts" desc="Sound and visual alerts for incoming orders." value={true} onChange={() => {}} />
      <TR label="Low stock alerts" desc="Notify when inventory falls below threshold." value={true} onChange={() => {}} />
      <TR label="Email notifications" value={false} onChange={() => {}} />
      <TR label="SMS notifications" value={false} onChange={() => {}} last />
    </Card>
    <Card title="Toast Settings">
      <FR label="Position">
        <SS value={s.toastPosition} onChange={(v) => setStr("toastPosition", v)}
          options={[{ value: "top-right", label: "Top Right" }, { value: "top-left", label: "Top Left" }, { value: "bottom-right", label: "Bottom Right" }, { value: "bottom-left", label: "Bottom Left" }]} />
      </FR>
      <FR label="Duration" last>
        <SS value={s.toastDuration} onChange={(v) => setStr("toastDuration", v)}
          options={[{ value: "2000", label: "2 seconds" }, { value: "3000", label: "3 seconds" }, { value: "4000", label: "4 seconds" }, { value: "5000", label: "5 seconds" }]} />
      </FR>
    </Card>
  </>;
}

export function KitchenTab() {
  return (
    <Card title="Kitchen Display Settings">
      {([["KDS layout", ["Single column", "Two column", "Grid"]], ["Order priority", ["First in, first out", "Priority by prep time", "Manual"]], ["Default prep time (min)", null]] as [string, string[] | null][]).map(([lbl, opts], i, arr) => (
        <FR key={lbl} label={lbl} last={i === arr.length - 1}>
          {opts
            ? <SS value={opts[0]} onChange={() => {}} options={opts.map((o) => ({ value: o, label: o }))} />
            : <SI value="" onChange={() => {}} type="number" placeholder="e.g. 15" />}
        </FR>
      ))}
    </Card>
  );
}

export function DeliveryTab({ s, setStr }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void }) {
  return (
    <Card title="Delivery Configuration">
      <FR label="Delivery radius (km)"><SI value={s.deliveryRadius} onChange={(v) => setStr("deliveryRadius", v)} type="number" placeholder="e.g. 5" /></FR>
      <FR label="Delivery fee (₱)"><SI value={s.deliveryFee} onChange={(v) => setStr("deliveryFee", v)} type="number" placeholder="e.g. 50" /></FR>
      <FR label="Driver assignment" last>
        <SS value="manual" onChange={() => {}} options={[{ value: "manual", label: "Manual" }, { value: "auto", label: "Auto-assign" }]} />
      </FR>
    </Card>
  );
}

export function ReportsTab() {
  return (
    <Card title="Export & Scheduling">
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[["Export as PDF", "pdf"], ["Export as Excel", "excel"]].map(([lbl, fmt]) => (
          <button key={fmt} onClick={() => {}} style={S.accentBtn}>↓ {lbl}</button>
        ))}
      </div>
      <Hint>Scheduled reports connect to <strong style={{ color: "#7a7470" }}>/api/reports/schedule</strong>.</Hint>
    </Card>
  );
}

export function SecurityTab({ s, setStr }: { s: RestaurantSettings; setStr: (k: keyof RestaurantSettings, v: string) => void }) {
  return <>
    <Card title="Session & Access">
      <FR label="Session timeout (min)" last><SI value={s.sessionTimeout} onChange={(v) => setStr("sessionTimeout", v)} type="number" placeholder="e.g. 30" /></FR>
    </Card>
    <Card title="Advanced Security">
      <TR label="Two-factor authentication" desc="Require 2FA for all admin logins." value={false} onChange={() => {}} />
      <TR label="Login activity monitoring" desc="Log all login attempts to audit trail." value={true} onChange={() => {}} last />
    </Card>
  </>;
}

export function BackupTab() {
  return (
    <Card title="Backup & Restore">
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => {}} style={{ ...S.btn, background: "#1a3a2a", color: "#fff", borderColor: "#1a3a2a", boxShadow: "0 1px 4px rgba(26,58,42,.2)" }}>↓ Run manual backup</button>
        <button onClick={() => {}} style={S.btn}>↺ Restore from backup</button>
      </div>
      <Hint>Backup scheduling connects to <strong style={{ color: "#7a7470" }}>/api/backup/schedule</strong>.</Hint>
    </Card>
  );
}

export function AuditTab() {
  return (
    <Card title="Audit Logs">
      <div style={{ padding: "18px 20px", color: "#9e9891", fontFamily: FONT, fontSize: "0.78rem", lineHeight: 1.7 }}>
        User activity tracking, transaction logs, and system change history stream from <strong style={{ color: "#5a5652" }}>/api/audit/logs</strong>.
      </div>
    </Card>
  );
}

export function PersonalTab() {
  return <>
    <Card title="Profile Information">
      {([["Display name", "text", "e.g. Juan dela Cruz"], ["Email", "email", "juan@thecrunch.ph"]] as [string, string, string][]).map(([lbl, t, ph]) => (
        <FR key={lbl} label={lbl}><SI value="" onChange={() => {}} type={t} placeholder={ph} /></FR>
      ))}
      <FR label="New password" last><SI value="" onChange={() => {}} type="password" placeholder="Leave blank to keep current" /></FR>
    </Card>
    <Card title="Preferences">
      <TR label="Dark mode" desc="Toggle between light and dark interface." value={false} onChange={() => {}} />
      <TR label="Notification preferences" value={true} onChange={() => {}} last />
    </Card>
  </>;
}

// ─── Feedback Tab ─────────────────────────────────────────────────────────────
function StarDisplay({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={11} fill={n <= rating ? ACCENT : "none"} color={n <= rating ? ACCENT : "#d1cdc7"} />
      ))}
    </div>
  );
}

export function FeedbackTab({ feedback, loading, error, onRetry }: {
  feedback: FeedbackEntry[]; loading: boolean; error: string | null; onRetry: () => void;
}) {
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [filter, setFilter] = useState(0);

  const sorted = [...feedback]
    .filter((e) => filter === 0 || e.rating === filter)
    .sort((a, b) => {
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "highest") return b.rating - a.rating;
      return a.rating - b.rating;
    });

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 88, background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, opacity: 0.5 + i * 0.1 }} />
      ))}
    </div>
  );

  if (error) return (
    <div style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, padding: "28px 20px", textAlign: "center" }}>
      <p style={{ fontFamily: FONT, fontSize: "0.8rem", color: "#b91c1c", marginBottom: 10 }}>{error}</p>
      <button onClick={onRetry} style={S.accentBtn}>Try again</button>
    </div>
  );

  if (!feedback.length) return (
    <div style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, padding: "44px 20px", textAlign: "center" }}>
      <MessageSquare size={26} color="#d1cdc7" style={{ marginBottom: 8 }} />
      <p style={{ fontFamily: FONT, fontSize: "0.82rem", fontWeight: 500, color: "#b0aaa3" }}>No feedback yet</p>
    </div>
  );

  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {[0, 5, 4, 3, 2, 1].map((r) => (
        <button key={r} onClick={() => setFilter(r)} style={{
          fontFamily: FONT, fontSize: "0.69rem", fontWeight: filter === r ? 600 : 400,
          padding: "4px 10px", borderRadius: 99, border: "1px solid #e4e1dc",
          background: filter === r ? ACCENT : "#fafaf9", color: filter === r ? "#fff" : "#7a7470",
          cursor: "pointer", boxShadow: filter === r ? "0 1px 4px rgba(224,90,30,.2)" : "0 1px 3px rgba(0,0,0,.06)",
          transition: "all .15s",
        }}>{r === 0 ? "All" : `${r}★`}</button>
      ))}
      <div style={{ flex: 1 }} />
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ ...S.input, width: "auto", padding: "5px 10px" }}>
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="highest">Highest</option>
        <option value="lowest">Lowest</option>
      </select>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {sorted.map((e) => (
        <div key={e.id} style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, padding: "12px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
            <span style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 600, color: "#1c1a18" }}>{e.reviewerName}</span>
            <span style={{ fontFamily: FONT, fontSize: "0.66rem", color: "#b0aaa3" }}>
              {new Date(e.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
            </span>
            <span style={{ fontFamily: FONT, fontSize: "0.64rem", fontWeight: 500, color: "#7a7470", background: "#f5f2ee", border: "1px solid #ece6de", borderRadius: 99, padding: "2px 8px" }}>
              {e.productName}
            </span>
          </div>
          <StarDisplay rating={e.rating} />
          {e.message && <p style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#5a5652", lineHeight: 1.7, margin: "6px 0 0" }}>{e.message}</p>}
        </div>
      ))}
      {!sorted.length && (
        <p style={{ textAlign: "center", padding: "24px 0", color: "#b0aaa3", fontFamily: FONT, fontSize: "0.78rem" }}>No reviews match this filter.</p>
      )}
    </div>
  </>;
}

// ─── Nav data ─────────────────────────────────────────────────────────────────
export interface NavGroup { label: string; items: { key: TabKey; label: string }[] }

export const NAV_GROUPS: NavGroup[] = [
  { label: "Store", items: [{ key: "business", label: "Business Info" }, { key: "ordering", label: "Online Ordering" }, { key: "kitchen", label: "Kitchen Settings" }, { key: "delivery", label: "Delivery" }] },
  { label: "Catalog", items: [{ key: "products", label: "Products" }, { key: "inventory", label: "Inventory" }] },
  { label: "Finance", items: [{ key: "billing", label: "Tax & Charges" }, { key: "payment", label: "Payment Methods" }, { key: "receipt", label: "Receipt" }, { key: "reports", label: "Reports" }] },
  { label: "Admin", items: [{ key: "users", label: "User Management" }, { key: "roles", label: "Roles & Permissions" }, { key: "security", label: "Security" }, { key: "backup", label: "Backup & Restore" }, { key: "audit", label: "Audit Logs" }] },
  { label: "System", items: [{ key: "notifications", label: "Notifications" }, { key: "feedback", label: "Customer Feedback" }, { key: "personal", label: "Personal Settings" }] },
];

export const TAB_META: Record<TabKey, { title: string; desc: string }> = {
  business:      { title: "Business Information",    desc: "Restaurant identity, contact details, and operating hours." },
  users:         { title: "User Management",         desc: "Create, edit, deactivate users and reset passwords." },
  roles:         { title: "Roles & Permissions",     desc: "Feature access controls and permission matrix." },
  inventory:     { title: "Inventory Configuration", desc: "Stock thresholds, unit types, and supplier management." },
  products:      { title: "Product Configuration",   desc: "Categories, variants, add-ons, and availability." },
  ordering:      { title: "Online Ordering",         desc: "Accept orders, pickup, delivery, and scheduling settings." },
  payment:       { title: "Payment Configuration",   desc: "Cash, GCash, Maya, and QR payment methods." },
  receipt:       { title: "Receipt Customization",   desc: "Header, footer, and QR code on printed receipts." },
  billing:       { title: "Tax & Charges",           desc: "VAT configuration and service charge rules." },
  notifications: { title: "Notifications",           desc: "Alert channels and confirmation dialog settings." },
  kitchen:       { title: "Kitchen Settings",        desc: "KDS configuration, order priority, and prep times." },
  delivery:      { title: "Delivery Settings",       desc: "Radius, fees, and driver assignment options." },
  reports:       { title: "Reports",                 desc: "Export PDF/Excel and configure scheduled reports." },
  security:      { title: "Security Settings",       desc: "2FA, session timeout, and login monitoring." },
  backup:        { title: "Backup & Restore",        desc: "Manual and scheduled backups, database restore." },
  audit:         { title: "Audit Logs",              desc: "User activity, transaction, and system change history." },
  personal:      { title: "Personal Settings",       desc: "Profile, password, theme, and notification preferences." },
  feedback:      { title: "Customer Feedback",       desc: "Customer reviews and ratings from the menu page." },
};

// ─── Sidebar group ────────────────────────────────────────────────────────────
export function SidebarGroup({ group, active, role, feedbackCount, onSelect }: {
  group: NavGroup; active: TabKey; role: UserRole; feedbackCount: number; onSelect: (k: TabKey) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px", background: "none", border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: "0.62rem", fontWeight: 600, letterSpacing: ".09em",
          textTransform: "uppercase", color: "#b0aaa3",
        }}
      >
        {group.label}
        {open ? <ChevronUp size={11} color="#c8c4be" /> : <ChevronDown size={11} color="#c8c4be" />}
      </button>

      {open && group.items.map(({ key, label }) => {
        const locked = !canAccess(role, key);
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "11px 14px", background: isActive ? "#f0eeec" : "none",
              border: "none", borderRadius: 14, cursor: locked ? "default" : "pointer",
              fontFamily: FONT, fontSize: "0.85rem", fontWeight: isActive ? 600 : 500,
              color: isActive ? "#1c1a18" : locked ? "#c8c4be" : "#5a5652",
              textAlign: "left", transition: "background .12s, color .12s", marginBottom: 2,
            }}
          >
            {locked && <Lock size={13} color="#d1cdc7" style={{ flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{label}</span>
            {key === "feedback" && feedbackCount > 0 && !locked && (
              <span style={{
                fontSize: "0.62rem", fontWeight: 700, background: ACCENT, color: "#fff",
                borderRadius: 99, padding: "2px 6px", minWidth: 17, textAlign: "center",
              }}>
                {feedbackCount > 99 ? "99+" : feedbackCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) || "staff";

  const [activeTab, setActiveTab] = useState<TabKey>(
    canAccess(role, "business") ? "business" : "personal"
  );

  const [settings, setSettings] = useState<RestaurantSettings>(DEFAULT);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const fetchFeedback = () => {
    setFeedbackLoading(true);
    setFeedbackError(null);

    fetch("/api/feedback")
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then((data: FeedbackEntry[]) => setFeedback(data))
      .catch(() => setFeedbackError("Failed to load feedback. Please try again."))
      .finally(() => setFeedbackLoading(false));
  };

  useEffect(() => {
    fetchFeedback();
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.get<Record<string, unknown>>("/settings")
      .then((data) => {
        if (cancelled) return;
        setSettings((prev) => ({ ...prev, ...normalizeSettingsState(data) }));
        syncGeneralSettings(data);
        setSettingsError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsError(
            "Failed to load saved settings. Showing the current form values.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setStr = (k: keyof RestaurantSettings, v: string) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  const setBool = (k: keyof RestaurantSettings, v: boolean) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  const locked = !canAccess(role, activeTab);
  const meta = TAB_META[activeTab];
  const feedbackCount = feedback.length;

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    setSaveNotice(null);

    try {
      const saved = await saveGeneralSettings(
        settings as unknown as Record<string, unknown>,
      );
      setSettings((prev) => ({
        ...prev,
        ...normalizeSettingsState(saved as unknown as Record<string, unknown>),
      }));
      setSaveNotice("Settings saved.");
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : "Failed to save settings.",
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const renderTab = () => {
    if (locked) return <LockedSection tabLabel={meta.title} />;

    switch (activeTab) {
      case "business":      return <BusinessTab s={settings} setStr={setStr} />;
      case "users":         return <UsersTab />;
      case "roles":         return <RolesTab />;
      case "inventory":     return <InventoryTab s={settings} setStr={setStr} />;
      case "products":      return <ProductsTab />;
      case "ordering":      return <OrderingTab s={settings} setStr={setStr} setBool={setBool} />;
      case "payment":       return <PaymentTab />;
      case "receipt":       return <ReceiptTab />;
      case "billing":       return <BillingTab s={settings} setStr={setStr} />;
      case "notifications": return <NotifTab s={settings} setStr={setStr} setBool={setBool} />;
      case "kitchen":       return <KitchenTab />;
      case "delivery":      return <DeliveryTab s={settings} setStr={setStr} />;
      case "reports":       return <ReportsTab />;
      case "security":      return <SecurityTab s={settings} setStr={setStr} />;
      case "backup":        return <BackupTab />;
      case "audit":         return <AuditTab />;
      case "personal":      return <PersonalTab />;
      case "feedback":
        return (
          <FeedbackTab
            feedback={feedback}
            loading={feedbackLoading}
            error={feedbackError}
            onRetry={fetchFeedback}
          />
        );
      default: return null;
    }
  };

  return (
    <div style={{
      display: "flex", height: "100%", fontFamily: FONT, background: "#f0eeec",
      padding: 24, boxSizing: "border-box",
    }}>
      <div style={{
        display: "flex", width: "100%", maxWidth: 1100, margin: "0 auto",
        background: "#fff", borderRadius: 24, overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,.05)",
      }}>
        {/* Settings sidebar */}
        <div style={{
          width: 230, flexShrink: 0, background: "#fff",
          overflowY: "auto", padding: "24px 14px",
        }}>
          <div style={{ padding: "0 10px 18px" }}>
            <h2 style={{ fontFamily: FONT, fontSize: "1.1rem", fontWeight: 700, color: "#1c1a18", margin: 0 }}>
              Settings
            </h2>
          </div>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup
              key={group.label}
              group={group}
              active={activeTab}
              role={role}
              feedbackCount={feedbackCount}
              onSelect={setActiveTab}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "32px 36px",
          borderLeft: "1px solid #f0eeec",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              {settingsLoading && (
                <p style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#9e9891", margin: "0 0 6px" }}>
                  Loading saved settings...
                </p>
              )}
              {settingsError && (
                <p style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#b91c1c", margin: "0 0 6px" }}>
                  {settingsError}
                </p>
              )}
              {saveNotice && !settingsError && (
                <p style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#15803d", margin: "0 0 6px" }}>
                  {saveNotice}
                </p>
              )}
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving || settingsLoading}
              style={{
                ...S.accentBtn,
                textAlign: "center",
                opacity: settingsSaving || settingsLoading ? 0.55 : 1,
                cursor:
                  settingsSaving || settingsLoading ? "not-allowed" : "pointer",
              }}
            >
              {settingsSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
          <div style={{ marginBottom: 8 }}>
            <h1 style={{ fontFamily: FONT, fontSize: "1.4rem", fontWeight: 700, color: "#1c1a18", margin: "0 0 4px" }}>
              {meta.title}
            </h1>
            <p style={{ fontFamily: FONT, fontSize: "0.82rem", color: "#9e9891", margin: "0 0 8px" }}>
              {meta.desc}
            </p>
          </div>
          {renderTab()}
        </div>
      </div>
    </div>
  );
}
