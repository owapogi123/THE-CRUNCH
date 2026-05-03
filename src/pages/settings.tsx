import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Menu, X, Star, RefreshCw, MessageSquare, ChevronRight,
  Save, RotateCcw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/authcontext";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderTypes {
  dineIn: boolean;
  takeout: boolean;
  delivery: boolean;
}

interface RestaurantSettings {
  // General
  restaurantName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  // Operations
  openTime: string;
  closeTime: string;
  orderTypes: OrderTypes;
  queueManagement: boolean;
  maxTableCapacity: string;
  requireTableNumber: boolean;
  allowSplitBills: boolean;
  enableLoyaltyPoints: boolean;
  // Inventory
  lowStockThreshold: string;
  criticalStockThreshold: string;
  autoReorderEnabled: boolean;
  trackExpiry: boolean;
  wasteLogging: boolean;
  defaultUsageType: "manual" | "auto";
  requireInventoryApproval: boolean;
  allowNegativeStock: boolean;
  nearExpiryWarningDays: string;
  requireDailyUsageSubmission: boolean;
  autoFinalizeUsage: boolean;
  outOfStockBehavior: "hide" | "disable";
  // Notifications
  emailNotifications: boolean;
  smsNotifications: boolean;
  orderAlerts: boolean;
  staffAlerts: boolean;
  dailyReportTime: string;
  // Billing
  taxRate: string;
  serviceCharge: string;
  receiptFooter: string;
  printerEnabled: boolean;
  kitchenPrinterEnabled: boolean;
  // System
  maintenanceMode: boolean;
}

interface FeedbackEntry {
  id: string;
  reviewerName: string;
  productName: string;
  rating: number;
  message: string;
  createdAt: string;
}

interface FeedbackApiEntry {
  feedback_id?: number | string;
  product_id?: number | string;
  customer_user_id?: number | string | null;
  rating?: number | null;
  comment?: string;
  created_at?: string;
  product_name?: string;
  customer_name?: string;
}

interface InventoryCategoryRecord {
  category_id: number;
  name: string;
  uses_shelf_life: boolean | number;
  type?: "raw_material" | "ingredient" | "finished";
  shelf_life_enabled?: boolean | number;
  default_shelf_life_days?: number | null;
  is_active: boolean | number;
  created_at?: string;
  updated_at?: string;
}

interface InventoryUnitRecord {
  unit_id: number;
  name: string;
  abbreviation?: string | null;
  base_unit?: string | null;
  conversion_to_base?: number | null;
  is_active: boolean | number;
  created_at?: string;
  updated_at?: string;
}

type TabKey =
  | "general"
  | "operations"
  | "inventory"
  | "notifications"
  | "billing"
  | "system"
  | "feedback";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Role = "administrator" | "cashier" | "cook" | "inventory_manager" | "customer" | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT = "'DM Sans', sans-serif";
const ACCENT = "#d44d14";
const TOPBAR_H = 56;

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
  { label: "Orders",          path: "/orders",        roles: ["administrator", "cashier", "cook"] },
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
  { key: "feedback",      label: "Feedback" },
];

const TAB_META: Record<TabKey, { title: string; desc: string }> = {
  general:       { title: "General",       desc: "Restaurant identity, contact details, and locale preferences." },
  operations:    { title: "Operations",    desc: "Business hours, order types, and service configuration." },
  inventory:     { title: "Inventory",     desc: "Stock thresholds, expiry tracking, and reorder rules." },
  notifications: { title: "Notifications", desc: "Alert channels and daily report scheduling." },
  billing:       { title: "Billing",       desc: "Tax rates, service charges, and printing configuration." },
  system:        { title: "System",        desc: "Maintenance controls and live configuration preview." },
  feedback:      { title: "Feedback",      desc: "Customer reviews and ratings submitted from the menu page." },
};

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

const USAGE_TYPE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "auto", label: "Auto" },
] as const;

const OUT_OF_STOCK_BEHAVIOR_OPTIONS = [
  { value: "disable", label: "Disable item" },
  { value: "hide", label: "Hide item" },
] as const;

const CATEGORY_TYPE_OPTIONS = [
  { value: "raw_material", label: "Raw Material" },
  { value: "ingredient", label: "Ingredient" },
  { value: "finished", label: "Finished" },
] as const;

const DEFAULT: RestaurantSettings = {
  restaurantName: "",
  tagline: "",
  email: "",
  phone: "",
  address: "",
  currency: "PHP",
  timezone: "Asia/Manila",
  openTime: "08:00",
  closeTime: "22:00",
  orderTypes: { dineIn: true, takeout: true, delivery: false },
  queueManagement: false,
  maxTableCapacity: "",
  requireTableNumber: true,
  allowSplitBills: false,
  enableLoyaltyPoints: false,
  lowStockThreshold: "",
  criticalStockThreshold: "",
  autoReorderEnabled: false,
  trackExpiry: false,
  wasteLogging: false,
  defaultUsageType: "manual",
  requireInventoryApproval: true,
  allowNegativeStock: false,
  nearExpiryWarningDays: "3",
  requireDailyUsageSubmission: true,
  autoFinalizeUsage: false,
  outOfStockBehavior: "disable",
  emailNotifications: true,
  smsNotifications: false,
  orderAlerts: true,
  staffAlerts: false,
  dailyReportTime: "08:00",
  taxRate: "",
  serviceCharge: "",
  receiptFooter: "",
  printerEnabled: false,
  kitchenPrinterEnabled: false,
  maintenanceMode: false,
};

function asBool(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

// ─── Primitive UI components ──────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: "0.8rem",
  color: "#1c1a18",
  background: "#fafaf9",
  border: "1px solid #e4e1dc",
  borderRadius: 8,
  padding: "8px 12px",
  width: "100%",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s, background 0.15s",
};

