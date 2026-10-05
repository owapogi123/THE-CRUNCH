"use client";

import {
  useState, useEffect, useRef, useCallback,
  type ReactNode, type CSSProperties, type ChangeEvent, type FocusEvent, type ButtonHTMLAttributes,
} from "react";
import { Sidebar } from "@/components/Sidebar";
import { UserIdentityBanner } from "@/components/UserIdentityBanner";
import { api, apiCall, resolveAssetUrl } from "@/lib/api";
import { motion } from "framer-motion";
import { useNotifications } from "@/lib/NotificationContext";
import {
  fetchGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  formatCurrencyAmount,
  formatInSettingsTimezone,
} from "@/lib/restaurantSettings";

/**
 * BACKEND NOTES
 * - Everything on this page comes from the API:
 *     GET  /products?item_type=menu_item            menu items
 *     GET  /inventory                               stock items (used as ingredient choices)
 *     GET  /settings/menu-categories?activeOnly=1   category list
 *     POST /products, PUT /products/:id, DELETE /products/:id (falls back to /inventory/:id)
 *     POST /upload-product-image                    item photo
 * - Nothing is stored in localStorage or sessionStorage.
 * - Poppins is loaded globally by the app. This file only references it.
 */

/* ────────────────────────────────────────────────────────────────────────────
   Config
   ──────────────────────────────────────────────────────────────────────── */

const FONT = "'Poppins', sans-serif";
const PLACEHOLDER_IMG = "/img/placeholder.jpg";
const DEFAULT_UNIT = "piece"; // unit sent when creating a menu item (the form has no unit field)

const T = {
  page: "#F5F3EC",
  surface: "#FFFFFF",
  surfaceMuted: "#FAF9F4",
  ink: "#1C1B17",
  muted: "#8C877C",
  faint: "#D6D1C4",
  line: "#ECE7DA",
  accent: "#D44D14",
  accentDeep: "#B93E0C",
  accentSoft: "#FBEAE0",
  deep: "#1A3A2A",
  deepAlt: "#244B37",
  deepSoft: "#E7EFE9",
  good: "#2F8F5B",
  goodSoft: "#EAF5EF",
  warn: "#B8791B",
  warnSoft: "#FAF1DE",
  bad: "#C23B2E",
  badSoft: "#FBEAE8",
};

const SHADOW = {
  card: "0 1px 2px rgba(28,27,23,0.04), 0 10px 28px -14px rgba(28,27,23,0.10)",
  raised: "0 1px 2px rgba(28,27,23,0.06), 0 6px 16px -6px rgba(28,27,23,0.14)",
  modal: "0 40px 90px -20px rgba(28,27,23,0.35), 0 8px 24px -8px rgba(28,27,23,0.12)",
};

/* ────────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────── */

type ManualOverrideMode = "Auto" | "Force Available" | "Force Out of Stock";
type ToastType = "success" | "error" | "warning" | "info";
type Toast = (label: string, type?: ToastType) => void;

const OVERRIDE_MODES: ManualOverrideMode[] = ["Auto", "Force Available", "Force Out of Stock"];

interface IngredientRow {
  product_id?: number;
  product_name?: string;
  quantity_required?: number | string;
  unit?: string;
  stock?: number | string;
}

// One row from /products or /inventory
interface ApiRow {
  id?: number; product_id?: number; inventory_id?: number; item_type?: string; menu_code?: string;
  name?: string; product_name?: string; category?: string; image?: string; stock?: number; quantity?: number;
  price?: number | string; unit?: string; description?: string; availability_status?: string;
  is_promotional?: number | boolean; promo_price?: number | string | null; promo_label?: string;
  dailyWithdrawn?: number; manual_override?: number | boolean; manual_status?: string;
  ingredient_count?: number; available_servings?: number | string | null; ingredients?: IngredientRow[];
}

interface IngredientInput { productId: string; quantityRequired: string }
interface IngredientOption { id: number; name: string; category: string }
interface MenuCategoryRecord { name: string; display_order: number; is_active: boolean | number }

interface MenuItem {
  id: number;
  rawProductId?: number;
  rawInventoryId?: number;
  menuCode: string;
  name: string;
  category: string;
  price: string;
  unit: string;
  stock: number;
  description: string;
  image: string;
  availabilityStatus: string;
  overrideMode: ManualOverrideMode;
  hasRecipe: boolean;
  availableServings: number | null;
  isPromotional: boolean;
  promoPrice: string;
  promoLabel: string;
  ingredients: IngredientInput[];
}

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────── */

const formatPeso = (value: number | string) => formatCurrencyAmount(Number(value || 0));
const errorText = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await api.post<{ fileUrl: string }>("/upload-product-image", formData);
  const fileUrl = String(response?.fileUrl ?? "").trim();
  if (!fileUrl) throw new Error("Product image upload did not return a file path");
  return fileUrl;
}

