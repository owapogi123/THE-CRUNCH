import { useState, useCallback, useEffect } from "react";
import { Search, Minus, Plus, Trash2, UtensilsCrossed, Check, Clock, Calendar, Hash } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";

// ─── FONT INJECTION ───────────────────────────────────────────────────────────

if (typeof document !== "undefined" && !document.getElementById("poppins-font")) {
  const link = document.createElement("link");
  link.id = "poppins-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}

const FONT = "'Poppins', sans-serif";

// ─── TYPES ────────────────────────────────────────────────────────────────────

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
  cashierId: number | null;
}

interface OrderResponse {
  orderNumber?: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const isMenuFood = (item: MenuItem): boolean =>
  item.category.toUpperCase().includes("MENU FOOD");

const formatPrice = (n: number): string => {
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec === "00" ? intFormatted : `${intFormatted}.${dec}`;
};

const getNow = () => {
  const now = new Date();
  const date = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const time = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
};

function mapProducts(data: Record<string, unknown>[]): MenuItem[] {
  const dedupedMap = new Map<string, Record<string, unknown>>();
  for (const p of data ?? []) {
    if (p.isRawMaterial) continue;
    const key = String(p.product_name ?? p.name ?? "").trim().toLowerCase();
    const existing = dedupedMap.get(key);
    if (
      !existing ||
      Number(p.product_id ?? p.id ?? 0) > Number(existing.product_id ?? existing.id ?? 0)
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

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  inCart: boolean;
}

function ProductCard({ item, onAdd, inCart }: ProductCardProps) {
  const isOut = item.remainingStock <= 0 && !isMenuFood(item);

  return (
    <motion.button
      layout
      onClick={() => { if (!isOut) onAdd(item); }}
      disabled={isOut}
      whileHover={!isOut ? { y: -2 } : {}}
      whileTap={!isOut ? { scale: 0.97 } : {}}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="relative w-full text-left overflow-hidden focus:outline-none"
      style={{
        borderRadius: 14,
        background: "#ffffff",
        border: `1.5px solid ${inCart ? "#111827" : "#efefef"}`,
        opacity: isOut ? 0.4 : 1,
        cursor: isOut ? "not-allowed" : "pointer",
        boxShadow: inCart ? "0 0 0 3px rgba(17,24,39,0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
        fontFamily: FONT,
      }}
    >
      <div
        className="w-full aspect-square flex items-center justify-center"
        style={{ background: "#f9f9f9" }}
      >
        <UtensilsCrossed
          className="w-7 h-7"
          style={{ color: isOut ? "#e5e7eb" : "#d1d5db" }}
        />
      </div>

      <div className="p-3 pt-2.5">
        <p
          className="text-xs font-medium leading-snug line-clamp-2 mb-2"
          style={{ color: "#111827" }}
        >
          {item.name}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: "#111827" }}>
            ₱{formatPrice(item.price)}
          </span>
          {!isMenuFood(item) && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{
                background: isOut ? "#fef2f2" : "#f3f4f6",
                color: isOut ? "#ef4444" : "#6b7280",
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
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: "#111827" }}
          >
            <Check className="w-3 h-3 text-white" strokeWidth={2.5} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── CART ROW ─────────────────────────────────────────────────────────────────

interface CartRowProps {
  item: CartItem;
  onRemove: (id: number) => void;
  onQty: (id: number, delta: number) => void;
}

function CartRow({ item, onRemove, onQty }: CartRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="flex items-center gap-2 py-3"
      style={{ borderBottom: "1px solid #f5f5f5", fontFamily: FONT }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "#f3f4f6" }}
      >
        <UtensilsCrossed className="w-3.5 h-3.5" style={{ color: "#9ca3af" }} />
      </div>

      {/* Name + unit price — fixed width so it never gets squeezed */}
      <div style={{ width: 72, minWidth: 72 }}>
        <p className="text-xs font-semibold truncate" style={{ color: "#111827" }}>
          {item.name}
        </p>
        <p className="text-[11px] mt-0.5 font-medium truncate" style={{ color: "#9ca3af" }}>
          ₱{formatPrice(item.price)}
        </p>
      </div>

      {/* Qty controls */}
      <div
        className="flex items-center gap-1 rounded-xl p-0.5 shrink-0"
        style={{ background: "#f3f4f6" }}
      >
        <button
          onClick={() => onQty(item.id, -1)}
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-white"
        >
          <Minus className="w-3 h-3" style={{ color: "#6b7280" }} />
        </button>
        <span className="w-5 text-center text-xs font-bold" style={{ color: "#111827" }}>
          {item.quantity}
        </span>
        <button
          onClick={() => onQty(item.id, 1)}
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors hover:bg-white"
        >
          <Plus className="w-3 h-3" style={{ color: "#6b7280" }} />
        </button>
      </div>

      {/* Subtotal — fixed width, right-aligned */}
      <span
        className="text-xs font-bold text-right shrink-0"
        style={{ color: "#111827", width: 56 }}
      >
        ₱{formatPrice(item.price * item.quantity)}
      </span>

      {/* Remove */}
      <button
        onClick={() => onRemove(item.id)}
        className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 shrink-0"
      >
        <Trash2 className="w-3 h-3" style={{ color: "#d1d5db" }} />
      </button>
    </motion.div>
  );
}

// ─── SUCCESS MODAL ────────────────────────────────────────────────────────────

interface SuccessModalProps {
  show: boolean;
  onClose: () => void;
  orderNumber: string;
  savedCart: CartItem[];
  paidAmount: number;
  orderType: string;
  paymentMethod: string;
}

function SuccessModal({
  show,
  onClose,
  orderNumber,
  savedCart,
  paidAmount,
  orderType,
  paymentMethod,
}: SuccessModalProps) {
  const { date, time } = getNow();

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.3)" }}
            onClick={onClose}
          />

          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 20 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="bg-white w-full max-w-sm pointer-events-auto overflow-hidden"
              style={{
                borderRadius: 24,
                boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
                fontFamily: FONT,
              }}
            >
              {/* Top: icon + heading */}
              <div className="flex flex-col items-center pt-10 pb-6 px-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 460, damping: 24, delay: 0.08 }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                  style={{ background: "#f3f4f6", border: "2px solid #e5e7eb" }}
                >
                  <Check className="w-7 h-7" style={{ color: "#6ee7b7" }} strokeWidth={2.5} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                >
                  <p className="text-base font-bold mb-3" style={{ color: "#111827" }}>
                    Your order has been placed
                  </p>
                  <p className="text-sm font-normal leading-relaxed" style={{ color: "#9ca3af" }}>
                    Good job! Your order {orderNumber},
                    <br />
                    we'll start preparing your delicious meal right away!
                  </p>
                </motion.div>

                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
                  className="mt-5 h-0.5 w-10 rounded-full"
                  style={{ background: "#6ee7b7", transformOrigin: "center" }}
                />
              </div>

