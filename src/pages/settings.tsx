import { useState, useEffect, useRef, useCallback } from "react";
import { Lock, ChevronDown, ChevronUp, Star, MessageSquare } from "lucide-react";
import { useAuth } from "../context/authcontext";
import { api } from "../lib/api";
import {
  fetchGeneralSettings,
  normalizeGeneralSettings,
  type GeneralRestaurantSettings,
} from "../lib/restaurantSettings";
import { useNotifications } from "../lib/NotificationContext";
import { Sidebar } from "@/components/Sidebar";

// ─── Types ────────────────────────────────────────────────────────────────────
export type UserRole = "administrator" | "cashier" | "cook" | "inventory_manager";
export type TabKey = "business" | "inventory" | "billing" | "ordering" | "notifications" | "delivery" | "security" | "feedback" | "personal" | "receipt" | "kitchen" | "reports" | "roles";

export interface FeedbackEntry {
  id: string;
  reviewerName: string;
  productName: string;
  rating: number;
  message: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT = "'Poppins', sans-serif";
const ACCENT = "#e05a1e";

const ADMIN_ONLY: TabKey[] = ["security", "roles"];
const COMING_SOON: TabKey[] = ["personal", "receipt", "kitchen", "reports", "roles"];

const NAV_ITEMS: { key: TabKey; label: string }[] = [
  { key: "business",      label: "Business Info" },
  { key: "ordering",      label: "Online Ordering" },
  { key: "delivery",      label: "Delivery" },
  { key: "inventory",     label: "Inventory" },
  { key: "billing",       label: "Tax & Charges" },
  { key: "notifications", label: "Notifications" },
  { key: "security",      label: "Security" },
  { key: "feedback",      label: "Customer Feedback" },
  { key: "personal",      label: "Personal Settings" },
  { key: "receipt",       label: "Receipt" },
  { key: "kitchen",       label: "Kitchen Settings" },
  { key: "reports",       label: "Reports" },
  { key: "roles",         label: "Roles & Permissions" },
];

const TAB_META: Record<TabKey, { title: string; desc: string }> = {
  business:      { title: "Business Info",         desc: "Restaurant name, contact details, and operating hours." },
  inventory:     { title: "Inventory",             desc: "Stock alert thresholds." },
  billing:       { title: "Tax & Charges",         desc: "VAT rate and service charge." },
  ordering:      { title: "Online Ordering",       desc: "Accept orders and store status." },
  notifications: { title: "Notifications",         desc: "Toast alerts and confirmation dialogs." },
  delivery:      { title: "Delivery",              desc: "Delivery radius, fee, and driver assignment." },
  security:      { title: "Security",              desc: "Session timeout and login monitoring." },
  feedback:      { title: "Customer Feedback",     desc: "Reviews and ratings from customers." },
  personal:      { title: "Personal Settings",     desc: "Your profile, password, and preferences." },
  receipt:       { title: "Receipt",               desc: "Customize header, footer, and QR code on receipts." },
  kitchen:       { title: "Kitchen Settings",      desc: "Kitchen Display layout, order priority, and prep times." },
  reports:       { title: "Reports",               desc: "Export sales and inventory reports." },
  roles:         { title: "Roles & Permissions",   desc: "Control what each role can access." },
};

function canAccess(role: UserRole, tab: TabKey): boolean {
  if (role === "administrator") return true;
  return !ADMIN_ONLY.includes(tab);
}

// ─── Shared field settings that go to /api/settings ──────────────────────────
// We extend GeneralRestaurantSettings with extra fields the tabs need
interface AppSettings extends GeneralRestaurantSettings {
  // Inventory
  lowStockThreshold: string;
  criticalStockThreshold: string;
  // Billing
  taxRate: string;
  serviceCharge: string;
  // Ordering
  acceptOnlineOrders: boolean;
  minimumOrderAmount: string;
  storeStatusMode: "auto" | "manual_open" | "manual_closed";
  // Notifications
  enableToastNotifications: boolean;
  toastPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  toastDuration: string;
  enableConfirmDialogs: boolean;
  // Delivery
  deliveryRadius: string;
  deliveryFee: string;
  // Security
  sessionTimeout: string;
  loginMonitoring: boolean;
}

const DEFAULTS: AppSettings = {
  restaurantName: "The Crunch",
  tagline: "",
  email: "",
  phone: "",
  address: "",
  currency: "PHP",
  timezone: "Asia/Manila",
  openTime: "08:00",
  closeTime: "22:00",
  lowStockThreshold: "",
  criticalStockThreshold: "",
  taxRate: "",
  serviceCharge: "",
  acceptOnlineOrders: true,
  minimumOrderAmount: "",
  storeStatusMode: "auto",
  enableToastNotifications: true,
  toastPosition: "top-right",
  toastDuration: "4000",
  enableConfirmDialogs: true,
  deliveryRadius: "",
  deliveryFee: "",
  sessionTimeout: "30",
  loginMonitoring: true,
};

function normalizeAppSettings(raw: Record<string, unknown>): AppSettings {
  const base = normalizeGeneralSettings(raw);
  const str  = (k: string, fb = "") => String(raw[k] ?? "").trim() || fb;
  const bool = (k: string, fb: boolean) => (k in raw ? Boolean(raw[k]) : fb);
  return {
    ...base,
    lowStockThreshold:      str("lowStockThreshold"),
    criticalStockThreshold: str("criticalStockThreshold"),
    taxRate:                str("taxRate"),
    serviceCharge:          str("serviceCharge"),
    acceptOnlineOrders:     bool("acceptOnlineOrders", true),
    minimumOrderAmount:     str("minimumOrderAmount"),
    storeStatusMode:        (str("storeStatusMode") || "auto") as AppSettings["storeStatusMode"],
    enableToastNotifications: bool("enableToastNotifications", true),
    toastPosition:          (str("toastPosition") || "top-right") as AppSettings["toastPosition"],
    toastDuration:          str("toastDuration", "4000"),
    enableConfirmDialogs:   bool("enableConfirmDialogs", true),
    deliveryRadius:         str("deliveryRadius"),
    deliveryFee:            str("deliveryFee"),
    sessionTimeout:         str("sessionTimeout", "30"),
    loginMonitoring:        bool("loginMonitoring", true),
  };
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  fontFamily: FONT, fontSize: "0.85rem", color: "#1c1a18",
  background: "#f7f6f5", border: "1px solid #ececec",
  borderRadius: 8, padding: "9px 12px", width: "100%",
  outline: "none", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  fontFamily: FONT, fontSize: "0.85rem", color: "#1c1a18",
  background: "#f0eeec", border: "none", borderRadius: 99,
  padding: "9px 16px", cursor: "pointer", outline: "none",
};

function SI({ value, onChange, type = "text", placeholder = "", disabled = false }: {
  value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      style={{ ...inputStyle, borderColor: focused ? ACCENT : "#ececec", boxShadow: focused ? `0 0 0 3px rgba(224,90,30,.1)` : "none", opacity: disabled ? 0.5 : 1 }}
      type={type} value={value} placeholder={placeholder} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    />
  );
}

function SS({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select style={{ ...selectStyle, paddingRight: 34 }} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} color="#9e9891" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => !disabled && onChange(!value)}
      style={{ position: "relative", width: 44, height: 24, borderRadius: 99, border: "none", cursor: disabled ? "not-allowed" : "pointer", background: value ? "#1c1a18" : "#e4e1dc", padding: 0, flexShrink: 0, transition: "background .2s", opacity: disabled ? 0.5 : 1 }}>
      <span style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.18)", transition: "left .18s" }} />
    </button>
  );
}