// Tries each endpoint in order. Moves to the next one only when the server answers 404.
async function tryEndpoints(endpoints: string[], method: "PUT" | "DELETE", body?: object) {
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      await apiCall(endpoint, body ? { method, body } : { method });
      return;
    } catch (error) {
      if (!errorText(error).includes("404")) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function toOverrideMode(manualOverride: unknown, manualStatus: unknown): ManualOverrideMode {
  const isManual =
    manualOverride === true ||
    manualOverride === 1 ||
    String(manualOverride ?? "").trim().toLowerCase() === "true";
  if (!isManual) return "Auto";
  return String(manualStatus ?? "").trim().toLowerCase() === "out of stock" ? "Force Out of Stock" : "Force Available";
}

function toOverridePayload(mode: ManualOverrideMode) {
  if (mode === "Force Available") return { manual_override: true, manual_status: "Available" };
  if (mode === "Force Out of Stock") return { manual_override: true, manual_status: "Out of Stock" };
  return { manual_override: false, manual_status: "Available" };
}

// Validates the ingredient rows and turns them into the API format
function buildIngredientPayload(inputs: IngredientInput[]) {
  const filled = inputs
    .map((entry) => ({ productId: entry.productId.trim(), quantityRequired: entry.quantityRequired.trim() }))
    .filter((entry) => entry.productId || entry.quantityRequired);

  for (const entry of filled) {
    if (!entry.productId || !entry.quantityRequired) throw new Error("Each ingredient row needs both an ingredient and a required quantity.");
    if (Number(entry.quantityRequired) <= 0) throw new Error("Ingredient quantities must be greater than zero.");
  }
  return filled.map((entry) => ({ product_id: Number(entry.productId), quantity_required: Number(entry.quantityRequired) }));
}

// Keeps only menu items, and only the newest row when a name appears twice
function latestPerName(rows: ApiRow[]) {
  const rowId = (row: ApiRow) => Number(row.product_id ?? row.id ?? row.inventory_id ?? 0);
  const newest = new Map<string, ApiRow>();
  for (const row of rows) {
    if (String(row.item_type ?? "menu_item").trim().toLowerCase() !== "menu_item") continue;
    const key = String(row.product_name ?? row.name ?? "").trim().toLowerCase();
    const saved = newest.get(key);
    if (!saved || rowId(row) > rowId(saved)) newest.set(key, row);
  }
  return [...newest.values()];
}

function toMenuItem(item: ApiRow): MenuItem {
  const id = Number(item.product_id ?? item.inventory_id ?? item.id ?? 0);
  const servings = item.available_servings;
  const promo = item.promo_price;
  return {
    id,
    rawProductId: item.product_id ? Number(item.product_id) : undefined,
    rawInventoryId: item.inventory_id ? Number(item.inventory_id) : undefined,
    menuCode: String(item.menu_code ?? `M-${String(id).padStart(3, "0")}`),
    name: item.name || item.product_name || "Unnamed Product",
    category: item.category || "Uncategorized",
    price: String(item.price ?? "0"),
    unit: String(item.unit ?? DEFAULT_UNIT),
    stock: Number(item.quantity ?? item.stock ?? 0),
    description: String(item.description ?? ""),
    image: item.image || PLACEHOLDER_IMG,
    availabilityStatus: String(item.availability_status ?? "Available"),
    overrideMode: toOverrideMode(item.manual_override, item.manual_status),
    hasRecipe: Number(item.ingredient_count ?? 0) > 0,
    availableServings: servings === null || servings === undefined || String(servings) === "" ? null : Number(servings),
    isPromotional: Boolean(Number(item.is_promotional ?? 0)),
    promoPrice: promo !== null && promo !== undefined && String(promo) !== "" ? String(promo) : "",
    promoLabel: String(item.promo_label ?? ""),
    ingredients: (item.ingredients ?? []).map((ingredient) => ({
      productId: String(ingredient.product_id ?? ""),
      quantityRequired: String(ingredient.quantity_required ?? ""),
    })),
  };
}

// What a customer can actually order: servings from the recipe, or plain stock
const sellableQuantity = (item: MenuItem) => (item.hasRecipe ? Number(item.availableServings ?? 0) : item.stock);
const isUnavailable = (item: MenuItem) => item.availabilityStatus === "Out of Stock" || sellableQuantity(item) === 0;
const priceNumber = (value: string) => parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0;

// Loads everything the page needs from the API
function useMenuAdmin(onError: (message: string) => void) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [menuData, stockData, categoryData] = await Promise.all([
        apiCall("/products?item_type=menu_item", { method: "GET" }),
        apiCall("/inventory", { method: "GET" }),
        apiCall("/settings/menu-categories?activeOnly=1", { method: "GET" }).catch(() => []),
      ]);
      const menuRows = Array.isArray(menuData) ? (menuData as ApiRow[]) : [];
      const stockRows = Array.isArray(stockData) ? (stockData as ApiRow[]) : [];
      const categoryRows = Array.isArray(categoryData) ? (categoryData as MenuCategoryRecord[]) : [];

      setItems(latestPerName(menuRows).map(toMenuItem));

      setApiCategories(
        categoryRows
          .filter((c) => c.is_active === true || c.is_active === 1)
          .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0) || a.name.localeCompare(b.name))
          .map((c) => c.name.trim())
          .filter(Boolean),
      );

      setIngredientOptions(
        stockRows
          .filter((row) => String(row.item_type ?? "stock_item").trim().toLowerCase() === "stock_item")
          .map((row) => ({
            id: Number(row.product_id ?? row.id ?? row.inventory_id ?? 0),
            name: String(row.product_name ?? row.name ?? "Unnamed Product"),
            category: String(row.category ?? "Uncategorized"),
          }))
          .filter((option) => option.id > 0)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (error) {
      console.error("Failed to load products:", error);
      onErrorRef.current("Failed to load products. Please try refreshing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Use the categories from Settings. If there are none, use the ones already on the items.
  const categories = apiCategories.length > 0
    ? apiCategories
    : [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return { items, categories, ingredientOptions, loading, reload };
}

/* ────────────────────────────────────────────────────────────────────────────
   Shared UI
   ──────────────────────────────────────────────────────────────────────── */

type Variant = "solid" | "outline" | "ghost" | "danger" | "dangerSolid";

const buttonStyles: Record<Variant, CSSProperties> = {
  solid: { color: "#fff", background: `linear-gradient(180deg, ${T.accent} 0%, ${T.accentDeep} 100%)`, border: `1px solid ${T.accentDeep}`, boxShadow: "0 1px 2px rgba(185,62,12,0.35), inset 0 1px 0 rgba(255,255,255,0.18)" },
  outline: { color: T.ink, background: T.surface, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(28,27,23,0.04)" },
  ghost: { color: T.muted, background: T.surfaceMuted, border: `1px solid ${T.line}` },
  danger: { color: T.bad, background: "transparent", border: "1px solid transparent" },
  dangerSolid: { color: "#fff", background: T.bad, border: `1px solid ${T.bad}`, boxShadow: "0 1px 2px rgba(194,59,46,0.35)" },
};

function Button({ variant = "outline", small, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded-xl font-semibold transition-all duration-150 hover:-translate-y-px hover:opacity-90 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D44D14]/40 ${small ? "px-2.5 py-1.5 text-[11.5px]" : "px-4 py-2.5 text-[12.5px]"}`}
      style={{ fontFamily: FONT, cursor: props.disabled ? "not-allowed" : "pointer", opacity: props.disabled ? 0.6 : 1, ...buttonStyles[variant], ...style }}
    />
  );
}

const inputClass = "w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all box-border";
const inputStyle: CSSProperties = { color: T.ink, background: T.surfaceMuted, border: `1.5px solid ${T.line}`, fontFamily: FONT };
const focusRing = (e: FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = T.accent;
  e.currentTarget.style.boxShadow = `0 0 0 4px ${T.accentSoft}`;
  e.currentTarget.style.background = T.surface;
};
const blurRing = (e: FocusEvent<HTMLElement>) => {
  e.currentTarget.style.borderColor = T.line;
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.background = T.surfaceMuted;
};
const inputProps = { className: inputClass, style: inputStyle, onFocus: focusRing, onBlur: blurRing };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold" style={{ color: T.muted }}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input {...inputProps} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

// Numbers only (no minus sign, no letters). `decimal` allows one dot.
function cleanNumber(raw: string, decimal: boolean) {
  const digits = raw.replace(decimal ? /[^\d.]/g : /[^\d]/g, "");
  if (!decimal) return digits;
  const [whole, ...rest] = digits.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

function NumberInput({ label, value, onChange, placeholder, decimal = true }: { label?: string; value: string; onChange: (value: string) => void; placeholder?: string; decimal?: boolean }) {
  const input = (
    <input
      {...inputProps}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(cleanNumber(e.target.value, decimal))}
    />
  );
  return label ? <Field label={label}>{input}</Field> : input;
}

function Modal({ title, eyebrow, onClose, footer, children }: { title: string; eyebrow?: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  // Close with the Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}
      className="fixed inset-0 z-[400] flex items-center justify-center p-5 backdrop-blur-md"
      style={{ background: "rgba(20,28,23,0.45)", fontFamily: FONT }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}
        className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl"
        style={{ background: T.surface, boxShadow: SHADOW.modal, border: `1px solid ${T.line}` }}
      >
        <div className="flex items-start justify-between px-7 py-5" style={{ borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surface} 0%, ${T.surfaceMuted} 100%)` }}>
          <div>
            {eyebrow && <p className="mb-0.5 text-[11px] font-semibold" style={{ color: T.accent }}>{eyebrow}</p>}
            <h3 className="text-[18px] font-semibold tracking-tight" style={{ color: T.ink }}>{title}</h3>
          </div>
          <button
            onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[18px] leading-none transition-colors hover:brightness-95"
            style={{ color: T.muted, background: T.surface, border: `1px solid ${T.line}`, cursor: "pointer" }}
          >
            {"\u00D7"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-7 py-4" style={{ borderTop: `1px solid ${T.line}`, background: T.surfaceMuted }}>
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

const sectionTitle = "mb-3 mt-6 text-[12px] font-semibold first:mt-0";

function StatusBadge({ unavailable }: { unavailable: boolean }) {
  const color = unavailable ? T.bad : T.good;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ color, background: unavailable ? T.badSoft : T.goodSoft, boxShadow: `inset 0 0 0 1px ${color}22` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} />
      {unavailable ? "Unavailable" : "Available"}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Summary cards and side panel
   ──────────────────────────────────────────────────────────────────────── */

const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" } as const;
const STAT_ICONS = {
  grid: (c: string) => (<svg {...svgProps}><rect x="3" y="3" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /><rect x="13" y="3" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /><rect x="3" y="13" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /><rect x="13" y="13" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /></svg>),
  tag: (c: string) => (<svg {...svgProps}><path d="M12.5 3H5a2 2 0 0 0-2 2v7.5a2 2 0 0 0 .59 1.41l8.5 8.5a2 2 0 0 0 2.82 0l7.5-7.5a2 2 0 0 0 0-2.82l-8.5-8.5A2 2 0 0 0 12.5 3Z" stroke={c} strokeWidth="2" strokeLinejoin="round" /><circle cx="8" cy="8" r="1.5" fill={c} /></svg>),
  alert: (c: string) => (<svg {...svgProps}><path d="M12 9v4" stroke={c} strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16.2" r="0.9" fill={c} /><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3l-7.7-13.3a2 2 0 0 0-3.4 0Z" stroke={c} strokeWidth="2" strokeLinejoin="round" /></svg>),
  wallet: (c: string) => (<svg {...svgProps}><rect x="3" y="6" width="18" height="13" rx="2.5" stroke={c} strokeWidth="2" /><path d="M3 10h18" stroke={c} strokeWidth="2" /><path d="M16.5 14.5h2" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>),
};

type Tone = "neutral" | "accent" | "deep" | "warn" | "bad";
const TONES: Record<Tone, { color: string; soft: string }> = {
  neutral: { color: T.ink, soft: T.surfaceMuted },
  accent: { color: T.accent, soft: T.accentSoft },
  deep: { color: T.deep, soft: T.deepSoft },
  warn: { color: T.warn, soft: T.warnSoft },
  bad: { color: T.bad, soft: T.badSoft },
};

const cardStyle: CSSProperties = { background: T.surface, border: `1px solid ${T.line}`, boxShadow: SHADOW.card };

// `featured` renders the one hero card in deep green; the rest stay quiet
function StatCard({ label, value, meta, tone, icon, featured }: { label: string; value: number | string; meta: string; tone: Tone; icon: keyof typeof STAT_ICONS; featured?: boolean }) {
  const { color, soft } = TONES[tone];
  return (
    <div
      className="rounded-2xl p-5"
      style={featured
        ? { background: `linear-gradient(145deg, ${T.deepAlt} 0%, ${T.deep} 100%)`, border: `1px solid ${T.deep}`, boxShadow: "0 14px 30px -14px rgba(26,58,42,0.6)" }
        : cardStyle}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] font-medium" style={{ color: featured ? "rgba(255,255,255,0.7)" : T.muted }}>{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: featured ? "rgba(255,255,255,0.12)" : soft }}>
          {STAT_ICONS[icon](featured ? "#fff" : color)}
        </span>
      </div>
      <div className="text-[26px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: featured ? "#fff" : color }}>{value}</div>
      <div className="mt-2.5 text-[11.5px]" style={{ color: featured ? "rgba(255,255,255,0.65)" : T.muted }}>{meta}</div>
    </div>
  );
}

function AttentionList({ items }: { items: MenuItem[] }) {
  return (
    <div className="rounded-2xl p-5" style={cardStyle}>
      <div className="text-[14px] font-semibold tracking-tight" style={{ color: T.ink }}>Needs attention</div>
      <div className="mb-4 mt-0.5 text-[12px]" style={{ color: T.muted }}>
        {items.length > 0 ? "Items customers can't order right now" : "Everything is available"}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl px-3 py-6 text-center text-[12px]" style={{ color: T.muted, background: T.surfaceMuted }}>No stock issues to review.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl px-3 py-2.5" style={{ background: T.surfaceMuted, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.bad}` }}>
              <div className="truncate text-[12.5px] font-semibold" style={{ color: T.ink }}>{item.name}</div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: T.muted }}>
                {item.hasRecipe ? `${sellableQuantity(item)} servings available` : `${item.stock} ${item.unit} in stock`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Add / edit form (one component for both)
   ──────────────────────────────────────────────────────────────────────── */

interface FormValues {
  name: string; category: string; price: string; stock: string; description: string;
  overrideMode: ManualOverrideMode; ingredients: IngredientInput[];
  isPromotional: boolean; promoPrice: string; promoLabel: string;
}

const EMPTY_FORM: FormValues = {
  name: "", category: "", price: "", stock: "0", description: "", overrideMode: "Auto", ingredients: [],
  isPromotional: false, promoPrice: "", promoLabel: "",
};

const formFromItem = (item: MenuItem): FormValues => ({
  name: item.name, category: item.category, price: item.price, stock: String(item.stock), description: item.description,
  overrideMode: item.overrideMode, ingredients: item.ingredients,
  isPromotional: item.isPromotional, promoPrice: item.promoPrice, promoLabel: item.promoLabel,
});

function MenuFormModal({ item, categories, ingredientOptions, toast, onClose, onSaved }: {
  item: MenuItem | null; // null means "add a new item"
  categories: string[];
  ingredientOptions: IngredientOption[];
  toast: Toast;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = item !== null;
  const [values, setValues] = useState<FormValues>(item ? formFromItem(item) : EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(item && item.image !== PLACEHOLDER_IMG ? item.image : "");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<FormValues>) => setValues((current) => ({ ...current, ...patch }));

  // The current category is always selectable, even if Settings no longer lists it
  const categoryOptions = values.category && !categories.includes(values.category) ? [values.category, ...categories] : categories;

  const updateIngredient = (index: number, patch: Partial<IngredientInput>) =>
    set({ ingredients: values.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  const pickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  async function submit() {
    const warn = (message: string) => toast(message, "warning");
    const price = Number(values.price);
    const promoPrice = values.isPromotional && values.promoPrice.trim() ? Number(values.promoPrice) : null;
    const stock = Number(values.stock || 0);

    if (!values.name.trim() || !values.category.trim() || !values.price.trim()) return warn("Please fill in Name, Category, and Price.");
    if (!Number.isFinite(price) || price < 1) return warn("Price must be at least \u20B11.");
    if (promoPrice !== null && (!Number.isFinite(promoPrice) || promoPrice < 1)) return warn("Promo price must be at least \u20B11.");
    if (isEdit && !item.hasRecipe && (!Number.isFinite(stock) || stock < 0)) return warn("Stock quantity cannot be negative.");

    try {
      setSaving(true);
      const ingredients = buildIngredientPayload(values.ingredients);

      let image: string | undefined;
      if (imageFile) image = await uploadProductImage(imageFile);
      else if (isEdit && imagePreview) image = imagePreview;

      const shared = {
        name: values.name.trim(),
        category: values.category.trim(),
        item_type: "menu_item",
        price,
        description: values.description.trim() || null,
        ...toOverridePayload(values.overrideMode),
        override_mode: values.overrideMode,
        is_promotional: values.isPromotional,
        promo_price: promoPrice,
        promo_label: values.isPromotional ? values.promoLabel.trim() || null : null,
        ingredients,
      };

      if (isEdit) {
        const payload: Record<string, unknown> = { ...shared, unit: item.unit || DEFAULT_UNIT };
        const usesRecipe = item.hasRecipe || ingredients.length > 0;
        if (!usesRecipe && stock !== item.stock) payload.quantity = stock; // only send stock if it changed
        if (image) payload.image = image;
        await tryEndpoints([`/products/${item.rawProductId ?? item.id}`], "PUT", payload);
        toast(`"${shared.name}" updated successfully.`, "success");
      } else {
        await api.post("/products", { ...shared, unit: DEFAULT_UNIT, quantity: 0, image: image ?? PLACEHOLDER_IMG });
        toast(`"${shared.name}" added successfully.`, "success");
      }
      onSaved();
    } catch (error) {
      toast(`${isEdit ? "Failed to update" : "Failed to add product"}: ${errorText(error)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow={isEdit ? `Menu code ${item.menuCode}` : "New menu item"}
      title={isEdit ? `Edit ${item.name}` : "Add menu item"}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Discard</Button>
        <Button variant="solid" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save changes" : "Add menu item"}
        </Button>
      </>}
    >
      <p className={sectionTitle} style={{ color: T.ink }}>Details</p>
      <TextInput label="Name *" placeholder="e.g. Chicken Breast" value={values.name} onChange={(name) => set({ name })} />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <Field label="Category *">
          <select {...inputProps} value={values.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Select category</option>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </Field>
        <NumberInput label={"Price (\u20B1) *"} placeholder="0.00" value={values.price} onChange={(price) => set({ price })} />
      </div>
      {isEdit && (
        item.hasRecipe ? (
          <Field label="Available servings (from ingredients)">
            <div className={inputClass} style={inputStyle} aria-readonly="true">{Number(item.availableServings ?? 0)}</div>
          </Field>
        ) : (
          <NumberInput label="Stock quantity" placeholder="0" value={values.stock} onChange={(stock) => set({ stock })} />
        )
      )}
      <Field label="Description (optional)">
        <textarea
          {...inputProps}
          className={`${inputClass} resize-none`}
          rows={2}
          placeholder="Brief description..."
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      <p className={sectionTitle} style={{ color: T.ink }}>Availability</p>
      <div className="grid grid-cols-3 gap-2">
        {OVERRIDE_MODES.map((mode) => {
          const active = values.overrideMode === mode;
          return (
            <button
              key={mode} type="button" onClick={() => set({ overrideMode: mode })}
              className="rounded-xl px-3 py-2 text-[11.5px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A3A2A]/40"
              style={{
                fontFamily: FONT, cursor: "pointer", border: "1px solid",
                background: active ? T.deep : T.surfaceMuted,
                borderColor: active ? T.deep : T.line,
                color: active ? "#fff" : T.muted,
                boxShadow: active ? "0 6px 14px -8px rgba(26,58,42,0.7)" : "none",
              }}
            >
              {mode}
            </button>
          );
        })}
      </div>
      {isEdit && <p className="mt-2 text-[11.5px]" style={{ color: T.muted }}>Current customer status: {item.availabilityStatus}</p>}

      <p className={sectionTitle} style={{ color: T.ink }}>Ingredients</p>
      <div className="space-y-2">
        {values.ingredients.length === 0 && (
          <p className="rounded-xl px-3 py-2.5 text-[11.5px]" style={{ color: T.muted, background: T.surfaceMuted, border: `1px dashed ${T.faint}` }}>
            No ingredients assigned. In Auto mode, this item is unavailable until at least one ingredient is configured.
          </p>
        )}
        {values.ingredients.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
            <select {...inputProps} value={row.productId} onChange={(e) => updateIngredient(index, { productId: e.target.value })}>
              <option value="">Select ingredient</option>
              {ingredientOptions.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.category})</option>)}
            </select>
            <NumberInput placeholder="Qty" value={row.quantityRequired} onChange={(quantityRequired) => updateIngredient(index, { quantityRequired })} />
            <Button variant="danger" small type="button" onClick={() => set({ ingredients: values.ingredients.filter((_, i) => i !== index) })}>Remove</Button>
          </div>
        ))}
        <Button variant="ghost" small type="button" onClick={() => set({ ingredients: [...values.ingredients, { productId: "", quantityRequired: "" }] })}>
          + Add ingredient
        </Button>
      </div>

      <p className={sectionTitle} style={{ color: T.ink }}>Promotion</p>
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-[12.5px]" style={{ color: T.ink }}>
        <input type="checkbox" checked={values.isPromotional} onChange={(e) => set({ isPromotional: e.target.checked })} style={{ accentColor: T.accent }} />
        Mark this item as promotional
      </label>
      {values.isPromotional && (
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <NumberInput label="Promo price" placeholder="0.00" value={values.promoPrice} onChange={(promoPrice) => set({ promoPrice })} />
          <TextInput label="Promo label" placeholder="e.g. Summer special" value={values.promoLabel} onChange={(promoLabel) => set({ promoLabel })} />
        </div>
      )}

      <p className={sectionTitle} style={{ color: T.ink }}>Photo</p>
      <label
        className="flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl transition-colors hover:brightness-[0.98]"
        style={{ border: `1.5px dashed ${T.faint}`, background: T.surfaceMuted, minHeight: imagePreview ? "auto" : 88 }}
      >
        {imagePreview ? (
          <img src={resolveAssetUrl(imagePreview)} alt="Preview" className="h-[140px] w-full object-cover" />
        ) : (
          <span className="py-7 text-center text-[12px]" style={{ color: T.muted }}>Click to upload an image (PNG or JPG, up to 5MB)</span>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
      </label>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Menu list
   ──────────────────────────────────────────────────────────────────────── */

type StatusFilter = "all" | "available" | "unavailable";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
];

const TABLE_COLUMNS = ["Item", "Category", "Price", "Availability", ""];
const controlStyle: CSSProperties = { color: T.ink, background: T.surface, border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(28,27,23,0.04)", fontFamily: FONT };

const rowHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = T.surfaceMuted; },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = "transparent"; },
};

function MenuAdminTab() {
  const { addNotification } = useNotifications();
  const toast: Toast = (label, type = "info") => addNotification({ id: `${Date.now()}-${Math.random()}`, label, type });
  const { items, categories, ingredientOptions, loading, reload } = useMenuAdmin((message) => toast(message, "error"));

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formTarget, setFormTarget] = useState<MenuItem | "new" | null>(null); // which item the form is open for
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const term = search.trim().toLowerCase();
  const visible = items.filter((item) =>
    (categoryFilter === "all" || item.category === categoryFilter) &&
    (statusFilter === "all" || (statusFilter === "unavailable") === isUnavailable(item)) &&
    (!term || [item.name, item.category, item.menuCode, item.promoLabel].some((text) => text.toLowerCase().includes(term))),
  );

  // Numbers for the summary cards
  const unavailableItems = items.filter(isUnavailable);
  const promoCount = items.filter((item) => item.isPromotional).length;
  const zeroStockCount = items.filter((item) => sellableQuantity(item) === 0).length;
  const menuValue = items.reduce((sum, item) => sum + priceNumber(item.price) * sellableQuantity(item), 0);
  const markedOutCount = items.filter((item) => item.availabilityStatus === "Out of Stock").length;

  async function toggleAvailability(item: MenuItem) {
    const next: ManualOverrideMode = item.overrideMode === "Auto" ? "Force Out of Stock" : "Auto";
    try {
      await tryEndpoints([`/products/${item.rawProductId ?? item.id}`], "PUT", { ...toOverridePayload(next), override_mode: next });
      await reload();
      toast(`"${item.name}" override set to ${next}.`, "success");
    } catch (error) {
      toast(`Failed to update availability: ${errorText(error)}`, "error");
    }
  }

  async function deleteItem(item: MenuItem) {
    const productId = item.rawProductId ?? item.id;
    const inventoryId = item.rawInventoryId;
    const endpoints = [`/products/${productId}`];
    if (inventoryId && inventoryId !== productId) endpoints.push(`/products/${inventoryId}`);
    endpoints.push(`/inventory/${productId}`);
    if (inventoryId && inventoryId !== productId) endpoints.push(`/inventory/${inventoryId}`);

    try {
      setDeleting(true);
      await tryEndpoints(endpoints, "DELETE");
      await reload();
      setDeleteTarget(null);
      toast("Product deleted successfully.", "success");
    } catch (error) {
      toast(`Failed to delete: ${errorText(error)}`, "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard featured label="Menu items" value={items.length} meta="Currently in the system" icon="grid" tone="deep" />
        <StatCard label="Promotional" value={promoCount} meta="Active special menus" icon="tag" tone={promoCount > 0 ? "accent" : "neutral"} />
        <StatCard label="Unavailable" value={markedOutCount} meta="Marked out of stock" icon="alert" tone={markedOutCount > 0 ? "warn" : "deep"} />
        <StatCard
          label="Menu value" value={formatPeso(menuValue)} icon="wallet" tone={zeroStockCount > 0 ? "bad" : "deep"}
          meta={`${zeroStockCount} item${zeroStockCount === 1 ? "" : "s"} with zero stock`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl px-3.5 transition-shadow focus-within:shadow-[0_0_0_4px_#FBEAE0]" style={controlStyle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" stroke={T.muted} strokeWidth="2" />
                <path d="M20 20L16.65 16.65" stroke={T.muted} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search menu items"
                placeholder="Search by name, code, category or promo"
                className="w-full bg-transparent py-2.5 text-[13px] outline-none" style={{ color: T.ink, fontFamily: FONT }}
              />
            </div>
            <select
              value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category"
              className="rounded-xl px-3 py-2.5 text-[12.5px] outline-none" style={controlStyle}
            >
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <div className="flex rounded-xl p-1" style={controlStyle}>
              {STATUS_FILTERS.map(({ value, label }) => {
                const active = statusFilter === value;
                return (
                  <button
                    key={value} onClick={() => setStatusFilter(value)}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all"
                    style={{
                      fontFamily: FONT, cursor: "pointer", border: "none",
                      background: active ? T.deep : "transparent",
                      color: active ? "#fff" : T.muted,
                      boxShadow: active ? "0 4px 10px -4px rgba(26,58,42,0.6)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Button onClick={() => void reload()} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</Button>
            <Button variant="solid" onClick={() => setFormTarget("new")}>+ Add menu item</Button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl" style={cardStyle}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr style={{ background: `linear-gradient(180deg, ${T.surfaceMuted} 0%, #F6F4EC 100%)`, borderBottom: `1px solid ${T.line}` }}>
                    {TABLE_COLUMNS.map((column, i) => (
                      <th key={i} className="px-4 py-3.5 text-left text-[11.5px] font-semibold" style={{ color: T.muted }}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [0, 1, 2, 3].map((row) => (
                      <tr key={row} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td colSpan={TABLE_COLUMNS.length} className="px-4 py-4">
                          <div className="h-12 animate-pulse rounded-xl" style={{ background: T.surfaceMuted }} />
                        </td>
                      </tr>
                    ))
                  ) : visible.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16 text-center">
                        <div className="text-[13.5px] font-semibold" style={{ color: T.ink }}>
                          {items.length === 0 ? "No menu items yet" : "No items match your filters"}
                        </div>
                        <div className="mt-1 text-[12px]" style={{ color: T.muted }}>
                          {items.length === 0 ? "Add your first menu item to get started." : "Try a different search, category or status."}
                        </div>
                      </td>
                    </tr>
                  ) : visible.map((item) => (
                    <tr key={item.id} className="transition-colors" style={{ borderBottom: `1px solid ${T.line}` }} {...rowHover}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-xl"
                            style={{ background: T.surfaceMuted, border: `1px solid ${T.line}`, boxShadow: SHADOW.raised }}
                          >
                            {item.image !== PLACEHOLDER_IMG
                              ? <img src={resolveAssetUrl(item.image)} alt={item.name} className="h-full w-full object-cover" />
                              : <span className="text-[13px] font-semibold" style={{ color: T.muted }}>{item.name.charAt(0).toUpperCase()}</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold" style={{ color: T.ink }}>{item.name}</div>
                            <div className="text-[11.5px]" style={{ color: T.muted }}>
                              <span className="font-medium tabular-nums" style={{ color: T.accent }}>{item.menuCode}</span>
                              {item.description && <span className="ml-2 inline-block max-w-[160px] truncate align-bottom">{item.description}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                          style={{ background: T.deepSoft, color: T.deep, boxShadow: `inset 0 0 0 1px ${T.deep}14` }}
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-[13px] font-semibold tabular-nums" style={{ color: T.ink }}>{formatPeso(priceNumber(item.price))}</div>
                        {item.isPromotional && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: T.accentSoft, color: T.accent }}>
                              {item.promoLabel || "Promo"}
                            </span>
                            {item.promoPrice && (
                              <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: T.accent }}>{formatPeso(priceNumber(item.promoPrice))}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge unavailable={isUnavailable(item)} />
                        <div className="mt-1.5 text-[11.5px]" style={{ color: T.muted }}>
                          {item.hasRecipe ? `${sellableQuantity(item)} servings` : `${item.stock} ${item.unit}`}
                          {item.overrideMode !== "Auto" && ` \u00B7 ${item.overrideMode}`}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" small onClick={() => setFormTarget(item)}>Edit</Button>
                          <Button variant="ghost" small onClick={() => void toggleAvailability(item)}>
                            {item.overrideMode === "Auto" ? "Force out" : "Set auto"}
                          </Button>
                          <Button variant="danger" small onClick={() => setDeleteTarget(item)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside style={{ height: "fit-content" }}>
          <AttentionList items={unavailableItems} />
        </aside>
      </div>

      {formTarget !== null && (
        <MenuFormModal
          item={formTarget === "new" ? null : formTarget}
          categories={categories} ingredientOptions={ingredientOptions} toast={toast}
          onClose={() => setFormTarget(null)}
          onSaved={() => { setFormTarget(null); void reload(); }}
        />
      )}

      {deleteTarget && (
        <Modal
          eyebrow="Confirm deletion" title="Delete menu item" onClose={() => setDeleteTarget(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="dangerSolid" onClick={() => void deleteItem(deleteTarget)} disabled={deleting}>
              {deleting ? "Deleting..." : "Yes, delete"}
            </Button>
          </>}
        >
          <p className="text-[13px] leading-relaxed" style={{ color: T.muted }}>
            Are you sure you want to delete <span className="font-semibold" style={{ color: T.ink }}>{deleteTarget.name}</span>? This action cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────── */

export default function Inventory() {
  const now = useNow();
  const [restaurantSettings, setRestaurantSettings] = useState(GENERAL_SETTINGS_DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    void fetchGeneralSettings().then((settings) => { if (!cancelled) setRestaurantSettings(settings); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: `radial-gradient(1200px 400px at 85% -10%, #FBEAE0 0%, transparent 60%), ${T.page}`, fontFamily: FONT }}
    >
      <Sidebar />
      <main className="tablet-shell flex-1">
        <motion.header
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="mb-7 flex flex-wrap items-start justify-between gap-4"
        >
          <div>
            <p className="mb-1 text-[12px] font-semibold" style={{ color: T.accent }}>Menu administration</p>
            <h1 className="text-[30px] font-semibold tracking-tight" style={{ color: T.ink, letterSpacing: "-0.02em" }}>Menu Management</h1>
            <p className="mt-1 max-w-[560px] text-[13px]" style={{ color: T.muted }}>
              Manage menu items, prices, categories, ingredients, promotions and availability.
            </p>
          </div>
          <UserIdentityBanner className="order-3 w-full sm:order-2 sm:w-auto" />
          <div className="flex select-none items-center gap-3 rounded-2xl px-4 py-2.5" style={cardStyle}>
            <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: T.deepSoft }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke={T.deep} strokeWidth="2" />
                <path d="M12 7v5l3.5 2" stroke={T.deep} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-col items-end">
              <p className="text-[15px] font-semibold tabular-nums" style={{ color: T.ink }}>
                {formatInSettingsTimezone(now, restaurantSettings, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <p className="mt-0.5 text-[11.5px]" style={{ color: T.muted }}>
                {formatInSettingsTimezone(now, restaurantSettings, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </motion.header>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.22 }}>
          <MenuAdminTab />
        </motion.div>
      </main>
    </div>
  );
}