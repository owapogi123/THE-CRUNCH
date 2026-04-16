import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  Minus,
  Plus,
  Trash2,
  UtensilsCrossed,
  Check,
  Clock,
  Calendar,
  Hash,
  ChevronDown,
  Delete,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";

// ─── FONT ─────────────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("poppins-font")) {
  const link = document.createElement("link");
  link.id = "poppins-font";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap";
  document.head.appendChild(link);
}
const FONT = "'Poppins', sans-serif";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const VAT_RATE = 0.12;
const DISCOUNT_RATE = 0.2;

// ─── TYPES ────────────────────────────────────────────────────────────────────
type CustomerType = "regular" | "pwd" | "senior";

interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
  remainingStock: number;
  image?: string | null;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface TableItem {
  id: number;
  number: number;
  status: "available" | "occupied";
  seats?: number;
}

interface OrderPayload {
  items: {
    product_id: number;
    qty: number;
    subtotal: number;
    name: string;
    price: number;
  }[];
  total: number;
  order_type: "dine-in" | "take-out" | "delivery";
  payment_method: "cash" | "e-payment";
  customer_type: CustomerType;
  discount_amount: number;
  vat_amount: number;
  vat_exempt_amount: number;
  cashierId: number | null;
  table_id: number | null;
  cash_tendered?: number;
  change_amount?: number;
}