// ─── Field Row & Toggle Row ───────────────────────────────────────────────────
function FR({ label, last = false, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "175px minmax(0,1fr)", alignItems: "center", gap: 16, padding: "18px 0", borderBottom: last ? "none" : "1px solid #ececec" }}>
      <p style={{ fontFamily: FONT, fontSize: "0.85rem", fontWeight: 500, color: "#1c1a18", margin: 0 }}>{label}</p>
      {children}
    </div>
  );
}

function TR({ label, desc, value, onChange, last = false, disabled = false }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", borderBottom: last ? "none" : "1px solid #ececec", gap: 16 }}>
      <div>
        <p style={{ fontFamily: FONT, fontSize: "0.85rem", fontWeight: 500, color: "#1c1a18", margin: 0 }}>{label}</p>
        {desc && <p style={{ fontFamily: FONT, fontSize: "0.74rem", color: "#9e9891", margin: "3px 0 0", lineHeight: 1.6 }}>{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, background: "#fff", borderRadius: 14, border: "1px solid #ececec", padding: "0 20px" }}>
      <p style={{ fontFamily: FONT, fontSize: "0.7rem", fontWeight: 700, color: "#b0aaa3", textTransform: "uppercase", letterSpacing: ".08em", margin: 0, padding: "16px 0 0" }}>{title}</p>
      {children}
    </div>
  );
}

