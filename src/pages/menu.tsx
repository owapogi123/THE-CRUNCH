import { cartFitsInventory } from "../lib/orderQuantity";
import { capitalizeFirstLetter } from "@/lib/utils";
import { IncludedSelectionModal, IncludedChoices, hasIncludedChoices, includedKey, type IncludedChoice, type IncludedConfig } from "@/components/included-menu-selections";
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
  Volume2,
  VolumeX,
  MessageSquare,
  Percent,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ProductImage } from "@/components/ProductImage";
import { api, resolveAssetUrl } from "../lib/api";
import {
  fetchGeneralSettings,
  GENERAL_SETTINGS_DEFAULTS,
  type GeneralRestaurantSettings,
  getCurrencySymbol,
  formatCurrencyAmount,
  formatInSettingsTimezone,
} from "../lib/restaurantSettings";
import { Sidebar } from "@/components/Sidebar";
import { useViewport } from "@/hooks/use-tablet";
import { useAuth } from "../context/authcontext";
import {
  canCancelPersistedOrders,
  canRefundPersistedOrders,
  normalizeRole,
} from "../lib/permissions";
import {
  clampOrderItemQuantity,
  getEffectiveMaxQuantity,
} from "../lib/orderQuantity";
import { useOnlineOrderAlerts } from "@/hooks/use-online-order-alerts";
import { deliveryWaitingState, isAwaitingDeliveryFee, prioritizeDeliveryRequests } from "@/lib/cashier-order-alerts";
import { useEventInvalidation } from "@/hooks/use-event-invalidation";
import {
  getSettlementAction as getRefundSettlementAction,
  type RefundOrderLike,
} from "@/lib/refundEligibility";
import { isFinalizedSale } from "@/lib/financialStatus";
import {
  EMPTY_PAYMENT_QR,
  fetchPaymentQrConfiguration,
  fetchPaymentQrObjectUrl,
} from "@/lib/paymentQr";
import {
  buildKotHtml,
  buildReceiptHtml,
  downloadHtml,
  printHtml,
  type ReceiptDto,
} from "../lib/receipt";
import {
  Skeleton,
  SkeletonProductCard,
  SkeletonSectionCard,
  SkeletonKPICard,
  SkeletonListItem,
} from "@/components/ui/skeleton";
import {
  Select as RadixSelect,
  SelectContent as RadixSelectContent,
  SelectItem as RadixSelectItem,
  SelectTrigger as RadixSelectTrigger,
  SelectValue as RadixSelectValue,
} from "@/components/ui/select";
import "./cashier-pos.css";

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

type PaymentMethod = "cash" | "gcash_onsite" | "grabfood" | "foodpanda";
const MAX_CASH_TENDERED = 100_000;
type OrderTypeVal = "dine-in" | "take-out" | "delivery";
type ToastType = "success" | "error" | "info" | "warning";
type Settle = "refund" | "cancel";
interface RefundTarget {
  orderId: number;
  orderNumber: string;
  total: number;
  source: "shift" | "online";
}

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
  includedCategoryKey?: string | null;
  includedKind?: 'drinks' | 'sauces' | null;
  customizations?: IncludedConfig;
  ingredients: { product_id: number; quantity_required: number; stock: number }[];
  requiresSauce: boolean;
  id: number;
  name: string;
  price: number;
  category: string;
  categorySystemKey?: string | null;
  remainingStock: number;
  availabilityStatus: string;
  image?: string | null;
}
interface CartItem extends MenuItem {
  includedSelections?: IncludedChoice[];
  cartKey: string;
  quantity: number;
  note?: string;
  selectedFlavorProductId?: number;
  selectedFlavorName?: string;
  selectedFlavorRemainingStock?: number;
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
  paymentReference?: string | null;
  paymentStatus?: string | null;
  prepStartedAt?: string | number | null;
  startedAt?: string | number | null;
  readyAt?: string | number | null;
  items: {
    name: string;
    quantity: number;
    price?: number;
    selectedFlavorName?: string | null;
    includedSelections?: IncludedChoice[];
  }[];
  delivery?: {processedAt?: string | null; confirmationDeadline?: string | null; confirmationRemainingMs?: number | null; confirmationOverdue?: boolean; preferredCourier?: string; courierService?: string; riderContact?: string; bookingReference?: string; trackingUrl?: string; deliveredAt?: string; recipientName: string; recipientPhone: string; address: string; instructions?: string; fee: number | null; revision: number; locked: boolean; subtotal: number; discount: number;};
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
  prepStartedAt?: string | number | null;
  startedAt?: string | number | null;
  readyAt?: string | number | null;
  refundRequestId?: number | null;
  refundRequestStatus?: "Pending" | "Ignored" | "Actioned" | null;
  items: {
    name: string;
    quantity: number;
    price: number;
    selectedFlavorName?: string | null;
    includedSelections?: IncludedChoice[];
  }[];
}

/* ───────────────────────── helpers ───────────────────────── */

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const isPaid = (v?: string | null) => norm(v) === "paid";
const isPickupContinuation = (order: OnlineOrder) => !order.delivery && norm(order.orderType) === "take-out" &&
  norm(order.paymentMethod) === "cash on pickup" && ["pending", "pending payment"].includes(norm(order.paymentStatus)) &&
  norm(order.trackingStatus) === "awaiting cashier review";

const isUnavailable = (v: unknown) =>
  ["unavailable", "out of stock", "hidden", "not configured"].includes(norm(v));
const pct = (n: number) => String(Number(n.toFixed(2)));

const getSettlementAction = (
  status?: string | null,
  payment?: string | null,
  preparation: RefundOrderLike = {},
): Settle | null => {
  return getRefundSettlementAction({
    ...preparation,
    status,
    paymentStatus: payment,
  });
};

const paymentLabel = (m?: string | null) => {
  const n = norm(m);
  if (!n) return "—";
  if (n === "cash") return "Cash";
  if (n === "gcash") return "GCash";
  if (["cash on pickup", "cash_on_pickup"].includes(n)) return "Cash on Pickup";
  if (["gcash_onsite", "e-payment", "onsite e-payment"].includes(n))
    return "E-Payment";
  if (n === "grabfood") return "GrabFood";
  if (n === "foodpanda") return "foodpanda";
  if (n === "other") return "Other platform";
  return m ?? "—";
};

const MAX_PLATFORM_REFERENCE_LENGTH = 255;
const PLATFORM_REFERENCE_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

function getPlatformReferenceError(
  provider: PaymentMethod,
  value: string,
): string | null {
  const reference = value.trim();
  if (!reference) {
    return provider === "foodpanda"
      ? "Enter the complete Foodpanda order reference."
      : "Enter the complete platform order reference.";
  }
  if (provider === "grabfood" && /^GF-$/i.test(reference)) {
    return "Complete the GrabFood reference after GF-.";
  }
  if (
    reference.length > MAX_PLATFORM_REFERENCE_LENGTH ||
    !PLATFORM_REFERENCE_PATTERN.test(reference)
  ) {
    return "Enter the complete reference using letters, numbers, and hyphens only.";
  }
  return null;
}

const computePricing = (subtotal: number, b: Billing, discountRate: number) => {
  const discountAmount = subtotal * (Math.max(0, discountRate) / 100);
  const discountedSubtotal = subtotal - discountAmount;
  const taxAmount = Math.round((discountedSubtotal - discountedSubtotal / (1 + b.taxRate / 100) + Number.EPSILON) * 100) / 100;
  const serviceChargeAmount = 0;
  return {
    subtotal,
    discountAmount,
    taxAmount,
    serviceChargeAmount,
    amountDue: discountedSubtotal,
  };
};

const mapProducts = (data: Record<string, any>[]): MenuItem[] => {
  const latest = new Map<string, Record<string, any>>();
  for (const p of data) {
    if (norm(p.item_type ?? "menu_item") !== "menu_item") continue;
    if (norm(p.availability_status) === "hidden") continue;
    const key = norm(p.product_name ?? p.name);
    const prev = latest.get(key);
    if (
      !prev ||
      Number(p.product_id ?? p.id) > Number(prev.product_id ?? prev.id)
    )
      latest.set(key, p);
  }
  return [...latest.values()].map((p) => {
    const rawImage = String(p.image ?? "").trim();
    const resolvedImg = rawImage ? resolveAssetUrl(rawImage) : null;
    // Debug: log actual API image values for duplicate investigation
    if (import.meta.env.DEV && rawImage) {
      console.log("[menu:mapProducts]", {
        id: p.product_id ?? p.id,
        name: p.product_name ?? p.name,
        rawImage,
        resolvedImg,
      });
    }
    return {
      id: Number(p.product_id ?? p.id),
      name: String(p.product_name ?? p.name ?? `Product #${p.id}`),
      price: Number(p.price ?? 0),
      category: String(p.category ?? "UNCATEGORIZED").toUpperCase(),
      categorySystemKey: p.category_system_key
        ? String(p.category_system_key).trim().toLowerCase()
        : null,
      requiresSauce: false,
      customizations: p.customizations,
      includedKind: p.included_selection_kind,
      includedCategoryKey: p.included_category_key,
      ingredients: (p.ingredients ?? []).map((ingredient: Record<string, unknown>) => ({
        product_id: Number(ingredient.product_id),
        quantity_required: Number(ingredient.quantity_required),
        stock: Number(ingredient.stock),
      })),
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
      image: resolvedImg,
    };
  });
};

/* ───────────────────────── shared UI ───────────────────────── */

const Ctx = createContext<{
  s: GeneralRestaurantSettings;
  money: (n: number) => string;
  time: (v: string) => string;
  dateTime: (v: string) => string;
}>(null!);
const useFmt = () => useContext(Ctx);

/* Button map — Menu Management choreography (lift / gloss sweep / press)
   lives in cashier-pos.css; these classes select the tone. */
