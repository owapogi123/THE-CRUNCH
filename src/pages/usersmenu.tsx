import { useState, useEffect, useRef, useCallback, type ReactNode, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { api, authApi, resolveAssetUrl } from "../lib/api";
import { fetchGeneralSettings, GENERAL_SETTINGS_DEFAULTS, formatCurrencyAmount, formatInSettingsTimezone } from "../lib/restaurantSettings";
import { useAuth } from "../context/authcontext";
import { useViewport } from "@/hooks/use-tablet";
import { getEffectiveMaxQuantity } from "../lib/orderQuantity";
import { useEventInvalidation } from "@/hooks/use-event-invalidation";

/**
 * ── BACKEND / API NOTES ──
 * 1. GET /products?item_type=menu_item returns: id/product_id, name/product_name, price, category,
 *    image, availability_status, and one stock field (available_servings, remainingStock, mainStock
 *    or stock). Optional `description` is shown on the card.
 * 1b. Optional nutrition: calories, protein, carbs, fat (numbers) and serving_size (string), either
 *    flat on the row or inside a nested `nutrition` object. Nothing is shown if the backend sends none.
 * 2. Stock is enforced client-side: stock <= 0 always means unavailable.
 * 3. Cart and payment state live in memory only (no localStorage).
 * 4. Payment return expects the PayMongo redirect URL to include `?payment=success&session_id=...`
 *    (or `?payment=cancelled`).
 * 5. Font: Poppins is loaded globally. Do not add a per-page <link> tag.
 */

// ── Design tokens (match the landing page: warm black, brand yellow, brand red) ──
// Yellow is the brand/action colour. Green/red/amber are used ONLY for status.
const C = {
  bg: "#0a0808", surface: "#121010", surfaceAlt: "#1b1717",
  border: "rgba(255,255,255,0.09)", borderStrong: "rgba(255,255,255,0.20)",
  text: "#f3efe9", muted: "#a8a29e", faint: "#78716c",
  primary: "#f7c948", onPrimary: "#1a1200", red: "#dc0000",
  success: "#4ade80", danger: "#f87171", warning: "#fbbf24",
};
const FONT = "'Poppins', sans-serif";
const SP = { type: "spring" as const, stiffness: 340, damping: 30 };
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ── Types ──────────────────────────────────────────────────────────────────
interface Nutrition { calories?: number; protein?: number; carbs?: number; fat?: number; servingSize?: string }
interface InventoryMenuRow {
  product_id?: number; id?: number; item_type?: string; product_name?: string; name?: string; description?: string | null;
  price?: number | string; category?: string; image?: string | null;
  mainStock?: number | string; stock?: number | string; remainingStock?: number | string; available_servings?: number | string | null;
  availability_status?: string; available?: boolean | number;
  calories?: number | string | null; protein?: number | string | null; carbs?: number | string | null; fat?: number | string | null;
  serving_size?: string | null; nutrition?: Record<string, unknown> | null;
}
interface Recipe { id: number; name: string; description: string; image: string; price: number; stock: number; category: string; available: boolean; nutrition: Nutrition | null }
interface CartItem { recipe: Recipe; quantity: number }
interface CustomerOrder { id: number; orderNumber: string; total: number; createdAt: string; orderType: string; rawStatus: string; trackingStatus: string; paymentReference: string | null; paymentStatus: string | null; paymentMethod: string; items: { name: string; quantity: number }[] }
interface PaymentSessionState { checkoutSessionId: string; checkoutUrl: string | null; status: string; paid: boolean; paymentReference: string | null; bypassed?: boolean }
interface BillingSettings { taxRate: number; serviceCharge: number }
interface StoreStatusSettings { weekdayOpenTime: string; weekdayCloseTime: string; weekendOpenTime: string; weekendCloseTime: string; storeStatusMode: "auto" | "manual_open" | "manual_closed"; timezone: string }
type PaymentMethodType = "gcash" | "cash";
type VerifyResult = { paid: boolean; status: string; paymentReference: string | null };

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORY_ORDER = ["Chicken", "Sides", "Drinks", "Combos"] as const;
const LOW_STOCK_THRESHOLD = 5;
const PLACEHOLDER_IMG = "/img/placeholder.jpg";
const DEFAULT_BILLING: BillingSettings = { taxRate: 0, serviceCharge: 0 };
const DEFAULT_STORE: StoreStatusSettings = { weekdayOpenTime: "10:00", weekdayCloseTime: "22:00", weekendOpenTime: "11:00", weekendCloseTime: "20:30", storeStatusMode: "auto", timezone: "Asia/Manila" };

// "Home" goes to the customer storefront (/products), not "/" (which redirects to the About page).
const HOME_PATH = "/products";
const NAV_LINKS = [{ label: "Home", path: HOME_PATH }, { label: "About", path: "/aboutthecrunch" }, { label: "Menu", path: "/usersmenu" }];
const DELIVERY_LINKS = [
  { label: "Foodpanda", href: "https://foodpanda.go.link/9O718" },
  { label: "Grab", href: "https://r.grab.com/g/6-20260421_220129_6e23187a089147b69736d4cacea38146_MEXMPS-2-C4A3RBCER7NFUE" },
];
const CASH_TERMS = "By selecting Cash as your payment method, you agree that your order will not be processed immediately and will only be prepared once full payment is made onsite. You are responsible for completing payment at the store. Delays in payment may result in longer waiting times or possible cancellation of your order. The store reserves the right to refuse or cancel orders that are not paid within a reasonable time.";
const STORE_CLOSED_MESSAGE = "The store is currently closed. Please come back during business hours.";
const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true };

