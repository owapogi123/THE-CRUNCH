const {
  formatOrderNumber,
  formatTransactionId,
} = require("./orderIdentifierService");

const MAX_NOTE_LENGTH = 2000;

function cleanText(value, maxLength = MAX_NOTE_LENGTH) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectOrderItemNotes(items) {
  const notes = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const productId = Number(item?.product_id ?? item?.productId ?? item?.id);
    const note = cleanText(item?.note ?? item?.notes ?? item?.modifier);
    if (!Number.isSafeInteger(productId) || productId <= 0 || !note) continue;
    const existing = notes.get(productId);
    if (!existing) notes.set(productId, note);
    else if (!existing.split("; ").includes(note)) {
      notes.set(productId, `${existing}; ${note}`.slice(0, MAX_NOTE_LENGTH));
    }
  }
  return notes;
}

function snapshotDtoFromValues(values) {
  return {
    id: Number(values.orderId),
    transactionId: formatTransactionId(values.transactionId),
    orderNumber: formatOrderNumber(values.orderNumberValue, values.orderId),
    orderDate: values.orderDate,
    orderType: values.orderType,
    currentStatus: values.currentStatus || null,
    currentPaymentStatus: values.currentPaymentStatus || null,
    items: values.items.map((item) => ({
      productName: String(item.productName ?? item.name ?? ""),
      quantity: Number(item.quantity ?? item.qty),
      unitPrice: money(item.unitPrice ?? item.price),
      subtotal: money(item.subtotal),
      note: cleanText(item.note),
    })),
    subtotal: money(values.subtotal),
    discount: {
      name: cleanText(values.discountName, 100),
      rate: numeric(values.discountRate),
      amount: money(values.discountAmount),
    },
    tax: {
      rate: numeric(values.taxRate),
      amount: money(values.taxAmount),
    },
    serviceCharge: {
      rate: numeric(values.serviceChargeRate),
      amount: money(values.serviceChargeAmount),
    },
    total: money(values.total),
    paymentMethod: values.paymentMethod || null,
    amountPaid: money(values.amountPaid),
    cashTendered: money(values.cashTendered),
    change: money(values.changeAmount),
    customerType: cleanText(values.customerType, 100),
    tableNumber: cleanText(values.tableNumber, 50),
    orderNote: cleanText(values.orderNote),
    currency: cleanText(values.currency, 12),
    merchant: {
      name: cleanText(values.merchantName, 150),
      tagline: cleanText(values.merchantTagline, 255),
      email: cleanText(values.merchantEmail, 150),
      phone: cleanText(values.merchantPhone, 100),
      address: cleanText(values.merchantAddress, 500),
      timezone: cleanText(values.timezone, 100),
    },
    isLegacyReceipt: false,
    usesCurrentProductNameFallback: false,
    missingHistoricalFields: [],
  };
}

async function createReceiptSnapshot(connection, values) {
  const [dateRows] = await connection.query(
    "SELECT Order_Date AS orderDate FROM orders WHERE Order_ID = ? LIMIT 1",
    [values.orderId],
  );
  if (!dateRows.length) throw new Error("Cannot snapshot a missing order");
  const orderDate = dateRows[0].orderDate;

  await connection.query(
    `INSERT INTO receipt_snapshots
       (order_id, transaction_id, order_number, order_date, order_type,
        payment_method, subtotal, discount_name, discount_rate,
        discount_amount, tax_rate, tax_amount, service_charge_rate,
        service_charge_amount, total, amount_paid, cash_tendered,
        change_amount, customer_type, table_number, order_note, currency,
        merchant_name, merchant_tagline, merchant_email, merchant_phone,
        merchant_address, timezone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      values.orderId,
      values.transactionId,
      values.orderNumberValue,
      orderDate,
      values.orderType,
      values.paymentMethod,
      money(values.subtotal),
      cleanText(values.discountName, 100),
      numeric(values.discountRate) ?? 0,
      money(values.discountAmount) ?? 0,
      numeric(values.taxRate) ?? 0,
      money(values.taxAmount) ?? 0,
      numeric(values.serviceChargeRate) ?? 0,
      money(values.serviceChargeAmount) ?? 0,
      money(values.total),
      money(values.amountPaid) ?? 0,
      money(values.cashTendered),
      money(values.changeAmount),
      cleanText(values.customerType, 100),
      cleanText(values.tableNumber, 50),
      cleanText(values.orderNote),
      cleanText(values.currency, 12) || "PHP",
      cleanText(values.merchantName, 150) || "The Crunch",
      cleanText(values.merchantTagline, 255),
      cleanText(values.merchantEmail, 150),
      cleanText(values.merchantPhone, 100),
      cleanText(values.merchantAddress, 500),
      cleanText(values.timezone, 100) || "Asia/Manila",
    ],
  );

  if (!Array.isArray(values.items) || values.items.length === 0) {
    throw new Error("A receipt snapshot requires at least one item");
  }
  const itemPlaceholders = values.items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const itemParameters = values.items.flatMap((item, index) => [
    values.orderId,
    item.product_id,
    String(item.name || `Product #${item.product_id}`).slice(0, 255),
    money(item.price),
    Number(item.qty),
    money(item.subtotal),
    cleanText(item.note),
    index,
  ]);
  await connection.query(
    `INSERT INTO receipt_snapshot_items
       (order_id, original_product_id, product_name, unit_price, quantity,
        line_subtotal, item_note, sort_order)
     VALUES ${itemPlaceholders}`,
    itemParameters,
  );

  return snapshotDtoFromValues({ ...values, orderDate });
}

