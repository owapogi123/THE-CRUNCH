import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "../services/api";
import type { Product, Supplier, SupplierHistory, Tab } from "../types/inventory";
import { isDateInRange } from "../utils/dateUtils";
import { parseSupplierProducts } from "../utils/supplierUtils";

const BLANK_SUPPLIER: Omit<Supplier, "supplier_id"> = {
  supplier_name: "",
  contact_number: "",
  product_id: 0,
  email: "",
  products_supplied: "",
};

const SUPPLIER_FIELDS: {
  key: keyof Omit<Supplier, "supplier_id">;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "supplier_name",
    label: "Company Name",
    placeholder: "e.g. FreshMill Co.",
  },
  { key: "email", label: "Email Address", placeholder: "e.g. juan@company.ph" },
  {
    key: "contact_number",
    label: "Phone Number",
    placeholder: "e.g. 0917-123-4567",
  },
];

type ToastFn = (message: string, type: "success" | "error") => void;

type UseSuppliersParams = {
  products: Product[];
  tab: Tab;
  showToast: ToastFn;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  isMenuFoodProduct: (product: Pick<Product, "item_type">) => boolean;
};

export function useSuppliers({
  products,
  tab,
  showToast,
  setSubmitting,
  isMenuFoodProduct,
}: UseSuppliersParams) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierHistory, setSupplierHistory] = useState<SupplierHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] =
    useState<Omit<Supplier, "supplier_id">>(BLANK_SUPPLIER);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierProductInput, setSupplierProductInput] = useState("");

  const fetchSuppliers = useCallback(async () => {
    const data = await api.getSuppliers();
    setSuppliers(data);
    return data;
  }, []);

  const fetchSupplierHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await api.getSupplierHistory();
      setSupplierHistory(data);
    } catch {
      /* non-critical */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "suppliers") fetchSupplierHistory();
  }, [tab, fetchSupplierHistory]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return !q
      ? suppliers
      : suppliers.filter(
          (s) =>
            s.supplier_name.toLowerCase().includes(q) ||
            (s.products_supplied ?? "").toLowerCase().includes(q),
        );
  }, [suppliers, supplierSearch]);

  const supplierProductSuggestions = useMemo(() => {
    const q = supplierProductInput.trim().toLowerCase();
    const existing = new Set(
      parseSupplierProducts(supplierForm.products_supplied).map((item) =>
        item.toLowerCase(),
      ),
    );

    return products
      .filter((product) => !isMenuFoodProduct(product))
      .filter((product) => !existing.has(product.product_name.toLowerCase()))
      .filter((product) =>
        q ? product.product_name.toLowerCase().includes(q) : false,
      )
      .slice(0, 6);
  }, [
    products,
    supplierForm.products_supplied,
    supplierProductInput,
    isMenuFoodProduct,
  ]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return supplierHistory.filter((h) => {
      const matchesSearch =
        !q ||
        h.supplier_name.toLowerCase().includes(q) ||
        h.action.toLowerCase().includes(q) ||
        (h.details ?? "").toLowerCase().includes(q) ||
        (h.performed_by ?? "").toLowerCase().includes(q);
      const matchesDate = isDateInRange(
        h.created_at,
        historyDateFrom,
        historyDateTo,
      );
      return matchesSearch && matchesDate;
    });
  }, [supplierHistory, historySearch, historyDateFrom, historyDateTo]);

  async function addSupplier() {
    if (!supplierForm.supplier_name.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.postSupplier(supplierForm);
      setSuppliers((prev) => [...prev, created]);
      setSupplierForm(BLANK_SUPPLIER);
      setSupplierProductInput("");
      setShowSupplierForm(false);
      showToast("Supplier added successfully!", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to add supplier.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function addProductToSupplierForm(productName: string) {
    const trimmedProduct = productName.trim();
    if (!trimmedProduct) return;

    const existing = parseSupplierProducts(supplierForm.products_supplied);
    const exists = existing.some(
      (item) => item.toLowerCase() === trimmedProduct.toLowerCase(),
    );
    if (exists) {
      setSupplierProductInput("");
      return;
    }

    setSupplierForm((prev) => ({
      ...prev,
      products_supplied: [...existing, trimmedProduct].join(", "),
    }));
    setSupplierProductInput("");
  }

  async function removeSupplier(id: number) {
    try {
      await api.deleteSupplier(id);
      setSuppliers((prev) => prev.filter((s) => s.supplier_id !== id));
      showToast("Supplier removed.", "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to remove supplier.",
        "error",
      );
    }
  }

  async function saveSupplierProducts(
    supplier_id: number,
    incomingProducts: string[],
  ) {
    if (incomingProducts.length === 0) {
      setEditingSupplier(null);
      return;
    }

    setSubmitting(true);
    try {
      const updated = await api.mergeSupplierProducts(
        supplier_id,
        incomingProducts,
      );
      setSuppliers((prev) =>
        prev.map((supplier) =>
          supplier.supplier_id === supplier_id ? updated : supplier,
        ),
      );
      setEditingSupplier(updated);
      showToast("Supplier products updated.", "success");
      fetchSupplierHistory();
      setEditingSupplier(null);
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Failed to update supplier products.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveSupplierProduct(
    supplier_id: number,
    product_name: string,
  ) {
    setSubmitting(true);
    try {
      const updated = await api.removeSupplierProduct(
        supplier_id,
        product_name,
      );
      setSuppliers((prev) =>
        prev.map((supplier) =>
          supplier.supplier_id === supplier_id ? updated : supplier,
        ),
      );
      setEditingSupplier((current) =>
        current?.supplier_id === supplier_id ? updated : current,
      );
      showToast(`Removed ${product_name} from supplier products.`, "success");
      fetchSupplierHistory();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to remove product.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return {
    suppliers,
    setSuppliers,
    supplierSearch,
    supplierHistory,
    historyLoading,
    historySearch,
    historyDateFrom,
    historyDateTo,
    showSupplierForm,
    supplierForm,
    editingSupplier,
    supplierProductInput,
    filteredSuppliers,
    supplierProductSuggestions,
    filteredHistory,
    supplierFields: SUPPLIER_FIELDS,
    fetchSuppliers,
    fetchSupplierHistory,
    addSupplier,
    addProductToSupplierForm,
    removeSupplier,
    saveSupplierProducts,
    handleRemoveSupplierProduct,
    setSupplierSearch,
    setHistorySearch,
    setHistoryDateFrom,
    setHistoryDateTo,
    setShowSupplierForm,
    setSupplierForm,
    setEditingSupplier,
    setSupplierProductInput,
  };
}