              <div style={{ borderTop: "1px solid #f3f4f6" }} />

              {/* Info: ID, Date, Time */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.26 }}
                className="grid grid-cols-3"
              >
                {[
                  { icon: <Hash className="w-3 h-3" />, label: "Order ID", value: orderNumber },
                  { icon: <Calendar className="w-3 h-3" />, label: "Date", value: date },
                  { icon: <Clock className="w-3 h-3" />, label: "Time", value: time },
                ].map(({ icon, label, value }, i) => (
                  <div
                    key={label}
                    className="flex flex-col items-center py-4 px-2 text-center"
                    style={{ borderRight: i < 2 ? "1px solid #f3f4f6" : "none" }}
                  >
                    <span style={{ color: "#d1d5db" }}>{icon}</span>
                    <p className="text-[10px] font-semibold mt-1 uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                      {label}
                    </p>
                    <p className="text-[11px] font-semibold mt-0.5 leading-tight" style={{ color: "#374151" }}>
                      {value}
                    </p>
                  </div>
                ))}
              </motion.div>

              <div style={{ borderTop: "1px solid #f3f4f6" }} />

              {/* Order type + payment badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="px-6 pt-4 pb-2 flex gap-2"
              >
                <span
                  className="text-[11px] font-semibold px-3 py-1 rounded-full capitalize"
                  style={{ background: "#f3f4f6", color: "#6b7280" }}
                >
                  {orderType}
                </span>
                <span
                  className="text-[11px] font-semibold px-3 py-1 rounded-full capitalize"
                  style={{ background: "#f3f4f6", color: "#6b7280" }}
                >
                  {paymentMethod}
                </span>
              </motion.div>

              {/* Items list */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.33 }}
                className="px-6 pb-3 max-h-36 overflow-y-auto"
              >
                {savedCart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: "1px dashed #f3f4f6" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium truncate" style={{ color: "#6b7280" }}>
                        {item.name}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: "#f3f4f6", color: "#9ca3af" }}
                      >
                        ×{item.quantity}
                      </span>
                    </div>
                    <span className="text-xs font-semibold ml-2 shrink-0" style={{ color: "#374151" }}>
                      ₱{formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </motion.div>

              {/* Total */}
              <div
                className="mx-6 mb-4 px-4 py-3 rounded-2xl flex items-center justify-between"
                style={{ background: "#f9fafb", border: "1px solid #f3f4f6" }}
              >
                <span className="text-sm font-semibold" style={{ color: "#6b7280" }}>Total Paid</span>
                <span className="text-lg font-bold" style={{ color: "#111827" }}>
                  ₱{formatPrice(paidAmount)}
                </span>
              </div>

              {/* Actions */}
              <div className="px-6 pb-7 space-y-2">
                <motion.button
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold"
                  style={{ background: "#111827", color: "#fff" }}
                >
                  New Order
                </motion.button>
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-2xl text-sm font-medium transition-colors hover:bg-gray-50"
                  style={{ color: "#9ca3af" }}
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
  const [isLoadingProducts, setIsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedCat, setSelectedCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"dine-in" | "take-out" | "delivery">("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "e-payment">("cash");
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedCart, setSavedCart] = useState<CartItem[]>([]);
  const [savedOrderType, setSavedOrderType] = useState("dine-in");
  const [savedPaymentMethod, setSavedPaymentMethod] = useState("cash");
  const [paidAmount, setPaidAmount] = useState(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // ── Fetch menu from /inventory ──────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    api
      .get<Record<string, unknown>[]>("/inventory")
      .then((data) => {
        setProducts(mapProducts(data ?? []));
        setProductsError("");
      })
      .catch(() => setProductsError("Failed to load menu items."))
      .finally(() => setIsLoading(false));
  }, []);

  const categories = ["ALL", ...Array.from(new Set(products.map((p) => p.category)))];

  const filtered = products.filter(
    (p) =>
      (selectedCat === "ALL" || p.category === selectedCat) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  // ── Cart actions ────────────────────────────────────────────────────────────
  const addToCart = useCallback((item: MenuItem) => {
    if (item.remainingStock <= 0 && !isMenuFood(item)) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        const next = existing.quantity + 1;
        if (next > item.remainingStock && !isMenuFood(item)) return prev;
        return prev.map((c) => (c.id === item.id ? { ...c, quantity: next } : c));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = (id: number) =>
    setCart((prev) => prev.filter((c) => c.id !== id));

  const updateQty = (id: number, delta: number) => {
    const product = products.find((p) => p.id === id);
    const stock = product?.remainingStock ?? 0;
    const menuFood = product ? isMenuFood(product) : false;
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id !== id) return c;
          const next = Math.max(0, c.quantity + delta);
          if (next > stock && !menuFood) return c;
          return { ...c, quantity: next };
        })
        .filter((c) => c.quantity > 0),
    );
  };

  // ── Submit order to /orders ─────────────────────────────────────────────────
  const handlePayment = async () => {
    if (cart.length === 0 || isPlacingOrder) return;
    setIsPlacingOrder(true);

    const cashierId = localStorage.getItem("userId");
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const payload: OrderPayload = {
      items: cart.map((i) => ({
        product_id: i.id,
        qty: i.quantity,
        subtotal: i.price * i.quantity,
        name: i.name,
        price: i.price,
      })),
      total,
      order_type: orderType,
      payment_method: paymentMethod,
      cashierId: cashierId ? Number(cashierId) : null,
    };

    try {
      const response = await api.post<OrderResponse>("/orders", payload);
      const num = response?.orderNumber ?? `#${Math.floor(10000 + Math.random() * 90000)}`;
      setSavedCart([...cart]);
      setSavedOrderType(orderType);
      setSavedPaymentMethod(paymentMethod);
      setPaidAmount(total);
      setOrderNumber(num);
      setShowSuccess(true);
      // Optimistically deduct stock for non-menu-food items
      setProducts((prev) =>
        prev.map((p) => {
          const ordered = cart.find((c) => c.id === p.id);
          if (!ordered || isMenuFood(p)) return p;
          return { ...p, remainingStock: Math.max(0, p.remainingStock - ordered.quantity) };
        }),
      );
    } catch (err) {
      console.error("Order failed:", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccess(false);
    setCart([]);
    setSavedCart([]);
    setOrderType("dine-in");
    setPaymentMethod("cash");
  };

  return (
    <>
      <Sidebar />

      <div
        className="flex h-screen overflow-hidden"
        style={{ fontFamily: FONT, background: "#fafafa", paddingLeft: 80 }}
      >
        {/* ── Left: Menu ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <div
            className="px-8 py-5 flex items-center gap-4"
            style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}
          >
            <div className="flex-1">
              <h1 className="text-base font-bold" style={{ color: "#111827" }}>
                Menu
              </h1>
            </div>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: "#d1d5db" }}
              />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-200"
                style={{
                  background: "#f7f7f7",
                  border: "1px solid #efefef",
                  color: "#374151",
                  width: 200,
                  fontFamily: FONT,
                }}
              />
            </div>
          </div>

          {/* Category tabs */}
          <div
            className="px-8 py-3 flex items-center gap-1 overflow-x-auto"
            style={{ background: "#fff", borderBottom: "1px solid #f5f5f5" }}
          >
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap focus:outline-none transition-all"
                style={{
                  color: selectedCat === cat ? "#111827" : "#9ca3af",
                  background: selectedCat === cat ? "#f3f4f6" : "transparent",
                  fontWeight: selectedCat === cat ? 600 : 400,
                  fontFamily: FONT,
                }}
              >
                {cat === "ALL" ? "All" : cat}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoadingProducts && (
              <div className="flex items-center justify-center h-full">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  className="w-6 h-6 rounded-full border-2"
                  style={{ borderColor: "#e5e7eb", borderTopColor: "#9ca3af" }}
                />
              </div>
            )}
            {!isLoadingProducts && productsError && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "#ef4444", fontFamily: FONT }}>{productsError}</p>
              </div>
            )}
            {!isLoadingProducts && !productsError && (
              <motion.div
                layout
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(138px, 1fr))" }}
              >
                <AnimatePresence>
                  {filtered.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
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
                {filtered.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-24">
                    <UtensilsCrossed className="w-8 h-8 mb-3" style={{ color: "#e5e7eb" }} />
                    <p className="text-sm" style={{ color: "#d1d5db", fontFamily: FONT }}>
                      No items found
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* ── Right: Cart ── */}
        <div
          className="flex flex-col"
          style={{
            width: 300,
            flexShrink: 0,
            background: "#fff",
            borderLeft: "1px solid #f0f0f0",
          }}
        >
          {/* Cart header */}
          <div
            className="px-6 pt-6 pb-4 flex items-center justify-between"
            style={{ borderBottom: "1px solid #f5f5f5" }}
          >
            <div>
              <h2 className="text-sm font-bold" style={{ color: "#111827", fontFamily: FONT }}>
                Order
              </h2>
              <p className="text-xs font-medium mt-0.5" style={{ color: "#9ca3af" }}>
                {totalQty === 0 ? "No items yet" : `${totalQty} item${totalQty > 1 ? "s" : ""}`}
              </p>
            </div>
            <AnimatePresence>
              {totalQty > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "#111827", color: "#fff" }}
                >
                  {totalQty}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-6">
            <AnimatePresence>
              {cart.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full pb-10 text-center"
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: "#f3f4f6" }}
                  >
                    <UtensilsCrossed className="w-5 h-5" style={{ color: "#e5e7eb" }} />
                  </div>
                  <p className="text-xs font-medium" style={{ color: "#d1d5db", fontFamily: FONT }}>
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

          {/* Cart footer */}
          <AnimatePresence>
            {cart.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                className="px-6 pb-6 pt-4"
                style={{ borderTop: "1px solid #f5f5f5" }}
              >
                {/* Total */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold" style={{ color: "#9ca3af" }}>Total</span>
                  <span className="text-xl font-bold" style={{ color: "#111827", fontFamily: FONT }}>
                    ₱{formatPrice(totalPrice)}
                  </span>
                </div>

                {/* Order type + payment method selects */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as "dine-in" | "take-out" | "delivery")}
                    className="rounded-xl px-3 py-2 text-xs focus:outline-none"
                    style={{
                      border: "1px solid #f0f0f0",
                      background: "#fafafa",
                      color: "#374151",
                      fontFamily: FONT,
                    }}
                  >
                    <option value="dine-in">Dine in</option>
                    <option value="take-out">Take out</option>
                    <option value="delivery">Delivery</option>
                  </select>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "cash" | "e-payment")}
                    className="rounded-xl px-3 py-2 text-xs focus:outline-none"
                    style={{
                      border: "1px solid #f0f0f0",
                      background: "#fafafa",
                      color: "#374151",
                      fontFamily: FONT,
                    }}
                  >
                    <option value="cash">Cash</option>
                    <option value="e-payment">E-Payment</option>
                  </select>
                </div>

                {/* Pay button */}
                <motion.button
                  onClick={() => { void handlePayment(); }}
                  disabled={isPlacingOrder || cart.length === 0}
                  whileHover={{ opacity: 0.88 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                  style={{
                    background: "#111827",
                    color: "#fff",
                    opacity: isPlacingOrder ? 0.5 : 1,
                    cursor: isPlacingOrder ? "not-allowed" : "pointer",
                    fontFamily: FONT,
                  }}
                >
                  {isPlacingOrder ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                        className="w-4 h-4 rounded-full border-2"
                        style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                      />
                      Processing…
                    </>
                  ) : (
                    `Pay ₱${formatPrice(totalPrice)}`
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <SuccessModal
        show={showSuccess}
        onClose={handleCloseModal}
        orderNumber={orderNumber}
        savedCart={savedCart}
        paidAmount={paidAmount}
        orderType={savedOrderType}
        paymentMethod={savedPaymentMethod}
      />
    </>
  );
}