import { motion, type Variants } from "framer-motion";
import { EmptyState } from "../EmptyState";
import { POBadge } from "../POBadge";
import { calcPOTotal } from "../../utils/purchaseOrderUtils";
import type { POStatus, Product, PurchaseOrder, StockAlertSettings } from "../../types/inventory";

function CartIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3h2l.4 2m0 0L7 13h10l2-8H5.4M7 13l-1.2 6.4A1 1 0 006.8 21h10.4a1 1 0 001-.8L20 13M7 13h13M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export function PurchaseOrdersTab({
  pageVariants,
  staggerVariants,
  itemVariants,
  poOrders,
  lowStock,
  criticalStock,
  poFilterStatus,
  filteredPOs,
  poLoading,
  products,
  stockAlertSettings,
  peso,
  statusDot,
  statusBar,
  restockBanner,
  setPoFilterStatus,
  onNewPO,
  onOrderNow,
  isMenuFoodProduct,
  getStockStatus,
  onSelectOrder,
  onPrintOrder,
  onDeleteOrder,
}: {
  pageVariants: Variants;
  staggerVariants: Variants;
  itemVariants: Variants;
  poOrders: PurchaseOrder[];
  lowStock: Product[];
  criticalStock: Product[];
  poFilterStatus: POStatus | "All";
  filteredPOs: PurchaseOrder[];
  poLoading: boolean;
  products: Product[];
  stockAlertSettings: StockAlertSettings;
  peso: string;
  statusDot: Record<"critical" | "low" | "normal", string>;
  statusBar: Record<"critical" | "low" | "normal", string>;
  restockBanner: React.ReactNode;
  setPoFilterStatus: React.Dispatch<React.SetStateAction<POStatus | "All">>;
  onNewPO: () => void;
  onOrderNow: (product: Product) => void;
  isMenuFoodProduct: (p: Pick<Product, "item_type">) => boolean;
  getStockStatus: (
    p: Product,
    settings: StockAlertSettings,
  ) => "critical" | "low" | "normal";
  onSelectOrder: (order: PurchaseOrder) => void;
  onPrintOrder: (order: PurchaseOrder) => void;
  onDeleteOrder: (id: string) => void;
}) {
  return (
    <motion.div
      key="purchases"
      variants={pageVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <motion.div
        variants={staggerVariants}
        initial="hidden"
        animate="show"
        className="space-y-5"
      >
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Total Orders",
              value: poOrders.length,
              accent: "border-t-slate-800",
              text: "text-slate-700",
            },
            {
              label: "Draft",
              value: poOrders.filter((o) => o.status === "Draft").length,
              accent: "border-t-yellow-400",
              text: "text-yellow-600",
            },
            {
              label: "Ordered",
              value: poOrders.filter((o) => o.status === "Ordered").length,
              accent: "border-t-blue-400",
              text: "text-blue-600",
            },
            {
              label: "Received",
              value: poOrders.filter((o) => o.status === "Received").length,
              accent: "border-t-emerald-400",
              text: "text-emerald-600",
            },
          ].map((k) => (
            <div
              key={k.label}
              className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 ${k.accent}`}
            >
              <p className="text-xs text-slate-400 font-medium">{k.label}</p>
              <p className={`text-3xl font-bold mt-1 leading-none ${k.text}`}>
                {k.value}
              </p>
            </div>
          ))}
        </motion.div>
        {(criticalStock.length > 0 || lowStock.length > 0) && (
          <motion.div variants={itemVariants}>{restockBanner}</motion.div>
        )}
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex gap-2 flex-wrap">
            {(["All", "Draft", "Ordered", "Cancelled"] as (POStatus | "All")[]).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setPoFilterStatus(s)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${poFilterStatus === s ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"}`}
                >
                  {s}
                </button>
              ),
            )}
          </div>
          <button
            onClick={onNewPO}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New PO
          </button>
        </motion.div>
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50">
              <p className="font-semibold text-slate-800 text-sm">
                Quick Order {"\u2014"} All Products
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Place a PO for any product, regardless of stock level
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {products
                .filter((p) => !isMenuFoodProduct(p))
                .map((p, i) => {
                  const status = getStockStatus(p, stockAlertSettings);
                  const pct = Math.min(
                    100,
                    (p.mainStock / Math.max(1, p.reorderPoint)) * 100,
                  );
                  return (
                    <motion.div
                      key={p.product_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors"
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[status]}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {p.product_name}
                          </p>
                          {status !== "normal" && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${status === "critical" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}
                            >
                              {status === "critical" ? "Critical" : "Low"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {p.supplier_name}
                        </p>
                      </div>
                      <div className="w-full sm:w-28 sm:text-right">
                        <p className="text-xs font-semibold text-slate-600 mb-1">
                          {p.mainStock}
                          <span className="text-slate-400 font-normal ml-0.5">
                            {p.unit}
                          </span>
                        </p>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${statusBar[status]}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => onOrderNow(p)}
                        className="w-full sm:w-auto sm:flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all duration-150"
                      >
                        <CartIcon />
                        Order
                      </button>
                    </motion.div>
                  );
                })}
              {products.filter((p) => !isMenuFoodProduct(p)).length === 0 && (
                <EmptyState message="No products found in inventory." />
              )}
            </div>
          </div>
        </motion.div>
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-50">
              <p className="font-semibold text-slate-800 text-sm">
                Purchase Orders
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {filteredPOs.length} order
                {filteredPOs.length !== 1 ? "s" : ""} shown
              </p>
            </div>
            <div className="hidden lg:grid grid-cols-[1.5fr_2.5fr_2fr_2fr_2fr_2fr_1.5fr_auto] px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>PO No.</span>
              <span>Supplier</span>
              <span>Receipt</span>
              <span>Order Date</span>
              <span>Delivery</span>
              <span>Total</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-slate-50">
              {poLoading ? (
                <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
                  Loading purchase orders{"\u2026"}
                </div>
              ) : filteredPOs.length === 0 ? (
                <EmptyState message="No purchase orders found." />
              ) : (
                filteredPOs.map((order, i) => {
                  const itemCountText =
                    order.items.length === 0
                      ? "No items"
                      : `${order.items.length} item${order.items.length !== 1 ? "s" : ""}`;

                  return (
                    <div key={order.id}>
                      <div
                        className="hidden lg:grid grid-cols-[1.5fr_2.5fr_2fr_2fr_2fr_2fr_1.5fr_auto] px-5 py-4 transition-colors items-center hover:bg-slate-50/70 cursor-pointer"
                        onClick={() => onSelectOrder(order)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectOrder(order);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="contents">
                          <span className="text-sm font-semibold text-slate-800">
                            {order.id}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {order.supplier}
                            </p>
                            <p className="text-xs text-slate-400">
                              {itemCountText}
                            </p>
                          </div>
                          <span className="text-sm text-slate-500">
                            {order.receiptNo || "-"}
                          </span>
                          <span className="text-sm text-slate-500">
                            {order.date}
                          </span>
                          <span className="text-sm text-slate-500">
                            {order.deliveryDate}
                          </span>
                          <span className="text-sm font-semibold text-slate-800">
                            {peso}
                            {(calcPOTotal(order.items) * 1.12).toLocaleString(
                              undefined,
                              { maximumFractionDigits: 0 },
                            )}
                          </span>
                          <span>
                            <POBadge status={order.status} />
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPrintOrder(order);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                            >
                              Print PO
                            </button>
                            {order.status === "Draft" ||
                            order.status === "Ordered" ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteOrder(order.id);
                                }}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                title="Cancel order"
                              >
                                <TrashIcon />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">-</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => onSelectOrder(order)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectOrder(order);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="lg:hidden w-full text-left px-4 py-3 transition-colors hover:bg-slate-50/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {order.id}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {order.supplier}
                            </p>
                            <p className="text-xs text-slate-400">
                              {itemCountText}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPrintOrder(order);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 transition-colors"
                            >
                              Print
                            </button>
                            {(order.status === "Draft" ||
                              order.status === "Ordered") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteOrder(order.id);
                                }}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                title="Cancel order"
                              >
                                <TrashIcon />
                              </button>
                            )}
                            <POBadge status={order.status} />
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>Receipt: {order.receiptNo || "-"}</span>
                          <span>Order: {order.date}</span>
                          <span>Delivery: {order.deliveryDate}</span>
                          <span className="font-semibold text-slate-700">
                            {peso}
                            {(calcPOTotal(order.items) * 1.12).toLocaleString(
                              undefined,
                              { maximumFractionDigits: 0 },
                            )}
                          </span>
                        </div>
                      </motion.div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
