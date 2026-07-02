import { motion, type Variants } from "framer-motion";
import { EmptyState } from "../EmptyState";
import { POBadge } from "../POBadge";
import { fmtFilterDate, fmtReceivedDate } from "../../utils/formatters";
import type { PurchaseOrder } from "../../types/inventory";

export function PurchaseHistoryTab({
  pageVariants,
  staggerVariants,
  itemVariants,
  filteredCompletedPOs,
  paginatedCompletedPOs,
  poLoading,
  poHistoryDateFrom,
  poHistoryDateTo,
  poHistoryFromInputRef,
  poHistoryToInputRef,
  poHistoryPage,
  poHistoryTotalPages,
  poHistoryPageSize,
  setPoHistoryDateFrom,
  setPoHistoryDateTo,
  setPoHistoryPage,
  setSelectedOrder,
  setPrintOrder,
}: {
  pageVariants: Variants;
  staggerVariants: Variants;
  itemVariants: Variants;
  filteredCompletedPOs: PurchaseOrder[];
  paginatedCompletedPOs: PurchaseOrder[];
  poLoading: boolean;
  poHistoryDateFrom: string;
  poHistoryDateTo: string;
  poHistoryFromInputRef: React.RefObject<HTMLInputElement | null>;
  poHistoryToInputRef: React.RefObject<HTMLInputElement | null>;
  poHistoryPage: number;
  poHistoryTotalPages: number;
  poHistoryPageSize: number;
  setPoHistoryDateFrom: React.Dispatch<React.SetStateAction<string>>;
  setPoHistoryDateTo: React.Dispatch<React.SetStateAction<string>>;
  setPoHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  setSelectedOrder: React.Dispatch<React.SetStateAction<PurchaseOrder | null>>;
  setPrintOrder: React.Dispatch<React.SetStateAction<PurchaseOrder | null>>;
}) {
  return (
    <motion.div
      key="purchase-history"
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
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {[
            {
              label: "Completed Orders",
              value: filteredCompletedPOs.length,
              accent: "border-t-emerald-400",
              text: "text-emerald-600",
            },
            {
              label: "Received Today",
              value: filteredCompletedPOs.filter(
                (o) => o.receivedDate === new Date().toISOString().split("T")[0],
              ).length,
              accent: "border-t-sky-400",
              text: "text-sky-600",
            },
            {
              label: "With Receipt Logged",
              value: filteredCompletedPOs.filter((o) => !!o.receiptNo).length,
              accent: "border-t-slate-800",
              text: "text-slate-700",
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
        <motion.div variants={itemVariants}>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800 text-sm">
                  Purchase Order History
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Completed purchase orders only
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">from</span>
                <button
                  type="button"
                  onClick={() => {
                    const input = poHistoryFromInputRef.current as
                      | (HTMLInputElement & { showPicker?: () => void })
                      | null;
                    input?.showPicker?.();
                    input?.focus();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${poHistoryDateFrom ? "border-slate-900 text-slate-900 bg-slate-900/5" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white"}`}
                >
                  {fmtFilterDate(poHistoryDateFrom)}
                </button>
                <span className="text-sm text-slate-400">to</span>
                <button
                  type="button"
                  onClick={() => {
                    const input = poHistoryToInputRef.current as
                      | (HTMLInputElement & { showPicker?: () => void })
                      | null;
                    input?.showPicker?.();
                    input?.focus();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${poHistoryDateTo ? "border-slate-900 text-slate-900 bg-slate-900/5" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white"}`}
                >
                  {fmtFilterDate(poHistoryDateTo)}
                </button>
                {(poHistoryDateFrom || poHistoryDateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setPoHistoryDateFrom("");
                      setPoHistoryDateTo("");
                    }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    title="Clear date range"
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
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
                <input
                  ref={poHistoryFromInputRef}
                  type="date"
                  value={poHistoryDateFrom}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPoHistoryDateFrom(next);
                    if (poHistoryDateTo && next && next > poHistoryDateTo) {
                      setPoHistoryDateTo(next);
                    }
                  }}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <input
                  ref={poHistoryToInputRef}
                  type="date"
                  value={poHistoryDateTo}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPoHistoryDateTo(next);
                    if (poHistoryDateFrom && next && next < poHistoryDateFrom) {
                      setPoHistoryDateFrom(next);
                    }
                  }}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="hidden lg:grid grid-cols-[1.5fr_2fr_1.5fr_1.5fr_1.5fr_1.5fr_auto] px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <span>PO No.</span>
              <span>Supplier</span>
              <span>Receipt</span>
              <span>Received By</span>
              <span>Received On</span>
              <span>Items</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-slate-50">
              {poLoading ? (
                <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
                  Loading purchase order history{"\u2026"}
                </div>
              ) : filteredCompletedPOs.length === 0 ? (
                <EmptyState
                  message={
                    poHistoryDateFrom || poHistoryDateTo
                      ? "No completed purchase orders match this date range."
                      : "No completed purchase orders found."
                  }
                />
              ) : (
                paginatedCompletedPOs.map((order, i) => {
                  const totalQuantity = order.items.reduce(
                    (sum, item) => sum + Number(item.quantity || 0),
                    0,
                  );
                  return (
                  <div key={order.id}>
                    <div
                      className="hidden lg:grid grid-cols-[1.5fr_2fr_1.5fr_1.5fr_1.5fr_1.5fr_auto] px-5 py-4 transition-colors items-center hover:bg-slate-50/70 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedOrder(order);
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
                            {order.items.length} item
                            {order.items.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrintOrder(order);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
                        >
                          Print PO
                        </button>
                      </div>
                      <div className="contents">
                        <span className="text-sm text-slate-500">
                          {order.receivedBy || "-"}
                        </span>
                        <span className="text-sm text-slate-500">
                          {order.receivedDate
                            ? fmtReceivedDate(order.receivedDate)
                            : "-"}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">
                          {totalQuantity} unit{totalQuantity !== 1 ? "s" : ""}
                        </span>
                        <span className="flex justify-end">
                          <POBadge status={order.status} />
                        </span>
                      </div>
                    </div>
                    <motion.div
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setSelectedOrder(order)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedOrder(order);
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
                        </div>
                        <POBadge status={order.status} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>Receipt: {order.receiptNo || "-"}</span>
                        <span>Received by: {order.receivedBy || "-"}</span>
                        <span>
                          Date:{" "}
                          {order.receivedDate
                            ? fmtReceivedDate(order.receivedDate)
                            : "-"}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {totalQuantity} unit{totalQuantity !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </motion.div>
                  </div>
                )})
              )}
            </div>
            {!poLoading && filteredCompletedPOs.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  Showing {(poHistoryPage - 1) * poHistoryPageSize + 1}-
                  {Math.min(
                    poHistoryPage * poHistoryPageSize,
                    filteredCompletedPOs.length,
                  )}{" "}
                  of {filteredCompletedPOs.length} completed order
                  {filteredCompletedPOs.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPoHistoryPage((page) => Math.max(1, page - 1))
                    }
                    disabled={poHistoryPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: poHistoryTotalPages },
                      (_, index) => index + 1,
                    ).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setPoHistoryPage(page)}
                        className={`h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition-colors ${
                          poHistoryPage === page
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPoHistoryPage((page) =>
                        Math.min(poHistoryTotalPages, page + 1),
                      )
                    }
                    disabled={poHistoryPage === poHistoryTotalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