const btn = "pos-btn w-full";
const B = {
  dark: `${btn} pos-btn--primary`,
  green: `${btn} pos-btn--success`,
  blue: `${btn} pos-btn--info`,
  red: `${btn} pos-btn--danger`,
  ghost: `${btn} pos-btn--ghost`,
  slate: `${btn} pos-btn--muted`,
};
const act = "pos-act";
const ACT = {
  green: `${act} pos-act--green`,
  dark: `${act} pos-act--dark`,
  red: `${act} pos-act--red`,
};
const eyebrow = "pos-eyebrow";

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
            className={`pos-modal max-h-[92vh] w-full ${max} overflow-y-auto`}
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
  <div className="pos-modal-head">
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>
        {e}
      </p>
      <p className="text-xl font-bold text-neutral-900">{title}</p>
    </div>
    {onClose && (
      <button onClick={onClose} className="pos-close" aria-label="Close">
        <X className="h-5 w-5" />
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
  idle: "pos-pill--idle",
  green: "pos-pill--green",
  dark: "pos-pill--dark",
  amber: "pos-pill--amber",
  red: "pos-pill--red",
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
      className={`pos-pill ${TONE[tone]}`}
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
    className={`pos-chip rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${className}`}
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
    <Chip className="border border-amber-200 bg-amber-100 text-orange-700 dark:text-orange-300">
      {!status || norm(status) === "pending payment" ? "Unpaid" : status}
    </Chip>
  );

/* Radix select styled like Menu Management's .menu-dropdown — the native
   popup is OS-drawn and cannot be themed, so this replaces it everywhere. */
const Select = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => (
  // Radix reserves an empty value. Encode every option so "" never collides.
  <RadixSelect value={`v:${value}`} onValueChange={(next) => onChange(next.slice(2))}>
    <RadixSelectTrigger
      aria-label={options.find((o) => o.value === value)?.label ?? "Select option"}
      className="pos-select-trigger focus-visible:ring-0"
    >
      <RadixSelectValue />
    </RadixSelectTrigger>
    <RadixSelectContent
      position="popper"
      align="start"
      collisionPadding={8}
      className="pos-select-list"
    >
      {options.map((o) => (
        <RadixSelectItem key={o.value} value={`v:${o.value}`}>
          {o.label}
        </RadixSelectItem>
      ))}
    </RadixSelectContent>
  </RadixSelect>
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

function DeliveryFulfillmentForm({ order, onSaved }: { order: OnlineOrder; onSaved: () => Promise<void> }) {
  const q = order.delivery!;
  const { user } = useAuth();
  const canConfirmDelivery = ['cashier', 'administrator'].includes(normalizeRole(user?.role) || '');
  const [details, setDetails] = useState({courierService: q.preferredCourier || 'Grab', riderName: order.riderName || '', riderContact: q.riderContact || '', bookingReference: q.bookingReference || ''});
  const [source, setSource] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const bookingReady = Boolean(q.processedAt && q.courierService === (q.preferredCourier || 'Grab') && order.riderName?.trim() && q.riderContact?.trim() && q.bookingReference?.trim());
  const save = async (action: string) => {
    if (submitting.current) return;
    const courierDetails = {...details, riderName: details.riderName.trim(), riderContact: details.riderContact.trim(), bookingReference: details.bookingReference.trim()};
    if (action === 'booking') {
      for (const [key, label] of [['riderName', 'Rider name'], ['riderContact', 'Rider contact'], ['bookingReference', 'Booking / transaction reference']] as const) {
        if (!courierDetails[key]) { setError(`${label} is required.`); return; }
      }
    }
    submitting.current = true; setBusy(true); setError('');
    try { await api.patch(`/orders/${order.id}/delivery-fulfillment`, {action, ...courierDetails, confirmationSource: source, confirmationReference: reference}); await onSaved(); }
    catch (e) {setError(e instanceof Error ? e.message : 'Delivery update failed');} finally {submitting.current = false; setBusy(false);}
  };
  if (norm(order.trackingStatus) === 'awaiting cashier review') return <div className="pos-delivery-form grid gap-3 text-sm">
    <p>Payment Confirmed - Waiting for Cashier</p>
    <button type="button" className={ACT.green} disabled={busy} onClick={() => void save('process')}>{busy ? 'Processing...' : 'Process Order'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
  return <div className="pos-delivery-form grid gap-3 text-sm">
    {!order.handoverTimestamp && <>
    <div className="pos-courier-fields">
    <p className="pos-courier-reference">Actual courier: {q.courierService || 'Not recorded'}</p>
    {([['riderName','Rider name'],['riderContact','Rider contact'],['bookingReference','Booking / transaction reference']] as const).map(([key,label]) => <label key={key} className={key === 'bookingReference' ? 'pos-courier-reference' : 'pos-courier-field'}>{label}<input className="pos-delivery-input" type="text" required maxLength={key === 'riderContact' ? 40 : 255} value={details[key]} onChange={e => setDetails({...details,[key]:e.target.value})} /></label>)}
    </div>
    <button className={ACT.dark} disabled={busy} onClick={() => void save('booking')}>Save courier details</button>
    {!order.handoverTimestamp && ['ready','ready for pickup'].includes(norm(order.trackingStatus)) && <button className={ACT.green} disabled={busy || !bookingReady} onClick={() => void save('pickup')}>Confirm Rider Pickup</button>}
    {!bookingReady && <p className="text-xs text-neutral-600">Save the actual courier, rider name, rider contact and booking reference before confirming pickup.</p>}
    </>}
    {order.handoverTimestamp && <p role="status" className="text-sm font-medium text-neutral-700">{q.confirmationOverdue ? 'Delivery confirmation pending - automatic completion is being processed.' : 'Out for Delivery - Waiting for Customer Confirmation'}</p>}
    {order.handoverTimestamp && canConfirmDelivery && isPaid(order.paymentStatus) && !q.deliveredAt && ['ready', 'ready for pickup'].includes(norm(order.trackingStatus)) && <details className="grid gap-3"><summary className="cursor-pointer text-xs font-semibold">Manual verification: confirm delivered</summary><p className="my-2 text-xs text-neutral-600">Use only when the customer cannot confirm through their account. Record actual confirmation and supporting details.</p>
      <label>Delivery confirmation source<select className="pos-delivery-input" value={source} onChange={e => setSource(e.target.value)}><option value="">Select actual confirmation</option><option value="customer">Customer confirmation</option><option value="courier">Courier confirmation</option><option value="verified_proof">Verified delivery proof</option></select></label>
      <label>Confirmation reference / details<input className="pos-delivery-input" maxLength={1000} value={reference} onChange={e => setReference(e.target.value)} /></label>
      <button className={ACT.green} disabled={busy || !source || !reference.trim()} onClick={() => void save('delivered')}>Confirm Delivered (Manual Verification)</button>
    </details>}{error && <p role="alert">{error}</p>}
  </div>;
}

function DeliveryQuoteForm({ order, onSaved }: { order: OnlineOrder; onSaved: () => Promise<void> }) {
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = order.delivery!;
  return <form className="pos-delivery-form grid gap-3 text-sm" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try {
    await api.patch(`/orders/${order.id}/delivery-quote`, { deliveryFee: fee }); await onSaved();
  } catch (e) { setError(e instanceof Error ? e.message : 'Quote failed'); } finally {setBusy(false);} }}>
    <p>Arrange delivery manually with {q.preferredCourier || "Grab"} before quoting. If unavailable, resolve it with the customer; do not switch providers.</p>
    {!q.locked && <><label className="grid gap-1.5 font-medium">Delivery fee<input className="pos-delivery-input" aria-label="Delivery fee" type="number" required min="0" max="1000" step="0.01" value={fee} onChange={e => setFee(e.target.value)} /></label><button className={ACT.dark} disabled={busy} type="submit">{busy ? 'Saving quote...' : 'Save delivery quote'}</button></>}
    {q.locked && <p>Accepted total locked for online payment</p>}{error && <p role="alert">{error}</p>}
  </form>;
}

function cashierDeliveryStage(order: OnlineOrder): string {
  const q = order.delivery!;
  if (q.deliveredAt && norm(order.trackingStatus) === 'completed') return 'Delivered';
  if (['cancelled', 'refunded', 'completed'].includes(norm(order.trackingStatus))) return order.trackingStatus;
  if (order.handoverTimestamp) return q.confirmationOverdue ? 'Confirmation Overdue' : 'Out for Delivery';
  if (!isPaid(order.paymentStatus)) return q.fee == null ? 'Waiting for Delivery Fee' : 'Waiting for Customer Payment';
  if (norm(order.trackingStatus) === 'awaiting cashier review') return 'Paid - Waiting for Cashier';
  if (['ready', 'ready for pickup'].includes(norm(order.trackingStatus))) return 'Ready for Rider';
  return `Sent to Kitchen - ${order.trackingStatus}`;
}

function DeliveryOrderCard({ order, onSaved, now = Date.now() }: { order: OnlineOrder; onSaved: () => Promise<void>; now?: number }) {
  const { money, time, dateTime } = useFmt();
  const [expanded, setExpanded] = useState(false);
  const q = order.delivery!;
  const waiting = deliveryWaitingState(order, now);
  const terminal = ['completed', 'cancelled', 'refunded'].includes(norm(order.trackingStatus)) || Boolean(q.deliveredAt);
  const paid = isPaid(order.paymentStatus);
  const waitingForProcessing = paid && norm(order.trackingStatus) === 'awaiting cashier review';
  useEffect(() => {
    if (terminal || !paid || !order.handoverTimestamp || q.confirmationOverdue || q.confirmationRemainingMs == null) return;
    // One deadline refresh; the database clock, not this timer, determines overdue status.
    const timeout = window.setTimeout(() => { void onSaved(); }, Math.max(0, q.confirmationRemainingMs) + 1000);
    return () => window.clearTimeout(timeout);
  }, [terminal, paid, order.handoverTimestamp, q.confirmationOverdue, q.confirmationRemainingMs, onSaved]);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const detailsId = `delivery-details-${order.id}`;
  let trackingUrl: string | undefined;
  try {
    const url = new URL(q.trackingUrl || '');
    if (url.protocol === 'https:' && !url.username && !url.password) trackingUrl = url.href;
  } catch { /* No valid saved tracking link. */ }
  return <article className="pos-delivery-card">
    <div className="pos-delivery-summary">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold">{order.orderNumber}</h3><Chip className={waiting?.tone === 'red' ? 'bg-red-100 text-red-800' : waiting?.tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>{waiting?.label || cashierDeliveryStage(order)}</Chip></div>
        {waiting && <p className={`mt-1 text-xs font-semibold ${waiting.tone === 'red' ? 'text-red-700' : waiting.tone === 'amber' ? 'text-amber-700' : 'text-neutral-600'}`} role="timer" aria-live="off" aria-label="Delivery fee request waiting time">{waiting.elapsed}</p>}
        <p className="pos-delivery-customer">{q.recipientName}</p>
        <p className="pos-delivery-meta"><span>{q.preferredCourier || 'Grab'}</span><span>{time(order.createdAt)}</span><span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span></p>
      </div>
      <div className="pos-delivery-summary-actions"><div><span className="pos-delivery-subtotal-label">Food subtotal</span><strong>{money(q.subtotal)}</strong></div>
        <button type="button" className={ACT.dark} aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? 'Hide' : 'Check'} details for order ${order.orderNumber}`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide Details' : 'Check Details'}<ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>
    </div>
    <div id={detailsId} hidden={!expanded} className="pos-delivery-details">
      <section aria-labelledby={`${detailsId}-customer`}>
        <h4 id={`${detailsId}-customer`}>Customer &amp; Delivery Information</h4>
        <dl className="pos-delivery-values">
          <div><dt>Recipient</dt><dd>{q.recipientName}</dd></div>
          <div><dt>Contact number</dt><dd>{q.recipientPhone}</dd></div>
          <div><dt>Delivery address</dt><dd className="whitespace-pre-wrap">{q.address}</dd></div>
          <div><dt>Instructions</dt><dd className="whitespace-pre-wrap">{q.instructions || 'None provided'}</dd></div>
          <div><dt>Preferred courier</dt><dd>{q.preferredCourier || 'Grab'}</dd></div>
        </dl>
      </section>
      <section aria-labelledby={`${detailsId}-items`}>
        <h4 id={`${detailsId}-items`}>Order Items</h4>
        <ul className="pos-delivery-items">{order.items.map((item, index) => <li key={index}>
          <div className="min-w-0"><p className="font-medium">{item.name}</p>
            {item.selectedFlavorName && <p className="text-xs text-neutral-600">Chicken flavor: {item.selectedFlavorName}</p>}
            <IncludedChoices choices={item.includedSelections} />
            <p className="text-xs text-neutral-600">Qty {item.quantity}{item.price != null && ` at ${money(item.price)} each`}</p>
          </div><strong className="text-sm font-semibold">{item.price == null ? 'Price unavailable' : money(item.price * item.quantity)}</strong>
        </li>)}</ul>
        <dl className="pos-delivery-values pos-delivery-money"><div><dt>Food subtotal</dt><dd>{money(q.subtotal)}</dd></div></dl>
      </section>
      <section aria-labelledby={`${detailsId}-payment`}>
        <h4 id={`${detailsId}-payment`}>Payment &amp; Delivery Fee</h4>
        <dl className="pos-delivery-values pos-delivery-money">
          <div><dt>Payment status</dt><dd><PayBadge status={order.paymentStatus} /></dd></div>
          <div><dt>Food subtotal</dt><dd>{money(q.subtotal)}</dd></div>
          {q.discount > 0 && <div><dt>Discount</dt><dd>-{money(q.discount)}</dd></div>}
          <div><dt>Delivery fee</dt><dd>{q.fee == null ? 'To be quoted' : money(q.fee)}</dd></div>
          <div className="pos-delivery-grand-total"><dt>Grand total</dt><dd>{q.fee == null ? 'Pending quote' : money(order.total)}</dd></div>
        </dl>
        {!paid && !terminal && q.fee == null && <DeliveryQuoteForm order={order} onSaved={onSaved} />}
        {!paid && !terminal && q.fee != null && <p className="mt-3 text-sm text-neutral-600">Waiting for Customer Payment. The customer can request a fresh quote if it expires.</p>}
        {!paid && !terminal && q.fee != null && !q.locked && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Revise / renew delivery quote</summary><DeliveryQuoteForm order={order} onSaved={onSaved} /></details>}
        {waitingForProcessing && !terminal && <DeliveryFulfillmentForm order={order} onSaved={onSaved} />}
      </section>
      <section aria-labelledby={`${detailsId}-rider`}>
        <h4 id={`${detailsId}-rider`}>Rider &amp; Fulfillment</h4>
        <dl className="pos-delivery-values">
          {q.deliveredAt && <div><dt>Confirmed at</dt><dd>{dateTime(q.deliveredAt)}</dd></div>}
          <div><dt>Booking reference</dt><dd>{q.bookingReference || 'Not provided'}</dd></div>
          <div><dt>Rider name</dt><dd>{order.riderName || 'Not provided'}</dd></div>
          <div><dt>Rider contact</dt><dd>{q.riderContact || 'Not provided'}</dd></div>
          {trackingUrl && <div><dt>Tracking</dt><dd><a className="underline underline-offset-2" href={trackingUrl} target="_blank" rel="noopener noreferrer">Open courier tracking</a></dd></div>}
        </dl>
        {paid && !waitingForProcessing && !terminal && <DeliveryFulfillmentForm order={order} onSaved={onSaved} />}
        {!paid && !terminal && <p className="text-xs text-neutral-600">Fulfillment becomes available after payment.</p>}
      </section>
    </div>
  </article>;
}

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
        {o.items
          .map(
            (i) =>
              `${i.quantity}× ${i.name}${i.selectedFlavorName ? ` (${i.selectedFlavorName})` : ""}`,
          )
          .join("  ·  ")}
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
    quantity,
  }: {
    item: MenuItem;
    onAdd: (i: MenuItem) => void;
    quantity: number;
  }) => {
    const { money } = useFmt();
    const out =
      isUnavailable(item.availabilityStatus) ||
      getEffectiveMaxQuantity(item.remainingStock) === 0;
    const inCart = quantity > 0;
    return (
      <motion.button
        layout
        disabled={out}
        onClick={() => onAdd(item)}
        whileHover={out ? {} : { y: -2 }}
        whileTap={out ? {} : { scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={`pos-card${inCart ? " pos-card--incart" : ""}${out ? " pos-card--out" : ""}`}
      >
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-neutral-100">
            <ProductImage
              src={item.image}
              fallbackSrc="/images/menu-placeholder.jpg"
              alt={item.name}
              className="h-full w-full object-cover"
            />
        </div>
        {out && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-red-800 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white">
            OUT OF STOCK
          </span>
        )}
        {inCart && (
          <span className="pos-card__qty">
            <span aria-hidden="true">×</span>
            <span>{quantity}</span>
          </span>
        )}
        <div className="p-3 sm:p-4 pb-8 sm:pb-10">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-neutral-800">
            {item.name}
          </p>
          <p className="mt-2 text-base font-semibold text-neutral-900">
            {money(item.price)}
            {Object.entries(item.customizations || {}).filter(([key, rule]) => key.startsWith('category:') && rule?.enabled && rule.includedQuantity > 0).map(([key, rule]) => <span key={key} className={`mt-1 block text-xs ${key === 'sauces' || rule?.sauce ? 'text-orange-700 dark:text-orange-300' : key === 'drinks' || rule?.beverage ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300'}`}>{rule?.includedQuantity} {rule?.label || (key === 'drinks' ? 'Beverage' : 'Sauce')} Included</span>)}
          </p>
        </div>
      </motion.button>
    );
  },
);

