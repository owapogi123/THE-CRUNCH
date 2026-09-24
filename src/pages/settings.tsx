import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Lock, ChevronDown, ChevronUp, Star, MessageSquare } from "lucide-react";
import { useAuth } from "../context/authcontext";
import { api } from "../lib/api";
import { normalizePermissionsMap, normalizeRole, type PermissionsMap } from "../lib/permissions";
import { saveGeneralSettings, syncGeneralSettings } from "../lib/restaurantSettings";
import { Sidebar } from "../components/Sidebar";

/*
 * Settings page (administrators only).
 *
 * Access is checked against the API (GET /users/me) before anything is shown.
 * Only after that check passes does the page load its own data, so other roles
 * never trigger the settings or feedback requests. The API must still enforce
 * the same rule on its side, this check only controls what the UI shows.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const FONT = "'Poppins', sans-serif";
export const ACCENT = "#e05a1e";
const INK = "#1c1a18";
const MUTED = "#9e9891";
const ERROR = "#b91c1c";
const SUCCESS = "#15803d";

// Dropdown options. The types below are derived from these lists,
// so the allowed values are only written once.
const STORE_MODE_OPTIONS = [
  { value: "auto", label: "Auto (follow schedule)" },
  { value: "manual_open", label: "Force Open" },
  { value: "manual_closed", label: "Force Closed" },
] as const;

const TOAST_POSITION_OPTIONS = [
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left", label: "Bottom Left" },
] as const;

const TOAST_DURATION_OPTIONS = [2, 3, 4, 5].map((seconds) => ({
  value: String(seconds * 1000),
  label: `${seconds} seconds`,
}));

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TabKey =
  | "business"
  | "ordering"
  | "inventory"
  | "billing"
  | "notifications"
  | "roles"
  | "security"
  | "personal"
  | "feedback";

export interface RestaurantSettings {
  // Fixed system identity (not editable)
  restaurantName: string;
  tagline: string;
  currency: string;
  timezone: string;
  // Contact details
  email: string;
  phone: string;
  address: string;
  // Operating hours
  weekdayOpenTime: string;
  weekdayCloseTime: string;
  weekendOpenTime: string;
  weekendCloseTime: string;
  storeStatusMode: (typeof STORE_MODE_OPTIONS)[number]["value"];
  // Inventory
  defaultLowStockThreshold: string;
  defaultCriticalStockThreshold: string;
  // Billing
  taxRate: string;
  serviceCharge: string;
  // Notifications
  enableToastNotifications: boolean;
  toastPosition: (typeof TOAST_POSITION_OPTIONS)[number]["value"];
  toastDuration: string;
  enableConfirmDialogs: boolean;
  newOrderAlertsEnabled: boolean;
  lowStockAlertsEnabled: boolean;
  // Ordering
  acceptOnlineOrders: boolean;
  minimumOrderAmount: string;
  // Security
  sessionTimeout: string;
}

export interface FeedbackEntry {
  id: string;
  reviewerName: string;
  productName: string;
  rating: number;
  message: string;
  createdAt: string;
}

// The signed-in user's account, as returned by GET /users/me.
interface OwnAccount {
  id: number;
  username: string;
  email: string;
  role: string;
}

// Setter shared by every settings tab.
type SetField = <K extends keyof RestaurantSettings>(key: K, value: RestaurantSettings[K]) => void;
interface TabProps {
  s: RestaurantSettings;
  set: SetField;
}

// Keys whose value is a plain string / a boolean. Used by the bind helpers below.
type TextKey = { [K in keyof RestaurantSettings]: string extends RestaurantSettings[K] ? K : never }[keyof RestaurantSettings];
type FlagKey = { [K in keyof RestaurantSettings]: RestaurantSettings[K] extends boolean ? K : never }[keyof RestaurantSettings];

/* -------------------------------------------------------------------------- */
/* Settings defaults & normalizing                                            */
/* -------------------------------------------------------------------------- */

// Fixed identity values, and the initial form values shown until the API responds.
export const DEFAULT: RestaurantSettings = {
  restaurantName: "The Crunch",
  tagline: "",
  currency: "PHP",
  timezone: "Asia/Manila",
  email: "",
  phone: "",
  address: "",
  weekdayOpenTime: "10:00",
  weekdayCloseTime: "22:00",
  weekendOpenTime: "11:00",
  weekendCloseTime: "20:30",
  storeStatusMode: "auto",
  defaultLowStockThreshold: "",
  defaultCriticalStockThreshold: "",
  taxRate: "",
  serviceCharge: "",
  enableToastNotifications: true,
  toastPosition: "top-right",
  toastDuration: "4000",
  enableConfirmDialogs: true,
  newOrderAlertsEnabled: true,
  lowStockAlertsEnabled: true,
  acceptOnlineOrders: true,
  minimumOrderAmount: "",
  sessionTimeout: "30",
};

