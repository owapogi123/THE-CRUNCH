"use client";

import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
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

// ── Real-time clock hook ─────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const formatPeso = (value: number | string) =>
  formatCurrencyAmount(Number(value || 0));

// ── Types ─────────────────────────────────────────────────────────────

interface ApiInventoryRow {
  id?: number; product_id?: number; inventory_id?: number; item_type?: string; menu_code?: string;
  name?: string; product_name?: string; category?: string; image?: string; stock?: number;
  quantity?: number; price?: number | string; unit?: string; promo?: string; isRawMaterial?: number | boolean;
  description?: string; availability_status?: string; is_promotional?: number | boolean;
  promo_price?: number | string | null; promo_label?: string; dailyWithdrawn?: number; returned?: number;
  wasted?: number; soldToday?: number; manual_override?: number | boolean; manual_status?: string;
  ingredient_count?: number; available_servings?: number | string | null; ingredients?: MenuIngredientRow[];
}

// ── Notification helper ──────────────────────────────────────────────

function notify(
  addNotification: ReturnType<typeof useNotifications>["addNotification"],
  label: string,
  type: "success" | "error" | "warning" | "info" = "info",
) {
  addNotification({ id: `${Date.now()}-${Math.random()}`, label, type });
}

async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const response = await api.post<{ fileUrl: string }>(
    "/upload-product-image",
    formData,
  );
  const fileUrl = String(response?.fileUrl ?? "").trim();
  if (!fileUrl) {
    throw new Error("Product image upload did not return a file path");
  }
  return fileUrl;
}

// ── Design tokens ─────────────────────────────────────────────────────
// Warm dashboard palette built from the brand's own burnt-orange + forest
// green pairing (matches the Settings module), so this reads as "The Crunch
// Fairview" rather than a generic admin theme.

const T = {
  page: "#F6F4EE",
  surface: "#FFFFFF",
  surfaceMuted: "#FBFAF5",
  ink: "#1C1B17",
  muted: "#8C877C",
  faint: "#D6D1C4",
  line: "#EDE8DB",
  accent: "#D44D14",
  accentSoft: "#FBEAE0",
  deep: "#1A3A2A",
  deepSoft: "#E7EFE9",
  good: "#2F8F5B",
  goodSoft: "#EAF5EF",
  warn: "#B8791B",
  warnSoft: "#FAF1DE",
  bad: "#C23B2E",
  badSoft: "#FBEAE8",
};

const FONT = "Poppins, sans-serif";

// ── Shared UI ─────────────────────────────────────────────────────────

