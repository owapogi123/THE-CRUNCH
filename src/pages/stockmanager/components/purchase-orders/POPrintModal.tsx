import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { motion } from "framer-motion";
import { useState } from "react";
import { CloseBtn } from "../CloseBtn";
import type { PurchaseOrder } from "../../types/inventory";
import { fmtReceivedDate } from "../../utils/formatters";

export function POPrintModal({
  order,
  onClose,
}: {
  order: PurchaseOrder;
  onClose: () => void;
}) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const printElement = document.getElementById("po-print-content");
    if (!printElement) return;

    setDownloadingPdf(true);
    try {
      const canvas = await html2canvas(printElement, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const renderWidth = pageWidth - margin * 2;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;
      const boundedHeight = Math.min(renderHeight, pageHeight - margin * 2);

      pdf.addImage(
        imageData,
        "PNG",
        margin,
        margin,
        renderWidth,
        boundedHeight,
      );
      pdf.save(`purchase-order-${order.id}.pdf`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #po-print-content,
          #po-print-content * {
            visibility: visible;
          }
          #po-print-content {
            position: absolute;
            inset: 0;
            margin: 0;
            width: 100%;
            max-width: none;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              Print Purchase Order
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Printable order list for manual supplier sending
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-5">
          <div
            id="po-print-content"
            className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <div className="border-b border-slate-200 pb-6">
              <p className="text-2xl font-bold text-slate-900">
                Restaurant Stock System
              </p>
              <p className="text-sm text-slate-500 mt-1">Purchase Order</p>
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    PO Number
                  </p>
                  <p className="font-semibold text-slate-800 mt-1">
                    {order.id}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Status
                  </p>
                  <p className="font-semibold text-slate-800 mt-1">
                    {order.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Date Created
                  </p>
                  <p className="font-medium text-slate-700 mt-1">
                    {fmtReceivedDate(order.date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Expected Delivery Date
                  </p>
                  <p className="font-medium text-slate-700 mt-1">
                    {fmtReceivedDate(order.deliveryDate)}
                  </p>
                </div>
              </div>
            </div>

            <div className="py-6 border-b border-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Supplier
              </p>
              <p className="text-lg font-semibold text-slate-800 mt-2">
                {order.supplier}
              </p>
              <p className="text-sm text-slate-500 mt-1">{order.contact}</p>
            </div>

            <div className="py-6">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Item",
                        "Category",
                        "Qty",
                        "Unit",
                      ].map((header) => (
                        <th
                          key={header}
                          className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${
                            ["Item", "Category"].includes(header)
                              ? "text-left"
                              : "text-right"
                          }`}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {item.category}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {item.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {order.notes && (
              <div className="border-t border-slate-200 pt-5">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Notes
                </p>
                <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                  {order.notes}
                </p>
              </div>
            )}

            <div className="border-t border-slate-200 pt-5">
              <p className="text-xs italic text-slate-400">
                Ordered means the admin or inventory team manually sent this
                printed list to the supplier outside the system.
              </p>
              {order.status === "Received" &&
                (order.receiptNo || order.receivedBy || order.receivedDate) && (
                  <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900">
                    <p className="font-semibold">Receive Details</p>
                    <p className="mt-1">
                      Receipt No.: {order.receiptNo || "-"}
                    </p>
                    <p>Received By: {order.receivedBy || "-"}</p>
                    <p>
                      Received Date:{" "}
                      {order.receivedDate
                        ? fmtReceivedDate(order.receivedDate)
                        : "-"}
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {downloadingPdf ? "Preparing PDF..." : "Download PDF"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
