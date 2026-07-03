import { AnimatePresence, motion, type Variants } from "framer-motion";
import { formatInSettingsTimezone } from "@/lib/restaurantSettings";
import type { Dispatch, SetStateAction } from "react";
import { Btn } from "../Btn";
import { EmptyState } from "../EmptyState";
import { FormField } from "../FormField";
import { SectionCard } from "../SectionCard";
import { StyledInput } from "../StyledInput";
import type { Product, Supplier, SupplierHistory } from "../../types/inventory";
import { parseSupplierProducts } from "../../utils/supplierUtils";

export function SuppliersTab({
  pageVariants,
  staggerVariants,
  itemVariants,
  showSupplierForm,
  supplierForm,
  supplierProductInput,
  supplierProductSuggestions,
  filteredSuppliers,
  supplierSearch,
  historySearch,
  historyDateFrom,
  historyDateTo,
  historyLoading,
  filteredHistory,
  supplierFields,
  submitting,
  setShowSupplierForm,
  setSupplierProductInput,
  setSupplierForm,
  setSupplierSearch,
  setHistorySearch,
  setHistoryDateFrom,
  setHistoryDateTo,
  setEditingSupplier,
  addProductToSupplierForm,
  addSupplier,
  removeSupplier,
  handleRemoveSupplierProduct,
  fetchSupplierHistory,
}: {
  pageVariants: Variants;
  staggerVariants: Variants;
  itemVariants: Variants;
  showSupplierForm: boolean;
  supplierForm: Omit<Supplier, "supplier_id">;
  supplierProductInput: string;
  supplierProductSuggestions: Product[];
  filteredSuppliers: Supplier[];
  supplierSearch: string;
  historySearch: string;
  historyDateFrom: string;
  historyDateTo: string;
  historyLoading: boolean;
  filteredHistory: SupplierHistory[];
  supplierFields: Array<{
    key: keyof Omit<Supplier, "supplier_id">;
    label: string;
    placeholder: string;
  }>;
  submitting: boolean;
  setShowSupplierForm: Dispatch<SetStateAction<boolean>>;
  setSupplierProductInput: Dispatch<SetStateAction<string>>;
  setSupplierForm: Dispatch<SetStateAction<Omit<Supplier, "supplier_id">>>;
  setSupplierSearch: Dispatch<SetStateAction<string>>;
  setHistorySearch: Dispatch<SetStateAction<string>>;
  setHistoryDateFrom: Dispatch<SetStateAction<string>>;
  setHistoryDateTo: Dispatch<SetStateAction<string>>;
  setEditingSupplier: Dispatch<SetStateAction<Supplier | null>>;
  addProductToSupplierForm: (productName: string) => void;
  addSupplier: () => void | Promise<void>;
  removeSupplier: (id: number) => void | Promise<void>;
  handleRemoveSupplierProduct: (
    supplier_id: number,
    product_name: string,
  ) => void | Promise<void>;
  fetchSupplierHistory: () => void | Promise<void>;
}) {
  return (
    <motion.div
      key="suppliers"
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
        <motion.div variants={itemVariants} className="flex justify-end">
          <button
            onClick={() =>
              setShowSupplierForm((f) => {
                const next = !f;
                if (!next) setSupplierProductInput("");
                return next;
              })
            }
            className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-all duration-200 shadow-md shadow-slate-900/20"
          >
            {showSupplierForm ? "Cancel" : "Add Supplier"}
          </button>
        </motion.div>
        <AnimatePresence>
          {showSupplierForm && (
            <motion.div
              key="sup-form"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.22 }}
            >
              <SectionCard
                title="New Supplier"
                subtitle="Posts to Suppliers table"
              >
                <div className="p-5 grid grid-cols-3 gap-4">
                  {supplierFields.map(({ key, label, placeholder }) => (
                    <FormField key={key} label={label}>
                      <StyledInput
                        type="text"
                        value={(supplierForm[key] as string) ?? ""}
                        onChange={(v) =>
                          setSupplierForm((p) => ({
                            ...p,
                            [key]: v,
                          }))
                        }
                        placeholder={placeholder}
                      />
                    </FormField>
                  ))}
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                      Supplied Products
                      <span className="ml-1 text-slate-400 font-normal">
                        (optional - will auto-update from POs)
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50 min-h-[48px]">
                      {parseSupplierProducts(supplierForm.products_supplied).map(
                        (p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700"
                          >
                            {p}
                            <button
                              onClick={() => {
                                const updated = parseSupplierProducts(
                                  supplierForm.products_supplied,
                                )
                                  .filter((x) => x !== p)
                                  .join(", ");
                                setSupplierForm((prev) => ({
                                  ...prev,
                                  products_supplied: updated,
                                }));
                              }}
                              className="text-slate-300 hover:text-red-400 transition-colors ml-0.5"
                            >
                              {"\u00D7"}
                            </button>
                          </span>
                        ),
                      )}
                      <div className="relative min-w-[220px] flex-1">
                        <input
                          type="text"
                          value={supplierProductInput}
                          onChange={(e) => setSupplierProductInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addProductToSupplierForm(supplierProductInput);
                            }
                          }}
                          placeholder="Search or type item name"
                          className="w-full text-xs text-slate-700 bg-transparent border-none outline-none placeholder:text-slate-400"
                        />
                        {supplierProductSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-slate-200 bg-white shadow-lg z-10 overflow-hidden">
                            {supplierProductSuggestions.map((product) => (
                              <button
                                key={product.product_id}
                                type="button"
                                onClick={() =>
                                  addProductToSupplierForm(product.product_name)
                                }
                                className="w-full px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                              >
                                {product.product_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Search existing products as you type, or press Enter to add
                      a custom item. Products will also be added automatically
                      when you create POs for this supplier.
                    </p>
                  </div>
                  <div className="col-span-3 pt-1">
                    <Btn
                      onClick={addSupplier}
                      variant="primary"
                      loading={submitting}
                    >
                      {submitting ? "Saving..." : "Save Supplier"}
                    </Btn>
                  </div>
                </div>
              </SectionCard>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div variants={itemVariants}>
          <SectionCard
            title="Supplier Directory"
            subtitle={`${filteredSuppliers.length} supplier${filteredSuppliers.length === 1 ? "" : "s"} shown`}
          >
            <div className="px-4 pt-4">
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Search by company or supplied products..."
                className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    "Supplier ID",
                    "Company",
                    "Contact Number",
                    "Products Supplied",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="py-3 px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s, i) => (
                  <tr
                    key={s.supplier_id}
                    style={{
                      opacity: 0,
                      animation: `fadeInRow 0.28s ease forwards`,
                      animationDelay: `${i * 0.04}s`,
                    }}
                    className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-3.5 px-4 text-xs text-slate-400 font-mono">
                      #{s.supplier_id}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">
                        {s.supplier_name}
                      </p>
                      {s.email && (
                        <p className="text-xs text-slate-400">{s.email}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      {s.contact_number}
                    </td>
                    <td className="py-3.5 px-4">
                      {parseSupplierProducts(s.products_supplied).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {parseSupplierProducts(s.products_supplied).map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              {p}
                              <button
                                onClick={() =>
                                  handleRemoveSupplierProduct(s.supplier_id, p)
                                }
                                className="text-slate-300 hover:text-red-400 transition-colors ml-0.5"
                              >
                                x
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 italic">
                          No products yet
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setEditingSupplier(s)}
                          className="text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeSupplier(s.supplier_id)}
                          className="text-xs text-slate-300 hover:text-red-400 transition-colors font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSuppliers.length === 0 && (
              <EmptyState message="No suppliers found for this search." />
            )}
          </SectionCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800 text-sm">
                  Supplier Activity History
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Log of all supplier-related actions and changes
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search history..."
                  className="w-52 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <button
                  onClick={fetchSupplierHistory}
                  disabled={historyLoading}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${historyLoading ? "animate-spin" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
            {historyLoading ? (
              <div className="py-12 text-center text-sm text-slate-400 animate-pulse">
                Loading history{"\u2026"}
              </div>
            ) : filteredHistory.length === 0 ? (
              <EmptyState
                message={
                  historySearch || historyDateFrom || historyDateTo
                    ? "No history matches your filters."
                    : "No supplier activity recorded yet."
                }
              />
            ) : (
              <>
                <div className="hidden lg:grid grid-cols-[1.2fr_2fr_2.5fr_1.8fr_2fr] px-5 py-3 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  <span>Date & Time</span>
                  <span>Supplier</span>
                  <span>Action</span>
                  <span>Performed By</span>
                  <span>Details</span>
                </div>
                <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
                  {filteredHistory.map((h, i) => {
                    const al = h.action.toLowerCase();
                    const isAdd =
                      al.includes("add") ||
                      al.includes("creat") ||
                      al.includes("new");
                    const isRemove =
                      al.includes("remov") ||
                      al.includes("delet") ||
                      al.includes("cancel");
                    const isUpdate =
                      al.includes("updat") ||
                      al.includes("edit") ||
                      al.includes("modif") ||
                      al.includes("chang");
                    const actionStyle = isRemove
                      ? "bg-red-50 text-red-600 border-red-100"
                      : isAdd
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : isUpdate
                          ? "bg-blue-50 text-blue-600 border-blue-100"
                          : "bg-slate-50 text-slate-500 border-slate-100";
                    const dot = isRemove
                      ? "bg-red-400"
                      : isAdd
                        ? "bg-emerald-400"
                        : isUpdate
                          ? "bg-blue-400"
                          : "bg-slate-300";
                    const dt = new Date(h.created_at);
                    const dateStr = isNaN(dt.getTime())
                      ? h.created_at
                      : formatInSettingsTimezone(dt, undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                    const timeStr = isNaN(dt.getTime())
                      ? ""
                      : formatInSettingsTimezone(dt, undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        });
                    return (
                      <div
                        key={h.history_id}
                        style={{
                          opacity: 0,
                          animation: "fadeInRow 0.28s ease forwards",
                          animationDelay: `${i * 0.03}s`,
                        }}
                        className="hidden lg:grid grid-cols-[1.2fr_2fr_2.5fr_1.8fr_2fr] px-5 py-3.5 hover:bg-slate-50/70 transition-colors items-center"
                      >
                        <div>
                          <p className="text-xs font-medium text-slate-700">
                            {dateStr}
                          </p>
                          {timeStr && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {timeStr}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`}
                          />
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {h.supplier_name}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${actionStyle}`}
                        >
                          {h.action}
                        </span>
                        <p className="text-xs text-slate-500">
                          {h.performed_by ?? (
                            <span className="text-slate-300 italic">System</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {h.details ?? "\u2014"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between">
                  <p className="text-[11px] text-slate-400">
                    {filteredHistory.length} record
                    {filteredHistory.length !== 1 ? "s" : ""}
                    {(historySearch || historyDateFrom || historyDateTo) &&
                      " matching your filters"}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    {[
                      { dot: "bg-emerald-400", label: "Added" },
                      { dot: "bg-blue-400", label: "Updated" },
                      { dot: "bg-red-400", label: "Removed" },
                    ].map(({ dot, label }) => (
                      <span key={label} className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${dot}`} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
