import { motion } from "framer-motion";
import { useState } from "react";
import { CloseBtn } from "../CloseBtn";
import { ExpiryChip } from "../ExpiryChip";
import type { PurchaseOrder } from "../../types/inventory";
import { daysUntilExpiry } from "../../utils/dateUtils";
import { fmtDateTime, toNumber } from "../../utils/formatters";
import {
  blockInvalidNumberKeys,
  sanitizeNumberInput,
} from "../../utils/inputUtils";
import { getPOItemDateTrackingType } from "../../utils/purchaseOrderUtils";
import { getShelfLifeDurationMs } from "../../utils/stockUtils";

export function ReceivePOModal({
  order,
  loading,
  currentStaffName,
  inventoryCategoryNameLookup,
  inventoryCategoryDateTrackingLookup,
  onClose,
  onConfirm,
  onShowToast,
}: {
  order: PurchaseOrder;
  loading: boolean;
  currentStaffName: string;
  inventoryCategoryNameLookup: Map<string, string>;
  inventoryCategoryDateTrackingLookup: Map<
    string,
    "none" | "expiry" | "shelf_life"
  >;
  onClose: () => void;
  onConfirm: (details: {
    receiptNo: string;
    receivedBy: string;
    itemExpiryDates: Record<number, string>;
    itemShelfLife: Record<
      number,
      { shelfLifeDays?: number | null; shelfLifeHours?: number | null }
    >;
  }) => Promise<void>;
  onShowToast: (message: string, type: "success" | "error") => void;
}) {
  const [receiptNo, setReceiptNo] = useState(order.receiptNo || "");
  const receivedBy = currentStaffName || order.receivedBy || "";
  const [itemExpiryDates, setItemExpiryDates] = useState<Record<number, string>>(
    () => Object.fromEntries(order.items.map((item) => [item.id, ""])),
  );
  const [itemShelfLife, setItemShelfLife] = useState<
    Record<number, { shelfLifeDays: string; shelfLifeHours: string }>
  >(() =>
    Object.fromEntries(
      order.items.map((item) => [
        item.id,
        { shelfLifeDays: "", shelfLifeHours: "" },
      ]),
    ),
  );

  const handleConfirm = async () => {
    if (!receiptNo.trim()) {
      onShowToast(
        "Please enter the receipt number before completing the order.",
        "error",
      );
      return;
    }
    if (!receivedBy.trim()) {
      onShowToast(
        "Please enter who received the stock before completing the order.",
        "error",
      );
      return;
    }
    const missing = order.items.filter((item) => {
      const trackingType = getPOItemDateTrackingType(
        item,
        inventoryCategoryNameLookup,
        inventoryCategoryDateTrackingLookup,
      );
      if (trackingType === "shelf_life") {
        const shelfLife = itemShelfLife[item.id] || {
          shelfLifeDays: "",
          shelfLifeHours: "",
        };
        return (
          toNumber(shelfLife.shelfLifeDays) <= 0 &&
          toNumber(shelfLife.shelfLifeHours) <= 0
        );
      }
      if (trackingType === "expiry") {
        return !itemExpiryDates[item.id]?.trim();
      }
      return false;
    });
    if (missing.length > 0) {
      onShowToast(
        "Please complete the required date tracking fields before marking the order as received.",
        "error",
      );
      return;
    }
    if (!receivedBy.trim()) {
      onShowToast(
        "Unable to determine the logged-in staff account for Received By.",
        "error",
      );
      return;
    }
    await onConfirm({
      receiptNo: receiptNo.trim(),
      receivedBy: receivedBy.trim(),
      itemExpiryDates,
      itemShelfLife: Object.fromEntries(
        Object.entries(itemShelfLife).map(([itemId, value]) => [
          Number(itemId),
          {
            shelfLifeDays:
              toNumber(value.shelfLifeDays) > 0
                ? Math.round(toNumber(value.shelfLifeDays))
                : null,
            shelfLifeHours:
              toNumber(value.shelfLifeHours) > 0
                ? Math.round(toNumber(value.shelfLifeHours))
                : null,
          },
        ]),
      ),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Receive Purchase Order
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Date fields follow each inventory category's tracking rule.
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{order.id}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {order.supplier} {"\u00B7"} Expected delivery {order.deliveryDate}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-100 px-4 py-4">
              <label className="text-xs font-semibold text-slate-500">
                Receipt No.
              </label>
              <input
                type="text"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="e.g. DR-2026-001"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div className="rounded-xl border border-slate-100 px-4 py-4">
              <label className="text-xs font-semibold text-slate-500">
                Received By
              </label>
              <input
                type="text"
                value={receivedBy}
                readOnly
                disabled
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 bg-slate-100 cursor-not-allowed"
              />
            </div>
          </div>
          {order.items.map((item) => {
            const trackingType = getPOItemDateTrackingType(
              item,
              inventoryCategoryNameLookup,
              inventoryCategoryDateTrackingLookup,
            );
            const usesShelfLife = trackingType === "shelf_life";
            const usesExpiry = trackingType === "expiry";
            const currentExpiryDate = itemExpiryDates[item.id] || "";
            const currentShelfLife = itemShelfLife[item.id] || {
              shelfLifeDays: "",
              shelfLifeHours: "",
            };
            const dayCount = daysUntilExpiry(currentExpiryDate);
            const warn =
              usesExpiry &&
              currentExpiryDate &&
              dayCount !== null &&
              dayCount <= 7;
            const usableUntilPreview =
              usesShelfLife &&
              (toNumber(currentShelfLife.shelfLifeDays) > 0 ||
                toNumber(currentShelfLife.shelfLifeHours) > 0)
                ? new Date(
                    Date.now() +
                      getShelfLifeDurationMs(
                        toNumber(currentShelfLife.shelfLifeDays),
                        toNumber(currentShelfLife.shelfLifeHours),
                      ),
                  ).toISOString()
                : null;
            return (
              <div
                key={item.id}
                className={`rounded-xl border px-4 py-4 transition-colors ${warn ? "border-orange-200 bg-orange-50/30" : "border-slate-100"}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.category} {"\u00B7"} {item.quantity} {item.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${usesShelfLife ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : usesExpiry ? "bg-sky-50 border border-sky-200 text-sky-700" : "bg-slate-100 border border-slate-200 text-slate-600"}`}
                    >
                      {usesShelfLife
                        ? "Shelf Life Based"
                        : usesExpiry
                          ? "Expiry Based"
                          : "No Date Tracking"}
                    </span>
                    {usesExpiry && currentExpiryDate ? (
                      <ExpiryChip dateStr={currentExpiryDate} />
                    ) : null}
                  </div>
                </div>
                {usesShelfLife ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <p className="text-xs font-semibold text-emerald-700 mb-3">
                      Shelf Life
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                          Days
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={currentShelfLife.shelfLifeDays}
                          inputMode="numeric"
                          onKeyDown={(e) =>
                            blockInvalidNumberKeys(e, { allowDecimal: false })
                          }
                          onChange={(e) =>
                            setItemShelfLife((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] || {
                                  shelfLifeDays: "",
                                  shelfLifeHours: "",
                                }),
                                shelfLifeDays: sanitizeNumberInput(
                                  e.target.value,
                                  { allowDecimal: false },
                                ),
                              },
                            }))
                          }
                          placeholder="Days"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                          Hours
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={currentShelfLife.shelfLifeHours}
                          inputMode="numeric"
                          onKeyDown={(e) =>
                            blockInvalidNumberKeys(e, { allowDecimal: false })
                          }
                          onChange={(e) =>
                            setItemShelfLife((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] || {
                                  shelfLifeDays: "",
                                  shelfLifeHours: "",
                                }),
                                shelfLifeHours: sanitizeNumberInput(
                                  e.target.value,
                                  { allowDecimal: false },
                                ),
                              },
                            }))
                          }
                          placeholder="Hours"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>
                    </div>
                  </div>
                ) : usesExpiry ? (
                  <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
                    <label className="block text-xs font-semibold text-sky-700 mb-3">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={currentExpiryDate}
                      onChange={(e) =>
                        setItemExpiryDates((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-600">
                      No date tracking is required for this category.
                    </p>
                  </div>
                )}
                {usesShelfLife && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-2">
                    Usable Until: {fmtDateTime(usableUntilPreview)}
                  </p>
                )}
                {warn && dayCount !== null && (
                  <p className="text-[11px] text-orange-500 font-medium mt-2">
                    {"\u26A0"} This item will expire in {dayCount} day
                    {dayCount !== 1 ? "s" : ""} {"\u2014"} consider whether to
                    accept.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Receiving..." : "Confirm Receive"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