// ─── Save status indicator ────────────────────────────────────────────────────
function SaveStatus({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  const map = { saving: ["#9e9891", "Saving…"], saved: ["#15803d", "Saved"], error: ["#b91c1c", "Failed to save"] };
  const [color, label] = map[status];
  return <span style={{ fontFamily: FONT, fontSize: "0.75rem", color, transition: "color .2s" }}>{label}</span>;
}

// ─── Coming Soon ──────────────────────────────────────────────────────────────
function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ background: "#f7f6f5", borderRadius: 16, padding: "48px 32px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>
        🚧
      </div>
      <p style={{ fontFamily: FONT, fontSize: "0.9rem", fontWeight: 600, color: "#1c1a18", margin: "0 0 8px" }}>{title} — Coming Soon</p>
      <p style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#9e9891", margin: 0, lineHeight: 1.7, maxWidth: 300, marginInline: "auto" }}>
        {desc} This section will be available once the API is ready.
      </p>
    </div>
  );
}

// ─── Locked overlay ───────────────────────────────────────────────────────────
function LockedSection({ tabLabel }: { tabLabel: string }) {
  return (
    <div style={{ background: "#f7f6f5", borderRadius: 16, padding: "48px 32px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Lock size={22} color={ACCENT} />
      </div>
      <p style={{ fontFamily: FONT, fontSize: "0.9rem", fontWeight: 600, color: "#1c1a18", margin: "0 0 8px" }}>Access Restricted</p>
      <p style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#9e9891", margin: 0, lineHeight: 1.7, maxWidth: 300, marginInline: "auto" }}>
        You don't have permission to view <strong style={{ color: "#5a5652" }}>{tabLabel}</strong>. Contact your administrator.
      </p>
    </div>
  );
}

// ─── Tab panels ───────────────────────────────────────────────────────────────
function BusinessTab({ s, set }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void }) {
  return <>
    <Section title="Identity">
      <FR label="Business name"><SI value={s.restaurantName} onChange={(v) => set("restaurantName", v)} placeholder="The Crunch" /></FR>
      <FR label="Tagline" last><SI value={s.tagline} onChange={(v) => set("tagline", v)} placeholder="Crunch into flavor" /></FR>
    </Section>
    <Section title="Contact">
      <FR label="Email"><SI value={s.email} onChange={(v) => set("email", v)} type="email" placeholder="contact@thecrunch.ph" /></FR>
      <FR label="Phone"><SI value={s.phone} onChange={(v) => set("phone", v)} placeholder="+63 912 345 6789" /></FR>
      <FR label="Address" last><SI value={s.address} onChange={(v) => set("address", v)} placeholder="123 Food St, Manila" /></FR>
    </Section>
    <Section title="Operating Hours">
      <FR label="Open time"><SI value={s.openTime} onChange={(v) => set("openTime", v)} type="time" /></FR>
      <FR label="Close time" last><SI value={s.closeTime} onChange={(v) => set("closeTime", v)} type="time" /></FR>
    </Section>
  </>;
}

function InventoryTab({ s, set }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void }) {
  return (
    <Section title="Stock Alerts">
      <FR label="Low stock threshold"><SI value={s.lowStockThreshold} onChange={(v) => set("lowStockThreshold", v)} type="number" placeholder="e.g. 10" /></FR>
      <FR label="Critical threshold" last><SI value={s.criticalStockThreshold} onChange={(v) => set("criticalStockThreshold", v)} type="number" placeholder="e.g. 5" /></FR>
    </Section>
  );
}

