import { useState, useCallback, useEffect } from "react";
import { Search, Minus, Plus, Trash2, UtensilsCrossed, Check, Clock, Calendar, Hash, ChevronDown, Delete } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";

// ─── FONT ─────────────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("poppins-font")) {
  const l = document.createElement("link");
  l.id = "poppins-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}
const F = "'Poppins', sans-serif";
const SP = { type: "spring" as const, stiffness: 400, damping: 28 };

// ─── CONSTANTS & TYPES ────────────────────────────────────────────────────────
const VAT_RATE = 0.12;
const DISCOUNT_RATE = 0.2;
type CustomerType = "regular" | "pwd" | "senior";

interface MenuItem { id: number; name: string; price: number; category: string; remainingStock: number; image?: string | null; }
interface CartItem extends MenuItem { quantity: number; }
interface TableItem { id: number; number: number; status: "available" | "occupied"; seats?: number; }
interface OrderPayload {
  items: { product_id: number; qty: number; subtotal: number; name: string; price: number; }[];
  total: number; order_type: "dine-in" | "take-out" | "delivery";
  payment_method: "cash" | "e-payment"; customer_type: CustomerType;
  discount_amount: number; vat_amount: number; vat_exempt_amount: number;
  cashierId: number | null; table_id: number | null;
  cash_tendered?: number; change_amount?: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const isFood = (item: MenuItem) => item.category.toUpperCase().includes("MENU FOOD");

const fmt = (n: number) => {
  const [int, dec] = n.toFixed(2).split(".");
  return (dec === "00" ? int : `${int}.${dec}`).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const getNow = () => {
  const d = new Date();
  return {
    date: d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
};

const computePricing = (gross: number, ct: CustomerType) => {
  if (ct === "regular") {
    const vatAmount = gross * (VAT_RATE / (1 + VAT_RATE));
    return { gross, vatExemptAmount: 0, vatAmount, discountAmount: 0, amountDue: gross };
  }
  const base = gross / (1 + VAT_RATE);
  const disc = base * DISCOUNT_RATE;
  return { gross, vatExemptAmount: base, vatAmount: 0, discountAmount: disc, amountDue: base - disc };
};

const mapProducts = (data: Record<string, unknown>[]): MenuItem[] => {
  const map = new Map<string, Record<string, unknown>>();
  for (const p of data ?? []) {
    if (p.isRawMaterial) continue;
    const key = String(p.product_name ?? p.name ?? "").trim().toLowerCase();
    const ex = map.get(key);
    if (!ex || Number(p.product_id ?? p.id ?? 0) > Number(ex.product_id ?? ex.id ?? 0)) map.set(key, p);
  }
  return Array.from(map.values()).map((p) => ({
    id: Number(p.product_id ?? p.id),
    name: String(p.product_name ?? p.name ?? `Product #${p.id}`),
    price: Number(p.price ?? 0),
    category: String(p.category ?? "UNCATEGORIZED").toUpperCase(),
    remainingStock: Number(p.dailyWithdrawn ?? 0),
    image: p.image ? String(p.image) : null,
  }));
};

const mapTables = (data: Record<string, unknown>[]): TableItem[] =>
  (data ?? []).map((t) => ({
    id: Number(t.id ?? t.table_id),
    number: Number(t.number ?? t.table_number ?? t.id),
    status: (t.status as "available" | "occupied") ?? "available",
    seats: t.seats ? Number(t.seats) : undefined,
  }));

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const btn = (bg: string, color: string, extra?: object) => ({
  width: "100%", padding: "13px", background: bg, color, border: "none",
  borderRadius: 12, fontSize: 13, fontWeight: 500, fontFamily: F, cursor: "pointer", ...extra,
});

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({ item, onAdd, inCart }: { item: MenuItem; onAdd: (i: MenuItem) => void; inCart: boolean; }) {
  const out = item.remainingStock <= 0 && !isFood(item);
  return (
    <motion.button
      layout onClick={() => !out && onAdd(item)} disabled={out}
      whileHover={!out ? { y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.07)" } : {}}
      whileTap={!out ? { scale: 0.96 } : {}} transition={SP}
      style={{ position: "relative", width: "100%", textAlign: "left", overflow: "hidden", borderRadius: 14, background: "#fff", border: `1px solid ${inCart ? "#111" : "#efefef"}`, opacity: out ? 0.4 : 1, cursor: out ? "not-allowed" : "pointer", fontFamily: F, padding: 0 }}
    >
      <div style={{ width: "100%", aspectRatio: "1", background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <UtensilsCrossed style={{ width: 22, height: 22, color: "#ddd" }} />
      </div>
      <div style={{ padding: "9px 10px 10px" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "#222", lineHeight: 1.35, marginBottom: 7 }}>{item.name}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>₱{fmt(item.price)}</span>
          {!isFood(item) && (
            <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 5, background: out ? "#fff0f0" : "#f5f5f5", color: out ? "#f87171" : "#bbb" }}>
              {out ? "Out" : item.remainingStock}
            </span>
          )}
        </div>
      </div>
      <AnimatePresence>
        {inCart && (
          <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={SP}
            style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check style={{ width: 9, height: 9, color: "#fff" }} strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── CART ROW ─────────────────────────────────────────────────────────────────
function CartRow({ item, onRemove, onQty }: { item: CartItem; onRemove: (id: number) => void; onQty: (id: number, d: number) => void; }) {
  const qtyBtn = (delta: number, icon: React.ReactNode) => (
    <motion.button whileTap={{ scale: 0.85 }} onClick={() => onQty(item.id, delta)}
      style={{ width: 22, height: 22, borderRadius: 7, border: "1px solid #eee", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {icon}
    </motion.button>
  );
  return (
    <motion.div layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={SP}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid #f5f5f5", fontFamily: F }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <UtensilsCrossed style={{ width: 13, height: 13, color: "#ddd" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "#222", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
        <p style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>₱{fmt(item.price)}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {qtyBtn(-1, <Minus style={{ width: 10, height: 10, color: "#666" }} />)}
        <span style={{ fontSize: 11, fontWeight: 600, color: "#111", minWidth: 16, textAlign: "center" }}>{item.quantity}</span>
        {qtyBtn(1, <Plus style={{ width: 10, height: 10, color: "#666" }} />)}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#111", minWidth: 40, textAlign: "right" }}>₱{fmt(item.price * item.quantity)}</span>
      <motion.button whileTap={{ scale: 0.85 }} onClick={() => onRemove(item.id)}
        style={{ width: 22, height: 22, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
        <Trash2 style={{ width: 12, height: 12, color: "#ccc" }} />
      </motion.button>
    </motion.div>
  );
}

// ─── CUSTOM SELECT ────────────────────────────────────────────────────────────
function CustomSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "7px 24px 7px 10px", fontSize: 11, fontFamily: F, border: "1px solid #efefef", borderRadius: 9, background: "#fafafa", color: "#444", outline: "none", appearance: "none", cursor: "pointer" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, color: "#bbb", pointerEvents: "none" }} />
    </div>
  );
}

// ─── AMOUNT ENTRY MODAL ───────────────────────────────────────────────────────
function AmountEntryModal({ show, amountDue, paymentMethod, onConfirm, onCancel }: {
  show: boolean; amountDue: number; paymentMethod: "cash" | "e-payment";
  onConfirm: (t: number) => void; onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const [gcashDone, setGcashDone] = useState(false);

  useEffect(() => { if (show) { setInput(""); setGcashDone(false); } }, [show]);

  const tendered = parseFloat(input) || 0;
  const change = tendered - amountDue;
  const enough = tendered >= amountDue;
  const KEYS = ["1","2","3","4","5","6","7","8","9","⌫","0","00"];
  const QUICK = [50, 100, 200, 500, 1000].filter((d) => d >= amountDue);

  const handleKey = (k: string) => {
    if (k === "⌫") return setInput((p) => p.slice(0, -1));
    if (k === "00") return setInput((p) => p === "" ? "" : p + "00");
    if (k === "." && input.includes(".")) return;
    const di = input.indexOf(".");
    if (di !== -1 && input.length - di > 2) return;
    setInput((p) => p + k);
  };

  const handleGcash = () => { setGcashDone(true); setTimeout(() => onConfirm(amountDue), 700); };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 60, backdropFilter: "blur(3px)", background: "rgba(0,0,0,0.35)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 61, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 320, borderRadius: 20, overflow: "hidden", border: "1px solid #ebebeb", pointerEvents: "auto", fontFamily: F }}>

              <div style={{ padding: "22px 22px 16px", borderBottom: "1px solid #f5f5f5" }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Amount due</p>
                <p style={{ fontSize: 28, fontWeight: 600, color: "#111", margin: 0 }}>₱{fmt(amountDue)}</p>
              </div>

              <div style={{ padding: "14px 18px 18px" }}>
                {paymentMethod === "cash" ? (
                  <>
                    <p style={{ fontSize: 10, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Cash tendered</p>
                    <div style={{ background: "#fafafa", border: `1.5px solid ${input ? "#111" : "#e5e5e5"}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, marginBottom: 10, minHeight: 44 }}>
                      <span style={{ fontSize: 14, color: "#aaa" }}>₱</span>
                      <span style={{ fontSize: 20, fontWeight: 600, color: input ? "#111" : "#ccc", flex: 1 }}>{input || "0"}</span>
                    </div>

                    {QUICK.length > 0 && (
                      <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                        {QUICK.slice(0, 5).map((a) => (
                          <motion.button key={a} whileTap={{ scale: 0.94 }} onClick={() => setInput(String(a))}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #efefef", background: "#f7f7f7", fontSize: 11, fontWeight: 500, color: "#555", cursor: "pointer", fontFamily: F }}>
                            ₱{a}
                          </motion.button>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[{ label: "Change", val: enough && input ? `₱${fmt(change)}` : "—", color: enough && input ? "#16a34a" : "#ddd" },
                        { label: "Tendered", val: input ? `₱${fmt(tendered)}` : "—", color: input ? "#111" : "#ddd" }].map(({ label, val, color }) => (
                        <div key={label} style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ fontSize: 10, color: "#bbb", marginBottom: 3 }}>{label}</p>
                          <p style={{ fontSize: 16, fontWeight: 600, color, margin: 0 }}>{val}</p>
                        </div>
                      ))}
                    </div>

                    <AnimatePresence>
                      {input && !enough && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          style={{ fontSize: 11, color: "#f87171", marginBottom: 8, fontWeight: 500 }}>
                          ₱{fmt(amountDue - tendered)} short
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                      {KEYS.map((k) => (
                        <motion.button key={k} whileTap={{ scale: 0.9 }} onClick={() => handleKey(k)}
                          style={{ padding: "12px", borderRadius: 9, border: "1px solid #eee", background: k === "⌫" ? "#fafafa" : "#fff", fontSize: k === "⌫" ? 13 : 15, fontWeight: 500, color: k === "⌫" ? "#999" : "#222", cursor: "pointer", fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {k === "⌫" ? <Delete style={{ width: 14, height: 14, color: "#999" }} /> : k}
                        </motion.button>
                      ))}
                    </div>

                    <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} disabled={!input || !enough} onClick={() => onConfirm(tendered)}
                      style={{ ...btn("#16a34a", "#fff", { marginBottom: 6 }), cursor: !input || !enough ? "not-allowed" : "pointer", opacity: !input || !enough ? 0.4 : 1 }}>
                      Confirm Payment
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} style={{ ...btn("transparent", "#bbb"), padding: "9px", fontSize: 12 }}>Cancel</motion.button>
                  </>
                ) : (
                  <AnimatePresence mode="wait">
                    {!gcashDone ? (
                      <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 14, padding: "16px 16px 12px", marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 7, background: "#0070BA", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>G</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0070BA" }}>GCash</span>
                          </div>
                          <img src="/gcashQR1.png" alt="GCash QR" style={{ width: 164, height: 164, borderRadius: 10, objectFit: "contain", background: "#fff", border: "1px solid #efefef" }} />
                          <p style={{ fontSize: 10, color: "#aaa", marginTop: 10, textAlign: "center", lineHeight: 1.6 }}>Ask customer to scan with GCash app</p>
                          <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 2 }}>₱{fmt(amountDue)}</p>
                        </div>
                        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 12px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontSize: 13, marginTop: 1 }}>💡</span>
                          <p style={{ fontSize: 11, color: "#92400e", lineHeight: 1.55, margin: 0 }}>
                            Check your GCash app to confirm you received <strong>₱{fmt(amountDue)}</strong>, then tap below.
                          </p>
                        </div>
                        <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} onClick={handleGcash} style={{ ...btn("#0070BA", "#fff", { marginBottom: 6 }) }}>Payment Received</motion.button>
                        <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel} style={{ ...btn("transparent", "#bbb"), padding: "9px", fontSize: 12 }}>Cancel</motion.button>
                      </motion.div>
                    ) : (
                      <motion.div key="done" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 26 }}
                        style={{ textAlign: "center", padding: "32px 0 28px" }}>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 24, delay: 0.05 }}
                          style={{ width: 56, height: 56, borderRadius: "50%", background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                          <Check style={{ width: 22, height: 22, color: "#22c55e" }} strokeWidth={2.5} />
                        </motion.div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 4 }}>Payment confirmed!</p>
                        <p style={{ fontSize: 11, color: "#bbb" }}>Opening receipt…</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── SUCCESS MODAL ────────────────────────────────────────────────────────────
function SuccessModal({ show, onClose, orderNumber, savedCart, paidAmount, cashTendered, changeAmount, orderType, paymentMethod, customerType, discountAmount, vatAmount }: {
  show: boolean; onClose: () => void; orderNumber: string; savedCart: CartItem[];
  paidAmount: number; cashTendered: number; changeAmount: number; orderType: string;
  paymentMethod: string; customerType: CustomerType; discountAmount: number; vatAmount: number;
}) {
  const { date, time } = getNow();
  const label: Record<CustomerType, string> = { regular: "Regular", pwd: "PWD", senior: "Senior Citizen" };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, backdropFilter: "blur(2px)", background: "rgba(144,142,142,0.6)" }} />
          <div style={{ position: "fixed", inset: 0, zIndex: 71, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              style={{ background: "#fff", width: "100%", maxWidth: 320, borderRadius: 20, overflow: "hidden", border: "1px solid #ebebeb", pointerEvents: "auto", fontFamily: F }}>

              {/* Header */}
              <div style={{ padding: "28px 22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 460, damping: 24, delay: 0.08 }}
                  style={{ width: 48, height: 48, borderRadius: "50%", background: "#f0fdf4", border: "1px solid #bbf7d0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <Check style={{ width: 20, height: 20, color: "#22c55e" }} strokeWidth={2.5} />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 5 }}>Order placed successfully</p>
                  <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.65, fontWeight: 400 }}>Order {orderNumber} is confirmed.<br />We'll start preparing right away!</p>
                </motion.div>
                <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.28, duration: 0.35 }}
                  style={{ width: 24, height: 2, background: "#6ee7b7", borderRadius: 2, marginTop: 14, transformOrigin: "center" }} />
              </div>

              <div style={{ borderTop: "1px solid #f5f5f5" }} />

              {/* Meta */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                {[{ icon: <Hash style={{ width: 11, height: 11 }} />, label: "Order ID", value: orderNumber },
                  { icon: <Calendar style={{ width: 11, height: 11 }} />, label: "Date", value: date },
                  { icon: <Clock style={{ width: 11, height: 11 }} />, label: "Time", value: time }].map(({ icon, label: l, value }, i) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 6px", borderRight: i < 2 ? "1px solid #f5f5f5" : "none", textAlign: "center" }}>
                    <span style={{ color: "#ddd", marginBottom: 3 }}>{icon}</span>
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{l}</p>
                    <p style={{ fontSize: 11, fontWeight: 500, color: "#374151", lineHeight: 1.3 }}>{value}</p>
                  </div>
                ))}
              </motion.div>

              <div style={{ borderTop: "1px solid #f5f5f5" }} />

              {/* Badges */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }} style={{ padding: "10px 16px 4px", display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[orderType, paymentMethod, ...(customerType !== "regular" ? [label[customerType]] : [])].map((b) => (
                  <span key={b} style={{ fontSize: 10, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#f5f5f5", color: "#777", textTransform: "capitalize" }}>{b}</span>
                ))}
              </motion.div>

              {/* Items */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} style={{ padding: "4px 16px 10px", maxHeight: 120, overflowY: "auto" }}>
                {savedCart.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #f5f5f5" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#777" }}>{item.name}</span>
                      <span style={{ fontSize: 9, fontWeight: 500, background: "#f5f5f5", color: "#aaa", padding: "1px 5px", borderRadius: 4, marginLeft: 5 }}>×{item.quantity}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#374151" }}>₱{fmt(item.price * item.quantity)}</span>
                  </div>
                ))}
              </motion.div>

              {/* Pricing */}
              <div style={{ margin: "0 16px 14px", border: "1px solid #f5f5f5", borderRadius: 12, overflow: "hidden" }}>
                {customerType !== "regular" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px dashed #f5f5f5" }}>
                      <span style={{ fontSize: 11, color: "#bbb" }}>VAT exempt</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}>₱{fmt(vatAmount)} exempt</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px dashed #f5f5f5" }}>
                      <span style={{ fontSize: 11, color: "#bbb" }}>Discount (20% {label[customerType]})</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#22c55e" }}>−₱{fmt(discountAmount)}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px dashed #f5f5f5" }}>
                    <span style={{ fontSize: 11, color: "#bbb" }}>VAT (12% incl.)</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}>₱{fmt(vatAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f9f9f9" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#777" }}>Total Paid</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "#111" }}>₱{fmt(paidAmount)}</span>
                </div>
                {paymentMethod === "cash" && changeAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#f0fdf4", borderTop: "1px dashed #bbf7d0" }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#16a34a" }}>Change</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>₱{fmt(changeAmount)}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                <motion.button whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} onClick={onClose} style={{ ...btn("#111", "#fff"), fontSize: 12 }}>New Order</motion.button>
                <button onClick={onClose} style={{ ...btn("transparent", "#bbb"), padding: "9px", fontSize: 12 }}>Close</button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function CashierView() {
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"dine-in" | "take-out" | "delivery">("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "e-payment">("cash");
  const [customerType, setCustomerType] = useState<CustomerType>("regular");
  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [showAmountEntry, setShowAmountEntry] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedCart, setSavedCart] = useState<CartItem[]>([]);
  const [savedMeta, setSavedMeta] = useState({ orderType: "dine-in", paymentMethod: "cash", customerType: "regular" as CustomerType });
  const [savedPricing, setSavedPricing] = useState({ amountDue: 0, discountAmount: 0, vatAmount: 0 });
  const [savedCash, setSavedCash] = useState({ tendered: 0, change: 0 });
  const [orderNumber, setOrderNumber] = useState("");
  const [placing, setPlacing] = useState(false);

  const TABS = [
    { key: "ALL", label: "All items", match: [] as string[] },
    { key: "WHOLE_HALF", label: "Whole & Half Chicken", match: ["WHOLE & HALF CHICKEN", "WHOLE AND HALF CHICKEN", "CHICKEN"] },
    { key: "RICE_MEALS", label: "Rice Meals", match: ["RICE MEALS", "RICE MEAL", "MENU FOOD"] },
    { key: "SIDES", label: "Sides", match: ["SIDES", "SIDE DISH", "SIDE DISHES", "SUPPLIES"] },
    { key: "FRUIT_SODA", label: "Fruit Soda", match: ["FRUIT SODA", "FRUIT SODAS", "DRINKS", "BEVERAGES"] },
  ];

  useEffect(() => {
    setLoadingProducts(true);
    api.get<Record<string, unknown>[]>("/inventory")
      .then((d) => { setProducts(mapProducts(d ?? [])); setProductsError(""); })
      .catch(() => setProductsError("Failed to load menu items."))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    if (orderType !== "dine-in") { setSelectedTable(null); return; }
    api.get<Record<string, unknown>[]>("/tables")
      .then((d) => setTables(mapTables(d ?? [])))
      .catch(() => setTables([]));
  }, [orderType]);

  const filtered = products.filter((p) => {
    const cu = p.category.toUpperCase();
    const tabOk = selectedCategory === "ALL" || (TABS.find((t) => t.key === selectedCategory)?.match ?? []).some((m) => cu.includes(m));
    return tabOk && p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const gross = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const pricing = computePricing(gross, customerType);

  const addToCart = useCallback((item: MenuItem) => {
    if (item.remainingStock <= 0 && !isFood(item)) return;
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      if (ex) {
        const next = ex.quantity + 1;
        if (next > item.remainingStock && !isFood(item)) return prev;
        return prev.map((c) => c.id === item.id ? { ...c, quantity: next } : c);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = (id: number) => setCart((p) => p.filter((c) => c.id !== id));

  const updateQty = (id: number, delta: number) => {
    const prod = products.find((p) => p.id === id);
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = Math.max(0, item.quantity + delta);
        if (next > (prod?.remainingStock ?? 0) && !isFood(item)) return item;
        return { ...item, quantity: next };
      }).filter((i) => i.quantity > 0)
    );
  };

  const handleAmountConfirmed = async (tendered: number) => {
    setShowAmountEntry(false);
    setPlacing(true);
    const { vatExemptAmount, vatAmount, discountAmount, amountDue } = computePricing(gross, customerType);
    const change = Math.max(0, tendered - amountDue);
    const cashierId = localStorage.getItem("userId");

    const payload: OrderPayload = {
      items: cart.map((i) => ({ product_id: i.id, qty: i.quantity, subtotal: i.price * i.quantity, name: i.name, price: i.price })),
      total: amountDue, order_type: orderType, payment_method: paymentMethod, customer_type: customerType,
      discount_amount: discountAmount, vat_amount: vatAmount, vat_exempt_amount: vatExemptAmount,
      cashierId: cashierId ? Number(cashierId) : null,
      table_id: orderType === "dine-in" ? selectedTable : null,
      ...(paymentMethod === "cash" && { cash_tendered: tendered, change_amount: change }),
    };

    try {
      const res = await api.post<{ orderNumber?: string }>("/orders", payload);
      const num = res?.orderNumber ?? `#${Math.floor(10000 + Math.random() * 90000)}`;
      setSavedCart([...cart]);
      setSavedMeta({ orderType, paymentMethod, customerType });
      setSavedPricing({ amountDue, discountAmount, vatAmount });
      setSavedCash({ tendered, change });
      setOrderNumber(num);
      setShowSuccess(true);
      setProducts((prev) => prev.map((p) => {
        const o = cart.find((c) => c.id === p.id);
        return o && !isFood(p) ? { ...p, remainingStock: Math.max(0, p.remainingStock - o.quantity) } : p;
      }));
      if (selectedTable !== null) setTables((prev) => prev.map((t) => t.id === selectedTable ? { ...t, status: "occupied" } : t));
    } catch (err) {
      console.error("Order failed:", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const resetOrder = () => {
    setShowSuccess(false); setCart([]); setSavedCart([]);
    setOrderType("dine-in"); setPaymentMethod("cash"); setCustomerType("regular");
    setSelectedTable(null); setSavedCash({ tendered: 0, change: 0 });
  };

  const Spinner = ({ size = 20, light = false }: { size?: number; light?: boolean }) => (
    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${light ? "rgba(255,255,255,0.3)" : "#eee"}`, borderTopColor: light ? "#fff" : "#555" }} />
  );

  return (
    <>
      <Sidebar />
      <style>{`* { scrollbar-width: none; } *::-webkit-scrollbar { display: none; }`}</style>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: F, background: "#fff", paddingLeft: 80 }}>

        {/* ── LEFT: Menu ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 16px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", background: "#fff", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 500, color: "#bbb", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>Cashier</p>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: "#111", letterSpacing: "-0.3px" }}>Menu</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f7f7f7", border: "1px solid #efefef", borderRadius: 10, padding: "7px 12px", width: 200 }}>
              <Search style={{ width: 13, height: 13, color: "#bbb", flexShrink: 0 }} />
              <input type="text" placeholder="Search menu…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, fontFamily: F, color: "#333", width: "100%" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 4, padding: "10px 24px", borderBottom: "1px solid #f0f0f0", flexShrink: 0, overflow: "hidden" }}>
            {TABS.map((tab) => (
              <motion.button key={tab.key} onClick={() => setSelectedCategory(tab.key)} whileTap={{ scale: 0.95 }}
                style={{ padding: "5px 13px", fontSize: 11, fontFamily: F, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", whiteSpace: "nowrap", fontWeight: selectedCategory === tab.key ? 500 : 400, color: selectedCategory === tab.key ? "#fff" : "#aaa", background: selectedCategory === tab.key ? "#111" : "transparent", transition: "all 0.15s" }}>
                {tab.label}
              </motion.button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 20px" }}>
            {loadingProducts ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><Spinner /></div>
            ) : productsError ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <p style={{ fontSize: 13, color: "#f87171", fontFamily: F }}>{productsError}</p>
              </div>
            ) : (
              <motion.div layout style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 10, alignContent: "start" }}>
                <AnimatePresence>
                  {filtered.map((item, i) => (
                    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.02, duration: 0.18 }}>
                      <ProductCard item={item} onAdd={addToCart} inCart={cart.some((c) => c.id === item.id)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {filtered.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 8 }}>
                    <UtensilsCrossed style={{ width: 28, height: 28, color: "#ddd" }} />
                    <p style={{ fontSize: 12, color: "#ccc", fontFamily: F }}>No items found</p>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart ── */}
        <div style={{ width: 268, flexShrink: 0, borderLeft: "1px solid #f0f0f0", display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ padding: "20px 18px 14px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "#111", fontFamily: F }}>Current Order</h2>
              <p style={{ fontSize: 11, color: "#bbb", marginTop: 1, fontFamily: F }}>{totalQty === 0 ? "No items yet" : `${totalQty} item${totalQty > 1 ? "s" : ""}`}</p>
            </div>
            <AnimatePresence>
              {totalQty > 0 && (
                <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={SP}
                  style={{ background: "#111", color: "#fff", fontSize: 10, fontWeight: 600, borderRadius: 20, padding: "2px 8px", fontFamily: F }}>
                  {totalQty}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
            <AnimatePresence>
              {cart.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 40 }}>
                  <UtensilsCrossed style={{ width: 28, height: 28, color: "#ddd" }} />
                  <p style={{ fontSize: 12, color: "#ccc", fontFamily: F }}>Add items to start</p>
                </motion.div>
              ) : cart.map((item) => <CartRow key={item.id} item={item} onRemove={removeFromCart} onQty={updateQty} />)}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={SP}
                style={{ padding: "14px 18px 18px", borderTop: "1px solid #f5f5f5", flexShrink: 0 }}>

                {/* Pricing breakdown */}
                <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                  {[{ label: "Subtotal", val: fmt(gross), color: "#999" },
                    customerType === "regular"
                      ? { label: "VAT (12% incl.)", val: fmt(pricing.vatAmount), color: "#999" }
                      : { label: "VAT exempt", val: `-₱${fmt(gross - pricing.vatExemptAmount)}`, color: "#999" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px dashed #f0f0f0" }}>
                      <span style={{ fontSize: 11, color: "#bbb" }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color }}>₱{val}</span>
                    </div>
                  ))}
                  <AnimatePresence>
                    {customerType !== "regular" && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}
                        style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px dashed #f0f0f0", overflow: "hidden" }}>
                        <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 500 }}>20% discount</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e" }}>−₱{fmt(pricing.discountAmount)}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f5f5f5" }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#777" }}>Total</span>
                    <motion.span key={pricing.amountDue} initial={{ scale: 0.95, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.15 }}
                      style={{ fontSize: 19, fontWeight: 600, color: "#111", fontFamily: F }}>
                      ₱{fmt(pricing.amountDue)}
                    </motion.span>
                  </div>
                </div>

                {/* Selects */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <CustomSelect value={orderType} onChange={(v) => setOrderType(v as typeof orderType)}
                    options={[{ value: "dine-in", label: "Dine in" }, { value: "take-out", label: "Take out" }, { value: "delivery", label: "Delivery" }]} />
                  <CustomSelect value={paymentMethod} onChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                    options={[{ value: "cash", label: "Cash" }, { value: "e-payment", label: "E-Payment" }]} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <CustomSelect value={customerType} onChange={(v) => setCustomerType(v as CustomerType)}
                    options={[{ value: "regular", label: "Regular customer" }, { value: "pwd", label: "PWD (20% off, VAT exempt)" }, { value: "senior", label: "Senior Citizen (20% off, VAT exempt)" }]} />
                </div>

                {/* Pay button */}
                <motion.button onClick={() => { if (!placing && cart.length > 0) setShowAmountEntry(true); }} disabled={placing}
                  whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
                  style={{ ...btn("#16a34a", "#fff"), cursor: placing ? "not-allowed" : "pointer", opacity: placing ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.01em" }}>
                  {placing ? <><Spinner size={14} light /> Processing…</> : `Pay ₱${fmt(pricing.amountDue)}`}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AmountEntryModal show={showAmountEntry} amountDue={pricing.amountDue} paymentMethod={paymentMethod}
        onConfirm={(t) => { void handleAmountConfirmed(t); }} onCancel={() => setShowAmountEntry(false)} />

      <SuccessModal show={showSuccess} onClose={resetOrder} orderNumber={orderNumber} savedCart={savedCart}
        paidAmount={savedPricing.amountDue} cashTendered={savedCash.tendered} changeAmount={savedCash.change}
        orderType={savedMeta.orderType} paymentMethod={savedMeta.paymentMethod} customerType={savedMeta.customerType}
        discountAmount={savedPricing.discountAmount} vatAmount={savedPricing.vatAmount} />
    </>
  );
}