function SMModal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-5 backdrop-blur-sm"
      style={{ background: "rgba(28,27,23,0.38)", animation: "fadeIn 0.18s ease", fontFamily: FONT }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-[28px]"
        style={{
          background: T.surface,
          boxShadow: "0 30px 80px rgba(28,27,23,0.20)",
          animation: "slideUp 0.22s cubic-bezier(.4,0,.2,1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-7 py-5" style={{ borderBottom: `1px solid ${T.line}`, background: T.surfaceMuted }}>
          <div>
            {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: T.accent }}>{eyebrow}</p>}
            <h3 className="text-[16px] font-semibold" style={{ color: T.ink }}>{title}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border-none text-[16px] leading-none transition-colors" style={{ color: T.muted, background: T.surface }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.ink; e.currentTarget.style.background = T.line; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = T.surface; }}>
            {"\u00D7"}
          </button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-7 py-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-7 py-4" style={{ borderTop: `1px solid ${T.line}`, background: T.surfaceMuted }}>{footer}</div>}
      </div>
      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) scale(0.98) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.muted }}>{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all box-border";
const inputStyle: React.CSSProperties = { color: T.ink, background: T.surfaceMuted, border: `1.5px solid ${T.line}`, fontFamily: FONT };
function focusRing(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = T.accent;
  e.currentTarget.style.boxShadow = `0 0 0 4px ${T.accentSoft}`;
  e.currentTarget.style.background = T.surface;
}
function blurRing(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = T.line;
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.background = T.surfaceMuted;
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string }
function FormInput({ label, type, onChange, step, ...rest }: FormInputProps) {
  const isNumber = type === "number";
  const allowDecimal = !(step === 1 || step === "1");
  return (
    <FormGroup label={label}>
      <input
        className={inputClass} style={inputStyle} onFocus={focusRing} onBlur={blurRing}
        type={type} step={step} inputMode={isNumber ? (allowDecimal ? "decimal" : "numeric") : undefined}
        onChange={(event) => {
          if (!isNumber || !onChange) { onChange?.(event); return; }
          let cleaned = event.target.value.replace(/[^\d.]/g, "");
          if (!allowDecimal) {
            cleaned = cleaned.replace(/\./g, "");
          } else {
            const firstDot = cleaned.indexOf(".");
            if (firstDot >= 0) cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
          }
          event.target.value = cleaned;
          onChange(event);
        }}
        onKeyDown={(event) => {
          if (isNumber && (event.key === "-" || event.key === "+" || event.key === "e" || event.key === "E" || (!allowDecimal && event.key === "."))) {
            event.preventDefault();
          }
          rest.onKeyDown?.(event);
        }}
        {...rest}
      />
    </FormGroup>
  );
}

function ImageUploadField({ preview, onChange }: { preview: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <FormGroup label="Menu Item Image (optional)">
      <label
        className="flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl transition-all"
        style={{ border: `1.5px dashed ${T.faint}`, background: T.surfaceMuted, minHeight: preview ? "auto" : "88px" }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.accent)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.faint)}
      >
        {preview ? (
          <img src={resolveAssetUrl(preview)} alt="Preview" className="h-[130px] w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 py-7">
            <span className="text-[11px] font-medium" style={{ color: T.muted }}>Click to upload image</span>
            <span className="text-[10px]" style={{ color: T.faint }}>PNG, JPG up to 5MB</span>
          </div>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={onChange} />
      </label>
    </FormGroup>
  );
}

function SectionHeader({ title, sub, cta }: { title: string; sub: string; cta?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[17px] font-semibold" style={{ color: T.ink }}>{title}</div>
        <div className="mt-0.5 text-[12px]" style={{ color: T.muted }}>{sub}</div>
      </div>
      {cta}
    </div>
  );
}

function DataTable({ cols, rows, emptyHint }: { cols: string[]; rows: React.ReactNode[]; emptyHint: string }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${T.line}`, background: T.surface }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: T.surfaceMuted, borderBottom: `1px solid ${T.line}` }}>
            {cols.map((c) => (
              <th key={c} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.09em]" style={{ color: T.muted }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length}>
                <div className="py-14 text-center">
                  <div className="text-[13px] font-medium" style={{ color: T.muted }}>No records yet</div>
                  <div className="mt-1 text-[11px]" style={{ color: T.faint }}>{emptyHint}</div>
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

const STAT_ICONS = {
  grid: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /><rect x="13" y="3" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /><rect x="3" y="13" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /><rect x="13" y="13" width="8" height="8" rx="2" stroke={c} strokeWidth="2" /></svg>
  ),
  tag: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12.5 3H5a2 2 0 0 0-2 2v7.5a2 2 0 0 0 .59 1.41l8.5 8.5a2 2 0 0 0 2.82 0l7.5-7.5a2 2 0 0 0 0-2.82l-8.5-8.5A2 2 0 0 0 12.5 3Z" stroke={c} strokeWidth="2" strokeLinejoin="round" /><circle cx="8" cy="8" r="1.5" fill={c} /></svg>
  ),
  alert: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4" stroke={c} strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16.2" r="0.9" fill={c} /><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3l-7.7-13.3a2 2 0 0 0-3.4 0Z" stroke={c} strokeWidth="2" strokeLinejoin="round" /></svg>
  ),
  wallet: (c: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2.5" stroke={c} strokeWidth="2" /><path d="M3 10h18" stroke={c} strokeWidth="2" /><path d="M16.5 14.5h2" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
  ),
};

function StatCard({ label, value, meta, tone = "neutral", icon }: { label: string; value: number | string; meta?: string; tone?: "neutral" | "accent" | "deep" | "warn" | "bad"; icon: keyof typeof STAT_ICONS }) {
  const toneColor = { neutral: T.ink, accent: T.accent, deep: T.deep, warn: T.warn, bad: T.bad }[tone];
  const toneSoft = { neutral: T.surfaceMuted, accent: T.accentSoft, deep: T.deepSoft, warn: T.warnSoft, bad: T.badSoft }[tone];
  return (
    <div className="rounded-2xl p-6 transition-shadow hover:shadow-[0_10px_28px_rgba(28,27,23,0.08)]" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: T.muted }}>{label}</div>
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl" style={{ background: toneSoft }}>{STAT_ICONS[icon](toneColor)}</span>
      </div>
      <div className="font-mono text-[28px] font-semibold leading-none tabular-nums" style={{ color: toneColor }}>{value}</div>
      {meta && <div className="mt-2.5 text-[11.5px]" style={{ color: T.faint }}>{meta}</div>}
    </div>
  );
}

function CategoryBreakdown({ products }: { products: MgmtProduct[] }) {
  const palette = [T.accent, T.deep, T.warn, T.bad, "#6B7FD6", "#B98CCE"];
  const counts = new Map<string, number>();
  products.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const total = products.length || 1;
  let cumulative = 0;
  const stops = entries.map(([, count], i) => {
    const start = (cumulative / total) * 360;
    cumulative += count;
    const end = (cumulative / total) * 360;
    return `${palette[i % palette.length]} ${start}deg ${end}deg`;
  });
  const gradient = stops.length > 0 ? stops.join(", ") : `${T.line} 0deg 360deg`;

  return (
    <div className="rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="mb-4 text-[13px] font-semibold" style={{ color: T.ink }}>Category Breakdown</div>
      {entries.length === 0 ? (
        <div className="rounded-xl px-3 py-6 text-center text-[11.5px]" style={{ color: T.faint, background: T.surfaceMuted, border: `1px dashed ${T.line}` }}>No menu items yet.</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-[104px] w-[104px] flex-shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
            <div className="absolute inset-[16px] grid place-items-center rounded-full" style={{ background: T.surface }}>
              <div className="text-center">
                <div className="font-mono text-[18px] font-semibold leading-none" style={{ color: T.ink }}>{products.length}</div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.06em]" style={{ color: T.faint }}>items</div>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {entries.slice(0, 5).map(([name, count], i) => (
              <div key={name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: palette[i % palette.length] }} />
                <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: T.muted }}>{name}</span>
                <span className="font-mono text-[11.5px] font-semibold tabular-nums" style={{ color: T.ink }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDot({ tone }: { tone: "good" | "bad" }) {
  const color = tone === "good" ? T.good : T.bad;
  return <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: color }} />;
}

const ghostBtnClass = "border-none cursor-pointer font-medium text-[11.5px] rounded-lg px-2.5 py-1.5 transition-colors";
const dangerBtnStyle: React.CSSProperties = { color: T.bad, background: "transparent", fontFamily: FONT };
const ghostBtnStyle: React.CSSProperties = { color: T.muted, background: T.surfaceMuted, fontFamily: FONT };
const primaryBtnClass = "cursor-pointer font-semibold text-[12.5px] rounded-xl px-4 py-2.5 transition-all";
const outlineBtnStyle: React.CSSProperties = { color: T.ink, background: T.surface, border: `1px solid ${T.line}`, fontFamily: FONT };
const solidBtnStyle: React.CSSProperties = { color: "#fff", background: T.accent, border: `1px solid ${T.accent}`, fontFamily: FONT };

// ── Menu Management Tab ──────────────────────────────────────────────

interface MgmtProduct {
  id: number; rawProductId?: number; rawInventoryId?: number; menuCode: string; name: string;
  category: string; price: string; unit: string; stock: number; description?: string; image?: string;
  availabilityStatus: string; manualOverride: boolean; manualStatus: string; overrideMode: ManualOverrideMode;
  availableServings?: number | null; isPromotional: boolean; promoPrice?: string; promoLabel?: string;
  ingredients: MenuIngredientInput[];
}

interface MenuIngredientRow {
  product_id?: number; product_name?: string; quantity_required?: number | string; unit?: string;
  daily_withdrawn?: number | string; stock?: number | string;
}

interface MenuIngredientInput {
  productId: string; quantityRequired: string; productName?: string; unit?: string; stock?: number;
}

interface IngredientOption { id: number; name: string; category: string; unit: string; stock: number }

interface MenuCategoryRecord {
  category_id: number; name: string; display_order: number; is_active: boolean | number;
}

type ManualOverrideMode = "Auto" | "Force Available" | "Force Out of Stock";

const UNIT_OPTIONS = ["piece", "kg", "g", "liter", "ml", "bottle", "box"] as const;
const OVERRIDE_MODE_OPTIONS: ManualOverrideMode[] = ["Auto", "Force Available", "Force Out of Stock"];

async function tryPut(endpoints: string[], payload: object): Promise<void> {
  let lastErr: unknown;
  for (const ep of endpoints) {
    try {
      await apiCall(ep, { method: "PUT", body: payload });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404") && !msg.includes("HTTP 404")) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

function MenuAdminTab() {
  const { addNotification } = useNotifications();
  const [products, setProducts] = useState<MgmtProduct[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryRecord[]>([]);
  const [ingredientOptions, setIngredientOptions] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<MgmtProduct | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [fName, setFName] = useState(""); const [fCat, setFCat] = useState("");
  const [fPrice, setFPrice] = useState(""); const [fDesc, setFDesc] = useState("");
  const [fOverrideMode, setFOverrideMode] = useState<ManualOverrideMode>(OVERRIDE_MODE_OPTIONS[0]);
  const [fIngredients, setFIngredients] = useState<MenuIngredientInput[]>([]);
  const [fIsPromotional, setFIsPromotional] = useState(false);
  const [fPromoPrice, setFPromoPrice] = useState(""); const [fPromoLabel, setFPromoLabel] = useState("");
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState("");

  const [eName, setEName] = useState(""); const [eCat, setECat] = useState("");
  const [ePrice, setEPrice] = useState(""); const [eStock, setEStock] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eOverrideMode, setEOverrideMode] = useState<ManualOverrideMode>(OVERRIDE_MODE_OPTIONS[0]);
  const [eIngredients, setEIngredients] = useState<MenuIngredientInput[]>([]);
  const [eIsPromotional, setEIsPromotional] = useState(false);
  const [ePromoPrice, setEPromoPrice] = useState(""); const [ePromoLabel, setEPromoLabel] = useState("");
  const [eImageFile, setEImageFile] = useState<File | null>(null);
  const [eImagePreview, setEImagePreview] = useState("");

  const menuCategoryOptions = (() => {
    const apiOptions = menuCategories
      .filter((category) => category.is_active === true || category.is_active === 1)
      .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0) || a.name.localeCompare(b.name))
      .map((category) => category.name.trim())
      .filter(Boolean);
    if (apiOptions.length > 0) return apiOptions;

    const fallback = new Set<string>([
      "Menu Food", "Beverages", "Desserts", "Combo Meals", "Snacks", "Promotional Items",
      ...products.map((product) => product.category).filter(Boolean),
      fCat.trim(), eCat.trim(),
    ]);
    return Array.from(fallback).filter(Boolean).sort((a, b) => a.localeCompare(b));
  })();

  function toOverrideMode(manualOverride: unknown, manualStatus: unknown): ManualOverrideMode {
    const isManual =
      manualOverride === true || manualOverride === 1 ||
      String(manualOverride ?? "").trim().toLowerCase() === "true";
    if (!isManual) return "Auto";
    return String(manualStatus ?? "").trim().toLowerCase() === "out of stock"
      ? "Force Out of Stock" : "Force Available";
  }

  function toIngredientsInput(ingredients: MenuIngredientRow[] | undefined): MenuIngredientInput[] {
    return (ingredients ?? []).map((ingredient) => ({
      productId: String(ingredient.product_id ?? ""),
      quantityRequired: String(ingredient.quantity_required ?? ""),
      productName: ingredient.product_name,
      unit: ingredient.unit,
      stock: Number(ingredient.stock ?? 0),
    }));
  }

  function toOverridePayload(mode: ManualOverrideMode) {
    if (mode === "Force Available") return { manual_override: true, manual_status: "Available" };
    if (mode === "Force Out of Stock") return { manual_override: true, manual_status: "Out of Stock" };
    return { manual_override: false, manual_status: "Available" };
  }

  function buildIngredientPayload(inputs: MenuIngredientInput[]) {
    const sanitized = inputs
      .map((entry) => ({ productId: entry.productId.trim(), quantityRequired: entry.quantityRequired.trim() }))
      .filter((entry) => entry.productId.length > 0 || entry.quantityRequired.length > 0);

    for (const entry of sanitized) {
      if (!entry.productId || !entry.quantityRequired) {
        throw new Error("Each ingredient row needs both an ingredient and a required quantity.");
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

  function addIngredientRow(setter: Dispatch<SetStateAction<MenuIngredientInput[]>>) {
    setter((prev) => [...prev, { productId: "", quantityRequired: "" }]);
  }

  function updateIngredientRow(
    setter: Dispatch<SetStateAction<MenuIngredientInput[]>>,
    index: number,
    field: "productId" | "quantityRequired",
    value: string,
  ) {
    setter((prev) => prev.map((entry, rowIndex) => (rowIndex === index ? { ...entry, [field]: value } : entry)));
  }

  function removeIngredientRow(setter: Dispatch<SetStateAction<MenuIngredientInput[]>>, index: number) {
    setter((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  function renderOverrideButtons(value: ManualOverrideMode, onChange: (mode: ManualOverrideMode) => void) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {OVERRIDE_MODE_OPTIONS.map((option) => {
          const active = value === option;
          const style: React.CSSProperties = active
            ? { background: T.deep, borderColor: T.deep, color: "#fff", border: "1px solid", fontFamily: FONT }
            : { background: T.surfaceMuted, borderColor: T.line, color: T.muted, border: "1px solid", fontFamily: FONT };
          return (
            <button key={option} type="button" className="rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors" style={style} onClick={() => onChange(option)}>
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  function renderIngredientsEditor(value: MenuIngredientInput[], setter: Dispatch<SetStateAction<MenuIngredientInput[]>>) {
    return (
      <FormGroup label="Required Ingredients">
        <div className="space-y-2">
          {value.length === 0 && (
            <p className="rounded-xl px-3 py-2.5 text-[11px]" style={{ color: T.muted, background: T.surfaceMuted }}>No ingredients assigned. This menu item will fall back to the existing stock-based availability.</p>
          )}
          {value.map((ingredient, index) => (
            <div key={`${ingredient.productId}-${index}`} className="grid grid-cols-3 gap-2">
              <select className={inputClass} style={inputStyle} onFocus={focusRing} onBlur={blurRing} value={ingredient.productId}
                onChange={(e) => updateIngredientRow(setter, index, "productId", e.target.value)}>
                <option value="">Select ingredient</option>
                {ingredientOptions.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.category})</option>)}
              </select>
              <input className={inputClass} style={inputStyle} onFocus={focusRing} onBlur={blurRing} type="number" min="0" step="0.01" placeholder="Qty required"
                value={ingredient.quantityRequired} onChange={(e) => updateIngredientRow(setter, index, "quantityRequired", e.target.value)} />
              <button type="button" className={ghostBtnClass} style={dangerBtnStyle} onClick={() => removeIngredientRow(setter, index)}>Remove</button>
            </div>
          ))}
          <button type="button" className={ghostBtnClass} style={ghostBtnStyle} onClick={() => addIngredientRow(setter)}>+ Add Ingredient</button>
        </div>
      </FormGroup>
    );
  }

  function renderProductForm(cfg: {
    name: string; setName: (v: string) => void; cat: string; setCat: (v: string) => void;
    price: string; setPrice: (v: string) => void; stock?: string; setStock?: (v: string) => void;
    overrideMode: ManualOverrideMode; setOverrideMode: (m: ManualOverrideMode) => void;
    ingredients: MenuIngredientInput[]; setIngredients: Dispatch<SetStateAction<MenuIngredientInput[]>>;
    isPromotional: boolean; setIsPromotional: (v: boolean) => void;
    promoPrice: string; setPromoPrice: (v: string) => void; promoLabel: string; setPromoLabel: (v: string) => void;
    desc: string; setDesc: (v: string) => void;
    imagePreview: string; onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void; note?: string;
  }) {
    return (
      <>
        <FormInput label="Menu Item Name *" placeholder="e.g. Chicken Breast" value={cfg.name} onChange={(e) => cfg.setName(e.target.value)} />
        <FormGroup label="Category *">
          <select className={inputClass} style={inputStyle} onFocus={focusRing} onBlur={blurRing} value={cfg.cat} onChange={(e) => cfg.setCat(e.target.value)}>
            <option value="">Select category</option>
            {menuCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </FormGroup>
        {cfg.setStock ? (
          <div className="grid grid-cols-2 gap-2.5">
            <FormInput label="Price (P) *" type="number" min={1} step="0.01" placeholder="0.00" value={cfg.price} onChange={(e) => cfg.setPrice(e.target.value)} />
            <FormInput label="Stock Qty" type="number" min={0} step="0.01" placeholder="0" value={cfg.stock} onChange={(e) => cfg.setStock!(e.target.value)} />
          </div>
        ) : (
          <FormInput label="Price (P) *" type="number" min={1} step="0.01" placeholder="0.00" value={cfg.price} onChange={(e) => cfg.setPrice(e.target.value)} />
        )}
        <FormGroup label="Availability Mode">
          {renderOverrideButtons(cfg.overrideMode, cfg.setOverrideMode)}
          {cfg.note && <p className="mt-2 text-[11px]" style={{ color: T.muted }}>{cfg.note}</p>}
        </FormGroup>
        {renderIngredientsEditor(cfg.ingredients, cfg.setIngredients)}
        <FormGroup label="Promotional Menu">
          <label className="flex items-center gap-2 text-[12px]" style={{ color: T.ink }}>
            <input type="checkbox" checked={cfg.isPromotional} onChange={(e) => cfg.setIsPromotional(e.target.checked)} />
            Mark this menu item as promotional
          </label>
        </FormGroup>
        {cfg.isPromotional && (
          <div className="grid grid-cols-2 gap-2.5">
            <FormInput label="Promo Price" type="number" min={1} step="0.01" placeholder="0.00" value={cfg.promoPrice} onChange={(e) => cfg.setPromoPrice(e.target.value)} />
            <FormInput label="Promo Label" placeholder="e.g. Summer Special" value={cfg.promoLabel} onChange={(e) => cfg.setPromoLabel(e.target.value)} />
          </div>
        )}
        <FormGroup label="Description (optional)">
          <textarea className={`${inputClass} resize-none`} style={inputStyle} onFocus={focusRing} onBlur={blurRing} rows={2} placeholder="Brief description..." value={cfg.desc} onChange={(e) => cfg.setDesc(e.target.value)} />
        </FormGroup>
        <ImageUploadField preview={cfg.imagePreview} onChange={cfg.onImageChange} />
      </>
    );
  }

  function normalizeManagementRows(data: ApiInventoryRow[]) {
    const rows = data.filter(
      (item) => String(item?.item_type ?? "menu_item").trim().toLowerCase() === "menu_item",
    );
    const groupedByName = new Map<string, ApiInventoryRow[]>();
    for (const item of rows) {
      const key = String(item?.product_name ?? item?.name ?? "").trim().toLowerCase();
      const group = groupedByName.get(key) ?? [];
      group.push(item);
      groupedByName.set(key, group);
    }
    return Array.from(groupedByName.values()).map((group) =>
      group.reduce((latest, current) => {
        const latestId = Number(latest?.product_id ?? latest?.id ?? latest?.inventory_id ?? 0);
        const currentId = Number(current?.product_id ?? current?.id ?? current?.inventory_id ?? 0);
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
      const menuCategoryData = await apiCall("/settings/menu-categories?activeOnly=1", { method: "GET" }).catch(() => []);
      const productData = Array.isArray(menuData) ? (menuData as ApiInventoryRow[]) : [];
      const inventoryData = Array.isArray(stockData) ? (stockData as ApiInventoryRow[]) : [];
      setMenuCategories(Array.isArray(menuCategoryData) ? (menuCategoryData as MenuCategoryRecord[]) : []);

      const allOptions = inventoryData
        .filter((item) => String(item?.item_type ?? "stock_item").trim().toLowerCase() === "stock_item")
        .map((item) => ({
          id: Number(item.product_id ?? item.id ?? item.inventory_id ?? 0),
          name: String(item.product_name ?? item.name ?? "Unnamed Product"),
          category: String(item.category ?? "Uncategorized"),
          unit: String(item.unit ?? "piece"),
          stock: Number(item.stock ?? item.quantity ?? item.dailyWithdrawn ?? 0),
        }))
        .filter((item) => item.id > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      setIngredientOptions(allOptions);

      const normalized = normalizeManagementRows(productData);
      setProducts(
        normalized.map((item) => ({
          id: Number(item.product_id ?? item.inventory_id ?? item.id ?? 0),
          rawProductId: item.product_id ? Number(item.product_id) : undefined,
          rawInventoryId: item.inventory_id ? Number(item.inventory_id) : undefined,
          menuCode: String(item.menu_code ?? `M-${String(item.product_id ?? item.id ?? item.inventory_id ?? 0).padStart(3, "0")}`),
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
          overrideMode: toOverrideMode(item.manual_override, item.manual_status),
          availableServings:
            item.available_servings === null || item.available_servings === undefined || String(item.available_servings) === ""
              ? null : Number(item.available_servings),
          isPromotional: Boolean(Number(item.is_promotional ?? 0)),
          promoPrice:
            item.promo_price !== null && item.promo_price !== undefined && String(item.promo_price) !== ""
              ? String(item.promo_price) : "",
          promoLabel: String(item.promo_label ?? ""),
          ingredients: toIngredientsInput(item.ingredients),
        })),
      );
    } catch (error) {
      console.error("Failed to load products:", error);
      notify(addNotification, "Failed to load products. Please try refreshing.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProducts(); }, []);

  function resetAddForm() {
    setFName(""); setFCat(""); setFPrice(""); setFDesc("");
    setFOverrideMode(OVERRIDE_MODE_OPTIONS[0]);
    setFIngredients([]);
    setFIsPromotional(false); setFPromoPrice(""); setFPromoLabel("");
    setFImageFile(null); setFImagePreview("");
  }

  function openEdit(product: MgmtProduct) {
    setEditProduct(product);
    setEName(product.name); setECat(product.category); setEPrice(product.price);
    setEStock(String(product.stock)); setEDesc(product.description ?? "");
    setEOverrideMode(product.overrideMode);
    setEIngredients(product.ingredients);
    setEIsPromotional(Boolean(product.isPromotional));
    setEPromoPrice(product.promoPrice ?? ""); setEPromoLabel(product.promoLabel ?? "");
    setEImageFile(null);
    setEImagePreview(product.image && product.image !== "/img/placeholder.jpg" ? product.image : "");
  }

  async function handleAdd() {
    if (!fName.trim() || !fCat.trim() || !fPrice.trim()) {
      notify(addNotification, "Please fill in Name, Category, and Price.", "warning");
      return;
    }
    const parsedPrice = Number(fPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      notify(addNotification, "Price must be at least \u20B11.", "warning");
      return;
    }
    if (fIsPromotional && fPromoPrice.trim()) {
      const parsedPromoPrice = Number(fPromoPrice);
      if (!Number.isFinite(parsedPromoPrice) || parsedPromoPrice < 1) {
        notify(addNotification, "Promo price must be at least \u20B11.", "warning");
        return;
      }
    }
    try {
      setSaving(true);
      let imageUrl = "/img/placeholder.jpg";
      if (fImageFile) imageUrl = await uploadProductImage(fImageFile);
      const ingredients = buildIngredientPayload(fIngredients);
      const manualOverridePayload = toOverridePayload(fOverrideMode);

      await api.post("/products", {
        name: fName.trim(), category: fCat.trim(), item_type: "menu_item",
        price: parsedPrice, unit: UNIT_OPTIONS[0], quantity: 0,
        description: fDesc.trim() || null, image: imageUrl,
        ...manualOverridePayload, override_mode: fOverrideMode,
        is_promotional: fIsPromotional,
        promo_price: fIsPromotional && fPromoPrice.trim() ? Number(fPromoPrice) : null,
        promo_label: fIsPromotional ? fPromoLabel.trim() || null : null,
        ingredients,
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
    const parsedPrice = Number(ePrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      notify(addNotification, "Price must be at least \u20B11.", "warning");
      return;
    }
    const parsedStock = Number(eStock || 0);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      notify(addNotification, "Stock quantity cannot be negative.", "warning");
      return;
    }
    if (eIsPromotional && ePromoPrice.trim()) {
      const parsedPromoPrice = Number(ePromoPrice);
      if (!Number.isFinite(parsedPromoPrice) || parsedPromoPrice < 1) {
        notify(addNotification, "Promo price must be at least \u20B11.", "warning");
        return;
      }
    }
    try {
      setSaving(true);
      let editImageUrl: string | undefined;
      if (eImageFile) {
        editImageUrl = await uploadProductImage(eImageFile);
      } else if (eImagePreview && eImagePreview !== "/img/placeholder.jpg") {
        editImageUrl = eImagePreview;
      }
      const payload: Record<string, unknown> = {
        name: eName.trim(), category: eCat.trim(), item_type: "menu_item",
        price: parsedPrice, unit: editProduct.unit || UNIT_OPTIONS[0], quantity: parsedStock,
        description: eDesc.trim() || null,
        ...toOverridePayload(eOverrideMode), override_mode: eOverrideMode,
        is_promotional: eIsPromotional,
        promo_price: eIsPromotional && ePromoPrice.trim() ? Number(ePromoPrice) : null,
        promo_label: eIsPromotional ? ePromoLabel.trim() || null : null,
        ingredients: buildIngredientPayload(eIngredients),
      };
      if (editImageUrl) payload.image = editImageUrl;

      await tryPut([`/products/${editProduct.rawProductId ?? editProduct.id}`], payload);
      await loadProducts();
      setEditProduct(null);
      notify(addNotification, `"${eName.trim()}" updated successfully.`, "success");
    } catch (error) {
      notify(addNotification, `Failed to update: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
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
      notify(addNotification, `Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvailabilityToggle(product: MgmtProduct) {
    const nextMode: ManualOverrideMode = product.overrideMode === "Auto" ? "Force Out of Stock" : "Auto";
    try {
      await tryPut([`/products/${product.rawProductId ?? product.id}`], {
        ...toOverridePayload(nextMode), override_mode: nextMode,
      });
      await loadProducts();
      notify(addNotification, `"${product.name}" override set to ${nextMode}.`, "success");
    } catch (error) {
      notify(addNotification, `Failed to update availability: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
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
  const hiddenCount = products.filter((product) => product.availabilityStatus === "Out of Stock").length;
  const promoCount = products.filter((product) => product.isPromotional).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const attentionItems = products
    .filter((product) => product.stock === 0 || product.availabilityStatus === "Out of Stock")
    .slice(0, 5);

  return (
    <div className="rounded-[28px] p-8" style={{ background: T.surface, border: `1px solid ${T.line}`, fontFamily: FONT }}>
      <div className="mb-7">
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: T.accent }}>Menu Administration</p>
        <h2 className="text-[21px] font-semibold" style={{ color: T.ink }}>Menu Management</h2>
        <p className="mt-1 text-[13px]" style={{ color: T.muted }}>
          Add, edit, hide, promote, and maintain menu items, prices, categories, descriptions, images, ingredients, and availability.
        </p>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <StatCard label="Total Menu Items" value={products.length} meta="Currently in system" icon="grid" tone="deep" />
        <StatCard label="Promotional" value={promoCount} meta="Active special menus" tone={promoCount > 0 ? "accent" : "neutral"} icon="tag" />
        <StatCard label="Unavailable" value={hiddenCount} meta="Marked out of stock" tone={hiddenCount > 0 ? "warn" : "deep"} icon="alert" />
        <StatCard label="Menu Value" value={formatPeso(totalValue)} meta={`${outOfStockCount} item${outOfStockCount === 1 ? "" : "s"} with zero stock`} tone={outOfStockCount > 0 ? "bad" : "deep"} icon="wallet" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <SectionHeader
            title="Menu Item List"
            sub="Menu codes, pricing, promotions, and admin-controlled availability in one place"
            cta={
              <div className="flex gap-2">
                <button className={primaryBtnClass} style={outlineBtnStyle} onClick={() => void loadProducts()} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
                <button className={primaryBtnClass} style={solidBtnStyle} onClick={() => setShowAdd(true)}>+ Add Menu Item</button>
              </div>
            }
          />

          <div className="mb-4 flex items-center gap-2 rounded-full px-4 py-1" style={{ background: T.surfaceMuted, border: `1.5px solid ${T.line}` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" stroke={T.faint} strokeWidth="2" />
              <path d="M20 20L16.65 16.65" stroke={T.faint} strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input className="w-full bg-transparent py-2 text-[13px] outline-none" style={{ color: T.ink, fontFamily: FONT }}
              placeholder="Search by menu code, name, category, or promo label..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <motion.div className="h-9 w-9 rounded-full border-[3px]" style={{ borderColor: T.line, borderTopColor: T.accent }}
                animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} />
              <p className="text-[13px]" style={{ color: T.muted }}>Loading menu items...</p>
            </div>
          ) : (
            <DataTable
              cols={["Menu Code", "Image", "Name", "Category", "Price", "Promo", "Status", "Actions"]}
              emptyHint="No menu items found. Try refreshing or add a new product."
              rows={filtered.map((product) => {
                const priceNum = parseFloat(String(product.price).replace(/[^0-9.]/g, ""));
                const promoNum = parseFloat(String(product.promoPrice ?? "").replace(/[^0-9.]/g, ""));
                const autoNote = product.ingredients.length > 0 ? "Auto from ingredients (per serving)" : "Auto from stock fallback";
                return (
                  <tr key={product.id} style={{ borderBottom: `1px solid ${T.line}` }} className="transition-colors last:border-b-0"
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceMuted)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-3.5 font-mono text-[12px] font-semibold tabular-nums" style={{ color: T.accent }}>{product.menuCode}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl" style={{ background: T.surfaceMuted, border: `1px solid ${T.line}` }}>
                        {product.image && product.image !== "/img/placeholder.jpg"
                          ? <img src={resolveAssetUrl(product.image)} alt={product.name} className="h-full w-full object-cover" />
                          : <span className="text-[13px] font-bold" style={{ color: T.faint }}>{product.name.charAt(0).toUpperCase()}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[12.5px] font-semibold" style={{ color: T.ink }}>{product.name}</div>
                      {product.description && <div className="max-w-[180px] truncate text-[11px]" style={{ color: T.muted }}>{product.description}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: T.deepSoft, color: T.deep }}>{product.category}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12.5px] font-semibold tabular-nums" style={{ color: T.ink }}>{formatPeso(priceNum)}</td>
                    <td className="px-4 py-3.5">
                      {product.isPromotional ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-block w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: T.accentSoft, color: T.accent }}>
                            {product.promoLabel || "Promotional"}
                          </span>
                          {product.promoPrice && <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: T.accent }}>{formatPeso(promoNum)}</span>}
                        </div>
                      ) : <span className="text-[12px]" style={{ color: T.faint }}>Standard</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <StatusDot tone={product.availabilityStatus === "Out of Stock" ? "bad" : "good"} />
                        <span className="text-[12px] font-medium" style={{ color: T.ink }}>{product.availabilityStatus}</span>
                      </div>
                      <div className="mt-1 text-[10px]" style={{ color: T.faint }}>{product.overrideMode === "Auto" ? autoNote : product.overrideMode}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1">
                        <button className={ghostBtnClass} style={ghostBtnStyle} onClick={() => openEdit(product)}>Edit</button>
                        <button className={ghostBtnClass} style={ghostBtnStyle} onClick={() => void handleAvailabilityToggle(product)}>
                          {product.overrideMode === "Auto" ? "Force Out" : "Set Auto"}
                        </button>
                        <button className={ghostBtnClass} style={dangerBtnStyle} onClick={() => setDeleteId(product.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            />
          )}
        </div>

        <aside className="flex flex-col gap-5" style={{ height: "fit-content" }}>
          <CategoryBreakdown products={products} />

          <div className="rounded-2xl p-5" style={{ background: T.surfaceMuted, border: `1px solid ${T.line}` }}>
            <div className="mb-1 text-[13px] font-semibold" style={{ color: T.ink }}>Needs Attention</div>
            <div className="mb-4 text-[11px]" style={{ color: T.muted }}>
              {attentionItems.length > 0 ? `${hiddenCount} item${hiddenCount === 1 ? "" : "s"} unavailable right now` : "Everything is available"}
            </div>
            {attentionItems.length === 0 ? (
              <div className="rounded-xl px-3 py-6 text-center text-[11.5px]" style={{ color: T.faint, background: T.surface, border: `1px dashed ${T.line}` }}>
                No stock issues to review.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {attentionItems.map((product) => {
                  const maxStock = Math.max(1, ...products.map((p) => p.stock));
                  const fillPct = Math.min(100, Math.round((product.stock / maxStock) * 100));
                  return (
                    <div key={product.id} className="rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold" style={{ color: T.ink }}>{product.name}</span>
                        <StatusDot tone="bad" />
                      </div>
                      <div className="mt-1 text-[10.5px]" style={{ color: T.muted }}>{product.stock} {product.unit} in stock</div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: T.line }}>
                        <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: T.bad }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {showAdd && (
        <SMModal
          eyebrow="New Record" title="Add Menu Item"
          onClose={() => { setShowAdd(false); resetAddForm(); }}
          footer={<>
            <button className={ghostBtnClass} style={ghostBtnStyle} onClick={() => { setShowAdd(false); resetAddForm(); }} disabled={saving}>Discard</button>
            <button className={primaryBtnClass} style={solidBtnStyle} onClick={() => void handleAdd()} disabled={saving}>{saving ? "Saving..." : "Add Menu Item"}</button>
          </>}
        >
          {renderProductForm({
            name: fName, setName: setFName, cat: fCat, setCat: setFCat, price: fPrice, setPrice: setFPrice,
            overrideMode: fOverrideMode, setOverrideMode: setFOverrideMode,
            ingredients: fIngredients, setIngredients: setFIngredients,
            isPromotional: fIsPromotional, setIsPromotional: setFIsPromotional,
            promoPrice: fPromoPrice, setPromoPrice: setFPromoPrice, promoLabel: fPromoLabel, setPromoLabel: setFPromoLabel,
            desc: fDesc, setDesc: setFDesc, imagePreview: fImagePreview,
            onImageChange: (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFImageFile(file);
              setFImagePreview(URL.createObjectURL(file));
            },
          })}
        </SMModal>
      )}

      {editProduct && (
        <SMModal
          eyebrow={`Menu Code ${editProduct.menuCode}`} title={`Edit Menu Item - ${editProduct.name}`}
          onClose={() => setEditProduct(null)}
          footer={<>
            <button className={ghostBtnClass} style={ghostBtnStyle} onClick={() => setEditProduct(null)} disabled={saving}>Discard</button>
            <button className={primaryBtnClass} style={solidBtnStyle} onClick={() => void handleEdit()} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
          </>}
        >
          {renderProductForm({
            name: eName, setName: setEName, cat: eCat, setCat: setECat, price: ePrice, setPrice: setEPrice,
            stock: eStock, setStock: setEStock,
            overrideMode: eOverrideMode, setOverrideMode: setEOverrideMode,
            ingredients: eIngredients, setIngredients: setEIngredients,
            isPromotional: eIsPromotional, setIsPromotional: setEIsPromotional,
            promoPrice: ePromoPrice, setPromoPrice: setEPromoPrice, promoLabel: ePromoLabel, setPromoLabel: setEPromoLabel,
            desc: eDesc, setDesc: setEDesc, imagePreview: eImagePreview,
            onImageChange: (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setEImageFile(file);
              setEImagePreview(URL.createObjectURL(file));
            },
            note: `Current customer status: ${editProduct.availabilityStatus}`,
          })}
        </SMModal>
      )}

      {deleteId !== null && (
        <SMModal
          eyebrow="Confirm Deletion" title="Delete Menu Item"
          onClose={() => setDeleteId(null)}
          footer={<>
            <button className={ghostBtnClass} style={ghostBtnStyle} onClick={() => setDeleteId(null)} disabled={saving}>Cancel</button>
            <button className={primaryBtnClass} style={{ ...solidBtnStyle, background: T.bad, borderColor: T.bad }} onClick={() => void handleDelete(deleteId!)} disabled={saving}>
              {saving ? "Deleting..." : "Yes, Delete"}
            </button>
          </>}
        >
          <p className="text-[13px] leading-relaxed" style={{ color: T.muted }}>
            Are you sure you want to delete{" "}
            <span className="font-semibold" style={{ color: T.ink }}>
              {products.find((product) => product.id === deleteId)?.name ?? "this menu item"}
            </span>
            ? This action cannot be undone.
          </p>
        </SMModal>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function Inventory() {
  const now = useNow();
  const [restaurantSettings, setRestaurantSettings] = useState(GENERAL_SETTINGS_DEFAULTS);
  useEffect(() => {
    let cancelled = false;
    void fetchGeneralSettings().then((settings) => {
      if (!cancelled) setRestaurantSettings(settings);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex min-h-screen" style={{ background: T.page, fontFamily: FONT }}>
      <Sidebar />
      <main className="tablet-shell flex-1">
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="mb-6 flex flex-wrap items-start justify-between gap-4"
        >
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: T.accent }}>
              Menu Administration
            </p>
            <h1 className="text-[32px] font-bold tracking-tight" style={{ color: T.ink }}>Menu Management</h1>
          </div>
          <UserIdentityBanner className="order-3 w-full sm:order-2 sm:w-auto" />
          <div className="flex select-none items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
            <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: T.deepSoft }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke={T.deep} strokeWidth="2" />
                <path d="M12 7v5l3.5 2" stroke={T.deep} strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-col items-end">
              <p className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: T.ink }}>
                {formatInSettingsTimezone(now, restaurantSettings, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: T.muted }}>
                {formatInSettingsTimezone(now, restaurantSettings, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.22 }}>
          <MenuAdminTab />
        </motion.div>
      </main>
    </div>
  );
}