function snapshotDtoFromRows(rows) {
  const header = rows[0];
  return snapshotDtoFromValues({
    orderId: header.orderId,
    transactionId: header.transactionId,
    orderNumberValue: header.orderNumberValue,
    orderDate: header.orderDate,
    orderType: header.orderType,
    currentStatus: header.currentStatus,
    currentPaymentStatus: header.currentPaymentStatus,
    items: rows
      .filter((row) => row.receiptItemId != null)
      .map((row) => ({
        productName: row.productName,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        subtotal: row.lineSubtotal,
        note: row.itemNote,
      })),
    subtotal: header.subtotal,
    discountName: header.discountName,
    discountRate: header.discountRate,
    discountAmount: header.discountAmount,
    taxRate: header.taxRate,
    taxAmount: header.taxAmount,
    serviceChargeRate: header.serviceChargeRate,
    serviceChargeAmount: header.serviceChargeAmount,
    total: header.total,
    paymentMethod: header.paymentMethod,
    amountPaid: header.amountPaid,
    cashTendered: header.cashTendered,
    changeAmount: header.changeAmount,
    customerType: header.customerType,
    tableNumber: header.tableNumber,
    orderNote: header.orderNote,
    currency: header.currency,
    merchantName: header.merchantName,
    merchantTagline: header.merchantTagline,
    merchantEmail: header.merchantEmail,
    merchantPhone: header.merchantPhone,
    merchantAddress: header.merchantAddress,
    timezone: header.timezone,
  });
}

async function loadSnapshotReceipt(connection, orderId) {
  const [rows] = await connection.query(
    `SELECT
       s.order_id AS orderId,
       s.transaction_id AS transactionId,
       s.order_number AS orderNumberValue,
       s.order_date AS orderDate,
       s.order_type AS orderType,
       s.payment_method AS paymentMethod,
       s.subtotal,
       s.discount_name AS discountName,
       s.discount_rate AS discountRate,
       s.discount_amount AS discountAmount,
       s.tax_rate AS taxRate,
       s.tax_amount AS taxAmount,
       s.service_charge_rate AS serviceChargeRate,
       s.service_charge_amount AS serviceChargeAmount,
       s.total,
       s.amount_paid AS amountPaid,
       s.cash_tendered AS cashTendered,
       s.change_amount AS changeAmount,
       s.customer_type AS customerType,
       s.table_number AS tableNumber,
       s.order_note AS orderNote,
       s.currency,
       s.merchant_name AS merchantName,
       s.merchant_tagline AS merchantTagline,
       s.merchant_email AS merchantEmail,
       s.merchant_phone AS merchantPhone,
       s.merchant_address AS merchantAddress,
       s.timezone,
       o.Status AS currentStatus,
       o.payment_status AS currentPaymentStatus,
       i.receipt_item_id AS receiptItemId,
       i.product_name AS productName,
       i.unit_price AS unitPrice,
       i.quantity,
       i.line_subtotal AS lineSubtotal,
       i.item_note AS itemNote
     FROM receipt_snapshots s
     JOIN orders o ON o.Order_ID = s.order_id
     LEFT JOIN receipt_snapshot_items i ON i.order_id = s.order_id
     WHERE s.order_id = ?
     ORDER BY i.sort_order, i.receipt_item_id`,
    [orderId],
  );
  return rows.length ? snapshotDtoFromRows(rows) : null;
}