function StyledInput({
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      style={{
        ...inputBase,
        borderColor: focused ? ACCENT : "#e4e1dc",
        boxShadow: focused ? `0 0 0 3px rgba(212,77,20,0.1)` : "none",
        background: focused ? "#fff" : "#fafaf9",
      }}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function StyledSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      style={{
        ...inputBase,
        cursor: "pointer",
        borderColor: focused ? ACCENT : "#e4e1dc",
        boxShadow: focused ? `0 0 0 3px rgba(212,77,20,0.1)` : "none",
        background: focused ? "#fff" : "#fafaf9",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({
  value,
  onChange,
  danger = false,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-checked={value}
      role="switch"
      style={{
        position: "relative",
        width: 40,
        height: 22,
        borderRadius: 99,
        border: "none",
        cursor: "pointer",
        background: value ? (danger ? "#b91c1c" : ACCENT) : "#d1cdc7",
        padding: 0,
        flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        style={{
          position: "absolute",
          top: 3,
          left: value ? 20 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

// ─── Layout components ────────────────────────────────────────────────────────

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
        gridTemplateColumns: "176px 1fr",
        alignItems: "center",
        gap: 16,
        padding: "11px 22px",
        borderBottom: last ? "none" : "1px solid #f0ede8",
      }}
    >
      <p style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 500, color: "#5a5652", margin: 0 }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onChange,
  last = false,
  danger = false,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 22px",
        borderBottom: last ? "none" : "1px solid #f0ede8",
        gap: 16,
      }}
    >
      <div>
        <p style={{ fontFamily: FONT, fontSize: "0.8rem", fontWeight: 500, color: "#5a5652", margin: 0 }}>
          {label}
        </p>
        {desc && (
          <p style={{ fontFamily: FONT, fontSize: "0.72rem", color: "#b0aaa3", margin: "2px 0 0" }}>
            {desc}
          </p>
        )}
      </div>
      <Toggle value={value} onChange={onChange} danger={danger} />
    </div>
  );
}

function SettingsCard({
  title,
  delay = 0,
  children,
}: {
  title: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
      style={{
        background: "#fff",
        border: "1px solid #eae7e2",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          padding: "9px 22px",
          borderBottom: "1px solid #f0ede8",
          background: "#faf8f5",
        }}
      >
        <p
          style={{
            fontFamily: FONT,
            fontSize: "0.67rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#b0aaa3",
            margin: 0,
          }}
        >
          {title}
        </p>
      </div>
      {children}
    </motion.div>
  );
}

function InventoryCategoryEditor({
  category,
  busy,
  onSave,
  onDisable,
}: {
  category: InventoryCategoryRecord;
  busy: boolean;
  onSave: (
    categoryId: number,
    payload: {
      name?: string;
      uses_shelf_life?: boolean;
      type?: "raw_material" | "ingredient" | "finished";
      shelf_life_enabled?: boolean;
      default_shelf_life_days?: number | null;
      is_active?: boolean;
    },
  ) => Promise<void>;
  onDisable: (categoryId: number) => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [usesShelfLife, setUsesShelfLife] = useState(asBool(category.uses_shelf_life));
  const [categoryType, setCategoryType] = useState<"raw_material" | "ingredient" | "finished">(
    category.type ?? (asBool(category.uses_shelf_life) ? "raw_material" : "ingredient"),
  );
  const [shelfLifeEnabled, setShelfLifeEnabled] = useState(
    asBool(category.shelf_life_enabled ?? category.uses_shelf_life),
  );
  const [defaultShelfLifeDays, setDefaultShelfLifeDays] = useState(
    category.default_shelf_life_days != null ? String(category.default_shelf_life_days) : "",
  );

  useEffect(() => {
    setName(category.name);
    setUsesShelfLife(asBool(category.uses_shelf_life));
    setCategoryType(
      category.type ?? (asBool(category.uses_shelf_life) ? "raw_material" : "ingredient"),
    );
    setShelfLifeEnabled(asBool(category.shelf_life_enabled ?? category.uses_shelf_life));
    setDefaultShelfLifeDays(
      category.default_shelf_life_days != null ? String(category.default_shelf_life_days) : "",
    );
  }, [category]);

  return (
    <div
      style={{
        border: "1px solid #ece8e2",
        borderRadius: 10,
        padding: "12px 14px",
        background: asBool(category.is_active) ? "#fff" : "#faf7f4",
        opacity: asBool(category.is_active) ? 1 : 0.75,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,170px) minmax(0,170px) minmax(0,150px) auto", gap: 10, alignItems: "end" }}>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Category</p>
          <StyledInput value={name} onChange={setName} placeholder="Category name" />
        </div>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Type</p>
          <StyledSelect
            value={categoryType}
            onChange={(v) => setCategoryType(v as "raw_material" | "ingredient" | "finished")}
            options={[...CATEGORY_TYPE_OPTIONS]}
          />
        </div>
        <div style={{ minWidth: 130 }}>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Shelf life</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #e4e1dc", borderRadius: 8, background: "#fafaf9", padding: "8px 10px" }}>
            <span style={{ fontFamily: FONT, fontSize: "0.74rem", color: "#5a5652" }}>
              {shelfLifeEnabled ? "Enabled" : "Disabled"}
            </span>
            <Toggle
              value={shelfLifeEnabled}
              onChange={(value) => {
                setShelfLifeEnabled(value);
                setUsesShelfLife(value);
              }}
            />
          </div>
        </div>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Default shelf life days</p>
          <StyledInput
            value={defaultShelfLifeDays}
            onChange={setDefaultShelfLifeDays}
            type="number"
            placeholder="optional"
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={async () => {
              try {
                await onSave(category.category_id, {
                  name,
                  uses_shelf_life: usesShelfLife,
                  type: categoryType,
                  shelf_life_enabled: shelfLifeEnabled,
                  default_shelf_life_days:
                    defaultShelfLifeDays.trim() === ""
                      ? null
                      : Number(defaultShelfLifeDays),
                });
              } catch {
                /* handled by parent */
              }
            }}
            disabled={busy}
            style={{
              fontFamily: FONT,
              fontSize: "0.73rem",
              fontWeight: 600,
              color: "#fff",
              background: "#1f2937",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              opacity: busy ? 0.65 : 1,
            }}
          >
            Save
          </button>
          {asBool(category.is_active) ? (
            <button
              onClick={async () => {
                try {
                  await onDisable(category.category_id);
                } catch {
                  /* handled by parent */
                }
              }}
              disabled={busy}
              style={{
                fontFamily: FONT,
                fontSize: "0.73rem",
                fontWeight: 600,
                color: "#b91c1c",
                background: "#fff5f5",
                border: "1px solid rgba(185,28,28,0.16)",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                opacity: busy ? 0.65 : 1,
              }}
            >
              Disable
            </button>
          ) : (
            <span style={{ fontFamily: FONT, fontSize: "0.72rem", fontWeight: 600, color: "#b0aaa3", alignSelf: "center" }}>
              Disabled
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryUnitEditor({
  unit,
  busy,
  onSave,
  onDisable,
}: {
  unit: InventoryUnitRecord;
  busy: boolean;
  onSave: (
    unitId: number,
    payload: {
      name?: string;
      abbreviation?: string | null;
      base_unit?: string | null;
      conversion_to_base?: number | null;
      is_active?: boolean;
    },
  ) => Promise<void>;
  onDisable: (unitId: number) => Promise<void>;
}) {
  const [name, setName] = useState(unit.name);
  const [abbreviation, setAbbreviation] = useState(unit.abbreviation ?? "");
  const [baseUnit, setBaseUnit] = useState(unit.base_unit ?? "");
  const [conversionToBase, setConversionToBase] = useState(
    unit.conversion_to_base != null ? String(unit.conversion_to_base) : "",
  );

  useEffect(() => {
    setName(unit.name);
    setAbbreviation(unit.abbreviation ?? "");
    setBaseUnit(unit.base_unit ?? "");
    setConversionToBase(
      unit.conversion_to_base != null ? String(unit.conversion_to_base) : "",
    );
  }, [unit]);

  return (
    <div
      style={{
        border: "1px solid #ece8e2",
        borderRadius: 10,
        padding: "12px 14px",
        background: asBool(unit.is_active) ? "#fff" : "#faf7f4",
        opacity: asBool(unit.is_active) ? 1 : 0.75,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,130px) minmax(0,150px) minmax(0,140px) auto", gap: 10, alignItems: "end" }}>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Unit</p>
          <StyledInput value={name} onChange={setName} placeholder="Unit name" />
        </div>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Abbreviation</p>
          <StyledInput value={abbreviation} onChange={setAbbreviation} placeholder="optional" />
        </div>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Base unit</p>
          <StyledInput value={baseUnit} onChange={setBaseUnit} placeholder="optional" />
        </div>
        <div>
          <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Conversion to base</p>
          <StyledInput value={conversionToBase} onChange={setConversionToBase} type="number" placeholder="optional" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={async () => {
              try {
                await onSave(unit.unit_id, {
                  name,
                  abbreviation,
                  base_unit: baseUnit,
                  conversion_to_base:
                    conversionToBase.trim() === "" ? null : Number(conversionToBase),
                });
              } catch {
                /* handled by parent */
              }
            }}
            disabled={busy}
            style={{
              fontFamily: FONT,
              fontSize: "0.73rem",
              fontWeight: 600,
              color: "#fff",
              background: "#1f2937",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              opacity: busy ? 0.65 : 1,
            }}
          >
            Save
          </button>
          {asBool(unit.is_active) ? (
            <button
              onClick={async () => {
                try {
                  await onDisable(unit.unit_id);
                } catch {
                  /* handled by parent */
                }
              }}
              disabled={busy}
              style={{
                fontFamily: FONT,
                fontSize: "0.73rem",
                fontWeight: 600,
                color: "#b91c1c",
                background: "#fff5f5",
                border: "1px solid rgba(185,28,28,0.16)",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                opacity: busy ? 0.65 : 1,
              }}
            >
              Disable
            </button>
          ) : (
            <span style={{ fontFamily: FONT, fontSize: "0.72rem", fontWeight: 600, color: "#b0aaa3", alignSelf: "center" }}>
              Disabled
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Feedback sub-components ──────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          fill={n <= rating ? ACCENT : "none"}
          color={n <= rating ? ACCENT : "#d1cdc7"}
        />
      ))}
    </div>
  );
}

function RatingSummary({ entries }: { entries: FeedbackEntry[] }) {
  if (entries.length === 0) return null;
  const avg = entries.reduce((s, e) => s + e.rating, 0) / entries.length;
  const counts = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: entries.filter((e) => e.rating === r).length,
    pct: Math.round((entries.filter((e) => e.rating === r).length / entries.length) * 100),
  }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#fff",
        border: "1px solid #eae7e2",
        borderRadius: 12,
        padding: "18px 22px",
        marginBottom: 12,
        display: "flex",
        gap: 28,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 72 }}>
        <span style={{ fontFamily: FONT, fontSize: "2.4rem", fontWeight: 700, color: "#1c1a18", lineHeight: 1 }}>
          {avg.toFixed(1)}
        </span>
        <StarDisplay rating={Math.round(avg)} />
        <span style={{ fontFamily: FONT, fontSize: "0.67rem", color: "#b0aaa3" }}>
          {entries.length} review{entries.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, minWidth: 140 }}>
        {counts.map(({ rating, count, pct }) => (
          <div key={rating} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: "0.67rem", fontWeight: 600, color: "#7a7470", width: 8 }}>
              {rating}
            </span>
            <Star size={10} fill={ACCENT} color={ACCENT} />
            <div style={{ flex: 1, height: 5, background: "#f0ede8", borderRadius: 99, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                style={{ height: "100%", background: ACCENT, borderRadius: 99 }}
              />
            </div>
            <span style={{ fontFamily: FONT, fontSize: "0.67rem", color: "#b0aaa3", width: 24, textAlign: "right" }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

const RATING_LABEL = ["", "Poor", "Fair", "Good", "Great", "Amazing"];

function FeedbackCard({ entry }: { entry: FeedbackEntry }) {
  const date = new Date(entry.createdAt);
  const formatted = date.toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{
        background: "#fff",
        border: "1px solid #eae7e2",
        borderRadius: 12,
        padding: "14px 18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0, left: 16, right: 16,
          height: 2,
          background: `linear-gradient(90deg, ${ACCENT}88, transparent)`,
          borderRadius: "0 0 2px 2px",
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT, fontSize: "0.82rem", fontWeight: 600, color: "#1c1a18" }}>
              {entry.reviewerName}
            </span>
            <span style={{ fontFamily: FONT, fontSize: "0.67rem", color: "#b0aaa3" }}>{formatted}</span>
            <span
              style={{
                fontFamily: FONT, fontSize: "0.65rem", fontWeight: 600, color: "#7a7470",
                background: "#f7f4ef", border: "1px solid #ece6de", borderRadius: 99, padding: "2px 8px",
              }}
            >
              {entry.productName}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StarDisplay rating={entry.rating} />
            {entry.rating > 0 && (
              <span
                style={{
                  fontFamily: FONT, fontSize: "0.63rem", fontWeight: 600, color: ACCENT,
                  background: "rgba(212,77,20,0.07)", border: "1px solid rgba(212,77,20,0.18)",
                  borderRadius: 99, padding: "1px 8px", letterSpacing: "0.04em",
                }}
              >
                {RATING_LABEL[entry.rating]}
              </span>
            )}
          </div>
        </div>
      </div>
      {entry.message && (
        <p style={{ fontFamily: FONT, fontSize: "0.79rem", color: "#5a5652", lineHeight: 1.7, margin: 0 }}>
          {entry.message}
        </p>
      )}
    </motion.div>
  );
}

// ─── Tab content panels ───────────────────────────────────────────────────────

function GeneralTab({
  settings,
  setStr,
}: {
  settings: RestaurantSettings;
  setStr: (k: keyof RestaurantSettings, v: string) => void;
}) {
  return (
    <>
      <SettingsCard title="Restaurant Identity" delay={0}>
        <FieldRow label="Restaurant name">
          <StyledInput value={settings.restaurantName} onChange={(v) => setStr("restaurantName", v)} placeholder="e.g. The Crunch" />
        </FieldRow>
        <FieldRow label="Tagline" last>
          <StyledInput value={settings.tagline} onChange={(v) => setStr("tagline", v)} placeholder="e.g. Crunch into flavor" />
        </FieldRow>
      </SettingsCard>

      <SettingsCard title="Contact Information" delay={0.04}>
        <FieldRow label="Email">
          <StyledInput value={settings.email} onChange={(v) => setStr("email", v)} type="email" placeholder="contact@thecrunch.ph" />
        </FieldRow>
        <FieldRow label="Phone">
          <StyledInput value={settings.phone} onChange={(v) => setStr("phone", v)} placeholder="+63 912 345 6789" />
        </FieldRow>
        <FieldRow label="Address" last>
          <StyledInput value={settings.address} onChange={(v) => setStr("address", v)} placeholder="123 Food St, Manila" />
        </FieldRow>
      </SettingsCard>

      <SettingsCard title="Locale" delay={0.08}>
        <FieldRow label="Currency">
          <StyledSelect value={settings.currency} onChange={(v) => setStr("currency", v)} options={CURRENCIES} />
        </FieldRow>
        <FieldRow label="Timezone" last>
          <StyledSelect value={settings.timezone} onChange={(v) => setStr("timezone", v)} options={TIMEZONES} />
        </FieldRow>
      </SettingsCard>
    </>
  );
}

function OperationsTab({
  settings,
  setStr,
  setBool,
  setOrderType,
}: {
  settings: RestaurantSettings;
  setStr: (k: keyof RestaurantSettings, v: string) => void;
  setBool: (k: keyof RestaurantSettings, v: boolean) => void;
  setOrderType: (k: keyof OrderTypes, v: boolean) => void;
}) {
  return (
    <>
      <SettingsCard title="Business Hours" delay={0}>
        <FieldRow label="Opening time">
          <StyledInput value={settings.openTime} onChange={(v) => setStr("openTime", v)} type="time" />
        </FieldRow>
        <FieldRow label="Closing time" last>
          <StyledInput value={settings.closeTime} onChange={(v) => setStr("closeTime", v)} type="time" />
        </FieldRow>
      </SettingsCard>

      <SettingsCard title="Order Types" delay={0.04}>
        <ToggleRow label="Dine-in" desc="Accept orders at tables" value={settings.orderTypes.dineIn} onChange={(v) => setOrderType("dineIn", v)} />
        <ToggleRow label="Takeout" desc="Allow customers to pick up orders" value={settings.orderTypes.takeout} onChange={(v) => setOrderType("takeout", v)} />
        <ToggleRow label="Delivery" desc="Enable delivery orders" value={settings.orderTypes.delivery} onChange={(v) => setOrderType("delivery", v)} last />
      </SettingsCard>

      <SettingsCard title="Table Management" delay={0.08}>
        <FieldRow label="Max capacity">
          <StyledInput value={settings.maxTableCapacity} onChange={(v) => setStr("maxTableCapacity", v)} type="number" placeholder="e.g. 50 seats" />
        </FieldRow>
        <ToggleRow label="Require table number" desc="Force table selection before placing order" value={settings.requireTableNumber} onChange={(v) => setBool("requireTableNumber", v)} />
        <ToggleRow label="Queue / waitlist" desc="Enable waitlist management for busy hours" value={settings.queueManagement} onChange={(v) => setBool("queueManagement", v)} last />
      </SettingsCard>

      <SettingsCard title="Service Options" delay={0.12}>
        <ToggleRow label="Allow split bills" desc="Let customers divide their bill" value={settings.allowSplitBills} onChange={(v) => setBool("allowSplitBills", v)} />
        <ToggleRow label="Loyalty points" desc="Reward repeat customers with points" value={settings.enableLoyaltyPoints} onChange={(v) => setBool("enableLoyaltyPoints", v)} last />
      </SettingsCard>
    </>
  );
}

function InventoryTab({
  settings,
  setStr,
  setBool,
  categories,
  units,
  mastersLoading,
  mastersError,
  onReloadMasters,
  onAddCategory,
  onUpdateCategory,
  onDisableCategory,
  onAddUnit,
  onUpdateUnit,
  onDisableUnit,
}: {
  settings: RestaurantSettings;
  setStr: (k: keyof RestaurantSettings, v: string) => void;
  setBool: (k: keyof RestaurantSettings, v: boolean) => void;
  categories: InventoryCategoryRecord[];
  units: InventoryUnitRecord[];
  mastersLoading: boolean;
  mastersError: string | null;
  onReloadMasters: () => void;
  onAddCategory: (payload: {
    name: string;
    uses_shelf_life: boolean;
    type: "raw_material" | "ingredient" | "finished";
    shelf_life_enabled: boolean;
    default_shelf_life_days?: number | null;
  }) => Promise<void>;
  onUpdateCategory: (
    categoryId: number,
    payload: {
      name?: string;
      uses_shelf_life?: boolean;
      type?: "raw_material" | "ingredient" | "finished";
      shelf_life_enabled?: boolean;
      default_shelf_life_days?: number | null;
      is_active?: boolean;
    },
  ) => Promise<void>;
  onDisableCategory: (categoryId: number) => Promise<void>;
  onAddUnit: (payload: {
    name: string;
    abbreviation?: string | null;
    base_unit?: string | null;
    conversion_to_base?: number | null;
  }) => Promise<void>;
  onUpdateUnit: (
    unitId: number,
    payload: {
      name?: string;
      abbreviation?: string | null;
      base_unit?: string | null;
      conversion_to_base?: number | null;
      is_active?: boolean;
    },
  ) => Promise<void>;
  onDisableUnit: (unitId: number) => Promise<void>;
}) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryShelfLife, setNewCategoryShelfLife] = useState(false);
  const [newCategoryType, setNewCategoryType] = useState<"raw_material" | "ingredient" | "finished">("ingredient");
  const [newCategoryShelfLifeDays, setNewCategoryShelfLifeDays] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitAbbreviation, setNewUnitAbbreviation] = useState("");
  const [newUnitBase, setNewUnitBase] = useState("");
  const [newUnitConversion, setNewUnitConversion] = useState("");

  return (
    <>
      <SettingsCard title="Stock Alerts" delay={0}>
        <FieldRow label="Low stock threshold">
          <StyledInput value={settings.lowStockThreshold} onChange={(v) => setStr("lowStockThreshold", v)} type="number" placeholder="e.g. 10 units" />
        </FieldRow>
        <FieldRow label="Critical stock threshold">
          <StyledInput value={settings.criticalStockThreshold} onChange={(v) => setStr("criticalStockThreshold", v)} type="number" placeholder="e.g. 5 units" />
        </FieldRow>
        <FieldRow label="Out-of-stock behavior">
          <StyledSelect value={settings.outOfStockBehavior} onChange={(v) => setStr("outOfStockBehavior", v)} options={[...OUT_OF_STOCK_BEHAVIOR_OPTIONS]} />
        </FieldRow>
        <ToggleRow label="Auto-reorder" desc="Trigger reorders automatically when stock falls below threshold" value={settings.autoReorderEnabled} onChange={(v) => setBool("autoReorderEnabled", v)} last />
      </SettingsCard>

      <SettingsCard title="Inventory Control" delay={0.04}>
        <FieldRow label="Default usage type">
          <StyledSelect value={settings.defaultUsageType} onChange={(v) => setStr("defaultUsageType", v)} options={[...USAGE_TYPE_OPTIONS]} />
        </FieldRow>
        <FieldRow label="Near expiry warning days">
          <StyledInput value={settings.nearExpiryWarningDays} onChange={(v) => setStr("nearExpiryWarningDays", v)} type="number" placeholder="e.g. 3" />
        </FieldRow>
        <ToggleRow label="Require inventory approval" desc="Hold sensitive inventory actions for inventory-manager review" value={settings.requireInventoryApproval} onChange={(v) => setBool("requireInventoryApproval", v)} />
        <ToggleRow label="Allow negative stock" desc="Permit temporary negative kitchen stock balances when enabled" value={settings.allowNegativeStock} onChange={(v) => setBool("allowNegativeStock", v)} last />
      </SettingsCard>

      <SettingsCard title="Daily Usage Settings" delay={0.08}>
        <FieldRow label="Default usage type">
          <StyledSelect value={settings.defaultUsageType} onChange={(v) => setStr("defaultUsageType", v)} options={[...USAGE_TYPE_OPTIONS]} />
        </FieldRow>
        <ToggleRow label="Require daily usage submission" desc="Require cooks to submit a daily usage report for review" value={settings.requireDailyUsageSubmission} onChange={(v) => setBool("requireDailyUsageSubmission", v)} />
        <ToggleRow label="Auto-finalize usage" desc="Finalize daily usage automatically when review is not required" value={settings.autoFinalizeUsage} onChange={(v) => setBool("autoFinalizeUsage", v)} last />
      </SettingsCard>

      <SettingsCard title="Food Freshness" delay={0.12}>
        <ToggleRow label="Track expiry dates" desc="Monitor ingredient and product expiry" value={settings.trackExpiry} onChange={(v) => setBool("trackExpiry", v)} />
        <ToggleRow label="Waste logging" desc="Log discarded or expired food for reporting" value={settings.wasteLogging} onChange={(v) => setBool("wasteLogging", v)} last />
      </SettingsCard>

      <SettingsCard title="Category Defaults" delay={0.16}>
        <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontFamily: FONT, fontSize: "0.75rem", color: "#8b847d", lineHeight: 1.6 }}>
            Manage inventory categories stored in the database. Shelf-life-enabled categories will be treated as raw-material style categories when the master list is available.
          </p>

          {mastersError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <span style={{ fontFamily: FONT, fontSize: "0.74rem", color: "#9a3412" }}>
                {mastersError}
              </span>
              <button
                onClick={onReloadMasters}
                style={{
                  fontFamily: FONT,
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: ACCENT,
                  background: "#fff",
                  border: "1px solid #fed7aa",
                  borderRadius: 8,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                Reload
              </button>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,150px) auto minmax(0,170px) auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Category name</p>
              <StyledInput value={newCategoryName} onChange={setNewCategoryName} placeholder="e.g. Dry Goods" />
            </div>
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Type</p>
              <StyledSelect value={newCategoryType} onChange={(v) => setNewCategoryType(v as "raw_material" | "ingredient" | "finished")} options={[...CATEGORY_TYPE_OPTIONS]} />
            </div>
            <div style={{ minWidth: 130 }}>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Shelf life</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #e4e1dc", borderRadius: 8, background: "#fafaf9", padding: "8px 10px" }}>
                <span style={{ fontFamily: FONT, fontSize: "0.76rem", color: "#5a5652" }}>
                  Uses shelf life
                </span>
                <Toggle value={newCategoryShelfLife} onChange={setNewCategoryShelfLife} />
              </div>
            </div>
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Default shelf life days</p>
              <StyledInput value={newCategoryShelfLifeDays} onChange={setNewCategoryShelfLifeDays} type="number" placeholder="optional" />
            </div>
            <button
              onClick={async () => {
                try {
                  await onAddCategory({
                    name: newCategoryName,
                    uses_shelf_life: newCategoryShelfLife,
                    type: newCategoryType,
                    shelf_life_enabled: newCategoryShelfLife,
                    default_shelf_life_days:
                      newCategoryShelfLifeDays.trim() === ""
                        ? null
                        : Number(newCategoryShelfLifeDays),
                  });
                  setNewCategoryName("");
                  setNewCategoryShelfLife(false);
                  setNewCategoryType("ingredient");
                  setNewCategoryShelfLifeDays("");
                } catch {
                  /* handled by parent */
                }
              }}
              disabled={mastersLoading}
              style={{
                fontFamily: FONT,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#fff",
                background: ACCENT,
                border: "none",
                borderRadius: 8,
                padding: "9px 14px",
                cursor: "pointer",
                opacity: mastersLoading ? 0.65 : 1,
              }}
            >
              Add category
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categories.map((category) => (
              <InventoryCategoryEditor
                key={category.category_id}
                category={category}
                busy={mastersLoading}
                onSave={onUpdateCategory}
                onDisable={onDisableCategory}
              />
            ))}
            {categories.length === 0 && (
              <div style={{ textAlign: "center", padding: "18px 0", fontFamily: FONT, fontSize: "0.77rem", color: "#b0aaa3" }}>
                No inventory categories found.
              </div>
            )}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Unit Defaults" delay={0.2}>
        <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontFamily: FONT, fontSize: "0.75rem", color: "#8b847d", lineHeight: 1.6 }}>
            Manage unit options used by stock forms. Stock Manager still falls back to its current hardcoded list if this API is unavailable.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,140px) minmax(0,160px) minmax(0,150px) auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Unit name</p>
              <StyledInput value={newUnitName} onChange={setNewUnitName} placeholder="e.g. tray" />
            </div>
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Abbreviation</p>
              <StyledInput value={newUnitAbbreviation} onChange={setNewUnitAbbreviation} placeholder="optional" />
            </div>
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Base unit</p>
              <StyledInput value={newUnitBase} onChange={setNewUnitBase} placeholder="optional" />
            </div>
            <div>
              <p style={{ fontFamily: FONT, fontSize: "0.68rem", color: "#9a9490", marginBottom: 6 }}>Conversion to base</p>
              <StyledInput value={newUnitConversion} onChange={setNewUnitConversion} type="number" placeholder="optional" />
            </div>
            <button
              onClick={async () => {
                try {
                  await onAddUnit({
                    name: newUnitName,
                    abbreviation: newUnitAbbreviation,
                    base_unit: newUnitBase,
                    conversion_to_base:
                      newUnitConversion.trim() === ""
                        ? null
                        : Number(newUnitConversion),
                  });
                  setNewUnitName("");
                  setNewUnitAbbreviation("");
                  setNewUnitBase("");
                  setNewUnitConversion("");
                } catch {
                  /* handled by parent */
                }
              }}
              disabled={mastersLoading}
              style={{
                fontFamily: FONT,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "#fff",
                background: ACCENT,
                border: "none",
                borderRadius: 8,
                padding: "9px 14px",
                cursor: "pointer",
                opacity: mastersLoading ? 0.65 : 1,
              }}
            >
              Add unit
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {units.map((unit) => (
              <InventoryUnitEditor
                key={unit.unit_id}
                unit={unit}
                busy={mastersLoading}
                onSave={onUpdateUnit}
                onDisable={onDisableUnit}
              />
            ))}
            {units.length === 0 && (
              <div style={{ textAlign: "center", padding: "18px 0", fontFamily: FONT, fontSize: "0.77rem", color: "#b0aaa3" }}>
                No inventory units found.
              </div>
            )}
          </div>
        </div>
      </SettingsCard>
    </>
  );
}

function NotificationsTab({
  settings,
  setStr,
  setBool,
}: {
  settings: RestaurantSettings;
  setStr: (k: keyof RestaurantSettings, v: string) => void;
  setBool: (k: keyof RestaurantSettings, v: boolean) => void;
}) {
  return (
    <>
      <SettingsCard title="Channels" delay={0}>
        <ToggleRow label="Email notifications" desc="Receive alerts via email" value={settings.emailNotifications} onChange={(v) => setBool("emailNotifications", v)} />
        <ToggleRow label="SMS notifications" desc="Receive alerts via text message" value={settings.smsNotifications} onChange={(v) => setBool("smsNotifications", v)} last />
      </SettingsCard>

      <SettingsCard title="Alert Types" delay={0.04}>
        <ToggleRow label="Order alerts" desc="Notify on new or cancelled orders" value={settings.orderAlerts} onChange={(v) => setBool("orderAlerts", v)} />
        <ToggleRow label="Staff alerts" desc="Notify on staff clock-in and clock-out" value={settings.staffAlerts} onChange={(v) => setBool("staffAlerts", v)} />
        <FieldRow label="Daily report time" last>
          <StyledInput value={settings.dailyReportTime} onChange={(v) => setStr("dailyReportTime", v)} type="time" />
        </FieldRow>
      </SettingsCard>
    </>
  );
}

function BillingTab({
  settings,
  setStr,
  setBool,
}: {
  settings: RestaurantSettings;
  setStr: (k: keyof RestaurantSettings, v: string) => void;
  setBool: (k: keyof RestaurantSettings, v: boolean) => void;
}) {
  return (
    <>
      <SettingsCard title="Tax & Charges" delay={0}>
        <FieldRow label="Tax rate (%)">
          <StyledInput value={settings.taxRate} onChange={(v) => setStr("taxRate", v)} type="number" placeholder="e.g. 12" />
        </FieldRow>
        <FieldRow label="Service charge (%)" last>
          <StyledInput value={settings.serviceCharge} onChange={(v) => setStr("serviceCharge", v)} type="number" placeholder="e.g. 10" />
        </FieldRow>
      </SettingsCard>

      <SettingsCard title="Receipt" delay={0.04}>
        <FieldRow label="Footer text" last>
          <StyledInput value={settings.receiptFooter} onChange={(v) => setStr("receiptFooter", v)} placeholder="e.g. Thank you for dining with us!" />
        </FieldRow>
      </SettingsCard>

      <SettingsCard title="Printing" delay={0.08}>
        <ToggleRow label="POS receipt printer" desc="Print receipts automatically on order completion" value={settings.printerEnabled} onChange={(v) => setBool("printerEnabled", v)} />
        <ToggleRow label="Kitchen printer" desc="Send orders directly to kitchen printer" value={settings.kitchenPrinterEnabled} onChange={(v) => setBool("kitchenPrinterEnabled", v)} last />
      </SettingsCard>
    </>
  );
}

function SystemTab({ settings, setBool }: { settings: RestaurantSettings; setBool: (k: keyof RestaurantSettings, v: boolean) => void }) {
  return (
    <>
      <SettingsCard title="Maintenance" delay={0}>
        <ToggleRow
          label="Maintenance mode"
          desc="Disable the system for customers during updates"
          value={settings.maintenanceMode}
          onChange={(v) => setBool("maintenanceMode", v)}
          danger
          last
        />
      </SettingsCard>

      {settings.maintenanceMode && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: "rgba(185,28,28,0.05)", border: "1px solid rgba(185,28,28,0.18)",
            borderRadius: 10, padding: "12px 16px", marginBottom: 12,
          }}
        >
          <AlertTriangle size={15} color="#b91c1c" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#b91c1c", margin: 0 }}>
            Maintenance mode is active. Customers cannot access the system right now.
          </p>
        </motion.div>
      )}

      <SettingsCard title="Configuration Preview" delay={0.04}>
        <div style={{ padding: "14px 22px" }}>
          <pre
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.7rem",
              color: "#7a7268",
              background: "#f5f2ee",
              border: "1px solid #eae7e2",
              borderRadius: 8,
              padding: "14px 16px",
              overflowX: "auto",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {JSON.stringify(settings, null, 2)}
          </pre>
        </div>
      </SettingsCard>
    </>
  );
}