// SVG inner markup for icons.
const D = {
  history: `<polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="1 4 3 6 5 4"/>`,
  chevron: `<polyline points="6 9 12 15 18 9"/>`,
  clipboard: `<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/>`,
  bag: `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>`,
  scooter: `<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8 17.5h7"/><path d="M15 5h2l2 5H9l1-5h3"/>`,
  external: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
  cash: `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>`,
  phone: `<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  check: `<polyline points="20 6 9 17 4 12"/>`,
  close: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
};

// ── Helpers ────────────────────────────────────────────────────────────────
const formatPHP = (v: number) => formatCurrencyAmount(v);
const isCustomerUser = (role?: string | null) => ["customer", "costumer"].includes(String(role ?? "").trim().toLowerCase());
const normalizeName = (v: unknown) => String(v ?? "").trim().toLowerCase();
const isUnavailable = (v: unknown) => ["unavailable", "out of stock", "hidden", "not configured"].includes(normalizeName(v));

// Maps any backend category string to one of the fixed menu categories.
const normalizeCategory = (v: unknown): string => {
  const r = normalizeName(v);
  if (r.includes("drink") || r.includes("beverage")) return "Drinks";
  if (r.includes("side")) return "Sides";
  if (r.includes("combo")) return "Combos";
  return "Chicken";
};

// "HH:mm" -> minutes since midnight (null if invalid).
const parseTimeMins = (v: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
};

// Weekday/weekend hours for the store timezone.
const getTodayHours = (s: StoreStatusSettings, now = new Date()) => {
  const tz = s.timezone || "Asia/Manila";
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  const weekend = weekday === "Sat" || weekday === "Sun";
  return { tz, open: weekend ? s.weekendOpenTime : s.weekdayOpenTime, close: weekend ? s.weekendCloseTime : s.weekdayCloseTime };
};

const getStoreOpen = (s: StoreStatusSettings) => {
  if (s.storeStatusMode === "manual_open") return true;
  if (s.storeStatusMode === "manual_closed") return false;
  const now = new Date();
  const { tz, open, close } = getTodayHours(s, now);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const cur = Number(parts.find(p => p.type === "hour")?.value || 0) % 24 * 60 + Number(parts.find(p => p.type === "minute")?.value || 0);
  const o = parseTimeMins(open), c = parseTimeMins(close);
  if (o === null || c === null) return false;
  return c <= o ? cur >= o || cur < c : cur >= o && cur < c; // handles closing after midnight
};

const getHoursLabel = (s: StoreStatusSettings) => {
  if (s.storeStatusMode === "manual_open") return "Open (manual)";
  if (s.storeStatusMode === "manual_closed") return "Closed (manual)";
  const { open, close } = getTodayHours(s);
  return `Today ${open} to ${close}`;
};

const calcBilling = (sub: number, s: BillingSettings) => {
  const subtotal = Number(sub || 0), taxAmount = subtotal * (s.taxRate / 100), serviceChargeAmount = subtotal * (s.serviceCharge / 100);
  return { subtotal, taxAmount, serviceChargeAmount, grandTotal: subtotal + taxAmount + serviceChargeAmount };
};
type Billing = ReturnType<typeof calcBilling>;

const optNum = (v: unknown) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

// Accepts flat fields or a nested `nutrition` object. Returns null when the backend sent nothing.
function mapNutrition(row: InventoryMenuRow): Nutrition | null {
  const n = (row.nutrition ?? {}) as Record<string, unknown>;
  const out: Nutrition = {
    calories: optNum(row.calories ?? n.calories), protein: optNum(row.protein ?? n.protein),
    carbs: optNum(row.carbs ?? n.carbs), fat: optNum(row.fat ?? n.fat),
    servingSize: String(row.serving_size ?? n.serving_size ?? n.servingSize ?? "").trim() || undefined,
  };
  return Object.values(out).some(v => v !== undefined) ? out : null;
}

// Converts raw /products rows into menu items. Duplicate names: highest id wins. Stock <= 0 = unavailable.
function mapMenuRows(rows: InventoryMenuRow[]): Recipe[] {
  const rowId = (r: InventoryMenuRow) => Number(r.product_id ?? r.id ?? 0);
  const deduped = new Map<string, InventoryMenuRow>();
  for (const row of rows ?? []) {
    if (normalizeName(row.item_type ?? "menu_item") !== "menu_item") continue;
    const key = normalizeName(row.product_name ?? row.name);
    const prev = deduped.get(key);
    if (key && (!prev || rowId(row) > rowId(prev))) deduped.set(key, row);
  }
  return Array.from(deduped.values()).map(row => {
    const id = rowId(row);
    const stock = Math.max(0, Math.floor(Number(row.available_servings ?? row.remainingStock ?? row.mainStock ?? row.stock ?? 0)) || 0);
    const hasFlag = row.available !== undefined && row.available !== null;
    const flagOk = hasFlag ? row.available === true || row.available === 1 : !isUnavailable(row.availability_status);
    return {
      id, stock,
      name: String(row.product_name ?? row.name ?? `Product #${id}`),
      description: String(row.description ?? "").trim(),
      price: Number(row.price ?? 0),
      category: normalizeCategory(row.category),
      image: resolveAssetUrl(String(row.image || PLACEHOLDER_IMG)),
      available: stock > 0 && flagOk,
      nutrition: mapNutrition(row),
    };
  });
}

// ── Shared UI pieces ───────────────────────────────────────────────────────
const Icon = ({ d, size = 18, sw = "1.8" }: { d: string; size?: number; sw?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />
);

// One button for the whole page. primary = yellow, secondary = outlined, ghost = text, danger = red text.
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, CSSProperties> = {
  primary: { background: C.primary, color: C.onPrimary, border: `1px solid ${C.primary}` },
  secondary: { background: "transparent", color: C.text, border: `1px solid ${C.borderStrong}` },
  ghost: { background: "transparent", color: C.muted, border: "1px solid transparent" },
  danger: { background: "transparent", color: C.danger, border: `1px solid ${C.border}` },
};
function Button({ variant = "secondary", full, small, disabled, onClick, children, href, ariaLabel }: {
  variant?: BtnVariant; full?: boolean; small?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode; href?: string; ariaLabel?: string;
}) {
  const style: CSSProperties = {
    ...BTN[variant], fontFamily: FONT, fontSize: small ? 12.5 : 14, fontWeight: 600, padding: small ? "8px 14px" : "12px 20px", borderRadius: 8,
    width: full ? "100%" : undefined, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap",
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={style}>{children}</a>;
  return (
    <motion.button type="button" aria-label={ariaLabel} onClick={disabled ? undefined : onClick} disabled={disabled}
      whileHover={disabled ? {} : { y: -1 }} whileTap={disabled ? {} : { scale: 0.97 }} transition={SP} style={style}>
      {children}
    </motion.button>
  );
}

const CloseButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.92 }} transition={SP} aria-label={label}
    style={{ width: 36, height: 36, borderRadius: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <Icon d={D.close} size={16} />
  </motion.button>
);

// Small status label. `tone` picks a status colour.
const Badge = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" | "warning" }) => {
  const color = { neutral: C.muted, success: C.success, danger: C.danger, warning: C.warning }[tone];
  return <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 6, color, border: `1px solid ${C.border}`, background: C.surfaceAlt, whiteSpace: "nowrap" }}>{children}</span>;
};

// Image with one safe fallback (no error loop). `fill` makes it cover its parent.
function Img({ src, alt = "", size, ratio, fill }: { src: string; alt?: string; size?: number; ratio?: string; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ width: size ?? "100%", height: fill ? "100%" : size, aspectRatio: ratio, borderRadius: fill ? 0 : 8, overflow: "hidden", flexShrink: 0, background: C.surfaceAlt }}>
      <img src={failed ? PLACEHOLDER_IMG : src} alt={alt} onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
}

// Closes a modal or drawer on Escape.
function useEscape(onClose: () => void) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
}

