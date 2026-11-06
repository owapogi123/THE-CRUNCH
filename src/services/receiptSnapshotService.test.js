"use strict";

const assert = require("node:assert/strict");
const { createReceiptSnapshot } = require("./receiptSnapshotService");

(async () => {
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (/SELECT Order_Date/i.test(sql)) return [[{ orderDate: "2026-11-06 10:00:00" }]];
      return [{ affectedRows: 1 }];
    },
  };
  const receipt = await createReceiptSnapshot(connection, {
    orderId: 7,
    transactionId: "TXN000000007",
    orderNumberValue: 7,
    orderType: "take-out",
    paymentMethod: "cash",
    subtotal: 100,
    total: 100,
    amountPaid: 100,
    soldToName: "Juan Dela Cruz",
    cashierName: "Cashier One",
    orderNote: "Extra spicy please\nKeep sauce separate",
    currency: "PHP",
    merchantName: "The Crunch",
    timezone: "Asia/Manila",
    items: [{ product_id: 1, name: "Meal", price: 100, qty: 1, subtotal: 100 }],
  });
  assert.deepEqual(receipt.customer, {
    soldTo: "Juan Dela Cruz",
  });
  assert.equal(receipt.cashierName, "Cashier One");
  assert.equal(receipt.orderNote, "Extra spicy please\nKeep sauce separate");
  const snapshotInsert = calls.find((call) => /INSERT INTO receipt_snapshots/i.test(call.sql));
  assert(snapshotInsert);
  assert.match(snapshotInsert.sql, /sold_to_name/i);
  assert.match(snapshotInsert.sql, /cashier_name/i);
  assert.doesNotMatch(
    snapshotInsert.sql,
    /customer_tin|customer_address|merchant_tin|merchant_registration_details/i,
  );
  assert.equal((snapshotInsert.sql.match(/\?/g) || []).length, snapshotInsert.params.length);
  assert.equal(snapshotInsert.params[19], "Juan Dela Cruz");
  assert.equal(snapshotInsert.params[22], "Extra spicy please\nKeep sauce separate");

  const walkInReceipt = await createReceiptSnapshot(connection, {
    orderId: 8,
    transactionId: "TXN000000008",
    orderNumberValue: 8,
    orderType: "dine-in",
    paymentMethod: "cash",
    subtotal: 100,
    total: 100,
    amountPaid: 100,
    cashierName: "Cashier One",
    orderNote: "Extra spicy please",
    currency: "PHP",
    merchantName: "The Crunch",
    timezone: "Asia/Manila",
    items: [{ product_id: 1, name: "Meal", price: 100, qty: 1, subtotal: 100 }],
  });
  assert.equal(walkInReceipt.customer.soldTo, null);
  assert.equal(walkInReceipt.orderNote, "Extra spicy please");
  console.log("Receipt snapshot customer identity tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