interface OrderResponse {
  orderNumber?: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const isMenuFood = (item: MenuItem) =>
  item.category.toUpperCase().includes("MENU FOOD");

const formatPrice = (n: number): string => {
  const [int, dec] = n.toFixed(2).split(".");
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec === "00" ? formatted : `${formatted}.${dec}`;
};

const getNow = () => {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: now.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

function computePricing(gross: number, customerType: CustomerType) {
  if (customerType === "regular") {
    const vatAmount = gross * (VAT_RATE / (1 + VAT_RATE));
    return {
      gross,
      vatExemptAmount: 0,
      vatAmount,
      discountAmount: 0,
      amountDue: gross,
    };
  }
  const vatExemptBase = gross / (1 + VAT_RATE);
  const discountAmount = vatExemptBase * DISCOUNT_RATE;
  return {
    gross,
    vatExemptAmount: vatExemptBase,
    vatAmount: 0,
    discountAmount,
    amountDue: vatExemptBase - discountAmount,
  };
}

function mapProducts(data: Record<string, unknown>[]): MenuItem[] {
  const dedupedMap = new Map<string, Record<string, unknown>>();
  for (const p of data ?? []) {
    if (p.isRawMaterial) continue;
    const key = String(p.product_name ?? p.name ?? "").trim().toLowerCase();
    const existing = dedupedMap.get(key);
    if (
      !existing ||
      Number(p.product_id ?? p.id ?? 0) >
        Number(existing.product_id ?? existing.id ?? 0)
    ) {
      dedupedMap.set(key, p);
    }
  }
  return Array.from(dedupedMap.values()).map((p) => ({
    id: Number(p.product_id ?? p.id),
    name: String(p.product_name ?? p.name ?? `Product #${p.id}`),
    price: Number(p.price ?? 0),
    category: String(p.category ?? "UNCATEGORIZED").toUpperCase(),
    remainingStock: Number(p.dailyWithdrawn ?? 0),
    image: p.image ? String(p.image) : null,
  }));
}

function mapTables(data: Record<string, unknown>[]): TableItem[] {
  return (data ?? []).map((t) => ({
    id: Number(t.id ?? t.table_id),
    number: Number(t.number ?? t.table_number ?? t.id),
    status: (t.status as "available" | "occupied") ?? "available",
    seats: t.seats ? Number(t.seats) : undefined,
  }));
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({
  item,
  onAdd,
  inCart,
}: {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  inCart: boolean;
}) {
  const isOut = item.remainingStock <= 0 && !isMenuFood(item);

  return (
    <motion.button
      layout
      onClick={() => { if (!isOut) onAdd(item); }}
      disabled={isOut}
      whileHover={!isOut ? { y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.07)" } : {}}
      whileTap={!isOut ? { scale: 0.96 } : {}}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      style={{
        position: "relative",
        width: "100%",
        textAlign: "left",
        overflow: "hidden",
        borderRadius: 14,
        background: "#fff",
        border: `1px solid ${inCart ? "#111" : "#efefef"}`,
        opacity: isOut ? 0.4 : 1,
        cursor: isOut ? "not-allowed" : "pointer",
        fontFamily: FONT,
        padding: 0,
        boxShadow: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: "#f7f7f7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UtensilsCrossed style={{ width: 22, height: 22, color: "#ddd" }} />
      </div>

      <div style={{ padding: "9px 10px 10px" }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#222",
            lineHeight: 1.35,
            marginBottom: 7,
          }}
        >
          {item.name}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
            ₱{formatPrice(item.price)}
          </span>
          {!isMenuFood(item) && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 5,
                background: isOut ? "#fff0f0" : "#f5f5f5",
                color: isOut ? "#f87171" : "#bbb",
              }}
            >
              {isOut ? "Out" : item.remainingStock}
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {inCart && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Check style={{ width: 9, height: 9, color: "#fff" }} strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── CART ROW ─────────────────────────────────────────────────────────────────
function CartRow({
  item,
  onRemove,
  onQty,
}: {
  item: CartItem;
  onRemove: (id: number) => void;
  onQty: (id: number, delta: number) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 0",
        borderBottom: "1px solid #f5f5f5",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: "#f7f7f7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <UtensilsCrossed style={{ width: 13, height: 13, color: "#ddd" }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#222",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </p>
        <p style={{ fontSize: 10, color: "#bbb", marginTop: 1 }}>
          ₱{formatPrice(item.price)}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onQty(item.id, -1)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            border: "1px solid #eee",
            background: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Minus style={{ width: 10, height: 10, color: "#666" }} />
        </motion.button>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#111",
            minWidth: 16,
            textAlign: "center",
          }}
        >
          {item.quantity}
        </span>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onQty(item.id, 1)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            border: "1px solid #eee",
            background: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus style={{ width: 10, height: 10, color: "#666" }} />
        </motion.button>
      </div>

      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#111",
          minWidth: 40,
          textAlign: "right",
        }}
      >
        ₱{formatPrice(item.price * item.quantity)}
      </span>

      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => onRemove(item.id)}
        style={{
          width: 22,
          height: 22,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <Trash2 style={{ width: 12, height: 12, color: "#ccc" }} />
      </motion.button>
    </motion.div>
  );
}

// ─── TABLE PICKER ─────────────────────────────────────────────────────────────
function TablePicker({
  tables,
  selectedTable,
  onSelect,
  isLoading,
}: {
  tables: TableItem[];
  selectedTable: number | null;
  onSelect: (id: number | null) => void;
  isLoading: boolean;
}) {
  return (
    <div
      style={{
        background: "#fafafa",
        border: "1px solid #f0f0f0",
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 10,
        fontFamily: FONT,
      }}
    >
      <p
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: "#bbb",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 8,
        }}
      >
        Table
      </p>
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid #eee",
              borderTopColor: "#999",
            }}
          />
        </div>
      ) : tables.length === 0 ? (
        <p style={{ fontSize: 11, color: "#ccc" }}>No tables available</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))",
            gap: 5,
          }}
        >
          {tables.map((t) => {
            const isOccupied = t.status === "occupied";
            const isSelected = selectedTable === t.id;
            return (
              <motion.button
                key={t.id}
                whileTap={!isOccupied ? { scale: 0.9 } : {}}
                onClick={() => !isOccupied && onSelect(isSelected ? null : t.id)}
                disabled={isOccupied}
                style={{
                  padding: "6px 4px",
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? "#111" : isOccupied ? "#fecaca" : "#eee"}`,
                  background: isSelected ? "#111" : isOccupied ? "#fff5f5" : "#fff",
                  cursor: isOccupied ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                  fontFamily: FONT,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: isSelected ? "#fff" : isOccupied ? "#f87171" : "#333",
                  }}
                >
                  T{t.number}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: isSelected
                      ? "rgba(255,255,255,0.55)"
                      : isOccupied
                      ? "#fca5a5"
                      : "#bbb",
                  }}
                >
                  {isOccupied ? "busy" : "free"}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CUSTOM SELECT ────────────────────────────────────────────────────────────
function CustomSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "7px 24px 7px 10px",
          fontSize: 11,
          fontFamily: FONT,
          border: "1px solid #efefef",
          borderRadius: 9,
          background: "#fafafa",
          color: "#444",
          outline: "none",
          appearance: "none",
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          width: 10,
          height: 10,
          color: "#bbb",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── AMOUNT ENTRY MODAL ───────────────────────────────────────────────────────
/**
 * Shown before final order submission.
 * For cash payments: cashier enters tendered amount, sees change.
 * For e-payment: just a confirmation step with no numpad.
 */
function AmountEntryModal({
  show,
  amountDue,
  paymentMethod,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  amountDue: number;
  paymentMethod: "cash" | "e-payment";
  onConfirm: (cashTendered: number) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");

  // Reset input whenever the modal opens
  useEffect(() => {
    if (show) setInput("");
  }, [show]);

  const cashTendered = parseFloat(input) || 0;
  const change = cashTendered - amountDue;
  const hasEnough = cashTendered >= amountDue;

  // Numpad key handler
  const handleKey = (key: string) => {
    if (key === "⌫") {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (key === "00") {
      setInput((prev) => (prev === "" ? "" : prev + "00"));
      return;
    }
    // Prevent more than one decimal point
    if (key === "." && input.includes(".")) return;
    // Limit to 2 decimal places
    const dotIdx = input.indexOf(".");
    if (dotIdx !== -1 && input.length - dotIdx > 2) return;
    setInput((prev) => prev + key);
  };

  const NUMPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "00"];

  // Quick-fill buttons for common cash denominations
  const QUICK_AMOUNTS = [50, 100, 200, 500, 1000].filter((d) => d >= amountDue);

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Blurred backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCancel}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 60,
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              background: "rgba(0,0,0,0.35)",
            }}
          />

          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 61,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{
                background: "#fff",
                width: "100%",
                maxWidth: 320,
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid #ebebeb",
                pointerEvents: "auto",
                fontFamily: FONT,
              }}
            >
              {/* Header — amount due */}
              <div
                style={{
                  padding: "22px 22px 16px",
                  borderBottom: "1px solid #f5f5f5",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#bbb",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: 4,
                  }}
                >
                  Amount due
                </p>
                <p style={{ fontSize: 28, fontWeight: 600, color: "#111", margin: 0 }}>
                  ₱{formatPrice(amountDue)}
                </p>
              </div>

              <div style={{ padding: "14px 18px 18px" }}>
                {paymentMethod === "cash" ? (
                  <>
                    {/* Tendered display */}
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#bbb",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        marginBottom: 6,
                      }}
                    >
                      Cash tendered
                    </p>
                    <div
                      style={{
                        background: "#fafafa",
                        border: `1.5px solid ${input ? "#111" : "#e5e5e5"}`,
                        borderRadius: 10,
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 10,
                        minHeight: 44,
                      }}
                    >
                      <span style={{ fontSize: 14, color: "#aaa" }}>₱</span>
                      <span
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          color: input ? "#111" : "#ccc",
                          flex: 1,
                          letterSpacing: "-0.3px",
                        }}
                      >
                        {input || "0"}
                      </span>
                    </div>

                    {/* Quick-fill denominations */}
                    {QUICK_AMOUNTS.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 5,
                          marginBottom: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        {QUICK_AMOUNTS.slice(0, 5).map((amt) => (
                          <motion.button
                            key={amt}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => setInput(String(amt))}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 7,
                              border: "1px solid #efefef",
                              background: "#f7f7f7",
                              fontSize: 11,
                              fontWeight: 500,
                              color: "#555",
                              cursor: "pointer",
                              fontFamily: FONT,
                            }}
                          >
                            ₱{amt}
                          </motion.button>
                        ))}
                      </div>
                    )}

                    {/* Change & tendered summary */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          background: "#fafafa",
                          border: "1px solid #f0f0f0",
                          borderRadius: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <p style={{ fontSize: 10, color: "#bbb", marginBottom: 3 }}>
                          Change
                        </p>
                        <p
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: hasEnough && input ? "#16a34a" : "#ddd",
                            margin: 0,
                          }}
                        >
                          ₱{hasEnough && input ? formatPrice(change) : "—"}
                        </p>
                      </div>
                      <div
                        style={{
                          background: "#fafafa",
                          border: "1px solid #f0f0f0",
                          borderRadius: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <p style={{ fontSize: 10, color: "#bbb", marginBottom: 3 }}>
                          Tendered
                        </p>
                        <p
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: input ? "#111" : "#ddd",
                            margin: 0,
                          }}
                        >
                          {input ? `₱${formatPrice(cashTendered)}` : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Insufficient amount warning */}
                    <AnimatePresence>
                      {input && !hasEnough && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{
                            fontSize: 11,
                            color: "#f87171",
                            marginBottom: 8,
                            fontWeight: 500,
                          }}
                        >
                          ₱{formatPrice(amountDue - cashTendered)} short
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {/* Numpad */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      {NUMPAD_KEYS.map((key) => (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleKey(key)}
                          style={{
                            padding: "12px",
                            borderRadius: 9,
                            border: "1px solid #eee",
                            background: key === "⌫" ? "#fafafa" : "#fff",
                            fontSize: key === "⌫" ? 13 : 15,
                            fontWeight: 500,
                            color: key === "⌫" ? "#999" : "#222",
                            cursor: "pointer",
                            fontFamily: FONT,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {key === "⌫" ? (
                            <Delete style={{ width: 14, height: 14, color: "#999" }} />
                          ) : (
                            key
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </>
                ) : (
                  /* E-payment: just a confirmation message */
                  <div
                    style={{
                      textAlign: "center",
                      padding: "20px 0 16px",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 12px",
                      }}
                    >
                      <Check style={{ width: 20, height: 20, color: "#22c55e" }} strokeWidth={2.5} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 4 }}>
                      E-payment confirmed?
                    </p>
                    <p style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>
                      Ensure the payment of{" "}
                      <strong style={{ color: "#111" }}>₱{formatPrice(amountDue)}</strong> has
                      been received before confirming.
                    </p>
                  </div>
                )}

                {/* Confirm button */}
                <motion.button
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={paymentMethod === "cash" && (!input || !hasEnough)}
                  onClick={() =>
                    onConfirm(paymentMethod === "cash" ? cashTendered : amountDue)
                  }
                  style={{
                    width: "100%",
                    padding: "13px",
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: FONT,
                    cursor:
                      paymentMethod === "cash" && (!input || !hasEnough)
                        ? "not-allowed"
                        : "pointer",
                    opacity: paymentMethod === "cash" && (!input || !hasEnough) ? 0.4 : 1,
                    marginBottom: 6,
                  }}
                >
                  Confirm Payment
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onCancel}
                  style={{
                    width: "100%",
                    padding: "9px",
                    background: "transparent",
                    color: "#bbb",
                    border: "none",
                    fontSize: 12,
                    fontFamily: FONT,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── SUCCESS MODAL ────────────────────────────────────────────────────────────
function SuccessModal({
  show,
  onClose,
  orderNumber,
  savedCart,
  paidAmount,
  cashTendered,
  changeAmount,
  orderType,
  paymentMethod,
  customerType,
  discountAmount,
  vatAmount,
}: {
  show: boolean;
  onClose: () => void;
  orderNumber: string;
  savedCart: CartItem[];
  paidAmount: number;
  cashTendered: number;
  changeAmount: number;
  orderType: string;
  paymentMethod: string;
  customerType: CustomerType;
  discountAmount: number;
  vatAmount: number;
}) {
  const { date, time } = getNow();
  const customerLabel: Record<CustomerType, string> = {
    regular: "Regular",
    pwd: "PWD",
    senior: "Senior Citizen",
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 70,
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              background: "rgba(144,142,142,0.6)",
            }}
          />

          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 71,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              style={{
                background: "#ffffff",
                width: "100%",
                maxWidth: 320,
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid #ebebeb",
                pointerEvents: "auto",
                fontFamily: FONT,
              }}
            >
              {/* Top */}
              <div
                style={{
                  padding: "28px 22px 18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 460, damping: 24, delay: 0.08 }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                  }}
                >
                  <Check style={{ width: 20, height: 20, color: "#22c55e" }} strokeWidth={2.5} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.16 }}
                >
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 5 }}>
                    Order placed successfully
                  </p>
                  <p style={{ fontSize: 11, color: "#aaa", lineHeight: 1.65, fontWeight: 400 }}>
                    Order {orderNumber} is confirmed.
                    <br />
                    We'll start preparing right away!
                  </p>
                </motion.div>

                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.28, duration: 0.35, ease: "easeOut" }}
                  style={{
                    width: 24,
                    height: 2,
                    background: "#6ee7b7",
                    borderRadius: 2,
                    marginTop: 14,
                    transformOrigin: "center",
                  }}
                />
              </div>

              <div style={{ borderTop: "1px solid #f5f5f5" }} />

              {/* Meta row */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.22 }}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}
              >
                {[
                  { icon: <Hash style={{ width: 11, height: 11 }} />, label: "Order ID", value: orderNumber },
                  { icon: <Calendar style={{ width: 11, height: 11 }} />, label: "Date", value: date },
                  { icon: <Clock style={{ width: 11, height: 11 }} />, label: "Time", value: time },
                ].map(({ icon, label, value }, i) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "12px 6px",
                      borderRight: i < 2 ? "1px solid #f5f5f5" : "none",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ color: "#ddd", marginBottom: 3 }}>{icon}</span>
                    <p
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "#bbb",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 2,
                      }}
                    >
                      {label}
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 500, color: "#374151", lineHeight: 1.3 }}>
                      {value}
                    </p>
                  </div>
                ))}
              </motion.div>

              <div style={{ borderTop: "1px solid #f5f5f5" }} />

              {/* Badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.28 }}
                style={{ padding: "10px 16px 4px", display: "flex", gap: 5, flexWrap: "wrap" }}
              >
                {[
                  orderType,
                  paymentMethod,
                  ...(customerType !== "regular" ? [customerLabel[customerType]] : []),
                ].map((badge) => (
                  <span
                    key={badge}
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "3px 10px",
                      borderRadius: 20,
                      background: "#f5f5f5",
                      color: "#777",
                      textTransform: "capitalize",
                    }}
                  >
                    {badge}
                  </span>
                ))}
              </motion.div>

              {/* Items */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{ padding: "4px 16px 10px", maxHeight: 120, overflowY: "auto" }}
              >
                {savedCart.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: "1px dashed #f5f5f5",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#777" }}>{item.name}</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 500,
                          background: "#f5f5f5",
                          color: "#aaa",
                          padding: "1px 5px",
                          borderRadius: 4,
                          marginLeft: 5,
                        }}
                      >
                        ×{item.quantity}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#374151" }}>
                      ₱{formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </motion.div>

              {/* Pricing summary */}
              <div
                style={{
                  margin: "0 16px 14px",
                  border: "1px solid #f5f5f5",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {customerType !== "regular" ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 14px",
                        borderBottom: "1px dashed #f5f5f5",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#bbb" }}>VAT exempt</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}>
                        ₱{formatPrice(vatAmount)} exempt
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 14px",
                        borderBottom: "1px dashed #f5f5f5",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#bbb" }}>
                        Discount (20% {customerLabel[customerType]})
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#22c55e" }}>
                        −₱{formatPrice(discountAmount)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 14px",
                      borderBottom: "1px dashed #f5f5f5",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#bbb" }}>VAT (12% incl.)</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}>
                      ₱{formatPrice(vatAmount)}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "#f9f9f9",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#777" }}>Total Paid</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "#111" }}>
                    ₱{formatPrice(paidAmount)}
                  </span>
                </div>

                {/* Change row — only for cash payments */}
                {paymentMethod === "cash" && changeAmount > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 14px",
                      background: "#f0fdf4",
                      borderTop: "1px dashed #bbf7d0",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#16a34a" }}>
                      Change
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>
                      ₱{formatPrice(changeAmount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div
                style={{
                  padding: "0 16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <motion.button
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  style={{
                    width: "100%",
                    padding: "12px",
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: FONT,
                    cursor: "pointer",
                  }}
                >
                  New Order
                </motion.button>
                <button
                  onClick={onClose}
                  style={{
                    width: "100%",
                    padding: "9px",
                    background: "transparent",
                    color: "#bbb",
                    border: "none",
                    fontSize: 12,
                    fontFamily: FONT,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
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
  // ── Product & UI state ──────────────────────────────────────────────────────
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Cart state ───────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"dine-in" | "take-out" | "delivery">("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "e-payment">("cash");
  const [customerType, setCustomerType] = useState<CustomerType>("regular");

  // ── Table state ──────────────────────────────────────────────────────────────
  const [tables, setTables] = useState<TableItem[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);

  // ── Payment flow state ───────────────────────────────────────────────────────
  const [showAmountEntry, setShowAmountEntry] = useState(false);   // Step 1: enter cash
  const [showSuccess, setShowSuccess] = useState(false);           // Step 2: success receipt

  // ── Saved order state (used by SuccessModal) ─────────────────────────────────
  const [savedCart, setSavedCart] = useState<CartItem[]>([]);
  const [savedOrderType, setSavedOrderType] = useState("dine-in");
  const [savedPaymentMethod, setSavedPaymentMethod] = useState("cash");
  const [savedCustomerType, setSavedCustomerType] = useState<CustomerType>("regular");
  const [savedPricing, setSavedPricing] = useState({
    amountDue: 0,
    discountAmount: 0,
    vatAmount: 0,
  });
  const [savedCashTendered, setSavedCashTendered] = useState(0);
  const [savedChangeAmount, setSavedChangeAmount] = useState(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // ── Fetch products on mount ──────────────────────────────────────────────────
  useEffect(() => {
    setIsLoadingProducts(true);
    api
      .get<Record<string, unknown>[]>("/inventory")
      .then((data) => {
        setProducts(mapProducts(data ?? []));
        setProductsError("");
      })
      .catch(() => setProductsError("Failed to load menu items."))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  // ── Fetch tables when dine-in is selected ───────────────────────────────────
  useEffect(() => {
    if (orderType !== "dine-in") {
      setSelectedTable(null);
      return;
    }
    setIsLoadingTables(true);
    api
      .get<Record<string, unknown>[]>("/tables")
      .then((data) => setTables(mapTables(data ?? [])))
      .catch(() => setTables([]))
      .finally(() => setIsLoadingTables(false));
  }, [orderType]);

  // ── Category tabs ────────────────────────────────────────────────────────────
  const CATEGORY_TABS = [
    { key: "ALL", label: "All items", match: [] as string[] },
    {
      key: "WHOLE_HALF",
      label: "Whole & Half Chicken",
      match: ["WHOLE & HALF CHICKEN", "WHOLE AND HALF CHICKEN", "CHICKEN"],
    },
    {
      key: "RICE_MEALS",
      label: "Rice Meals",
      match: ["RICE MEALS", "RICE MEAL", "MENU FOOD"],
    },
    {
      key: "SIDES",
      label: "Sides",
      match: ["SIDES", "SIDE DISH", "SIDE DISHES", "SUPPLIES"],
    },
    {
      key: "FRUIT_SODA",
      label: "Fruit Soda",
      match: ["FRUIT SODA", "FRUIT SODAS", "DRINKS", "BEVERAGES"],
    },
  ];

  const filteredProducts = products.filter((product) => {
    const categoryUpper = product.category.toUpperCase();
    const tabMatches =
      selectedCategory === "ALL" ||
      (CATEGORY_TABS.find((t) => t.key === selectedCategory)?.match ?? []).some((m) =>
        categoryUpper.includes(m)
      );
    return tabMatches && product.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ── Cart computed values ─────────────────────────────────────────────────────
  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const grossTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const pricing = computePricing(grossTotal, customerType);

  // ── Cart actions ─────────────────────────────────────────────────────────────
  const addToCart = useCallback(
    (item: MenuItem) => {
      if (item.remainingStock <= 0 && !isMenuFood(item)) return;
      setCart((prev) => {
        const existing = prev.find((c) => c.id === item.id);
        if (existing) {
          const nextQty = existing.quantity + 1;
          if (nextQty > item.remainingStock && !isMenuFood(item)) return prev;
          return prev.map((c) => (c.id === item.id ? { ...c, quantity: nextQty } : c));
        }
        return [...prev, { ...item, quantity: 1 }];
      });
    },
    []
  );

  const removeFromCart = (id: number) =>
    setCart((prev) => prev.filter((c) => c.id !== id));

  const updateCartQty = (id: number, delta: number) => {
    const product = products.find((p) => p.id === id);
    const stock = product?.remainingStock ?? 0;
    const isFood = product ? isMenuFood(product) : false;
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const nextQty = Math.max(0, item.quantity + delta);
          if (nextQty > stock && !isFood) return item;
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  // ── Payment flow ─────────────────────────────────────────────────────────────
  /**
   * Step 1: Open the amount entry modal.
   * For e-payment, this is a simple confirmation step.
   */
  const handlePayButtonClick = () => {
    if (cart.length === 0 || isPlacingOrder) return;
    setShowAmountEntry(true);
  };

  /**
   * Step 2: Cashier has confirmed the cash/e-payment amount.
   * Submit the order to the API and show the success receipt.
   */
  const handleAmountConfirmed = async (cashTendered: number) => {
    setShowAmountEntry(false);
    setIsPlacingOrder(true);

    const { gross, vatExemptAmount, vatAmount, discountAmount, amountDue } =
      computePricing(grossTotal, customerType);

    const changeAmount = Math.max(0, cashTendered - amountDue);
    const cashierId = localStorage.getItem("userId");

    const payload: OrderPayload = {
      items: cart.map((item) => ({
        product_id: item.id,
        qty: item.quantity,
        subtotal: item.price * item.quantity,
        name: item.name,
        price: item.price,
      })),
      total: amountDue,
      order_type: orderType,
      payment_method: paymentMethod,
      customer_type: customerType,
      discount_amount: discountAmount,
      vat_amount: vatAmount,
      vat_exempt_amount: vatExemptAmount,
      cashierId: cashierId ? Number(cashierId) : null,
      table_id: orderType === "dine-in" ? selectedTable : null,
      cash_tendered: paymentMethod === "cash" ? cashTendered : undefined,
      change_amount: paymentMethod === "cash" ? changeAmount : undefined,
    };

    try {
      const response = await api.post<OrderResponse>("/orders", payload);
      const num =
        response?.orderNumber ?? `#${Math.floor(10000 + Math.random() * 90000)}`;

      // Snapshot order details for the receipt modal
      setSavedCart([...cart]);
      setSavedOrderType(orderType);
      setSavedPaymentMethod(paymentMethod);
      setSavedCustomerType(customerType);
      setSavedPricing({ amountDue, discountAmount, vatAmount });
      setSavedCashTendered(cashTendered);
      setSavedChangeAmount(changeAmount);
      setOrderNumber(num);
      setShowSuccess(true);

      // Deduct stock for non-food items
      setProducts((prev) =>
        prev.map((product) => {
          const orderedItem = cart.find((c) => c.id === product.id);
          if (!orderedItem || isMenuFood(product)) return product;
          return {
            ...product,
            remainingStock: Math.max(0, product.remainingStock - orderedItem.quantity),
          };
        })
      );

      // Mark selected table as occupied
      if (selectedTable !== null) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === selectedTable ? { ...t, status: "occupied" } : t
          )
        );
      }
    } catch (err) {
      console.error("Order submission failed:", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  /**
   * Close success modal and reset all order state for a fresh order.
   */
  const handleCloseSuccessModal = () => {
    setShowSuccess(false);
    setCart([]);
    setSavedCart([]);
    setOrderType("dine-in");
    setPaymentMethod("cash");
    setCustomerType("regular");
    setSelectedTable(null);
    setSavedCashTendered(0);
    setSavedChangeAmount(0);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Sidebar />

      <style>{`
        * { scrollbar-width: none; }
        *::-webkit-scrollbar { display: none; }
      `}</style>

      <div
        style={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          fontFamily: FONT,
          background: "#fff",
          paddingLeft: 80,
        }}
      >
        {/* ── LEFT: Menu ─────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 24px 16px",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              background: "#fff",
              borderBottom: "1px solid #f0f0f0",
              flexShrink: 0,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "#bbb",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
              >
                Cashier
              </p>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#111",
                  letterSpacing: "-0.3px",
                }}
              >
                Menu
              </h1>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#f7f7f7",
                border: "1px solid #efefef",
                borderRadius: 10,
                padding: "7px 12px",
                width: 200,
              }}
            >
              <Search style={{ width: 13, height: 13, color: "#bbb", flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search menu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  fontSize: 12,
                  fontFamily: FONT,
                  color: "#333",
                  width: "100%",
                }}
              />
            </div>
          </div>

          {/* Category tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "10px 24px",
              borderBottom: "1px solid #f0f0f0",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {CATEGORY_TABS.map((tab) => (
              <motion.button
                key={tab.key}
                onClick={() => setSelectedCategory(tab.key)}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "5px 13px",
                  fontSize: 11,
                  fontFamily: FONT,
                  borderRadius: 8,
                  border: "1px solid transparent",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontWeight: selectedCategory === tab.key ? 500 : 400,
                  color: selectedCategory === tab.key ? "#fff" : "#aaa",
                  background: selectedCategory === tab.key ? "#111" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </motion.button>
            ))}
          </div>

          {/* Product grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 20px" }}>
            {isLoadingProducts && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "2px solid #eee",
                    borderTopColor: "#555",
                  }}
                />
              </div>
            )}

            {!isLoadingProducts && productsError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                }}
              >
                <p style={{ fontSize: 13, color: "#f87171", fontFamily: FONT }}>
                  {productsError}
                </p>
              </div>
            )}

            {!isLoadingProducts && !productsError && (
              <motion.div
                layout
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
                  gap: 10,
                  alignContent: "start",
                }}
              >
                <AnimatePresence>
                  {filteredProducts.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02, duration: 0.18 }}
                    >
                      <ProductCard
                        item={item}
                        onAdd={addToCart}
                        inCart={cart.some((c) => c.id === item.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>

                {filteredProducts.length === 0 && (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "80px 0",
                      gap: 8,
                    }}
                  >
                    <UtensilsCrossed style={{ width: 28, height: 28, color: "#ddd" }} />
                    <p style={{ fontSize: 12, color: "#ccc", fontFamily: FONT }}>
                      No items found
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart ─────────────────────────────────────────────────────── */}
        <div
          style={{
            width: 268,
            flexShrink: 0,
            borderLeft: "1px solid #f0f0f0",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
          }}
        >
          {/* Cart header */}
          <div
            style={{
              padding: "20px 18px 14px",
              borderBottom: "1px solid #f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111",
                  fontFamily: FONT,
                }}
              >
                Current Order
              </h2>
              <p style={{ fontSize: 11, color: "#bbb", marginTop: 1, fontFamily: FONT }}>
                {totalQuantity === 0
                  ? "No items yet"
                  : `${totalQuantity} item${totalQuantity > 1 ? "s" : ""}`}
              </p>
            </div>
            <AnimatePresence>
              {totalQuantity > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  style={{
                    background: "#111",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 20,
                    padding: "2px 8px",
                    fontFamily: FONT,
                  }}
                >
                  {totalQuantity}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
            <AnimatePresence>
              {cart.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingBottom: 40,
                  }}
                >
                  <UtensilsCrossed style={{ width: 28, height: 28, color: "#ddd" }} />
                  <p style={{ fontSize: 12, color: "#ccc", fontFamily: FONT }}>
                    Add items to start
                  </p>
                </motion.div>
              ) : (
                cart.map((item) => (
                  <CartRow
                    key={item.id}
                    item={item}
                    onRemove={removeFromCart}
                    onQty={updateCartQty}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Cart footer */}
          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                style={{
                  padding: "14px 18px 18px",
                  borderTop: "1px solid #f5f5f5",
                  flexShrink: 0,
                }}
              >
                {/* Pricing breakdown */}
                <div
                  style={{
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderBottom: "1px dashed #f0f0f0",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#bbb" }}>Subtotal</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#999" }}>
                      ₱{formatPrice(grossTotal)}
                    </span>
                  </div>

                  {customerType === "regular" ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderBottom: "1px dashed #f0f0f0",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#bbb" }}>VAT (12% incl.)</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#999" }}>
                        ₱{formatPrice(pricing.vatAmount)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderBottom: "1px dashed #f0f0f0",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#bbb" }}>VAT exempt</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: "#999" }}>
                          −₱{formatPrice(grossTotal - pricing.vatExemptAmount)}
                        </span>
                      </div>
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderBottom: "1px dashed #f0f0f0",
                          overflow: "hidden",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 500 }}>
                          20% discount
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#22c55e" }}>
                          −₱{formatPrice(pricing.discountAmount)}
                        </span>
                      </motion.div>
                    </>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      background: "#f5f5f5",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#777" }}>Total</span>
                    <motion.span
                      key={pricing.amountDue}
                      initial={{ scale: 0.95, opacity: 0.6 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        fontSize: 19,
                        fontWeight: 600,
                        color: "#111",
                        fontFamily: FONT,
                      }}
                    >
                      ₱{formatPrice(pricing.amountDue)}
                    </motion.span>
                  </div>
                </div>

                {/* Order type & payment method selects */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <CustomSelect
                    value={orderType}
                    onChange={(v) => setOrderType(v as typeof orderType)}
                    options={[
                      { value: "dine-in", label: "Dine in" },
                      { value: "take-out", label: "Take out" },
                      { value: "delivery", label: "Delivery" },
                    ]}
                  />
                  <CustomSelect
                    value={paymentMethod}
                    onChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                    options={[
                      { value: "cash", label: "Cash" },
                      { value: "e-payment", label: "E-Payment" },
                    ]}
                  />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <CustomSelect
                    value={customerType}
                    onChange={(v) => setCustomerType(v as CustomerType)}
                    options={[
                      { value: "regular", label: "Regular customer" },
                      { value: "pwd", label: "PWD (20% off, VAT exempt)" },
                      { value: "senior", label: "Senior Citizen (20% off, VAT exempt)" },
                    ]}
                  />
                </div>

                {/* Table picker (dine-in only) */}
                <AnimatePresence>
                  {orderType === "dine-in" && (
                    <motion.div
                      key="table-picker"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <TablePicker
                        tables={tables}
                        selectedTable={selectedTable}
                        onSelect={setSelectedTable}
                        isLoading={isLoadingTables}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pay button — opens amount entry modal */}
                <motion.button
                  onClick={handlePayButtonClick}
                  disabled={isPlacingOrder || cart.length === 0}
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    width: "100%",
                    padding: "13px",
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: FONT,
                    cursor: isPlacingOrder ? "not-allowed" : "pointer",
                    opacity: isPlacingOrder ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    letterSpacing: "0.01em",
                  }}
                >
                  {isPlacingOrder ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTopColor: "#fff",
                        }}
                      />
                      Processing…
                    </>
                  ) : (
                    `Pay ₱${formatPrice(pricing.amountDue)}`
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Amount Entry Modal (Step 1) ──────────────────────────────────────── */}
      <AmountEntryModal
        show={showAmountEntry}
        amountDue={pricing.amountDue}
        paymentMethod={paymentMethod}
        onConfirm={(cashTendered) => { void handleAmountConfirmed(cashTendered); }}
        onCancel={() => setShowAmountEntry(false)}
      />

      {/* ── Success / Receipt Modal (Step 2) ────────────────────────────────── */}
      <SuccessModal
        show={showSuccess}
        onClose={handleCloseSuccessModal}
        orderNumber={orderNumber}
        savedCart={savedCart}
        paidAmount={savedPricing.amountDue}
        cashTendered={savedCashTendered}
        changeAmount={savedChangeAmount}
        orderType={savedOrderType}
        paymentMethod={savedPaymentMethod}
        customerType={savedCustomerType}
        discountAmount={savedPricing.discountAmount}
        vatAmount={savedPricing.vatAmount}
      />
    </>
  );
}