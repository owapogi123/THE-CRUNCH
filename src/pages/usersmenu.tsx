import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { useAuth } from "../context/authcontext";

// ─── SPRING PRESETS ───────────────────────────────────────────────────────────
const SP  = { type: "spring" as const, stiffness: 340, damping: 30 };
const SPG = { type: "spring" as const, stiffness: 200, damping: 24 };
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Nutrition { calories: number; protein: number; fats: number; carbs: number }

interface InventoryMenuRow {
  product_id?: number;
  id?: number;
  product_name?: string;
  name?: string;
  price?: number | string;
  category?: string;
  image?: string | null;
  mainStock?: number | string;
  stock?: number | string;
  availability_status?: string;
  isRawMaterial?: boolean | number;
}

interface Recipe {
  id:          number
  name:        string
  description: string
  image:       string
  nutrition:   Nutrition
  price:       number
  maxFlavors?: number
  mealTypes:   string[]
  tag?:        string
  note?:       string
  variant?:    "original" | "spicy"
  category:    string
  available:   boolean
}

interface CartItem          { recipe: Recipe; quantity: number; flavors: string[] }
interface CustomerOrderItem { name: string; quantity: number }
interface CustomerOrder {
  id: number; orderNumber: string; total: number; createdAt: string;
  orderType: string; rawStatus: string; trackingStatus: string;
  paymentReference: string | null; paymentStatus: string | null;
  paymentMethod: string; items: CustomerOrderItem[];
}
interface PaymentSessionState {
  checkoutSessionId: string; checkoutUrl: string; status: string;
  paid: boolean; paymentReference: string | null;
}
type PaymentMethodType = "gcash" | "cash";

const DEFAULT_NUTRITION: Nutrition = { calories: 0, protein: 0, fats: 0, carbs: 0 };

const normalizeName     = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizeCategory = (value: unknown) => String(value ?? "Uncategorized").trim().toUpperCase();
const isUnavailableStatus = (value: unknown) =>
  ["unavailable", "out of stock", "hidden"].includes(String(value ?? "").trim().toLowerCase());

function mapInventoryRecipes(
  inventoryRows: InventoryMenuRow[],
  menuItems: Recipe[],
  fallbackMealTypes: string[],
): Recipe[] {
  const deduped = new Map<string, InventoryMenuRow>();
  for (const row of inventoryRows ?? []) {
    if (row.isRawMaterial) continue;
    const key = normalizeName(row.product_name ?? row.name);
    if (!key) continue;
    const existing = deduped.get(key);
    if (!existing || Number(row.product_id ?? row.id ?? 0) > Number(existing.product_id ?? existing.id ?? 0)) {
      deduped.set(key, row);
    }
  }

  const menuMetaByName = new Map((menuItems ?? []).map((item) => [normalizeName(item.name), item]));
  const normalizedFallbackMeals = fallbackMealTypes.map((meal) => String(meal).trim().toLowerCase());

  return Array.from(deduped.values()).map((row) => {
    const id       = Number(row.product_id ?? row.id ?? 0);
    const name     = String(row.product_name ?? row.name ?? `Product #${id}`);
    const category = normalizeCategory(row.category);
    const menuMeta = menuMetaByName.get(normalizeName(name));
    const normalizedMetaMeals = (menuMeta?.mealTypes ?? []).map((meal) => String(meal).trim().toLowerCase());
    const hasSupportedMealType = normalizedMetaMeals.some((meal) => normalizedFallbackMeals.includes(meal));
    const available = !isUnavailableStatus(row.availability_status);

    return {
      id, name,
      price:       Number(row.price ?? menuMeta?.price ?? 0),
      category,
      image:       String(row.image || menuMeta?.image || "/placeholder.jpg"),
      available,
      description: menuMeta?.description || `Freshly prepared ${String(category).toLowerCase()} from The Crunch.`,
      nutrition:   menuMeta?.nutrition ?? DEFAULT_NUTRITION,
      maxFlavors:  menuMeta?.maxFlavors,
      mealTypes:   menuMeta?.mealTypes && menuMeta.mealTypes.length > 0 && hasSupportedMealType
                     ? menuMeta.mealTypes : fallbackMealTypes,
      tag:         menuMeta?.tag,
      note:        menuMeta?.note,
      variant:     menuMeta?.variant,
    };
  });
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DELIVERY_LINKS = {
  foodpanda: "https://foodpanda.go.link/9O718",
  grab:      "https://r.grab.com/g/6-20260421_220129_6e23187a089147b69736d4cacea38146_MEXMPS-2-C4A3RBCER7NFUE",
};
const PAYMENT_SESSION_KEY = "the-crunch-paymongo-session";
const CASH_TERMS = "By selecting Cash as your payment method, you agree that your order will not be processed immediately and will only be prepared once full payment is made onsite. You are responsible for completing payment at the store. Delays in payment may result in longer waiting times or possible cancellation of your order. The store reserves the right to refuse or cancel orders that are not paid within a reasonable time.";

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Bestseller: { bg: "rgba(245,200,66,0.15)",  text: "#f5c842" },
  Hot:        { bg: "rgba(239,68,68,0.14)",   text: "#ef4444" },
  "Fan Fave": { bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
  "Must Try": { bg: "rgba(139,92,246,0.12)",  text: "#a78bfa" },
};

const NAV_LINKS = [
  { label: "Home",  path: "/" },
  { label: "About", path: "/aboutthecrunch" },
  { label: "Menu",  path: "/usersmenu" },
];

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18, fill = "none", sw = "2" }: { d: string; size?: number; fill?: string; sw?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const historyD   = `<polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="1 4 3 6 5 4"/>`;
const receiptD   = `<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>`;
const chevronD   = `<polyline points="6 9 12 15 18 9"/>`;
const clipboardD = `<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>`;
const bagD       = `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>`;
const scooterD   = `<circle cx="5.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8 17.5h7"/><path d="M15 5h2l2 5H9l1-5h3"/><path d="M12 5v5"/>`;
const externalD  = `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`;
const cashD      = `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>`;
const gcashD     = `<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 10v4M10 12h4"/><circle cx="12" cy="12" r="3"/>`;
const shieldD    = `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`;
const userD      = `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`;

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
function Avatar({ src, size = 40 }: { src: string; size?: number }) {
  const [err, setErr] = useState(false);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "1.5px solid rgba(240,237,232,0.1)", background: "#1a1208" }}>
      <img src={err ? "/placeholder.jpg" : src} alt="" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

function Tag({ tag }: { tag: string }) {
  const c = TAG_COLORS[tag];
  if (!c) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: c.bg, color: c.text, whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0, border: `1px solid ${c.text}28` }}>
      {tag}
    </span>
  );
}