function readString(value: unknown, fallback = ""): string {
  return String(value ?? "").trim() || fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

// Turns whatever the API returns into a complete, safe settings object.
function normalizeSettings(src: Record<string, unknown> | null | undefined): RestaurantSettings {
  const text = (key: string, fallback = "") => readString(src?.[key], fallback);
  const flag = (key: string) => readBoolean(src?.[key], true);
  const oneOf = <T extends string>(key: string, options: readonly { value: T }[], fallback: T): T =>
    options.find((option) => option.value === src?.[key])?.value ?? fallback;

  return {
    // Fixed identity is never overwritten by the API
    restaurantName: DEFAULT.restaurantName,
    tagline: DEFAULT.tagline,
    currency: DEFAULT.currency,
    timezone: DEFAULT.timezone,

    email: text("email"),
    phone: text("phone"),
    address: text("address"),

    weekdayOpenTime: text("weekdayOpenTime", DEFAULT.weekdayOpenTime),
    weekdayCloseTime: text("weekdayCloseTime", DEFAULT.weekdayCloseTime),
    weekendOpenTime: text("weekendOpenTime", DEFAULT.weekendOpenTime),
    weekendCloseTime: text("weekendCloseTime", DEFAULT.weekendCloseTime),
    storeStatusMode: oneOf("storeStatusMode", STORE_MODE_OPTIONS, "auto"),

    defaultLowStockThreshold: text("defaultLowStockThreshold"),
    defaultCriticalStockThreshold: text("defaultCriticalStockThreshold"),

    taxRate: text("taxRate"),
    serviceCharge: text("serviceCharge"),

    enableToastNotifications: flag("enableToastNotifications"),
    toastPosition: oneOf("toastPosition", TOAST_POSITION_OPTIONS, "top-right"),
    toastDuration: text("toastDuration", DEFAULT.toastDuration),
    enableConfirmDialogs: flag("enableConfirmDialogs"),
    newOrderAlertsEnabled: flag("newOrderAlertsEnabled"),
    lowStockAlertsEnabled: flag("lowStockAlertsEnabled"),

    acceptOnlineOrders: flag("acceptOnlineOrders"),
    minimumOrderAmount: text("minimumOrderAmount"),

    sessionTimeout: text("sessionTimeout", DEFAULT.sessionTimeout),
  };
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

// Text style shortcut: typo("0.85rem", color, weight)
const typo = (size: string, color = INK, weight = 500): CSSProperties => ({
  fontFamily: FONT,
  fontSize: size,
  color,
  fontWeight: weight,
  margin: 0,
});

const S = {
  input: {
    fontFamily: FONT, fontSize: "0.85rem", color: INK, background: "#f7f6f5",
    border: "1px solid #ececec", borderRadius: 8, padding: "9px 12px",
    width: "100%", outline: "none", transition: "border-color .15s, box-shadow .15s",
  } as CSSProperties,
  pillSelect: {
    fontFamily: FONT, fontSize: "0.85rem", fontWeight: 500, color: INK,
    background: "#f0eeec", border: "none", borderRadius: 99, padding: "9px 34px 9px 16px",
    cursor: "pointer", outline: "none", appearance: "none",
  } as CSSProperties,
  panel: {
    background: "#fff", border: "1px solid #eae7e2", borderRadius: 10,
  } as CSSProperties,
  // The large white card that holds the settings menu and content.
  card: {
    display: "flex", width: "100%", maxWidth: 1100, margin: "0 auto",
    background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.05)",
  } as CSSProperties,
};

// Dark action button. Greyed out while disabled.
const accentButton = (disabled = false): CSSProperties => ({
  fontFamily: FONT, fontSize: "0.82rem", fontWeight: 500, borderRadius: 10,
  padding: "10px 16px", border: "none", background: INK, color: "#fff",
  textAlign: "center", transition: "all .15s",
  opacity: disabled ? 0.55 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

/* -------------------------------------------------------------------------- */
/* Form primitives                                                            */
/* -------------------------------------------------------------------------- */

// Props for an input / dropdown bound to a string setting.
const bindText = ({ s, set }: TabProps, key: TextKey) => ({
  value: s[key],
  onChange: (v: string) => set(key, v),
});

// Props for a toggle bound to a boolean setting.
const bindFlag = ({ s, set }: TabProps, key: FlagKey) => ({
  value: s[key],
  onChange: (v: boolean) => set(key, v),
});

// Text input with an accent border while focused.
export function SI({ value, onChange, type = "text", placeholder = "" }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      style={{
        ...S.input,
        borderColor: focused ? ACCENT : "#ececec",
        boxShadow: focused ? "0 0 0 3px rgba(224,90,30,.1)" : "none",
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

// Pill-shaped dropdown.
export function SS<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: readonly { value: T; label: string }[];
}) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select style={S.pillSelect} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown
        size={14}
        color={MUTED}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      />
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        position: "relative", width: 44, height: 24, borderRadius: 99, border: "none",
        cursor: "pointer", background: value ? INK : "#e4e1dc", padding: 0, flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <span
        style={{
          position: "absolute", top: 3, left: value ? 23 : 3, width: 18, height: 18,
          borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.18)",
          transition: "left .18s",
        }}
      />
    </button>
  );
}

// Form row: label on the left, control on the right.
export function FR({ label, last = false, children }: { label: string; last?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "175px minmax(0,1fr)", alignItems: "center",
        gap: 16, padding: "20px 0", borderBottom: last ? "none" : "1px solid #ececec",
      }}
    >
      <p style={typo("0.85rem")}>{label}</p>
      {children}
    </div>
  );
}

