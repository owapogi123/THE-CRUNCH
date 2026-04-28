import { useState, useCallback, useEffect } from "react";
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
import { api, apiCall } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── FONT ─────────────────────────────────────────────────────────────────────
if (
  typeof document !== "undefined" &&
  !document.getElementById("poppins-font")
) {
  const l = document.createElement("link");
  l.id = "poppins-font";
  l.rel = "stylesheet";
  l.href =
    "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}
const F = "'Poppins', sans-serif";
const SP = { type: "spring" as const, stiffness: 400, damping: 28 };

// ─── CONSTANTS & TYPES ────────────────────────────────────────────────────────
const VAT_RATE = 0.12;
const DISCOUNT_RATE = 0.2;
type CustomerType = "regular" | "pwd" | "senior";
type PaymentMethod = "cash" | "gcash_onsite";

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
interface OnlineNotif {
  id: number;
  orderNumber: string;
  total: number;
  createdAt: string;
  orderType: string;
  trackingStatus: string;
  handoverTimestamp?: string | null;
  riderName?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  items: { name: string; quantity: number }[];
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
  payment_method: PaymentMethod;
  payment_status?: "Paid";
  proof_image_url?: string;
  customer_type: CustomerType;
  discount_amount: number;
  vat_amount: number;
  vat_exempt_amount: number;
  cashierId: number | null;
  table_id: number | null;
  cash_tendered?: number;
  change_amount?: number;
}
interface ReceiptData {
  orderNumber: string;
  date: string;
  time: string;
  items: CartItem[];
  paidAmount: number;
  cashTendered: number;
  changeAmount: number;
  orderType: string;
  paymentMethod: string;
  customerType: CustomerType;
  discountAmount: number;
  vatAmount: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const isFood = (item: MenuItem) =>
  item.category.toUpperCase().includes("MENU FOOD");

const fmt = (n: number) => {
  const [int, dec] = n.toFixed(2).split(".");
  return (dec === "00" ? int : `${int}.${dec}`).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getNow = () => {
  const d = new Date();
  return {
    date: d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: d.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

const computePricing = (gross: number, ct: CustomerType) => {
  if (ct === "regular") {
    const vatAmount = gross * (VAT_RATE / (1 + VAT_RATE));
    return {
      gross,
      vatExemptAmount: 0,
      vatAmount,
      discountAmount: 0,
      amountDue: gross,
    };
  }
  const base = gross / (1 + VAT_RATE);
  const disc = base * DISCOUNT_RATE;
  return {
    gross,
    vatExemptAmount: base,
    vatAmount: 0,
    discountAmount: disc,
    amountDue: base - disc,
  };
};

const mapProducts = (data: Record<string, unknown>[]): MenuItem[] => {
  const map = new Map<string, Record<string, unknown>>();
  for (const p of data ?? []) {
    if (p.isRawMaterial) continue;
    const key = String(p.product_name ?? p.name ?? "")
      .trim()
      .toLowerCase();
    const ex = map.get(key);
    if (
      !ex ||
      Number(p.product_id ?? p.id ?? 0) > Number(ex.product_id ?? ex.id ?? 0)
    ) {
      map.set(key, p);
    }
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

const formatOrderTimestamp = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const buildReceiptHtml = ({
  orderNumber,
  date,
  time,
  items,
  paidAmount,
  cashTendered,
  changeAmount,
  orderType,
  paymentMethod,
  customerType,
  discountAmount,
  vatAmount,
}: ReceiptData) => {
  const paymentMethodLabel =
    paymentMethod === "cash"
      ? "Cash"
      : paymentMethod === "gcash_onsite"
        ? "Onsite E-Payment"
        : paymentMethod;
  const customerLabel: Record<CustomerType, string> = {
    regular: "Regular",
    pwd: "PWD",
    senior: "Senior Citizen",
  };

  const itemRows = items
    .map(
      (item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td class="qty">${item.quantity}</td>
      <td class="amount">PHP ${fmt(item.price)}</td>
      <td class="amount">PHP ${fmt(item.price * item.quantity)}</td>
    </tr>
  `,
    )
    .join("");

  const pricingRows =
    customerType !== "regular"
      ? `
      <div class="line"><span>Discount</span><strong>-PHP ${fmt(discountAmount)}</strong></div>
      <div class="line"><span>VAT Exempt</span><strong>PHP ${fmt(vatAmount)}</strong></div>
    `
      : `
      <div class="line"><span>VAT (12% incl.)</span><strong>PHP ${fmt(vatAmount)}</strong></div>
    `;

  const cashRows =
    paymentMethod === "cash"
      ? `
      <div class="line"><span>Cash Tendered</span><strong>PHP ${fmt(cashTendered)}</strong></div>
      <div class="line"><span>Change</span><strong>PHP ${fmt(changeAmount)}</strong></div>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt ${escapeHtml(orderNumber)}</title>
  <style>
    body {
      font-family: ${F};
      background: #f5f5f5;
      color: #111;
      margin: 0;
      padding: 24px;
    }
    .receipt {
      max-width: 420px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 24px;
      box-sizing: border-box;
    }
    .header {
      text-align: center;
      padding-bottom: 16px;
      border-bottom: 1px dashed #d1d5db;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 22px;
      margin: 0 0 4px;
    }
    .header p,
    .meta p,
    .footer p {
      margin: 0;
      color: #6b7280;
      font-size: 12px;
      line-height: 1.6;
    }
    .txn-badge {
      display: inline-block;
      margin-top: 10px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 4px 12px;
    }
    .txn-badge .txn-label {
      font-size: 9px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      display: block;
    }
    .txn-badge .txn-value {
      font-size: 13px;
      font-weight: 700;
      color: #111;
      letter-spacing: 0.04em;
    }
    .meta,
    .summary {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    th,
    td {
      padding: 8px 0;
      border-bottom: 1px dashed #e5e7eb;
      font-size: 12px;
      text-align: left;
      vertical-align: top;
    }
    .qty {
      text-align: center;
      width: 44px;
    }
    .amount {
      text-align: right;
      white-space: nowrap;
    }
    .total {
      padding-top: 12px;
      border-top: 1px solid #111;
      margin-top: 12px;
      font-size: 15px;
    }
    .footer {
      margin-top: 20px;
      text-align: center;
      border-top: 1px dashed #d1d5db;
      padding-top: 16px;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .receipt {
        border: none;
        border-radius: 0;
        max-width: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="receipt">
    <section class="header">
      <h1>The Crunch</h1>
      <p>Official Sales Receipt</p>
      <div class="txn-badge">
        <span class="txn-label">Transaction ID</span>
        <span class="txn-value">${escapeHtml(orderNumber)}</span>
      </div>
    </section>

    <section class="meta">
      <div class="line"><span>Date</span><strong>${escapeHtml(date)}</strong></div>
      <div class="line"><span>Time</span><strong>${escapeHtml(time)}</strong></div>
      <div class="line"><span>Order Type</span><strong>${escapeHtml(orderType)}</strong></div>
      <div class="line"><span>Payment</span><strong>${escapeHtml(paymentMethodLabel)}</strong></div>
      <div class="line"><span>Customer</span><strong>${escapeHtml(customerLabel[customerType])}</strong></div>
    </section>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="qty">Qty</th>
          <th class="amount">Price</th>
          <th class="amount">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <section class="summary">
      ${pricingRows}
      ${cashRows}
      <div class="line total"><span>Total Paid</span><strong>PHP ${fmt(paidAmount)}</strong></div>
    </section>

    <section class="footer">
      <p>Thank you for your order.</p>
      <p>Please keep this receipt for your records.</p>
    </section>
  </main>
</body>
</html>`;
};

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const btn = (bg: string, color: string, extra?: object) => ({
  width: "100%",
  padding: "13px",
  background: bg,
  color,
  border: "none",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: F,
  cursor: "pointer",
  ...extra,
});

// ─── PAYMENT STATUS BADGE ─────────────────────────────────────────────────────
function PaymentStatusBadge({
  paymentStatus,
  paymentMethod,
}: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
}) {
  const isPaid = paymentStatus?.toLowerCase() === "paid";

  const methodLabel = isPaid
    ? paymentMethod === "cash"
      ? " · Cash"
      : paymentMethod === "gcash_onsite"
        ? " · E-Payment"
        : paymentMethod
          ? ` · ${paymentMethod}`
          : ""
    : "";

  return isPaid ? (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 99,
        background: "#dcfce7",
        color: "#15803d",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        border: "1px solid #bbf7d0",
        whiteSpace: "nowrap",
      }}
    >
      ✓ Paid{methodLabel}
    </span>
  ) : (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 99,
        background: "#fef9c3",
        color: "#a16207",
        border: "1px solid #fde68a",
        whiteSpace: "nowrap",
      }}
    >
      Unpaid
    </span>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({
  item,
  onAdd,
  inCart,
}: {
  item: MenuItem;
  onAdd: (i: MenuItem) => void;
  inCart: boolean;
}) {
  const out = item.remainingStock <= 0 && !isFood(item);
  return (
    <motion.button
      layout
      onClick={() => !out && onAdd(item)}
      disabled={out}
      whileHover={
        !out ? { y: -2, boxShadow: "0 4px 16px rgba(0,0,0,0.07)" } : {}
      }
      whileTap={!out ? { scale: 0.96 } : {}}
      transition={SP}
      style={{
        position: "relative",
        width: "100%",
        textAlign: "left",
        overflow: "hidden",
        borderRadius: 14,
        background: "#fff",
        border: `1px solid ${inCart ? "#111" : "#efefef"}`,
        opacity: out ? 0.4 : 1,
        cursor: out ? "not-allowed" : "pointer",
        fontFamily: F,
        padding: 0,
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
          overflow: "hidden",
        }}
      >
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <UtensilsCrossed style={{ width: 22, height: 22, color: "#ddd" }} />
        )}
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
            ₱{fmt(item.price)}
          </span>
          {!isFood(item) && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 5,
                background: out ? "#fff0f0" : "#f5f5f5",
                color: out ? "#f87171" : "#bbb",
              }}
            >
              {out ? "Out" : item.remainingStock}
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
            transition={SP}
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
            <Check
              style={{ width: 9, height: 9, color: "#fff" }}
              strokeWidth={3}
            />
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
  onQty: (id: number, d: number) => void;
}) {
  const qtyBtn = (delta: number, icon: React.ReactNode) => (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={() => onQty(item.id, delta)}
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
      {icon}
    </motion.button>
  );
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={SP}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 0",
        borderBottom: "1px solid #f5f5f5",
        fontFamily: F,
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
          overflow: "hidden",
        }}
      >
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <UtensilsCrossed style={{ width: 13, height: 13, color: "#ddd" }} />
        )}
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
          ₱{fmt(item.price)}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {qtyBtn(-1, <Minus style={{ width: 10, height: 10, color: "#666" }} />)}
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
        {qtyBtn(1, <Plus style={{ width: 10, height: 10, color: "#666" }} />)}
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
        ₱{fmt(item.price * item.quantity)}
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
          fontFamily: F,
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

// ─── RIDER HANDOVER MODAL ─────────────────────────────────────────────────────
function RiderHandoverModal({
  show,
  order,
  riderName,
  saving,
  onChange,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  order: OnlineNotif | null;
  riderName: string;
  saving: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {show && order && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={saving ? undefined : onCancel}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 65,
              backdropFilter: "blur(3px)",
              background: "rgba(0,0,0,0.35)",
            }}
          />
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 66,
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
                maxWidth: 336,
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid #ebebeb",
                pointerEvents: "auto",
                fontFamily: F,
              }}
            >
              <div
                style={{
                  padding: "20px 20px 14px",
                  borderBottom: "1px solid #f5f5f5",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#16a34a",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: 5,
                  }}
                >
                  Delivery Handover
                </p>
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#111",
                    margin: 0,
                  }}
                >
                  {order.orderNumber}
                </p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>
                  Record the rider before marking this delivery as handed over.
                </p>
              </div>

              <div style={{ padding: "16px 18px 18px" }}>
                <div style={{ marginBottom: 12 }}>
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
                    Rider Name
                  </p>
                  <input
                    value={riderName}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Enter rider name"
                    disabled={saving}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 12,
                      fontFamily: F,
                      border: `1px solid ${riderName.trim() ? "#111" : "#efefef"}`,
                      borderRadius: 10,
                      background: "#fafafa",
                      color: "#333",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div
                  style={{
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 12,
                    padding: "10px 12px",
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "#9ca3af",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Order Type
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#065f46",
                        textTransform: "capitalize",
                      }}
                    >
                      {order.orderType}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "#9ca3af",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Amount
                    </span>
                    <span
                      style={{ fontSize: 11, fontWeight: 700, color: "#111" }}
                    >
                      ₱{Number(order.total).toFixed(2)}
                    </span>
                  </div>
                </div>

                <motion.button
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={saving || !riderName.trim()}
                  onClick={onConfirm}
                  style={{
                    ...btn("#111", "#fff", { marginBottom: 6 }),
                    cursor:
                      saving || !riderName.trim() ? "not-allowed" : "pointer",
                    opacity: saving || !riderName.trim() ? 0.45 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Confirm Handover"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onCancel}
                  disabled={saving}
                  style={{
                    ...btn("transparent", "#bbb"),
                    padding: "9px",
                    fontSize: 12,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.5 : 1,
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

// ─── AMOUNT ENTRY MODAL ───────────────────────────────────────────────────────
function AmountEntryModal({
  show,
  amountDue,
  paymentMethod,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  amountDue: number;
  paymentMethod: PaymentMethod;
  onConfirm: (payload: {
    tendered: number;
    selectedImage?: File;
    proofFileName?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState("");
  const [proofFileName, setProofFileName] = useState("");
  const [proofError, setProofError] = useState("");

  useEffect(() => {
    if (show) {
      setInput("");
      setSelectedImage(null);
      setPreviewURL("");
      setProofFileName("");
      setProofError("");
    }
  }, [show]);

  useEffect(() => {
    return () => {
      if (previewURL) URL.revokeObjectURL(previewURL);
    };
  }, [previewURL]);

  const tendered = parseFloat(input) || 0;
  const change = tendered - amountDue;
  const enough = tendered >= amountDue;
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "00"];
  const QUICK = [50, 100, 200, 500, 1000].filter((d) => d >= amountDue);

  const handleKey = (k: string) => {
    if (k === "⌫") return setInput((p) => p.slice(0, -1));
    if (k === "00") return setInput((p) => (p === "" ? "" : p + "00"));
    if (k === "." && input.includes(".")) return;
    const di = input.indexOf(".");
    if (di !== -1 && input.length - di > 2) return;
    setInput((p) => p + k);
  };

  const handleProofSelected = (file?: File | null) => {
    if (!file) {
      if (previewURL) URL.revokeObjectURL(previewURL);
      setSelectedImage(null);
      setPreviewURL("");
      setProofFileName("");
      setProofError("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setProofError("Please upload an image file for the payment proof.");
      if (previewURL) URL.revokeObjectURL(previewURL);
      setSelectedImage(null);
      setPreviewURL("");
      setProofFileName("");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProofError("Payment proof image must be 5 MB or smaller.");
      if (previewURL) URL.revokeObjectURL(previewURL);
      setSelectedImage(null);
      setPreviewURL("");
      setProofFileName("");
      return;
    }

    if (previewURL) URL.revokeObjectURL(previewURL);
    setSelectedImage(file);
    setPreviewURL(URL.createObjectURL(file));
    setProofFileName(file.name || `payment-proof-${Date.now()}.jpg`);
    setProofError("");
  };

  const gcashDone = false;
  const handleGcash = () => {};

  return (
    <AnimatePresence>
      {show && (
        <>
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
                fontFamily: F,
              }}
            >
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
                <p
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: "#111",
                    margin: 0,
                  }}
                >
                  ₱{fmt(amountDue)}
                </p>
              </div>

              <div style={{ padding: "14px 18px 18px" }}>
                {paymentMethod === "cash" ? (
                  <>
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
                        }}
                      >
                        {input || "0"}
                      </span>
                    </div>

                    {QUICK.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 5,
                          marginBottom: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        {QUICK.slice(0, 5).map((a) => (
                          <motion.button
                            key={a}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => setInput(String(a))}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 7,
                              border: "1px solid #efefef",
                              background: "#f7f7f7",
                              fontSize: 11,
                              fontWeight: 500,
                              color: "#555",
                              cursor: "pointer",
                              fontFamily: F,
                            }}
                          >
                            ₱{a}
                          </motion.button>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      {[
                        {
                          label: "Change",
                          val: enough && input ? `₱${fmt(change)}` : "—",
                          color: enough && input ? "#16a34a" : "#ddd",
                        },
                        {
                          label: "Tendered",
                          val: input ? `₱${fmt(tendered)}` : "—",
                          color: input ? "#111" : "#ddd",
                        },
                      ].map(({ label, val, color }) => (
                        <div
                          key={label}
                          style={{
                            background: "#fafafa",
                            border: "1px solid #f0f0f0",
                            borderRadius: 10,
                            padding: "10px 12px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: 10,
                              color: "#bbb",
                              marginBottom: 3,
                            }}
                          >
                            {label}
                          </p>
                          <p
                            style={{
                              fontSize: 16,
                              fontWeight: 600,
                              color,
                              margin: 0,
                            }}
                          >
                            {val}
                          </p>
                        </div>
                      ))}
                    </div>

                    <AnimatePresence>
                      {input && !enough && (
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
                          ₱{fmt(amountDue - tendered)} short
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      {KEYS.map((k) => (
                        <motion.button
                          key={k}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleKey(k)}
                          style={{
                            padding: "12px",
                            borderRadius: 9,
                            border: "1px solid #eee",
                            background: k === "⌫" ? "#fafafa" : "#fff",
                            fontSize: k === "⌫" ? 13 : 15,
                            fontWeight: 500,
                            color: k === "⌫" ? "#999" : "#222",
                            cursor: "pointer",
                            fontFamily: F,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {k === "⌫" ? (
                            <Delete
                              style={{ width: 14, height: 14, color: "#999" }}
                            />
                          ) : (
                            k
                          )}
                        </motion.button>
                      ))}
                    </div>

                    <motion.button
                      whileHover={{ opacity: 0.88 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={!input || !enough}
                      onClick={() => onConfirm({ tendered })}
                      style={{
                        ...btn("#16a34a", "#fff", { marginBottom: 6 }),
                        cursor: !input || !enough ? "not-allowed" : "pointer",
                        opacity: !input || !enough ? 0.4 : 1,
                      }}
                    >
                      Confirm Payment
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={onCancel}
                      style={{
                        ...btn("transparent", "#bbb"),
                        padding: "9px",
                        fontSize: 12,
                      }}
                    >
                      Cancel
                    </motion.button>
                  </>
                ) : paymentMethod === "gcash_onsite" ? (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        background: "#fafafa",
                        border: "1px solid #f0f0f0",
                        borderRadius: 14,
                        padding: "16px 16px 12px",
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 7,
                            background: "#0070BA",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            G
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#0070BA",
                          }}
                        >
                          Onsite GCash / E-Payment
                        </span>
                      </div>
                      <img
                        src="/gcashQR1.png"
                        alt="GCash QR"
                        style={{
                          width: 164,
                          height: 164,
                          borderRadius: 10,
                          objectFit: "contain",
                          background: "#fff",
                          border: "1px solid #efefef",
                        }}
                      />
                      <p
                        style={{
                          fontSize: 10,
                          color: "#aaa",
                          marginTop: 10,
                          textAlign: "center",
                          lineHeight: 1.6,
                        }}
                      >
                        Ask the customer to scan, then upload or capture the proof below.
                      </p>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#111",
                          marginTop: 2,
                        }}
                      >
                        ₱{fmt(amountDue)}
                      </p>
                    </div>

                    <div
                      style={{
                        background: previewURL ? "#eff6ff" : "#fffbeb",
                        border: `1px solid ${previewURL ? "#bfdbfe" : "#fde68a"}`,
                        borderRadius: 10,
                        padding: "9px 12px",
                        marginBottom: 14,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          color: previewURL ? "#1d4ed8" : "#92400e",
                          lineHeight: 1.55,
                          margin: 0,
                          fontWeight: 500,
                        }}
                      >
                        {previewURL
                          ? "Payment status: Pending Verification. Review the proof image, then click Confirm Payment."
                          : "Upload or capture the payment proof first. Payment will stay pending until the cashier confirms it."}
                      </p>
                    </div>

                    <div
                      style={{
                        marginBottom: 14,
                        border: "1px solid #f0f0f0",
                        borderRadius: 12,
                        padding: 12,
                        background: "#fff",
                      }}
                    >
                      <label
                        style={{
                          display: "block",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#888",
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          marginBottom: 8,
                        }}
                      >
                        Proof Image
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) =>
                          handleProofSelected(e.currentTarget.files?.[0] ?? null)
                        }
                        style={{
                          width: "100%",
                          fontFamily: F,
                          fontSize: 12,
                          color: "#444",
                          marginBottom: previewURL ? 12 : 0,
                        }}
                      />

                      {proofError && (
                        <p
                          style={{
                            fontSize: 11,
                            color: "#dc2626",
                            margin: "8px 0 0",
                            fontWeight: 500,
                          }}
                        >
                          {proofError}
                        </p>
                      )}

                      {previewURL && (
                        <div>
                          <div
                            style={{
                              borderRadius: 10,
                              overflow: "hidden",
                              border: "1px solid #e5e7eb",
                              background: "#fafafa",
                              marginBottom: 8,
                            }}
                          >
                            <img
                              src={previewURL}
                              alt="Payment proof preview"
                              style={{
                                width: "100%",
                                maxHeight: 220,
                                objectFit: "contain",
                                display: "block",
                                background: "#fff",
                              }}
                            />
                          </div>
                          <p
                            style={{
                              fontSize: 11,
                              color: "#666",
                              margin: "0 0 8px",
                              wordBreak: "break-word",
                            }}
                          >
                            {proofFileName}
                          </p>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => handleProofSelected(null)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                                background: "#fff",
                                color: "#555",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: F,
                              }}
                            >
                              Remove Image
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <motion.button
                      whileHover={{ opacity: 0.88 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={!selectedImage}
                      onClick={() =>
                        onConfirm({
                          tendered: amountDue,
                          selectedImage: selectedImage ?? undefined,
                          proofFileName,
                        })
                      }
                      style={{
                        ...btn("#0070BA", "#fff", { marginBottom: 6 }),
                        cursor: !selectedImage ? "not-allowed" : "pointer",
                        opacity: !selectedImage ? 0.45 : 1,
                      }}
                    >
                      Confirm Payment
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={onCancel}
                      style={{
                        ...btn("transparent", "#bbb"),
                        padding: "9px",
                        fontSize: 12,
                      }}
                    >
                      Cancel
                    </motion.button>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    {!gcashDone ? (
                      <motion.div
                        key="idle"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            background: "#fafafa",
                            border: "1px solid #f0f0f0",
                            borderRadius: 14,
                            padding: "16px 16px 12px",
                            marginBottom: 14,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 12,
                            }}
                          >
                            <div
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 7,
                                background: "#0070BA",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <span
                                style={{
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                G
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#0070BA",
                              }}
                            >
                              GCash
                            </span>
                          </div>
                          <img
                            src="/gcashQR1.png"
                            alt="GCash QR"
                            style={{
                              width: 164,
                              height: 164,
                              borderRadius: 10,
                              objectFit: "contain",
                              background: "#fff",
                              border: "1px solid #efefef",
                            }}
                          />
                          <p
                            style={{
                              fontSize: 10,
                              color: "#aaa",
                              marginTop: 10,
                              textAlign: "center",
                              lineHeight: 1.6,
                            }}
                          >
                            Ask customer to scan with GCash app
                          </p>
                          <p
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "#111",
                              marginTop: 2,
                            }}
                          >
                            ₱{fmt(amountDue)}
                          </p>
                        </div>
                        <div
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            borderRadius: 10,
                            padding: "9px 12px",
                            marginBottom: 14,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 13, marginTop: 1 }}>💡</span>
                          <p
                            style={{
                              fontSize: 11,
                              color: "#92400e",
                              lineHeight: 1.55,
                              margin: 0,
                            }}
                          >
                            Check your GCash app to confirm you received{" "}
                            <strong>₱{fmt(amountDue)}</strong>, then tap below.
                          </p>
                        </div>
                        <motion.button
                          whileHover={{ opacity: 0.88 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleGcash}
                          style={{
                            ...btn("#0070BA", "#fff", { marginBottom: 6 }),
                          }}
                        >
                          Payment Received
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={onCancel}
                          style={{
                            ...btn("transparent", "#bbb"),
                            padding: "9px",
                            fontSize: 12,
                          }}
                        >
                          Cancel
                        </motion.button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="done"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 26,
                        }}
                        style={{ textAlign: "center", padding: "32px 0 28px" }}
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 24,
                            delay: 0.05,
                          }}
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 14px",
                          }}
                        >
                          <Check
                            style={{ width: 22, height: 22, color: "#22c55e" }}
                            strokeWidth={2.5}
                          />
                        </motion.div>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#111",
                            marginBottom: 4,
                          }}
                        >
                          Payment confirmed!
                        </p>
                        <p style={{ fontSize: 11, color: "#bbb" }}>
                          Opening receipt…
                        </p>
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
  const label: Record<CustomerType, string> = {
    regular: "Regular",
    pwd: "PWD",
    senior: "Senior Citizen",
  };
  const receiptHtml = buildReceiptHtml({
    orderNumber,
    date,
    time,
    items: savedCart,
    paidAmount,
    cashTendered,
    changeAmount,
    orderType,
    paymentMethod,
    customerType,
    discountAmount,
    vatAmount,
  });

  const handlePrintReceipt = () => {
    if (typeof window === "undefined") return;
    const receiptWindow = window.open("", "_blank", "width=420,height=760");
    if (!receiptWindow) return;
    receiptWindow.document.open();
    receiptWindow.document.write(receiptHtml);
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.onload = () => {
      receiptWindow.print();
    };
  };

  const handleDownloadReceipt = () => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `receipt-${orderNumber.replace(/[^a-zA-Z0-9-_]/g, "") || "order"}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
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
                background: "#fff",
                width: "100%",
                maxWidth: 320,
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid #ebebeb",
                pointerEvents: "auto",
                fontFamily: F,
              }}
            >
              {/* Header */}
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
                  transition={{
                    type: "spring",
                    stiffness: 460,
                    damping: 24,
                    delay: 0.08,
                  }}
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
                  <Check
                    style={{ width: 20, height: 20, color: "#22c55e" }}
                    strokeWidth={2.5}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.16 }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111",
                      marginBottom: 6,
                    }}
                  >
                    Order placed successfully
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#aaa",
                      lineHeight: 1.65,
                      fontWeight: 400,
                      marginBottom: 10,
                    }}
                  >
                    We'll start preparing right away!
                  </p>
                  <div
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      background: "#f5f5f5",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "6px 14px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "#bbb",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 2,
                      }}
                    >
                      Transaction ID
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#111",
                        letterSpacing: "0.04em",
                        fontFamily: "'Poppins', monospace",
                      }}
                    >
                      {orderNumber}
                    </span>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.28, duration: 0.35 }}
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

              {/* Meta */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.22 }}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}
              >
                {[
                  {
                    icon: <Hash style={{ width: 11, height: 11 }} />,
                    label: "Txn ID",
                    value: orderNumber,
                  },
                  {
                    icon: <Calendar style={{ width: 11, height: 11 }} />,
                    label: "Date",
                    value: date,
                  },
                  {
                    icon: <Clock style={{ width: 11, height: 11 }} />,
                    label: "Time",
                    value: time,
                  },
                ].map(({ icon, label: l, value }, i) => (
                  <div
                    key={l}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "12px 6px",
                      borderRight: i < 2 ? "1px solid #f5f5f5" : "none",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ color: "#ddd", marginBottom: 3 }}>
                      {icon}
                    </span>
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
                      {l}
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: "#374151",
                        lineHeight: 1.3,
                        wordBreak: "break-all",
                      }}
                    >
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
                style={{
                  padding: "10px 16px 4px",
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                {[
                  orderType,
                  paymentMethod,
                  ...(customerType !== "regular" ? [label[customerType]] : []),
                ].map((b) => (
                  <span
                    key={b}
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
                    {b}
                  </span>
                ))}
              </motion.div>

              {/* Items */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{
                  padding: "4px 16px 10px",
                  maxHeight: 120,
                  overflowY: "auto",
                }}
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
                      <span style={{ fontSize: 11, color: "#777" }}>
                        {item.name}
                      </span>
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
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#374151",
                      }}
                    >
                      ₱{fmt(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </motion.div>

              {/* Pricing */}
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
                      <span style={{ fontSize: 11, color: "#bbb" }}>
                        VAT exempt
                      </span>
                      <span
                        style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}
                      >
                        ₱{fmt(vatAmount)} exempt
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
                        Discount (20% {label[customerType]})
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "#22c55e",
                        }}
                      >
                        −₱{fmt(discountAmount)}
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
                    <span style={{ fontSize: 11, color: "#bbb" }}>
                      VAT (12% incl.)
                    </span>
                    <span
                      style={{ fontSize: 11, fontWeight: 500, color: "#bbb" }}
                    >
                      ₱{fmt(vatAmount)}
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
                  <span
                    style={{ fontSize: 12, fontWeight: 500, color: "#777" }}
                  >
                    Total Paid
                  </span>
                  <span
                    style={{ fontSize: 18, fontWeight: 600, color: "#111" }}
                  >
                    ₱{fmt(paidAmount)}
                  </span>
                </div>
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
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#16a34a",
                      }}
                    >
                      Change
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#16a34a",
                      }}
                    >
                      ₱{fmt(changeAmount)}
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
                  onClick={handlePrintReceipt}
                  style={{ ...btn("#111", "#fff"), fontSize: 12 }}
                >
                  Print Receipt
                </motion.button>
                <motion.button
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownloadReceipt}
                  style={{ ...btn("#f3f4f6", "#374151"), fontSize: 12 }}
                >
                  Download Receipt
                </motion.button>
                <motion.button
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  style={{ ...btn("#16a34a", "#fff"), fontSize: 12 }}
                >
                  New Order
                </motion.button>
                <button
                  onClick={onClose}
                  style={{
                    ...btn("transparent", "#bbb"),
                    padding: "9px",
                    fontSize: 12,
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
  const [products, setProducts] = useState<MenuItem[]>([]);
  const isMobile = useIsMobile();
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<
    "dine-in" | "take-out" | "delivery"
  >("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerType, setCustomerType] = useState<CustomerType>("regular");
  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [showAmountEntry, setShowAmountEntry] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedCart, setSavedCart] = useState<CartItem[]>([]);
  const [savedMeta, setSavedMeta] = useState({
    orderType: "dine-in",
    paymentMethod: "cash",
    customerType: "regular" as CustomerType,
  });
  const [savedPricing, setSavedPricing] = useState({
    amountDue: 0,
    discountAmount: 0,
    vatAmount: 0,
  });
  const [savedCash, setSavedCash] = useState({ tendered: 0, change: 0 });
  const [orderNumber, setOrderNumber] = useState("");
  const [placing, setPlacing] = useState(false);
  const [onlineOrderNotifs, setOnlineOrderNotifs] = useState<OnlineNotif[]>([]);
  const [readyPickupOrders, setReadyPickupOrders] = useState<OnlineNotif[]>([]);
  const [deliveryHandoverOrders, setDeliveryHandoverOrders] = useState<
    OnlineNotif[]
  >([]);
  const [handedToRiderOrders, setHandedToRiderOrders] = useState<OnlineNotif[]>(
    [],
  );
  const [handoverOrder, setHandoverOrder] = useState<OnlineNotif | null>(null);
  const [riderNameInput, setRiderNameInput] = useState("");
  const [savingHandover, setSavingHandover] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [deliveryHandoverOpen, setDeliveryHandoverOpen] = useState(false);
  const [tablesSupported, setTablesSupported] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("tablesRouteUnsupported") !== "1";
  });

  const TABS = [
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

  useEffect(() => {
    setLoadingProducts(true);
    api
      .get<Record<string, unknown>[]>("/inventory")
      .then((d) => {
        setProducts(mapProducts(d ?? []));
        setProductsError("");
      })
      .catch(() => setProductsError("Failed to load menu items."))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    if (orderType !== "dine-in") {
      setSelectedTable(null);
      return;
    }
    if (!tablesSupported) {
      setTables([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const data = await apiCall<Record<string, unknown>[]>("/tables", {
          method: "GET",
          suppressErrorStatuses: [404],
        });
        if (cancelled) return;
        setTables(mapTables(data ?? []));
      } catch (error) {
        if (cancelled) return;
        const status =
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof (error as { status?: unknown }).status === "number"
            ? (error as { status: number }).status
            : null;

        if (status !== 404) {
          console.warn("Failed to load tables:", error);
        } else {
          setTablesSupported(false);
          if (typeof window !== "undefined") {
            localStorage.setItem("tablesRouteUnsupported", "1");
          }
        }
        setTables([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderType]);

  useEffect(() => {
    const poll = async () => {
      try {
        const [reviewData, readyData, deliveryData] = await Promise.all([
          api.get<OnlineNotif[]>("/orders/new-online"),
          api.get<OnlineNotif[]>("/orders/ready-pickup"),
          api.get<OnlineNotif[]>("/orders/delivery-handover"),
        ]);
        setOnlineOrderNotifs((prev) => {
          const next = reviewData ?? [];
          if (
            (next.length > prev.length || (readyData ?? []).length > 0) &&
            (next.length > 0 || (readyData ?? []).length > 0)
          ) {
            setNotifOpen(true);
          }
          return next;
        });
        setReadyPickupOrders(readyData ?? []);
        setDeliveryHandoverOrders((prev) => {
          const next = deliveryData ?? [];
          if (next.length > prev.length && next.length > 0) {
            setDeliveryHandoverOpen(true);
          }
          return next;
        });
      } catch (err) {
        console.warn("[poll] online-order fetch failed:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, []);

  const getCashierId = () => {
    const raw = localStorage.getItem("userId");
    return raw ? Number(raw) : null;
  };

  const updateQueueOrder = async (
    id: number,
    payload: Record<string, unknown>,
  ) => {
    await api.patch(`/orders/${id}`, payload);
  };

  const openRiderHandover = (order: OnlineNotif) => {
    setHandoverOrder(order);
    setRiderNameInput(order.riderName ?? "");
  };

  const closeRiderHandover = () => {
    if (savingHandover) return;
    setHandoverOrder(null);
    setRiderNameInput("");
  };

  const handleProceedOnlineOrder = async (id: number) => {
    try {
      await updateQueueOrder(id, {
        status: "Queued",
        paymentStatus: "Paid",
        cashierId: getCashierId(),
      });
      setOnlineOrderNotifs((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      console.error("Failed to proceed online order:", err);
      alert("Failed to confirm payment and move the online order to the cook queue.");
    }
  };

  const handleCancelOnlineOrder = async (id: number) => {
    try {
      await updateQueueOrder(id, {
        status: "Cancelled",
        cashierId: getCashierId(),
      });
      setOnlineOrderNotifs((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      console.error("Failed to cancel online order:", err);
      alert("Failed to cancel online order.");
    }
  };

  const handleConfirmPickup = async (id: number) => {
    try {
      await updateQueueOrder(id, {
        status: "Completed",
        cashierId: getCashierId(),
      });
      setReadyPickupOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      console.error("Failed to confirm pickup:", err);
      alert("Failed to confirm customer pickup.");
    }
  };

  const handleRiderHandover = async () => {
    if (!handoverOrder || !riderNameInput.trim()) return;
    const handoverTimestamp = new Date().toISOString();
    try {
      setSavingHandover(true);
      await updateQueueOrder(handoverOrder.id, {
        status: "Completed",
        paymentStatus: "Paid",
        cashierId: getCashierId(),
        handoverTimestamp,
        riderName: riderNameInput.trim(),
      });
      setDeliveryHandoverOrders((prev) =>
        prev.filter((o) => o.id !== handoverOrder.id),
      );
      setHandedToRiderOrders((prev) => [
        {
          ...handoverOrder,
          trackingStatus: "Completed",
          handoverTimestamp,
          riderName: riderNameInput.trim(),
        },
        ...prev.filter((o) => o.id !== handoverOrder.id),
      ]);
      setHandoverOrder(null);
      setRiderNameInput("");
    } catch (err) {
      console.error("Failed to hand order to rider:", err);
      const message =
        typeof err === "object" &&
        err !== null &&
        "data" in err &&
        typeof (err as { data?: unknown }).data === "object" &&
        (err as { data?: { error?: string; message?: string } }).data
          ? (err as { data?: { error?: string; message?: string } }).data?.error ||
            (err as { data?: { error?: string; message?: string } }).data?.message ||
            (err instanceof Error ? err.message : "")
          : err instanceof Error && err.message
            ? err.message
          : "Failed to record rider handover.";
      alert(message);
    } finally {
      setSavingHandover(false);
    }
  };

  const filtered = products.filter((p) => {
    const cu = p.category.toUpperCase();
    const tabOk =
      selectedCategory === "ALL" ||
      (TABS.find((t) => t.key === selectedCategory)?.match ?? []).some((m) =>
        cu.includes(m),
      );
    return tabOk && p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const readyForPickupOrders = readyPickupOrders;
  const readyForDeliveryOrders = deliveryHandoverOrders.filter(
    (order) =>
      !order.handoverTimestamp &&
      order.trackingStatus.toLowerCase() !== "handed to rider" &&
      order.trackingStatus.toLowerCase() !== "out for delivery",
  );
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
        return prev.map((c) =>
          c.id === item.id ? { ...c, quantity: next } : c,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = (id: number) =>
    setCart((p) => p.filter((c) => c.id !== id));

  const updateQty = (id: number, delta: number) => {
    const prod = products.find((p) => p.id === id);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const next = Math.max(0, item.quantity + delta);
          if (next > (prod?.remainingStock ?? 0) && !isFood(item)) return item;
          return { ...item, quantity: next };
        })
        .filter((i) => i.quantity > 0),
    );
  };

  const handleAmountConfirmed = async ({
    tendered,
    selectedImage,
    proofFileName,
  }: {
    tendered: number;
    selectedImage?: File;
    proofFileName?: string;
  }) => {
    setShowAmountEntry(false);
    setPlacing(true);
    const { vatExemptAmount, vatAmount, discountAmount, amountDue } =
      computePricing(gross, customerType);
    const change = Math.max(0, tendered - amountDue);
    let proofImageUrl: string | undefined;

    if (paymentMethod === "gcash_onsite") {
      if (!selectedImage) {
        alert("Please upload or capture the onsite e-payment proof first.");
        setPlacing(false);
        return;
      }

      try {
        const formData = new FormData();
        formData.append(
          "proof",
          selectedImage,
          proofFileName || selectedImage.name || `payment-proof-${Date.now()}.jpg`,
        );
        const upload = await api.post<{ fileUrl: string }>(
          "/upload-proof",
          formData,
        );
        proofImageUrl = upload.fileUrl;
      } catch (error) {
        console.error("Failed to upload payment proof:", error);
        alert("Failed to upload the payment proof. Please try again.");
        setPlacing(false);
        return;
      }
    }

    const payload: OrderPayload = {
      items: cart.map((i) => ({
        product_id: i.id,
        qty: i.quantity,
        subtotal: i.price * i.quantity,
        name: i.name,
        price: i.price,
      })),
      total: amountDue,
      order_type: orderType,
      payment_method: paymentMethod,
      ...(paymentMethod === "gcash_onsite" && {
        payment_status: "Paid" as const,
        proof_image_url: proofImageUrl,
      }),
      customer_type: customerType,
      discount_amount: discountAmount,
      vat_amount: vatAmount,
      vat_exempt_amount: vatExemptAmount,
      cashierId: getCashierId(),
      table_id: orderType === "dine-in" ? selectedTable : null,
      ...(paymentMethod === "cash" && {
        cash_tendered: tendered,
        change_amount: change,
      }),
    };

    try {
      const res = await api.post<{ orderNumber?: string }>("/orders", payload);
      const num =
        res?.orderNumber ?? `#${Math.floor(10000 + Math.random() * 90000)}`;
      setSavedCart([...cart]);
      setSavedMeta({ orderType, paymentMethod, customerType });
      setSavedPricing({ amountDue, discountAmount, vatAmount });
      setSavedCash({ tendered, change });
      setOrderNumber(num);
      setShowSuccess(true);
      if (selectedTable !== null) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === selectedTable ? { ...t, status: "occupied" } : t,
          ),
        );
      }
    } catch (err) {
      console.error("Order failed:", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const resetOrder = () => {
    setShowSuccess(false);
    setCart([]);
    setSavedCart([]);
    setOrderType("dine-in");
    setPaymentMethod("cash");
    setCustomerType("regular");
    setSelectedTable(null);
    setSavedCash({ tendered: 0, change: 0 });
  };

  const Spinner = ({
    size = 20,
    light = false,
  }: {
    size?: number;
    light?: boolean;
  }) => (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${light ? "rgba(255,255,255,0.3)" : "#eee"}`,
        borderTopColor: light ? "#fff" : "#555",
      }}
    />
  );

  return (
    <>
      <Sidebar />

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          height: isMobile ? "auto" : "100vh",
          minHeight: "100vh",
          overflow: isMobile ? "auto" : "hidden",
          fontFamily: F,
          background: "#fff",
          paddingLeft: isMobile ? 0 : 80,
          paddingTop: isMobile ? 64 : 0,
        }}
      >
        {/* ── LEFT: Menu ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: isMobile ? "visible" : "hidden",
            minWidth: 0,
          }}
        >
          <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <h1
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#111",
                  fontFamily: F,
                }}
              >
                Menu
              </h1>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <motion.button
                  onClick={() => setNotifOpen((p) => !p)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px 5px 8px",
                    borderRadius: 20,
                    border: `1px solid ${onlineOrderNotifs.length + readyPickupOrders.length > 0 ? "#16a34a" : "#efefef"}`,
                    background:
                      onlineOrderNotifs.length + readyPickupOrders.length > 0
                        ? notifOpen
                          ? "#e8f9ef"
                          : "#f0fdf4"
                        : "#fafafa",
                    cursor: "pointer",
                    fontFamily: F,
                    boxShadow:
                      onlineOrderNotifs.length + readyPickupOrders.length > 0
                        ? "0 0 0 3px rgba(22,163,74,0.08)"
                        : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {onlineOrderNotifs.length + readyPickupOrders.length > 0 && (
                    <motion.div
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#16a34a",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        onlineOrderNotifs.length + readyPickupOrders.length > 0
                          ? "#16a34a"
                          : "#bbb",
                    }}
                  >
                    Online Orders
                  </span>
                  {onlineOrderNotifs.length + readyPickupOrders.length > 0 && (
                    <motion.span
                      key={onlineOrderNotifs.length + readyPickupOrders.length}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SP}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: "#16a34a",
                        color: "#fff",
                        borderRadius: 99,
                        padding: "1px 6px",
                        minWidth: 16,
                        textAlign: "center",
                      }}
                    >
                      {onlineOrderNotifs.length + readyPickupOrders.length}
                    </motion.span>
                  )}
                  <motion.div
                    animate={{ rotate: notifOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <ChevronDown
                      style={{
                        width: 11,
                        height: 11,
                        color:
                          onlineOrderNotifs.length + readyPickupOrders.length >
                          0
                            ? "#16a34a"
                            : "#ccc",
                      }}
                    />
                  </motion.div>
                </motion.button>
                <motion.button
                  onClick={() => setDeliveryHandoverOpen((p) => !p)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 10px 5px 8px",
                    borderRadius: 20,
                    border: `1px solid ${readyForDeliveryOrders.length + handedToRiderOrders.length > 0 ? "#111" : "#efefef"}`,
                    background:
                      readyForDeliveryOrders.length +
                        handedToRiderOrders.length >
                      0
                        ? deliveryHandoverOpen
                          ? "#f3f4f6"
                          : "#fafafa"
                        : "#fafafa",
                    cursor: "pointer",
                    fontFamily: F,
                    boxShadow:
                      readyForDeliveryOrders.length +
                        handedToRiderOrders.length >
                      0
                        ? "0 0 0 3px rgba(17,17,17,0.06)"
                        : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {readyForDeliveryOrders.length + handedToRiderOrders.length >
                    0 && (
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.45, 1] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#111",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        readyForDeliveryOrders.length +
                          handedToRiderOrders.length >
                        0
                          ? "#111"
                          : "#bbb",
                    }}
                  >
                    Delivery Handover
                  </span>
                  {readyForDeliveryOrders.length + handedToRiderOrders.length >
                    0 && (
                    <motion.span
                      key={
                        readyForDeliveryOrders.length +
                        handedToRiderOrders.length
                      }
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SP}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: "#111",
                        color: "#fff",
                        borderRadius: 99,
                        padding: "1px 6px",
                        minWidth: 16,
                        textAlign: "center",
                      }}
                    >
                      {readyForDeliveryOrders.length +
                        handedToRiderOrders.length}
                    </motion.span>
                  )}
                  <motion.div
                    animate={{ rotate: deliveryHandoverOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <ChevronDown
                      style={{
                        width: 11,
                        height: 11,
                        color:
                          readyForDeliveryOrders.length +
                            handedToRiderOrders.length >
                          0
                            ? "#111"
                            : "#ccc",
                      }}
                    />
                  </motion.div>
                </motion.button>
              </div>
            </div>

            {/* Online Orders Panel */}
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  style={{ overflow: "hidden", marginBottom: 14 }}
                >
                  <div
                    style={{
                      border: "1px solid #d1fae5",
                      borderRadius: 12,
                      background: "#f9fef9",
                      overflow: "hidden",
                    }}
                  >
                    {onlineOrderNotifs.length === 0 &&
                    readyForPickupOrders.length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center" }}>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#bbb",
                            fontFamily: F,
                            margin: 0,
                          }}
                        >
                          No online pickup orders waiting for cashier action
                        </p>
                      </div>
                    ) : (
                      <div>
                        {onlineOrderNotifs.length > 0 && (
                          <div
                            style={{
                              padding: "10px 14px 8px",
                              borderBottom:
                                readyForPickupOrders.length > 0
                                  ? "1px solid #d1fae5"
                                  : "none",
                            }}
                          >
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#166534",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                margin: 0,
                              }}
                            >
                              Awaiting Cashier Review
                            </p>
                          </div>
                        )}
                        <AnimatePresence>
                          {onlineOrderNotifs.map((notif, idx) => (
                            <motion.div
                              key={notif.id}
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8, height: 0, padding: 0 }}
                              transition={{ delay: idx * 0.04, ...SP }}
                              style={{
                                display: "grid",
                                gap: 10,
                                padding: "12px 14px",
                                borderBottom:
                                  idx < onlineOrderNotifs.length - 1
                                    ? "1px solid #d1fae5"
                                    : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 4,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#111",
                                        fontFamily: F,
                                      }}
                                    >
                                      {notif.orderNumber}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 600,
                                        padding: "2px 7px",
                                        borderRadius: 99,
                                        background: "#dcfce7",
                                        color: "#166534",
                                      }}
                                    >
                                      {notif.trackingStatus}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 500,
                                        padding: "1px 7px",
                                        borderRadius: 99,
                                        background: "#d1fae5",
                                        color: "#065f46",
                                        textTransform: "capitalize",
                                      }}
                                    >
                                      {notif.orderType}
                                    </span>
                                    <span
                                      style={{ fontSize: 9, color: "#6b7280" }}
                                    >
                                      {new Date(
                                        notif.createdAt,
                                      ).toLocaleTimeString("en-PH", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#111",
                                      }}
                                    >
                                      ₱{Number(notif.total).toFixed(2)}
                                    </span>
                                    {/* ── PAYMENT STATUS BADGE ── */}
                                    <PaymentStatusBadge
                                      paymentStatus={notif.paymentStatus}
                                      paymentMethod={notif.paymentMethod}
                                    />
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 6,
                                    flexShrink: 0,
                                  }}
                                >
                                  <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() =>
                                      handleCancelOnlineOrder(notif.id)
                                    }
                                    style={{
                                      padding: "7px 11px",
                                      borderRadius: 9,
                                      border: "1px solid #fecaca",
                                      background: "#fff1f2",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                      fontSize: 10.5,
                                      fontWeight: 600,
                                      fontFamily: F,
                                    }}
                                  >
                                    Cancel
                                  </motion.button>
                                  <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() =>
                                      handleProceedOnlineOrder(notif.id)
                                    }
                                    style={{
                                      padding: "7px 11px",
                                      borderRadius: 9,
                                      border: "1px solid #16a34a",
                                      background: "#16a34a",
                                      color: "#fff",
                                      cursor: "pointer",
                                      fontSize: 10.5,
                                      fontWeight: 600,
                                      fontFamily: F,
                                    }}
                                  >
                                    Proceed to Order
                                  </motion.button>
                                </div>
                              </div>
                              <div style={{ display: "grid", gap: 5 }}>
                                {notif.items.map((item, itemIndex) => (
                                  <span
                                    key={`${notif.id}-${itemIndex}`}
                                    style={{
                                      fontSize: 10.5,
                                      color: "#374151",
                                      fontFamily: F,
                                    }}
                                  >
                                    {item.quantity}x {item.name}
                                  </span>
                                ))}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {readyForPickupOrders.length > 0 && (
                          <div
                            style={{
                              padding: "10px 14px 8px",
                              borderTop:
                                onlineOrderNotifs.length > 0
                                  ? "1px solid #d1fae5"
                                  : "none",
                            }}
                          >
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#166534",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                margin: 0,
                              }}
                            >
                              Ready for Pickup
                            </p>
                          </div>
                        )}
                        <AnimatePresence>
                          {readyForPickupOrders.map((notif, idx) => (
                            <motion.div
                              key={`ready-${notif.id}`}
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8, height: 0, padding: 0 }}
                              transition={{ delay: idx * 0.04, ...SP }}
                              style={{
                                display: "grid",
                                gap: 10,
                                padding: "12px 14px",
                                borderTop:
                                  idx > 0 ? "1px solid #d1fae5" : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 4,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#111",
                                        fontFamily: F,
                                      }}
                                    >
                                      {notif.orderNumber}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 600,
                                        padding: "2px 7px",
                                        borderRadius: 99,
                                        background: "#dcfce7",
                                        color: "#166534",
                                      }}
                                    >
                                      {notif.trackingStatus}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 500,
                                        padding: "1px 7px",
                                        borderRadius: 99,
                                        background: "#d1fae5",
                                        color: "#065f46",
                                        textTransform: "capitalize",
                                      }}
                                    >
                                      {notif.orderType}
                                    </span>
                                    <span
                                      style={{ fontSize: 9, color: "#6b7280" }}
                                    >
                                      {new Date(
                                        notif.createdAt,
                                      ).toLocaleTimeString("en-PH", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#111",
                                      }}
                                    >
                                      ₱{Number(notif.total).toFixed(2)}
                                    </span>
                                    {/* ── PAYMENT STATUS BADGE ── */}
                                    <PaymentStatusBadge
                                      paymentStatus={notif.paymentStatus}
                                      paymentMethod={notif.paymentMethod}
                                    />
                                  </div>
                                </div>
                                <motion.button
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => handleConfirmPickup(notif.id)}
                                  style={{
                                    padding: "7px 11px",
                                    borderRadius: 9,
                                    border: "1px solid #111",
                                    background: "#111",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    fontFamily: F,
                                    flexShrink: 0,
                                  }}
                                >
                                  Confirm Pickup
                                </motion.button>
                              </div>
                              <div style={{ display: "grid", gap: 5 }}>
                                {notif.items.map((item, itemIndex) => (
                                  <span
                                    key={`ready-${notif.id}-${itemIndex}`}
                                    style={{
                                      fontSize: 10.5,
                                      color: "#374151",
                                      fontFamily: F,
                                    }}
                                  >
                                    {item.quantity}x {item.name}
                                  </span>
                                ))}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delivery Handover Panel */}
            <AnimatePresence>
              {deliveryHandoverOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  style={{ overflow: "hidden", marginBottom: 14 }}
                >
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      background: "#fcfcfc",
                      overflow: "hidden",
                    }}
                  >
                    {readyForDeliveryOrders.length === 0 &&
                    handedToRiderOrders.length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center" }}>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#bbb",
                            fontFamily: F,
                            margin: 0,
                          }}
                        >
                          No delivery orders waiting for rider handover
                        </p>
                      </div>
                    ) : (
                      <div>
                        {readyForDeliveryOrders.length > 0 && (
                          <div
                            style={{
                              padding: "10px 14px 8px",
                              borderBottom:
                                handedToRiderOrders.length > 0
                                  ? "1px solid #e5e7eb"
                                  : "none",
                            }}
                          >
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#111",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                margin: 0,
                              }}
                            >
                              Ready for Rider Handover
                            </p>
                          </div>
                        )}
                        <AnimatePresence>
                          {readyForDeliveryOrders.map((notif, idx) => (
                            <motion.div
                              key={`delivery-${notif.id}`}
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8, height: 0, padding: 0 }}
                              transition={{ delay: idx * 0.04, ...SP }}
                              style={{
                                display: "grid",
                                gap: 10,
                                padding: "12px 14px",
                                borderTop:
                                  idx > 0 ? "1px solid #e5e7eb" : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginBottom: 4,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: "#111",
                                        fontFamily: F,
                                      }}
                                    >
                                      {notif.orderNumber}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 600,
                                        padding: "2px 7px",
                                        borderRadius: 99,
                                        background: "#f3f4f6",
                                        color: "#111",
                                      }}
                                    >
                                      {notif.trackingStatus}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 500,
                                        padding: "1px 7px",
                                        borderRadius: 99,
                                        background: "#f3f4f6",
                                        color: "#4b5563",
                                        textTransform: "capitalize",
                                      }}
                                    >
                                      {notif.orderType}
                                    </span>
                                    <span
                                      style={{ fontSize: 9, color: "#6b7280" }}
                                    >
                                      {new Date(
                                        notif.createdAt,
                                      ).toLocaleTimeString("en-PH", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#111",
                                      }}
                                    >
                                      ₱{Number(notif.total).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                                <motion.button
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => openRiderHandover(notif)}
                                  style={{
                                    padding: "7px 11px",
                                    borderRadius: 9,
                                    border: "1px solid #111",
                                    background: "#111",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    fontFamily: F,
                                    flexShrink: 0,
                                  }}
                                >
                                  Handed to Rider
                                </motion.button>
                              </div>
                              <div style={{ display: "grid", gap: 5 }}>
                                {notif.items.map((item, itemIndex) => (
                                  <span
                                    key={`delivery-handover-${notif.id}-${itemIndex}`}
                                    style={{
                                      fontSize: 10.5,
                                      color: "#374151",
                                      fontFamily: F,
                                    }}
                                  >
                                    {item.quantity}x {item.name}
                                  </span>
                                ))}
                              </div>
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "#9ca3af",
                                  fontFamily: F,
                                }}
                              >
                                Record this once the rider physically collects
                                the order
                              </span>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {handedToRiderOrders.length > 0 && (
                          <div
                            style={{
                              padding: "10px 14px 8px",
                              borderTop:
                                readyForDeliveryOrders.length > 0
                                  ? "1px solid #e5e7eb"
                                  : "none",
                            }}
                          >
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#111",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                margin: 0,
                              }}
                            >
                              Handed to Rider
                            </p>
                          </div>
                        )}
                        <AnimatePresence>
                          {handedToRiderOrders.map((notif, idx) => (
                            <motion.div
                              key={`handover-${notif.id}`}
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8, height: 0, padding: 0 }}
                              transition={{ delay: idx * 0.04, ...SP }}
                              style={{
                                display: "grid",
                                gap: 10,
                                padding: "12px 14px",
                                borderTop:
                                  idx > 0 ? "1px solid #e5e7eb" : "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: "#111",
                                      fontFamily: F,
                                    }}
                                  >
                                    {notif.orderNumber}
                                  </span>
                                  {notif.riderName && (
                                    <p
                                      style={{
                                        fontSize: 10,
                                        color: "#6b7280",
                                        margin: "2px 0 0",
                                      }}
                                    >
                                      Rider: {notif.riderName}
                                    </p>
                                  )}
                                </div>
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: "#9ca3af",
                                    fontFamily: F,
                                    textAlign: "right",
                                  }}
                                >
                                  {formatOrderTimestamp(
                                    notif.handoverTimestamp,
                                  )}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <Search
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 13,
                  height: 13,
                  color: "#bbb",
                }}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search items…"
                style={{
                  width: "100%",
                  padding: "9px 12px 9px 32px",
                  fontSize: 12,
                  fontFamily: F,
                  border: "1px solid #efefef",
                  borderRadius: 10,
                  background: "#fafafa",
                  color: "#333",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Category Tabs */}
            <div
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                paddingBottom: 14,
                scrollbarWidth: "none",
              }}
            >
              {TABS.map((tab) => (
                <motion.button
                  key={tab.key}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setSelectedCategory(tab.key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: "1px solid",
                    borderColor:
                      selectedCategory === tab.key ? "#111" : "#efefef",
                    background: selectedCategory === tab.key ? "#111" : "#fff",
                    color: selectedCategory === tab.key ? "#fff" : "#888",
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: F,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {tab.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
            {loadingProducts ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 200,
                }}
              >
                <Spinner />
              </div>
            ) : productsError ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 200,
                }}
              >
                <p style={{ fontSize: 12, color: "#f87171", fontFamily: F }}>
                  {productsError}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 200,
                  gap: 8,
                }}
              >
                <UtensilsCrossed
                  style={{ width: 28, height: 28, color: "#ddd" }}
                />
                <p style={{ fontSize: 12, color: "#ccc", fontFamily: F }}>
                  No items found
                </p>
              </div>
            ) : (
              <motion.div
                layout
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 10,
                }}
              >
                {filtered.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    onAdd={addToCart}
                    inCart={cart.some((c) => c.id === item.id)}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart ── */}
        <div
          style={{
            width: isMobile ? "100%" : 268,
            flexShrink: 0,
            borderLeft: isMobile ? "none" : "1px solid #f0f0f0",
            borderTop: isMobile ? "1px solid #f0f0f0" : "none",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
          }}
        >
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
                  fontFamily: F,
                }}
              >
                Current Order
              </h2>
              <p
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  marginTop: 1,
                  fontFamily: F,
                }}
              >
                {totalQty === 0
                  ? "No items yet"
                  : `${totalQty} item${totalQty > 1 ? "s" : ""}`}
              </p>
            </div>
            <AnimatePresence>
              {totalQty > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={SP}
                  style={{
                    background: "#111",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 20,
                    padding: "2px 8px",
                    fontFamily: F,
                  }}
                >
                  {totalQty}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

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
                  <UtensilsCrossed
                    style={{ width: 28, height: 28, color: "#ddd" }}
                  />
                  <p style={{ fontSize: 12, color: "#ccc", fontFamily: F }}>
                    Add items to start
                  </p>
                </motion.div>
              ) : (
                cart.map((item) => (
                  <CartRow
                    key={item.id}
                    item={item}
                    onRemove={removeFromCart}
                    onQty={updateQty}
                  />
                ))
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={SP}
                style={{
                  padding: "14px 18px 18px",
                  borderTop: "1px solid #f5f5f5",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    background: "#fafafa",
                    border: "1px solid #f0f0f0",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: 10,
                  }}
                >
                  {[
                    { label: "Subtotal", val: fmt(gross), color: "#999" },
                    customerType === "regular"
                      ? {
                          label: "VAT (12% incl.)",
                          val: fmt(pricing.vatAmount),
                          color: "#999",
                        }
                      : {
                          label: "VAT exempt",
                          val: `-₱${fmt(gross - pricing.vatExemptAmount)}`,
                          color: "#999",
                        },
                  ].map(({ label, val, color }) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderBottom: "1px dashed #f0f0f0",
                      }}
                    >
                      <span style={{ fontSize: 11, color: "#bbb" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, color }}>
                        ₱{val}
                      </span>
                    </div>
                  ))}
                  <AnimatePresence>
                    {customerType !== "regular" && (
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
                        <span
                          style={{
                            fontSize: 11,
                            color: "#22c55e",
                            fontWeight: 500,
                          }}
                        >
                          20% discount
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#22c55e",
                          }}
                        >
                          −₱{fmt(pricing.discountAmount)}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      background: "#f5f5f5",
                    }}
                  >
                    <span
                      style={{ fontSize: 12, fontWeight: 500, color: "#777" }}
                    >
                      Total
                    </span>
                    <motion.span
                      key={pricing.amountDue}
                      initial={{ scale: 0.95, opacity: 0.6 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        fontSize: 19,
                        fontWeight: 600,
                        color: "#111",
                        fontFamily: F,
                      }}
                    >
                      ₱{fmt(pricing.amountDue)}
                    </motion.span>
                  </div>
                </div>

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
                    onChange={(v) =>
                      setPaymentMethod(v as typeof paymentMethod)
                    }
                    options={[
                      { value: "cash", label: "Cash" },
                      {
                        value: "gcash_onsite",
                        label: "Onsite GCash / E-Payment",
                      },
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
                      {
                        value: "senior",
                        label: "Senior Citizen (20% off, VAT exempt)",
                      },
                    ]}
                  />
                </div>

                {orderType === "dine-in" && tables.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <CustomSelect
                      value={
                        selectedTable !== null ? String(selectedTable) : ""
                      }
                      onChange={(v) => setSelectedTable(v ? Number(v) : null)}
                      options={[
                        { value: "", label: "Select table…" },
                        ...tables.map((t) => ({
                          value: String(t.id),
                          label: `Table ${t.number}${t.status === "occupied" ? " (occupied)" : ""}`,
                        })),
                      ]}
                    />
                  </div>
                )}

                <motion.button
                  onClick={() => {
                    if (!placing && cart.length > 0) setShowAmountEntry(true);
                  }}
                  disabled={placing}
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    ...btn("#16a34a", "#fff"),
                    cursor: placing ? "not-allowed" : "pointer",
                    opacity: placing ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    letterSpacing: "0.01em",
                  }}
                >
                  {placing ? (
                    <>
                      <Spinner size={14} light /> Processing…
                    </>
                  ) : (
                    `Pay ₱${fmt(pricing.amountDue)}`
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AmountEntryModal
        show={showAmountEntry}
        amountDue={pricing.amountDue}
        paymentMethod={paymentMethod}
        onConfirm={(payload) => {
          void handleAmountConfirmed(payload);
        }}
        onCancel={() => setShowAmountEntry(false)}
      />

      <RiderHandoverModal
        show={handoverOrder !== null}
        order={handoverOrder}
        riderName={riderNameInput}
        saving={savingHandover}
        onChange={setRiderNameInput}
        onConfirm={() => {
          void handleRiderHandover();
        }}
        onCancel={closeRiderHandover}
      />

      <SuccessModal
        show={showSuccess}
        onClose={resetOrder}
        orderNumber={orderNumber}
        savedCart={savedCart}
        paidAmount={savedPricing.amountDue}
        cashTendered={savedCash.tendered}
        changeAmount={savedCash.change}
        orderType={savedMeta.orderType}
        paymentMethod={savedMeta.paymentMethod}
        customerType={savedMeta.customerType}
        discountAmount={savedPricing.discountAmount}
        vatAmount={savedPricing.vatAmount}
      />
    </>
  );
}