function Modal({ onClose, width = 480, children }: { onClose: () => void; width?: number; children: ReactNode }) {
  useEscape(onClose);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <motion.div role="dialog" aria-modal="true" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.22, ease: EASE }}
        onClick={e => e.stopPropagation()}
        style={{ width: `min(${width}px,100%)`, maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Drawer({ title, subtitle, width, onClose, actions, footer, children }: {
  title: string; subtitle?: string; width: number; onClose: () => void; actions?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  const { isMobile, isPhone } = useViewport();
  useEscape(onClose);
  const padX = isPhone ? 16 : 24;
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, backdropFilter: "blur(4px)" }} />
      <motion.aside role="dialog" aria-modal="true" aria-label={title} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.3, ease: EASE }}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: isMobile ? "100vw" : `min(${width}px,100vw)`, background: C.surface, zIndex: 310, display: "flex", flexDirection: "column", borderLeft: `1px solid ${C.border}` }}>
        <div style={{ padding: `${isPhone ? 18 : 22}px ${padX}px`, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 12.5, color: C.faint, margin: "3px 0 0" }}>{subtitle}</p>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}<CloseButton onClick={onClose} label={`Close ${title.toLowerCase()}`} /></div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: `8px ${padX}px 24px` }}>{children}</div>
        {footer && <div style={{ padding: `18px ${padX}px 26px`, borderTop: `1px solid ${C.border}` }}>{footer}</div>}
      </motion.aside>
    </>
  );
}

// Brand name with everything after the first word in yellow ("The" white, "Crunch" yellow).
function BrandName({ name }: { name: string }) {
  const [first, ...rest] = String(name || "").split(" ");
  return (
    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
      {rest.length ? <><span style={{ color: C.text }}>{first} </span><span style={{ color: C.primary }}>{rest.join(" ")}</span></> : <span style={{ color: C.primary }}>{first}</span>}
    </span>
  );
}

const stepBtn: CSSProperties = { width: 34, height: 34, background: "none", border: "none", color: C.text, fontSize: 16, fontFamily: FONT, cursor: "pointer" };

