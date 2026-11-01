const DIRECT_STOCK_QUANTITY_FIELDS = new Set([
  "stock",
  "quantity",
  "mainstock",
  "currentstock",
  "availablestock",
  "onhand",
  "stockonhand",
  "inventoryquantity",
  "remainingquantity",
  "remainingqty",
  "dailywithdrawn",
  "returned",
  "wasted",
]);

function normalizeFieldName(fieldName) {
  return String(fieldName).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function findDirectStockQuantityFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];

  return Object.keys(body).filter((fieldName) =>
    DIRECT_STOCK_QUANTITY_FIELDS.has(normalizeFieldName(fieldName)),
  );
}

function directStockUpdateResponse(fields) {
  return {
    code: "DIRECT_STOCK_UPDATE_NOT_ALLOWED",
    message:
      "Direct stock quantity updates are not allowed through this endpoint. Use an authorized stock movement workflow.",
    fields,
  };
}

function stockReceiptRequiresPurchaseOrderResponse() {
  return {
    code: "STOCK_RECEIPT_REQUIRES_PURCHASE_ORDER",
    message:
      "Direct stock receiving is not allowed through this endpoint. Receive inventory through an approved purchase order.",
  };
}

module.exports = {
  directStockUpdateResponse,
  findDirectStockQuantityFields,
  stockReceiptRequiresPurchaseOrderResponse,
};