function BillingTab({ s, set }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void }) {
  return (
    <Section title="Tax & Charges">
      <FR label="VAT rate (%)"><SI value={s.taxRate} onChange={(v) => set("taxRate", v)} type="number" placeholder="e.g. 12" /></FR>
      <FR label="Service charge (%)" last><SI value={s.serviceCharge} onChange={(v) => set("serviceCharge", v)} type="number" placeholder="e.g. 10" /></FR>
    </Section>
  );
}

function OrderingTab({ s, set, setBool }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void; setBool: (k: keyof AppSettings, v: boolean) => void }) {
  return <>
    <Section title="Online Orders">
      <TR label="Accept online orders" desc="Allow customers to place orders from your online menu." value={s.acceptOnlineOrders} onChange={(v) => setBool("acceptOnlineOrders", v)} />
      <FR label="Minimum order (₱)" last><SI value={s.minimumOrderAmount} onChange={(v) => set("minimumOrderAmount", v)} type="number" placeholder="e.g. 150" /></FR>
    </Section>
    <Section title="Store Status">
      <FR label="Status mode" last>
        <SS value={s.storeStatusMode} onChange={(v) => set("storeStatusMode", v)}
          options={[{ value: "auto", label: "Auto (follow schedule)" }, { value: "manual_open", label: "Force Open" }, { value: "manual_closed", label: "Force Closed" }]} />
      </FR>
    </Section>
  </>;
}

function NotificationsTab({ s, set, setBool }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void; setBool: (k: keyof AppSettings, v: boolean) => void }) {
  return <>
    <Section title="Alerts">
      <TR label="Toast notifications" value={s.enableToastNotifications} onChange={(v) => setBool("enableToastNotifications", v)} />
      <TR label="Confirm dialogs" desc="Show a confirmation prompt before destructive actions." value={s.enableConfirmDialogs} onChange={(v) => setBool("enableConfirmDialogs", v)} last />
    </Section>
    <Section title="Toast Settings">
      <FR label="Position">
        <SS value={s.toastPosition} onChange={(v) => set("toastPosition", v)}
          options={[{ value: "top-right", label: "Top Right" }, { value: "top-left", label: "Top Left" }, { value: "bottom-right", label: "Bottom Right" }, { value: "bottom-left", label: "Bottom Left" }]} />
      </FR>
      <FR label="Duration" last>
        <SS value={s.toastDuration} onChange={(v) => set("toastDuration", v)}
          options={[{ value: "2000", label: "2 seconds" }, { value: "3000", label: "3 seconds" }, { value: "4000", label: "4 seconds" }, { value: "5000", label: "5 seconds" }]} />
      </FR>
    </Section>
  </>;
}

function DeliveryTab({ s, set }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void }) {
  return (
    <Section title="Delivery">
      <FR label="Radius (km)"><SI value={s.deliveryRadius} onChange={(v) => set("deliveryRadius", v)} type="number" placeholder="e.g. 5" /></FR>
      <FR label="Fee (₱)" last><SI value={s.deliveryFee} onChange={(v) => set("deliveryFee", v)} type="number" placeholder="e.g. 50" /></FR>
    </Section>
  );
}