// +/- quantity control used on cards and in the cart.
function Stepper({ qty, max, name, accent, onChange }: { qty: number; max: number; name: string; accent?: boolean; onChange: (d: number) => void }) {
  const atMax = qty >= max;
  return (
    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${accent ? C.primary : C.border}`, borderRadius: 8 }}>
      <button type="button" onClick={() => onChange(-1)} aria-label={`Decrease ${name}`} style={stepBtn}>-</button>
      <span style={{ minWidth: 28, textAlign: "center", fontSize: 13.5, fontWeight: 600, color: C.text }}>{qty}</span>
      <button type="button" onClick={() => onChange(1)} disabled={atMax} aria-label={`Increase ${name}`} style={{ ...stepBtn, opacity: atMax ? 0.35 : 1, cursor: atMax ? "not-allowed" : "pointer" }}>+</button>
    </div>
  );
}

// Loading placeholder shaped like the landscape card.
const CardSkeleton = () => (
  <div style={{ display: "flex", minHeight: 180, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
    <motion.div animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ width: 160, background: C.surfaceAlt }} />
    <div style={{ flex: 1, padding: 18, display: "grid", gap: 10, alignContent: "start" }}>
      {["30%", "70%", "50%"].map((w, i) => <div key={i} style={{ height: 12, width: w, borderRadius: 4, background: C.surfaceAlt }} />)}
    </div>
  </div>
);

// ── Product card (landscape: image left, name / price / nutrition right) ──
function ProductCard({ recipe, index, cartQty, highlighted, stockWarning, onAdd, onChangeQty }: {
  recipe: Recipe; index: number; cartQty: number; highlighted: boolean; stockWarning: boolean; onAdd: () => void; onChangeQty: (delta: number) => void;
}) {
  const { isPhone } = useViewport();
  const n = recipe.nutrition;
  const lowStock = recipe.available && recipe.stock <= LOW_STOCK_THRESHOLD;
  const facts = (n ? [["Calories", n.calories, "kcal"], ["Protein", n.protein, "g"], ["Carbs", n.carbs, "g"], ["Fat", n.fat, "g"]] : [])
    .filter(f => f[1] !== undefined) as [string, number, string][];

  return (
    <motion.article layout initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: recipe.available ? 1 : 0.65, y: 0, transition: { duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.05 } }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
      whileHover={recipe.available ? { y: -3 } : undefined}
      style={{ display: "flex", background: C.surface, border: `1px solid ${highlighted ? C.primary : C.border}`, borderRadius: 14, overflow: "hidden", minHeight: isPhone ? 150 : 200, transition: "border-color .3s" }}>
      <div style={{ position: "relative", width: isPhone ? 116 : 200, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0 }}><Img fill src={recipe.image} alt={recipe.name} /></div>
        {!recipe.available && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Badge tone="danger">Out of stock</Badge>
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: isPhone ? "12px 14px" : "16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.primary }}>{recipe.category}</span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <h2 style={{ fontSize: isPhone ? 15 : 17, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>{recipe.name}</h2>
          <span style={{ fontSize: isPhone ? 16 : 19, fontWeight: 700, color: recipe.available ? C.primary : C.faint, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{formatPHP(recipe.price)}</span>
        </div>
        {recipe.description && !isPhone && (
          <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{recipe.description}</p>
        )}
        {facts.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {facts.map(([label, value, unit]) => (
                <div key={label} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", minWidth: 58 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{value}<span style={{ fontSize: 10.5, fontWeight: 500, color: C.muted }}> {unit}</span></div>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: "0.04em" }}>{label}</div>
                </div>
              ))}
            </div>
            {n?.servingSize && <span style={{ display: "block", fontSize: 11, color: C.faint, marginTop: 5 }}>Per {n.servingSize}</span>}
          </div>
        )}
        {lowStock && <span style={{ fontSize: 12, color: C.warning, fontWeight: 500 }}>Only {recipe.stock} left</span>}
        {stockWarning && <span style={{ fontSize: 12, color: C.danger, fontWeight: 500 }}>Only {recipe.stock} in stock. You can't add more.</span>}

        <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", justifyContent: "flex-end" }}>
          {!recipe.available ? <Button small disabled>Unavailable</Button>
            : cartQty > 0 ? <Stepper accent qty={cartQty} max={getEffectiveMaxQuantity(recipe.stock)} name={recipe.name} onChange={onChangeQty} />
            : <Button variant="primary" small onClick={onAdd}>Add to order</Button>}
        </div>
      </div>
    </motion.article>
  );
}

// ── Payment method selector ────────────────────────────────────────────────
function PaymentMethodSelector({ selected, onChange, disabled }: { selected: PaymentMethodType; onChange: (m: PaymentMethodType) => void; disabled?: boolean }) {
  const methods = [
    { id: "gcash" as const, label: "GCash", sub: "Pay now online", d: D.phone },
    { id: "cash" as const, label: "Cash", sub: "Pay at the store", d: D.cash },
  ];
  return (
    <div style={{ marginBottom: 16, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 10px" }}>Payment method</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {methods.map(m => {
          const active = selected === m.id;
          return (
            <button key={m.id} type="button" onClick={() => onChange(m.id)} aria-pressed={active}
              style={{ background: active ? C.surfaceAlt : "transparent", border: `1px solid ${active ? C.primary : C.border}`, borderRadius: 10, padding: 12, cursor: "pointer", fontFamily: FONT, textAlign: "left", display: "flex", alignItems: "center", gap: 10, color: active ? C.text : C.muted }}>
              <Icon d={m.d} size={18} />
              <span>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{m.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.faint }}>{m.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      {selected === "cash" && <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: "10px 0 0" }}>Your order is prepared only after full payment is received at the store.</p>}
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────
function CashTermsModal({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <Modal onClose={onDecline}>
      <div style={{ padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: C.primary, display: "flex" }}><Icon d={D.shield} size={22} /></span>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>Cash payment terms</h3>
          </div>
          <CloseButton onClick={onDecline} label="Close" />
        </div>
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.75, margin: "0 0 20px", padding: 16, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10 }}>{CASH_TERMS}</p>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 22 }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: C.primary, cursor: "pointer" }} />
          <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>I have read and agree to the cash payment terms.</span>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <Button full onClick={onDecline}>Cancel</Button>
          <Button full variant="primary" disabled={!checked} onClick={onAccept}>Agree and place order</Button>
        </div>
      </div>
    </Modal>
  );
}

function OrderTypeModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"choose" | "delivery">("choose");
  const { width } = useViewport();
  const cols = width < 700 ? "1fr" : "1fr 1fr";
  const option: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, cursor: "pointer", fontFamily: FONT, textAlign: "left", display: "flex", flexDirection: "column", gap: 10, color: C.text, textDecoration: "none" };
  const desc: CSSProperties = { fontSize: 13, color: C.muted, lineHeight: 1.6 };
  return (
    <Modal onClose={onClose} width={640}>
      <div style={{ padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>{view === "choose" ? "How would you like to order?" : "Choose a delivery app"}</h3>
          <CloseButton onClick={onClose} label="Close" />
        </div>
        {view === "choose" ? (
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12 }}>
            <button type="button" onClick={onClose} style={option}>
              <span style={{ color: C.primary }}><Icon d={D.bag} size={24} /></span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Pick-up order</span>
              <span style={desc}>Order online and collect your items at the store when they're ready.</span>
            </button>
            <button type="button" onClick={() => setView("delivery")} style={option}>
              <span style={{ color: C.primary }}><Icon d={D.scooter} size={24} /></span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Delivery order</span>
              <span style={desc}>Order through Foodpanda or Grab.</span>
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12 }}>
              {DELIVERY_LINKS.map(d => (
                <a key={d.label} href={d.href} target="_blank" rel="noopener noreferrer" style={option}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{d.label}</span>
                  <span style={{ ...desc, display: "inline-flex", alignItems: "center", gap: 6 }}>Open in a new tab <Icon d={D.external} size={13} /></span>
                </a>
              ))}
            </div>
            <div style={{ marginTop: 16 }}><Button variant="ghost" small onClick={() => setView("choose")}>Back</Button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

function OrderPlacedModal({ orderNumber, cash, onClose }: { orderNumber: string | null; cash: boolean; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={400}>
      <div style={{ padding: "36px 28px 28px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", border: `1px solid ${C.borderStrong}`, color: C.success, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}><Icon d={D.check} size={24} sw="2" /></div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: "0 0 8px" }}>Order placed</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, margin: "0 0 24px" }}>
          {orderNumber && <>Your pickup number is <strong style={{ color: C.primary }}>{orderNumber}</strong>.<br /></>}
          {cash ? "We'll start preparing your order once you pay at the store." : "We'll start preparing your order now."}
        </p>
        <Button full variant="primary" onClick={onClose}>Back to menu</Button>
      </div>
    </Modal>
  );
}

// ── Order tracking and history ─────────────────────────────────────────────
function TrackingPanel({ orders }: { orders: CustomerOrder[] }) {
  if (!orders.length) return null;
  return (
    <section style={{ marginBottom: 32 }} aria-label="Active orders">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0 }}>Your active orders</h3>
        <span style={{ fontSize: 12.5, color: C.faint }}>{orders.length} in progress</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {orders.map(o => (
          <div key={o.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{o.orderNumber}</span>
                <Badge>{o.trackingStatus}</Badge>
              </div>
              <span style={{ fontSize: 12, color: C.faint }}>{formatInSettingsTimezone(o.createdAt, undefined, DATE_FORMAT)}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{o.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryDrawer({ orders, menuItems, onClose }: { orders: CustomerOrder[]; menuItems: Recipe[]; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(orders[0]?.id ?? null);
  const findImg = (n: string) => menuItems.find(r => normalizeName(r.name) === normalizeName(n))?.image ?? PLACEHOLDER_IMG;
  return (
    <Drawer title="Order history" subtitle={`${orders.length} saved order${orders.length !== 1 ? "s" : ""}`} width={460} onClose={onClose}>
      {!orders.length ? (
        <div style={{ textAlign: "center", paddingTop: 80, color: C.faint }}>
          <Icon d={D.clipboard} size={36} sw="1.3" />
          <p style={{ fontSize: 14, lineHeight: 1.7, margin: "14px 0 0" }}>No completed orders yet.<br />Finished orders will appear here.</p>
        </div>
      ) : orders.map(order => {
        const isOpen = expanded === order.id;
        const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
        const paymentLabel = String(order.paymentMethod ?? "").trim().replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        return (
          <div key={order.id} style={{ marginTop: 12, border: `1px solid ${isOpen ? C.borderStrong : C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <button type="button" onClick={() => setExpanded(isOpen ? null : order.id)} aria-expanded={isOpen}
              style={{ width: "100%", background: isOpen ? C.surfaceAlt : "transparent", border: "none", padding: "14px 16px", cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 12, textAlign: "left", color: C.text }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{order.orderNumber}</span>
                  <Badge tone={order.trackingStatus === "Cancelled" ? "danger" : "success"}>{order.trackingStatus}</Badge>
                </div>
                <div style={{ fontSize: 12, color: C.faint }}>{formatInSettingsTimezone(order.createdAt, undefined, DATE_FORMAT)} · {totalQty} item{totalQty !== 1 ? "s" : ""}</div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: C.primary }}>{formatPHP(Number(order.total))}</span>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={SP} style={{ color: C.faint, display: "flex" }}><Icon d={D.chevron} size={14} /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div key="lines" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} style={{ overflow: "hidden" }}>
                  {order.items.map((item, i) => (
                    <div key={`${order.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
                      <Img src={findImg(item.name)} size={38} />
                      <span style={{ flex: 1, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                      <span style={{ fontSize: 12.5, color: C.muted }}>x{item.quantity}</span>
                    </div>
                  ))}
                  <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.faint }}>{paymentLabel} · {order.paymentStatus ?? order.trackingStatus}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </Drawer>
  );
}

// ── Cart drawer ────────────────────────────────────────────────────────────
function CartDrawer({ cart, billing, storeOpen, stockWarningId, onClose, onRemove, onChangeQty, onClear, onSendPayment, onVerifyPayment, onPlaceOrder, paymentSession, paymentMessage, isSubmitting, selectedPaymentMethod, onPaymentMethodChange, onRequestCashTerms }: {
  cart: CartItem[]; billing: Billing; storeOpen: boolean; stockWarningId: number | null;
  onClose: () => void; onRemove: (id: number) => void; onChangeQty: (id: number, delta: number) => void; onClear: () => void;
  onSendPayment: () => void; onVerifyPayment: () => void; onPlaceOrder: () => void;
  paymentSession: PaymentSessionState | null; paymentMessage: string | null; isSubmitting: boolean;
  selectedPaymentMethod: PaymentMethodType; onPaymentMethodChange: (m: PaymentMethodType) => void; onRequestCashTerms: () => void;
}) {
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const isCash = selectedPaymentMethod === "cash";
  // The main button changes with the payment step.
  const [primaryLabel, primaryAction] = isCash ? ["Place order", onRequestCashTerms]
    : paymentSession?.paid ? ["Place order", onPlaceOrder]
    : paymentSession ? ["Check payment status", onVerifyPayment]
    : ["Pay with GCash", onSendPayment];
  const note = (color: string, text: string) => <p style={{ fontSize: 12.5, color, lineHeight: 1.6, margin: "0 0 12px" }}>{text}</p>;

  const footer = cart.length > 0 ? (
    <>
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {([["Subtotal", billing.subtotal], ["Tax", billing.taxAmount], ["Service charge", billing.serviceChargeAmount]] as [string, number][]).map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted }}><span>{label}</span><span>{formatPHP(value)}</span></div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: C.primary, letterSpacing: "-0.02em" }}>{formatPHP(billing.grandTotal)}</span>
        </div>
      </div>
      <PaymentMethodSelector selected={selectedPaymentMethod} onChange={onPaymentMethodChange} disabled={!isCash && !!paymentSession} />
      {paymentMessage && note(isCash ? C.danger : paymentSession?.paid ? C.success : C.muted, paymentMessage)}
      {!storeOpen && note(C.danger, STORE_CLOSED_MESSAGE)}
      {!isCash && paymentSession?.checkoutUrl && !paymentSession.paid && (
        <div style={{ marginBottom: 10 }}><Button full href={paymentSession.checkoutUrl}>Open GCash payment</Button></div>
      )}
      <Button full variant="primary" disabled={isSubmitting || !storeOpen} onClick={primaryAction}>{isSubmitting ? "Please wait..." : primaryLabel}</Button>
      <p style={{ textAlign: "center", fontSize: 11.5, color: C.faint, margin: "12px 0 0" }}>
        {isCash ? "Pickup only. Pay at the store." : paymentSession?.bypassed ? "Test mode. No real GCash charge." : "Pickup only. Pay with GCash, then place your order."}
      </p>
    </>
  ) : undefined;

  return (
    <Drawer title="Your order" subtitle={`${totalQty} item${totalQty !== 1 ? "s" : ""}`} width={440} onClose={onClose}
      actions={cart.length > 0 ? <Button variant="danger" small onClick={onClear}>Clear</Button> : undefined} footer={footer}>
      {!cart.length ? (
        <p style={{ textAlign: "center", paddingTop: 80, color: C.faint, fontSize: 14, lineHeight: 1.7 }}>Your order is empty.<br />Add items from the menu to get started.</p>
      ) : cart.map(({ recipe, quantity }) => (
        <div key={recipe.id} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: `1px solid ${C.border}` }}>
          <Img src={recipe.image} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>{recipe.name}</p>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.primary }}>{formatPHP(recipe.price * quantity)}</span>
            </div>
            {stockWarningId === recipe.id && <p style={{ fontSize: 12, color: C.danger, margin: "4px 0 0" }}>Only {recipe.stock} in stock. You can't add more.</p>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
              <Stepper qty={quantity} max={getEffectiveMaxQuantity(recipe.stock)} name={recipe.name} onChange={d => onChangeQty(recipe.id, d)} />
              <Button variant="ghost" small onClick={() => onRemove(recipe.id)}>Remove</Button>
            </div>
          </div>
        </div>
      ))}
    </Drawer>
  );
}

// ── Email verification ─────────────────────────────────────────────────────
function EmailVerificationPanel({ email, code, error, success, isVerifying, isResending, onCodeChange, onVerify, onResend }: {
  email: string; code: string; error: string; success: string; isVerifying: boolean; isResending: boolean;
  onCodeChange: (v: string) => void; onVerify: () => void; onResend: () => void;
}) {
  return (
    <section style={{ marginBottom: 28, padding: 20, borderRadius: 12, background: C.surface, border: `1px solid ${C.borderStrong}` }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: C.text }}>Verify your email to place orders</h3>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: C.muted }}>We sent a 6-digit code to <strong style={{ color: C.text }}>{email}</strong>. Enter it below to unlock online ordering.</p>
      {error && <p style={{ margin: "12px 0 0", color: C.danger, fontSize: 12.5 }}>{error}</p>}
      {success && <p style={{ margin: "12px 0 0", color: C.success, fontSize: 12.5 }}>{success}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <input value={code} onChange={e => onCodeChange(e.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" aria-label="Verification code"
          style={{ flex: "1 1 180px", minWidth: 0, borderRadius: 8, border: `1px solid ${C.borderStrong}`, background: C.bg, color: C.text, padding: "12px 14px", textAlign: "center", letterSpacing: "0.3em", fontSize: 16, fontWeight: 600, outline: "none", fontFamily: FONT }} />
        <Button variant="primary" disabled={isVerifying || code.trim().length !== 6} onClick={onVerify}>{isVerifying ? "Verifying..." : "Verify"}</Button>
        <Button disabled={isResending} onClick={onResend}>{isResending ? "Sending..." : "Resend code"}</Button>
      </div>
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Delicacy() {
  const navigate = useNavigate();
  const { width, isNarrowPhone } = useViewport();
  const isNarrow = width < 900;
  const { user, updateUser, logout } = useAuth();
  const customerUserId = user ? Number(user.userId) : 0;
  const customerName = user?.username ?? "The Crunch Customer";
  const customerEmail = user?.email ?? "";
  const customerNeedsVerification = String(user?.role || "").trim().toLowerCase() === "customer" && user?.email_verified !== true;

  // Menu data
  const [menuItems, setMenuItems] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Cart and payment (memory only, nothing is written to localStorage)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentSession, setPaymentSession] = useState<PaymentSessionState | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("gcash");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stockWarningId, setStockWarningId] = useState<number | null>(null);

  // Orders
  const [orderHistory, setOrderHistory] = useState<CustomerOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<CustomerOrder[]>([]);
  const [placed, setPlaced] = useState<{ num: string; cash: boolean } | null>(null);

  // Overlays
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [orderTypeOpen, setOrderTypeOpen] = useState(false);
  const [showCashTerms, setShowCashTerms] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Settings
  const [billingSettings, setBillingSettings] = useState<BillingSettings>(DEFAULT_BILLING);
  const [storeSettings, setStoreSettings] = useState<StoreStatusSettings>(DEFAULT_STORE);
  const [restaurantSettings, setRestaurantSettings] = useState(GENERAL_SETTINGS_DEFAULTS);

  // Email verification
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const submittingRef = useRef(false);   // blocks double submits
  const deepLinkHandled = useRef(false); // makes the ?item= deep link run once

  // The header is fixed; a spacer of the same (measured) height keeps content below it.
  const navRef = useRef<HTMLElement | null>(null);
  const [navHeight, setNavHeight] = useState(68);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => setNavHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lock page scrolling while any overlay is open.
  const overlayOpen = orderTypeOpen || showCashTerms || !!placed || drawerOpen || historyOpen;
  useEffect(() => {
    if (!overlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [overlayOpen]);

  // Header gets a more solid background after scrolling.
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Billing and store-hours settings, then restaurant name/tagline/contact.
  useEffect(() => {
    let cancelled = false;
    api.get<Record<string, unknown>>("/settings").then(data => {
      if (cancelled) return;
      setBillingSettings({ taxRate: Math.max(0, Number(data?.taxRate || 0)), serviceCharge: Math.max(0, Number(data?.serviceCharge || 0)) });
      const mode = data?.storeStatusMode;
      const pick = (k: keyof StoreStatusSettings) => String(data?.[k] || DEFAULT_STORE[k]);
      setStoreSettings({
        weekdayOpenTime: pick("weekdayOpenTime"), weekdayCloseTime: pick("weekdayCloseTime"),
        weekendOpenTime: pick("weekendOpenTime"), weekendCloseTime: pick("weekendCloseTime"),
        storeStatusMode: mode === "manual_open" || mode === "manual_closed" ? mode : "auto", timezone: pick("timezone"),
      });
    }).catch(() => { if (!cancelled) { setBillingSettings(DEFAULT_BILLING); setStoreSettings(DEFAULT_STORE); } });
    fetchGeneralSettings().then(d => { if (!cancelled) setRestaurantSettings(d); });
    return () => { cancelled = true; };
  }, []);

  // Load the menu. A failed request shows an error, an empty menu shows an empty state.
  const loadMenuItems = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setLoadError(false);
    try {
      const recipes = mapMenuRows(await api.get<InventoryMenuRow[]>("/products?item_type=menu_item"));
      setMenuItems(recipes);
      setCategories(["All", ...CATEGORY_ORDER.filter(c => recipes.some(r => r.category === c))]);
      // Re-sync the cart with fresh stock: drop sold-out items and cap quantities.
      setCart(prev => prev.flatMap(item => {
        const current = recipes.find(r => r.id === item.recipe.id);
        const max = current ? getEffectiveMaxQuantity(current.stock) : 0;
        return current && max > 0 ? [{ recipe: current, quantity: Math.min(item.quantity, max) }] : [];
      }));
    } catch (error) {
      console.error("Failed to load menu:", error);
      setLoadError(true);
    } finally { if (showLoading) setLoading(false); }
  }, []);
  useEffect(() => { void loadMenuItems(true); }, [loadMenuItems]);

  // Refresh stock when the customer returns to the tab.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void loadMenuItems(false); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [loadMenuItems]);

  // Payment return: reads session_id from the redirect URL (API note #4).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("payment"), sessionId = params.get("session_id");
    if (!state) return;
    const clearUrl = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete("payment"); u.searchParams.delete("session_id");
      window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
    };
    if (state === "cancelled") { setDrawerOpen(true); setPaymentMessage("GCash checkout was cancelled. You can try again when you're ready."); clearUrl(); return; }
    if (state !== "success" || !sessionId) { clearUrl(); return; }
    setDrawerOpen(true);
    setPaymentMessage("Verifying your GCash payment...");
    let cancelled = false;
    (async () => {
      try {
        const d = await api.get<VerifyResult>(`/paymongo/verify/${sessionId}`);
        if (cancelled) return;
        setPaymentSession({ checkoutSessionId: sessionId, checkoutUrl: "", ...d });
        setPaymentMessage(d.paid ? "Payment confirmed. You can now place your order." : "Payment is still pending. Please check again.");
      } catch (error) {
        if (!cancelled) setPaymentMessage(error instanceof Error ? error.message : "Could not verify payment automatically. Select Check payment status.");
      } finally { clearUrl(); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Deep link: ?showOrderModal=true opens the order type dialog.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("showOrderModal") !== "true") return;
    setOrderTypeOpen(true);
    url.searchParams.delete("showOrderModal");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // Deep link: ?item=name scrolls to that product once the menu has loaded.
  useEffect(() => {
    if (deepLinkHandled.current || !menuItems.length) return;
    const slug = new URL(window.location.href).searchParams.get("item");
    if (!slug) return;
    deepLinkHandled.current = true;
    const needle = decodeURIComponent(slug).trim().toLowerCase();
    const match = menuItems.find(r => normalizeName(r.name) === needle)
      ?? menuItems.find(r => normalizeName(r.name).includes(needle) || needle.includes(normalizeName(r.name)));
    if (!match) return;
    setActiveCategory("All");
    setTimeout(() => {
      const el = cardRefs.current[match.id];
      if (el) { const r = el.getBoundingClientRect(); window.scrollTo({ top: r.top + window.scrollY - window.innerHeight / 2 + r.height / 2, behavior: "smooth" }); }
      setHighlightedId(match.id);
      setTimeout(() => setHighlightedId(null), 3200);
    }, 480);
  }, [menuItems]);

  // Customer's active orders and history.
  const fetchOrders = useCallback(async () => {
    if (!customerUserId) return;
    try {
      const d = await api.get<{ activeOrders: CustomerOrder[]; historyOrders: CustomerOrder[] }>(`/orders/customer/${customerUserId}`);
      setActiveOrders(d.activeOrders ?? []);
      setOrderHistory(d.historyOrders ?? []);
    } catch (e) { console.error("Failed to load orders:", e); }
  }, [customerUserId]);
  useEffect(() => { void fetchOrders(); }, [fetchOrders]);
  useEventInvalidation({ topics: ["orders.changed"], onInvalidate: fetchOrders, enabled: customerUserId > 0 });

  // ── Derived values ───────────────────────────────────────────────────────
  const displayed = menuItems.filter(r => activeCategory === "All" || r.category === activeCategory);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const billing = calcBilling(cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0), billingSettings);
  const storeOpen = getStoreOpen(storeSettings);
  const initials = customerName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  // ── Cart actions ─────────────────────────────────────────────────────────
  const flashStockWarning = (id: number) => { setStockWarningId(id); setTimeout(() => setStockWarningId(p => (p === id ? null : p)), 2400); };
  const clearPayment = () => { setPaymentSession(null); setPaymentMessage(null); };

  const addToCart = (recipe: Recipe) => {
    if (!recipe.available) return;
    const existing = cart.find(c => c.recipe.id === recipe.id);
    const nextQty = (existing?.quantity ?? 0) + 1;
    if (nextQty > getEffectiveMaxQuantity(recipe.stock)) { flashStockWarning(recipe.id); return; }
    clearPayment();
    setCart(p => existing ? p.map(c => (c.recipe.id === recipe.id ? { ...c, quantity: nextQty } : c)) : [...p, { recipe, quantity: 1 }]);
  };
  const removeFromCart = (id: number) => { clearPayment(); setCart(p => p.filter(c => c.recipe.id !== id)); };
  // Quantity can never go above the real stock.
  const changeQty = (id: number, delta: number) => {
    const item = cart.find(c => c.recipe.id === id);
    if (!item) return;
    const max = getEffectiveMaxQuantity(item.recipe.stock), next = item.quantity + delta;
    if (delta > 0 && next > max) { flashStockWarning(id); return; }
    clearPayment();
    setCart(p => p.map(c => (c.recipe.id === id ? { ...c, quantity: Math.min(next, max) } : c)).filter(c => c.quantity > 0));
  };
  const clearCart = () => { setCart([]); clearPayment(); };

  // ── Ordering and payment ─────────────────────────────────────────────────
  const buildItems = () => cart.map(i => ({ product_id: i.recipe.id, qty: i.quantity, subtotal: i.recipe.price * i.quantity, name: i.recipe.name, price: i.recipe.price }));

  // Everything that must be true before an order or payment can start.
  const canOrder = () => {
    const fail = (msg: string) => { setPaymentMessage(msg); return false; };
    if (!user) return fail("Please log in first before placing an order.");
    if (user.role && !isCustomerUser(user.role)) return fail("Please log in using a customer account to place an order.");
    if (customerNeedsVerification) {
      setVerificationError("Please verify your email before placing an order.");
      setVerificationSuccess(null);
      return fail("Please verify your email before placing an order.");
    }
    if (!storeOpen) return fail(STORE_CLOSED_MESSAGE);
    if (cart.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > getEffectiveMaxQuantity(i.recipe.stock)))
      return fail("One or more items exceed the available stock or the 999-unit limit. Please adjust quantities.");
    return true;
  };

  // Saves the order once, guarded against double submits. Then refreshes data and shows the confirmation.
  const submitOrder = async (extra: Record<string, unknown>, cash: boolean, fallbackMsg: string) => {
    if (submittingRef.current || !canOrder()) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const r = await api.post<{ orderId: number; orderNumber: string }>("/orders", {
        items: buildItems(), total: billing.grandTotal, customerUserId, customer_name: customerName, customer_email: customerEmail, order_type: "take-out", ...extra,
      });
      await Promise.all([fetchOrders(), loadMenuItems(false)]);
      setPlaced({ num: r.orderNumber || `#${r.orderId}`, cash });
      clearPayment();
      setDrawerOpen(false);
      setTimeout(() => setCart([]), 320);
    } catch (e) {
      console.error(e);
      setPaymentMessage(e instanceof Error ? e.message : fallbackMsg);
    } finally { submittingRef.current = false; setIsSubmitting(false); }
  };

  const handleRequestCashTerms = () => { if (!isSubmitting && cart.length && canOrder()) setShowCashTerms(true); };
  const handlePlaceCashOrder = () => submitOrder({ payment_method: "cash_on_pickup", payment_status: "Pending Payment" }, true, "Could not place your order. Please try again.");

  const handlePlaceOrder = () => {
    if (isSubmitting || !paymentSession?.paid) { setPaymentMessage("Please complete and verify your GCash payment first."); return; }
    return submitOrder({
      payment_method: "gcash", checkout_session_id: paymentSession.checkoutSessionId,
      payment_reference: paymentSession.paymentReference || paymentSession.checkoutSessionId, payment_status: "Paid",
    }, false, "Payment received, but the order could not be placed. Please try again.");
  };

  const handleSendPayment = async () => {
    if (isSubmitting || !cart.length || !canOrder()) return;
    setIsSubmitting(true);
    setPaymentMessage(null);
    try {
      const d = await api.post<{ checkoutSessionId: string; checkoutUrl: string | null; status: string; paid?: boolean; paymentReference?: string | null; bypassed?: boolean }>(
        "/paymongo/create-checkout", { items: buildItems(), total: billing.grandTotal, customerUserId, customerName, customerEmail });
      const bypassed = d.bypassed === true;
      setPaymentSession({ checkoutSessionId: d.checkoutSessionId, checkoutUrl: d.checkoutUrl, status: d.status, paid: bypassed && d.paid === true, paymentReference: d.paymentReference ?? null, bypassed });
      if (bypassed) { setPaymentMessage("Test payment completed. Select Place order to continue."); return; }
      if (!d.checkoutUrl) throw new Error("The payment checkout link was not returned. Please try again.");
      setPaymentMessage("Redirecting to GCash checkout...");
      window.location.href = d.checkoutUrl;
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "Could not start GCash payment. Please try again.");
    } finally { setIsSubmitting(false); }
  };

  const handleVerifyPayment = async () => {
    if (isSubmitting || !paymentSession) return;
    setIsSubmitting(true);
    try {
      const d = await api.get<VerifyResult>(`/paymongo/verify/${paymentSession.checkoutSessionId}`);
      setPaymentSession({ ...paymentSession, ...d });
      setPaymentMessage(d.paid ? "Payment confirmed. You can now place your order." : "Payment is still pending. Finish GCash checkout, then check again.");
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "Could not verify payment. Please try again.");
    } finally { setIsSubmitting(false); }
  };

  // ── Email verification ───────────────────────────────────────────────────
  const handleVerifyEmail = async () => {
    const code = verificationCode.replace(/\D/g, "").slice(0, 6);
    if (!customerEmail || code.length !== 6) { setVerificationError("Enter the 6-digit verification code."); return; }
    setIsVerifyingEmail(true); setVerificationError(null); setVerificationSuccess(null);
    try {
      await authApi.verifyEmail(customerEmail, code);
      updateUser({ email_verified: true });
      setVerificationSuccess("Email verified. You can now place online orders.");
      setVerificationCode("");
      setPaymentMessage(null);
    } catch (err: any) { setVerificationError(err.message || "Could not verify email."); }
    finally { setIsVerifyingEmail(false); }
  };
  const handleResendVerification = async () => {
    if (!customerEmail) { setVerificationError("No customer email found for this account."); return; }
    setIsResending(true); setVerificationError(null); setVerificationSuccess(null);
    try {
      await authApi.resendVerification(customerEmail);
      setVerificationSuccess("A new verification code has been sent to your email.");
    } catch (err: any) { setVerificationError(err.message || "Could not resend the verification code."); }
    finally { setIsResending(false); }
  };

  // ── Header pieces ────────────────────────────────────────────────────────
  // "Menu" opens the order type dialog, the other links navigate.
  const navLinks = (
    <nav aria-label="Main" style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {NAV_LINKS.map(item => {
        const current = item.label === "Menu";
        return (
          <button key={item.label} type="button" onClick={() => (current ? setOrderTypeOpen(true) : navigate(item.path))}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: current ? 600 : 500, color: current ? C.primary : C.muted, padding: "8px 12px", borderRadius: 8, transition: "color .2s" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.primary; }}
            onMouseLeave={e => { e.currentTarget.style.color = current ? C.primary : C.muted; }}>
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  const badge: CSSProperties = { borderRadius: 10, minWidth: 18, height: 18, fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" };

  return (
    <MotionConfig reducedMotion="user">
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", paddingBottom: 96, color: C.text }}>
        {/* ── Header ── */}
        <motion.header ref={navRef} initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}
          style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, boxSizing: "border-box", background: scrolled ? "rgba(10,8,8,0.97)" : "rgba(10,8,8,0.85)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}`, transition: "background .3s" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: isNarrowPhone ? "10px 14px" : "0 clamp(16px,4vw,40px)", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <button type="button" onClick={() => navigate(HOME_PATH)} aria-label={`${restaurantSettings.restaurantName} home`}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, color: C.text, minWidth: 0 }}>
              <img src="/img/logo24.png" alt="" style={{ width: 32, height: 32, objectFit: "contain" }} />
              {!isNarrowPhone && <BrandName name={restaurantSettings.restaurantName} />}
            </button>

            {!isNarrow && navLinks}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Order history"
                style={{ position: "relative", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon d={D.history} size={17} />
                {orderHistory.length > 0 && <span style={{ ...badge, position: "absolute", top: -6, right: -6, background: C.primary, color: C.onPrimary }}>{orderHistory.length}</span>}
              </button>
              <Button variant="primary" small onClick={() => setDrawerOpen(true)}>
                {isNarrowPhone ? "Order" : "My order"}
                {totalItems > 0 && <span style={{ ...badge, background: C.onPrimary, color: C.primary, minWidth: 20, height: 20, fontSize: 11 }}>{totalItems}</span>}
              </Button>
              {user && (
                <>
                  {!isNarrowPhone && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: C.surfaceAlt, border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: C.primary }}>{initials}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: C.muted, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customerName.split(" ")[0]}</span>
                    </div>
                  )}
                  <Button small onClick={() => { logout(); navigate("/aboutthecrunch"); }}>Log out</Button>
                </>
              )}
            </div>
          </div>
          {/* On narrow screens the links move to their own row */}
          {isNarrow && <div style={{ borderTop: `1px solid ${C.border}`, padding: "2px 10px", overflowX: "auto" }}>{navLinks}</div>}
        </motion.header>
        <div style={{ height: navHeight }} aria-hidden />

        <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE, delay: 0.1 }}
          style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(28px,5vw,52px) clamp(16px,4vw,40px) 0" }}>
          {/* ── Page title and store info ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
              <h1 style={{ fontSize: "clamp(28px,4.5vw,40px)", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Menu</h1>
              <Badge tone={storeOpen ? "success" : "danger"}>{storeOpen ? "Open now" : "Closed"}</Badge>
            </div>
            {restaurantSettings.tagline && <p style={{ fontSize: 14.5, color: C.muted, margin: "8px 0 0", maxWidth: 620, lineHeight: 1.6 }}>{restaurantSettings.tagline}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", marginTop: 12, fontSize: 12.5, color: C.faint }}>
              <span>{getHoursLabel(storeSettings)}</span>
              {[restaurantSettings.address, restaurantSettings.phone, restaurantSettings.email].filter(Boolean).map(v => <span key={v}>{v}</span>)}
            </div>
            {!storeOpen && <p style={{ fontSize: 13, color: C.danger, margin: "12px 0 0" }}>{STORE_CLOSED_MESSAGE}</p>}
          </div>

          {customerNeedsVerification && (
            <EmailVerificationPanel email={customerEmail} code={verificationCode} error={verificationError || ""} success={verificationSuccess || ""}
              isVerifying={isVerifyingEmail} isResending={isResending}
              onCodeChange={v => { setVerificationCode(v.replace(/\D/g, "").slice(0, 6)); setVerificationError(null); }}
              onVerify={handleVerifyEmail} onResend={handleResendVerification} />
          )}
          <TrackingPanel orders={activeOrders} />

          {/* ── Category tabs ── */}
          {!loading && !loadError && categories.length > 1 && (
            <div role="tablist" style={{ display: "flex", marginBottom: 28, borderBottom: `1px solid ${C.border}`, overflowX: "auto", scrollbarWidth: "none" }}>
              {categories.map(cat => {
                const active = activeCategory === cat;
                return (
                  <button key={cat} type="button" role="tab" aria-selected={active} onClick={() => setActiveCategory(cat)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 14, fontWeight: active ? 600 : 400, color: active ? C.primary : C.faint, padding: "12px 20px", position: "relative", whiteSpace: "nowrap", transition: "color .2s" }}>
                    {cat}
                    {active && <motion.div layoutId="categoryTab" transition={{ duration: 0.25, ease: EASE }} style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: C.primary }} />}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Product grid ── */}
          {loading ? (
            <div style={gridStyle}><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: "72px 0" }}>
              <p style={{ color: C.muted, fontSize: 14, margin: "0 0 16px" }}>We couldn't load the menu. Check your connection and try again.</p>
              <Button onClick={() => void loadMenuItems(true)}>Try again</Button>
            </div>
          ) : displayed.length === 0 ? (
            <p style={{ textAlign: "center", padding: "72px 0", color: C.faint, fontSize: 14 }}>
              {menuItems.length === 0 ? "The menu is empty right now. Please check back soon." : "No items in this category."}
            </p>
          ) : (
            <div style={gridStyle}>
              <AnimatePresence mode="popLayout">
                {displayed.map((recipe, index) => (
                  <div key={recipe.id} ref={(el: HTMLDivElement | null) => { cardRefs.current[recipe.id] = el; }} style={{ display: "flex", flexDirection: "column" }}>
                    <ProductCard recipe={recipe} index={index} cartQty={cart.find(c => c.recipe.id === recipe.id)?.quantity ?? 0}
                      highlighted={highlightedId === recipe.id} stockWarning={stockWarningId === recipe.id}
                      onAdd={() => addToCart(recipe)} onChangeQty={delta => changeQty(recipe.id, delta)} />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.main>

        {/* ── Overlays ── */}
        <AnimatePresence>{orderTypeOpen && <OrderTypeModal onClose={() => setOrderTypeOpen(false)} />}</AnimatePresence>
        <AnimatePresence>
          {drawerOpen && (
            <CartDrawer cart={cart} billing={billing} storeOpen={storeOpen} stockWarningId={stockWarningId}
              onClose={() => setDrawerOpen(false)} onRemove={removeFromCart} onChangeQty={changeQty} onClear={clearCart}
              onSendPayment={handleSendPayment} onVerifyPayment={handleVerifyPayment} onPlaceOrder={handlePlaceOrder}
              paymentSession={paymentSession} paymentMessage={paymentMessage} isSubmitting={isSubmitting}
              selectedPaymentMethod={paymentMethod} onPaymentMethodChange={m => { setPaymentMethod(m); clearPayment(); }}
              onRequestCashTerms={handleRequestCashTerms} />
          )}
        </AnimatePresence>
        <AnimatePresence>{showCashTerms && <CashTermsModal onAccept={() => { setShowCashTerms(false); void handlePlaceCashOrder(); }} onDecline={() => setShowCashTerms(false)} />}</AnimatePresence>
        <AnimatePresence>{historyOpen && <HistoryDrawer orders={orderHistory} menuItems={menuItems} onClose={() => setHistoryOpen(false)} />}</AnimatePresence>
        <AnimatePresence>{placed && <OrderPlacedModal orderNumber={placed.num} cash={placed.cash} onClose={() => setPlaced(null)} />}</AnimatePresence>
      </div>
    </MotionConfig>
  );
}

// Landscape cards: two per row on desktop, one on mobile.
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,460px),1fr))", gap: 18 };