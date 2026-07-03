import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "../services/api";
import type { POStatus, Product, PurchaseOrder, Supplier } from "../types/inventory";
import { isDateInRange } from "../utils/dateUtils";
import { mergeSupplierProducts } from "../utils/supplierUtils";

const PO_HISTORY_PAGE_SIZE = 10;

type ToastFn = (message: string, type: "success" | "error") => void;
type NotifyFn = (notification: {
  id: string;
  label: string;
  type: "success" | "error";
}) => void;
export type POPrefillProduct =
  | { name: string; category: string; unit: string; supplier: string }
  | null
  | undefined;

type UsePurchaseOrdersParams = {
  criticalStock: Product[];
  lowStock: Product[];
  suppliers: Supplier[];
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  refreshInventory: () => Promise<void>;
  showToast: ToastFn;
  addNotification: NotifyFn;
};

export function usePurchaseOrders({
  criticalStock,
  lowStock,
  suppliers,
  setSuppliers,
  refreshInventory,
  showToast,
  addNotification,
}: UsePurchaseOrdersParams) {
  const [poOrders, setPoOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [printOrder, setPrintOrder] = useState<PurchaseOrder | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(
    null,
  );
  const [poFilterStatus, setPoFilterStatus] = useState<POStatus | "All">("All");
  const [poLoading, setPoLoading] = useState(false);
  const [poHistoryDateFrom, setPoHistoryDateFrom] = useState("");
  const [poHistoryDateTo, setPoHistoryDateTo] = useState("");
  const [poHistoryPage, setPoHistoryPage] = useState(1);
  const poHistoryFromInputRef = useRef<HTMLInputElement | null>(null);
  const poHistoryToInputRef = useRef<HTMLInputElement | null>(null);
  const [prefillPOProduct, setPrefillPOProduct] =
    useState<POPrefillProduct>(undefined);

  const fetchPurchaseOrders = useCallback(async () => {
    setPoLoading(true);
    try {
      const orders = await api.po.getAll();
      setPoOrders(orders);
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Failed to load purchase orders.",
        "error",
      );
    } finally {
      setPoLoading(false);
    }
  }, [showToast]);

  const handleOrderNow = useCallback((product: Product) => {
    setPrefillPOProduct({
      name: product.product_name,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier_name ?? "",
    });
  }, []);

  const handleClosePOModal = useCallback(() => {
    setPrefillPOProduct(undefined);
  }, []);

  const poQuickOrderProducts = useMemo(() => {
    const m = new Map<number, Product>();
    [...criticalStock, ...lowStock].forEach((p) => {
      if (!m.has(p.product_id)) m.set(p.product_id, p);
    });
    return Array.from(m.values());
  }, [criticalStock, lowStock]);

  const filteredPOs = useMemo(
    () =>
      poFilterStatus === "All"
        ? poOrders.filter((o) => o.status !== "Received")
        : poOrders.filter((o) => o.status === poFilterStatus),
    [poOrders, poFilterStatus],
  );
  const completedPOs = useMemo(
    () => poOrders.filter((o) => o.status === "Received"),
    [poOrders],
  );
  const filteredCompletedPOs = useMemo(
    () =>
      completedPOs.filter((o) =>
        isDateInRange(o.receivedDate, poHistoryDateFrom, poHistoryDateTo),
      ),
    [completedPOs, poHistoryDateFrom, poHistoryDateTo],
  );
  const poHistoryTotalPages = Math.max(
    1,
    Math.ceil(filteredCompletedPOs.length / PO_HISTORY_PAGE_SIZE),
  );
  const paginatedCompletedPOs = useMemo(() => {
    const start = (poHistoryPage - 1) * PO_HISTORY_PAGE_SIZE;
    return filteredCompletedPOs.slice(start, start + PO_HISTORY_PAGE_SIZE);
  }, [filteredCompletedPOs, poHistoryPage]);

  useEffect(() => {
    void fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  useEffect(() => {
    setPoHistoryPage(1);
  }, [poHistoryDateFrom, poHistoryDateTo]);

  useEffect(() => {
    setPoHistoryPage((current) => Math.min(current, poHistoryTotalPages));
  }, [poHistoryTotalPages]);

  const handlePOStatusChange = useCallback(
    async (id: string, status: POStatus) => {
      if (status === "Received") {
        const order = poOrders.find((o) => o.id === id);
        if (!order) {
          showToast("Purchase order not found.", "error");
          return;
        }
        setReceivingOrder(order);
        setSelectedOrder(null);
        return;
      }
      setPoLoading(true);
      try {
        const updated = await api.po.updateStatus(id, status);
        setPoOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
        setSelectedOrder((prev) => (prev?.id === id ? updated : prev));
        showToast(`Purchase order moved to ${status}.`, "success");
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Failed to update purchase order status.",
          "error",
        );
      } finally {
        setPoLoading(false);
      }
    },
    [poOrders, showToast],
  );

  const handlePODelete = useCallback(
    async (id: string) => {
      setPoLoading(true);
      try {
        await api.po.delete(id);
        setPoOrders((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, status: "Cancelled" as POStatus } : o,
          ),
        );
        setSelectedOrder((prev) =>
          prev?.id === id ? { ...prev, status: "Cancelled" as POStatus } : prev,
        );
        showToast("Purchase order cancelled.", "success");
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Failed to cancel order.",
          "error",
        );
      } finally {
        setPoLoading(false);
      }
    },
    [showToast],
  );

  const handleConfirmReceivePO = useCallback(
    async ({
      receiptNo,
      receivedBy,
      itemExpiryDates,
      itemShelfLife,
    }: {
      receiptNo: string;
      receivedBy: string;
      itemExpiryDates: Record<number, string>;
      itemShelfLife: Record<
        number,
        { shelfLifeDays?: number | null; shelfLifeHours?: number | null }
      >;
    }) => {
      if (!receivingOrder) return;
      setPoLoading(true);
      try {
        const updated = await api.po.markReceived(
          receivingOrder.id,
          receiptNo,
          receivedBy,
          itemExpiryDates,
          itemShelfLife,
        );
        setPoOrders((prev) =>
          prev.map((o) => (o.id === receivingOrder.id ? updated : o)),
        );
        setSelectedOrder((prev) =>
          prev?.id === receivingOrder.id ? updated : prev,
        );
        setReceivingOrder(null);
        await refreshInventory();
        showToast(
          "Purchase order received and stock batches added.",
          "success",
        );
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Failed to receive purchase order.",
          "error",
        );
      } finally {
        setPoLoading(false);
      }
    },
    [receivingOrder, refreshInventory, showToast],
  );

  const handlePOCreate = useCallback(
    async (
      po: Omit<PurchaseOrder, "id">,
      meta: { supplierId: number; itemNames: string[] },
    ) => {
      setPoLoading(true);
      try {
        const created = await api.po.create(po);
        setPoOrders((prev) => [created, ...prev]);
        const matchedSupplier = suppliers.find(
          (s) => s.supplier_id === meta.supplierId,
        );

        if (matchedSupplier) {
          const incomingNames = meta.itemNames;

          if (incomingNames.length > 0) {
            setSuppliers((prev) =>
              prev.map((s) =>
                s.supplier_id === matchedSupplier.supplier_id
                  ? {
                      ...s,
                      products_supplied: mergeSupplierProducts(
                        s.products_supplied ?? "",
                        incomingNames,
                      ),
                    }
                  : s,
              ),
            );
          }

          try {
            if (incomingNames.length > 0) {
              await api.mergeSupplierProducts(
                matchedSupplier.supplier_id,
                incomingNames,
              );
            }

            const refreshedSuppliers = await api.getSuppliers();
            setSuppliers(refreshedSuppliers);
          } catch (mergeErr) {
            console.error("Failed to merge supplier products:", mergeErr);
            showToast(
              "Purchase order saved, but supplier products did not sync.",
              "error",
            );
          }
        }

        showToast("Purchase order created.", "success");

        // Notify admin of new purchase order
        addNotification({
          id: crypto.randomUUID(),
          label: `New purchase order submitted: ${created.id}`,
          type: "success",
        });
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : "Failed to create purchase order.",
          "error",
        );
        throw err;
      } finally {
        setPoLoading(false);
      }
    },
    [addNotification, showToast, suppliers, setSuppliers],
  );

  return {
    poOrders,
    selectedOrder,
    printOrder,
    receivingOrder,
    poFilterStatus,
    poLoading,
    poHistoryDateFrom,
    poHistoryDateTo,
    poHistoryPage,
    poHistoryFromInputRef,
    poHistoryToInputRef,
    prefillPOProduct,
    poQuickOrderProducts,
    filteredPOs,
    completedPOs,
    filteredCompletedPOs,
    paginatedCompletedPOs,
    poHistoryTotalPages,
    poHistoryPageSize: PO_HISTORY_PAGE_SIZE,
    fetchPurchaseOrders,
    handleOrderNow,
    handleClosePOModal,
    handlePOStatusChange,
    handlePODelete,
    handleConfirmReceivePO,
    handlePOCreate,
    setSelectedOrder,
    setPrintOrder,
    setReceivingOrder,
    setPoFilterStatus,
    setPoHistoryDateFrom,
    setPoHistoryDateTo,
    setPoHistoryPage,
    setPrefillPOProduct,
  };
}