function SecurityTab({ s, set, setBool }: { s: AppSettings; set: (k: keyof AppSettings, v: string) => void; setBool: (k: keyof AppSettings, v: boolean) => void }) {
  return <>
    <Section title="Session">
      <FR label="Timeout (minutes)" last><SI value={s.sessionTimeout} onChange={(v) => set("sessionTimeout", v)} type="number" placeholder="e.g. 30" /></FR>
    </Section>
    <Section title="Monitoring">
      <TR label="Login activity monitoring" desc="Log all login attempts." value={s.loginMonitoring} onChange={(v) => setBool("loginMonitoring", v)} last />
    </Section>
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

function FeedbackTab({ feedback, loading, error, onRetry }: {
  feedback: FeedbackEntry[]; loading: boolean; error: string | null; onRetry: () => void;
}) {
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [filter, setFilter] = useState(0);

  const sorted = [...feedback]
    .filter((e) => filter === 0 || e.rating === filter)
    .sort((a, b) => {
      if (sort === "newest")  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "oldest")  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "highest") return b.rating - a.rating;
      return a.rating - b.rating;
    });

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[1, 2, 3].map((i) => <div key={i} style={{ height: 88, background: "#f7f6f5", borderRadius: 10, opacity: 0.4 + i * 0.1 }} />)}
    </div>
  );

  if (error) return (
    <div style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, padding: "28px 20px", textAlign: "center" }}>
      <p style={{ fontFamily: FONT, fontSize: "0.8rem", color: "#b91c1c", marginBottom: 10 }}>{error}</p>
      <button onClick={onRetry} style={{ fontFamily: FONT, fontSize: "0.82rem", fontWeight: 500, background: "#1c1a18", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer" }}>Try again</button>
    </div>
  );

  if (!feedback.length) return (
    <div style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, padding: "44px 20px", textAlign: "center" }}>
      <MessageSquare size={26} color="#d1cdc7" style={{ marginBottom: 8 }} />
      <p style={{ fontFamily: FONT, fontSize: "0.82rem", fontWeight: 500, color: "#b0aaa3" }}>No feedback yet.</p>
    </div>
  );

  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {[0, 5, 4, 3, 2, 1].map((r) => (
        <button key={r} onClick={() => setFilter(r)} style={{
          fontFamily: FONT, fontSize: "0.69rem", fontWeight: filter === r ? 600 : 400,
          padding: "4px 10px", borderRadius: 99, border: "1px solid #e4e1dc",
          background: filter === r ? ACCENT : "#fafaf9", color: filter === r ? "#fff" : "#7a7470",
          cursor: "pointer", transition: "all .15s",
        }}>{r === 0 ? "All" : `${r}★`}</button>
      ))}
      <div style={{ flex: 1 }} />
      <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
        style={{ fontFamily: FONT, fontSize: "0.8rem", padding: "5px 10px", border: "1px solid #ececec", borderRadius: 8, background: "#f7f6f5", outline: "none" }}>
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="highest">Highest rated</option>
        <option value="lowest">Lowest rated</option>
      </select>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {sorted.length === 0
        ? <p style={{ textAlign: "center", padding: "24px 0", color: "#b0aaa3", fontFamily: FONT, fontSize: "0.78rem" }}>No reviews match this filter.</p>
        : sorted.map((e) => (
          <div key={e.id} style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 600, color: "#1c1a18" }}>{e.reviewerName}</span>
              <span style={{ fontFamily: FONT, fontSize: "0.66rem", color: "#b0aaa3" }}>
                {new Date(e.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
              <span style={{ fontFamily: FONT, fontSize: "0.64rem", fontWeight: 500, color: "#7a7470", background: "#f5f2ee", border: "1px solid #ece6de", borderRadius: 99, padding: "2px 8px" }}>{e.productName}</span>
            </div>
            <StarDisplay rating={e.rating} />
            {e.message && <p style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#5a5652", lineHeight: 1.7, margin: "6px 0 0" }}>{e.message}</p>}
          </div>
        ))
      }
    </div>
  </>;
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const role = (user?.role as UserRole) ?? "cashier";

  const firstAllowed = NAV_ITEMS.find((item) => canAccess(role, item.key))?.key ?? "business";
  const [activeTab, setActiveTab] = useState<TabKey>(firstAllowed);
  const [navOpen, setNavOpen] = useState(true);

  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [feedback, setFeedback]           = useState<FeedbackEntry[]>([]);
  const [feedbackLoading, setFbLoading]   = useState(true);
  const [feedbackError, setFbError]       = useState<string | null>(null);

  // ── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetchGeneralSettings()
      .then((data) => {
        // fetchGeneralSettings already returns normalized base fields
        // merge with full AppSettings defaults for extended fields
        setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch(() => setLoadError("Failed to load settings."));
  }, []);

  // ── Load feedback on mount ─────────────────────────────────────────────────
  const fetchFeedback = useCallback(() => {
    setFbLoading(true);
    setFbError(null);
    api.get<FeedbackEntry[]>("/feedback")
      .then((data) => setFeedback(data))
      .catch(() => setFbError("Failed to load feedback. Please try again."))
      .finally(() => setFbLoading(false));
  }, []);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  // ── Auto-save with debounce ────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoSave = useCallback((updated: AppSettings) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    debounceRef.current = setTimeout(async () => {
      try {
        await api.put("/settings", updated);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
        addNotification({ id: crypto.randomUUID(), type: "error", label: "Failed to save settings." });
      }
    }, 600);
  }, [addNotification]);

  // ── Field updaters ─────────────────────────────────────────────────────────
  const set = useCallback((key: keyof AppSettings, value: string) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const setBool = useCallback((key: keyof AppSettings, value: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  // ── Render active tab ──────────────────────────────────────────────────────
  const renderTab = () => {
    if (!canAccess(role, activeTab)) return <LockedSection tabLabel={TAB_META[activeTab].title} />;
    if (COMING_SOON.includes(activeTab)) return <ComingSoon title={TAB_META[activeTab].title} desc={TAB_META[activeTab].desc} />;
    switch (activeTab) {
      case "business":      return <BusinessTab s={settings} set={set} />;
      case "inventory":     return <InventoryTab s={settings} set={set} />;
      case "billing":       return <BillingTab s={settings} set={set} />;
      case "ordering":      return <OrderingTab s={settings} set={set} setBool={setBool} />;
      case "notifications": return <NotificationsTab s={settings} set={set} setBool={setBool} />;
      case "delivery":      return <DeliveryTab s={settings} set={set} />;
      case "security":      return <SecurityTab s={settings} set={set} setBool={setBool} />;
      case "feedback":      return <FeedbackTab feedback={feedback} loading={feedbackLoading} error={feedbackError} onRetry={fetchFeedback} />;
    }
  };

  const meta = TAB_META[activeTab];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Sidebar />
      <div style={{ display: "flex", height: "100%", fontFamily: FONT, background: "#f0eeec", padding: 24, boxSizing: "border-box" }}>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ display: "flex", width: "100%", maxWidth: 1100, margin: "0 auto", background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.05)" }}>

          {/* Sidebar nav (settings tab list) */}
          <div style={{ width: 220, flexShrink: 0, background: "#fff", overflowY: "auto", padding: "24px 14px", borderRight: "1px solid #f0eeec" }}>
            <button onClick={() => setNavOpen((p) => !p)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px 18px", background: "none", border: "none", cursor: "pointer" }}>
              <h2 style={{ fontFamily: FONT, fontSize: "1.05rem", fontWeight: 700, color: "#1c1a18", margin: 0 }}>Settings</h2>
              {navOpen ? <ChevronUp size={14} color="#b0aaa3" /> : <ChevronDown size={14} color="#b0aaa3" />}
            </button>

            {navOpen && NAV_ITEMS.map(({ key, label }) => {
              const locked   = !canAccess(role, key);
              const soon     = COMING_SOON.includes(key);
              const isActive = activeTab === key;
              return (
                <button key={key} onClick={() => !locked && setActiveTab(key)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: isActive ? "#f0eeec" : "none", border: "none", borderRadius: 14, cursor: locked ? "default" : "pointer", fontFamily: FONT, fontSize: "0.85rem", fontWeight: isActive ? 600 : 500, color: isActive ? "#1c1a18" : locked ? "#c8c4be" : "#5a5652", textAlign: "left", marginBottom: 2 }}>
                  {locked && <Lock size={13} color="#d1cdc7" style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1 }}>{label}</span>
                  {soon && !locked && (
                    <span style={{ fontSize: "0.58rem", fontWeight: 700, background: "#f0eeec", color: "#b0aaa3", borderRadius: 99, padding: "2px 7px", letterSpacing: ".04em" }}>SOON</span>
                  )}
                  {key === "feedback" && feedback.length > 0 && !locked && !soon && (
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, background: ACCENT, color: "#fff", borderRadius: 99, padding: "2px 6px" }}>
                      {feedback.length > 99 ? "99+" : feedback.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}>
            {loadError
              ? <p style={{ fontFamily: FONT, fontSize: "0.85rem", color: "#b91c1c" }}>{loadError}</p>
              : <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
                  <div>
                    <h1 style={{ fontFamily: FONT, fontSize: "1.3rem", fontWeight: 700, color: "#1c1a18", margin: "0 0 4px" }}>{meta.title}</h1>
                    <p style={{ fontFamily: FONT, fontSize: "0.82rem", color: "#9e9891", margin: 0 }}>{meta.desc}</p>
                  </div>
                  <SaveStatus status={saveStatus} />
                </div>
                {renderTab()}
              </>
            }
          </div>
        </div>
      </div>
    </>
  );
}