import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/authcontext";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RestaurantSettings {
  restaurantName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  taxRate: string;
  serviceCharge: string;
  openTime: string;
  closeTime: string;
  maxTableCapacity: string;
  reservationBuffer: string;
  lowStockThreshold: string;
  autoReorderEnabled: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  orderAlerts: boolean;
  staffAlerts: boolean;
  dailyReportTime: string;
  receiptFooter: string;
  allowSplitBills: boolean;
  requireTableNumber: boolean;
  enableLoyaltyPoints: boolean;
  maintenanceMode: boolean;
}

type TabKey =
  | "general"
  | "operations"
  | "inventory"
  | "notifications"
  | "billing"
  | "system";

type SaveStatus = "idle" | "saving" | "saved";

type Role =
  | "administrator"
  | "cashier"
  | "cook"
  | "inventory_manager"
  | "customer"
  | null;

// ── Design tokens ─────────────────────────────────────────────────────────────

const FONT = "'Poppins', sans-serif";
const ACCENT = "#e8501a";
const TOPBAR_H = 58;

// ── Nav data ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<Exclude<Role, null>, string> = {
  administrator: "Administrator",
  cashier: "Cashier",
  cook: "Cook",
  inventory_manager: "Inventory Manager",
  customer: "Customer",
};

interface SidebarItem {
  label: string;
  path: string;
  roles: Exclude<Role, null>[];
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Overview",        path: "/dashboard",     roles: ["administrator", "inventory_manager"] },
  { label: "Order",           path: "/orders",        roles: ["administrator", "cashier", "cook"] },
  { label: "Menu Management", path: "/inventory",     roles: ["administrator", "inventory_manager"] },
  { label: "Menus",           path: "/menu",          roles: ["administrator", "cashier"] },
  { label: "Stock Manager",   path: "/stockmanager",  roles: ["administrator", "inventory_manager"] },
  { label: "User Accounts",   path: "/users",         roles: ["administrator"] },
  { label: "Sales & Reports", path: "/sales-reports", roles: ["administrator", "cashier"] },
  { label: "Settings",        path: "/settings",      roles: ["administrator", "cashier"] },
];

const CONFIG_TABS: { key: TabKey; label: string }[] = [
  { key: "general",       label: "General" },
  { key: "operations",    label: "Operations" },
  { key: "inventory",     label: "Inventory" },
  { key: "notifications", label: "Notifications" },
  { key: "billing",       label: "Billing" },
  { key: "system",        label: "System" },
];

// ── Field components ──────────────────────────────────────────────────────────

function FieldRow({
  label,
  last = false,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "188px 1fr",
        alignItems: "center",
        gap: 20,
        padding: "12px 24px",
        borderBottom: last ? "none" : "1px solid #f0ede8",
      }}
    >
      <p style={{ fontFamily: FONT, fontSize: "0.81rem", fontWeight: 500, color: "#484340", margin: 0 }}>
        {label}
      </p>
      {children}
    </div>
  );
}

const inputBase: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: "0.81rem",
  color: "#1c1a18",
  background: "#fafaf9",
  border: "1px solid #e4e1dc",
  borderRadius: 8,
  padding: "8px 12px",
  width: "100%",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
};

function StyledInput({ value, onChange, type = "text", placeholder = "" }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      style={{
        ...inputBase,
        borderColor: focused ? ACCENT : "#e4e1dc",
        boxShadow: focused ? "0 0 0 3px rgba(232,80,26,0.09)" : "none",
        background: focused ? "#fff" : "#fafaf9",
      }}
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    />
  );
}

function StyledSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      style={{
        ...inputBase, cursor: "pointer",
        borderColor: focused ? ACCENT : "#e4e1dc",
        boxShadow: focused ? "0 0 0 3px rgba(232,80,26,0.09)" : "none",
        background: focused ? "#fff" : "#fafaf9",
      }}
      value={value} onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ value, onChange, danger = false }: {
  value: boolean; onChange: (v: boolean) => void; danger?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: "relative", width: 42, height: 24, borderRadius: 99,
        border: "none", cursor: "pointer",
        background: value ? (danger ? "#d94040" : ACCENT) : "#d8d4ce",
        padding: 0, flexShrink: 0, transition: "background 0.22s",
      }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        style={{
          position: "absolute", top: 3, left: value ? 21 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
        }}
      />
    </button>
  );
}

