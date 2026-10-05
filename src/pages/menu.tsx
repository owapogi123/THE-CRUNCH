import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Delete,
  FileText,
  History,
  Info,
  Minus,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Trash2,
  UtensilsCrossed,
  WifiOff,
  MessageSquare,
  Percent,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { api, apiCall, resolveAssetUrl } from "../lib/api";
import {
  fetchGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  type GeneralRestaurantSettings,
  getCurrencySymbol,
  formatCurrencyAmount,
  formatInSettingsTimezone,
} from "../lib/restaurantSettings";
import { Sidebar } from "@/components/Sidebar";
import { UserIdentityBanner } from "@/components/UserIdentityBanner";
import { useViewport } from "@/hooks/use-tablet";
import { useAuth } from "../context/authcontext";
import { canSettlePersistedOrders } from "../lib/permissions";
import {
  clampOrderItemQuantity,
  getEffectiveMaxQuantity,
} from "../lib/orderQuantity";
import { useEventInvalidation } from "@/hooks/use-event-invalidation";
import {
  buildKotHtml,
  buildReceiptHtml,
  downloadHtml,
  printHtml,
  type ReceiptDto,
} from "../lib/receipt";

/* ───────────────────────── setup ───────────────────────── */

if (
  typeof document !== "undefined" &&
  !document.getElementById("poppins-font")
) {
  document.head.appendChild(
    Object.assign(document.createElement("link"), {
      id: "poppins-font",
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap",
    }),
  );
}

const SP = { type: "spring" as const, stiffness: 400, damping: 28 };
const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};
const DATETIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  ...TIME,
};

type PaymentMethod = "cash" | "gcash_onsite";
type OrderTypeVal = "dine-in" | "take-out" | "delivery";
type ToastType = "success" | "error" | "info" | "warning";
type Settle = "refund" | "cancel";

