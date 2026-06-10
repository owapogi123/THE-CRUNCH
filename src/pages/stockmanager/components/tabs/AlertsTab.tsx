import { motion, type Variants } from "framer-motion";
import { EmptyState } from "../EmptyState";
import type { Product, StockAlertSettings, Tab } from "../../types/inventory";

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

export function AlertsTab({
  pageVariants,
  staggerVariants,
  itemVariants,
  stockAlertSettings,
  products,
  lowStock,
  alertCriticalStock,
  outOfStockItems,
  setTab,
  handleOrderNow,
  isMenuFoodProduct,
  getAlertSeverity,
  getStockStatus,
  getAppliedThresholds,
  getCategoryStyle,
  statusBadge,
  toNumber,
}: {
  pageVariants: Variants;
  staggerVariants: Variants;
  itemVariants: Variants;
  stockAlertSettings: StockAlertSettings;
  products: Product[];
  lowStock: Product[];
  alertCriticalStock: Product[];
  outOfStockItems: Product[];
  setTab: React.Dispatch<React.SetStateAction<Tab>>;
  handleOrderNow: (product: Product) => void;
  isMenuFoodProduct: (p: Pick<Product, "item_type">) => boolean;
  getAlertSeverity: (
    p: Product,
    settings: StockAlertSettings,
  ) => "out" | "critical" | "low" | "normal";
  getStockStatus: (
    p: Product,
    settings: StockAlertSettings,
  ) => "critical" | "low" | "normal";
  getAppliedThresholds: (
    p: Pick<
      Product,
      "useDefaultThresholds" | "lowStockThreshold" | "criticalStockThreshold"
    >,
    settings: StockAlertSettings,
  ) => {
    useDefaultThresholds: boolean;
    low: number;
    critical: number;
  };
  getCategoryStyle: (cat: string) => string;
  statusBadge: Record<"critical" | "low" | "normal", string>;
  toNumber: (v: unknown, fb?: number) => number;
}) {
  return (
    <motion.div
      key="alerts"
      variants={pageVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <motion.div
        variants={staggerVariants}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
        >
          <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <span>
              Warning threshold:{" "}
              <strong className="text-slate-800">
                {stockAlertSettings.defaultLowStockThreshold}
              </strong>
            </span>
            <span>
              Critical threshold:{" "}
              <strong className="text-slate-800">
                {stockAlertSettings.defaultCriticalStockThreshold}
              </strong>
            </span>
          </div>
        </motion.div>
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-2xl p-5 border-2 border-t-4 border-green-200 border-t-green-500 shadow-sm">
            <p className="text-xs text-green-600 font-medium">Normal</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              {
                products.filter(
                  (p) =>
                    !isMenuFoodProduct(p) &&
                    getAlertSeverity(p, stockAlertSettings) === "normal",
                ).length
              }
            </p>
            <p className="text-xs text-green-500 mt-1">items in safe range</p>
          </div>
          <div className="bg-yellow-50 rounded-2xl p-5 border-2 border-t-4 border-yellow-200 border-t-yellow-500 shadow-sm">
            <p className="text-xs text-yellow-700 font-medium">
              Warning Items
            </p>
            <p className="text-3xl font-bold text-yellow-600 mt-1">
              {lowStock.length}
            </p>
            <p className="text-xs text-yellow-700/80 mt-1">
              need reordering soon
            </p>
          </div>
          <div className="bg-orange-50 rounded-2xl p-5 border-2 border-t-4 border-orange-200 border-t-orange-500 shadow-sm">
            <p className="text-xs text-orange-600 font-medium">
              Critical Items
            </p>
            <p className="text-3xl font-bold text-orange-600 mt-1">
              {alertCriticalStock.length}
            </p>
            <p className="text-xs text-orange-500 mt-1">order immediately</p>
          </div>
          <div className="bg-red-50 rounded-2xl p-5 border-2 border-t-4 border-red-200 border-t-red-500 shadow-sm">
            <p className="text-xs text-red-600 font-medium">Out of Stock</p>
            <p className="text-3xl font-bold text-red-600 mt-1">
              {outOfStockItems.length}
            </p>
            <p className="text-xs text-red-500 mt-1">no stock remaining</p>
          </div>
        </motion.div>
        {lowStock.length === 0 &&
        alertCriticalStock.length === 0 &&
        outOfStockItems.length === 0 ? (
          <motion.div variants={itemVariants}>
            <EmptyState message="All stock levels are within safe range." />
          </motion.div>
        ) : (
          [
            {
              items: outOfStockItems,
              label: "Out of Stock",
              color: "red",
              severity: "out" as const,
            },
            {
              items: alertCriticalStock,
              label: "Critical",
              color: "orange",
              severity: "critical" as const,
            },
            {
              items: lowStock,
              label: "Warning",
              color: "yellow",
              severity: "low" as const,
            },
          ].map(({ items, label, color, severity }) =>
            items.length > 0 ? (
              <div key={label}>
                <motion.div variants={itemVariants} className="pt-1">
                  <p
                    className={`text-xs font-semibold text-${color}-500 uppercase tracking-wider mb-2`}
                  >
                    {label}
                  </p>
                </motion.div>
                {items.map((p, i) => {
                  const status = getStockStatus(p, stockAlertSettings);
                  const appliedThresholds = getAppliedThresholds(
                    p,
                    stockAlertSettings,
                  );
                  const thresholdTarget =
                    severity === "critical"
                      ? appliedThresholds.critical
                      : appliedThresholds.low;
                  const deficit = Math.max(
                    0,
                    Math.round(thresholdTarget - toNumber(p.mainStock)),
                  );
                  return (
                    <motion.div
                      key={p.inventory_id}
                      variants={itemVariants}
                      transition={{ delay: i * 0.06 }}
                      className={`bg-white rounded-2xl border border-t-4 p-5 flex items-center justify-between shadow-sm mb-3 ${severity === "out" ? "border-red-200 border-t-red-400" : status === "critical" ? "border-orange-200 border-t-orange-400" : "border-yellow-200 border-t-yellow-400"}`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${severity === "out" ? "bg-red-50" : status === "critical" ? "bg-orange-50" : "bg-yellow-50"}`}
                        >
                          <span
                            className={`text-sm font-bold ${severity === "out" ? "text-red-600" : status === "critical" ? "text-orange-500" : "text-yellow-600"}`}
                          >
                            !
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-800">
                              {p.product_name}
                            </p>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${getCategoryStyle(p.category)}`}
                            >
                              {p.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {p.supplier_name}
                          </p>
                          <p
                            className={`text-xs font-medium mt-1 ${severity === "out" ? "text-red-600" : status === "critical" ? "text-orange-500" : "text-yellow-700"}`}
                          >
                            {severity === "out"
                              ? `No stock left. Need ${Math.max(0, appliedThresholds.low)} ${p.unit} to reach warning threshold`
                              : deficit > 0
                                ? `Need ${deficit} ${p.unit} to reach ${status === "critical" ? "critical" : "warning"} threshold`
                                : "Below critical threshold"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p
                            className={`text-2xl font-bold ${severity === "out" ? "text-red-600" : status === "critical" ? "text-orange-500" : "text-yellow-700"}`}
                          >
                            {p.mainStock}{" "}
                            <span className="text-sm font-normal text-slate-400">
                              {p.unit}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {appliedThresholds.useDefaultThresholds
                              ? "Using defaults"
                              : "Custom thresholds"}{" "}
                            {"\u00B7"} Warning at {appliedThresholds.low}{" "}
                            {"\u00B7"} Critical at {appliedThresholds.critical}
                          </p>
                          <span
                            className={`inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full ${severity === "out" ? "bg-red-100 text-red-700" : statusBadge[status]}`}
                          >
                            {severity === "out"
                              ? "Out of Stock"
                              : status === "critical"
                                ? "Restock Now"
                                : "Reorder Soon"}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setTab("purchases");
                            handleOrderNow(p);
                          }}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-sm ${severity === "out" ? "bg-red-600 hover:bg-red-700 shadow-red-500/25" : status === "critical" ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/25" : "bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/25"}`}
                        >
                          <CartIcon />
                          Order Now
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : null,
          )
        )}
      </motion.div>
    </motion.div>
  );
}