function Pill({ label, active, onClick, accent = "#f5c842" }: { label: string; active: boolean; onClick?: () => void; accent?: string }) {
  return (
    <motion.button onClick={onClick} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
      style={{ padding: "6px 14px", borderRadius: 30, border: `1.5px solid ${active ? accent : "rgba(240,237,232,0.12)"}`, background: active ? `${accent}1a` : "rgba(240,237,232,0.04)", color: active ? accent : "rgba(240,237,232,0.55)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {label}
    </motion.button>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function RecipeSkeleton() {
  return (
    <div style={{ background: "#151210", borderRadius: 24, padding: "clamp(20px,4vw,32px) clamp(20px,4vw,36px)", border: "1px solid rgba(240,237,232,0.07)", display: "flex", flexWrap: "wrap", gap: "clamp(20px,4vw,40px)", alignItems: "flex-start", overflow: "hidden", position: "relative" }}>
      <motion.div animate={{ x: ["-100%", "200%"] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)", zIndex: 1 }} />
      <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ height: 22, width: "60%", borderRadius: 8, background: "rgba(255,255,255,0.06)" }} />
        <div style={{ height: 14, width: "90%", borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
        <div style={{ height: 14, width: "75%", borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: 40, width: 48, borderRadius: 8, background: "rgba(255,255,255,0.05)" }} />)}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div style={{ height: 40, width: 120, borderRadius: 12, background: "rgba(255,255,255,0.05)" }} />
          <div style={{ height: 40, width: 140, borderRadius: 12, background: "rgba(255,255,255,0.07)" }} />
        </div>
      </div>
      <div style={{ width: "clamp(120px,20vw,200px)", height: "clamp(120px,20vw,200px)", borderRadius: "50%", background: "rgba(255,255,255,0.05)", flexShrink: 0, alignSelf: "center" }} />
    </div>
  );
}

// ─── CASH TERMS MODAL ─────────────────────────────────────────────────────────
function CashTermsModal({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDecline}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 700, backdropFilter: "blur(14px)" }} />
      <motion.div initial={{ opacity: 0, scale: 0.92, y: 28 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ ...SPG, delay: 0.04 }}
        style={{ position: "fixed", top: "27%", left: "35%", transform: "translate(-50%,-50%)", zIndex: 800, width: "min(480px,92vw)", background: "#151210", borderRadius: 26, border: "1px solid rgba(240,237,232,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        <div style={{ height: 3, background: "linear-gradient(90deg,#f5c842,rgba(245,200,66,0.3))" }} />
        <div style={{ padding: "32px 28px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.22)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f5c842", flexShrink: 0 }}>
              <Icon d={shieldD} size={18} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#f5c842", letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 3px" }}>Cash Payment</p>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#f0ede8", margin: 0 }}>Terms & Conditions</h3>
            </div>
          </div>
          <div style={{ background: "rgba(240,237,232,0.03)", border: "1px solid rgba(240,237,232,0.08)", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: "rgba(240,237,232,0.62)", lineHeight: 1.78, margin: 0, fontWeight: 300 }}>{CASH_TERMS}</p>
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 22 }}>
            <div onClick={() => setChecked(v => !v)} style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checked ? "#f5c842" : "rgba(240,237,232,0.22)"}`, background: checked ? "rgba(245,200,66,0.12)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, cursor: "pointer", transition: "all 0.18s" }}>
              <AnimatePresence>{checked && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP} style={{ color: "#f5c842", fontSize: 12, fontWeight: 800 }}>✓</motion.span>}</AnimatePresence>
            </div>
            <span style={{ fontSize: 12.5, color: "rgba(240,237,232,0.5)", lineHeight: 1.6 }}>I have read and agree to the Cash Payment Terms & Conditions.</span>
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <motion.button onClick={onDecline} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={SP}
              style={{ flex: 1, background: "rgba(240,237,232,0.05)", border: "1px solid rgba(240,237,232,0.12)", color: "rgba(240,237,232,0.5)", borderRadius: 12, padding: "13px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </motion.button>
            <motion.button onClick={() => checked && onAccept()} disabled={!checked} whileHover={checked ? { scale: 1.02 } : {}} whileTap={checked ? { scale: 0.97 } : {}} transition={SP}
              style={{ flex: 2, background: checked ? "#f5c842" : "rgba(245,200,66,0.18)", color: checked ? "#111" : "rgba(245,200,66,0.35)", border: "none", borderRadius: 12, padding: "13px 0", fontSize: 13, fontWeight: 700, cursor: checked ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}>
              I Agree & Continue
            </motion.button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ─── PAYMENT METHOD SELECTOR ──────────────────────────────────────────────────
function PaymentMethodSelector({ selected, onChange, disabled }: { selected: PaymentMethodType; onChange: (m: PaymentMethodType) => void; disabled?: boolean }) {
  const methods = [
    { id: "cash"  as const, label: "Cash",  sub: "Pay onsite at the store",  d: cashD,  rgb: "34,197,94"  },
    { id: "gcash" as const, label: "GCash", sub: "Pay now via GCash",        d: gcashD, rgb: "0,120,255"  },
  ];
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.3)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 10px" }}>Payment Method</p>
      <div style={{ background: "rgba(240,237,232,0.03)", border: "1px solid rgba(240,237,232,0.08)", borderRadius: 16, padding: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}>
        {methods.map(m => {
          const active = selected === m.id;
          return (
            <motion.button key={m.id} onClick={() => onChange(m.id)} whileTap={{ scale: 0.97 }} transition={SP}
              style={{ background: active ? `rgba(${m.rgb},0.1)` : "transparent", border: `1.5px solid ${active ? `rgba(${m.rgb},0.45)` : "transparent"}`, borderRadius: 11, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
              {active && <motion.div layoutId="payDot" transition={SPG} style={{ position: "absolute", top: 8, right: 10, width: 6, height: 6, borderRadius: "50%", background: `rgb(${m.rgb})` }} />}
              <span style={{ color: active ? `rgb(${m.rgb})` : "rgba(240,237,232,0.35)", display: "flex", alignItems: "center" }}><Icon d={m.d} size={20} /></span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: active ? "#f0ede8" : "rgba(240,237,232,0.45)", margin: "0 0 2px" }}>{m.label}</p>
                <p style={{ fontSize: 10.5, color: active ? `rgba(${m.rgb},0.7)` : "rgba(240,237,232,0.22)", margin: 0 }}>{m.sub}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {selected === "cash" && (
          <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 8 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={{ duration: 0.22, ease: EASE }} style={{ overflow: "hidden" }}>
            <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: "10px 13px", display: "flex", gap: 8 }}>
              <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💵</span>
              <p style={{ fontSize: 11.5, color: "rgba(34,197,94,0.75)", margin: 0, lineHeight: 1.6 }}>You will pay at the store. Your order will only be prepared once full payment is received onsite.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ORDER TYPE MODAL ─────────────────────────────────────────────────────────
function OrderTypeModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"choose" | "delivery">("choose");
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 500, backdropFilter: "blur(10px)" }} />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 16 }} transition={{ ...SPG, delay: 0.04 }}
        style={{ position: "fixed", top: "27%", left: "27%", transform: "translate(-50%,-50%)", zIndex: 600, width: "min(720px,92vw)" }}>
        <motion.button onClick={onClose} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} transition={SP}
          style={{ position: "absolute", top: -14, right: -14, width: 36, height: 36, borderRadius: "50%", background: "#1e1b17", border: "1px solid rgba(240,237,232,0.14)", color: "rgba(240,237,232,0.55)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, zIndex: 10, fontFamily: "inherit" }}>×</motion.button>
        <AnimatePresence mode="wait">
          {view === "choose" ? (
            <motion.div key="choose" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={SPG}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { icon: bagD,     title: "Pick-up Order",   desc: "Order online and pick up your items at the store when it's ready.", cta: "Browse the Menu",        action: onClose,                  ctaStyle: { background: "#f5c842", color: "#111" } },
                { icon: scooterD, title: "Delivery Order",  desc: "Order for delivery through Foodpanda or Grab.",                     cta: "Order via Delivery App", action: () => setView("delivery"), ctaStyle: { background: "rgba(249,159,4,0.07)", border: "1px solid rgba(240,237,232,0.12)", color: "rgb(215,162,71)" } },
              ].map(card => (
                <motion.button key={card.title} onClick={card.action} whileHover={{ borderColor: "rgba(245,200,66,0.45)", y: -4 }} whileTap={{ scale: 0.97 }} transition={SPG}
                  style={{ background: "#151210", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 24, padding: "36px 32px 32px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f5c842", marginBottom: 22 }}>
                    <Icon d={card.icon} size={28} sw="1.6" />
                  </div>
                  <p style={{ fontSize: "clamp(20px,3vw,35px)", fontWeight: 1000, color: "#f5c842", letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 8px" }}>{card.title}</p>
                  <p style={{ fontSize: 13, fontWeight: 400, color: "rgba(240,237,232,0.42)", lineHeight: 1.7, margin: "0 0 auto" }}>{card.desc}</p>
                  {card.title === "Delivery Order" && (
                    <div style={{ display: "flex", gap: 8, margin: "24px 0 28px" }}>
                      {[{ name: "FoodPanda", color: "#e91e8c", bg: "rgba(233,30,140,0.1)", border: "rgba(233,30,140,0.2)" }, { name: "Grab", color: "#00b14f", bg: "rgba(0,177,79,0.1)", border: "rgba(0,177,79,0.2)" }].map(p => (
                        <span key={p.name} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: p.bg, color: p.color, border: `1px solid ${p.border}` }}>{p.name}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: card.title === "Pick-up Order" ? 28 : 0, padding: "12px 0", borderRadius: 12, textAlign: "center", fontSize: 14, fontWeight: 800, ...card.ctaStyle }}>{card.cta}</div>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div key="delivery" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }} transition={SPG}
              style={{ background: "#151210", border: "1px solid rgba(240,237,232,0.09)", borderRadius: 24, padding: "36px 32px 32px" }}>
              <motion.button onClick={() => setView("choose")} whileHover={{ x: -2 }} whileTap={{ scale: 0.95 }} transition={SP}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "rgba(240,237,232,0.35)", padding: 0, marginBottom: 24 }}>
                ← Back
              </motion.button>
              <h3 style={{ fontSize: 24, fontWeight: 900, color: "#f0ede8", margin: "0 0 6px" }}>Select a delivery app</h3>
              <p style={{ fontSize: 13, color: "rgba(240,237,232,0.38)", margin: "0 0 28px" }}>Opens in a new tab.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { label: "FoodPanda", desc: "Order via the FoodPanda app", href: DELIVERY_LINKS.foodpanda, color: "#e91e8c", rgba: "233,30,140" },
                  { label: "Grab",      desc: "Order via the Grab app",      href: DELIVERY_LINKS.grab,      color: "#00b14f", rgba: "0,177,79"   },
                ].map(d => (
                  <motion.a key={d.label} href={d.href} target="_blank" rel="noopener noreferrer" whileHover={{ borderColor: `rgba(${d.rgba},0.45)`, y: -3 }} whileTap={{ scale: 0.97 }} transition={SPG}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", background: `rgba(${d.rgba},0.05)`, border: `1px solid rgba(${d.rgba},0.2)`, borderRadius: 18, padding: "24px 22px 20px", textDecoration: "none" }}>
                    <p style={{ fontSize: 17, fontWeight: 800, color: "#f0ede8", margin: "0 0 5px" }}>{d.label}</p>
                    <p style={{ fontSize: 12, color: "rgba(240,237,232,0.38)", margin: "0 0 18px", lineHeight: 1.5 }}>{d.desc}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: d.color, padding: "8px 14px", borderRadius: 20, background: `rgba(${d.rgba},0.1)`, border: `1px solid rgba(${d.rgba},0.2)` }}>
                      Open {d.label} <Icon d={externalD} size={12} sw="2.5" />
                    </div>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// ─── TRACKING PANEL ───────────────────────────────────────────────────────────
function TrackingPanel({ orders }: { orders: CustomerOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <div style={{ marginBottom: 34, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 20, fontWeight: 900, color: "#f0ede8", margin: 0 }}>Your order status</h3>
        <span style={{ fontSize: 12, color: "rgba(240,237,232,0.38)" }}>{orders.length} active order{orders.length !== 1 ? "s" : ""}</span>
      </div>
      {orders.map(order => (
        <div key={order.id} style={{ background: "#151210", border: "1px solid rgba(240,237,232,0.08)", borderRadius: 22, padding: "22px 24px", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: "#f0ede8" }}>{order.orderNumber}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(245,200,66,0.1)", border: "1px solid rgba(245,200,66,0.22)", color: "#f5c842" }}>{order.trackingStatus}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(240,237,232,0.35)" }}>
                {new Date(order.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {order.items.map((item, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "7px 12px", borderRadius: 999, background: "rgba(240,237,232,0.05)", border: "1px solid rgba(240,237,232,0.08)", color: "rgba(240,237,232,0.55)" }}>
                {item.quantity}x {item.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── HISTORY DRAWER ───────────────────────────────────────────────────────────
function HistoryDrawer({ orders, menuItems, onClose }: { orders: CustomerOrder[]; menuItems: Recipe[]; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(orders[0]?.id ?? null);
  const findImg = (name: string) => menuItems.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.image ?? "/placeholder.jpg";

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, backdropFilter: "blur(8px)" }} />
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={SPG}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px,100vw)", background: "#151210", zIndex: 300, display: "flex", flexDirection: "column", boxShadow: "-24px 0 80px rgba(0,0,0,0.5)", borderLeft: "1px solid rgba(240,237,232,0.07)" }}>
        <div style={{ padding: "28px 28px 20px", borderBottom: "1px solid rgba(240,237,232,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <span style={{ color: "#f5c842" }}><Icon d={receiptD} size={15} /></span>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f0ede8", margin: 0 }}>Order History</h2>
            </div>
            <p style={{ fontSize: 12, color: "rgba(240,237,232,0.35)", margin: 0 }}>{orders.length} saved order{orders.length !== 1 ? "s" : ""}</p>
          </div>
          <motion.button onClick={onClose} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} transition={SP}
            style={{ background: "rgba(240,237,232,0.07)", border: "1px solid rgba(240,237,232,0.1)", color: "rgba(240,237,232,0.6)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>×</motion.button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>
          {orders.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <span style={{ color: "rgba(240,237,232,0.2)" }}><Icon d={clipboardD} size={42} sw="1.2" /></span>
              <p style={{ color: "rgba(240,237,232,0.25)", fontSize: 14, lineHeight: 1.75, margin: 0 }}>No completed pickup orders yet.<br />Finished orders will be saved here.</p>
            </div>
          ) : orders.map((order, oi) => {
            const isOpen  = expanded === order.id;
            const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPG, delay: oi * 0.04 }} style={{ marginBottom: 10 }}>
                <motion.button onClick={() => setExpanded(isOpen ? null : order.id)} whileHover={{ borderColor: "rgba(240,237,232,0.18)" }}
                  style={{ width: "100%", background: isOpen ? "rgba(245,200,66,0.05)" : "rgba(240,237,232,0.03)", border: `1px solid ${isOpen ? "rgba(245,200,66,0.25)" : "rgba(240,237,232,0.09)"}`, borderRadius: isOpen ? "16px 16px 0 0" : 16, padding: "14px 16px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: isOpen ? "#f5c842" : "rgba(240,237,232,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: isOpen ? "#111" : "rgba(240,237,232,0.38)" }}>{order.orderNumber.replace("#", "")}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#f0ede8" }}>{order.orderNumber}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: order.trackingStatus === "Cancelled" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", color: order.trackingStatus === "Cancelled" ? "#f87171" : "#4ade80", border: `1px solid ${order.trackingStatus === "Cancelled" ? "rgba(239,68,68,0.22)" : "rgba(34,197,94,0.22)"}` }}>{order.trackingStatus}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(240,237,232,0.32)", marginBottom: 6 }}>
                      {new Date(order.createdAt).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      {order.items.slice(0, 6).map((item, ii) => (
                        <div key={ii} title={item.name} style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", border: "1.5px solid rgba(14,12,10,0.9)", flexShrink: 0, marginLeft: ii > 0 ? -6 : 0 }}>
                          <img src={findImg(item.name)} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ))}
                      {order.items.length > 6 && (
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(240,237,232,0.1)", border: "1.5px solid rgba(14,12,10,0.9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: -6 }}>
                          <span style={{ fontSize: 7.5, fontWeight: 800, color: "rgba(240,237,232,0.5)" }}>+{order.items.length - 6}</span>
                        </div>
                      )}
                      <span style={{ fontSize: 10.5, color: "rgba(240,237,232,0.28)", marginLeft: 8 }}>{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#f5c842" }}>₱{order.total.toFixed(2)}</span>
                    <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={SP} style={{ color: "rgba(240,237,232,0.28)", display: "flex" }}><Icon d={chevronD} size={13} sw="2.5" /></motion.span>
                  </div>
                </motion.button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="items" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }}
                      style={{ overflow: "hidden", background: "rgba(240,237,232,0.02)", border: "1px solid rgba(245,200,66,0.22)", borderTop: "none", borderRadius: "0 0 16px 16px" }}>
                      <div style={{ padding: "6px 0" }}>
                        {order.items.map((item, ii) => (
                          <div key={ii} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: ii < order.items.length - 1 ? "1px solid rgba(240,237,232,0.05)" : "none" }}>
                            <Avatar src={findImg(item.name)} size={38} />
                            <p style={{ fontSize: 12.5, fontWeight: 600, color: "#f0ede8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.name}</p>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(240,237,232,0.06)", color: "rgba(240,237,232,0.4)", border: "1px solid rgba(240,237,232,0.09)" }}>×{item.quantity}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px 6px", borderTop: "1px solid rgba(240,237,232,0.07)" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.28)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Order total</span>
                          <span style={{ fontSize: 10.5, color: "rgba(240,237,232,0.28)" }}>{order.paymentMethod.toUpperCase()} · {order.paymentStatus ?? order.trackingStatus}</span>
                          <span style={{ fontSize: 16, fontWeight: 900, color: "#f5c842" }}>₱{order.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

// ─── FLAVOR PICKER ────────────────────────────────────────────────────────────
function FlavorPicker({ maxFlavors, selected, onChange, flavors }: { maxFlavors: number; selected: string[]; onChange: (f: string[]) => void; flavors: string[] }) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(f => f !== name));
    else if (selected.length < maxFlavors) onChange([...selected, name]);
  };
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        Pick {maxFlavors === 1 ? "1 flavor" : `up to ${maxFlavors} flavors`}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {flavors.map(name => {
          const active   = selected.includes(name);
          const disabled = !active && selected.length >= maxFlavors;
          return (
            <motion.button key={name} onClick={() => !disabled && toggle(name)} whileHover={disabled ? {} : { scale: 1.04 }} whileTap={disabled ? {} : { scale: 0.93 }} transition={SP}
              style={{ padding: "6px 14px", borderRadius: 30, border: `1.5px solid ${active ? "#f5c842" : "rgba(240,237,232,0.12)"}`, background: active ? "rgba(245,200,66,0.12)" : "rgba(240,237,232,0.04)", color: active ? "#f5c842" : disabled ? "rgba(240,237,232,0.2)" : "rgba(240,237,232,0.55)", fontSize: 11.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", gap: 5 }}>
              {name}
              <AnimatePresence>{active && <motion.span key="tick" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP} style={{ fontSize: 9 }}>✓</motion.span>}</AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function VariantToggle({ selected, onChange }: { selected: "original" | "spicy"; onChange: (v: "original" | "spicy") => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      {(["original", "spicy"] as const).map(v => (
        <Pill key={v} label={v === "spicy" ? "Spicy" : "Original"} active={selected === v} onClick={() => onChange(v)} accent={v === "spicy" ? "#f97316" : "#f5c842"} />
      ))}
    </div>
  );
}

// ─── ORDER DRAWER ─────────────────────────────────────────────────────────────
function OrderDrawer({ cart, onClose, onRemove, onChangeQty, onClear, onSendPayment, onVerifyPayment, onPlaceOrder, paymentSession, paymentMessage, isSubmitting, selectedPaymentMethod, onPaymentMethodChange, onRequestCashTerms }: {
  cart: CartItem[]; onClose: () => void; onRemove: (id: number) => void; onChangeQty: (id: number, delta: number) => void; onClear: () => void;
  onSendPayment: () => void; onVerifyPayment: () => void; onPlaceOrder: () => void;
  paymentSession: PaymentSessionState | null; paymentMessage: string | null; isSubmitting: boolean;
  selectedPaymentMethod: PaymentMethodType; onPaymentMethodChange: (m: PaymentMethodType) => void; onRequestCashTerms: () => void;
}) {
  const total    = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const isCash   = selectedPaymentMethod === "cash";
  const primaryLabel  = isCash ? "Place Order" : (paymentSession?.paid ? "Place Order" : paymentSession ? "Check Payment Status" : "Send Payment");
  const primaryAction = isCash ? onRequestCashTerms : (paymentSession?.paid ? onPlaceOrder : paymentSession ? onVerifyPayment : onSendPayment);

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, backdropFilter: "blur(8px)" }} />
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={SPG}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px,100vw)", background: "#151210", zIndex: 300, display: "flex", flexDirection: "column", boxShadow: "-24px 0 80px rgba(0,0,0,0.5)", borderLeft: "1px solid rgba(240,237,232,0.07)" }}>
        <div style={{ padding: "24px 28px 18px", borderBottom: "1px solid rgba(240,237,232,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f0ede8", margin: 0 }}>Your Order</h2>
            <p style={{ fontSize: 12, color: "rgba(240,237,232,0.35)", margin: "4px 0 0" }}>{totalQty} item{totalQty !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SP} onClick={onClear}
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Clear
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button onClick={onClose} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} transition={SP}
              style={{ background: "rgba(240,237,232,0.07)", border: "1px solid rgba(240,237,232,0.1)", color: "rgba(240,237,232,0.6)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>×</motion.button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 28px" }}>
          <AnimatePresence initial={false}>
            {cart.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPG} style={{ textAlign: "center", paddingTop: 88 }}>
                <p style={{ color: "rgba(240,237,232,0.25)", fontSize: 14, lineHeight: 1.75 }}>Your order is empty.<br />Add something delicious!</p>
              </motion.div>
            ) : cart.map((item, idx) => (
              <motion.div key={item.recipe.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ ...SPG, delay: idx * 0.04 }}
                style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 0", borderBottom: "1px solid rgba(240,237,232,0.06)" }}>
                <Avatar src={item.recipe.image} size={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#f0ede8", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.recipe.name}</p>
                  {item.flavors.length > 0 && <p style={{ fontSize: 11, color: "rgba(240,237,232,0.35)", margin: "0 0 10px" }}>{item.flavors.join(" · ")}</p>}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(240,237,232,0.06)", borderRadius: 10, padding: "5px 12px", border: "1px solid rgba(240,237,232,0.08)" }}>
                      <motion.button whileTap={{ scale: 0.75 }} transition={SP} onClick={() => onChangeQty(item.recipe.id, -1)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,237,232,0.6)", fontSize: 16, lineHeight: 1, padding: 0, fontWeight: 700 }}>−</motion.button>
                      <AnimatePresence mode="wait">
                        <motion.span key={item.quantity} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={SP} style={{ fontSize: 13, fontWeight: 700, color: "#f0ede8", minWidth: 14, textAlign: "center" }}>{item.quantity}</motion.span>
                      </AnimatePresence>
                      <motion.button whileTap={{ scale: 0.75 }} transition={SP} onClick={() => onChangeQty(item.recipe.id, 1)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,237,232,0.6)", fontSize: 16, lineHeight: 1, padding: 0, fontWeight: 700 }}>+</motion.button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <AnimatePresence mode="wait">
                        <motion.span key={item.quantity} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={SPG} style={{ fontSize: 14, fontWeight: 700, color: "#f5c842" }}>₱{(item.recipe.price * item.quantity).toFixed(2)}</motion.span>
                      </AnimatePresence>
                      <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }} transition={SP} onClick={() => onRemove(item.recipe.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,237,232,0.2)", fontSize: 16, padding: 0 }}>×</motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {cart.length > 0 && (
            <motion.div key="footer" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={SPG}
              style={{ padding: "20px 28px 32px", borderTop: "1px solid rgba(240,237,232,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: "rgba(240,237,232,0.4)" }}>Total</span>
                <AnimatePresence mode="wait">
                  <motion.span key={Math.round(total * 100)} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={SPG} style={{ fontSize: 28, fontWeight: 900, color: "#f5c842", letterSpacing: "-0.03em" }}>₱{total.toFixed(2)}</motion.span>
                </AnimatePresence>
              </div>
              <PaymentMethodSelector selected={selectedPaymentMethod} onChange={onPaymentMethodChange} disabled={!isCash && !!paymentSession} />
              <div style={{ height: 1, background: "rgba(240,237,232,0.06)", margin: "0 0 14px" }} />
              {paymentMessage && !isCash && (
                <p style={{ fontSize: 11.5, color: paymentSession?.paid ? "#4ade80" : "rgba(240,237,232,0.4)", lineHeight: 1.6, margin: "0 0 12px" }}>{paymentMessage}</p>
              )}
              {!isCash && paymentSession?.checkoutUrl && !paymentSession.paid && (
                <motion.a whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} transition={SP} href={paymentSession.checkoutUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", justifyContent: "center", width: "100%", marginBottom: 10, background: "rgba(240,237,232,0.06)", color: "#f0ede8", border: "1px solid rgba(240,237,232,0.12)", borderRadius: 14, padding: "12px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" }}>
                  Open GCash Payment
                </motion.a>
              )}
              <motion.button onClick={primaryAction} disabled={isSubmitting} whileHover={{ scale: 1.02, backgroundColor: "#e6b800" }} whileTap={{ scale: 0.97 }} transition={SP}
                style={{ width: "100%", background: "#f5c842", color: "#111", border: "none", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 700, cursor: isSubmitting ? "wait" : "pointer", fontFamily: "inherit", opacity: isSubmitting ? 0.75 : 1 }}>
                {isSubmitting ? "Please wait..." : primaryLabel}
              </motion.button>
              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(240,237,232,0.22)", marginTop: 12 }}>
                {isCash ? "Pickup only · Pay onsite at the store" : "Pickup only · GCash via PayMongo · Place order after payment"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// ─── CHECKOUT MODAL ───────────────────────────────────────────────────────────
function CheckoutModal({ orderNumber, onClose }: { orderNumber: string | null; onClose: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 400, backdropFilter: "blur(12px)" }} />
      <motion.div initial={{ opacity: 0, scale: 0.88, y: 32 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ ...SPG, delay: 0.04 }}
        style={{ position: "fixed", top: "29%", left: "38%", transform: "translate(-50%,-50%)", background: "#151210", borderRadius: 28, padding: "48px 40px", zIndex: 500, textAlign: "center", width: "min(360px,90vw)", boxShadow: "0 40px 80px rgba(0,0,0,0.5)", border: "1px solid rgba(240,237,232,0.08)" }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.18, type: "spring", stiffness: 280, damping: 20 }}
          style={{ width: 72, height: 72, borderRadius: "50%", background: "#f5c842", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 8px 28px rgba(245,200,66,0.3)", fontSize: 30 }}>✓</motion.div>
        <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, ...SPG }} style={{ fontSize: 24, fontWeight: 800, color: "#f0ede8", marginBottom: 10 }}>Order Placed!</motion.h2>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ...SPG }} style={{ fontSize: 14, color: "rgba(240,237,232,0.5)", lineHeight: 1.75, marginBottom: 32, fontWeight: 300 }}>
          {orderNumber && <><strong style={{ color: "#f5c842" }}>{orderNumber}</strong> is your pickup number.<br /></>}
          We're getting everything fresh and crispy for you.
        </motion.p>
        <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36, ...SPG }} whileHover={{ scale: 1.04, backgroundColor: "#e6b800" }} whileTap={{ scale: 0.96 }} onClick={onClose}
          style={{ background: "#f5c842", color: "#111", border: "none", borderRadius: 12, padding: "13px 40px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Back to Menu
        </motion.button>
      </motion.div>
    </>
  );
}

// ─── RECIPE CARD ──────────────────────────────────────────────────────────────
function RecipeCard({ recipe, isFav, justAdded, flavorSel, variantSel, onToggleFav, onAddToCart, onFlavorChange, onVariantChange, flavors }: {
  recipe:         Recipe
  isFav:          boolean
  justAdded:      boolean
  flavorSel:      string[]
  variantSel:     "original" | "spicy"
  onToggleFav:    () => void
  onAddToCart:    () => void
  onFlavorChange: (f: string[]) => void
  onVariantChange:(v: "original" | "spicy") => void
  flavors:        string[]
}) {
  const isAvailable = recipe.available;
  const [imgErr, setImgErr] = useState(false);

  return (
    <motion.div layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={SPG}
      whileHover={{ borderColor: isAvailable ? "rgba(245,200,66,0.22)" : "rgba(240,237,232,0.1)" }}
      style={{ background: "#151210", borderRadius: 24, padding: "clamp(20px,4vw,32px) clamp(20px,4vw,36px)", border: "1px solid rgba(240,237,232,0.07)", display: "flex", flexWrap: "wrap", gap: "clamp(20px,4vw,40px)", alignItems: "flex-start", position: "relative", overflow: "hidden", opacity: isAvailable ? 1 : 0.72 }}>

      <div style={{ position: "absolute", top: 0, left: 32, right: 32, height: 2, background: isAvailable ? "linear-gradient(90deg,transparent,rgba(245,200,66,0.18),transparent)" : "linear-gradient(90deg,transparent,rgba(240,237,232,0.06),transparent)" }} />

      <div style={{ flex: "1 1 260px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "clamp(16px,2.5vw,18px)", fontWeight: 800, color: isAvailable ? "#f0ede8" : "rgba(240,237,232,0.45)", margin: 0, lineHeight: 1.28, flex: 1 }}>
            {recipe.name}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            {recipe.tag && isAvailable && <Tag tag={recipe.tag} />}
            {!isAvailable && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.22)", whiteSpace: "nowrap", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
                Not Available
              </span>
            )}
          </div>
        </div>

        <p style={{ fontSize: 13, color: "rgba(240,237,232,0.42)", lineHeight: 1.7, marginBottom: recipe.note ? 6 : 18, fontWeight: 300 }}>{recipe.description}</p>
        {recipe.note && <p style={{ fontSize: 11, color: "#f5c842", fontWeight: 600, marginBottom: 16 }}>{recipe.note}</p>}

        <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.12em" }}>Nutrition</p>
        <div style={{ display: "flex", gap: "clamp(14px,3vw,24px)", marginBottom: 20 }}>
          {[
            { label: "Cal",     unit: "kcal", value: recipe.nutrition.calories },
            { label: "Protein", unit: "g",    value: recipe.nutrition.protein  },
            { label: "Fats",    unit: "g",    value: recipe.nutrition.fats     },
            { label: "Carbs",   unit: "g",    value: recipe.nutrition.carbs    },
          ].map(n => (
            <div key={n.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "clamp(16px,2.5vw,20px)", fontWeight: 800, color: isAvailable ? "#f0ede8" : "rgba(240,237,232,0.3)", lineHeight: 1 }}>{n.value}</div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(240,237,232,0.35)", marginTop: 3 }}>{n.label}</div>
              <div style={{ fontSize: 9, color: "rgba(240,237,232,0.2)" }}>{n.unit}</div>
            </div>
          ))}
        </div>

        {isAvailable && recipe.variant !== undefined && <VariantToggle selected={variantSel} onChange={onVariantChange} />}
        {isAvailable && recipe.maxFlavors !== undefined && flavors.length > 0 && (
          <FlavorPicker maxFlavors={recipe.maxFlavors} selected={flavorSel} onChange={onFlavorChange} flavors={flavors} />
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <motion.button onClick={onToggleFav} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
              style={{ display: "flex", alignItems: "center", gap: 7, background: isFav ? "rgba(245,200,66,0.1)" : "rgba(240,237,232,0.05)", color: isFav ? "#f5c842" : "rgba(240,237,232,0.45)", border: `1px solid ${isFav ? "rgba(245,200,66,0.3)" : "rgba(240,237,232,0.1)"}`, borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {isFav ? "★ Saved" : "☆ Save"}
            </motion.button>
            <motion.button onClick={() => { if (isAvailable) onAddToCart(); }} disabled={!isAvailable} whileHover={isAvailable ? { scale: 1.04 } : {}} whileTap={isAvailable ? { scale: 0.93 } : {}} transition={SP}
              style={{ display: "flex", alignItems: "center", gap: 7, background: !isAvailable ? "rgba(240,237,232,0.04)" : justAdded ? "rgba(74,222,128,0.1)" : "#f5c842", color: !isAvailable ? "rgba(240,237,232,0.2)" : justAdded ? "#4ade80" : "#111", border: !isAvailable ? "1px solid rgba(240,237,232,0.1)" : justAdded ? "1px solid rgba(74,222,128,0.25)" : "none", borderRadius: 12, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: !isAvailable ? "not-allowed" : "pointer", fontFamily: "inherit", minWidth: 140, justifyContent: "center", opacity: !isAvailable ? 0.55 : 1 }}>
              <AnimatePresence mode="wait">
                <motion.span key={!isAvailable ? "unavailable" : justAdded ? "added" : "add"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SP}>
                  {!isAvailable ? "Not Available" : justAdded ? "Added!" : "Add to Order"}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(240,237,232,0.25)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>Price</div>
            <div style={{ fontSize: "clamp(20px,3vw,26px)", fontWeight: 900, color: isAvailable ? "#f5c842" : "rgba(240,237,232,0.3)", letterSpacing: "-0.04em" }}>₱{recipe.price.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <motion.div whileHover={isAvailable ? { scale: 1.05 } : {}} transition={SPG}
        style={{ width: "clamp(120px,20vw,200px)", height: "clamp(120px,20vw,200px)", borderRadius: "50%", overflow: "hidden", flexShrink: 0, boxShadow: "0 12px 48px rgba(0,0,0,0.45)", border: "1px solid rgba(240,237,232,0.08)", alignSelf: "center", position: "relative", background: "#1a1208" }}>
        <img
          src={imgErr ? "/placeholder.jpg" : recipe.image}
          alt={recipe.name}
          onError={() => setImgErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: isAvailable ? "brightness(0.96) saturate(1.1)" : "brightness(0.45) saturate(0.3)" }}
        />
        {!isAvailable && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(240,237,232,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", textAlign: "center", lineHeight: 1.4, padding: "0 12px" }}>Not{"\n"}Available</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── USER PILL ────────────────────────────────────────────────────────────────
function UserPill({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPG}
      style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(245,200,66,0.07)", border: "1px solid rgba(245,200,66,0.18)", borderRadius: 10, padding: "6px 12px 6px 8px" }}
    >
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#f5c842,#e6a800)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#111" }}>{initials}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(240,237,232,0.65)", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name.split(" ")[0]}</span>
    </motion.div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Delicacy() {
  const navigate = useNavigate();

  // ── Auth from shared context (stays in sync with AboutTheCrunch) ──
  const { user, logout } = useAuth();
  const customerUserId = user ? Number((user as any).id ?? (user as any).userId ?? 0) : 0;
  const customerName   = user ? ((user as any).name ?? (user as any).userName ?? "The Crunch Customer") : "The Crunch Customer";
  const customerEmail  = user ? ((user as any).email ?? (user as any).userEmail ?? "") : "";

  // ── Data from API ──
  const [menuItems,  setMenuItems]  = useState<Recipe[]>([]);
  const [flavors,    setFlavors]    = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [mealTypes,  setMealTypes]  = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);

  // ── UI state ──
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeMeal,     setActiveMeal]     = useState("Lunch");
  const [favorites,      setFavorites]      = useState<number[]>([]);
  const [flavorSels,     setFlavorSels]     = useState<Record<number, string[]>>({});
  const [variantSels,    setVariantSels]    = useState<Record<number, "original" | "spicy">>({});
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [showCheckout,   setShowCheckout]   = useState(false);
  const [lastOrderNum,   setLastOrderNum]   = useState<string | null>(null);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [justAdded,      setJustAdded]      = useState<number | null>(null);
  const [highlightedId,  setHighlightedId]  = useState<number | null>(null);
  const [scrolled,       setScrolled]       = useState(false);
  const [orderTypeOpen,  setOrderTypeOpen]  = useState(false);
  const [orderHistory,   setOrderHistory]   = useState<CustomerOrder[]>([]);
  const [activeOrders,   setActiveOrders]   = useState<CustomerOrder[]>([]);
  const [paymentSession, setPaymentSession] = useState<PaymentSessionState | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [paymentMethod,  setPaymentMethod]  = useState<PaymentMethodType>("gcash");
  const [showCashTerms,  setShowCashTerms]  = useState(false);

  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── Fetch all menu data from backend ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      api.get<InventoryMenuRow[]>("/inventory"),
      api.get<Recipe[]>("/menu/items"),
      api.get<string[]>("/menu/flavors"),
      api.get<string[]>("/menu/meal-types"),
    ])
      .then(([inventoryResult, menuItemsResult, flavorListResult, mealsResult]) => {
        if (cancelled) return;
        const inventoryRows  = inventoryResult.status  === "fulfilled" && Array.isArray(inventoryResult.value)  ? inventoryResult.value  : [];
        const menuItemsMeta  = menuItemsResult.status  === "fulfilled" && Array.isArray(menuItemsResult.value)  ? menuItemsResult.value  : [];
        const flavorList     = flavorListResult.status === "fulfilled" && Array.isArray(flavorListResult.value) ? flavorListResult.value : [];
        const meals          = mealsResult.status      === "fulfilled" && Array.isArray(mealsResult.value) && mealsResult.value.length > 0 ? mealsResult.value : ["Breakfast", "Lunch", "Dinner"];

        const allMeals       = meals.length > 0 ? meals : ["Breakfast", "Lunch", "Dinner"];
        const mergedRecipes  = mapInventoryRecipes(inventoryRows, menuItemsMeta, allMeals);
        const allCats        = ["All", ...Array.from(new Set(mergedRecipes.map((item) => item.category)))];

        setMenuItems(mergedRecipes);
        setFlavors(flavorList);
        setCategories(allCats);
        setMealTypes(allMeals);
        setActiveMeal(allMeals.includes("Lunch") ? "Lunch" : allMeals[0] ?? "Lunch");
      })
      .catch(err => { console.error("Failed to load menu:", err); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // ── Scroll listener ──
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // ── Restore payment session ──
  useEffect(() => {
    const raw = localStorage.getItem(PAYMENT_SESSION_KEY);
    if (!raw) return;
    try { setPaymentSession(JSON.parse(raw)); } catch { localStorage.removeItem(PAYMENT_SESSION_KEY); }
  }, []);

  useEffect(() => {
    if (paymentSession) localStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify(paymentSession));
    else localStorage.removeItem(PAYMENT_SESSION_KEY);
  }, [paymentSession]);

  // ── Handle GCash return URL ──
  useEffect(() => {
    const params       = new URLSearchParams(window.location.search);
    const paymentState = params.get("payment");
    if (!paymentState) return;

    const clearParam = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete("payment");
      window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
    };

    if (paymentState === "cancelled") {
      setDrawerOpen(true);
      setPaymentMessage("GCash checkout was cancelled. You can try again when you're ready.");
      clearParam(); return;
    }
    if (paymentState !== "success") { clearParam(); return; }

    const raw = localStorage.getItem(PAYMENT_SESSION_KEY);
    if (!raw) { clearParam(); return; }
    let session: PaymentSessionState | null = null;
    try { session = JSON.parse(raw); setPaymentSession(session!); } catch { localStorage.removeItem(PAYMENT_SESSION_KEY); clearParam(); return; }

    setDrawerOpen(true);
    setPaymentMessage("Payment return detected. Verifying your GCash payment...");

    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ paid: boolean; status: string; paymentReference: string | null }>(`/orders/paymongo/checkout/${session!.checkoutSessionId}`);
        if (cancelled) return;
        setPaymentSession({ ...session!, ...data });
        setPaymentMessage(data.paid ? "Payment confirmed. You can now click Place Order." : "Payment still pending. Please check again.");
      } catch {
        if (!cancelled) setPaymentMessage("Could not verify payment automatically. Click Check Payment Status.");
      } finally { clearParam(); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Deep links ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("showOrderModal") === "true") setOrderTypeOpen(true);

    const itemSlug = params.get("item");
    if (!itemSlug || menuItems.length === 0) return;

    const needle = decodeURIComponent(itemSlug).trim().toLowerCase();
    const match  = menuItems.find(r => r.name.trim().toLowerCase() === needle)
                ?? menuItems.find(r => r.name.toLowerCase().includes(needle) || needle.includes(r.name.toLowerCase()));
    if (!match) return;

    setActiveCategory(match.category ?? "All");
    setActiveMeal(match.mealTypes[0] ?? activeMeal);
    setTimeout(() => {
      const el = cardRefs.current[match.id];
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2 + el.getBoundingClientRect().height / 2, behavior: "smooth" });
      setTimeout(() => { setHighlightedId(match.id); setTimeout(() => setHighlightedId(null), 3200); }, 600);
    }, 480);
  }, [menuItems]);

  // ── Fetch orders (poll every 5s) ──
  const fetchOrders = useCallback(async () => {
    if (!customerUserId) return;
    try {
      const data = await api.get<{ activeOrders: CustomerOrder[]; historyOrders: CustomerOrder[] }>(`/orders/customer/${customerUserId}`);
      setActiveOrders(data.activeOrders  ?? []);
      setOrderHistory(data.historyOrders ?? []);
    } catch (e) { console.error("Failed to load orders:", e); }
  }, [customerUserId]);

  useEffect(() => {
    fetchOrders();
    if (!customerUserId) return;
    const t = window.setInterval(fetchOrders, 5000);
    return () => window.clearInterval(t);
  }, [fetchOrders, customerUserId]);

  // ── Derived display list ──
  const displayed = menuItems.filter(r =>
    (activeCategory === "All" || r.category === activeCategory) &&
    (r.mealTypes.length === 0 || r.mealTypes.includes(activeMeal))
  );

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Cart helpers ──
  const clearPayment = () => { setPaymentSession(null); setPaymentMessage(null); };

  const addToCart = (recipe: Recipe) => {
    if (!recipe.available) return;
    const recFlavors = flavorSels[recipe.id] ?? [];
    clearPayment();
    setCart(prev => {
      const found = prev.find(c => c.recipe.id === recipe.id);
      return found
        ? prev.map(c => c.recipe.id === recipe.id ? { ...c, quantity: c.quantity + 1, flavors: recFlavors } : c)
        : [...prev, { recipe, quantity: 1, flavors: recFlavors }];
    });
    setJustAdded(recipe.id);
    setTimeout(() => setJustAdded(null), 1400);
  };

  const removeFromCart = (id: number) => { clearPayment(); setCart(p => p.filter(c => c.recipe.id !== id)); };
  const changeQty      = (id: number, delta: number) => { clearPayment(); setCart(p => p.map(c => c.recipe.id === id ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0)); };
  const clearCart      = () => { setCart([]); clearPayment(); };
  const handlePaymentMethodChange = (m: PaymentMethodType) => { setPaymentMethod(m); clearPayment(); };

  const buildItems = () => cart.map(i => ({ product_id: i.recipe.id, qty: i.quantity, subtotal: i.recipe.price * i.quantity, name: i.recipe.name, price: i.recipe.price }));

  // ── Order actions ──
  const handleRequestCashTerms = () => {
    if (isSubmitting || !cart.length) return;
    if (!customerUserId) { setPaymentMessage("Please log in as a customer first."); return; }
    setShowCashTerms(true);
  };

  const handlePlaceCashOrder = async () => {
    setIsSubmitting(true);
    try {
      const total = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0);
      const res   = await api.post<{ orderId: number; orderNumber: string }>("/orders", { items: buildItems(), total, customerUserId, order_type: "take-out", payment_method: "cash_on_pickup", payment_status: "Pending Payment" });
      await fetchOrders();
      setLastOrderNum(res.orderNumber || `#${res.orderId}`);
      setDrawerOpen(false);
      setTimeout(() => { setShowCheckout(true); setCart([]); }, 320);
    } catch (e) { console.error(e); setPaymentMessage("Could not place your order. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  const handleSendPayment = async () => {
    if (isSubmitting || !cart.length) return;
    if (!customerUserId) { setPaymentMessage("Please log in as a customer first."); return; }
    setIsSubmitting(true); setPaymentMessage(null);
    try {
      const total = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0);
      const data  = await api.post<{ checkoutSessionId: string; checkoutUrl: string; status: string }>("/orders/paymongo/checkout", { items: buildItems(), total, customerUserId, customerName, customerEmail });
      const next: PaymentSessionState = { checkoutSessionId: data.checkoutSessionId, checkoutUrl: data.checkoutUrl, status: data.status, paid: false, paymentReference: null };
      setPaymentSession(next);
      setPaymentMessage("GCash payment page opened. Finish payment there, then click Check Payment Status.");
      window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg.includes("PAYMONGO_SECRET_KEY is not configured")) {
        const ref = `TEST-BYPASS-${Date.now()}`;
        setPaymentSession({ checkoutSessionId: ref, checkoutUrl: "", status: "bypassed", paid: true, paymentReference: ref });
        setPaymentMessage("PayMongo not configured — bypassed for now. Click Place Order.");
      } else {
        setPaymentMessage("Could not start GCash payment. Please try again.");
      }
    } finally { setIsSubmitting(false); }
  };

  const handleVerifyPayment = async () => {
    if (isSubmitting || !paymentSession) return;
    setIsSubmitting(true);
    try {
      const data = await api.get<{ paid: boolean; status: string; paymentReference: string | null }>(`/orders/paymongo/checkout/${paymentSession.checkoutSessionId}`);
      setPaymentSession({ ...paymentSession, ...data });
      setPaymentMessage(data.paid ? "Payment confirmed. You can now click Place Order." : "Payment still pending. Finish GCash checkout, then check again.");
    } catch { setPaymentMessage("Could not verify payment. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting || !paymentSession?.paid) { setPaymentMessage("Please complete and verify your GCash payment first."); return; }
    setIsSubmitting(true);
    try {
      const total = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0);
      const res   = await api.post<{ orderId: number; orderNumber: string }>("/orders", { items: buildItems(), total, customerUserId, order_type: "take-out", payment_method: "gcash", checkout_session_id: paymentSession.checkoutSessionId, payment_reference: paymentSession.paymentReference || paymentSession.checkoutSessionId, payment_status: "Paid" });
      await fetchOrders();
      setLastOrderNum(res.orderNumber || `#${res.orderId}`);
      clearPayment();
      setDrawerOpen(false);
      setTimeout(() => { setShowCheckout(true); setCart([]); }, 320);
    } catch { setPaymentMessage("Payment done, but could not place the order. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  // ── Logout via shared context — syncs instantly across all pages ──
  const handleLogout = () => {
    logout();
    navigate("/aboutthecrunch");
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0e0c0a", minHeight: "100vh", paddingBottom: 120, color: "#f0ede8" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Ambient glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        {[{ top: "-8%", left: "10%", w: 700, op: 0.05 }, { top: "45%", right: "-8%", w: 520, op: 0.03 }, { bottom: "-8%", left: "30%", w: 600, op: 0.04 }].map((g, i) => (
          <div key={i} style={{ position: "absolute", ...g, width: g.w, height: g.w, borderRadius: "50%", background: `radial-gradient(circle,rgba(245,200,66,${g.op}) 0%,transparent 65%)` }} />
        ))}
      </div>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.65, ease: EASE }}
        style={{ position: "sticky", top: 0, zIndex: 100, background: scrolled ? "rgba(14,12,10,0.96)" : "rgba(14,12,10,0.80)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(240,237,232,0.07)", padding: "0 clamp(16px,4vw,40px)", height: 68, display: "flex", justifyContent: "space-between", alignItems: "center" }}>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={SP} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#f0ede8" }}>The <span style={{ color: "#f5c842" }}>Crunch</span></span>
        </motion.button>

        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {NAV_LINKS.map(item => (
            <motion.button key={item.label} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={SP}
              onClick={() => item.label === "Menu" ? setOrderTypeOpen(true) : navigate(item.path)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, color: "rgba(240,237,232,0.45)", padding: "7px 14px", borderRadius: 8 }}
              onMouseEnter={e => { e.currentTarget.style.color = "#f0ede8"; e.currentTarget.style.background = "rgba(240,237,232,0.07)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(240,237,232,0.45)"; e.currentTarget.style.background = "transparent"; }}>
              {item.label}
            </motion.button>
          ))}

          <div style={{ width: 1, height: 16, background: "rgba(240,237,232,0.12)", margin: "0 4px" }} />

          {/* History */}
          <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} transition={SP} onClick={() => setHistoryOpen(true)} title="Order History"
            style={{ position: "relative", background: orderHistory.length > 0 ? "rgba(245,200,66,0.08)" : "rgba(240,237,232,0.06)", border: `1px solid ${orderHistory.length > 0 ? "rgba(245,200,66,0.25)" : "rgba(240,237,232,0.12)"}`, color: orderHistory.length > 0 ? "#f5c842" : "rgba(240,237,232,0.42)", borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon d={historyD} size={17} />
            <AnimatePresence>
              {orderHistory.length > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                  style={{ position: "absolute", top: -5, right: -5, background: "#f5c842", color: "#111", borderRadius: 20, minWidth: 16, height: 16, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                  {orderHistory.length}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* My Order */}
          <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} transition={SP} onClick={() => setDrawerOpen(true)}
            style={{ position: "relative", background: "#f5c842", color: "#111", border: "none", borderRadius: 10, padding: "9px 20px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            My Order
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                  style={{ background: "#111", color: "#f5c842", borderRadius: 20, minWidth: 20, height: 20, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                  <AnimatePresence mode="wait">
                    <motion.span key={totalItems} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={SP}>{totalItems}</motion.span>
                  </AnimatePresence>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* User pill + Log Out — shown only when authenticated */}
          <AnimatePresence>
            {user && (
              <motion.div
                key="auth-controls"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={SPG}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <UserPill name={customerName} />
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.9 }}
                  transition={SP}
                  onClick={handleLogout}
                  style={{ background: "rgba(240,237,232,0.06)", color: "#f0ede8", border: "1px solid rgba(240,237,232,0.12)", borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>
                  Log Out
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.nav>

      {/* ── MAIN ── */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(32px,5vw,52px) clamp(16px,4vw,40px) 0", position: "relative", zIndex: 1 }}>

        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.75, ease: EASE }} style={{ marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 1, background: "#f5c842" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#f5c842", letterSpacing: "0.25em", textTransform: "uppercase" }}>The Crunch Fairview</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <h1 style={{ fontSize: "clamp(36px,6vw,68px)", fontWeight: 900, color: "#f0ede8", margin: 0, letterSpacing: "-0.025em", lineHeight: 1.02 }}>
              Our <em style={{ color: "#f5c842" }}>Menu.</em>
            </h1>
            {/* Welcome badge */}
            <AnimatePresence>
              {user && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.92 }}
                  transition={SPG}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(245,200,66,0.06)", border: "1px solid rgba(245,200,66,0.14)", borderRadius: 14, padding: "10px 16px" }}
                >
                  <div style={{ color: "#f5c842", display: "flex" }}><Icon d={userD} size={15} /></div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(245,200,66,0.55)", textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 1px" }}>Welcome back</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#f0ede8", margin: 0 }}>{customerName}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <TrackingPanel orders={activeOrders} />

        {/* Category Tabs */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.65, ease: EASE }}
          style={{ display: "flex", gap: 0, marginBottom: 40, borderBottom: "1px solid rgba(240,237,232,0.07)", overflowX: "auto" }}>
          {(loading ? ["All", "Chicken", "Sides", "Drinks"] : categories).map(cat => (
            <motion.button key={cat} onClick={() => setActiveCategory(cat)} whileTap={{ scale: 0.95 }} transition={SP}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: activeCategory === cat ? 700 : 400, color: activeCategory === cat ? "#f5c842" : "rgba(240,237,232,0.3)", padding: "13px 22px", position: "relative", whiteSpace: "nowrap" }}>
              {cat}
              {activeCategory === cat && <motion.div layoutId="catTab" transition={SPG} style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "#f5c842", borderRadius: 2 }} />}
            </motion.button>
          ))}
        </motion.div>

        <div style={{ display: "flex", gap: "clamp(20px,4vw,36px)" }}>
          {/* Meal Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 44, paddingTop: 8, minWidth: 56, alignItems: "center", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(240,237,232,0.06)", transform: "translateX(-50%)" }} />
            {(loading ? ["Breakfast", "Lunch", "Dinner"] : mealTypes).map((meal, mi) => (
              <motion.button key={meal} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.22 + mi * 0.07 }} onClick={() => setActiveMeal(meal)} whileHover={{ x: 2 }} whileTap={{ scale: 0.9 }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", padding: 0, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 11.5, fontWeight: activeMeal === meal ? 700 : 400, color: activeMeal === meal ? "#f5c842" : "rgba(240,237,232,0.22)", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.1em" }}>{meal}</span>
                <AnimatePresence>
                  {activeMeal === meal && <motion.div layoutId="mealDot" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP} style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 5, height: 5, borderRadius: "50%", background: "#f5c842" }} />}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>

          {/* Recipe Cards */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            {loading ? (
              <><RecipeSkeleton /><RecipeSkeleton /><RecipeSkeleton /></>
            ) : (
              <AnimatePresence mode="popLayout">
                {displayed.length > 0 ? displayed.map(recipe => {
                  const isHL = highlightedId === recipe.id;
                  return (
                    <div key={`${recipe.id}-${activeMeal}-${activeCategory}`} ref={(el: HTMLDivElement | null) => { cardRefs.current[recipe.id] = el; }} style={{ position: "relative" }}>
                      <AnimatePresence>
                        {isHL && recipe.available && (
                          <>
                            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: [0, 1, 0.7, 1, 0.5, 0], scale: [0.96, 1.015, 1.01, 1.015, 1.01, 1] }} exit={{ opacity: 0 }} transition={{ duration: 2.8, ease: "easeInOut" }}
                              style={{ position: "absolute", inset: -4, borderRadius: 28, border: "2px solid rgba(245,200,66,0.8)", boxShadow: "0 0 0 4px rgba(245,200,66,0.15),0 0 48px rgba(245,200,66,0.3)", pointerEvents: "none", zIndex: 10 }} />
                            <motion.div initial={{ opacity: 0, y: -12, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.2 }}
                              style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "#f5c842", color: "#111", fontSize: 11, fontWeight: 800, padding: "5px 16px", borderRadius: 30, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(245,200,66,0.5)", zIndex: 20, pointerEvents: "none" }}>
                              ✦ Tap to Order
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                      <RecipeCard
                        recipe={recipe}
                        isFav={favorites.includes(recipe.id)}
                        justAdded={justAdded === recipe.id}
                        flavorSel={flavorSels[recipe.id] ?? []}
                        variantSel={variantSels[recipe.id] ?? "original"}
                        onToggleFav={() => setFavorites(p => p.includes(recipe.id) ? p.filter(f => f !== recipe.id) : [...p, recipe.id])}
                        onAddToCart={() => addToCart(recipe)}
                        onFlavorChange={f => setFlavorSels(p => ({ ...p, [recipe.id]: f }))}
                        onVariantChange={v => setVariantSels(p => ({ ...p, [recipe.id]: v }))}
                        flavors={flavors}
                      />
                    </div>
                  );
                }) : (
                  <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPG}
                    style={{ textAlign: "center", padding: "88px 0", color: "rgba(240,237,232,0.2)", fontSize: 14 }}>
                    No items for {activeMeal} in this category.
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS & DRAWERS ── */}
      <AnimatePresence>{orderTypeOpen && <OrderTypeModal onClose={() => setOrderTypeOpen(false)} />}</AnimatePresence>
      <AnimatePresence>
        {drawerOpen && (
          <OrderDrawer
            cart={cart} onClose={() => setDrawerOpen(false)} onRemove={removeFromCart} onChangeQty={changeQty} onClear={clearCart}
            onSendPayment={handleSendPayment} onVerifyPayment={handleVerifyPayment} onPlaceOrder={handlePlaceOrder}
            paymentSession={paymentSession} paymentMessage={paymentMessage} isSubmitting={isSubmitting}
            selectedPaymentMethod={paymentMethod} onPaymentMethodChange={handlePaymentMethodChange}
            onRequestCashTerms={handleRequestCashTerms}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{showCashTerms && <CashTermsModal onAccept={() => { setShowCashTerms(false); handlePlaceCashOrder(); }} onDecline={() => setShowCashTerms(false)} />}</AnimatePresence>
      <AnimatePresence>{historyOpen  && <HistoryDrawer orders={orderHistory} menuItems={menuItems} onClose={() => setHistoryOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{showCheckout && <CheckoutModal orderNumber={lastOrderNum} onClose={() => { setShowCheckout(false); setLastOrderNum(null); }} />}</AnimatePresence>
    </div>
  );
}