async function loadLegacyReceipt(connection, orderId) {
  const [rows] = await connection.query(
    `SELECT
       o.Order_ID AS orderId,
       o.transaction_id AS transactionId,
       o.order_number AS orderNumberValue,
       o.Order_Date AS orderDate,
       o.Order_Type AS orderType,
       o.Status AS currentStatus,
       o.payment_status AS currentPaymentStatus,
       o.Total_Amount AS total,
       COALESCE(o.payment_method, payment.Payment_Type) AS paymentMethod,
       oi.Order_Item_ID AS orderItemId,
       oi.Quantity AS quantity,
       oi.Subtotal AS lineSubtotal,
       COALESCE(NULLIF(TRIM(m.Product_Name), ''), NULLIF(TRIM(pr.name), '')) AS currentProductName
     FROM orders o
     LEFT JOIN order_item oi ON oi.Order_ID = o.Order_ID
     LEFT JOIN Menu m ON m.Product_ID = oi.Product_ID
     LEFT JOIN products pr ON pr.id = oi.Product_ID
     LEFT JOIN (
       SELECT p1.Order_ID, p1.Payment_Type
       FROM payments p1
       INNER JOIN (
         SELECT Order_ID, MAX(Payment_ID) AS maxPaymentId
         FROM payments
         GROUP BY Order_ID
       ) latest ON latest.maxPaymentId = p1.Payment_ID
     ) payment ON payment.Order_ID = o.Order_ID
     WHERE o.Order_ID = ?
     ORDER BY oi.Order_Item_ID`,
    [orderId],
  );
  if (!rows.length) return null;

  const header = rows[0];
  const items = rows
    .filter((row) => row.orderItemId != null)
    .map((row) => {
      const quantity = Number(row.quantity);
      const lineSubtotal = money(row.lineSubtotal);
      return {
        productName: cleanText(row.currentProductName, 255) || "Historical product name unavailable",
        quantity,
        unitPrice:
          Number.isFinite(quantity) && quantity > 0 && lineSubtotal !== null
            ? money(lineSubtotal / quantity)
            : null,
        subtotal: lineSubtotal,
        note: null,
      };
    });
  const supportedSubtotal = items.length > 0 && items.every((item) => item.subtotal !== null)
    ? money(items.reduce((sum, item) => sum + item.subtotal, 0))
    : null;

  return {
    id: Number(header.orderId),
    transactionId: formatTransactionId(header.transactionId),
    orderNumber: formatOrderNumber(header.orderNumberValue, header.orderId),
    orderDate: header.orderDate,
    orderType: header.orderType || null,
    currentStatus: header.currentStatus || null,
    currentPaymentStatus: header.currentPaymentStatus || null,
    items,
    subtotal: supportedSubtotal,
    discount: { name: null, rate: null, amount: null },
    tax: { rate: null, amount: null },
    serviceCharge: { rate: null, amount: null },
    total: money(header.total),
    paymentMethod: header.paymentMethod || null,
    amountPaid: null,
    cashTendered: null,
    change: null,
    customerType: null,
    tableNumber: null,
    orderNote: null,
    currency: null,
    merchant: {
      name: null,
      tagline: null,
      email: null,
      phone: null,
      address: null,
      timezone: "Asia/Manila",
    },
    isLegacyReceipt: true,
    usesCurrentProductNameFallback: items.some(
      (item) => item.productName !== "Historical product name unavailable",
    ),
    missingHistoricalFields: [
      "authoritativeProductName",
      "itemNotes",
      "discount",
      "tax",
      "serviceCharge",
      "amountPaid",
      "cashTendered",
      "change",
      "customerType",
      "tableNumber",
      "orderNote",
      "currency",
      "merchantDetails",
    ],
  };
}

async function loadReceiptDto(connection, orderId) {
  const snapshot = await loadSnapshotReceipt(connection, orderId);
  return snapshot || loadLegacyReceipt(connection, orderId);
}

module.exports = {
  collectOrderItemNotes,
  createReceiptSnapshot,
  loadReceiptDto,
};
