import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { CloseBtn } from "../CloseBtn";
import { POBadge } from "../POBadge";
import type { POItem, POStatus, PurchaseOrder } from "../../types/inventory";
import {
  getPOItemDateTrackingType,
  getPOItemUsableUntil,
} from "../../utils/purchaseOrderUtils";
import { fmtDate, fmtDateTime, formatShelfLife } from "../../utils/formatters";

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

export function PODetailDrawer({
  order,
  inventoryCategoryNameLookup,
  inventoryCategoryDateTrackingLookup,
  onClose,
  onStatusChange,
  onDelete,
  onPrint,
}: {
  order: PurchaseOrder;
  inventoryCategoryNameLookup: Map<string, string>;
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >;
  onClose: () => void;
  onStatusChange: (id: string, status: POStatus) => void;
  onDelete: (id: string) => void;
  onPrint: (order: PurchaseOrder) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const nextStatus: Partial<Record<POStatus, POStatus>> = {
    Draft: "Ordered",
    Ordered: "Received",
  };
  const next = nextStatus[order.status];

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 h-full w-full max-w-[440px] bg-white shadow-2xl z-50 flex flex-col"
    >
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 font-medium">{order.date}</p>
          <h2 className="text-lg font-semibold text-gray-800">{order.id}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPrint(order)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
            title="Print purchase order"
          >
            Print PO
          </button>
          <POBadge status={order.status} />
          {(order.status === "Draft" || order.status === "Ordered") && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="Cancel order"
            >
              <TrashIcon />
            </button>
          )}
          <CloseBtn onClick={onClose} />
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-red-100 bg-red-50 px-6 py-4"
          >
            <p className="text-sm font-semibold text-red-700 mb-1">
              Cancel this purchase order?
            </p>
            <p className="text-xs text-red-400 mb-3">
              {order.id} {"\u00B7"} {order.supplier} {"\u00B7"}{" "}
              {order.items.length} item
              {order.items.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-white transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={() => {
                  onDelete(order.id);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes, cancel order
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        <div className="bg-gray-50 rounded-xl p-4 space-y-1">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            Supplier
          </p>
          <p className="font-semibold text-gray-800">{order.supplier}</p>
          <p className="text-sm text-gray-500">{order.contact}</p>
          <p className="text-sm text-gray-500">
            Delivery:{" "}
            <span className="font-medium text-gray-700">
              {order.deliveryDate}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">
            Order Items
          </p>
          <div className="space-y-2">
            {order.items.map((item: POItem) => {
              const trackingType = getPOItemDateTrackingType(
                item,
                inventoryCategoryNameLookup,
                inventoryCategoryDateTrackingLookup,
              );
              const usesShelfLife = trackingType === "shelf_life";
              const usesExpiry = trackingType === "expiry";
              const usableUntil = usesShelfLife
                ? getPOItemUsableUntil(order, item)
                : null;

              return (
                <div
                  key={item.id}
                  className="py-3 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.category} {"\u00B7"} {item.quantity} {item.unit}
                      </p>
                      <div className="mt-2 space-y-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${usesShelfLife ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : usesExpiry ? "bg-sky-50 border border-sky-200 text-sky-700" : "bg-slate-100 border border-slate-200 text-slate-600"}`}
                        >
                          {usesShelfLife
                            ? "Shelf Life Based"
                            : usesExpiry
                              ? "Expiry Based"
                              : "No Date Tracking"}
                        </span>
                        {usesShelfLife ? (
                          <>
                            <p className="text-xs text-slate-500">
                              Shelf Life:{" "}
                              <span className="font-medium text-slate-700">
                                {formatShelfLife(
                                  item.shelfLifeDays,
                                  item.shelfLifeHours,
                                )}
                              </span>
                            </p>
                            <p className="text-xs text-slate-500">
                              Usable Until:{" "}
                              <span className="font-medium text-slate-700">
                                {fmtDateTime(usableUntil)}
                              </span>
                            </p>
                          </>
                        ) : usesExpiry ? (
                          <p className="text-xs text-slate-500">
                            Expiry Date:{" "}
                            <span className="font-medium text-slate-700">
                              {fmtDate(item.expectedExpiryDate ?? null)}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            No expiry or shelf life required for this category.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {order.receiptNo && (
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
              Receipt Number
            </p>
            <p className="text-sm text-gray-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              {order.receiptNo}
            </p>
          </div>
        )}
        {order.notes && (
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
              Notes
            </p>
            <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
              {order.notes}
            </p>
          </div>
        )}
        {order.status === "Received" &&
          (order.receiptNo || order.receivedBy || order.receivedDate) && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-1">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">
                Received
              </p>
              {order.receiptNo && (
                <p className="text-sm font-medium text-gray-700">
                  Receipt: {order.receiptNo}
                </p>
              )}
              {order.receivedBy && (
                <p className="text-sm font-medium text-gray-700">
                  By: {order.receivedBy}
                </p>
              )}
              {order.receivedDate && (
                <p className="text-sm text-gray-500">
                  On: {order.receivedDate}
                </p>
              )}
            </div>
          )}
      </div>

      {next && (
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => onStatusChange(order.id, next)}
            className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            {next === "Ordered" ? "Mark as Ordered" : "Mark as Received"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
