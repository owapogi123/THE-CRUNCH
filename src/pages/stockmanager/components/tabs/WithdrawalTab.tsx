import { motion, type Variants } from "framer-motion";
import { formatInSettingsTimezone } from "@/lib/restaurantSettings";
import type { ReactNode } from "react";
import { Btn } from "../Btn";
import { EmptyState } from "../EmptyState";
import { FormField } from "../FormField";
import { SectionCard } from "../SectionCard";
import { StyledInput } from "../StyledInput";
import { StyledSelect } from "../StyledSelect";
import type {
  Product,
  StockStatusRecord,
  WithdrawalFormRow,
  WithdrawalType,
} from "../../types/inventory";

export function WithdrawalTab({
  pageVariants,
  staggerVariants,
  itemVariants,
  withdrawalSubTab,
  wdType,
  todayInitialExists,
  kitchenRemaining,
  selectedWithdrawalProduct,
  withdrawalRows,
  activeWithdrawalRowId,
  wholeChickenProducts,
  choppedChickenProducts,
  otherMainStockProducts,
  selectedWithdrawalStatus,
  selectedWithdrawalPct,
  visibleWithdrawalLogs,
  products,
  submitting,
  typeBadge,
  yesterdayReturnsBanner,
  kitchenQueueContent,
  deliveredBatchesContent,
  kitchenBatchesContent,
  setWdType,
  setActiveWithdrawalRowId,
  updateWithdrawalRow,
  removeWithdrawalRow,
  addWithdrawalRow,
  submitWithdrawal,
  isReconcilable,
}: {
  pageVariants: Variants;
  staggerVariants: Variants;
  itemVariants: Variants;
  withdrawalSubTab:
    | "new-record"
    | "kitchen-queue"
    | "delivered-batches"
    | "currently-withdrawn"
    | "kitchen-batches";
  wdType: WithdrawalType;
  todayInitialExists: boolean;
  kitchenRemaining: number;
  selectedWithdrawalProduct: Product | null;
  withdrawalRows: WithdrawalFormRow[];
  activeWithdrawalRowId: string;
  wholeChickenProducts: Product[];
  choppedChickenProducts: Product[];
  otherMainStockProducts: Product[];
  selectedWithdrawalStatus: "critical" | "low" | "normal";
  selectedWithdrawalPct: number;
  visibleWithdrawalLogs: StockStatusRecord[];
  products: Product[];
  submitting: boolean;
  typeBadge: Record<WithdrawalType, string>;
  yesterdayReturnsBanner: ReactNode;
  kitchenQueueContent: ReactNode;
  deliveredBatchesContent: ReactNode;
  kitchenBatchesContent: ReactNode;
  setWdType: (type: WithdrawalType) => void;
  setActiveWithdrawalRowId: (id: string) => void;
  updateWithdrawalRow: (
    rowId: string,
    patch: Partial<Pick<WithdrawalFormRow, "productId" | "qty">>,
  ) => void;
  removeWithdrawalRow: (rowId: string) => void;
  addWithdrawalRow: () => void;
  submitWithdrawal: () => void | Promise<void>;
  isReconcilable: (p: Product) => boolean;
}) {
  return (
    <motion.div
      key="withdrawal"
      id="withdrawal-top"
      variants={pageVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <motion.div
        variants={staggerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {yesterdayReturnsBanner}
        {withdrawalSubTab === "new-record" && (
          <motion.div variants={itemVariants} className="grid grid-cols-2 gap-6">
            <SectionCard
              title="New Kitchen Stock Release"
              subtitle={
                wdType === "initial"
                  ? "Opening kitchen release - sets the day's reference"
                  : "FIFO - oldest batch released first"
              }
            >
              <div className="p-5 space-y-4">
                <FormField label="Record Type">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        key: "initial" as const,
                        disabled: todayInitialExists,
                        tooltip: "Initial withdrawal already done today.",
                      },
                      {
                        key: "supplementary" as const,
                        disabled: !todayInitialExists,
                        tooltip: "Do an initial withdrawal first.",
                      },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => !option.disabled && setWdType(option.key)}
                        disabled={option.disabled}
                        title={option.disabled ? option.tooltip : undefined}
                        className={`py-2.5 text-xs font-semibold rounded-xl border capitalize transition-all duration-200 ${wdType === option.key ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-500 border-slate-200"} ${option.disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-300"}`}
                      >
                        {option.key}
                      </button>
                    ))}
                  </div>
                </FormField>
                <div
                  className={`text-xs px-3 py-2 rounded-xl border ${wdType === "initial" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-sky-50 text-sky-600 border-sky-100"}`}
                >
                  {wdType === "initial" &&
                    "Opening kitchen release for today - recorded as the initial pull."}
                  {wdType === "supplementary" &&
                    "Additional kitchen release on top of the opening pull."}
                </div>
                {wdType === "supplementary" &&
                  kitchenRemaining > 0 &&
                  selectedWithdrawalProduct && (
                    <div className="text-xs px-3 py-2 rounded-xl border bg-amber-50 text-amber-700 border-amber-200">
                      Warning: Kitchen still has {kitchenRemaining}{" "}
                      {selectedWithdrawalProduct.unit} remaining for this
                      product. Are you sure you need a supplementary release?
                    </div>
                  )}
                <FormField label="Release Items">
                  <div className="space-y-3">
                    {withdrawalRows.map((row, index) => {
                      const rowProduct =
                        wholeChickenProducts
                          .concat(choppedChickenProducts, otherMainStockProducts)
                          .find((product) => product.product_id === row.productId) ??
                        null;
                      const isActiveRow = activeWithdrawalRowId === row.id;

                      return (
                        <div
                          key={row.id}
                          className={`rounded-2xl border p-3 transition-colors ${
                            isActiveRow
                              ? "border-blue-200 bg-blue-50/40"
                              : "border-slate-200 bg-slate-50/60"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Item {index + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeWithdrawalRow(row.id)}
                              disabled={withdrawalRows.length === 1}
                              className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-500 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(120px,0.8fr)] gap-3">
                            <StyledSelect
                              value={row.productId ?? ""}
                              onChange={(value) => {
                                setActiveWithdrawalRowId(row.id);
                                updateWithdrawalRow(row.id, {
                                  productId: value ? Number(value) : null,
                                });
                              }}
                            >
                              <option value="">Select item</option>
                              {wholeChickenProducts.length > 0 && (
                                <optgroup label="Whole Chicken">
                                  {wholeChickenProducts.map((p) => (
                                    <option key={p.product_id} value={p.product_id}>
                                      {p.product_name} ({p.mainStock} {p.unit})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {choppedChickenProducts.length > 0 && (
                                <optgroup label="Chopped Chicken">
                                  {choppedChickenProducts.map((p) => (
                                    <option key={p.product_id} value={p.product_id}>
                                      {p.product_name} ({p.mainStock} {p.unit})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {otherMainStockProducts.map((p) => (
                                <option key={p.product_id} value={p.product_id}>
                                  {p.product_name} ({p.mainStock} {p.unit})
                                </option>
                              ))}
                            </StyledSelect>
                            <StyledInput
                              type="number"
                              min={1}
                              step="1"
                              value={row.qty}
                              onChange={(value) => {
                                setActiveWithdrawalRowId(row.id);
                                updateWithdrawalRow(row.id, { qty: value });
                              }}
                              placeholder="Enter amount"
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span>
                              {rowProduct
                                ? `Available: ${rowProduct.mainStock} ${rowProduct.unit}`
                                : "Choose an item to see stock details."}
                            </span>
                            {isActiveRow && (
                              <span className="font-semibold text-blue-600">
                                Preview item
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={addWithdrawalRow}
                      className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
                    >
                      + Add Item
                    </button>
                  </div>
                </FormField>
                {selectedWithdrawalProduct &&
                  selectedWithdrawalStatus !== "normal" && (
                    <div
                      className={`text-xs px-3 py-2 rounded-xl border ${selectedWithdrawalStatus === "critical" ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}
                    >
                      {selectedWithdrawalStatus === "critical"
                        ? "Critical stock warning"
                        : "Low stock warning"}
                      : {selectedWithdrawalProduct.product_name} is at{" "}
                      {selectedWithdrawalPct}% of reorder level (
                      {selectedWithdrawalProduct.mainStock}{" "}
                      {selectedWithdrawalProduct.unit} left).
                    </div>
                  )}
                {selectedWithdrawalProduct?.category.toLowerCase().includes("sauce") && (
                  <div className="text-xs px-3 py-2 rounded-xl border bg-rose-50 text-rose-500 border-rose-100">
                    {"\u26A0\uFE0F"} Sauce items are not reconciled at end-of-day.
                    Once withdrawn, they are considered consumed.
                  </div>
                )}
                <Btn
                  onClick={submitWithdrawal}
                  variant="primary"
                  loading={submitting}
                >
                  {submitting ? "Saving..." : "Submit Release"}
                </Btn>
              </div>
            </SectionCard>
            <SectionCard
              title="Today's Kitchen Release Log"
              subtitle={`${visibleWithdrawalLogs.length} entries`}
            >
              {visibleWithdrawalLogs.length === 0 ? (
                <EmptyState message="No kitchen releases recorded today." />
              ) : (
                <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                  {visibleWithdrawalLogs.map((w) => (
                    <motion.div
                      key={w.status_id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.28 }}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/70 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {w.product_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatInSettingsTimezone(w.status_date, undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                          {w.recorded_by && (
                            <>
                              {" "}
                              {"\u00B7"}{" "}
                              <span className="text-slate-500">
                                {w.recorded_by}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${typeBadge[w.type]}`}
                        >
                          {w.type}
                        </span>
                        <span
                          className={`text-sm font-semibold ${w.type === "return" ? "text-amber-600" : "text-slate-700"}`}
                        >
                          {"\u2212"}
                          {w.quantity}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </SectionCard>
          </motion.div>
        )}
        {withdrawalSubTab === "kitchen-queue" && kitchenQueueContent}
        {withdrawalSubTab === "delivered-batches" && deliveredBatchesContent}
        {withdrawalSubTab === "currently-withdrawn" && (
          <motion.div variants={itemVariants}>
            <SectionCard
              title="Released for Kitchen Today"
              subtitle="Stock sent to kitchen for today's preparation - net of returns"
            >
              {products.filter((p) => p.dailyWithdrawn > 0).length === 0 ? (
                <EmptyState message="No stock released today." />
              ) : (
                <div className="grid grid-cols-4 divide-x divide-slate-100">
                  {products
                    .filter((p) => p.dailyWithdrawn > 0)
                    .map((p, i) => (
                      <motion.div
                        key={p.inventory_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className="p-5 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <p className="text-xs text-slate-400 truncate font-medium">
                            {p.product_name}
                          </p>
                          {isReconcilable(p) ? (
                            <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100 whitespace-nowrap">
                              reconcilable
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-rose-400 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-100 whitespace-nowrap">
                              no return
                            </span>
                          )}
                        </div>
                        <p className="text-2xl font-bold text-slate-800 mt-1.5 leading-none">
                          {p.dailyWithdrawn}
                          <span className="text-sm text-slate-400 font-normal ml-1">
                            {p.unit}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400 mt-1.5">
                          Returned:{" "}
                          <span className="text-emerald-500 font-medium">
                            {p.returned} {p.unit}
                          </span>
                        </p>
                      </motion.div>
                    ))}
                </div>
              )}
            </SectionCard>
          </motion.div>
        )}
        {withdrawalSubTab === "kitchen-batches" && kitchenBatchesContent}
      </motion.div>
    </motion.div>
  );
}