function ToggleRow({ label, desc, value, onChange, last = false, danger = false }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void;
  last?: boolean; danger?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 24px", borderBottom: last ? "none" : "1px solid #f0ede8", gap: 16,
    }}>
      <div>
        <p style={{ fontFamily: FONT, fontSize: "0.81rem", fontWeight: 500, color: "#484340", margin: 0 }}>{label}</p>
        {desc && <p style={{ fontFamily: FONT, fontSize: "0.72rem", color: "#aea9a3", fontWeight: 400, margin: "2px 0 0" }}>{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} danger={danger} />
    </div>
  );
}

function SettingsCard({ title, delay = 0, children }: {
  title: string; delay?: number; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut", delay }}
      style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}
    >
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #f0ede8", background: "#faf8f5" }}>
        <p style={{ fontFamily: FONT, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#aaa49d", margin: 0 }}>
          {title}
        </p>
      </div>
      {children}
    </motion.div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { value: "PHP", label: "PHP — Philippine Peso" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
];

const TIMEZONES = [
  { value: "Asia/Manila",      label: "Asia/Manila (PHT +08:00)" },
  { value: "Asia/Singapore",   label: "Asia/Singapore (SGT +08:00)" },
  { value: "America/New_York", label: "America/New_York (EST −05:00)" },
  { value: "Europe/London",    label: "Europe/London (GMT +00:00)" },
];

const DEFAULT: RestaurantSettings = {
  restaurantName: "", tagline: "", email: "", phone: "", address: "",
  currency: "PHP", timezone: "Asia/Manila", taxRate: "", serviceCharge: "",
  openTime: "08:00", closeTime: "22:00", maxTableCapacity: "", reservationBuffer: "",
  lowStockThreshold: "", autoReorderEnabled: false, emailNotifications: true,
  smsNotifications: false, orderAlerts: true, staffAlerts: false,
  dailyReportTime: "08:00", receiptFooter: "", allowSplitBills: false,
  requireTableNumber: true, enableLoyaltyPoints: false, maintenanceMode: false,
};

const TAB_META: Record<TabKey, { title: string; desc: string }> = {
  general:       { title: "General",       desc: "Restaurant identity, contact details, and locale preferences." },
  operations:    { title: "Operations",    desc: "Business hours, table settings, and service options." },
  inventory:     { title: "Inventory",     desc: "Stock thresholds and automated reorder rules." },
  notifications: { title: "Notifications", desc: "Alert channels and daily report scheduling." },
  billing:       { title: "Billing",       desc: "Tax rates, service charges, and receipt customization." },
  system:        { title: "System",        desc: "Maintenance controls and live configuration preview." },
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("general");
  const [settings, setSettings] = useState<RestaurantSettings>(DEFAULT);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [unsaved, setUnsaved] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const navigate = useNavigate();
  const { user, logout, isOnline } = useAuth();
  const isMobile = useIsMobile();

  const userRole = user?.role as Role;
  const visibleItems = SIDEBAR_ITEMS.filter(
    (item) => userRole && item.roles.includes(userRole as Exclude<Role, null>)
  );

  useEffect(() => {
    if (!initialized) { setInitialized(true); return; }
    setUnsaved(true);
  }, [settings]);

  const setStr = useCallback((field: keyof RestaurantSettings, v: string) =>
    setSettings((p) => ({ ...p, [field]: v })), []);
  const setBool = useCallback((field: keyof RestaurantSettings, v: boolean) =>
    setSettings((p) => ({ ...p, [field]: v })), []);

  const handleSave = async () => {
    setSaveStatus("saving");
    await new Promise((r) => setTimeout(r, 800));
    setSaveStatus("saved");
    setUnsaved(false);
    setTimeout(() => setSaveStatus("idle"), 2200);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #ddd8d2; border-radius: 99px; }
        select option { font-family: 'Poppins', sans-serif; }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .config-tab-btn {
          position: relative;
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
          font-size: 0.82rem;
          font-weight: 500;
          color: #9a9490;
          padding: 10px 16px;
          border-radius: 0;
          transition: color 0.18s;
          white-space: nowrap;
        }
        .config-tab-btn:hover { color: #484340; }
        .config-tab-btn.active { color: #1c1a18; font-weight: 600; }
      `}</style>

      <div style={{ fontFamily: FONT, background: "#f4f2ef", minHeight: "100vh", color: "#1c1a18" }}>

        {/* ── Hamburger toggle ── */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "fixed z-50 p-3 bg-white rounded-xl shadow-lg",
            isMobile ? "top-4 left-4" : "top-6 left-6"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div key="close"
                initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}
              >
                <X className={cn(isMobile ? "w-5 h-5" : "w-6 h-6", "text-black")} />
              </motion.div>
            ) : (
              <motion.div key="menu"
                initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}
              >
                <Menu className={cn(isMobile ? "w-5 h-5" : "w-6 h-6", "text-black")} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        {/* ── Backdrop ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40"
              onClick={() => setIsOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ── Sidebar ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.aside
              initial={{ x: -288, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -288, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              style={{
                position: "fixed", top: 0, left: 0, height: "100%",
                background: "#fff", boxShadow: "4px 0 32px rgba(0,0,0,0.10)",
                zIndex: 50, fontFamily: "Poppins, sans-serif",
                width: isMobile ? "85vw" : "288px", maxWidth: "85vw",
                display: "flex", flexDirection: "column",
                padding: "0",
              }}
            >
              {/* Business name */}
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "28px 24px 20px",
                }}
              >
                <span style={{
                  fontWeight: 700, color: "#000",
                  fontSize: isMobile ? "1.2rem" : "1.4rem",
                  fontFamily: "Poppins, sans-serif",
                }}>
                  The Crunch
                </span>
              </motion.div>

              {/* Profile card */}
              {user && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.18 }}
                  style={{ padding: "0 24px 16px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                      background: isOnline ? "#4ade80" : "#d1d5db",
                    }} />
                    <span style={{
                      fontSize: "0.875rem", fontWeight: 600,
                      color: "#111827", fontFamily: "Poppins, sans-serif",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {user.username}
                    </span>
                  </div>
                  <span style={{
                    fontSize: "0.75rem", color: "#9ca3af",
                    fontFamily: "Poppins, sans-serif",
                    display: "block", paddingLeft: 18, marginTop: 2,
                  }}>
                    {ROLE_LABELS[user.role as Exclude<Role, null>] ?? user.role}
                  </span>
                </motion.div>
              )}

              <div style={{ height: 1, background: "#f3f4f6", margin: "0 0 8px" }} />

              {/* ── Scrollable nav ── */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minHeight: 0, padding: "0 16px" }}
                className="hide-scroll"
              >
                <p style={{
                  fontSize: "0.72rem", color: "#9ca3af", fontWeight: 500,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  fontFamily: "Poppins, sans-serif",
                  margin: "8px 0 6px", padding: "0 8px",
                }}>
                  Navigation
                </p>

                <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {visibleItems.map((item, i) => (
                    <motion.div key={item.label}
                      initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.15 + i * 0.04 }}
                    >
                      <NavLink to={item.path} end onClick={() => setIsOpen(false)}>
                        {({ isActive }) => (
                          <div style={{
                            width: "100%", textAlign: "left",
                            borderRadius: 12, padding: isMobile ? "12px 16px" : "10px 16px",
                            fontSize: isMobile ? "1rem" : "0.875rem",
                            fontWeight: isActive ? 600 : 400,
                            color: "#000",
                            background: isActive ? "#f3f4f6" : "transparent",
                            fontFamily: "Poppins, sans-serif",
                            cursor: "pointer",
                            transition: "background 0.15s",
                            display: "block",
                          }}
                            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#f9fafb"; }}
                            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                          >
                            {item.label}
                          </div>
                        )}
                      </NavLink>
                    </motion.div>
                  ))}
                </nav>
              </div>

              {/* Logout — pinned at bottom */}
              <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
                <motion.div
                  initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.45 }}
                >
                  <div
                    style={{
                      width: "100%", textAlign: "left",
                      borderRadius: 12, padding: isMobile ? "12px 16px" : "10px 16px",
                      fontSize: isMobile ? "1rem" : "0.875rem",
                      fontWeight: 400, color: "#000",
                      background: "transparent",
                      fontFamily: "Poppins, sans-serif",
                      cursor: "pointer", transition: "all 0.15s",
                      display: "block",
                    }}
                    onClick={() => { logout(); setIsOpen(false); navigate("/login"); }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "#fef2f2";
                      (e.currentTarget as HTMLDivElement).style.color = "#dc2626";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      (e.currentTarget as HTMLDivElement).style.color = "#000";
                    }}
                  >
                    Log Out
                  </div>
                </motion.div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Topbar ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 30,
          height: TOPBAR_H,
          background: "#fff",
          borderBottom: "1px solid #eae7e2",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px 0 72px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: "0.77rem", color: "#b0aaa3", fontWeight: 400 }}>THE-CRUNCH</span>
            <span style={{ color: "#d0ccc6", fontSize: "0.77rem" }}>›</span>
            <span style={{ fontFamily: FONT, fontSize: "0.77rem", color: "#484340", fontWeight: 600 }}>Settings</span>
            <span style={{ color: "#d0ccc6", fontSize: "0.77rem" }}>›</span>
            <span style={{ fontFamily: FONT, fontSize: "0.77rem", color: ACCENT, fontWeight: 600 }}>
              {TAB_META[tab].title}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AnimatePresence>
              {unsaved && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.16 }}
                  style={{
                    fontFamily: FONT, fontSize: "0.68rem", fontWeight: 600,
                    color: ACCENT, background: "rgba(232,80,26,0.07)",
                    border: "1px solid rgba(232,80,26,0.18)",
                    borderRadius: 99, padding: "3px 10px",
                    letterSpacing: "0.04em", textTransform: "uppercase",
                  }}
                >
                  Unsaved
                </motion.span>
              )}
            </AnimatePresence>

            <button
              onClick={() => { setSettings(DEFAULT); setUnsaved(false); }}
              style={{
                fontFamily: FONT, fontSize: "0.79rem", fontWeight: 500,
                color: "#7a7470", background: "transparent",
                border: "1px solid #e0dcd6", borderRadius: 8, padding: "7px 15px",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#b8b4ae"; e.currentTarget.style.color = "#484340"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e0dcd6"; e.currentTarget.style.color = "#7a7470"; }}
            >
              Reset
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              style={{
                fontFamily: FONT, fontSize: "0.79rem", fontWeight: 600,
                color: "#fff", background: saveStatus === "saved" ? "#3aaa60" : ACCENT,
                border: "none", borderRadius: 8, padding: "7px 20px",
                cursor: "pointer", minWidth: 112,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "background 0.2s",
              }}
            >
              {saveStatus === "saving" && (
                <span style={{
                  display: "inline-block", width: 13, height: 13,
                  border: "2px solid #fff", borderTopColor: "transparent",
                  borderRadius: "50%", animation: "spin 0.7s linear infinite",
                }} />
              )}
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓  Saved" : "Save Changes"}
            </motion.button>
          </div>
        </div>

        {/* ── Configuration Tab Bar — sticky just below topbar ── */}
        <div style={{
          position: "sticky",
          top: TOPBAR_H,
          zIndex: 20,
          background: "#fff",
          borderBottom: "1px solid #eae7e2",
          padding: "0 42px 0 72px",
          display: "flex",
          alignItems: "flex-end",
          gap: 0,
          overflowX: "auto",
        }}
          className="hide-scroll"
        >
          {CONFIG_TABS.map((t) => (
            <button
              key={t.key}
              className={`config-tab-btn${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {tab === t.key && (
                <motion.span
                  layoutId="tab-indicator"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 10,
                    right: 10,
                    height: 2,
                    borderRadius: "2px 2px 0 0",
                    background: ACCENT,
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <main style={{ padding: "32px 42px 48px 72px", maxWidth: 820 }}>

          {/* Page heading */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`heading-${tab}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              style={{ marginBottom: 24 }}
            >
              <p style={{
                fontFamily: FONT, fontSize: "1.18rem", fontWeight: 700,
                letterSpacing: "-0.02em", color: "#1c1a18", marginBottom: 4,
              }}>
                {TAB_META[tab].title}
              </p>
              <p style={{
                fontFamily: FONT, fontSize: "0.78rem",
                color: "#a09a94", fontWeight: 400,
              }}>
                {TAB_META[tab].desc}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`content-${tab}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >

              {tab === "general" && (
                <>
                  <SettingsCard title="Restaurant Identity" delay={0}>
                    <FieldRow label="Restaurant Name">
                      <StyledInput value={settings.restaurantName} onChange={(v) => setStr("restaurantName", v)} placeholder="e.g. The Crunch" />
                    </FieldRow>
                    <FieldRow label="Tagline" last>
                      <StyledInput value={settings.tagline} onChange={(v) => setStr("tagline", v)} placeholder="e.g. Crunch into flavor" />
                    </FieldRow>
                  </SettingsCard>

                  <SettingsCard title="Contact Information" delay={0.05}>
                    <FieldRow label="Email">
                      <StyledInput value={settings.email} onChange={(v) => setStr("email", v)} type="email" placeholder="contact@thecrunch.com" />
                    </FieldRow>
                    <FieldRow label="Phone">
                      <StyledInput value={settings.phone} onChange={(v) => setStr("phone", v)} placeholder="+63 912 345 6789" />
                    </FieldRow>
                    <FieldRow label="Address" last>
                      <StyledInput value={settings.address} onChange={(v) => setStr("address", v)} placeholder="123 Food St, Manila" />
                    </FieldRow>
                  </SettingsCard>

                  <SettingsCard title="Locale" delay={0.1}>
                    <FieldRow label="Currency">
                      <StyledSelect value={settings.currency} onChange={(v) => setStr("currency", v)} options={CURRENCIES} />
                    </FieldRow>
                    <FieldRow label="Timezone" last>
                      <StyledSelect value={settings.timezone} onChange={(v) => setStr("timezone", v)} options={TIMEZONES} />
                    </FieldRow>
                  </SettingsCard>
                </>
              )}

              {tab === "operations" && (
                <>
                  <SettingsCard title="Business Hours" delay={0}>
                    <FieldRow label="Opening Time">
                      <StyledInput value={settings.openTime} onChange={(v) => setStr("openTime", v)} type="time" />
                    </FieldRow>
                    <FieldRow label="Closing Time" last>
                      <StyledInput value={settings.closeTime} onChange={(v) => setStr("closeTime", v)} type="time" />
                    </FieldRow>
                  </SettingsCard>

                  <SettingsCard title="Table Management" delay={0.05}>
                    <FieldRow label="Max Capacity">
                      <StyledInput value={settings.maxTableCapacity} onChange={(v) => setStr("maxTableCapacity", v)} type="number" placeholder="e.g. 50 seats" />
                    </FieldRow>
                    <FieldRow label="Reservation Buffer (min)">
                      <StyledInput value={settings.reservationBuffer} onChange={(v) => setStr("reservationBuffer", v)} type="number" placeholder="e.g. 15" />
                    </FieldRow>
                    <ToggleRow label="Require Table Number" desc="Force table selection before order" value={settings.requireTableNumber} onChange={(v) => setBool("requireTableNumber", v)} last />
                  </SettingsCard>

                  <SettingsCard title="Service Options" delay={0.1}>
                    <ToggleRow label="Allow Split Bills" desc="Let customers divide their bill" value={settings.allowSplitBills} onChange={(v) => setBool("allowSplitBills", v)} />
                    <ToggleRow label="Enable Loyalty Points" desc="Reward repeat customers with points" value={settings.enableLoyaltyPoints} onChange={(v) => setBool("enableLoyaltyPoints", v)} last />
                  </SettingsCard>
                </>
              )}

              {tab === "inventory" && (
                <SettingsCard title="Stock Alerts" delay={0}>
                  <FieldRow label="Low Stock Threshold">
                    <StyledInput value={settings.lowStockThreshold} onChange={(v) => setStr("lowStockThreshold", v)} type="number" placeholder="e.g. 10 units" />
                  </FieldRow>
                  <ToggleRow label="Auto-Reorder" desc="Trigger reorders automatically when stock is low" value={settings.autoReorderEnabled} onChange={(v) => setBool("autoReorderEnabled", v)} last />
                </SettingsCard>
              )}

              {tab === "notifications" && (
                <>
                  <SettingsCard title="Channels" delay={0}>
                    <ToggleRow label="Email Notifications" desc="Receive alerts via email" value={settings.emailNotifications} onChange={(v) => setBool("emailNotifications", v)} />
                    <ToggleRow label="SMS Notifications" desc="Receive alerts via text message" value={settings.smsNotifications} onChange={(v) => setBool("smsNotifications", v)} last />
                  </SettingsCard>

                  <SettingsCard title="Alert Types" delay={0.05}>
                    <ToggleRow label="Order Alerts" desc="Notify on new or cancelled orders" value={settings.orderAlerts} onChange={(v) => setBool("orderAlerts", v)} />
                    <ToggleRow label="Staff Alerts" desc="Notify on staff clock-in and clock-out" value={settings.staffAlerts} onChange={(v) => setBool("staffAlerts", v)} />
                    <FieldRow label="Daily Report Time" last>
                      <StyledInput value={settings.dailyReportTime} onChange={(v) => setStr("dailyReportTime", v)} type="time" />
                    </FieldRow>
                  </SettingsCard>
                </>
              )}

              {tab === "billing" && (
                <>
                  <SettingsCard title="Tax & Charges" delay={0}>
                    <FieldRow label="Tax Rate (%)">
                      <StyledInput value={settings.taxRate} onChange={(v) => setStr("taxRate", v)} type="number" placeholder="e.g. 12" />
                    </FieldRow>
                    <FieldRow label="Service Charge (%)" last>
                      <StyledInput value={settings.serviceCharge} onChange={(v) => setStr("serviceCharge", v)} type="number" placeholder="e.g. 10" />
                    </FieldRow>
                  </SettingsCard>

                  <SettingsCard title="Receipt" delay={0.05}>
                    <FieldRow label="Footer Text" last>
                      <StyledInput value={settings.receiptFooter} onChange={(v) => setStr("receiptFooter", v)} placeholder="e.g. Thank you for dining with us!" />
                    </FieldRow>
                  </SettingsCard>
                </>
              )}

              {tab === "system" && (
                <>
                  <SettingsCard title="Maintenance" delay={0}>
                    <ToggleRow
                      label="Maintenance Mode"
                      desc="Disable the system for customers during updates"
                      value={settings.maintenanceMode}
                      onChange={(v) => setBool("maintenanceMode", v)}
                      danger last
                    />
                  </SettingsCard>

                  <SettingsCard title="Configuration Preview" delay={0.05}>
                    <div style={{ padding: "14px 24px" }}>
                      <pre style={{
                        fontFamily: "'Courier New', monospace", fontSize: "0.71rem",
                        color: "#7a7268", background: "#f5f2ee",
                        border: "1px solid #eae7e2", borderRadius: 8,
                        padding: "14px 16px", overflowX: "auto", lineHeight: 1.65, margin: 0,
                      }}>
                        {JSON.stringify(settings, null, 2)}
                      </pre>
                    </div>
                  </SettingsCard>
                </>
              )}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}