interface Billing {
  taxRate: number;
  serviceCharge: number;
}
interface DiscountType {
  discount_id: number;
  name: string;
  percentage: number;
}
interface DiscountApproval {
  token: string;
  discountId: number;
}
interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
  remainingStock: number;
  availabilityStatus: string;
  image?: string | null;
}
interface CartItem extends MenuItem {
  quantity: number;
  note?: string;
}
interface TableItem {
  id: number;
  number: number;
  status: "available" | "occupied";
}
interface OnlineOrder {
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
interface ShiftOrder {
  id: number;
  orderNumber: string;
  total: number;
  createdAt: string;
  orderType: string;
  paymentMethod: string;
  status: string;
  paymentStatus?: string | null;
  items: { name: string; quantity: number; price: number }[];
}

/* ───────────────────────── helpers ───────────────────────── */

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const isPaid = (v?: string | null) => norm(v) === "paid";
const isUnavailable = (v: unknown) =>
  ["unavailable", "out of stock", "hidden", "not configured"].includes(norm(v));
const pct = (n: number) => String(Number(n.toFixed(2)));

const getSettlementAction = (
  status?: string | null,
  payment?: string | null,
): Settle | null => {
  const s = norm(status);
  if (["completed", "refunded", "cancelled"].includes(s)) return null;
  if (["queued", "preparing", "ready", "ready for pickup"].includes(s))
    return "refund";
  if (s === "pending payment") return "cancel";
  return isPaid(payment) ? "refund" : "cancel";
};

const paymentLabel = (m?: string | null) => {
  const n = norm(m);
  if (!n) return "—";
  if (n === "cash") return "Cash";
  if (n === "gcash") return "GCash";
  if (["cash on pickup", "cash_on_pickup"].includes(n)) return "Cash on Pickup";
  if (["gcash_onsite", "e-payment", "onsite e-payment"].includes(n))
    return "E-Payment";
  return m ?? "—";
};

const computePricing = (subtotal: number, b: Billing, discountRate: number) => {
  const discountAmount = subtotal * (Math.max(0, discountRate) / 100);
  const taxAmount = subtotal * (b.taxRate / 100);
  const serviceChargeAmount = subtotal * (b.serviceCharge / 100);
  return {
    subtotal,
    discountAmount,
    taxAmount,
    serviceChargeAmount,
    amountDue: subtotal - discountAmount + taxAmount + serviceChargeAmount,
  };
};

const mapProducts = (data: Record<string, any>[]): MenuItem[] => {
  const latest = new Map<string, Record<string, any>>();
  for (const p of data) {
    if (norm(p.item_type ?? "menu_item") !== "menu_item") continue;
    const key = norm(p.product_name ?? p.name);
    const prev = latest.get(key);
    if (
      !prev ||
      Number(p.product_id ?? p.id) > Number(prev.product_id ?? prev.id)
    )
      latest.set(key, p);
  }
  return [...latest.values()].map((p) => ({
    id: Number(p.product_id ?? p.id),
    name: String(p.product_name ?? p.name ?? `Product #${p.id}`),
    price: Number(p.price ?? 0),
    category: String(p.category ?? "UNCATEGORIZED").toUpperCase(),
    remainingStock: Math.max(
      0,
      Math.floor(
        Number(
          p.available_servings ??
            p.remainingStock ??
            p.stock ??
            p.quantity ??
            0,
        ),
      ) || 0,
    ),
    availabilityStatus: String(p.availability_status ?? "Available"),
    image: p.image ? resolveAssetUrl(String(p.image)) : null,
  }));
};

const mapTables = (data: Record<string, any>[]): TableItem[] =>
  data.map((t) => ({
    id: Number(t.id ?? t.table_id),
    number: Number(t.number ?? t.table_number ?? t.id),
    status: t.status === "occupied" ? "occupied" : "available",
  }));

/* ───────────────────────── shared UI ───────────────────────── */

const Ctx = createContext<{
  s: GeneralRestaurantSettings;
  money: (n: number) => string;
  time: (v: string) => string;
  dateTime: (v: string) => string;
}>(null!);
const useFmt = () => useContext(Ctx);

const btn =
  "w-full rounded-xl py-3.5 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40";
const B = {
  dark: `${btn} bg-neutral-900 text-white hover:bg-neutral-800`,
  green: `${btn} bg-green-600 text-white hover:bg-green-700`,
  blue: `${btn} bg-sky-600 text-white hover:bg-sky-700`,
  red: `${btn} bg-red-600 text-white hover:bg-red-700`,
  ghost: `${btn} bg-neutral-100 text-neutral-600 hover:bg-neutral-200`,
  slate: `${btn} bg-slate-700 text-white hover:bg-slate-800`,
};
const act =
  "flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50";
const ACT = {
  green: `${act} border-green-600 bg-green-600 text-white`,
  dark: `${act} border-neutral-900 bg-neutral-900 text-white`,
  red: `${act} border-red-200 bg-red-50 text-red-600`,
};
const eyebrow =
  "text-xs font-semibold uppercase tracking-wider text-neutral-400";

const Spinner = ({ size = 16, light = false }) => (
  <span
    className={`inline-block shrink-0 animate-spin rounded-full border-2 ${light ? "border-white/30 border-t-white" : "border-neutral-200 border-t-neutral-600"}`}
    style={{ width: size, height: size }}
  />
);

function Modal({
  show,
  onClose,
  max = "max-w-md",
  children,
}: {
  show: boolean;
  onClose?: () => void;
  max?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={SP}
            className={`max-h-[92vh] w-full ${max} overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-2xl`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ModalHead = ({
  eyebrow: e,
  title,
  tone = "text-green-600",
  onClose,
}: {
  eyebrow: string;
  title: string;
  tone?: string;
  onClose?: () => void;
}) => (
  <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-5 sm:px-6">
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>
        {e}
      </p>
      <p className="text-xl font-bold text-neutral-900">{title}</p>
    </div>
    {onClose && (
      <button
        onClick={onClose}
        className="rounded-lg p-2 hover:bg-neutral-100"
      >
        <X className="h-5 w-5 text-neutral-400" />
      </button>
    )}
  </div>
);

const TOAST = {
  success: {
    c: "border-green-200 bg-green-50 text-green-600",
    I: CheckCircle2,
  },
  error: { c: "border-red-200 bg-red-50 text-red-600", I: AlertCircle },
  info: { c: "border-blue-200 bg-blue-50 text-blue-600", I: Info },
  warning: {
    c: "border-amber-200 bg-amber-50 text-amber-600",
    I: AlertTriangle,
  },
};

function useToast() {
  const [toasts, setToasts] = useState<
    { id: string; type: ToastType; message: string }[]
  >([]);
  const dismiss = useCallback(
    (id: string) => setToasts((p) => p.filter((t) => t.id !== id)),
    [],
  );
  const toast = useCallback(
    (type: ToastType, message: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((p) => [...p, { id, type, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );
  return { toasts, toast, dismiss };
}

const TONE = {
  idle: "border-neutral-200 bg-neutral-50 text-neutral-500",
  green: "border-green-600 bg-green-50 text-green-700",
  dark: "border-neutral-900 bg-neutral-50 text-neutral-900",
  amber: "border-amber-400 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-600",
};
const BADGE = {
  idle: "bg-neutral-400",
  green: "bg-green-600",
  dark: "bg-neutral-900",
  amber: "bg-amber-500",
  red: "bg-red-600",
};

function Pill({
  tone = "idle",
  count = 0,
  pulse,
  open,
  onClick,
  children,
}: {
  tone?: keyof typeof TONE;
  count?: number;
  pulse?: boolean;
  open?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${TONE[tone]}`}
    >
      {pulse && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      {children}
      {count > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${BADGE[tone]}`}
        >
          {count}
        </span>
      )}
      {open !== undefined && (
        <ChevronDown
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
        />
      )}
    </button>
  );
}

const Chip = ({
  children,
  className = "bg-neutral-100 text-neutral-600",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${className}`}
  >
    {children}
  </span>
);

const PayBadge = ({ status }: { status?: string | null }) =>
  isPaid(status) ? (
    <Chip className="border border-green-200 bg-green-100 text-green-700">
      Paid
    </Chip>
  ) : (
    <Chip className="border border-amber-200 bg-amber-100 text-amber-700">
      {!status || norm(status) === "pending payment" ? "Unpaid" : status}
    </Chip>
  );

const Select = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-3.5 pr-9 text-sm text-neutral-700 outline-none focus:border-neutral-900"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
  </div>
);

const Collapse = ({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) => (
  <AnimatePresence initial={false}>
    {open && (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-4 overflow-hidden"
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

const Empty = ({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-neutral-400">
    {icon}
    {children}
  </div>
);

/** One order card, shared by review / pickup / delivery panels. */
function OrderRow({
  o,
  showPay,
  actions,
}: {
  o: OnlineOrder;
  showPay?: boolean;
  actions?: ReactNode;
}) {
  const { money, time } = useFmt();
  return (
    <div className="grid gap-2 border-t border-neutral-200/70 p-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-neutral-900">
              {o.orderNumber}
            </span>
            <Chip className="bg-green-100 text-green-800">
              {o.trackingStatus}
            </Chip>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-neutral-500">
            <span className="capitalize">{o.orderType}</span>
            <span>{time(o.createdAt)}</span>
            <b className="text-neutral-900">{money(o.total)}</b>
          </p>
          {showPay && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
              Payment: {paymentLabel(o.paymentMethod)}{" "}
              <PayBadge status={o.paymentStatus} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      </div>
      <p className="text-sm text-neutral-600">
        {o.items.map((i) => `${i.quantity}× ${i.name}`).join("  ·  ")}
      </p>
    </div>
  );
}

const PanelTitle = ({ children }: { children: ReactNode }) => (
  <p className="border-t border-neutral-200/70 px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-neutral-700 first:border-t-0">
    {children}
  </p>
);

/* ───────────────────────── menu + cart ───────────────────────── */

const ProductCard = memo(
  ({
    item,
    onAdd,
    inCart,
  }: {
    item: MenuItem;
    onAdd: (i: MenuItem) => void;
    inCart: boolean;
  }) => {
    const { money } = useFmt();
    const out =
      isUnavailable(item.availabilityStatus) ||
      getEffectiveMaxQuantity(item.remainingStock) === 0;
    return (
      <motion.button
        layout
        disabled={out}
        onClick={() => onAdd(item)}
        whileHover={out ? {} : { y: -3 }}
        whileTap={out ? {} : { scale: 0.97 }}
        transition={SP}
        className={`relative overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-shadow hover:shadow-md ${inCart ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"} ${out ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-neutral-100">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <UtensilsCrossed className="h-8 w-8 text-neutral-300" />
          )}
        </div>
        {out && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-red-800 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white">
            OUT OF STOCK
          </span>
        )}
        {inCart && (
          <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </span>
        )}
        <div className="p-3 sm:p-4">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-neutral-800">
            {item.name}
          </p>
          <p className="mt-2 text-base font-semibold text-neutral-900">
            {money(item.price)}
          </p>
        </div>
      </motion.button>
    );
  },
);

const CartRow = memo(
  ({
    item,
    onRemove,
    onQty,
    onNote,
  }: {
    item: CartItem;
    onRemove: (id: number) => void;
    onQty: (id: number, d: number) => void;
    onNote: (id: number, n: string) => void;
  }) => {
    const { money } = useFmt();
    const [showNote, setShowNote] = useState(false);
    const max = getEffectiveMaxQuantity(item.remainingStock);
    const step =
      "flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white transition active:scale-90 disabled:opacity-40";
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 12 }}
        transition={SP}
        className="border-b border-neutral-100 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
            {item.image ? (
              <img
                src={item.image}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <UtensilsCrossed className="h-5 w-5 text-neutral-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-800">
              {item.name}
            </p>
            <p className="text-xs text-neutral-400">{money(item.price)} each</p>
          </div>
          <span className="text-sm font-semibold text-neutral-900">
            {money(item.price * item.quantity)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button className={step} onClick={() => onQty(item.id, -1)}>
              <Minus className="h-3.5 w-3.5 text-neutral-600" />
            </button>
            <input
              type="number"
              min={1}
              max={max}
              value={item.quantity}
              onChange={(e) => {
                const v = clampOrderItemQuantity(
                  e.target.value,
                  item.remainingStock,
                );
                if (v > 0) onQty(item.id, v - item.quantity);
              }}
              className="h-9 w-12 rounded-lg border border-neutral-200 text-center text-sm font-semibold outline-none focus:border-neutral-900"
            />
            <button
              className={step}
              disabled={item.quantity >= max}
              onClick={() => onQty(item.id, 1)}
            >
              <Plus className="h-3.5 w-3.5 text-neutral-600" />
            </button>
          </div>
          <div className="flex gap-1">
            <button
              title="Add note"
              onClick={() => setShowNote((p) => !p)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.note ? "bg-blue-50" : "hover:bg-neutral-100"}`}
            >
              <MessageSquare
                className={`h-4 w-4 ${item.note ? "text-blue-600" : "text-neutral-300"}`}
              />
            </button>
            <button
              title="Remove"
              onClick={() => onRemove(item.id)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 text-neutral-300 hover:text-red-500" />
            </button>
          </div>
        </div>
        <Collapse open={showNote}>
          <input
            value={item.note ?? ""}
            onChange={(e) => onNote(item.id, e.target.value)}
            maxLength={120}
            placeholder="Special instruction (e.g. no onions)…"
            className="mt-3 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </Collapse>
      </motion.div>
    );
  },
);

/* ───────────────────────── modals ───────────────────────── */

function ConfirmModal({
  show,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal show={show} max="max-w-sm" onClose={busy ? undefined : onCancel}>
      <div className="p-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50">
          <Ban className="h-5 w-5 text-red-600" />
        </div>
        <p className="mb-1.5 text-lg font-semibold">{title}</p>
        <p className="text-sm leading-relaxed text-neutral-500">{message}</p>
      </div>
      <div className="space-y-2 px-6 pb-6">
        <button
          className={`${B.red} flex items-center justify-center gap-2`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy && <Spinner size={14} light />}
          {confirmLabel}
        </button>
        <button className={B.ghost} disabled={busy} onClick={onCancel}>
          Keep Order
        </button>
      </div>
    </Modal>
  );
}

function ProceedModal({
  order,
  busy,
  onConfirm,
  onCancel,
}: {
  order: OnlineOrder | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { money, time } = useFmt();
  const paid = order ? isPaid(order.paymentStatus) : false;
  return (
    <Modal show={!!order} onClose={busy ? undefined : onCancel}>
      {order && (
        <>
          <ModalHead
            eyebrow="Confirm order"
            title={order.orderNumber}
            onClose={busy ? undefined : onCancel}
          />
          <div className="grid grid-cols-2 gap-2.5 border-b border-neutral-100 p-5 sm:p-6">
            {[
              [
                "Order type",
                <span className="capitalize">{order.orderType}</span>,
              ],
              ["Placed at", time(order.createdAt)],
              ["Payment", paymentLabel(order.paymentMethod)],
              ["Pay status", <PayBadge status={order.paymentStatus} />],
            ].map(([l, v], i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-100 bg-neutral-50 p-3"
              >
                <p className={`${eyebrow} mb-1`}>{l}</p>
                <div className="text-sm font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto border-b border-neutral-100 p-5 sm:p-6">
            <p className={eyebrow}>Order items</p>
            {order.items.map((i, k) => (
              <p key={k} className="text-sm text-neutral-700">
                <b className="mr-2">{i.quantity}×</b>
                {i.name}
              </p>
            ))}
          </div>
          <div className="space-y-3 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500">Order total</span>
              <span className="text-2xl font-bold">{money(order.total)}</span>
            </div>
            <p
              className={`rounded-xl border p-3 text-sm ${paid ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
            >
              {paid
                ? "Payment confirmed. Proceeding will queue this order for kitchen preparation."
                : "Payment is still unpaid. Proceeding will mark it as paid and queue it. Verify with the customer first."}
            </p>
            <button
              className={`${B.green} flex items-center justify-center gap-2`}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? (
                <>
                  <Spinner size={14} light />
                  Processing…
                </>
              ) : (
                "Confirm & proceed to queue"
              )}
            </button>
            <button className={B.ghost} disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function HandoverModal({
  order,
  rider,
  setRider,
  saving,
  onConfirm,
  onCancel,
}: {
  order: OnlineOrder | null;
  rider: string;
  setRider: (v: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { money, time } = useFmt();
  return (
    <Modal
      show={!!order}
      max="max-w-sm"
      onClose={saving ? undefined : onCancel}
    >
      {order && (
        <>
          <ModalHead
            eyebrow="Delivery handover"
            title={order.orderNumber}
            onClose={saving ? undefined : onCancel}
          />
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <p className={`${eyebrow} mb-1.5`}>Rider name</p>
              <input
                autoFocus
                value={rider}
                onChange={(e) => setRider(e.target.value)}
                disabled={saving}
                placeholder="Enter rider name"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm outline-none focus:border-neutral-900"
              />
            </div>
            <div className="space-y-1.5 rounded-xl border border-neutral-100 bg-neutral-50 p-3.5 text-sm">
              <p className="flex justify-between">
                <span className="text-neutral-500">Handover time</span>
                <b>{time(new Date().toISOString())}</b>
              </p>
              <p className="flex justify-between">
                <span className="text-neutral-500">Amount</span>
                <b>{money(order.total)}</b>
              </p>
            </div>
            <button
              className={B.dark}
              disabled={saving || !rider.trim()}
              onClick={onConfirm}
            >
              {saving ? "Saving…" : "Confirm handover"}
            </button>
            <button className={B.ghost} disabled={saving} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function AmountModal({
  show,
  amountDue,
  method,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  amountDue: number;
  method: PaymentMethod;
  onConfirm: (p: { tendered: number; file?: File }) => void;
  onCancel: () => void;
}) {
  const { money, s } = useFmt();
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (show) {
      setInput("");
      setFile(null);
      setErr("");
    }
  }, [show]);

  const tendered = parseFloat(input) || 0;
  const enough = tendered >= amountDue;
  const quick = [50, 100, 200, 500, 1000].filter((d) => d >= amountDue);
  const press = (k: string) =>
    setInput((p) =>
      k === "⌫"
        ? p.slice(0, -1)
        : p.length > 8
          ? p
          : k === "00"
            ? p
              ? p + "00"
              : p
            : p + k,
    );
  const onFile = (f?: File) => {
    const e = !f
      ? ""
      : !f.type.startsWith("image/")
        ? "Please upload an image file."
        : f.size > 5 * 1024 * 1024
          ? "Proof image must be 5 MB or smaller."
          : "";
    setErr(e);
    setFile(f && !e ? f : null);
  };

  return (
    <Modal show={show} max="max-w-sm" onClose={onCancel}>
      <div className="border-b border-neutral-100 px-5 py-5 sm:px-6">
        <p className={eyebrow}>Amount due</p>
        <p className="text-3xl font-semibold">{money(amountDue)}</p>
      </div>
      <div className="p-5 sm:p-6">
        {method === "cash" ? (
          <>
            <p className={`${eyebrow} mb-1.5`}>Cash tendered</p>
            <div
              className={`mb-3 flex min-h-[52px] items-center gap-2 rounded-xl border-2 bg-neutral-50 px-4 ${input ? "border-neutral-900" : "border-neutral-200"}`}
            >
              <span className="text-neutral-400">{getCurrencySymbol(s)}</span>
              <span
                className={`flex-1 text-2xl font-semibold ${input ? "" : "text-neutral-300"}`}
              >
                {input || "0"}
              </span>
            </div>
            {quick.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {quick.map((a) => (
                  <button
                    key={a}
                    onClick={() => setInput(String(a))}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600"
                  >
                    {money(a)}
                  </button>
                ))}
              </div>
            )}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <p className="text-xs text-neutral-400">Change</p>
                <p
                  className={`text-lg font-semibold ${enough && input ? "text-green-600" : "text-neutral-300"}`}
                >
                  {enough && input ? money(tendered - amountDue) : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <p className="text-xs text-neutral-400">Tendered</p>
                <p
                  className={`text-lg font-semibold ${input ? "" : "text-neutral-300"}`}
                >
                  {input ? money(tendered) : "—"}
                </p>
              </div>
            </div>
            {input && !enough && (
              <p className="mb-2 text-sm font-medium text-red-500">
                {money(amountDue - tendered)} short
              </p>
            )}
            <div className="mb-4 grid grid-cols-3 gap-2">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "⌫",
                "0",
                "00",
              ].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 bg-white text-lg font-medium transition active:scale-90"
                >
                  {k === "⌫" ? (
                    <Delete className="h-5 w-5 text-neutral-400" />
                  ) : (
                    k
                  )}
                </button>
              ))}
            </div>
            <button
              className={`${B.green} mb-2`}
              disabled={!input || !enough}
              onClick={() => onConfirm({ tendered })}
            >
              Confirm payment
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col items-center rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <p className="mb-3 text-sm font-semibold text-sky-700">
                E-Payment
              </p>
              <img
                src="/gcashQR1.png"
                alt="GCash QR"
                className="h-44 w-44 rounded-xl border border-neutral-200 bg-white object-contain"
              />
              <p className="mt-3 text-center text-xs text-neutral-400">
                Ask the customer to scan, then upload the proof below.
              </p>
            </div>
            <div className="mb-4 rounded-xl border border-neutral-200 p-3">
              <p className={`${eyebrow} mb-2`}>Proof image</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onFile(e.currentTarget.files?.[0])}
                className="w-full text-sm"
              />
              {err && (
                <p className="mt-2 text-sm font-medium text-red-600">{err}</p>
              )}
              {preview && (
                <>
                  <img
                    src={preview}
                    alt="Payment proof"
                    className="mt-3 max-h-52 w-full rounded-lg border border-neutral-200 object-contain"
                  />
                  <button
                    onClick={() => onFile()}
                    className="ml-auto mt-2 block rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600"
                  >
                    Remove image
                  </button>
                </>
              )}
            </div>
            <button
              className={`${B.blue} mb-2`}
              disabled={!file}
              onClick={() =>
                onConfirm({ tendered: amountDue, file: file ?? undefined })
              }
            >
              Confirm payment
            </button>
          </>
        )}
        <button className={B.ghost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function DiscountModal({
  show,
  discounts,
  selectedName,
  onSelect,
  onClose,
}: {
  show: boolean;
  discounts: DiscountType[];
  selectedName: string;
  onSelect: (discount: DiscountType) => void;
  onClose: () => void;
}) {
  return (
    <Modal show={show} max="max-w-sm" onClose={onClose}>
      <ModalHead
        eyebrow="Payment adjustment"
        title="Discount"
        tone="text-green-600"
        onClose={onClose}
      />
      <div className="space-y-2 p-5 sm:p-6">
        {discounts.map((discount) => {
          const selected = discount.name === selectedName;
          const rate = Number(discount.percentage || 0);
          return (
            <button
              key={discount.discount_id}
              type="button"
              onClick={() => onSelect(discount)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${selected ? "border-green-500 bg-green-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}
            >
              <span>
                <span className="block text-sm font-semibold text-neutral-900">
                  {discount.name}
                </span>
                <span className="block text-xs text-neutral-400">
                  {rate > 0
                    ? "Authorization required"
                    : "No authorization required"}
                </span>
              </span>
              <span className="font-semibold text-green-700">{pct(rate)}%</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function DiscountAuthorizationModal({
  show,
  discount,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  discount: DiscountType | null;
  busy: boolean;
  error: string;
  onConfirm: (code: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  useEffect(() => {
    if (show) setCode("");
  }, [show, discount?.discount_id]);

  return (
    <Modal show={show} max="max-w-sm" onClose={busy ? undefined : onCancel}>
      <ModalHead
        eyebrow="Manager approval"
        title="Authorize discount"
        tone="text-amber-600"
        onClose={busy ? undefined : onCancel}
      />
      <div className="p-5 sm:p-6">
        <p className="mb-4 text-sm text-neutral-500">
          Enter the authorization code to apply{" "}
          <b className="text-neutral-900">{discount?.name}</b> (
          {pct(Number(discount?.percentage || 0))}%).
        </p>
        <label
          className={`${eyebrow} mb-1.5 block`}
          htmlFor="discount-authorization-code"
        >
          Authorization code
        </label>
        <input
          id="discount-authorization-code"
          autoFocus
          type="password"
          autoComplete="off"
          value={code}
          disabled={busy}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.trim() && !busy) onConfirm(code);
          }}
          className="mb-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-neutral-900"
        />
        {error && (
          <p className="mb-3 text-sm font-medium text-red-600">{error}</p>
        )}
        <button
          className={`${B.green} mb-2 flex items-center justify-center gap-2`}
          disabled={!code.trim() || busy}
          onClick={() => onConfirm(code)}
        >
          {busy && <Spinner size={14} light />}Authorize discount
        </button>
        <button className={B.ghost} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function SuccessModal({
  receipt: r,
  cashier,
  onClose,
}: {
  receipt: ReceiptDto | null;
  cashier: string;
  onClose: () => void;
}) {
  const { money, dateTime } = useFmt();
  const m = (v: number | null) => (v == null ? "—" : money(v));
  const rows: [string, number | null][] = r
    ? [
        ["Subtotal", r.subtotal],
        ["Discount", r.discount.amount ? -r.discount.amount : 0],
        ["Tax", r.tax.amount],
        ["Service charge", r.serviceCharge.amount],
      ]
    : [];
  const isCash = r?.paymentMethod === "cash" && r.cashTendered != null;
  return (
    <Modal show={!!r} max="max-w-sm">
      {r && (
        <>
          <div className="flex flex-col items-center px-6 pb-5 pt-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...SP, delay: 0.08 }}
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-green-200 bg-green-50"
            >
              <Check className="h-6 w-6 text-green-500" strokeWidth={2.5} />
            </motion.div>
            <p className="text-lg font-semibold">Order placed successfully</p>
            <p className="mb-3 text-sm text-neutral-400">
              The kitchen can start preparing.
            </p>
            <div className="rounded-xl border border-neutral-200 bg-neutral-100 px-5 py-2">
              <p className={eyebrow}>Order ID</p>
              <p className="text-lg font-bold">{r.orderNumber}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-y border-neutral-100 bg-neutral-100 text-center">
            {[
              ["Cashier", r.cashierName || cashier || "—"],
              ["Date", dateTime(r.orderDate)],
              [
                "Type",
                [
                  r.orderType,
                  r.tableNumber && `Table ${r.tableNumber}`,
                  paymentLabel(r.paymentMethod),
                ]
                  .filter(Boolean)
                  .join(" · "),
              ],
            ].map(([l, v]) => (
              <div key={l} className="bg-white px-3 py-3">
                <p className={eyebrow}>{l}</p>
                <p className="break-words text-sm font-medium capitalize text-neutral-700">
                  {v}
                </p>
              </div>
            ))}
          </div>
          <div className="max-h-36 space-y-2 overflow-y-auto px-6 py-4">
            {r.items.map((i, k) => (
              <div key={k} className="flex justify-between gap-3 text-sm">
                <span className="text-neutral-600">
                  {i.productName}{" "}
                  <span className="text-neutral-400">×{i.quantity}</span>
                  {i.note && (
                    <em className="block text-xs text-neutral-400">{i.note}</em>
                  )}
                </span>
                <span className="font-medium">{m(i.subtotal)}</span>
              </div>
            ))}
          </div>
          {r.orderNote && (
            <p className="mx-6 mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <b>Note:</b> {r.orderNote}
            </p>
          )}
          <div className="mx-6 mb-4 overflow-hidden rounded-xl border border-neutral-100 text-sm">
            {rows
              .filter(([l, v]) => l === "Subtotal" || v)
              .map(([l, v]) => (
                <p
                  key={l}
                  className="flex justify-between border-b border-dashed border-neutral-100 px-4 py-2 text-neutral-400"
                >
                  <span>{l}</span>
                  <span>{m(v)}</span>
                </p>
              ))}
            <p className="flex items-center justify-between bg-neutral-50 px-4 py-3">
              <span className="font-medium text-neutral-600">Total paid</span>
              <span className="text-xl font-semibold">{m(r.total)}</span>
            </p>
            {isCash && (
              <>
                <p className="flex justify-between border-t border-dashed border-neutral-100 px-4 py-2 text-neutral-500">
                  <span>Cash tendered</span>
                  <span>{m(r.cashTendered)}</span>
                </p>
                <p className="flex justify-between bg-green-50 px-4 py-2.5 font-semibold text-green-600">
                  <span>Change</span>
                  <span>{m(r.change)}</span>
                </p>
              </>
            )}
          </div>
          <div className="space-y-2 border-t border-neutral-100 p-6">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`${B.dark} flex items-center justify-center gap-2`}
                onClick={() => printHtml(buildReceiptHtml(r, { cashier }))}
              >
                <Printer className="h-4 w-4" />
                Receipt
              </button>
              <button
                className={`${B.slate} flex items-center justify-center gap-2`}
                onClick={() =>
                  printHtml(buildKotHtml(r, { cashier }), 320, 520)
                }
              >
                <FileText className="h-4 w-4" />
                KOT
              </button>
            </div>
            <button
              className={B.ghost}
              onClick={() =>
                downloadHtml(
                  buildReceiptHtml(r, { cashier }),
                  `receipt-${r.orderNumber.replace(/[^\w-]/g, "") || "order"}.html`,
                )
              }
            >
              Download receipt
            </button>
            <button className={B.green} onClick={onClose}>
              New order
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function HistoryModal({
  show,
  orders,
  loading,
  settlingId,
  canSettle,
  onClose,
  onSettle,
  onReprint,
}: {
  show: boolean;
  orders: ShiftOrder[];
  loading: boolean;
  settlingId: number | null;
  canSettle: boolean;
  onClose: () => void;
  onSettle: (o: ShiftOrder) => void;
  onReprint: (o: ShiftOrder) => void;
}) {
  const { money, time } = useFmt();
  const [open, setOpen] = useState<number | null>(null);
  const valid = orders.filter(
    (o) => !["cancelled", "refunded"].includes(norm(o.status)),
  );
  const voidedCount = orders.filter(
    (o) => norm(o.status) === "cancelled",
  ).length;
  const stats = [
    ["Orders", String(valid.length), ""],
    [
      "Revenue",
      money(valid.reduce((s, o) => s + o.total, 0)),
      "text-green-600",
    ],
    ["Voided", String(voidedCount), "text-red-600"],
  ];
  const iconBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 transition active:scale-95";

  return (
    <Modal show={show} max="max-w-xl" onClose={onClose}>
      <ModalHead
        eyebrow="Shift summary"
        title="Today's orders"
        tone="text-blue-600"
        onClose={onClose}
      />
      <div className="grid grid-cols-3 gap-2 border-b border-neutral-100 p-4 sm:gap-3 sm:p-5">
        {stats.map(([l, v, c]) => (
          <div
            key={l}
            className="rounded-xl border border-neutral-100 bg-neutral-50 p-3 text-center"
          >
            <p className={eyebrow}>{l}</p>
            <p className={`break-words text-lg font-bold sm:text-xl ${c}`}>
              {v}
            </p>
          </div>
        ))}
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner size={22} />
        </div>
      ) : !orders.length ? (
        <Empty icon={<Receipt className="h-8 w-8 text-neutral-200" />}>
          No orders placed yet this shift
        </Empty>
      ) : (
        orders.map((o) => {
          const cancelled = norm(o.status) === "cancelled";
          const refunded = norm(o.status) === "refunded";
          const settled = cancelled || refunded;
          const action = getSettlementAction(o.status, o.paymentStatus);
          return (
            <div
              key={o.id}
              className="border-b border-neutral-100 last:border-0"
            >
              <div className="flex items-center gap-2 px-4 py-4 sm:gap-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`font-bold ${settled ? "text-neutral-400 line-through" : ""}`}
                    >
                      {o.orderNumber}
                    </span>
                    <Chip
                      className={
                        cancelled
                          ? "bg-red-100 text-red-600"
                          : refunded
                            ? "bg-slate-100 text-slate-600"
                            : "bg-green-100 text-green-700"
                      }
                    >
                      {o.status}
                    </Chip>
                    <Chip>{o.orderType}</Chip>
                  </div>
                  <p className="text-sm text-neutral-500">
                    {time(o.createdAt)} ·{" "}
                    <b className="text-neutral-900">{money(o.total)}</b> ·{" "}
                    {paymentLabel(o.paymentMethod)}
                  </p>
                </div>
                <button
                  className={iconBtn}
                  onClick={() => setOpen(open === o.id ? null : o.id)}
                >
                  <ChevronRight
                    className={`h-4 w-4 text-neutral-500 transition ${open === o.id ? "rotate-90" : ""}`}
                  />
                </button>
                {!cancelled && (
                  <button
                    className={iconBtn}
                    title="Reprint receipt"
                    onClick={() => onReprint(o)}
                  >
                    <Printer className="h-4 w-4 text-neutral-500" />
                  </button>
                )}
                {!cancelled && canSettle && action && (
                  <button
                    className={`${iconBtn} !border-red-200 !bg-red-50`}
                    disabled={settlingId === o.id}
                    title={action === "refund" ? "Refund order" : "Void order"}
                    onClick={() => onSettle(o)}
                  >
                    {settlingId === o.id ? (
                      <Spinner size={14} />
                    ) : action === "refund" ? (
                      <RotateCcw className="h-4 w-4 text-red-600" />
                    ) : (
                      <Ban className="h-4 w-4 text-red-600" />
                    )}
                  </button>
                )}
              </div>
              <Collapse open={open === o.id}>
                <div className="mx-4 -mt-3 mb-4 space-y-1 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-sm sm:mx-6">
                  {o.items.map((i, k) => (
                    <p key={k} className="flex justify-between gap-3">
                      <span>
                        {i.name} ×{i.quantity}
                      </span>
                      <span className="font-medium">
                        {money(i.price * i.quantity)}
                      </span>
                    </p>
                  ))}
                  <p className="flex justify-between border-t border-neutral-200 pt-2 font-bold">
                    <span>Total</span>
                    <span>{money(o.total)}</span>
                  </p>
                </div>
              </Collapse>
            </div>
          );
        })
      )}
    </Modal>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function CashierView() {
  const { width } = useViewport();
  const compact = width < 1100;
  const { user } = useAuth();
  const { toasts, toast, dismiss } = useToast();
  const firstPoll = useRef(true);
  const placingRef = useRef(false);
  const prevReviewCount = useRef(0);
  const prevDeliveryCount = useRef(0);

  const u = user as Record<string, unknown> | null;
  const cashierId = Number(u?.userId) > 0 ? Number(u?.userId) : null;
  const canManagePersistedSettlements = canSettlePersistedOrders(u?.role);
  const cashierName = String(
    u?.fullName ??
      u?.full_name ??
      u?.name ??
      ([u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        (u?.username ?? u?.email ?? "Cashier")),
  );

  // menu + order
  const [products, setProducts] = useState<MenuItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderTypeVal>("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerType, setCustomerType] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [billing, setBilling] = useState<Billing>({
    taxRate: 0,
    serviceCharge: 0,
  });
  const [discountTypes, setDiscountTypes] = useState<DiscountType[]>([]);
  const [settings, setSettings] = useState<GeneralRestaurantSettings>(
    GENERAL_SETTINGS_DEFAULTS,
  );
  const [tables, setTables] = useState<TableItem[]>([]);
  const [tablesSupported, setTablesSupported] = useState(true);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine,
  );

  // modals
  const [showAmount, setShowAmount] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState<DiscountType | null>(
    null,
  );
  const [discountApproval, setDiscountApproval] =
    useState<DiscountApproval | null>(null);
  const [discountAuthError, setDiscountAuthError] = useState("");
  const [authorizingDiscount, setAuthorizingDiscount] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState<ReceiptDto | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [shiftOrders, setShiftOrders] = useState<ShiftOrder[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);

  // online orders
  const [review, setReview] = useState<OnlineOrder[]>([]);
  const [ready, setReady] = useState<OnlineOrder[]>([]);
  const [delivery, setDelivery] = useState<OnlineOrder[]>([]);
  const [handed, setHanded] = useState<OnlineOrder[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [proceedOrder, setProceedOrder] = useState<OnlineOrder | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [handoverOrder, setHandoverOrder] = useState<OnlineOrder | null>(null);
  const [rider, setRider] = useState("");
  const [savingHandover, setSavingHandover] = useState(false);

  const fmt = useMemo(
    () => ({
      s: settings,
      money: (n: number) => formatCurrencyAmount(n, settings),
      time: (v: string) => formatInSettingsTimezone(v, settings, TIME),
      dateTime: (v: string) => formatInSettingsTimezone(v, settings, DATETIME),
    }),
    [settings],
  );

  /* ── data loading ── */
  useEffect(() => {
    const on = () => {
      setIsOnline(true);
      toast("success", "Connection restored.");
    };
    const off = () => {
      setIsOnline(false);
      toast(
        "error",
        "Lost connection. Orders cannot be placed until reconnected.",
      );
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [toast]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const next = mapProducts(
        (await api.get<Record<string, any>[]>(
          "/products?item_type=menu_item",
        )) ?? [],
      );
      setProducts(next);
      setProductsError("");
      // keep the cart in sync with live stock
      setCart((prev) =>
        prev.flatMap((item) => {
          const cur = next.find((p) => p.id === item.id);
          const max = cur ? getEffectiveMaxQuantity(cur.remainingStock) : 0;
          return cur && max > 0
            ? [{ ...item, ...cur, quantity: Math.min(item.quantity, max) }]
            : [];
        }),
      );
    } catch {
      setProductsError("Failed to load menu items.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    let off = false;
    api
      .get<Record<string, any>>("/settings")
      .then(
        (d) =>
          !off &&
          setBilling({
            taxRate: Math.max(0, Number(d?.taxRate || 0)),
            serviceCharge: Math.max(0, Number(d?.serviceCharge || 0)),
          }),
      )
      .catch(() => {});
    api
      .get<DiscountType[]>("/settings/discount-types")
      .then((d) => {
        if (off || !Array.isArray(d) || !d.length) return;
        setDiscountTypes(d);
        const defaultDiscount =
          d.find((item) => Number(item.percentage || 0) <= 0) ?? d[0];
        setCustomerType((p) =>
          d.some((x) => x.name === p) ? p : defaultDiscount.name,
        );
      })
      .catch(() => !off && toast("error", "Could not load discount types."));
    fetchGeneralSettings().then((d) => !off && setSettings(d));
    return () => {
      off = true;
    };
  }, [toast]);

  useEffect(() => {
    if (orderType !== "dine-in") {
      setSelectedTable(null);
      return;
    }
    if (!tablesSupported) return;
    let off = false;
    apiCall<Record<string, any>[]>("/tables", {
      method: "GET",
      suppressErrorStatuses: [404],
    })
      .then((d) => !off && setTables(mapTables(d ?? [])))
      .catch((e) => {
        if (off) return;
        if (e?.status === 404) setTablesSupported(false);
        else
          toast(
            "warning",
            "Could not load tables. Table selection unavailable.",
          );
        setTables([]);
      });
    return () => {
      off = true;
    };
  }, [orderType, tablesSupported, toast]);

  const refreshOrders = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [r, p, d] = await Promise.all([
        api.get<OnlineOrder[]>("/orders/new-online"),
        api.get<OnlineOrder[]>("/orders/ready-pickup"),
        api.get<OnlineOrder[]>("/orders/delivery-handover"),
      ]);
      const first = firstPoll.current;
      firstPoll.current = false;
      const nextReview = r ?? [];
      const nextDelivery = (d ?? []).filter((o) => isPaid(o.paymentStatus));

      // open the panels when new orders arrive (not on the very first load)
      if (!first && nextReview.length > prevReviewCount.current)
        setNotifOpen(true);
      if (!first && nextDelivery.length > prevDeliveryCount.current)
        setDeliveryOpen(true);
      prevReviewCount.current = nextReview.length;
      prevDeliveryCount.current = nextDelivery.length;

      setReview(nextReview);
      setReady((p ?? []).filter((o) => isPaid(o.paymentStatus)));
      setDelivery(nextDelivery);
    } catch (e) {
      console.warn("Order notification refresh failed:", e);
    }
  }, []);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);
  useEventInvalidation({
    topics: ["orders.changed", "payments.changed"],
    onInvalidate: refreshOrders,
  });

  const loadShift = useCallback(async () => {
    setShiftLoading(true);
    try {
      const d = await api.get<ShiftOrder[]>("/orders/shift");
      setShiftOrders(Array.isArray(d) ? d : []);
    } catch {
      toast("error", "Could not load shift orders.");
      setShiftOrders([]);
    } finally {
      setShiftLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (showHistory) void loadShift();
  }, [showHistory, loadShift]);

  /* ── online-order actions ── */
  const patchOrder = (id: number, body: Record<string, unknown>) =>
    api.patch(`/orders/${id}`, { cashierId, ...body });

  const settle = async (
    id: number,
    action: Settle,
    label: string,
    onDone: (status: string) => void,
  ) => {
    if (!canManagePersistedSettlements) return;
    const status = action === "refund" ? "Refunded" : "Cancelled";
    setSettlingId(id);
    try {
      await patchOrder(id, { status });
      onDone(status);
      toast("info", `${label} ${action === "refund" ? "refunded" : "voided"}.`);
    } catch {
      toast("error", `Failed to ${action} order. Please try again.`);
    } finally {
      setSettlingId(null);
    }
  };

  const cancelOrder = review.find((o) => o.id === cancelId);
  const cancelAction = cancelOrder
    ? getSettlementAction(cancelOrder.trackingStatus, cancelOrder.paymentStatus)
    : null;

  const confirmCancel = async () => {
    if (!cancelOrder || !cancelAction) return setCancelId(null);
    await settle(cancelOrder.id, cancelAction, "Order", () =>
      setReview((p) => p.filter((o) => o.id !== cancelOrder.id)),
    );
    setCancelId(null);
  };

  const settleShiftOrder = (o: ShiftOrder) => {
    if (!canManagePersistedSettlements) return;
    const action = getSettlementAction(o.status, o.paymentStatus);
    if (!action)
      return toast(
        "warning",
        "Completed, refunded, or cancelled orders cannot be changed.",
      );
    return settle(o.id, action, `Order ${o.orderNumber}`, (status) =>
      setShiftOrders((p) =>
        p.map((e) => (e.id === o.id ? { ...e, status } : e)),
      ),
    );
  };

  const confirmProceed = async () => {
    const o = proceedOrder;
    if (!o) return;
    setProceeding(true);
    try {
      await patchOrder(o.id, { status: "Queued", paymentStatus: "Paid" });
      setReview((p) => p.filter((x) => x.id !== o.id));
      setProceedOrder(null);
      toast(
        "success",
        `Order ${o.orderNumber} confirmed and moved to cook queue.`,
      );
    } catch {
      toast("error", "Failed to confirm order. Please try again.");
    } finally {
      setProceeding(false);
    }
  };

  const confirmPickup = async (id: number) => {
    try {
      await patchOrder(id, { status: "Completed" });
      setReady((p) => p.filter((o) => o.id !== id));
      toast("success", "Customer pickup confirmed successfully.");
    } catch {
      toast("error", "Failed to confirm customer pickup. Please try again.");
    }
  };

  const confirmHandover = async () => {
    const o = handoverOrder,
      name = rider.trim();
    if (!o || !name) return;
    const handoverTimestamp = new Date().toISOString();
    setSavingHandover(true);
    try {
      await patchOrder(o.id, {
        status: "Completed",
        handoverTimestamp,
        riderName: name,
      });
      setDelivery((p) => p.filter((x) => x.id !== o.id));
      setHanded((p) => [
        {
          ...o,
          trackingStatus: "Completed",
          handoverTimestamp,
          riderName: name,
        },
        ...p.filter((x) => x.id !== o.id),
      ]);
      setHandoverOrder(null);
      setRider("");
      toast("success", `Order handed to rider ${name}.`);
    } catch (e) {
      toast(
        "error",
        e instanceof Error ? e.message : "Failed to record rider handover.",
      );
    } finally {
      setSavingHandover(false);
    }
  };

  const reprint = async (o: ShiftOrder) => {
    try {
      const dto = await api.get<ReceiptDto>(`/orders/${o.id}/receipt`);
      printHtml(buildReceiptHtml(dto, { cashier: cashierName }));
    } catch {
      toast("error", "Unable to load this receipt. Please try again.");
    }
  };

  /* ── cart ── */
  const categories = useMemo(
    () => ["ALL", ...[...new Set(products.map((p) => p.category))].sort()],
    [products],
  );
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "ALL" || p.category === category) &&
          p.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, category, search],
  );
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const gross = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = discountTypes.find((d) => d.name === customerType);
  const discountRate = Number(discount?.percentage || 0);
  const pricing = useMemo(
    () => computePricing(gross, billing, discountRate),
    [gross, billing, discountRate],
  );

  // A discount approval is tied to the items and quantities it was issued for.
  // Editing a note must not cancel it, so only items/quantities are watched.
  const cartSignature = cart.map((i) => `${i.id}:${i.quantity}`).join(",");
  useEffect(() => {
    setDiscountApproval(null);
  }, [cartSignature]);

  const addToCart = useCallback((item: MenuItem) => {
    const max = getEffectiveMaxQuantity(item.remainingStock);
    if (isUnavailable(item.availabilityStatus) || max === 0) return;
    setCart((prev) => {
      const ex = prev.find((c) => c.id === item.id);
      if (!ex) return [...prev, { ...item, quantity: 1 }];
      return ex.quantity >= max
        ? prev
        : prev.map((c) =>
            c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
          );
    });
  }, []);

  const removeFromCart = useCallback(
    (id: number) => setCart((p) => p.filter((c) => c.id !== id)),
    [],
  );
  const setItemNote = useCallback(
    (id: number, note: string) =>
      setCart((p) => p.map((c) => (c.id === id ? { ...c, note } : c))),
    [],
  );
  const updateQty = useCallback(
    (id: number, delta: number) => {
      setCart((prev) =>
        prev.flatMap((item) => {
          if (item.id !== id) return [item];
          const max = getEffectiveMaxQuantity(
            products.find((p) => p.id === id)?.remainingStock ??
              item.remainingStock,
          );
          const quantity = Math.min(Math.max(0, item.quantity + delta), max);
          return quantity > 0 ? [{ ...item, quantity }] : [];
        }),
      );
    },
    [products],
  );

  // Puts the whole order form back to its starting state (used by Void and New order).
  const clearOrderForm = () => {
    setCart([]);
    setOrderType("dine-in");
    setPaymentMethod("cash");
    setCustomerType(
      discountTypes.find((item) => Number(item.percentage || 0) <= 0)?.name ??
        discountTypes[0]?.name ??
        "",
    );
    setSelectedTable(null);
    setOrderNote("");
    setShowNote(false);
    setShowDiscounts(false);
    setPendingDiscount(null);
    setDiscountApproval(null);
    setDiscountAuthError("");
  };

  const voidCurrentOrder = () => {
    clearOrderForm();
    setShowAmount(false);
    setShowVoidConfirm(false);
    toast("info", "Current order voided.");
  };

  const resetOrder = () => {
    setDone(null);
    clearOrderForm();
  };

  const selectDiscount = (nextDiscount: DiscountType) => {
    setShowDiscounts(false);
    setDiscountApproval(null);
    setDiscountAuthError("");
    if (Number(nextDiscount.percentage || 0) <= 0) {
      setCustomerType(nextDiscount.name);
      setPendingDiscount(null);
      return;
    }

    const defaultDiscount = discountTypes.find(
      (item) => Number(item.percentage || 0) <= 0,
    );
    setCustomerType(defaultDiscount?.name ?? "");
    setPendingDiscount(nextDiscount);
  };

  const authorizeDiscount = async (authorizationCode: string) => {
    if (!pendingDiscount) return;
    setAuthorizingDiscount(true);
    setDiscountAuthError("");
    try {
      const response = await api.post<{
        approvalToken: string;
        discount: DiscountType;
      }>("/orders/discount-authorization", {
        discount_id: pendingDiscount.discount_id,
        authorization_code: authorizationCode,
        items: cart.map((item) => ({
          product_id: item.id,
          qty: item.quantity,
        })),
      });
      const approvedDiscount = response.discount;
      setDiscountTypes((current) =>
        current.map((item) =>
          item.discount_id === approvedDiscount.discount_id
            ? approvedDiscount
            : item,
        ),
      );
      setCustomerType(approvedDiscount.name);
      setDiscountApproval({
        token: response.approvalToken,
        discountId: approvedDiscount.discount_id,
      });
      setPendingDiscount(null);
      toast("success", `${approvedDiscount.name} discount authorized.`);
    } catch (error) {
      setDiscountAuthError(
        error instanceof Error
          ? error.message
          : "Discount authorization failed",
      );
    } finally {
      setAuthorizingDiscount(false);
    }
  };

  const openPayment = () => {
    if (
      discount &&
      discountRate > 0 &&
      discountApproval?.discountId !== discount.discount_id
    ) {
      setPendingDiscount(discount);
      setDiscountAuthError("");
      return;
    }
    setShowAmount(true);
  };

  /* ── place order ── */
  const placeOrder = async ({
    tendered,
    file,
  }: {
    tendered: number;
    file?: File;
  }) => {
    if (placingRef.current) return;
    if (!isOnline) return toast("error", "No connection. Cannot place order.");
    placingRef.current = true;
    setShowAmount(false);
    setPlacing(true);
    const { discountAmount, taxAmount, amountDue } = pricing;
    const change = Math.max(0, tendered - amountDue);
    const isCash = paymentMethod === "cash";
    const table =
      orderType === "dine-in"
        ? tables.find((t) => t.id === selectedTable)
        : undefined;

    try {
      let proofImageUrl: string | undefined;
      if (!isCash) {
        if (!file)
          throw new Error("Please upload the onsite e-payment proof first.");
        const form = new FormData();
        form.append(
          "proof",
          file,
          file.name || `payment-proof-${Date.now()}.jpg`,
        );
        try {
          proofImageUrl = (
            await api.post<{ fileUrl: string }>("/upload-proof", form)
          ).fileUrl;
        } catch {
          throw new Error(
            "Failed to upload the payment proof. Please try again.",
          );
        }
      }

      const res = await api.post<{
        orderId?: number;
        orderNumber?: string;
        transactionId?: string;
        receipt: ReceiptDto;
      }>("/orders", {
        items: cart.map((i) => ({
          product_id: i.id,
          qty: i.quantity,
          subtotal: i.price * i.quantity,
          name: i.name,
          price: i.price,
          ...(i.note && { note: i.note }),
        })),
        total: amountDue,
        order_type: orderType,
        payment_method: paymentMethod,
        ...(!isCash && {
          payment_status: "Paid",
          proof_image_url: proofImageUrl,
        }),
        customer_type: customerType,
        discount_name: customerType,
        discount_rate: discountRate,
        discount_id: discount?.discount_id ?? null,
        ...(discountApproval && {
          discount_authorization: discountApproval.token,
        }),
        discount_amount: discountAmount,
        vat_amount: taxAmount,
        vat_exempt_amount: 0,
        table_id: table?.id ?? null,
        ...(table && { table_number: table.number }),
        ...(isCash && { cash_tendered: tendered, change_amount: change }),
        ...(orderNote.trim() && { order_note: orderNote.trim() }),
      });

      setDone(res.receipt);
      if (table)
        setTables((p) =>
          p.map((t) => (t.id === table.id ? { ...t, status: "occupied" } : t)),
        );
      void loadProducts();
    } catch (e) {
      console.error("Order failed:", e);
      toast(
        "error",
        e instanceof Error
          ? e.message
          : "Failed to submit order. Please try again.",
      );
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const onlineCount = review.length + ready.length;
  const pendingDelivery = delivery.filter(
    (o) =>
      !o.handoverTimestamp &&
      !["handed to rider", "out for delivery"].includes(norm(o.trackingStatus)),
  );
  const deliveryCount = pendingDelivery.length + handed.length;
  const payBtnLabel = placing
    ? "Processing…"
    : !isOnline
      ? "Offline — cannot place order"
      : `Pay ${fmt.money(pricing.amountDue)}`;

  return (
    <Ctx.Provider value={fmt}>
      <Sidebar />
      {!isOnline && (
        <div className="fixed left-1/2 top-3 z-[99999] flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          <WifiOff className="h-4 w-4 shrink-0" />
          No connection — orders cannot be placed
        </div>
      )}

      <div
        className={`flex bg-white text-neutral-900 ${compact ? "min-h-screen flex-col pt-[72px]" : "h-screen overflow-hidden pl-20"}`}
        style={{ fontFamily: "'Poppins', sans-serif" }}
      >
        {/* ── Menu ── */}
        <section
          className={`flex min-w-0 flex-1 flex-col ${compact ? "" : "overflow-hidden"}`}
        >
          <div className="shrink-0 px-4 pt-6 sm:px-8 sm:pt-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold">Menu</h1>
              <UserIdentityBanner className="order-3 w-full sm:order-2 sm:w-auto" />
              <div className="flex flex-wrap items-center gap-2">
                <Pill onClick={() => setShowHistory(true)}>
                  <History className="h-4 w-4" />
                  History
                </Pill>
                <Pill
                  tone={onlineCount ? "green" : "idle"}
                  pulse={!!onlineCount}
                  count={onlineCount}
                  open={notifOpen}
                  onClick={() => setNotifOpen((p) => !p)}
                >
                  Online Orders
                </Pill>
                <Pill
                  tone={deliveryCount ? "dark" : "idle"}
                  pulse={!!deliveryCount}
                  count={deliveryCount}
                  open={deliveryOpen}
                  onClick={() => setDeliveryOpen((p) => !p)}
                >
                  Delivery Handover
                </Pill>
              </div>
            </div>

            <Collapse open={notifOpen}>
              <div className="rounded-2xl border border-green-200 bg-green-50/40">
                {!onlineCount && (
                  <Empty>
                    No online pickup orders waiting for cashier action
                  </Empty>
                )}
                {review.length > 0 && (
                  <PanelTitle>Awaiting cashier review</PanelTitle>
                )}
                {review.map((o) => {
                  const action = getSettlementAction(
                    o.trackingStatus,
                    o.paymentStatus,
                  );
                  return (
                    <OrderRow
                      key={o.id}
                      o={o}
                      showPay
                      actions={
                        <>
                          {canManagePersistedSettlements && action && (
                            <button
                              className={ACT.red}
                              disabled={settlingId === o.id}
                              onClick={() => setCancelId(o.id)}
                            >
                              {settlingId === o.id && <Spinner size={12} />}
                              {action === "refund"
                                ? "Refund order"
                                : "Void order"}
                            </button>
                          )}
                          <button
                            className={ACT.green}
                            onClick={() => setProceedOrder(o)}
                          >
                            Proceed to order
                          </button>
                        </>
                      }
                    />
                  );
                })}
                {ready.length > 0 && <PanelTitle>Ready for pickup</PanelTitle>}
                {ready.map((o) => (
                  <OrderRow
                    key={`r${o.id}`}
                    o={o}
                    showPay
                    actions={
                      <button
                        className={ACT.dark}
                        onClick={() => void confirmPickup(o.id)}
                      >
                        Confirm pickup
                      </button>
                    }
                  />
                ))}
              </div>
            </Collapse>

            <Collapse open={deliveryOpen}>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60">
                {!deliveryCount && (
                  <Empty>No delivery orders waiting for rider handover</Empty>
                )}
                {pendingDelivery.length > 0 && (
                  <PanelTitle>Ready for rider handover</PanelTitle>
                )}
                {pendingDelivery.map((o) => (
                  <OrderRow
                    key={`d${o.id}`}
                    o={o}
                    actions={
                      <button
                        className={ACT.dark}
                        onClick={() => {
                          setHandoverOrder(o);
                          setRider(o.riderName ?? "");
                        }}
                      >
                        Handed to rider
                      </button>
                    }
                  />
                ))}
                {handed.length > 0 && <PanelTitle>Handed to rider</PanelTitle>}
                {handed.map((o) => (
                  <div
                    key={`h${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200/70 p-4 first:border-t-0"
                  >
                    <div>
                      <p className="font-bold">{o.orderNumber}</p>
                      {o.riderName && (
                        <p className="text-sm text-neutral-500">
                          Rider: {o.riderName}
                        </p>
                      )}
                    </div>
                    <span className="text-sm text-neutral-400">
                      {o.handoverTimestamp && fmt.dateTime(o.handoverTimestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </Collapse>

            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-neutral-900"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-4 [scrollbar-width:none]">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-5 py-2 text-sm font-medium capitalize transition ${category === c ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400"}`}
                >
                  {c === "ALL" ? "All items" : c.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-8">
            {loadingProducts && !products.length ? (
              <div className="flex h-52 items-center justify-center">
                <Spinner size={24} />
              </div>
            ) : productsError ? (
              <Empty>
                <p className="text-red-400">{productsError}</p>
                <button
                  onClick={() => void loadProducts()}
                  className="mt-1 flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-600"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry
                </button>
              </Empty>
            ) : !filtered.length ? (
              <Empty
                icon={<UtensilsCrossed className="h-8 w-8 text-neutral-300" />}
              >
                No items found
              </Empty>
            ) : (
              <motion.div
                layout
                className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4"
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
        </section>

        {/* ── Cart ── */}
        <aside
          className={`flex shrink-0 flex-col bg-white ${compact ? "w-full border-t" : "w-[400px] border-l"} border-neutral-100`}
        >
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-5 sm:px-6 sm:py-6">
            
           <div>
    <h2 className="text-lg font-semibold">Current order</h2>
              <p className="text-sm text-neutral-400">
                {totalQty
                  ? `${totalQty} item${totalQty > 1 ? "s" : ""}`
                  : "No items yet"}
              </p>
            </div>
            {cart.length > 0 && (
             <button
                  onClick={() => setShowVoidConfirm(true)}
                  title="Void current order"
                  style={{ marginRight: compact ? 0 : 80 }}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700"
>
                <Ban className="h-4 w-4" />
                Void
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            {cart.length === 0 ? (
              <Empty
                icon={<UtensilsCrossed className="h-8 w-8 text-neutral-300" />}
              >
                Add items to start
              </Empty>
            ) : (
              <AnimatePresence>
                {cart.map((item) => (
                  <CartRow
                    key={item.id}
                    item={item}
                    onRemove={removeFromCart}
                    onQty={updateQty}
                    onNote={setItemNote}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {cart.length > 0 && (
            <div className="shrink-0 border-t border-neutral-100 p-4 sm:p-6">
              <div className="mb-4 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50 text-sm">
                {[
                  ["Subtotal", fmt.money(gross), "text-neutral-500"],
                  [
                    `Discount (${pct(discountRate)}%)`,
                    `-${fmt.money(pricing.discountAmount)}`,
                    "text-green-600",
                  ],
                  [
                    `Tax (${pct(billing.taxRate)}%)`,
                    fmt.money(pricing.taxAmount),
                    "text-neutral-500",
                  ],
                  [
                    `Service charge (${pct(billing.serviceCharge)}%)`,
                    fmt.money(pricing.serviceChargeAmount),
                    "text-neutral-500",
                  ],
                ].map(([l, v, c]) => (
                  <p
                    key={l}
                    className="flex justify-between gap-3 border-b border-dashed border-neutral-200 px-4 py-2.5"
                  >
                    <span className="text-neutral-400">{l}</span>
                    <span className={`font-medium ${c}`}>{v}</span>
                  </p>
                ))}
                <p className="flex items-center justify-between bg-neutral-100 px-4 py-3.5">
                  <span className="font-medium text-neutral-600">Total</span>
                  <span className="text-2xl font-semibold">
                    {fmt.money(pricing.amountDue)}
                  </span>
                </p>
              </div>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <Select
                  value={orderType}
                  onChange={(v) => setOrderType(v as OrderTypeVal)}
                  options={[
                    { value: "dine-in", label: "Dine in" },
                    { value: "take-out", label: "Take out" },
                    { value: "delivery", label: "Delivery" },
                  ]}
                />
                <Select
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "gcash_onsite", label: "E-Payment" },
                  ]}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowDiscounts(true)}
                className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-700 transition hover:border-neutral-400"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <Percent className="h-4 w-4 text-green-600" />
                  Discount
                </span>
                <span className="truncate text-neutral-500">
                  {discount
                    ? `${discount.name} (${pct(discountRate)}%)`
                    : "Select"}
                </span>
              </button>
              {orderType === "dine-in" && tables.length > 0 && (
                <div className="mb-2">
                  <Select
                    value={selectedTable === null ? "" : String(selectedTable)}
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

              <button
                onClick={() => setShowNote((p) => !p)}
                className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${showNote || orderNote ? "border-blue-200 bg-blue-50 text-blue-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}
              >
                <MessageSquare className="h-4 w-4" />
                {orderNote ? "Edit order note" : "Add order note"}
              </button>
              <Collapse open={showNote}>
                <textarea
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  maxLength={240}
                  rows={2}
                  placeholder="e.g. no spicy, birthday order…"
                  className="w-full resize-none rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 outline-none"
                />
              </Collapse>

              <button
                className={`${isOnline ? B.green : B.dark} flex items-center justify-center gap-2 py-4 text-base`}
                disabled={placing || !isOnline || !customerType}
                onClick={openPayment}
              >
                {placing && <Spinner size={16} light />}
                {payBtnLabel}
              </button>
              <p className="mt-2 text-center text-xs text-neutral-400">
                Inventory is deducted after payment confirmation.
              </p>
            </div>
          )}
        </aside>
      </div>

      <ConfirmModal
        show={showVoidConfirm}
        title="Void current order?"
        message="This clears the current unsaved transaction. No order will be created and inventory will not be changed."
        confirmLabel="Yes, void current order"
        busy={false}
        onConfirm={voidCurrentOrder}
        onCancel={() => setShowVoidConfirm(false)}
      />
      <ConfirmModal
        show={!!cancelOrder}
        title={cancelAction === "refund" ? "Refund order?" : "Void order?"}
        message={
          cancelAction === "refund"
            ? "This will mark the order as refunded and restore deducted inventory once."
            : "This will permanently void the online order. The customer will need to be notified separately."
        }
        confirmLabel={
          cancelAction === "refund" ? "Yes, refund order" : "Yes, void order"
        }
        busy={settlingId !== null}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelId(null)}
      />
      <ProceedModal
        order={proceedOrder}
        busy={proceeding}
        onConfirm={() => void confirmProceed()}
        onCancel={() => setProceedOrder(null)}
      />
      <DiscountModal
        show={showDiscounts}
        discounts={discountTypes}
        selectedName={customerType}
        onSelect={selectDiscount}
        onClose={() => setShowDiscounts(false)}
      />
      <DiscountAuthorizationModal
        show={!!pendingDiscount}
        discount={pendingDiscount}
        busy={authorizingDiscount}
        error={discountAuthError}
        onConfirm={(code) => void authorizeDiscount(code)}
        onCancel={() => {
          setPendingDiscount(null);
          setDiscountAuthError("");
        }}
      />
      <AmountModal
        show={showAmount}
        amountDue={pricing.amountDue}
        method={paymentMethod}
        onConfirm={(p) => void placeOrder(p)}
        onCancel={() => setShowAmount(false)}
      />
      <HandoverModal
        order={handoverOrder}
        rider={rider}
        setRider={setRider}
        saving={savingHandover}
        onConfirm={() => void confirmHandover()}
        onCancel={() => {
          if (!savingHandover) {
            setHandoverOrder(null);
            setRider("");
          }
        }}
      />
      <SuccessModal receipt={done} cashier={cashierName} onClose={resetOrder} />
      <HistoryModal
        show={showHistory}
        orders={shiftOrders}
        loading={shiftLoading}
        settlingId={settlingId}
        canSettle={canManagePersistedSettlements}
        onClose={() => setShowHistory(false)}
        onSettle={(o) => void settleShiftOrder(o)}
        onReprint={(o) => void reprint(o)}
      />

      <div className="pointer-events-none fixed bottom-4 right-4 z-[999999] flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        <AnimatePresence>
          {toasts.map((t) => {
            const { c, I } = TOAST[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${c}`}
              >
                <I className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="flex-1 text-sm font-medium text-neutral-900">
                  {t.message}
                </p>
                <button onClick={() => dismiss(t.id)}>
                  <X className="h-4 w-4 text-neutral-400" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}