// Toggle row: label and optional description on the left, switch on the right.
export function TR({ label, desc, value, onChange, last = false }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 0", borderBottom: last ? "none" : "1px solid #ececec", gap: 16,
      }}
    >
      <div>
        <p style={typo("0.85rem")}>{label}</p>
        {desc && <p style={{ ...typo("0.74rem", MUTED, 400), margin: "3px 0 0", lineHeight: 1.6 }}>{desc}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

// Groups related rows and adds spacing below them.
export function Section({ children }: { children: ReactNode }) {
  return <div style={{ marginBottom: 8 }}>{children}</div>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p style={{ ...typo("0.74rem", "#b0aaa3", 400), padding: "10px 0 18px", lineHeight: 1.6 }}>{children}</p>;
}

// Read-only value shown inside a form row.
function Value({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <span style={typo("0.8rem", muted ? "#5a5652" : INK, muted ? 400 : 600)}>{children}</span>;
}

// Error message with a retry button.
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ ...S.panel, padding: "28px 20px", textAlign: "center" }}>
      <p style={{ ...typo("0.8rem", ERROR, 400), marginBottom: 10 }}>{message}</p>
      <button onClick={onRetry} style={accentButton()}>Try again</button>
    </div>
  );
}

// Shown to users who are not administrators.
export function LockedSection({ label }: { label: string }) {
  return (
    <div style={{ background: "#f7f6f5", borderRadius: 16, padding: "48px 32px", textAlign: "center" }}>
      <div
        style={{
          width: 52, height: 52, borderRadius: 12, background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
        }}
      >
        <Lock size={22} color={ACCENT} />
      </div>
      <p style={{ ...typo("0.9rem", INK, 600), margin: "0 0 8px" }}>Access Restricted</p>
      <p style={{ ...typo("0.78rem", MUTED, 400), lineHeight: 1.7, maxWidth: 300, marginInline: "auto" }}>
        Only administrators can access <strong style={{ color: "#5a5652" }}>{label}</strong>. Contact your administrator if you need access.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings tabs                                                              */
/* -------------------------------------------------------------------------- */

const HOUR_FIELDS: [TextKey, string][] = [
  ["weekdayOpenTime", "Weekday open"],
  ["weekdayCloseTime", "Weekday close"],
  ["weekendOpenTime", "Weekend open"],
  ["weekendCloseTime", "Weekend close"],
];

export function BusinessTab(p: TabProps) {
  const { s } = p;
  return (
    <>
      <Section>
        <FR label="System name"><Value>{s.restaurantName}</Value></FR>
        <FR label="Currency"><Value>{s.currency}</Value></FR>
        <FR label="Time zone" last><Value>{s.timezone}</Value></FR>
        <Hint>Name, currency, and time zone are fixed system settings.</Hint>
      </Section>
      <Section>
        <FR label="Email"><SI {...bindText(p, "email")} type="email" placeholder="Email address" /></FR>
        <FR label="Phone"><SI {...bindText(p, "phone")} placeholder="Phone number" /></FR>
        <FR label="Address" last><SI {...bindText(p, "address")} placeholder="Street address" /></FR>
      </Section>
      <Section>
        {HOUR_FIELDS.map(([key, label], i) => (
          <FR key={key} label={label} last={i === HOUR_FIELDS.length - 1}>
            <SI {...bindText(p, key)} type="time" />
          </FR>
        ))}
      </Section>
    </>
  );
}

export function InventoryTab(p: TabProps) {
  return (
    <Section>
      <FR label="Low stock threshold">
        <SI {...bindText(p, "defaultLowStockThreshold")} type="number" placeholder="e.g. 10" />
      </FR>
      <FR label="Critical threshold" last>
        <SI {...bindText(p, "defaultCriticalStockThreshold")} type="number" placeholder="e.g. 5" />
      </FR>
    </Section>
  );
}

export function OrderingTab(p: TabProps) {
  return (
    <>
      <Section>
        <TR
          label="Accept online orders"
          desc="Allow customers to place orders from your online menu."
          {...bindFlag(p, "acceptOnlineOrders")}
        />
        <FR label="Minimum order (₱)" last>
          <SI {...bindText(p, "minimumOrderAmount")} type="number" placeholder="e.g. 150" />
        </FR>
      </Section>
      <Section>
        <FR label="Store status" last>
          <SS value={p.s.storeStatusMode} onChange={(v) => p.set("storeStatusMode", v)} options={STORE_MODE_OPTIONS} />
        </FR>
      </Section>
    </>
  );
}

export function BillingTab(p: TabProps) {
  return (
    <Section>
      <FR label="VAT rate (%)"><SI {...bindText(p, "taxRate")} type="number" placeholder="e.g. 12" /></FR>
      <FR label="Service charge (%)" last>
        <SI {...bindText(p, "serviceCharge")} type="number" placeholder="e.g. 10" />
      </FR>
    </Section>
  );
}

export function NotifTab(p: TabProps) {
  return (
    <>
      <Section>
        <TR label="Toast notifications" {...bindFlag(p, "enableToastNotifications")} />
        <TR
          label="New order alerts"
          desc="Sound and visual alerts for incoming orders."
          {...bindFlag(p, "newOrderAlertsEnabled")}
        />
        <TR
          label="Low stock alerts"
          desc="Notify when inventory falls below threshold."
          {...bindFlag(p, "lowStockAlertsEnabled")}
          last
        />
      </Section>
      <Section>
        <FR label="Position">
          <SS value={p.s.toastPosition} onChange={(v) => p.set("toastPosition", v)} options={TOAST_POSITION_OPTIONS} />
        </FR>
        <FR label="Duration" last>
          <SS {...bindText(p, "toastDuration")} options={TOAST_DURATION_OPTIONS} />
        </FR>
      </Section>
    </>
  );
}

export function SecurityTab(p: TabProps) {
  return (
    <Section>
      <FR label="Session timeout (min)" last>
        <SI {...bindText(p, "sessionTimeout")} type="number" placeholder="e.g. 30" />
      </FR>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Roles & permissions tab (read-only)                                        */
/* -------------------------------------------------------------------------- */

// Roles shown as columns. The pages (rows) and every value come from the API.
const ROLE_COLUMNS = ["administrator", "cashier", "inventory_manager"];

type PermissionMatrix = Record<string, Record<string, boolean> | undefined>;

// "menuManagement" -> "Menu Management"
const formatPermissionLabel = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());

// Loads the role permissions from the same endpoint the main sidebar uses.
function usePermissionMatrix() {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setMatrix(null);
    setError(null);
    api.get<Record<string, unknown>>("/settings/permissions")
      .then((data) => {
        if (!data || typeof data !== "object") throw new Error("Invalid permissions response");
        // The API may return { permissions: {...} } or the map itself.
        const raw = "permissions" in data ? data.permissions : data;
        const map = normalizePermissionsMap((raw as Partial<PermissionsMap> | null | undefined) ?? null);
        setMatrix(map as unknown as PermissionMatrix);
      })
      .catch(() => setError("Failed to load permissions. Please try again."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { matrix, error, reload: load };
}

export function RolesTab() {
  const { matrix, error, reload } = usePermissionMatrix();

  if (error) return <ErrorPanel message={error} onRetry={reload} />;
  if (!matrix) return <div style={{ ...S.panel, height: 200, opacity: 0.6 }} />;

  // Every page any role has a setting for, in the order the API returns them.
  const pages = Array.from(new Set(ROLE_COLUMNS.flatMap((role) => Object.keys(matrix[role] ?? {}))));

  if (!pages.length) {
    return <p style={{ ...typo("0.78rem", MUTED, 400), padding: "24px 0" }}>No permissions have been configured yet.</p>;
  }

  return (
    <Section>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #f0ede8" }}>
              <th style={{ padding: "11px 20px 11px 0", textAlign: "left", color: MUTED, fontWeight: 500 }}>Page</th>
              {ROLE_COLUMNS.map((role) => (
                <th key={role} style={{ padding: "11px 14px", textAlign: "center", color: "#5a5652", fontWeight: 600 }}>
                  {formatRoleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((page, i) => (
              <tr key={page} style={{ borderBottom: i < pages.length - 1 ? "1px solid #f0ede8" : "none" }}>
                <td style={{ padding: "10px 20px 10px 0", color: "#484340", fontWeight: 500 }}>{formatPermissionLabel(page)}</td>
                {ROLE_COLUMNS.map((role) => {
                  const allowed = matrix[role]?.[page] === true;
                  return (
                    <td key={role} style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 20, height: 20, borderRadius: 5, fontSize: "0.68rem", fontWeight: 700,
                          background: allowed ? "rgba(224,90,30,.1)" : "#f5f4f2",
                          color: allowed ? ACCENT : "#c8c4be",
                        }}
                        aria-label={allowed ? "Allowed" : "Not allowed"}
                      >
                        {allowed ? "✓" : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint>Shows which pages each role can open in the main menu, as currently saved in the system.</Hint>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* Personal tab (own account + password)                                      */
/* -------------------------------------------------------------------------- */

// At least 8 characters, with one letter and one number.
const STRONG_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

// "inventory_manager" -> "Inventory Manager"
function formatRoleLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Tracks the busy state and the success / error message of one form.
function useFormAction() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const fail = (text: string) => setResult({ ok: false, text });

  // Runs the task. Its returned text is shown on success, the error message on failure.
  const run = async (task: () => Promise<string>, fallbackError: string) => {
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await task() });
    } catch (error) {
      fail(error instanceof Error ? error.message : fallbackError);
    } finally {
      setBusy(false);
    }
  };

  return { busy, result, run, fail };
}

// Bottom row of a form: status message on the left, submit button on the right.
function FormFooter({ action, label, busyLabel, onSubmit }: {
  action: ReturnType<typeof useFormAction>; label: string; busyLabel: string; onSubmit: () => void;
}) {
  return (
    <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={typo("0.72rem", action.result?.ok ? SUCCESS : ERROR, 400)}>{action.result?.text}</span>
      <button onClick={onSubmit} disabled={action.busy} style={accentButton(action.busy)}>
        {action.busy ? busyLabel : label}
      </button>
    </div>
  );
}

export function PersonalTab({ account, onAccountChange }: {
  account: OwnAccount; onAccountChange: (account: OwnAccount) => void;
}) {
  const [displayName, setDisplayName] = useState(account.username);
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const profile = useFormAction();
  const password = useFormAction();

  const saveProfile = () => {
    const username = displayName.trim();
    if (username.length < 2 || username.length > 100) {
      return profile.fail("Display name must be between 2 and 100 characters.");
    }
    void profile.run(async () => {
      const saved = await api.put<OwnAccount>("/users/me", { username });
      setDisplayName(saved.username);
      onAccountChange(saved);
      return "Account details updated.";
    }, "Failed to update your account.");
  };

  const savePassword = () => {
    const { current, next, confirm } = passwords;
    if (!current || !next || !confirm) {
      return password.fail("Current password, new password, and confirmation are required.");
    }
    if (next !== confirm) return password.fail("New passwords do not match.");
    if (!STRONG_PASSWORD.test(next)) {
      return password.fail("New password must be at least 8 characters with a letter and number.");
    }
    void password.run(async () => {
      await api.put<{ message: string }>("/users/me/password", {
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      setPasswords(EMPTY_PASSWORDS);
      return "Password changed successfully.";
    }, "Failed to change your password.");
  };

  const setPassword = (key: keyof typeof EMPTY_PASSWORDS) => (value: string) =>
    setPasswords((prev) => ({ ...prev, [key]: value }));

  return (
    <>
      <Section>
        <FR label="Display name / username">
          <SI value={displayName} onChange={setDisplayName} placeholder="Display name" />
        </FR>
        <FR label="Email"><Value muted>{account.email || "Not available"}</Value></FR>
        <FR label="Role" last><Value muted>{formatRoleLabel(account.role) || "Not available"}</Value></FR>
        <FormFooter action={profile} label="Save Account" busyLabel="Saving..." onSubmit={saveProfile} />
      </Section>
      <Section>
        <FR label="Current password"><SI value={passwords.current} onChange={setPassword("current")} type="password" /></FR>
        <FR label="New password"><SI value={passwords.next} onChange={setPassword("next")} type="password" /></FR>
        <FR label="Confirm new password" last>
          <SI value={passwords.confirm} onChange={setPassword("confirm")} type="password" />
        </FR>
        <FormFooter action={password} label="Change Password" busyLabel="Changing..." onSubmit={savePassword} />
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback tab                                                               */
/* -------------------------------------------------------------------------- */

type SortKey = "newest" | "oldest" | "highest" | "lowest";

const timeOf = (entry: FeedbackEntry) => new Date(entry.createdAt).getTime();

const SORT_OPTIONS: Record<SortKey, { label: string; compare: (a: FeedbackEntry, b: FeedbackEntry) => number }> = {
  newest: { label: "Newest", compare: (a, b) => timeOf(b) - timeOf(a) },
  oldest: { label: "Oldest", compare: (a, b) => timeOf(a) - timeOf(b) },
  highest: { label: "Highest", compare: (a, b) => b.rating - a.rating },
  lowest: { label: "Lowest", compare: (a, b) => a.rating - b.rating },
};

// 0 means "all ratings".
const RATING_FILTERS = [0, 5, 4, 3, 2, 1];

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
  const [sort, setSort] = useState<SortKey>("newest");
  const [rating, setRating] = useState(0);

  // Loading placeholders
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[1, 2, 3].map((i) => <div key={i} style={{ ...S.panel, height: 88, opacity: 0.5 + i * 0.1 }} />)}
      </div>
    );
  }

  if (error) return <ErrorPanel message={error} onRetry={onRetry} />;

  if (!feedback.length) {
    return (
      <div style={{ ...S.panel, padding: "44px 20px", textAlign: "center" }}>
        <MessageSquare size={26} color="#d1cdc7" style={{ marginBottom: 8 }} />
        <p style={typo("0.82rem", "#b0aaa3")}>No feedback yet</p>
      </div>
    );
  }

  const visible = feedback
    .filter((entry) => rating === 0 || entry.rating === rating)
    .sort(SORT_OPTIONS[sort].compare);

  return (
    <>
      {/* Rating filter and sorting */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {RATING_FILTERS.map((r) => (
          <button
            key={r}
            onClick={() => setRating(r)}
            style={{
              fontFamily: FONT, fontSize: "0.69rem", fontWeight: rating === r ? 600 : 400,
              padding: "4px 10px", borderRadius: 99, border: "1px solid #e4e1dc",
              background: rating === r ? ACCENT : "#fafaf9", color: rating === r ? "#fff" : "#7a7470",
              cursor: "pointer", transition: "all .15s",
              boxShadow: rating === r ? "0 1px 4px rgba(224,90,30,.2)" : "0 1px 3px rgba(0,0,0,.06)",
            }}
          >
            {r === 0 ? "All" : `${r}★`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{ ...S.input, width: "auto", padding: "5px 10px" }}
        >
          {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => (
            <option key={key} value={key}>{SORT_OPTIONS[key].label}</option>
          ))}
        </select>
      </div>

      {/* Reviews */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {visible.map((entry) => (
          <div key={entry.id} style={{ ...S.panel, padding: "12px 16px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
              <span style={typo("0.8rem", INK, 600)}>{entry.reviewerName}</span>
              <span style={typo("0.66rem", "#b0aaa3", 400)}>
                {new Date(entry.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
              <span
                style={{
                  ...typo("0.64rem", "#7a7470"), background: "#f5f2ee",
                  border: "1px solid #ece6de", borderRadius: 99, padding: "2px 8px",
                }}
              >
                {entry.productName}
              </span>
            </div>
            <StarDisplay rating={entry.rating} />
            {entry.message && (
              <p style={{ ...typo("0.76rem", "#5a5652", 400), lineHeight: 1.7, margin: "6px 0 0" }}>{entry.message}</p>
            )}
          </div>
        ))}
        {!visible.length && (
          <p style={{ ...typo("0.78rem", "#b0aaa3", 400), textAlign: "center", padding: "24px 0" }}>
            No reviews match this filter.
          </p>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export interface NavGroup {
  label: string;
  items: { key: TabKey; label: string }[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Store",
    items: [
      { key: "business", label: "Business Info" },
      { key: "ordering", label: "Online Ordering" },
      { key: "inventory", label: "Inventory" },
      { key: "billing", label: "Tax & Charges" },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "roles", label: "Roles & Permissions" },
      { key: "security", label: "Security" },
    ],
  },
  {
    label: "System",
    items: [
      { key: "personal", label: "My Account" },
      { key: "notifications", label: "Notifications" },
      { key: "feedback", label: "Customer Feedback" },
    ],
  },
];

// Page title and description shown above each tab.
export const TAB_META: Record<TabKey, { title: string; desc: string }> = {
  business:      { title: "Business Information",    desc: "Restaurant identity, contact details, and operating hours." },
  ordering:      { title: "Online Ordering",         desc: "Accept online orders, set a minimum order, and control the store status." },
  inventory:     { title: "Inventory Configuration", desc: "Low and critical stock thresholds." },
  billing:       { title: "Tax & Charges",           desc: "VAT configuration and service charge rules." },
  notifications: { title: "Notifications",           desc: "Alert channels and toast settings." },
  roles:         { title: "Roles & Permissions",     desc: "Which pages each role can open, as saved in the system." },
  security:      { title: "Security Settings",       desc: "Session timeout." },
  personal:      { title: "My Account",              desc: "Manage your own display name and password securely." },
  feedback:      { title: "Customer Feedback",       desc: "Customer reviews and ratings from the menu page." },
};

// One collapsible group of tabs in the settings menu.
export function SidebarGroup({ group, active, feedbackCount, onSelect }: {
  group: NavGroup; active: TabKey; feedbackCount: number; onSelect: (key: TabKey) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
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
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "11px 14px", background: isActive ? "#f0eeec" : "none",
              border: "none", borderRadius: 14, cursor: "pointer",
              fontFamily: FONT, fontSize: "0.85rem", fontWeight: isActive ? 600 : 500,
              color: isActive ? INK : "#5a5652",
              textAlign: "left", transition: "background .12s, color .12s", marginBottom: 2,
            }}
          >
            <span style={{ flex: 1 }}>{label}</span>
            {key === "feedback" && feedbackCount > 0 && (
              <span
                style={{
                  fontSize: "0.62rem", fontWeight: 700, background: ACCENT, color: "#fff",
                  borderRadius: 99, padding: "2px 6px", minWidth: 17, textAlign: "center",
                }}
              >
                {feedbackCount > 99 ? "99+" : feedbackCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Data hooks                                                                 */
/* -------------------------------------------------------------------------- */

type AccessStatus = "checking" | "allowed" | "denied" | "error";

const isAdministrator = (role: unknown) =>
  normalizeRole(String(role ?? "").trim().toLowerCase()) === "administrator";

// Checks the signed-in user's role with the API. If the check fails, access is denied.
function useAdminAccess() {
  const { updateUser } = useAuth();
  const [account, setAccount] = useState<OwnAccount | null>(null);
  const [status, setStatus] = useState<AccessStatus>("checking");

  // Keeps this page and the auth context in sync with the account from the API.
  const applyAccount = useCallback(
    (data: OwnAccount) => {
      setAccount(data);
      updateUser({ username: data.username, email: data.email, role: data.role });
    },
    [updateUser],
  );

  const verify = useCallback(() => {
    setStatus("checking");
    api.get<OwnAccount>("/users/me")
      .then((data) => {
        applyAccount(data);
        setStatus(isAdministrator(data.role) ? "allowed" : "denied");
      })
      .catch(() => setStatus("error"));
  }, [applyAccount]);

  useEffect(() => {
    verify();
  }, [verify]);

  return { status, account, applyAccount, verify };
}

// Loads and saves the restaurant settings through the API.
function useSettings() {
  const [values, setValues] = useState<RestaurantSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load the saved settings once when the page opens.
  useEffect(() => {
    let cancelled = false;
    api.get<Record<string, unknown>>("/settings")
      .then((data) => {
        if (cancelled) return;
        setValues(normalizeSettings(data));
        syncGeneralSettings(data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load saved settings. Showing the current form values.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setField: SetField = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveGeneralSettings(values as unknown as Record<string, unknown>);
      setValues(normalizeSettings(saved as unknown as Record<string, unknown>));
      setNotice("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return { values, loading, saving, error, notice, setField, save };
}

// Loads customer feedback through the API.
function useFeedback() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<FeedbackEntry[]>("/feedback")
      .then(setFeedback)
      .catch(() => setError("Failed to load feedback. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { feedback, loading, error, reload: load };
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

// Outer page shell: main sidebar plus the grey background.
function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50" style={{ fontFamily: FONT }}>
      <Sidebar />
      <main className="tablet-shell flex-1">
        <div style={{ display: "flex", height: "100%", background: "#f0eeec", padding: 24, boxSizing: "border-box", minHeight: "100vh" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

// What non-administrators (and the checking / error states) see instead of the settings.
function AccessMessage({ status, onRetry }: { status: AccessStatus; onRetry: () => void }) {
  if (status === "denied") return <LockedSection label="Settings" />;

  if (status === "error") {
    return (
      <div style={{ textAlign: "center" }}>
        <p style={{ ...typo("0.8rem", ERROR, 400), marginBottom: 10 }}>
          We could not verify your access. Please try again.
        </p>
        <button onClick={onRetry} style={accentButton()}>Try again</button>
      </div>
    );
  }

  return <p style={{ ...typo("0.8rem", MUTED, 400), textAlign: "center" }}>Verifying your access...</p>;
}

// The settings menu and the selected tab. Only mounted for administrators.
function SettingsPanel({ account, onAccountChange }: {
  account: OwnAccount; onAccountChange: (account: OwnAccount) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("business");
  const settings = useSettings();
  const feedback = useFeedback();

  const meta = TAB_META[activeTab];
  const tabProps: TabProps = { s: settings.values, set: settings.setField };

  // Tabs that do not edit restaurant settings have no save button.
  const showSave = !["roles", "personal", "feedback"].includes(activeTab);

  // One status line: error first, then loading, then the save confirmation.
  const status = [
    { text: settings.error, color: ERROR },
    { text: settings.loading ? "Loading saved settings..." : null, color: MUTED },
    { text: settings.notice, color: SUCCESS },
  ].find((line) => line.text);

  const renderTab = () => {
    switch (activeTab) {
      case "business":      return <BusinessTab {...tabProps} />;
      case "ordering":      return <OrderingTab {...tabProps} />;
      case "inventory":     return <InventoryTab {...tabProps} />;
      case "billing":       return <BillingTab {...tabProps} />;
      case "notifications": return <NotifTab {...tabProps} />;
      case "roles":         return <RolesTab />;
      case "security":      return <SecurityTab {...tabProps} />;
      case "personal":      return <PersonalTab account={account} onAccountChange={onAccountChange} />;
      case "feedback":
        return (
          <FeedbackTab
            feedback={feedback.feedback}
            loading={feedback.loading}
            error={feedback.error}
            onRetry={feedback.reload}
          />
        );
    }
  };

  return (
    <div style={S.card}>
      {/* Settings menu */}
      <div style={{ width: 230, flexShrink: 0, background: "#fff", overflowY: "auto", padding: "24px 14px" }}>
        <h2 style={{ ...typo("1.1rem", INK, 700), padding: "0 10px 18px" }}>Settings</h2>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup
            key={group.label}
            group={group}
            active={activeTab}
            feedbackCount={feedback.feedback.length}
            onSelect={setActiveTab}
          />
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px", borderLeft: "1px solid #f0eeec" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <p style={typo("0.76rem", status?.color, 400)}>{status?.text}</p>
          {showSave && (
            <button
              onClick={settings.save}
              disabled={settings.saving || settings.loading}
              style={accentButton(settings.saving || settings.loading)}
            >
              {settings.saving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </div>
        <h1 style={{ ...typo("1.4rem", INK, 700), marginBottom: 4 }}>{meta.title}</h1>
        <p style={{ ...typo("0.82rem", MUTED, 400), marginBottom: 16 }}>{meta.desc}</p>
        {renderTab()}
      </div>
    </div>
  );
}

export default function Settings() {
  const { status, account, applyAccount, verify } = useAdminAccess();

  return (
    <PageFrame>
      {status === "allowed" && account ? (
        <SettingsPanel account={account} onAccountChange={applyAccount} />
      ) : (
        <div style={{ ...S.card, alignItems: "center", padding: 32 }}>
          <div style={{ flex: 1 }}>
            <AccessMessage status={status} onRetry={verify} />
          </div>
        </div>
      )}
    </PageFrame>
  );
}