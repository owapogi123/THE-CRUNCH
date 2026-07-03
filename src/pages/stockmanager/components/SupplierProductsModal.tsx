import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CloseBtn } from "./CloseBtn";
import type { Product, Supplier } from "../types/inventory";
import { parseSupplierProducts } from "../utils/supplierUtils";

const isMenuFoodProduct = (p: Pick<Product, "item_type">) =>
  String(p.item_type ?? "")
    .trim()
    .toLowerCase() === "menu_item";

export function SupplierProductsModal({
  supplier,
  allProducts,
  loading,
  onClose,
  onSaveProducts,
  onRemoveProduct,
}: {
  supplier: Supplier;
  allProducts: Product[];
  loading: boolean;
  onClose: () => void;
  onSaveProducts: (supplier_id: number, products: string[]) => Promise<void>;
  onRemoveProduct: (supplier_id: number, product_name: string) => Promise<void>;
}) {
  const [productInput, setProductInput] = useState("");
  const [pendingProducts, setPendingProducts] = useState<string[]>([]);

  const existingProducts = useMemo(
    () => parseSupplierProducts(supplier.products_supplied),
    [supplier.products_supplied],
  );
  const combinedProducts = useMemo(
    () => [...new Set([...existingProducts, ...pendingProducts])],
    [existingProducts, pendingProducts],
  );
  const suggestions = useMemo(() => {
    const query = productInput.trim().toLowerCase();
    const selected = new Set(
      combinedProducts.map((item) => item.toLowerCase()),
    );

    return allProducts
      .filter((product) => !isMenuFoodProduct(product))
      .filter((product) => !selected.has(product.product_name.toLowerCase()))
      .filter((product) =>
        query ? product.product_name.toLowerCase().includes(query) : false,
      )
      .slice(0, 6);
  }, [allProducts, combinedProducts, productInput]);

  const addProduct = (productName: string) => {
    const trimmedProduct = productName.trim();
    if (!trimmedProduct) return;

    const exists = combinedProducts.some(
      (item) => item.toLowerCase() === trimmedProduct.toLowerCase(),
    );
    if (exists) {
      setProductInput("");
      return;
    }

    setPendingProducts((prev) => [...prev, trimmedProduct]);
    setProductInput("");
  };

  const removePendingProduct = (productName: string) => {
    setPendingProducts((prev) =>
      prev.filter((item) => item.toLowerCase() !== productName.toLowerCase()),
    );
  };

  const handleSave = async () => {
    if (pendingProducts.length === 0) {
      onClose();
      return;
    }
    await onSaveProducts(supplier.supplier_id, pendingProducts);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800">Edit Supplier</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage supplied products for {supplier.supplier_name}.
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              {supplier.supplier_name}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {supplier.contact_number}
              {supplier.email ? ` - ${supplier.email}` : ""}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              Products Supplied
            </label>
            <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50 min-h-[56px]">
              {combinedProducts.length > 0 ? (
                combinedProducts.map((product) => {
                  const isPending = pendingProducts.some(
                    (item) => item.toLowerCase() === product.toLowerCase(),
                  );

                  return (
                    <span
                      key={product}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700"
                    >
                      {product}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          isPending
                            ? removePendingProduct(product)
                            : onRemoveProduct(supplier.supplier_id, product)
                        }
                        className="text-slate-300 hover:text-red-400 transition-colors ml-0.5 disabled:opacity-40"
                        title={
                          isPending
                            ? "Remove unsaved product"
                            : "Remove existing supplied product"
                        }
                      >
                        x
                      </button>
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-slate-300 italic">
                  No products yet
                </span>
              )}
              <div className="relative min-w-[220px] flex-1">
                <input
                  type="text"
                  value={productInput}
                  onChange={(e) => setProductInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addProduct(productInput);
                    }
                  }}
                  placeholder="Search or type item name"
                  className="w-full text-xs text-slate-700 bg-transparent border-none outline-none placeholder:text-slate-400"
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-slate-200 bg-white shadow-lg z-10 overflow-hidden">
                    {suggestions.map((product) => (
                      <button
                        key={product.product_id}
                        type="button"
                        onClick={() => addProduct(product.product_name)}
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
              Existing products stay attached unless you remove them. New ones
              are merged into the supplier when you save.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Products"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
