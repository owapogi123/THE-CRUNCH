import { useState, useCallback, useEffect } from "react";
import {
  Search,
  ShoppingBag,
  Trash2,
  Check,
  X,
  ChevronRight,
  Minus,
  Plus,
  UtensilsCrossed,
} from "lucide-react";
import { api } from "../lib/api";
import { Sidebar } from "@/components/Sidebar";

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
}

interface OrderResponse {
  orderNumber?: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const CARD_COLORS: string[] = [
  "#FEF3C7",
  "#D1FAE5",
  "#DBEAFE",
  "#FCE7F3",
  "#EDE9FE",
  "#FEE2E2",
  "#F0FDF4",
  "#FFF7ED",
];

const cardColor = (id: number): string => CARD_COLORS[id % CARD_COLORS.length];

const isMenuFood = (item: MenuItem): boolean =>
  item.category.toUpperCase().includes("MENU FOOD");

function mapProducts(data: Record<string, unknown>[]): MenuItem[] {
  const dedupedMap = new Map<string, Record<string, unknown>>();
  for (const p of data ?? []) {
    if (p.isRawMaterial) continue;
    const key = String(p.product_name ?? p.name ?? "")
      .trim()
      .toLowerCase();
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

// ─── ANIMATIONS (shared style objects) ────────────────────────────────────────

const ANIM = {
  slideIn: "slideIn 0.18s cubic-bezier(.34,1.56,.64,1)",
  fadeIn: "fadeIn 0.3s ease",
  scaleIn: "scaleIn 0.22s cubic-bezier(.34,1.56,.64,1)",
  popIn: "popIn 0.35s 0.1s cubic-bezier(.34,1.56,.64,1) both",
  spin: "spin 0.7s linear infinite",
} as const;

// Keyframes injected once at module level — a single minimal <style> just for @keyframes,
// which cannot be expressed as inline styles or Tailwind utilities.
const KEYFRAMES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  @keyframes slideIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.93) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }
  @keyframes popIn   { from { opacity:0; transform:scale(0.5) } to { opacity:1; transform:scale(1) } }
  @keyframes spin    { to   { transform:rotate(360deg) } }
  ::-webkit-scrollbar       { width:4px }
  ::-webkit-scrollbar-track { background:transparent }
  ::-webkit-scrollbar-thumb { background:#e5e7eb; border-radius:4px }
`;

// Injected once outside the component so it never re-renders
if (
  typeof document !== "undefined" &&
  !document.getElementById("cashier-keyframes")
) {
  const tag = document.createElement("style");
  tag.id = "cashier-keyframes";
  tag.textContent = KEYFRAMES;
  document.head.appendChild(tag);
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

interface ProductCardProps {
  item: MenuItem;
  onAdd: (item: MenuItem) => void;
  isPopping: boolean;
}

function ProductCard({ item, onAdd, isPopping }: ProductCardProps) {
  const isOut = item.remainingStock <= 0 && !isMenuFood(item);
  const bg = cardColor(item.id);

  return (
    <button
      onClick={() => {
        if (!isOut) onAdd(item);
      }}
      disabled={isOut}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        transform: isPopping ? "scale(0.94)" : "scale(1)",
        transition:
          "transform 0.15s cubic-bezier(.34,1.56,.64,1), box-shadow 0.2s, opacity 0.2s",
        opacity: isOut ? 0.55 : 1,
        cursor: isOut ? "not-allowed" : "pointer",
      }}
      className="group relative bg-white rounded-2xl overflow-hidden border border-gray-100 text-left w-full flex flex-col hover:shadow-lg hover:border-gray-200"
    >
      <div
        className="w-full aspect-square flex items-center justify-center"
        style={{ background: isOut ? "#F3F4F6" : bg }}
      >
        <UtensilsCrossed
          className="w-10 h-10"
          style={{ color: isOut ? "#D1D5DB" : "#92400E", opacity: 0.4 }}
        />
      </div>

      <div className="p-3">
        <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2 mb-1">
          {item.name}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-900">₱{item.price}</span>
          {!isMenuFood(item) && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: isOut ? "#FEE2E2" : "#DCFCE7",
                color: isOut ? "#EF4444" : "#16A34A",
              }}
            >
              {isOut ? "OUT" : item.remainingStock}
            </span>
          )}
        </div>
      </div>

      {!isOut && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(15,23,42,0.06)" }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.9)" }}
          >
            <Plus className="w-4 h-4 text-gray-700" />
          </div>
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface CartRowProps {
  item: CartItem;
  onRemove: (id: number) => void;
  onQty: (id: number, delta: number) => void;
}

function CartRow({ item, onRemove, onQty }: CartRowProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50"
      style={{ animation: ANIM.slideIn }}
    >
      <div
        className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
        style={{ background: cardColor(item.id) }}
      >
        <UtensilsCrossed className="w-4 h-4 text-amber-800 opacity-50" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800 truncate">
          {item.name}
        </p>
        <p className="text-xs font-bold text-gray-500 mt-0.5">₱{item.price}</p>

        <div className="flex items-center gap-1.5 mt-1">
          <button
            onClick={() => onQty(item.id, -1)}
            className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <Minus className="w-3 h-3 text-gray-500" />
          </button>
          <span className="w-5 text-center text-xs font-bold text-gray-800">
            {item.quantity}
          </span>
          <button
            onClick={() => onQty(item.id, 1)}
            className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <Plus className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      </div>

      <span className="text-xs font-bold text-gray-800 w-12 text-right">
        ₱{item.price * item.quantity}
      </span>

      <button
        onClick={() => onRemove(item.id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-400 transition-colors" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface SuccessModalProps {
  show: boolean;
  onClose: () => void;
  orderNumber: string;
  savedCart: CartItem[];
  paidAmount: number;
}

function SuccessModal({
  show,
  onClose,
  orderNumber,
  savedCart,
  paidAmount,
}: SuccessModalProps) {
  if (!show) return null;

  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          animation: ANIM.fadeIn,
        }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden relative pointer-events-auto"
          style={{ animation: ANIM.scaleIn }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors z-10"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>

          <div className="flex">
            {/* Left */}
            <div
              className="w-2/5 p-8 flex flex-col items-center justify-center"
              style={{
                background:
                  "linear-gradient(160deg, #052e16 0%, #14532d 50%, #166534 100%)",
              }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  animation: ANIM.popIn,
                }}
              >
                <Check className="w-8 h-8 text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-white font-bold text-lg text-center mb-1">
                Order Placed!
              </h2>
              <p className="text-green-300 text-xs text-center mb-6">
                Payment processed.
              </p>
              <p className="text-green-200 text-[11px] text-center font-mono mb-5">
                {orderNumber}
              </p>

              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-green-900 mb-2 hover:opacity-90 transition-opacity"
                style={{ background: "#4ade80" }}
              >
                Got It
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.2)" }}
              >
                New Order
              </button>
            </div>

            {/* Right */}
            <div className="flex-1 p-8">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-gray-800">
                  Order Summary
                </h3>
                <span className="text-xs text-gray-400">{date}</span>
              </div>
              <div className="w-full h-px bg-gray-100 mb-4" />

              <div className="space-y-2 max-h-52 overflow-y-auto mb-4 pr-1">
                {savedCart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">{item.name}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        ×{item.quantity}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-gray-800">
                      ₱{item.price * item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-dashed border-gray-100 pt-4 flex items-center justify-between">
                <span className="text-sm text-gray-500 font-medium">
                  Total Paid
                </span>
                <span className="text-2xl font-bold text-green-600">
                  ₱{paidAmount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function CashierView() {
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [isLoadingProducts, setIsLoading] = useState<boolean>(false);
  const [productsError, setProductsError] = useState<string>("");
  const [selectedCat, setSelectedCat] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<
    "dine-in" | "take-out" | "delivery"
  >("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "e-payment">(
    "cash",
  );
  const [poppingId, setPoppingId] = useState<number | null>(null);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [savedCart, setSavedCart] = useState<CartItem[]>([]);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [riderPickupTime, setRiderPickupTime] = useState<string>("");

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

  const categories: string[] = [
    "ALL",
    ...Array.from(new Set(products.map((p) => p.category))),
  ];

  const filtered: MenuItem[] = products.filter(
    (p) =>
      (selectedCat === "ALL" || p.category === selectedCat) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const addToCart = useCallback((item: MenuItem) => {
    if (item.remainingStock <= 0 && !isMenuFood(item)) return;
    setPoppingId(item.id);
    setTimeout(() => setPoppingId(null), 200);
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        const next = existing.quantity + 1;
        if (next > item.remainingStock && !isMenuFood(item)) return prev;
        return prev.map((c) =>
          c.id === item.id ? { ...c, quantity: next } : c,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = (id: number): void =>
    setCart((prev) => prev.filter((c) => c.id !== id));

  const updateQty = (id: number, delta: number): void => {
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

  const handlePayment = async (): Promise<void> => {
    if (cart.length === 0 || isPlacingOrder) return;
    setIsPlacingOrder(true);

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
    };

    try {
      const response = await api.post<OrderResponse>("/orders", payload);
      const num =
        response?.orderNumber ??
        `#${Math.floor(10000 + Math.random() * 90000)}`;
      setSavedCart([...cart]);
      setPaidAmount(total);
      setOrderNumber(num);
      setShowSuccess(true);
      setProducts((prev) =>
        prev.map((p) => {
          const ordered = cart.find((c) => c.id === p.id);
          if (!ordered || isMenuFood(p)) return p;
          return {
            ...p,
            remainingStock: Math.max(0, p.remainingStock - ordered.quantity),
          };
        }),
      );
    } catch (err) {
      console.error("Order failed:", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleCloseModal = (): void => {
    setShowSuccess(false);
    setCart([]);
    setSavedCart([]);
    setOrderType("dine-in");
    setPaymentMethod("cash");
  };

  // ── Pay button styles (inline, replacing .pay-btn) ──
  const payBtnStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
    color: "white",
    transition: "transform 0.12s, box-shadow 0.15s, opacity 0.15s",
    opacity: isPlacingOrder || cart.length === 0 ? 0.5 : 1,
    cursor: isPlacingOrder || cart.length === 0 ? "not-allowed" : "pointer",
  };

  return (
    <>
      <Sidebar />

      <div
        className="flex h-screen bg-gray-50 overflow-hidden"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {/* ── Main panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden pl-20">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-gray-400 font-medium tracking-wide uppercase">
                Menu · Cashier
              </p>
              <h1 className="text-lg font-bold text-gray-900 mt-0.5">
                Cashier View
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Online
            </div>
          </div>

          {/* Menu area */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* Search */}
            <div className="relative mb-4 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                type="text"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent"
              />
            </div>

            {/* Category pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={
                    selectedCat === cat
                      ? {
                          background: "#0f172a",
                          color: "#fff",
                          borderColor: "#0f172a",
                        }
                      : {
                          background: "#fff",
                          color: "#6b7280",
                          borderColor: "#e5e7eb",
                        }
                  }
                  onMouseEnter={(e) => {
                    if (selectedCat !== cat) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#9ca3af";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#374151";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCat !== cat) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#e5e7eb";
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#6b7280";
                    }
                  }}
                >
                  {cat === "ALL" ? "All Items" : cat}
                </button>
              ))}
            </div>

            {/* Product grid */}
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {isLoadingProducts && (
                <p className="col-span-full text-center text-sm text-gray-400 py-16">
                  Loading menu items...
                </p>
              )}
              {!isLoadingProducts && productsError && (
                <p className="col-span-full text-center text-sm text-red-400 py-16">
                  {productsError}
                </p>
              )}
              {!isLoadingProducts &&
                !productsError &&
                filtered.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{ animation: `slideIn 0.2s ${idx * 0.03}s both` }}
                  >
                    <ProductCard
                      item={item}
                      onAdd={addToCart}
                      isPopping={poppingId === item.id}
                    />
                  </div>
                ))}
              {!isLoadingProducts &&
                !productsError &&
                filtered.length === 0 && (
                  <p className="col-span-full text-center text-sm text-gray-400 py-16">
                    No items found.
                  </p>
                )}
            </div>
          </div>
        </div>

        {/* ── Cart ── */}
        <div
          className="bg-white border-l border-gray-100 flex flex-col"
          style={{ width: 320, flexShrink: 0 }}
        >
          <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Order List</h2>
            {totalQty > 0 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#0f172a", color: "#fff" }}
              >
                {totalQty}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {cart.length === 0 ? (
              <div
                className="h-full flex flex-col items-center justify-center text-center pb-8"
                style={{ animation: ANIM.fadeIn }}
              >
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 bg-slate-50">
                  <ShoppingBag className="w-7 h-7 text-gray-200" />
                </div>
                <p className="text-sm font-medium text-gray-400">
                  Cart is empty
                </p>
                <p className="text-xs text-gray-300 mt-1">Tap an item to add</p>
              </div>
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
          </div>

          {cart.length > 0 && (
            <div
              className="px-5 py-4 border-t border-gray-100"
              style={{ animation: ANIM.slideIn }}
            >
              <div
                className="rounded-xl p-3.5 mb-3"
                style={{ background: "#F8FAFC", border: "1px solid #F1F5F9" }}
              >
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>Items</span>
                  <span>{totalQty}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total</span>
                  <span className="text-xl font-bold text-gray-900">
                    ₱{totalPrice}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <select
                  value={orderType}
                  onChange={(e) =>
                    setOrderType(
                      e.target.value as "dine-in" | "take-out" | "delivery",
                    )
                  }
                  className="border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
                >
                  <option value="dine-in">Dine In</option>
                  <option value="take-out">Take Out</option>
                  <option value="delivery">Delivery</option>
                </select>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as "cash" | "e-payment")
                  }
                  className="border border-gray-200 rounded-xl px-2.5 py-2 text-xs bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
                >
                  <option value="cash">Cash</option>
                  <option value="e-payment">E-Payment</option>
                </select>
              </div>

              <button
                onClick={() => {
                  void handlePayment();
                }}
                disabled={isPlacingOrder || cart.length === 0}
                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                style={payBtnStyle}
                onMouseEnter={(e) => {
                  if (!isPlacingOrder && cart.length > 0) {
                    (e.currentTarget as HTMLButtonElement).style.transform =
                      "translateY(-1px)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      "0 8px 24px rgba(15,23,42,0.25)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "translateY(0)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "none";
                }}
                onMouseDown={(e) => {
                  if (!isPlacingOrder && cart.length > 0)
                    (e.currentTarget as HTMLButtonElement).style.transform =
                      "scale(0.98)";
                }}
                onMouseUp={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "translateY(-1px)";
                }}
              >
                {isPlacingOrder ? (
                  <>
                    <div
                      className="w-4 h-4 border-2 rounded-full"
                      style={{
                        borderColor: "rgba(255,255,255,0.3)",
                        borderTopColor: "white",
                        animation: ANIM.spin,
                      }}
                    />
                    Processing…
                  </>
                ) : (
                  <>
                    Pay ₱{totalPrice}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <SuccessModal
        show={showSuccess}
        onClose={handleCloseModal}
        orderNumber={orderNumber}
        savedCart={savedCart}
        paidAmount={paidAmount}
      />
    </>
  );
}