function ChickenFlavorModal({
  item,
  flavors,
  selectedFlavorId,
  onSelect,
  onConfirm,
  onCancel,
}: {
  item: MenuItem | null;
  flavors: MenuItem[];
  selectedFlavorId: number | null;
  onSelect: (id: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal show={!!item} onClose={onCancel}>
      <ModalHead
        eyebrow="Required selection"
        title="Choose Sauce"
        onClose={onCancel}
      />
      <div className="space-y-3 p-5 sm:p-6">
        <p className="text-sm text-neutral-600">
          Select exactly one sauce for <strong>{item?.name}</strong>. The meal
          price will not change.
        </p>
        {flavors.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No active sauces are configured. Ask an Administrator to add or
            restore a sauce in Menu Management.
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {flavors.map((flavor) => {
              const selected = selectedFlavorId === flavor.id;
              return (
                <button
                  type="button"
                  key={flavor.id}
                  onClick={() => onSelect(flavor.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${selected ? "border-amber-500 bg-amber-50" : "border-neutral-200 hover:border-neutral-400"}`}
                >
                  <span className="font-semibold text-neutral-800">
                    {flavor.name}
                  </span>
                  {selected && <Check className="h-5 w-5 text-amber-600" />}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button type="button" className={B.ghost} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={B.green}
            disabled={!selectedFlavorId || flavors.length === 0}
            onClick={onConfirm}
          >
            Confirm sauce
          </button>
        </div>
      </div>
    </Modal>
  );
}

const CartRow = memo(
  ({
    item,
    onRemove,
    onQty,
    onEditFlavor,
    canIncrease,
  }: {
    item: CartItem;
    onRemove: (cartKey: string) => void;
    onQty: (cartKey: string, d: number) => void;
    onEditFlavor: (item: CartItem) => void;
    canIncrease: boolean;
  }) => {
    const { money } = useFmt();
    const max = getEffectiveMaxQuantity(item.remainingStock);
    const step = "pos-step";
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
              <ProductImage
                src={item.image}
                fallbackSrc="/images/menu-placeholder.jpg"
                alt={item.name}
                className="h-full w-full object-cover"
              />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-800">
              {item.name}
            </p>
            <p className="text-xs text-neutral-400">{money(item.price)} each</p>
            <CartIncludedChoices item={item} />
              {item.selectedFlavorName && (
              <p className="mt-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
                Sauce: {item.selectedFlavorName}
              </p>
            )}
          </div>
          <span className="text-sm font-semibold text-neutral-900">
            {money(item.price * item.quantity)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button className={step} onClick={() => item.quantity === 1 ? onRemove(item.cartKey) : onQty(item.cartKey, -1)}>
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
                if (v > 0) onQty(item.cartKey, v - item.quantity);
              }}
              className="h-9 w-12 rounded-lg border border-neutral-200 text-center text-sm font-semibold outline-none focus:border-neutral-900"
            />
            <button
              className={step}
              disabled={item.quantity >= max || !canIncrease}
              onClick={() => onQty(item.cartKey, 1)}
            >
              <Plus className="h-3.5 w-3.5 text-neutral-600" />
            </button>
          </div>
          <div className="flex gap-1">
            {(hasIncludedChoices(item.customizations) || (item.requiresSauce && item.selectedFlavorProductId)) && (
              <button
                type="button"
                title="Change sauce"
                onClick={() => onEditFlavor(item)}
                className="rounded-lg px-2.5 text-xs font-semibold text-orange-700 dark:text-orange-300 hover:bg-amber-50"
              >
                Change selections
              </button>
            )}
            <button
              title="Remove"
              onClick={() => onRemove(item.cartKey)}
              className="pos-iconbtn pos-iconbtn--danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  },
);

/* ───────────────────────── modals ───────────────────────── */

function CartIncludedChoices({ item }: { item: CartItem }) {
  return <>{(item.includedSelections ?? [])
    .filter((choice) => choice.product_id !== item.selectedFlavorProductId)
    .map((choice, index) => (
      <span key={index} title={item.customizations?.[choice.kind]?.label || choice.kind}
        className="mt-1 block whitespace-normal text-xs text-neutral-500">
        {choice.name} × {choice.qty}
      </span>
    ))}</>;
}

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
          {busy && (
            <Skeleton
              width={16}
              height={16}
              variant="shimmer"
              theme="customer"
              aria-label="Processing"
            />
          )}
          {confirmLabel}
        </button>
        <button className={B.ghost} disabled={busy} onClick={onCancel}>
          Keep Order
        </button>
      </div>
    </Modal>
  );
}

function RefundAuthorizationModal({
  target,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  target: RefundTarget | null;
  busy: boolean;
  error: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const { money } = useFmt();
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Never retain a previous refund password when selecting another order.
    setPassword("");
  }, [target?.orderId]);

  return (
    <Modal show={!!target} max="max-w-sm" onClose={busy ? undefined : onCancel}>
      <ModalHead
        eyebrow="Refund authorization"
        title="Authorize refund"
        tone="text-red-600"
        onClose={busy ? undefined : onCancel}
      />
      <form
        className="space-y-4 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && password.trim()) onConfirm(password);
        }}
      >
        <p className="text-sm leading-relaxed text-neutral-600">
          Refund{" "}
          <strong className="text-neutral-900">{target?.orderNumber}</strong>
          {target ? ` (${money(target.total)})` : ""}. Enter the separate refund
          authorization password to continue.
        </p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          This records the refund in The Crunch. Cash or e-payment reimbursement
          must be handled separately; this action does not automatically send
          money back to a customer's payment account.
        </p>
        <div>
          <label
            htmlFor="refund-authorization-password"
            className={`${eyebrow} mb-1.5 block`}
          >
            Refund authorization password
          </label>
          <input
            id="refund-authorization-password"
            autoFocus
            type="password"
            autoComplete="off"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "refund-authorization-error" : undefined}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-red-500"
          />
        </div>
        {error && (
          <p
            id="refund-authorization-error"
            role="alert"
            className="text-sm font-medium text-red-600"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          className={`${B.red} flex items-center justify-center gap-2`}
          disabled={busy || !password.trim()}
        >
          {busy && (
            <Skeleton
              width={16}
              height={16}
              variant="shimmer"
              theme="customer"
              aria-label="Processing"
            />
          )}
          Confirm refund
        </button>
        <button
          type="button"
          className={B.ghost}
          disabled={busy}
          onClick={onCancel}
        >
          Keep Order
        </button>
      </form>
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
                <IncludedChoices choices={i.includedSelections} />
              {i.selectedFlavorName && (
                  <span className="block pl-7 text-xs font-semibold text-orange-700 dark:text-orange-300">
                    Sauce: {i.selectedFlavorName}
                  </span>
                )}
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
                : isPickupContinuation(order) ? "Confirm loads this order into Current Order. It remains unpaid until cash checkout; no stock or invoice is allocated when loading." : "Payment is still unpaid. Proceeding will mark it as paid and queue it. Verify with the customer first."}
            </p>
            <button
              className={`${B.green} flex items-center justify-center gap-2`}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? (
                <Skeleton
                  width={16}
                  height={16}
                  variant="shimmer"
                  theme="customer"
                  aria-label="Processing"
                />
              ) : (
                isPickupContinuation(order) ? "Confirm" : "Confirm & proceed to queue"
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
  staffName,
  setRider,
  saving,
  onConfirm,
  onCancel,
}: {
  order: OnlineOrder | null;
  rider: string;
  staffName: string;
  setRider: (v: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { money } = useFmt();
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
              <p className="flex justify-between gap-4">
                <span className="text-neutral-500">Platform</span>
                <b>{paymentLabel(order.paymentMethod)}</b>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-neutral-500">Booking reference</span>
                <b className="break-all text-right">
                  {order.paymentReference || "—"}
                </b>
              </p>
              <p className="flex justify-between">
                <span className="text-neutral-500">Handover time</span>
                <b>Recorded automatically</b>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-neutral-500">Confirmed by</span>
                <b className="text-right">{staffName}</b>
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
  qrImageUrl,
  onConfirm,
  onCancel,
}: {
  show: boolean;
  amountDue: number;
  method: PaymentMethod;
  qrImageUrl: string;
  onConfirm: (p: { tendered: number; file?: File }) => void;
  onCancel: () => void;
}) {
  const { money, s } = useFmt();
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState("");
  const proofInputRef = useRef<HTMLInputElement>(null);
  const proofPreview = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file],
  );
  useEffect(
    () => () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    },
    [proofPreview],
  );
  useEffect(() => {
    if (show) {
      setInput("");
      setInputError("");
    }
  }, [show]);

  const completeCashInput = /^\d+(?:\.\d{0,2})?$/.test(input);
  const tendered = completeCashInput ? Number(input) : 0;
  const validTendered =
    completeCashInput &&
    Number.isFinite(tendered) &&
    tendered >= 0 &&
    tendered <= MAX_CASH_TENDERED;
  const enough = validTendered && tendered >= amountDue;
  const quick = [50, 100, 200, 500, 1000].filter((d) => d >= amountDue);
  const updateCashInput = (rawValue: string) => {
    if (rawValue === "") {
      setInput("");
      setInputError("");
      return;
    }
    const normalizedValue = rawValue.startsWith(".")
      ? `0${rawValue}`
      : rawValue;
    if (!/^\d+(?:\.\d{0,2})?$/.test(normalizedValue)) {
      setInputError("Enter a valid amount with up to two decimal places.");
      return;
    }
    const numericValue = Number(normalizedValue);
    if (Number.isFinite(numericValue) && numericValue > MAX_CASH_TENDERED) {
      setInputError(`Cash tendered cannot exceed ${money(MAX_CASH_TENDERED)}.`);
      return;
    }
    setInput(normalizedValue);
    setInputError("");
  };
  const press = (key: string) => {
    if (key === "⌫") {
      updateCashInput(input.slice(0, -1));
      return;
    }
    if (key === "00" && !input) return;
    updateCashInput(`${input}${key}`);
  };
  const selectProof = (nextFile?: File) => {
    setProofError("");
    if (!nextFile) {
      setFile(null);
      if (proofInputRef.current) proofInputRef.current.value = "";
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(nextFile.type)) {
      setFile(null);
      if (proofInputRef.current) proofInputRef.current.value = "";
      setProofError("Choose a PNG, JPG, or WebP payment proof.");
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      setFile(null);
      if (proofInputRef.current) proofInputRef.current.value = "";
      setProofError("Payment proof must be 5 MB or smaller.");
      return;
    }
    setFile(nextFile);
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
            <label
              className={`mb-1 flex min-h-[52px] items-center gap-2 rounded-xl border-2 bg-neutral-50 px-4 ${inputError ? "border-red-400" : input ? "border-neutral-900" : "border-neutral-200"}`}
            >
              <span className="text-neutral-400">{getCurrencySymbol(s)}</span>
              <input
                type="text"
                inputMode="decimal"
                value={input}
                onChange={(event) => updateCashInput(event.target.value)}
                placeholder="0.00"
                aria-label="Cash tendered amount"
                aria-invalid={Boolean(inputError)}
                aria-describedby={
                  inputError ? "cash-tendered-error" : undefined
                }
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-neutral-900 outline-none placeholder:text-neutral-300"
              />
            </label>
            {inputError && (
              <p
                id="cash-tendered-error"
                role="alert"
                className="mb-3 text-xs font-medium text-red-500"
              >
                {inputError}
              </p>
            )}
            <button
              type="button"
              onClick={() => updateCashInput(amountDue.toFixed(2))}
              className="pos-softbtn pos-softbtn--sm mt-2 mb-2"
            >
              Exact Amount
            </button>
            {quick.length > 0 && (
              <div
                className={`${inputError ? "mb-3" : "mt-2 mb-3"} flex flex-wrap gap-1.5`}
              >
                {quick.map((a) => (
                  <button
                    key={a}
                    onClick={() => updateCashInput(String(a))}
                    className="pos-softbtn pos-softbtn--sm"
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
            {input && validTendered && !enough && (
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
                  className="pos-key"
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
              disabled={!input || !enough || Boolean(inputError)}
              onClick={() => onConfirm({ tendered })}
            >
              Confirm payment
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col items-center rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <p className="mb-3 text-sm font-semibold text-sky-700">
                GCash Online Payment
              </p>
              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="Administrator-configured GCash QR"
                  className="h-52 w-52 rounded-xl border border-neutral-200 bg-white object-contain"
                />
              ) : (
                <div className="grid h-44 w-44 place-items-center rounded-xl border border-red-200 bg-red-50 px-4 text-center text-xs font-semibold text-red-600">
                  GCash QR is not configured. Ask an Administrator to upload it
                  in Settings.
                </div>
              )}
              <p className="mt-3 text-center text-xs text-neutral-400">
                Ask the customer to scan and pay exactly {money(amountDue)}.
                Verify receipt in the store's GCash account before confirming.
              </p>
            </div>
            <div className="mb-4 rounded-xl border border-neutral-200 p-3">
              <p className={`${eyebrow} mb-2`}>Payment proof</p>
              <input
                ref={proofInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                capture="environment"
                onChange={(event) =>
                  selectProof(event.currentTarget.files?.[0])
                }
                className="w-full text-sm"
                aria-label="Choose GCash payment proof image"
              />
              <p className="mt-2 text-xs text-neutral-400">
                Upload the customer's completed GCash payment screen before
                confirming.
              </p>
              {proofError && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  {proofError}
                </p>
              )}
              {proofPreview && (
                <>
                  <img
                    src={proofPreview}
                    alt="Selected GCash payment proof preview"
                    className="mt-3 max-h-52 w-full rounded-lg border border-neutral-200 object-contain"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-neutral-500">
                      {file?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => selectProof()}
                      className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600"
                    >
                      Clear proof
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              className={`${B.blue} mb-2`}
              disabled={!qrImageUrl || !file}
              onClick={() =>
                onConfirm({ tendered: amountDue, file: file ?? undefined })
              }
            >
              Confirm Payment
            </button>
          </>
        )}
        <button className={B.ghost} onClick={onCancel}>
          Back / Cancel
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
          {busy && (
            <Skeleton
              width={16}
              height={16}
              variant="shimmer"
              theme="customer"
              aria-label="Processing"
            />
          )}{" "}
          Authorize discount
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
        [`${r.tax.amount && Math.abs(Number(r.total) - (Number(r.subtotal) - Number(r.discount.amount) + Number(r.serviceCharge.amount))) < 0.01 ? "Included tax" : "Tax"}${r.tax.rate != null ? ` (${pct(r.tax.rate)}%)` : ""}`, r.tax.amount],
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
              ["Invoice No.", r.invoiceNumber || "\u2014"],
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
                  <IncludedChoices choices={i.includedSelections} />
              {i.selectedFlavorName && (
                    <span className="block text-xs font-semibold text-orange-700 dark:text-orange-300">
                      Sauce: {i.selectedFlavorName}
                    </span>
                  )}
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
              <span className="font-medium text-neutral-600">Total Due</span>
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
  canCancel,
  canRefund,
  onClose,
  onSettle,
  onReprint,
}: {
  show: boolean;
  orders: ShiftOrder[];
  loading: boolean;
  settlingId: number | null;
  canCancel: boolean;
  canRefund: boolean;
  onClose: () => void;
  onSettle: (o: ShiftOrder) => void;
  onReprint: (o: ShiftOrder) => void;
}) {
  const { money, time } = useFmt();
  const [open, setOpen] = useState<number | null>(null);
  const valid = orders.filter((o) => isFinalizedSale(o));
  const voidedCount = orders.filter(
    (o) => norm(o.status) === "cancelled",
  ).length;
  const stats = [
    ["Completed", String(valid.length), ""],
    [
      "Revenue",
      money(valid.reduce((s, o) => s + o.total, 0)),
      "text-green-600",
    ],
    ["Voided", String(voidedCount), "text-red-600"],
  ];
  const iconBtn = "pos-iconbtn";

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
            className="pos-tile rounded-xl border border-neutral-100 bg-neutral-50 p-3 text-center"
          >
            <p className={eyebrow}>{l}</p>
            <p className={`break-words text-lg font-bold sm:text-xl ${c}`}>
              {v}
            </p>
          </div>
        ))}
      </div>
      {loading ? (
        <div
          className="space-y-3 p-4"
          role="status"
          aria-busy="true"
          aria-label="Loading order history"
        >
          <SkeletonSectionCard theme="customer" />
          <SkeletonKPICard theme="customer" />
          <SkeletonKPICard theme="customer" />
          <SkeletonKPICard theme="customer" />
          <SkeletonListItem theme="customer" hasIcon hasAction />
          <SkeletonListItem theme="customer" hasIcon hasAction />
          <SkeletonListItem theme="customer" hasIcon hasAction />
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
          const action = getSettlementAction(o.status, o.paymentStatus, o);
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
                            : norm(o.status).includes("prepar")
                              ? "bg-blue-100 text-blue-700"
                              : ["queued", "pending", "awaiting cashier review"].includes(norm(o.status))
                                ? "bg-amber-100 text-orange-700 dark:text-orange-300"
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
                {!cancelled &&
                  action &&
                  (action === "refund" ? canRefund : canCancel) && (
                    <button
                      className={`${iconBtn} pos-iconbtn--danger`}
                      disabled={settlingId === o.id}
                      title={
                        action === "refund" ? "Refund order" : "Void order"
                      }
                      onClick={() => onSettle(o)}
                    >
                      {settlingId === o.id ? (
                        <Skeleton
                          width={16}
                          height={16}
                          variant="shimmer"
                          theme="admin"
                          aria-label="Processing"
                        />
                      ) : action === "refund" ? (
                        <RotateCcw className="h-4 w-4 text-red-600" />
                      ) : (
                        <Ban className="h-4 w-4 text-red-600" />
                      )}
                    </button>
                  )}
                {o.refundRequestStatus && (
                  <Chip
                    className={
                      o.refundRequestStatus === "Pending"
                        ? "bg-amber-100 text-amber-800"
                        : o.refundRequestStatus === "Actioned"
                          ? "bg-slate-700 text-white"
                          : "bg-neutral-100 text-neutral-600"
                    }
                  >
                    Refund {o.refundRequestStatus.toLowerCase()}
                  </Chip>
                )}
              </div>
              <Collapse open={open === o.id}>
                <div className="mx-4 -mt-3 mb-4 space-y-1 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-sm sm:mx-6">
                  {o.items.map((i, k) => (
                    <p key={k} className="flex justify-between gap-3">
                      <span>
                        {i.name} ×{i.quantity}
                        <IncludedChoices choices={i.includedSelections} />
              {i.selectedFlavorName && (
                          <span className="block text-xs font-semibold text-orange-700 dark:text-orange-300">
                            Sauce: {i.selectedFlavorName}
                          </span>
                        )}
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
  const validatingCartRef = useRef(false);
  const paymentAttemptRef = useRef<string | null>(null);
  const refundSubmittingRef = useRef(false);
  const paymentQrVersionRef = useRef<string | null>(null);
  const paymentQrObjectUrlRef = useRef("");
  const paymentProofUploadRef = useRef<{
    attemptReference: string;
    file: File;
    fileUrl: string;
  } | null>(null);
  const prevReviewCount = useRef(0);
  const prevDeliveryCount = useRef(0);

  const u = user as Record<string, unknown> | null;
  const cashierId = Number(u?.userId) > 0 ? Number(u?.userId) : null;
  const orderAlerts = useOnlineOrderAlerts(cashierId, toast);
  const [deliveryNow, setDeliveryNow] = useState(Date.now);
  const canCancelPersisted = canCancelPersistedOrders(u?.role);
  // The new backend permits a Cashier or Administrator to refund with a
  // separate password, even if legacy frontend permissions exclude Cashiers.
  const canRefundPersisted =
    canRefundPersistedOrders(u?.role) || normalizeRole(u?.role) === "cashier";
  const canPerformSettlement = (action: Settle) =>
    action === "refund" ? canRefundPersisted : canCancelPersisted;
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
  const [pickupContinuation, setPickupContinuation] = useState<{ id: number; orderNumber: string; customer: string } | null>(null);
  const draftRestored = useRef(false);
  const draftKey = 'the-crunch:cashier-draft';

  const [flavorTarget, setFlavorTarget] = useState<{
    item: MenuItem;
    editingCartKey?: string;
  } | null>(null);
  const [selectedFlavorId, setSelectedFlavorId] = useState<number | null>(null);
  const [includedTarget, setIncludedTarget] = useState<{ item: MenuItem; editingCartKey?: string } | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [orderType, setOrderType] = useState<OrderTypeVal>("dine-in");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [platformReference, setPlatformReference] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [soldToName, setSoldToName] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [billing, setBilling] = useState<Billing>({
    taxRate: 0,
    serviceCharge: 0,
  });
  const [discountTypes, setDiscountTypes] = useState<DiscountType[]>([]);
  const [settings, setSettings] = useState<GeneralRestaurantSettings>(
    GENERAL_SETTINGS_DEFAULTS,
  );
  const [paymentQrImageUrl, setPaymentQrImageUrl] = useState("");
  const [loadingPaymentQr, setLoadingPaymentQr] = useState(false);
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
  const [removeCartKey, setRemoveCartKey] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState<ReceiptDto | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [shiftOrders, setShiftOrders] = useState<ShiftOrder[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [refundTarget, setRefundTarget] = useState<RefundTarget | null>(null);
  const [refundAuthError, setRefundAuthError] = useState("");

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

  const loadPaymentQr = useCallback(async () => {
    setLoadingPaymentQr(true);
    try {
      const configuration = await fetchPaymentQrConfiguration();
      let nextObjectUrl = "";
      if (configuration.configured && configuration.imageUrl) {
        nextObjectUrl = await fetchPaymentQrObjectUrl(configuration.imageUrl);
      }
      if (paymentQrObjectUrlRef.current) {
        URL.revokeObjectURL(paymentQrObjectUrlRef.current);
      }
      paymentQrObjectUrlRef.current = nextObjectUrl;
      paymentQrVersionRef.current = configuration.updatedAt;
      setPaymentQrImageUrl(nextObjectUrl);
      return { configuration, objectUrl: nextObjectUrl };
    } catch {
      if (paymentQrObjectUrlRef.current) {
        URL.revokeObjectURL(paymentQrObjectUrlRef.current);
      }
      paymentQrObjectUrlRef.current = "";
      paymentQrVersionRef.current = null;
      setPaymentQrImageUrl("");
      return { configuration: EMPTY_PAYMENT_QR, objectUrl: "" };
    } finally {
      setLoadingPaymentQr(false);
    }
  }, []);

  useEffect(() => {
    void loadPaymentQr();
    return () => {
      if (paymentQrObjectUrlRef.current) {
        URL.revokeObjectURL(paymentQrObjectUrlRef.current);
        paymentQrObjectUrlRef.current = "";
      }
    };
  }, [loadPaymentQr]);

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
      // Refresh availability without changing existing cart quantities or entries.
      setCart((prev) => prev.map((item) => {
        const cur = next.find((product) => product.id === item.id);
        return cur
          ? { ...item, price: cur.price, remainingStock: cur.remainingStock, availabilityStatus: cur.availabilityStatus, ingredients: cur.ingredients, requiresSauce: cur.requiresSauce, customizations: cur.customizations }
          : { ...item, remainingStock: 0, availabilityStatus: "Hidden" };
      }));
    } catch {
      setProductsError("Failed to load menu items.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (!cashierId || !products.length || draftRestored.current) return;
    draftRestored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
      if (saved?.version !== 1 || saved.cashierId !== cashierId || !Array.isArray(saved.items) || saved.items.length > 999) {
        sessionStorage.removeItem(draftKey); return;
      }
      const restored: CartItem[] = saved.items.flatMap((entry: any) => {
        if (!entry || typeof entry !== 'object') return [];
        const product = products.find((candidate) => candidate.id === entry.id);
        if (!product || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 999) return [];
        const flavor = products.find((candidate) => candidate.id === entry.flavorId && candidate.categorySystemKey === 'chicken_flavors');
        const choices = Array.isArray(entry.choices) ? entry.choices.flatMap((choice: any) => {
          if (!choice || typeof choice !== 'object') return [];
          const linked = products.find((candidate) => candidate.id === choice.product_id);
          return linked && (['drinks', 'sauces'].includes(choice.kind) || /^category:[1-9][0-9]*$/.test(choice.kind)) && Number.isInteger(choice.qty) && choice.qty > 0
            ? [{ kind: choice.kind, product_id: linked.id, name: linked.name, qty: choice.qty }] : [];
        }) : [];
        return [{ ...product, cartKey: `${product.id}:${flavor?.id ?? ''}:${includedKey(choices)}`, quantity: entry.quantity,
          includedSelections: choices, selectedFlavorProductId: flavor?.id, selectedFlavorName: flavor?.name,
          note: typeof entry.note === 'string' ? entry.note.slice(0, 2000) : undefined }];
      });
      setCart(restored);
      if (['dine-in', 'take-out', 'delivery'].includes(saved.orderType)) setOrderType(saved.orderType);
      if (['cash', 'gcash_onsite', 'grabfood', 'foodpanda'].includes(saved.paymentMethod)) setPaymentMethod(saved.paymentMethod);
      if (typeof saved.customerType === 'string') setCustomerType(saved.customerType);
      if (typeof saved.orderNote === 'string') setOrderNote(saved.orderNote.slice(0, 2000));
      if (typeof saved.soldToName === 'string') setSoldToName(saved.soldToName.slice(0, 150));
    } catch { try { sessionStorage.removeItem(draftKey); } catch { /* Storage unavailable. */ } }
  }, [cashierId, products]);

  useEffect(() => {
    if (!draftRestored.current || !cashierId) return;
    try {
      if (pickupContinuation || !cart.length || done) { sessionStorage.removeItem(draftKey); return; }
      sessionStorage.setItem(draftKey, JSON.stringify({ version: 1, cashierId, orderType, paymentMethod, customerType, orderNote, soldToName,
        items: cart.map((item) => ({ id: item.id, quantity: item.quantity, flavorId: item.selectedFlavorProductId, choices: item.includedSelections?.map(({ kind, product_id, qty }) => ({ kind, product_id, qty })), note: item.note })) }));
    } catch { /* An unavailable session store must not block POS. */ }
  }, [cart, cashierId, orderType, paymentMethod, customerType, orderNote, soldToName, done, pickupContinuation]);

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
            taxRate: d?.taxBreakdownEnabled === true && Number.isFinite(Number(d.taxRate)) && Number(d.taxRate) >= 0 && Number(d.taxRate) <= 100 ? Number(d.taxRate) : 0,
            serviceCharge: 0,
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
    if (orderType === "delivery") {
      if (!["grabfood", "foodpanda"].includes(paymentMethod)) {
        setPaymentMethod("grabfood");
        setPlatformReference("GF-");
        return;
      }
      setPlatformReference(paymentMethod === "grabfood" ? "GF-" : "");
      return;
    }
    if (["grabfood", "foodpanda"].includes(paymentMethod)) {
      setPaymentMethod("cash");
    }
    setPlatformReference("");
  }, [orderType, paymentMethod]);

  const refreshOrders = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [r, p, d] = await Promise.all([
        api.get<OnlineOrder[]>("/orders/new-online"),
        api.get<OnlineOrder[]>("/orders/ready-pickup"),
        api.get<OnlineOrder[]>("/orders/delivery-handover"),
      ]);
      orderAlerts.seed([...(r ?? []), ...(p ?? []), ...(d ?? [])]);
      const first = firstPoll.current;
      firstPoll.current = false;
      const nextReview = r ?? [];
      const nextDelivery = (d ?? []).filter((o) => o.delivery || isPaid(o.paymentStatus));

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
  }, [orderAlerts.seed]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

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
  useEventInvalidation({
    topics: ["orders.changed", "payments.changed", "inventory.changed", "products.changed"],
    onEvent: event => {
      const arrival = orderAlerts.onEvent(event);
      if (arrival?.kind === "pickup") setNotifOpen(true);
      if (arrival?.kind === "delivery") setDeliveryOpen(true);
    },
    onInvalidate: async () => {
      await Promise.all([refreshOrders(), loadProducts(), ...(showHistory ? [loadShift()] : [])]);
    },
  });

  /* ── online-order actions ── */
  const patchOrder = (id: number, body: Record<string, unknown>) =>
    api.patch(`/orders/${id}`, { cashierId, ...body });

  // Void is separate from refund. This action never sends a refund request.
  const settleVoid = async (
    id: number,
    label: string,
    onDone: (status: string) => void,
  ) => {
    if (!canCancelPersisted || settlingId !== null) return;
    setSettlingId(id);
    try {
      await patchOrder(id, { status: "Cancelled" });
      onDone("Cancelled");
      toast("info", `${label} voided.`);
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to void order. Please try again.",
      );
    } finally {
      setSettlingId(null);
    }
  };

  const cancelOrder = review.find((o) => o.id === cancelId);
  const cancelAction = cancelOrder
    ? getSettlementAction(
        cancelOrder.trackingStatus,
        cancelOrder.paymentStatus,
        cancelOrder,
      )
    : null;

  const confirmCancel = async () => {
    if (!cancelOrder || cancelAction !== "cancel") return setCancelId(null);
    await settleVoid(cancelOrder.id, "Order", () =>
      setReview((p) => p.filter((o) => o.id !== cancelOrder.id)),
    );
    setCancelId(null);
  };

  const openRefundAuthorization = (
    order: { id: number; orderNumber: string; total: number },
    source: RefundTarget["source"],
  ) => {
    if (!canPerformSettlement("refund")) {
      toast("error", "You are not authorized to refund orders.");
      return;
    }
    if (settlingId !== null) return;
    setRefundAuthError("");
    setRefundTarget({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      source,
    });
  };

  const confirmRefund = async (password: string) => {
    const target = refundTarget;
    if (
      !target ||
      settlingId !== null ||
      refundSubmittingRef.current ||
      !canPerformSettlement("refund")
    )
      return;
    if (!password.trim()) {
      setRefundAuthError("Enter the refund authorization password.");
      return;
    }

    refundSubmittingRef.current = true;
    setRefundAuthError("");
    setSettlingId(target.orderId);
    try {
      // Password validation, eligibility and stock restoration are all
      // enforced atomically by the backend's existing PATCH /orders/:id route.
      await patchOrder(target.orderId, {
        status: "Refunded",
        refundAuthorizationPassword: password,
      });
      if (target.source === "online") {
        setReview((current) =>
          current.filter((order) => order.id !== target.orderId),
        );
      }
      setShiftOrders((current) =>
        current.map((order) =>
          order.id === target.orderId
            ? {
                ...order,
                status: "Refunded",
                refundRequestStatus:
                  order.refundRequestStatus === "Pending"
                    ? ("Actioned" as const)
                    : order.refundRequestStatus,
              }
            : order,
        ),
      );
      setRefundTarget(null);
      toast("success", `Order ${target.orderNumber} refunded successfully.`);
      void refreshOrders();
      if (target.source === "shift") void loadShift();
    } catch (error) {
      setRefundAuthError(
        error instanceof Error
          ? error.message
          : "Refund failed. Please try again.",
      );
    } finally {
      refundSubmittingRef.current = false;
      setSettlingId(null);
    }
  };

  const settleShiftOrder = (order: ShiftOrder) => {
    const action = getSettlementAction(
      order.status,
      order.paymentStatus,
      order,
    );
    if (!action) {
      toast(
        "warning",
        "Completed, refunded, or cancelled orders cannot be changed.",
      );
      return;
    }
    if (!canPerformSettlement(action)) return;
    if (action === "refund") {
      openRefundAuthorization(order, "shift");
      return;
    }
    void settleVoid(order.id, `Order ${order.orderNumber}`, (status) =>
      setShiftOrders((current) =>
        current.map((entry) =>
          entry.id === order.id ? { ...entry, status } : entry,
        ),
      ),
    );
  };

  const confirmProceed = async () => {
    const o = proceedOrder;
    if (!o) return;
    if (isPickupContinuation(o) && cart.length && !window.confirm("Replace Current Order with this pickup order? Unsaved cart changes will be discarded.")) return;
    setProceeding(true);
    try {
      if (isPickupContinuation(o)) {
        const original = await api.get<{ customer_name_snapshot: string; order_note: string; items: {
          product_id: number; quantity: number; unit_price: number; item_note?: string;
          selected_option_product_id?: number; selected_option_name_snapshot?: string; includedSelections: IncludedChoice[];
        }[] }>(`/orders/${o.id}/pickup-cart`);
        const loaded = original.items.map((item, index): CartItem => {
          const product = products.find(product => product.id === item.product_id);
          if (!product) throw new Error("An original product is unavailable. Refresh the menu before loading this pickup.");
          return { ...product, price: Number(item.unit_price), quantity: Number(item.quantity),
            cartKey: `pickup:${o.id}:${index}`, note: item.item_note || undefined,
            selectedFlavorProductId: item.selected_option_product_id || undefined,
            selectedFlavorName: item.selected_option_name_snapshot || undefined, includedSelections: item.includedSelections };
        });
        clearOrderForm();
        setCart(loaded);
        setPickupContinuation({ id: o.id, orderNumber: o.orderNumber, customer: original.customer_name_snapshot || "Customer" });
        setOrderType("take-out"); setPaymentMethod("cash");
        setSoldToName(original.customer_name_snapshot || ""); setOrderNote(original.order_note || "");
        setProceedOrder(null); setNotifOpen(false);
        toast("info", "Pickup loaded into Current Order. It remains unpaid until cash checkout.");
        return;
      }
      await patchOrder(o.id, { status: "Queued", paymentStatus: "Paid" });
      setReview((p) => p.filter((x) => x.id !== o.id));
      setProceedOrder(null);
      toast(
        "success",
        `Order ${o.orderNumber} confirmed and moved to cook queue.`,
      );
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to confirm order. Please try again.",
      );
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
    setSavingHandover(true);
    try {
      await patchOrder(o.id, {
        status: "Completed",
        riderName: name,
      });
      setDelivery((p) => p.filter((x) => x.id !== o.id));
      setHanded((p) => [
        {
          ...o,
          trackingStatus: "Completed",
          handoverTimestamp: new Date().toISOString(),
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
  const chickenFlavors = useMemo(
    () =>
      products.filter(
        (product) =>
          product.categorySystemKey === "chicken_flavors" &&
          norm(product.availabilityStatus) !== "hidden",
      ),
    [products],
  );
  const cashierProducts = useMemo(
    () =>
      products.filter(
        (product) => product.categorySystemKey !== "chicken_flavors",
      ),
    [products],
  );
  const categories = useMemo(
    () => [
      "ALL",
      ...[...new Set(cashierProducts.map((p) => p.category))].sort(),
    ],
    [cashierProducts],
  );
  const filtered = useMemo(
    () =>
      cashierProducts.filter(
        (p) =>
          (category === "ALL" || p.category === category) &&
          p.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [cashierProducts, category, search],
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
  const cartSignature = cart.map((i) => `${i.cartKey}:${i.quantity}`).join(",");
  useEffect(() => {
    setDiscountApproval(null);
    if (!cart.length) setCheckoutStep(1);
  }, [cartSignature]);

  const updateQty = useCallback(
    (cartKey: string, delta: number, addedItem?: CartItem) => {
      setCart((prev) => {
        const item = prev.find((entry) => entry.cartKey === cartKey) ?? addedItem;
        if (!item) return prev;
        const product = products.find((entry) => entry.id === item.id) ?? item;
        const quantity = Math.max(0, (prev.find((entry) => entry.cartKey === cartKey)?.quantity ?? 0) + delta);
        const proposed = prev.some((entry) => entry.cartKey === cartKey)
          ? prev.map((entry) => entry.cartKey === cartKey ? { ...entry, quantity } : entry)
          : [...prev, { ...item, quantity }];
        if (delta > 0 && (quantity > getEffectiveMaxQuantity(product.remainingStock) || !cartFitsInventory(proposed, products))) return prev;
        if (!prev.some((entry) => entry.cartKey === cartKey)) return [...prev, { ...item, quantity }];
        return prev.flatMap((entry) => entry.cartKey !== cartKey ? [entry] : quantity > 0 ? [{ ...entry, quantity }] : []);
      });
    },
    [products],
  );

  const addDirectToCart = useCallback((item: MenuItem) => {
    const max = getEffectiveMaxQuantity(item.remainingStock);
    if (isUnavailable(item.availabilityStatus) || max === 0) return;
    updateQty(`${item.id}:`, 1, { ...item, cartKey: `${item.id}:`, quantity: 1 });
  }, [updateQty]);

  const requestAddToCart = useCallback(
    (item: MenuItem) => {
      if (isUnavailable(item.availabilityStatus) || getEffectiveMaxQuantity(item.remainingStock) === 0) return;
      if (hasIncludedChoices(item.customizations)) return setIncludedTarget({ item });
      if (!item.requiresSauce) return addDirectToCart(item);
      setSelectedFlavorId(null);
      setFlavorTarget({ item });
    },
    [addDirectToCart],
  );

  const editCartFlavor = useCallback((item: CartItem) => {
    if (hasIncludedChoices(item.customizations)) return setIncludedTarget({ item, editingCartKey: item.cartKey });
    setSelectedFlavorId(item.selectedFlavorProductId ?? null);
    setFlavorTarget({ item, editingCartKey: item.cartKey });
  }, []);

  const confirmFlavor = useCallback(() => {
    if (!flavorTarget || !selectedFlavorId) return;
    const flavor = chickenFlavors.find(
      (entry) => entry.id === selectedFlavorId,
    );
    if (!flavor) return;
    const nextKey = `${flavorTarget.item.id}:${flavor.id}`;
    if (!flavorTarget.editingCartKey) {
      updateQty(nextKey, 1, { ...flavorTarget.item, cartKey: nextKey, quantity: 1,
        selectedFlavorProductId: flavor.id, selectedFlavorName: flavor.name,
        selectedFlavorRemainingStock: flavor.remainingStock });
    } else setCart((current) => {
      if (flavorTarget.editingCartKey) {
        const editing = current.find(
          (entry) => entry.cartKey === flavorTarget.editingCartKey,
        );
        if (!editing) return current;
        const collision = current.find(
          (entry) =>
            entry.cartKey === nextKey && entry.cartKey !== editing.cartKey,
        );
        if (collision) {
          return current
            .filter((entry) => entry.cartKey !== editing.cartKey)
            .map((entry) =>
              entry.cartKey === collision.cartKey
                ? {
                    ...entry,
                    quantity: entry.quantity + editing.quantity,
                  }
                : entry,
            );
        }
        return current.map((entry) =>
          entry.cartKey === editing.cartKey
            ? {
                ...entry,
                cartKey: nextKey,
                selectedFlavorProductId: flavor.id,
                selectedFlavorName: flavor.name,
                selectedFlavorRemainingStock: flavor.remainingStock,
                quantity: entry.quantity,
              }
            : entry,
        );
      }
      return current;
    });
    setFlavorTarget(null);
    setSelectedFlavorId(null);
  }, [chickenFlavors, flavorTarget, selectedFlavorId, updateQty]);

  const removeFromCart = useCallback(
    (cartKey: string) => setCart((p) => p.filter((c) => c.cartKey !== cartKey)),
    [],
  );
  // Puts the whole order form back to its starting state (used by Void and New order).
  const clearOrderForm = () => {
    setPickupContinuation(null);
    try { sessionStorage.removeItem(draftKey); } catch { /* Storage unavailable. */ }
    setCart([]);
    setRemoveCartKey(null);
    setFlavorTarget(null);
    setSelectedFlavorId(null);
    setCheckoutStep(1);
    setOrderType("dine-in");
    setPaymentMethod("cash");
    setPlatformReference("");
    setCustomerType(
      discountTypes.find((item) => Number(item.percentage || 0) <= 0)?.name ??
        discountTypes[0]?.name ??
        "",
    );
    setOrderNote("");
    setSoldToName("");
    setShowNote(false);
    setShowDiscounts(false);
    setPendingDiscount(null);
    setDiscountApproval(null);
    setDiscountAuthError("");
    paymentAttemptRef.current = null;
    paymentQrVersionRef.current = null;
    paymentProofUploadRef.current = null;
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
          included_selections: item.includedSelections,
          qty: item.quantity,
          ...(item.selectedFlavorProductId && {
            selected_flavor_product_id: item.selectedFlavorProductId,
          }),
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

  const openPayment = async () => {
    const missingSauce = cart.find((item) => item.requiresSauce && !item.selectedFlavorProductId);
    if (missingSauce) {
      editCartFlavor(missingSauce);
      toast("warning", "Choose one included sauce before checkout.");
      return;
    }
    if (
      discount &&
      discountRate > 0 &&
      discountApproval?.discountId !== discount.discount_id
    ) {
      setPendingDiscount(discount);
      setDiscountAuthError("");
      return;
    }
    if (orderType === "delivery") {
      const reference = platformReference.trim();
      const referenceError = getPlatformReferenceError(
        paymentMethod,
        reference,
      );
      if (referenceError) {
        toast("error", referenceError);
        return;
      }
      void placeOrder({ tendered: pricing.amountDue });
      return;
    }
    if (paymentMethod === "gcash_onsite") {
      const currentQr = await loadPaymentQr();
      if (!currentQr.configuration.configured || !currentQr.objectUrl) {
        toast(
          "error",
          "GCash QR is not configured. Ask an Administrator to upload it in Settings.",
        );
        return;
      }
      paymentAttemptRef.current ??= `POS-GCASH-${crypto.randomUUID()}`;
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
    if (placingRef.current || validatingCartRef.current) return;
    if (pickupContinuation && (orderType !== "take-out" || paymentMethod !== "cash")) return toast("error", "This pickup must use Take-Out and Cash checkout.");
    validatingCartRef.current = true;
    try {
    // Refresh before payment; draft prices and availability are never authoritative.
    let currentProducts: MenuItem[];
    try { currentProducts = mapProducts(await api.get<Record<string, any>[]>('/products?item_type=menu_item')); }
    catch { return toast('error', 'Refresh menu availability before confirming payment.'); }
    const invalid = cart.some((item) => {
      const product = currentProducts.find((entry) => entry.id === item.id);
      if (!product || isUnavailable(product.availabilityStatus) || product.price !== item.price || item.quantity > getEffectiveMaxQuantity(product.remainingStock)) return true;
      if (product.requiresSauce && !currentProducts.some((entry) => entry.id === item.selectedFlavorProductId && entry.categorySystemKey === 'chicken_flavors' && !isUnavailable(entry.availabilityStatus))) return true;
      return Object.keys(product.customizations || {}).filter((key) => key === 'drinks' || key === 'sauces' || key.startsWith('category:')).some((kind) => {
        const choices = (item.includedSelections || []).filter((entry) => entry.kind === kind);
        const required = product.customizations?.[kind]?.enabled ? Number(product.customizations[kind]?.includedQuantity) : 0;
        return choices.reduce((sum, entry) => sum + entry.qty, 0) !== required || choices.some((choice) => !currentProducts.some((entry) => entry.id === choice.product_id && (entry.includedKind === kind || entry.includedCategoryKey === kind) && !isUnavailable(entry.availabilityStatus)));
      });
    });
    if (invalid || !cartFitsInventory(cart, currentProducts)) {
      await loadProducts();
      return toast('warning', 'Menu prices, selections or stock changed. Review the cart before payment.');
    }
    } finally { validatingCartRef.current = false; }
    const missingSauce = cart.find((item) => item.requiresSauce && !item.selectedFlavorProductId);
    if (missingSauce) {
      editCartFlavor(missingSauce);
      toast("warning", "Choose one included sauce before checkout.");
      return;
    }
    if (!isOnline) return toast("error", "No connection. Cannot place order.");
    if (
      paymentMethod === "cash" &&
      (!Number.isFinite(tendered) ||
        tendered < 0 ||
        tendered > MAX_CASH_TENDERED ||
        Math.abs(tendered * 100 - Math.round(tendered * 100)) > 1e-6)
    ) {
      toast(
        "error",
        "Cash tendered must be between ₱0.00 and ₱100,000.00 with up to two decimal places.",
      );
      return;
    }
    placingRef.current = true;
    setShowAmount(false);
    setPlacing(true);
    const { discountAmount, taxAmount, amountDue } = pricing;
    const change = Math.max(0, tendered - amountDue);
    const isCash = paymentMethod === "cash";
    const isThirdPartyDelivery = orderType === "delivery";
    const isOnsiteGcash =
      paymentMethod === "gcash_onsite" && !isThirdPartyDelivery;

    try {
      if (!isCash && !isThirdPartyDelivery && !paymentAttemptRef.current) {
        throw new Error(
          "GCash payment confirmation expired. Reopen checkout and try again.",
        );
      }
      let proofImageUrl: string | undefined;
      if (isOnsiteGcash) {
        if (!file) {
          throw new Error(
            "Choose a payment proof before confirming GCash payment.",
          );
        }
        const attemptReference = paymentAttemptRef.current as string;
        const cachedProof = paymentProofUploadRef.current;
        if (
          cachedProof?.attemptReference === attemptReference &&
          cachedProof.file === file
        ) {
          proofImageUrl = cachedProof.fileUrl;
        } else {
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
          paymentProofUploadRef.current = {
            attemptReference,
            file,
            fileUrl: proofImageUrl,
          };
        }
      }

      const res = await api.post<{
        orderId?: number;
        orderNumber?: string;
        transactionId?: string;
        receipt: ReceiptDto;
      }>("/orders", {
        ...(pickupContinuation && { continue_order_id: pickupContinuation.id }),
        items: cart.map((i) => ({
          product_id: i.id,
          included_selections: i.includedSelections,
          qty: i.quantity,
          ...(i.selectedFlavorProductId && {
            selected_flavor_product_id: i.selectedFlavorProductId,
          }),
          subtotal: i.price * i.quantity,
          name: i.name,
          price: i.price,
          ...(i.note && { note: i.note }),
        })),
        total: amountDue,
        order_type: orderType,
        payment_method: paymentMethod,
        ...(isThirdPartyDelivery && {
          payment_reference: platformReference.trim(),
        }),
        ...(!isCash &&
          !isThirdPartyDelivery && {
            payment_status: "Paid",
            payment_reference: paymentAttemptRef.current,
            payment_qr_version: paymentQrVersionRef.current,
            proof_image_url: proofImageUrl,
          }),
        customer_type: customerType,
        ...(soldToName.trim() && { customer_name: soldToName.trim() }),
        discount_name: customerType,
        discount_rate: discountRate,
        discount_id: discount?.discount_id ?? null,
        ...(discountApproval && {
          discount_authorization: discountApproval.token,
        }),
        discount_amount: discountAmount,
        vat_amount: taxAmount,
        vat_exempt_amount: 0,
        ...(isCash && { cash_tendered: tendered, change_amount: change }),
        ...(orderNote.trim() && { order_note: orderNote.trim() }),
      });

      try { sessionStorage.removeItem(draftKey); } catch { /* Storage unavailable. */ }
      setCart([]);
      setPickupContinuation(null);
      setDone(res.receipt);
      paymentAttemptRef.current = null;
      paymentQrVersionRef.current = null;
      paymentProofUploadRef.current = null;
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
      !o.delivery && !o.handoverTimestamp &&
      !["handed to rider", "out for delivery"].includes(norm(o.trackingStatus)),
  );
  const customerDeliveries = prioritizeDeliveryRequests(delivery.filter(o => o.delivery));
  const hasWaitingDelivery = customerDeliveries.some(isAwaitingDeliveryFee);
  useEffect(() => {
    if (!deliveryOpen || !hasWaitingDelivery) return;
    setDeliveryNow(Date.now());
    const timer = window.setInterval(() => setDeliveryNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deliveryOpen, hasWaitingDelivery]);
  const deliveryCount = pendingDelivery.length + handed.length + customerDeliveries.length;
  const payBtnLabel = placing
    ? "Processing…"
    : loadingPaymentQr && paymentMethod === "gcash_onsite"
      ? "Loading GCash QR…"
      : !isOnline
        ? "Offline — cannot place order"
        : paymentMethod === "gcash_onsite"
          ? "Proceed to Checkout"
          : `Pay ${fmt.money(pricing.amountDue)}`;

  return (
    <Ctx.Provider value={fmt}>
      <Sidebar />
      <div className="pos-scope">
      {!isOnline && (
        <div className="fixed left-1/2 top-3 z-[99999] flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          <WifiOff className="h-4 w-4 shrink-0" />
          No connection — orders cannot be placed
        </div>
      )}

      <div
        className={`pos-page flex text-neutral-900 ${compact ? "min-h-screen flex-col pt-[72px] pl-[76px] md:pl-[100px]" : "h-screen overflow-hidden pl-[100px]"}`}
        style={{ fontFamily: "'Poppins', sans-serif" }}
      >
        <div className="pos-atmosphere" aria-hidden="true" />
        {/* ── Menu ── */}
        <section
          className={`flex min-w-0 flex-1 flex-col ${compact ? "" : "overflow-hidden"}`}
        >
          <div className="shrink-0 px-4 pt-6 sm:px-8 sm:pt-7">
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mb-5 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <span className="pos-wordmark">The Crunch</span>
                <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
                <p className="pos-subtitle">Cashier point of sale</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col items-start gap-1">
                  <button type="button" className={ACT.dark} disabled={orderAlerts.changingSound} aria-pressed={orderAlerts.soundState === 'enabled'} onClick={() => void orderAlerts.toggleSound()}>
                    {orderAlerts.soundState === 'enabled' ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                    {orderAlerts.changingSound ? 'Checking audio...' : orderAlerts.soundState === 'enabled' ? 'Mute sounds' : orderAlerts.soundState === 'blocked' ? 'Retry order sounds' : 'Unmute sounds'}
                  </button>
                  <span className="text-xs text-neutral-600" role="status">{orderAlerts.soundState === 'enabled' ? 'Order sounds on' : orderAlerts.soundState === 'blocked' ? 'Audio unavailable; visual alerts on' : 'Sounds off; visual alerts on'}</span>
                </div>
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
                  Delivery Orders
                </Pill>
              </div>
            </motion.div>

            <Collapse open={notifOpen}>
              <div className="pos-panel rounded-2xl border border-green-200 bg-green-50/40">
                {!onlineCount && (
                  <Empty>
                    No online pickup orders waiting for cashier action
                  </Empty>
                )}
                {review.length > 0 && <section aria-label="Awaiting cashier review" className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
                  <PanelTitle>Awaiting cashier review ({review.length})</PanelTitle>
                {review.map((o) => {
                  const action = getSettlementAction(
                    o.trackingStatus,
                    o.paymentStatus,
                    o,
                  );
                  return (
                    <OrderRow
                      key={o.id}
                      o={o}
                      showPay
                      actions={
                        <>
                          {action && canPerformSettlement(action) && (
                            <button
                              className={ACT.red}
                              disabled={settlingId === o.id}
                              onClick={() => {
                                if (action === "refund")
                                  openRefundAuthorization(o, "online");
                                else setCancelId(o.id);
                              }}
                            >
                              {settlingId === o.id && (
                                <Skeleton
                                  width={14}
                                  height={14}
                                  variant="shimmer"
                                  theme="admin"
                                  aria-label="Processing"
                                />
                              )}
                              {action === "refund"
                                ? "Refund order"
                                : "Void order"}
                            </button>
                          )}
                          {!o.delivery && <button
                            className={ACT.green}
                            onClick={() => setProceedOrder(o)}
                          >
                            Proceed to order
                          </button>}
                          {o.delivery && <DeliveryQuoteForm order={o} onSaved={refreshOrders} />}
                        </>
                      }
                    />
                  );
                })}
                </section>}
                {ready.length > 0 && <section aria-label="Ready for pickup" className={`${review.length ? "mt-3" : ""} overflow-hidden rounded-2xl border border-green-300 bg-green-50/60`}>
                  <PanelTitle>Ready for pickup ({ready.length})</PanelTitle>
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
                </section>}
              </div>
            </Collapse>

            <Collapse open={deliveryOpen}>
              <div className="pos-panel pos-delivery-list rounded-2xl border border-neutral-200 bg-neutral-50/60">
                {!deliveryCount && (
                  <Empty>No delivery orders waiting for rider handover</Empty>
                )}
                {customerDeliveries.length > 0 && <PanelTitle>Customer deliveries</PanelTitle>}
                {customerDeliveries.map(o => <DeliveryOrderCard key={`customer-delivery-${o.id}`} order={o} onSaved={refreshOrders} now={deliveryNow} />)}
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
                  className={`pos-cat shrink-0 whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium capitalize transition ${category === c ? "pos-cat--active" : ""}`}
                >
                  {c === "ALL" ? "All items" : c.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-8">
            {loadingProducts && !products.length ? (
              <div
                className="space-y-4 p-4"
                role="status"
                aria-busy="true"
                aria-label="Loading menu"
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(190px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {[...Array(6)].map((_, i) => (
                    <SkeletonProductCard key={i} theme="customer" />
                  ))}
                </div>
              </div>
            ) : productsError ? (
              <Empty>
                <p className="text-red-400">{productsError}</p>
                <button
                  onClick={() => void loadProducts()}
                  className="pos-softbtn pos-softbtn--sm mt-1"
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
                    onAdd={requestAddToCart}
                    quantity={cart.find((c) => c.id === item.id)?.quantity ?? 0}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </section>

        {/* ── Cart ── */}
        <aside
          className={`pos-cart pos-cart--cashier flex shrink-0 flex-col ${compact ? "w-full border-t" : "w-[400px] border-l"} border-neutral-100`}
        >
          <div className="shrink-0 space-y-3 border-b border-neutral-100 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
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
                  className="pos-act pos-act--red shrink-0"
                >
                  <Ban className="h-4 w-4" />
                  Void
                </button>
              )}
            </div>
            {pickupContinuation && (
              <div className="min-w-0 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Cash on Pickup {pickupContinuation.orderNumber}</p>
                <p className="break-words [overflow-wrap:anywhere]">{pickupContinuation.customer}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span>Unpaid until checkout.</span>
                  <button className="whitespace-nowrap underline" onClick={() => { if (window.confirm("Discard local pickup cart changes? The original unpaid order will remain available.")) clearOrderForm(); }}>Discard local changes</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            {cart.length === 0 ? (
              <Empty
                icon={<UtensilsCrossed className="h-8 w-8 text-neutral-300" />}
              >
                Add items to start
              </Empty>
            ) : checkoutStep === 1 ? (
              <AnimatePresence>
                {cart.map((item) => (
                  <CartRow
                    key={item.cartKey}
                    item={item}
                    onRemove={setRemoveCartKey}
                    onQty={updateQty}
                    canIncrease={(products.find((p) => p.id === item.id) ?? item).ingredients.every((ingredient) =>
                      cart.reduce((total, entry) => total + entry.quantity *
                        ((products.find((p) => p.id === entry.id) ?? entry).ingredients.find((row) => row.product_id === ingredient.product_id)?.quantity_required ?? 0), 0)
                      + ingredient.quantity_required <= ingredient.stock + 0.0000001)}
                    onEditFlavor={editCartFlavor}
                  />
                ))}
              </AnimatePresence>
            ) : (
              <div className="space-y-3 py-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">
                  Confirmed order summary
                </p>
                {cart.map((item) => (
                  <div
                    key={item.cartKey}
                    className="flex items-start justify-between gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-800">
                        {item.name}
                      </p>
                      <CartIncludedChoices item={item} />
              {item.selectedFlavorName && (
                        <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                          Sauce: {item.selectedFlavorName}
                        </p>
                      )}
                      <p className="text-xs text-neutral-400">
                        {item.quantity} × {fmt.money(item.price)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {fmt.money(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
                <div className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-500">
                  Order type:{" "}
                  <strong className="text-neutral-800">
                    {orderType === "dine-in"
                      ? "Dine-in"
                      : orderType === "take-out"
                        ? "Take-out"
                        : "Delivery"}
                  </strong>
                  {orderType === "delivery" && platformReference.trim() && (
                    <span className="block pt-1">
                      Reference: {platformReference.trim()}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="shrink-0 border-t border-neutral-100 p-4 sm:p-6">
              <div className="mb-4 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50 text-sm">
                {(checkoutStep === 1
                  ? [["Subtotal", fmt.money(gross), "text-neutral-500"]]
                  : [
                      ["Subtotal", fmt.money(gross), "text-neutral-500"],
                      [
                        `Discount (${pct(discountRate)}%)`,
                        `-${fmt.money(pricing.discountAmount)}`,
                        "text-green-600",
                      ],
                      ...(billing.taxRate > 0 ? [[`Included tax (${pct(billing.taxRate)}%)`, fmt.money(pricing.taxAmount), "text-neutral-500"]] : []),
                    ]
                ).map(([l, v, c]) => (
                  <p
                    key={l}
                    className="flex justify-between gap-3 border-b border-dashed border-neutral-200 px-4 py-2.5"
                  >
                    <span className="text-neutral-400">{l}</span>
                    <span className={`font-medium ${c}`}>{v}</span>
                  </p>
                ))}
                {checkoutStep === 2 && (
                  <p className="flex items-center justify-between bg-neutral-100 px-4 py-3.5">
                    <span className="font-medium text-neutral-600">Total</span>
                    <span className="text-2xl font-semibold">
                      {fmt.money(pricing.amountDue)}
                    </span>
                  </p>
                )}
              </div>

              <div
                className={`mb-2 grid gap-2 ${checkoutStep === 2 ? "grid-cols-1" : "grid-cols-1"}`}
              >
                {checkoutStep === 1 && !pickupContinuation && (
                  <Select
                    value={orderType}
                    onChange={(v) => {
                      const nextOrderType = v as OrderTypeVal;
                      setOrderType(nextOrderType);
                      setPaymentMethod(
                        nextOrderType === "delivery" ? "grabfood" : "cash",
                      );
                      if (nextOrderType !== "delivery")
                        setPlatformReference("");
                    }}
                    options={[
                      { value: "dine-in", label: "Dine in" },
                      { value: "take-out", label: "Take out" },
                      { value: "delivery", label: "Delivery" },
                    ]}
                  />
                )}
                {checkoutStep === 1 && orderType === "delivery" && (
                  <Select
                    value={paymentMethod}
                    onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    options={[
                      { value: "grabfood", label: "GrabFood" },
                      { value: "foodpanda", label: "Foodpanda" },
                    ]}
                  />
                )}
                {checkoutStep === 2 && orderType !== "delivery" && !pickupContinuation && (
                  <Select
                    value={paymentMethod}
                    onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    options={[
                      { value: "cash", label: "Cash" },
                      { value: "gcash_onsite", label: "Online Payment" },
                    ]}
                  />
                )}
                {checkoutStep === 2 && orderType === "delivery" && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm font-semibold text-neutral-700">
                    {paymentMethod === "foodpanda" ? "Foodpanda" : "GrabFood"} ·{" "}
                    {platformReference}
                  </div>
                )}
              </div>
              {checkoutStep === 1 && orderType === "delivery" && (
                <div className="mb-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <label
                    className={`${eyebrow} mb-1.5 block`}
                    htmlFor="platform-reference"
                  >
                    Platform reference
                  </label>
                  <input
                    id="platform-reference"
                    value={platformReference}
                    onChange={(event) =>
                      setPlatformReference(
                        event.target.value
                          .replace(/[^A-Za-z0-9-]/g, "")
                          .slice(0, MAX_PLATFORM_REFERENCE_LENGTH),
                      )
                    }
                    maxLength={MAX_PLATFORM_REFERENCE_LENGTH}
                    placeholder={
                      paymentMethod === "foodpanda"
                        ? "Enter complete Foodpanda order reference"
                        : "GF-123 or complete GrabFood booking ID"
                    }
                    aria-invalid={Boolean(
                      platformReference &&
                      getPlatformReferenceError(
                        paymentMethod,
                        platformReference,
                      ),
                    )}
                    autoCapitalize="characters"
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm uppercase outline-none focus:border-neutral-900"
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    {paymentMethod === "grabfood"
                      ? "Complete the actual GrabFood short order ID or enter the full booking ID."
                      : "Enter the actual reference shown by Foodpanda; no prefix is added."}
                  </p>
                </div>
              )}
              {checkoutStep === 2 && (
                <button
                  type="button"
                  onClick={() => setShowDiscounts(true)}
                  className="pos-softbtn w-full justify-between mb-2 text-sm"
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
              )}
              {checkoutStep === 2 && (
                <div className="mb-3 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className={eyebrow}>Optional receipt details</p>
                  <input
                    value={soldToName}
                    onChange={(event) =>
                      setSoldToName(((event.nativeEvent as InputEvent).isComposing ? event.target.value : capitalizeFirstLetter(event.target.value)).slice(0, 150))
                    }
                    onCompositionEnd={(event) => setSoldToName(capitalizeFirstLetter(event.currentTarget.value).slice(0, 150))}
                    placeholder="Sold To"
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  />
                </div>
              )}
              {checkoutStep === 2 && (
                <button
                  onClick={() => setShowNote((p) => !p)}
                  className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${showNote || orderNote ? "border-blue-200 bg-blue-50 text-blue-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}
                >
                  <MessageSquare className="h-4 w-4" />
                  {orderNote ? "Edit Other Note" : "Add Other Note"}
                </button>
              )}
              {checkoutStep === 2 && (
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
              )}

              {checkoutStep === 1 ? (
                <button
                  type="button"
                  className={`${B.dark} pos-btn--lg`}
                  onClick={() => setCheckoutStep(2)}
                >
                  Continue to Payment
                </button>
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(1)}
                    className="pos-btn pos-btn--ghost text-sm font-semibold"
                  >
                    Back
                  </button>
                  <button
                    className={`${isOnline ? B.green : B.dark} pos-btn--lg`}
                    disabled={
                      placing || loadingPaymentQr || !isOnline || !customerType
                    }
                    onClick={openPayment}
                  >
                    {placing && (
                      <Skeleton
                        width={16}
                        height={16}
                        variant="shimmer"
                        theme="customer"
                        aria-label="Placing order"
                      />
                    )}
                    {payBtnLabel}
                  </button>
                </div>
              )}
              <p className="mt-2 text-center text-xs text-neutral-400">
                Paid orders reserve and deduct stock when the payment is
                confirmed.
              </p>
            </div>
          )}
        </aside>
      </div>

      {includedTarget && <IncludedSelectionModal name={includedTarget.item.name} config={includedTarget.item.customizations}
        requireFlavor={includedTarget.item.requiresSauce} flavors={chickenFlavors}
        options={products.filter((product) => product.id !== includedTarget.item.id).map((product) => ({ categoryKey: product.includedCategoryKey, kind: product.includedKind, id: product.id, name: product.name, stock: product.categorySystemKey === 'chicken_flavors' ? 999 : Math.floor(Math.max(0, product.remainingStock - cart.filter((entry) => entry.cartKey !== includedTarget.editingCartKey).reduce((sum, entry) => sum + entry.quantity * ((entry.id === product.id ? 1 : 0) + (entry.includedSelections || []).filter((choice) => choice.product_id === product.id).reduce((count, choice) => count + choice.qty, 0)), 0)) / (cart.find((entry) => entry.cartKey === includedTarget.editingCartKey)?.quantity || 1)), available: !isUnavailable(product.availabilityStatus) }))}
        onCancel={() => setIncludedTarget(null)} onConfirm={(choices, flavorId) => {
          const target = includedTarget;
          const flavor = chickenFlavors.find((entry) => entry.id === flavorId);
          const key = `${target.item.id}:${flavorId ?? ''}:${includedKey(choices)}`;
          const selected = { ...target.item, cartKey: key, quantity: 1, includedSelections: choices, selectedFlavorProductId: flavorId, selectedFlavorName: flavor?.name };
          if (!target.editingCartKey) updateQty(key, 1, selected);
          else setCart((current) => {
            const old = current.find((entry) => entry.cartKey === target.editingCartKey);
            if (!old) return current;
            const next = current.filter((entry) => entry.cartKey !== target.editingCartKey);
            const collision = next.find((entry) => entry.cartKey === key);
            const proposed = [...next, { ...selected, quantity: old.quantity }];
            if (!cartFitsInventory(proposed, products)) return current;
            return collision ? next.map((entry) => entry.cartKey === key ? { ...entry, quantity: entry.quantity + old.quantity } : entry) : [...next, { ...selected, quantity: old.quantity, note: old.note }];
          });
          setIncludedTarget(null);
        }} />}
      <ChickenFlavorModal
        item={flavorTarget?.item ?? null}
        flavors={chickenFlavors}
        selectedFlavorId={selectedFlavorId}
        onSelect={setSelectedFlavorId}
        onConfirm={confirmFlavor}
        onCancel={() => {
          setFlavorTarget(null);
          setSelectedFlavorId(null);
        }}
      />
      <ConfirmModal
        show={removeCartKey !== null}
        title="Remove item"
        message="Remove this item from your cart?"
        confirmLabel="Remove item"
        busy={false}
        onConfirm={() => {
          if (removeCartKey !== null) removeFromCart(removeCartKey);
          setRemoveCartKey(null);
        }}
        onCancel={() => setRemoveCartKey(null)}
      />
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
        title="Void order?"
        message="This will permanently void the unpaid online order. The customer will need to be notified separately."
        confirmLabel="Yes, void order"
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
        key={paymentAttemptRef.current || `${paymentMethod}-payment`}
        show={showAmount}
        amountDue={pricing.amountDue}
        method={paymentMethod}
        qrImageUrl={paymentQrImageUrl}
        onConfirm={(p) => void placeOrder(p)}
        onCancel={() => {
          setShowAmount(false);
          paymentAttemptRef.current = null;
          paymentQrVersionRef.current = null;
          paymentProofUploadRef.current = null;
        }}
      />
      <HandoverModal
        order={handoverOrder}
        rider={rider}
        staffName={cashierName}
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
        canCancel={canCancelPersisted}
        canRefund={canRefundPersisted}
        onClose={() => setShowHistory(false)}
        onSettle={settleShiftOrder}
        onReprint={(o) => void reprint(o)}
      />

      <RefundAuthorizationModal
        target={refundTarget}
        busy={settlingId !== null}
        error={refundAuthError}
        onConfirm={(password) => void confirmRefund(password)}
        onCancel={() => {
          if (settlingId !== null) return;
          setRefundTarget(null);
          setRefundAuthError("");
        }}
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
                className={`pos-toast pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 ${c}`}
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
      </div>
    </Ctx.Provider>
  );
}