function FeedbackTab({
  feedback,
  loading,
  error,
  onRetry,
}: {
  feedback: FeedbackEntry[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [fbSort, setFbSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [fbFilter, setFbFilter] = useState<number>(0);

  const sorted = [...feedback]
    .filter((e) => fbFilter === 0 || e.rating === fbFilter)
    .sort((a, b) => {
      if (fbSort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (fbSort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (fbSort === "highest") return b.rating - a.rating;
      return a.rating - b.rating;
    });

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
            style={{ height: 100, background: "#fff", border: "1px solid #eae7e2", borderRadius: 12 }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 12, padding: "32px 24px", textAlign: "center" }}
      >
        <p style={{ fontFamily: FONT, fontSize: "0.82rem", color: "#b91c1c", marginBottom: 12 }}>{error}</p>
        <button
          onClick={onRetry}
          style={{
            fontFamily: FONT, fontSize: "0.79rem", fontWeight: 600, color: ACCENT,
            background: "rgba(212,77,20,0.07)", border: `1px solid rgba(212,77,20,0.2)`,
            borderRadius: 8, padding: "7px 18px", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </motion.div>
    );
  }

  if (feedback.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ background: "#fff", border: "1px solid #eae7e2", borderRadius: 12, padding: "56px 24px", textAlign: "center" }}
      >
        <MessageSquare size={32} color="#d1cdc7" style={{ marginBottom: 10 }} />
        <p style={{ fontFamily: FONT, fontSize: "0.9rem", fontWeight: 600, color: "#b0aaa3", marginBottom: 4 }}>
          No feedback yet
        </p>
        <p style={{ fontFamily: FONT, fontSize: "0.78rem", color: "#c8c4be" }}>
          Customer reviews will appear here once submitted from the menu page.
        </p>
      </motion.div>
    );
  }

  return (
    <>
      <RatingSummary entries={feedback} />

      {/* Filter & sort bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT, fontSize: "0.67rem", fontWeight: 700, color: "#b0aaa3", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4 }}>
          Filter
        </span>
        {[0, 5, 4, 3, 2, 1].map((r) => (
          <button
            key={r}
            onClick={() => setFbFilter(r)}
            style={{
              fontFamily: FONT, fontSize: "0.72rem", fontWeight: fbFilter === r ? 600 : 500,
              padding: "4px 11px", borderRadius: 99,
              border: "1px solid #e4e1dc",
              background: fbFilter === r ? ACCENT : "#fafaf9",
              color: fbFilter === r ? "#fff" : "#7a7470",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {r === 0 ? "All" : `${r}★`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <select
          value={fbSort}
          onChange={(e) => setFbSort(e.target.value as typeof fbSort)}
          style={{
            fontFamily: FONT, fontSize: "0.72rem", fontWeight: 500,
            color: "#484340", background: "#fafaf9",
            border: "1px solid #e4e1dc", borderRadius: 8,
            padding: "5px 10px", cursor: "pointer", outline: "none",
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
      </div>

      <motion.div layout style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <AnimatePresence mode="popLayout">
          {sorted.map((entry) => (
            <FeedbackCard key={entry.id} entry={entry} />
          ))}
        </AnimatePresence>
        {sorted.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: "center", padding: "28px 0", color: "#b0aaa3", fontFamily: FONT, fontSize: "0.79rem" }}
          >
            No reviews match this filter.
          </motion.div>
        )}
      </motion.div>
    </>
  );
}

// ─── Main SettingsPage ────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("general");
  const [settings, setSettings] = useState<RestaurantSettings>(DEFAULT);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [unsaved, setUnsaved] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategoryRecord[]>([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnitRecord[]>([]);
  const [inventoryMastersLoading, setInventoryMastersLoading] = useState(false);
  const [inventoryMastersError, setInventoryMastersError] = useState<string | null>(null);

  const initialized = useRef(false);
  const hydratingSettings = useRef(false);
  const navigate = useNavigate();
  const { user, logout, isOnline } = useAuth();
  const isMobile = useIsMobile();

  const userRole = user?.role as Role;
  const visibleItems = SIDEBAR_ITEMS.filter(
    (item) => userRole && item.roles.includes(userRole as Exclude<Role, null>)
  );

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) throw new Error("Could not load settings");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        hydratingSettings.current = true;
        setSettings((prev) => ({
          ...prev,
          ...(data && typeof data === "object" ? data : {}),
          orderTypes: {
            ...prev.orderTypes,
            ...(data?.orderTypes && typeof data.orderTypes === "object"
              ? data.orderTypes
              : {}),
          },
        }));
      } catch {
        /* keep defaults */
      } finally {
        window.setTimeout(() => {
          hydratingSettings.current = false;
          initialized.current = true;
        }, 0);
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mark unsaved after initial load
  useEffect(() => {
    if (hydratingSettings.current) return;
    if (!initialized.current) return;
    setUnsaved(true);
  }, [settings]);

  // Fetch feedback when tab becomes active
  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/feedback");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `${res.status}`);
      }
      const data: FeedbackApiEntry[] = await res.json();
      const normalized: FeedbackEntry[] = Array.isArray(data)
        ? data.map((entry, index) => ({
            id: String(entry.feedback_id ?? `feedback-${index}`),
            reviewerName: String(entry.customer_name ?? "").trim() || "Anonymous",
            productName: String(entry.product_name ?? "").trim() || "Unknown product",
            rating: typeof entry.rating === "number" && Number.isFinite(entry.rating) ? entry.rating : 0,
            message: String(entry.comment ?? "").trim(),
            createdAt: String(entry.created_at ?? "").trim() || new Date().toISOString(),
          }))
        : [];
      setFeedback(normalized);
    } catch (err) {
      setFeedbackError(
        err instanceof Error && err.message
          ? err.message
          : "Could not load feedback. Please try again."
      );
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  const fetchInventoryMasters = useCallback(async () => {
    setInventoryMastersLoading(true);
    setInventoryMastersError(null);
    try {
      const [categoriesRes, unitsRes] = await Promise.all([
        fetch("/api/settings/inventory-categories"),
        fetch("/api/settings/inventory-units"),
      ]);

      if (!categoriesRes.ok || !unitsRes.ok) {
        throw new Error("Could not load inventory master lists.");
      }

      const [categoriesData, unitsData] = await Promise.all([
        categoriesRes.json(),
        unitsRes.json(),
      ]);

      setInventoryCategories(Array.isArray(categoriesData) ? categoriesData : []);
      setInventoryUnits(Array.isArray(unitsData) ? unitsData : []);
    } catch (err) {
      setInventoryMastersError(
        err instanceof Error && err.message
          ? err.message
          : "Could not load inventory master lists.",
      );
    } finally {
      setInventoryMastersLoading(false);
    }
  }, []);

  const addInventoryCategory = useCallback(
    async (payload: {
      name: string;
      uses_shelf_life: boolean;
      type: "raw_material" | "ingredient" | "finished";
      shelf_life_enabled: boolean;
      default_shelf_life_days?: number | null;
    }) => {
      const res = await fetch("/api/settings/inventory-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to create category");
      }
      setInventoryCategories((prev) => [data, ...prev]);
    },
    [],
  );

  const updateInventoryCategory = useCallback(
    async (
      categoryId: number,
      payload: {
        name?: string;
        uses_shelf_life?: boolean;
        type?: "raw_material" | "ingredient" | "finished";
        shelf_life_enabled?: boolean;
        default_shelf_life_days?: number | null;
        is_active?: boolean;
      },
    ) => {
      const res = await fetch(`/api/settings/inventory-categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update category");
      }
      setInventoryCategories((prev) =>
        prev.map((item) => (item.category_id === categoryId ? data : item)),
      );
    },
    [],
  );

  const disableInventoryCategory = useCallback(async (categoryId: number) => {
    const res = await fetch(`/api/settings/inventory-categories/${categoryId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || "Failed to disable category");
    }
    setInventoryCategories((prev) =>
      prev.map((item) =>
        item.category_id === categoryId ? { ...item, is_active: false } : item,
      ),
    );
  }, []);

  const addInventoryUnit = useCallback(
    async (payload: {
      name: string;
      abbreviation?: string | null;
      base_unit?: string | null;
      conversion_to_base?: number | null;
    }) => {
      const res = await fetch("/api/settings/inventory-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to create unit");
      }
      setInventoryUnits((prev) => [data, ...prev]);
    },
    [],
  );

  const updateInventoryUnit = useCallback(
    async (
      unitId: number,
      payload: {
        name?: string;
        abbreviation?: string | null;
        base_unit?: string | null;
        conversion_to_base?: number | null;
        is_active?: boolean;
      },
    ) => {
      const res = await fetch(`/api/settings/inventory-units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update unit");
      }
      setInventoryUnits((prev) =>
        prev.map((item) => (item.unit_id === unitId ? data : item)),
      );
    },
    [],
  );

  const disableInventoryUnit = useCallback(async (unitId: number) => {
    const res = await fetch(`/api/settings/inventory-units/${unitId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || "Failed to disable unit");
    }
    setInventoryUnits((prev) =>
      prev.map((item) =>
        item.unit_id === unitId ? { ...item, is_active: false } : item,
      ),
    );
  }, []);

  useEffect(() => {
    if (tab === "feedback") fetchFeedback();
  }, [tab, fetchFeedback]);

  useEffect(() => {
    if (tab === "inventory") {
      fetchInventoryMasters();
    }
  }, [tab, fetchInventoryMasters]);

  // Setters
  const setStr = useCallback(
    (field: keyof RestaurantSettings, v: string) =>
      setSettings((p) => ({ ...p, [field]: v })),
    []
  );

  const setBool = useCallback(
    (field: keyof RestaurantSettings, v: boolean) =>
      setSettings((p) => ({ ...p, [field]: v })),
    []
  );

  const setOrderType = useCallback(
    (key: keyof OrderTypes, v: boolean) =>
      setSettings((p) => ({ ...p, orderTypes: { ...p.orderTypes, [key]: v } })),
    []
  );

  // Save
  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json().catch(() => null);
      if (saved && typeof saved === "object") {
        setSettings((prev) => ({
          ...prev,
          ...saved,
          orderTypes: {
            ...prev.orderTypes,
            ...(saved.orderTypes && typeof saved.orderTypes === "object"
              ? saved.orderTypes
              : {}),
          },
        }));
      }
      setSaveStatus("saved");
      setUnsaved(false);
      setTimeout(() => setSaveStatus("idle"), 2400);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2400);
    }
  };

  // Shared tab content props
  const sharedProps = { settings, setStr, setBool };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #ddd8d2; border-radius: 99px; }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .tab-btn {
          position: relative; background: transparent; border: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif; font-size: 0.8rem; font-weight: 500;
          color: #9a9490; padding: 10px 14px; border-radius: 0;
          transition: color 0.18s; white-space: nowrap;
        }
        .tab-btn:hover { color: #484340; }
        .tab-btn.active { color: #1c1a18; font-weight: 600; }

        /* ── Sidebar nav links — matching screenshot ── */
        .sidebar-link {
          width: 100%;
          text-align: left;
          border-radius: 12px;
          padding: ${isMobile ? "13px 16px" : "11px 16px"};
          font-size: ${isMobile ? "1rem" : "0.93rem"};
          font-family: 'DM Sans', sans-serif;
          font-weight: 400;
          letter-spacing: -0.01em;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          display: block;
          text-decoration: none;
          color: #111827;
          line-height: 1.3;
        }
        .sidebar-link:hover {
          background: #f5f5f4;
        }
        .sidebar-link.active-link {
          background: #f0efee;
          font-weight: 700;
          color: #000;
        }

        select option { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div style={{ fontFamily: FONT, background: "#f4f2ef", minHeight: "100vh", color: "#1c1a18" }}>

        {/* ── Hamburger ── */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className={cn("fixed z-50 p-3 bg-white rounded-xl shadow-lg", isMobile ? "top-4 left-4" : "top-5 left-5")}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            {isOpen
              ? <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <X className={cn(isMobile ? "w-5 h-5" : "w-5 h-5", "text-black")} />
                </motion.div>
              : <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Menu className={cn(isMobile ? "w-5 h-5" : "w-5 h-5", "text-black")} />
                </motion.div>
            }
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
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              style={{
                position: "fixed", top: 0, left: 0, height: "100%",
                background: "#fff", boxShadow: "4px 0 32px rgba(0,0,0,0.09)",
                zIndex: 50, fontFamily: FONT,
                width: isMobile ? "85vw" : "272px", maxWidth: "85vw",
                display: "flex", flexDirection: "column",
              }}
            >
              {/* Brand */}
              <motion.div
                initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "26px 24px 18px" }}
              >
                <span style={{ fontWeight: 700, color: "#000", fontSize: isMobile ? "1.2rem" : "1.3rem" }}>
                  The Crunch
                </span>
              </motion.div>

              {/* User info */}
              {user && (
                <motion.div
                  initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.14 }}
                  style={{ padding: "0 20px 14px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isOnline ? "#4ade80" : "#d1d5db" }} />
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.username}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "#9ca3af", display: "block", paddingLeft: 15, marginTop: 2 }}>
                    {ROLE_LABELS[user.role as Exclude<Role, null>] ?? user.role}
                  </span>
                </motion.div>
              )}

              <div style={{ height: 1, background: "#f3f4f6", margin: "0 0 6px" }} />

              {/* Nav */}
              <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }} className="hide-scroll">
                <p style={{ fontSize: "0.67rem", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 6px", padding: "0 4px" }}>
                  Navigation
                </p>
                <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {visibleItems.map((item, i) => (
                    <motion.div key={item.label} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.12 + i * 0.035 }}>
                      <NavLink to={item.path} end onClick={() => setIsOpen(false)}>
                        {({ isActive }) => (
                          <div className={`sidebar-link${isActive ? " active-link" : ""}`}>
                            {item.label}
                          </div>
                        )}
                      </NavLink>
                    </motion.div>
                  ))}
                </nav>
              </div>

              {/* Logout */}
              <div style={{ padding: "10px 12px 22px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
                <div
                  className="sidebar-link"
                  onClick={() => { logout(); setIsOpen(false); navigate("/login"); }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#fef2f2";
                    (e.currentTarget as HTMLDivElement).style.color = "#dc2626";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    (e.currentTarget as HTMLDivElement).style.color = "#111827";
                  }}
                >
                  Log out
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Topbar ── */}
        <div
          style={{
            position: "sticky", top: 0, zIndex: 30, height: TOPBAR_H,
            background: "#fff", borderBottom: "1px solid #eae7e2",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 24px 0 68px",
          }}
        >
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: FONT, fontSize: "0.73rem", color: "#b0aaa3", fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              The Crunch
            </span>
            <ChevronRight size={13} color="#d0ccc6" />
            <span style={{ fontFamily: FONT, fontSize: "0.73rem", color: "#7a7470", fontWeight: 500 }}>Settings</span>
            <ChevronRight size={13} color="#d0ccc6" />
            <span style={{ fontFamily: FONT, fontSize: "0.73rem", color: ACCENT, fontWeight: 600 }}>
              {TAB_META[tab].title}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AnimatePresence>
              {unsaved && tab !== "feedback" && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                  style={{
                    fontFamily: FONT, fontSize: "0.67rem", fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: ACCENT,
                    background: "rgba(212,77,20,0.07)", border: "1px solid rgba(212,77,20,0.2)",
                    borderRadius: 99, padding: "3px 10px",
                  }}
                >
                  Unsaved
                </motion.span>
              )}
            </AnimatePresence>

            {tab === "feedback" ? (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={fetchFeedback}
                disabled={feedbackLoading}
                style={{
                  fontFamily: FONT, fontSize: "0.79rem", fontWeight: 500, color: "#7a7470",
                  background: "transparent", border: "1px solid #e0dcd6", borderRadius: 8,
                  padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <motion.span
                  animate={feedbackLoading ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ duration: 0.6, repeat: feedbackLoading ? Infinity : 0, ease: "linear" }}
                >
                  <RefreshCw size={13} />
                </motion.span>
                Refresh
              </motion.button>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
                  onClick={() => { setSettings(DEFAULT); setUnsaved(false); setSaveStatus("idle"); }}
                  style={{
                    fontFamily: FONT, fontSize: "0.79rem", fontWeight: 500, color: "#7a7470",
                    background: "transparent", border: "1px solid #e0dcd6", borderRadius: 8,
                    padding: "7px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <RotateCcw size={13} /> Reset
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  style={{
                    fontFamily: FONT, fontSize: "0.79rem", fontWeight: 600, color: "#fff",
                    background: saveStatus === "saved" ? "#2e7d52" : saveStatus === "error" ? "#b91c1c" : ACCENT,
                    border: "none", borderRadius: 8, padding: "7px 18px", cursor: "pointer",
                    minWidth: 118, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background 0.2s",
                  }}
                >
                  {saveStatus === "saving" && (
                    <span style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite", display: "inline-block" }} />
                  )}
                  {saveStatus === "saving" ? "Saving…"
                    : saveStatus === "saved" ? "✓  Saved"
                    : saveStatus === "error" ? "Failed"
                    : <><Save size={13} /> Save changes</>}
                </motion.button>
              </>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div
          style={{
            position: "sticky", top: TOPBAR_H, zIndex: 20,
            background: "#fff", borderBottom: "1px solid #eae7e2",
            padding: "0 24px 0 68px", display: "flex", alignItems: "flex-end", gap: 0, overflowX: "auto",
          }}
          className="hide-scroll"
        >
          {CONFIG_TABS.map((t) => (
            <button
              key={t.key}
              className={`tab-btn${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.key === "feedback" && feedback.length > 0 && (
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: ACCENT, color: "#fff", borderRadius: 99,
                    fontSize: "0.55rem", fontWeight: 700, width: 15, height: 15, marginRight: 5,
                  }}
                >
                  {feedback.length > 99 ? "99+" : feedback.length}
                </span>
              )}
              {t.label}
              {tab === t.key && (
                <motion.span
                  layoutId="tab-indicator"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  style={{
                    position: "absolute", bottom: 0, left: 10, right: 10,
                    height: 2, borderRadius: "2px 2px 0 0", background: ACCENT,
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* ── Page heading ── */}
        <div style={{ padding: "28px 28px 0 68px", maxWidth: 820 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`heading-${tab}`}
              initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              style={{ marginBottom: 20 }}
            >
              <p style={{ fontFamily: FONT, fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#1c1a18", marginBottom: 3 }}>
                {TAB_META[tab].title}
              </p>
              <p style={{ fontFamily: FONT, fontSize: "0.77rem", color: "#a09a94" }}>
                {TAB_META[tab].desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Content ── */}
        <main style={{ padding: "0 28px 48px 68px", maxWidth: 820 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`content-${tab}`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {tab === "general"       && <GeneralTab       {...sharedProps} />}
              {tab === "operations"    && <OperationsTab    {...sharedProps} setOrderType={setOrderType} />}
              {tab === "inventory"     && (
                <InventoryTab
                  {...sharedProps}
                  categories={inventoryCategories}
                  units={inventoryUnits}
                  mastersLoading={inventoryMastersLoading}
                  mastersError={inventoryMastersError}
                  onReloadMasters={fetchInventoryMasters}
                  onAddCategory={async (payload) => {
                    try {
                      await addInventoryCategory(payload);
                      setInventoryMastersError(null);
                    } catch (err) {
                      setInventoryMastersError(
                        err instanceof Error ? err.message : "Failed to add category",
                      );
                      throw err;
                    }
                  }}
                  onUpdateCategory={async (categoryId, payload) => {
                    try {
                      await updateInventoryCategory(categoryId, payload);
                      setInventoryMastersError(null);
                    } catch (err) {
                      setInventoryMastersError(
                        err instanceof Error ? err.message : "Failed to update category",
                      );
                      throw err;
                    }
                  }}
                  onDisableCategory={async (categoryId) => {
                    try {
                      await disableInventoryCategory(categoryId);
                      setInventoryMastersError(null);
                    } catch (err) {
                      setInventoryMastersError(
                        err instanceof Error ? err.message : "Failed to disable category",
                      );
                      throw err;
                    }
                  }}
                  onAddUnit={async (payload) => {
                    try {
                      await addInventoryUnit(payload);
                      setInventoryMastersError(null);
                    } catch (err) {
                      setInventoryMastersError(
                        err instanceof Error ? err.message : "Failed to add unit",
                      );
                      throw err;
                    }
                  }}
                  onUpdateUnit={async (unitId, payload) => {
                    try {
                      await updateInventoryUnit(unitId, payload);
                      setInventoryMastersError(null);
                    } catch (err) {
                      setInventoryMastersError(
                        err instanceof Error ? err.message : "Failed to update unit",
                      );
                      throw err;
                    }
                  }}
                  onDisableUnit={async (unitId) => {
                    try {
                      await disableInventoryUnit(unitId);
                      setInventoryMastersError(null);
                    } catch (err) {
                      setInventoryMastersError(
                        err instanceof Error ? err.message : "Failed to disable unit",
                      );
                      throw err;
                    }
                  }}
                />
              )}
              {tab === "notifications" && <NotificationsTab {...sharedProps} />}
              {tab === "billing"       && <BillingTab       {...sharedProps} />}
              {tab === "system"        && <SystemTab        settings={settings} setBool={setBool} />}
              {tab === "feedback"      && (
                <FeedbackTab
                  feedback={feedback}
                  loading={feedbackLoading}
                  error={feedbackError}
                  onRetry={fetchFeedback}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}
