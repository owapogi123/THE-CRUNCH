import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { CloseBtn } from "../CloseBtn";
import type { POItem, Product, PurchaseOrder, Supplier } from "../../types/inventory";
import { toNumber } from "../../utils/formatters";
import {
  blockInvalidNumberKeys,
  sanitizeNumberInput,
  sanitizeShortTextInput,
} from "../../utils/inputUtils";
import { parseSupplierProducts } from "../../utils/supplierUtils";

const PESO = "\u20B1";
const EMPTY_PO_ITEM: Omit<POItem, "id"> = {
  name: "",
  category: "",
  unit: "",
  quantity: 0,
  unitCost: 0,
};
const PURCHASE_ORDER_NAME_MAX_LENGTH = 100;
const PURCHASE_ORDER_NUMBER_MAX_DIGITS = 20;

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

export function CreatePOModal({
  onClose,
  onCreate,
  quickOrderProducts,
  allProducts,
  allSuppliers,
  prefillProduct,
  onShowToast,
  isMenuFoodProduct,
}: {
  onClose: () => void;
  onCreate: (
    po: Omit<PurchaseOrder, "id">,
    meta: { supplierId: number; itemNames: string[] },
  ) => Promise<void>;
  quickOrderProducts: Product[];
  allProducts: Product[];
  allSuppliers: Supplier[];
  prefillProduct?: {
    name: string;
    category: string;
    unit: string;
    supplier: string;
  } | null;
  onShowToast: (message: string, type: "success" | "error") => void;
  isMenuFoodProduct: (p: Pick<Product, "item_type">) => boolean;
}) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | "">(() => {
    if (!prefillProduct?.supplier) return "";
    const found = allSuppliers.find(
      (s) =>
        s.supplier_name.trim().toLowerCase() ===
        prefillProduct.supplier.trim().toLowerCase(),
    );
    return found?.supplier_id ?? "";
  });
  const [notes, setNotes] = useState("");
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [activeItemSuggestionIndex, setActiveItemSuggestionIndex] = useState<
    number | null
  >(null);
  const [items, setItems] = useState<Omit<POItem, "id">[]>(() => {
    if (prefillProduct) {
      return [
        {
          name: prefillProduct.name,
          category: prefillProduct.category,
          unit: prefillProduct.unit,
          quantity: 0,
          unitCost: 0,
        },
      ];
    }
    return [{ ...EMPTY_PO_ITEM }];
  });

  const handleSupplierChange = (supplierId: string) => {
    const id = Number(supplierId);
    setSelectedSupplierId(id || "");
  };

  const selectedSupplier = allSuppliers.find(
    (s) => s.supplier_id === selectedSupplierId,
  );
  const supplierName = selectedSupplier?.supplier_name ?? "";
  const contact = selectedSupplier?.contact_number ?? "";
  const supplierProductNameSet = useMemo(
    () =>
      new Set(
        parseSupplierProducts(selectedSupplier?.products_supplied).map((name) =>
          name.toLowerCase(),
        ),
      ),
    [selectedSupplier?.products_supplied],
  );

  const updateItem = (
    idx: number,
    field: keyof Omit<POItem, "id">,
    value: string | number,
  ) =>
    setItems((p) =>
      p.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );

  const removeItem = (idx: number) =>
    setItems((p) => p.filter((_, i) => i !== idx));

  const applyProductToItem = (idx: number, product: Product) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              name: product.product_name,
              category: product.category,
              unit: product.unit,
            }
          : item,
      ),
    );
    setActiveItemSuggestionIndex(null);
  };

  const getItemSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return allProducts
      .filter((product) => !isMenuFoodProduct(product))
      .filter((product) => product.product_name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPriority = supplierProductNameSet.has(
          a.product_name.toLowerCase(),
        )
          ? 0
          : 1;
        const bPriority = supplierProductNameSet.has(
          b.product_name.toLowerCase(),
        )
          ? 0
          : 1;

        return aPriority - bPriority || a.product_name.localeCompare(b.product_name);
      })
      .slice(0, 6);
  };

  const addQuickOrderItem = (product: Product) => {
    setItems((p) => [
      {
        name: product.product_name,
        category: product.category,
        unit: product.unit,
        quantity: Math.max(
          1,
          Math.ceil(toNumber(product.reorderPoint) - toNumber(product.mainStock)),
        ),
        unitCost: 0,
      },
      ...p,
    ]);
    setShowQuickOrder(false);
  };

  const addSupplierProductItem = (productName: string) => {
    const match = allProducts.find(
      (p) => p.product_name.trim().toLowerCase() === productName.toLowerCase(),
    );

    setItems((prev) => [
      {
        name: match?.product_name ?? productName,
        category: match?.category ?? "",
        unit: match?.unit ?? "",
        quantity: match
          ? Math.max(
              1,
              Math.ceil(toNumber(match.reorderPoint) - toNumber(match.mainStock)),
            )
          : 1,
        unitCost: 0,
      },
      ...prev,
    ]);
  };

  const subtotal = items.reduce(
    (s, i) => s + toNumber(i.quantity) * toNumber(i.unitCost),
    0,
  );

  const handleSubmit = async () => {
    if (!supplierName.trim() || items.some((i) => !i.name.trim())) {
      onShowToast("Please fill in all required fields.", "error");
      return;
    }
    const invalidNameItem = items.find((item) => {
      const trimmedName = String(item.name ?? "").trim();
      return !trimmedName || trimmedName.length > PURCHASE_ORDER_NAME_MAX_LENGTH;
    });
    if (invalidNameItem) {
      onShowToast(
        "Purchase order item name must be between 1 and 100 characters.",
        "error",
      );
      return;
    }
    const unmatched = items
      .map((i) => i.name.trim())
      .filter(
        (name) =>
          !allProducts.some(
            (p) => p.product_name.trim().toLowerCase() === name.toLowerCase(),
          ),
      );
    if (unmatched.length > 0) {
      onShowToast(
        `These items don't match any product in inventory: ${unmatched.join(", ")}.`,
        "error",
      );
      return;
    }
    const invalidQuantityItem = items.find((item) => {
      const digitsOnly = String(item.quantity ?? "").replace(/\D/g, "");
      const quantity = toNumber(item.quantity, Number.NaN);
      return (
        digitsOnly.length === 0 ||
        digitsOnly.length > PURCHASE_ORDER_NUMBER_MAX_DIGITS ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      );
    });
    if (invalidQuantityItem) {
      onShowToast(
        "Purchase order quantity must be 1 or higher, with up to 20 digits.",
        "error",
      );
      return;
    }
    const invalidUnitCostItem = items.find((item) => {
      const digitsOnly = String(item.unitCost ?? "").replace(/\D/g, "");
      const unitCost = toNumber(item.unitCost, Number.NaN);
      return (
        digitsOnly.length > PURCHASE_ORDER_NUMBER_MAX_DIGITS ||
        !Number.isFinite(unitCost) ||
        unitCost < 0
      );
    });
    if (invalidUnitCostItem) {
      onShowToast(
        "Purchase order unit cost must be 0 or higher, with up to 20 digits.",
        "error",
      );
      return;
    }
    const missingUnitItem = items.find((item) => !String(item.unit ?? "").trim());
    if (missingUnitItem) {
      onShowToast(
        "Purchase order unit must come from a selected inventory material.",
        "error",
      );
      return;
    }
    const today = new Date().toISOString().split("T")[0];

    try {
      await onCreate(
        {
          supplier: supplierName,
          contact,
          date: today,
          deliveryDate: today,
          status: "Draft",
          notes,
          items: items.map((item, idx) => ({
            ...item,
            id: idx + 1,
            name: item.name.trim(),
            quantity: toNumber(item.quantity),
            unitCost: toNumber(item.unitCost),
          })),
        },
        {
          supplierId: Number(selectedSupplierId),
          itemNames: items.map((item) => item.name.trim()).filter(Boolean),
        },
      );
      onClose();
    } catch {
      /* error shown via onShowToast in parent */
    }
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
              New Purchase Order
            </h2>
            {prefillProduct && (
              <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Pre-filled from stock alert: {prefillProduct.name}
              </p>
            )}
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 space-y-5">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">
              Supplier <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
            >
              <option value="">- Select a supplier -</option>
              {allSuppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                  {s.products_supplied ? ` \u00B7 ${s.products_supplied}` : ""}
                </option>
              ))}
            </select>
          </div>
          {selectedSupplier && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                {selectedSupplier.supplier_name}
              </p>
              <p className="text-xs text-slate-500">
                {selectedSupplier.contact_number}
                {selectedSupplier.email && ` \u00B7 ${selectedSupplier.email}`}
              </p>
              {parseSupplierProducts(selectedSupplier.products_supplied).length >
                0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parseSupplierProducts(selectedSupplier.products_supplied).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => addSupplierProductItem(p)}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 transition-colors"
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Items
                {selectedSupplier &&
                  parseSupplierProducts(selectedSupplier.products_supplied).length >
                    0 && (
                    <span className="ml-2 text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full normal-case">
                      click supplier items to add
                    </span>
                  )}
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowQuickOrder((p) => !p)}
                  disabled={quickOrderProducts.length === 0}
                  className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Quick Order
                </button>
                <button
                  onClick={() => setItems((p) => [{ ...EMPTY_PO_ITEM }, ...p])}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                  Add Item
                </button>
              </div>
            </div>
            {showQuickOrder && quickOrderProducts.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide px-0.5">
                  Products Needing Reorder
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {quickOrderProducts.map((product) => (
                    <button
                      key={product.product_id}
                      onClick={() => addQuickOrderItem(product)}
                      className="w-full text-left rounded-lg bg-white border border-amber-100 hover:border-amber-300 px-3 py-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {product.product_name}
                        </span>
                        <span className="text-[11px] font-semibold text-amber-700 whitespace-nowrap">
                          Need{" "}
                          {Math.max(
                            0,
                            toNumber(product.reorderPoint) -
                              toNumber(product.mainStock),
                          )}{" "}
                          {product.unit}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {product.category}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <AnimatePresence>
                {items.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start rounded-lg border border-slate-100 p-2 min-w-0"
                  >
                    <div className="sm:col-span-2 min-w-0">
                      <label className="block text-[11px] text-gray-400 mb-1">
                        Item {idx + 1}
                      </label>
                      <div className="relative">
                        <input
                          value={item.name}
                          onChange={(e) => {
                            updateItem(
                              idx,
                              "name",
                              sanitizeShortTextInput(
                                e.target.value,
                                PURCHASE_ORDER_NAME_MAX_LENGTH,
                              ),
                            );
                            setActiveItemSuggestionIndex(idx);
                          }}
                          onFocus={() => setActiveItemSuggestionIndex(idx)}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveItemSuggestionIndex((current) =>
                                current === idx ? null : current,
                              );
                            }, 150);
                          }}
                          maxLength={PURCHASE_ORDER_NAME_MAX_LENGTH}
                          placeholder="Item name"
                          className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300"
                        />
                        {activeItemSuggestionIndex === idx &&
                          getItemSuggestions(item.name).length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-20 overflow-hidden">
                              {getItemSuggestions(item.name).map((product) => (
                                <button
                                  key={product.product_id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => applyProductToItem(idx, product)}
                                  className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  <span className="block font-medium text-slate-700">
                                    {product.product_name}
                                  </span>
                                  <span className="block text-[11px] text-slate-400">
                                    {product.category}
                                    {product.unit ? ` \u00B7 ${product.unit}` : ""}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                    {[
                      ["Unit", "unit", "Auto from material"],
                      ["Qty", "quantity", "0"],
                      ["Unit Cost", "unitCost", `${PESO}0`],
                    ].map(([lbl, field, ph]) => (
                      <div key={field} className="min-w-0">
                        <label className="block text-[11px] text-gray-400 mb-1">
                          {lbl}
                        </label>
                        <input
                          type={field === "unit" ? "text" : "number"}
                          value={(item as Record<string, string | number>)[field] || ""}
                          onChange={(e) => {
                            if (field === "unit") return;
                            updateItem(
                              idx,
                              field as keyof Omit<POItem, "id">,
                              sanitizeNumberInput(e.target.value, {
                                allowDecimal: field === "unitCost",
                                maxDigits: PURCHASE_ORDER_NUMBER_MAX_DIGITS,
                              }),
                            );
                          }}
                          onKeyDown={(e) => {
                            if (field !== "unit") {
                              blockInvalidNumberKeys(e, {
                                allowDecimal: field === "unitCost",
                              });
                            }
                          }}
                          inputMode={
                            field === "unit"
                              ? undefined
                              : field === "unitCost"
                                ? "decimal"
                                : "numeric"
                          }
                          min={
                            field === "unitCost"
                              ? 0
                              : field === "quantity"
                                ? 1
                                : undefined
                          }
                          step={
                            field === "unit"
                              ? undefined
                              : field === "unitCost"
                                ? "0.01"
                                : "1"
                          }
                          readOnly={field === "unit"}
                          disabled={field === "unit"}
                          placeholder={ph}
                          className={`w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300 ${field === "unit" ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="sm:col-span-2 flex justify-end text-gray-300 hover:text-red-400 disabled:opacity-20 transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          {subtotal > 0 && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-500">Estimated Subtotal</span>
              <span className="text-sm font-semibold text-gray-800">
                {PESO}
                {subtotal.toLocaleString()}
              </span>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions for supplier..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-200 placeholder-gray-300 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            Save as Draft
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
