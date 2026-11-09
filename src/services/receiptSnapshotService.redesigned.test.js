"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const { createReceiptSnapshot, loadReceiptDto } = require("./receiptSnapshotService");

(async () => {
  const sqlSeen = [];
  const connection = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      sqlSeen.push(normalized);
      if (normalized.startsWith("SELECT created_at AS orderDate")) {
        return [[{ orderDate: new Date("2026-11-09T01:00:00Z") }]];
      }
      if (normalized.startsWith("SELECT s.order_id AS orderId")) {
        return [[{
          orderId: 12,
          transactionId: "100110926001",
          orderNumberValue: 1001,
          orderDate: new Date("2026-11-09T01:00:00Z"),
          orderType: "dine-in",
          paymentMethod: "Cash",
          subtotal: 100,
          discountName: null,
          discountRate: 0,
          discountAmount: 0,
          taxRate: 0,
          taxAmount: 0,
          serviceChargeRate: 0,
          serviceChargeAmount: 0,
          total: 100,
          amountPaid: 100,
          cashTendered: 100,
          changeAmount: 0,
          customerType: null,
          soldToName: null,
          cashierName: "Cashier",
          tableNumber: null,
          orderNote: null,
          currency: "PHP",
          merchantName: "The Crunch",
          merchantTagline: null,
          merchantEmail: null,
          merchantPhone: null,
          merchantAddress: null,
          timezone: "Asia/Manila",
          currentStatus: "Queued",
          currentPaymentStatus: "Paid",
          receiptItemId: 1,
          productName: "1PCS Chicken",
          selectedFlavorProductId: 20,
          selectedFlavorName: "Dynamic Flavor",
          unitPrice: 100,
          quantity: 1,
          lineSubtotal: 100,
          itemNote: null,
        }]];
      }
      return [{ affectedRows: 1 }];
    },
  };

  const created = await createReceiptSnapshot(connection, {
    orderId: 12,
    transactionId: "100110926001",
    orderNumberValue: 1001,
    orderType: "dine-in",
    currentStatus: "Queued",
    currentPaymentStatus: "Paid",
    paymentMethod: "Cash",
    subtotal: 100,
    discountRate: 0,
    discountAmount: 0,
    taxRate: 0,
    taxAmount: 0,
    serviceChargeRate: 0,
    serviceChargeAmount: 0,
    total: 100,
    amountPaid: 100,
    cashTendered: 100,
    changeAmount: 0,
    currency: "PHP",
    merchantName: "The Crunch",
    timezone: "Asia/Manila",
    items: [{
      product_id: 10,
      name: "1PCS Chicken",
      price: 100,
      qty: 1,
      subtotal: 100,
      selected_flavor_product_id: 20,
      selected_flavor_name: "Dynamic Flavor",
    }],
  });
  assert.equal(created.items[0].selectedFlavorName, "Dynamic Flavor");
  const loaded = await loadReceiptDto(connection, 12);
  assert.equal(loaded.currentStatus, "Queued");
  assert.equal(loaded.items[0].selectedFlavorProductId, 20);
  assert.ok(sqlSeen.some((sql) => sql.includes("o.status AS currentStatus")));
  assert.ok(sqlSeen.some((sql) => sql.includes("o.order_id = s.order_id")));
  assert.ok(sqlSeen.some((sql) => sql.includes("i.selected_option_product_id")));
  assert.ok(
    sqlSeen.some(
      (sql) =>
        sql.includes("INSERT INTO receipt_snapshot_items") &&
        sql.includes("selected_option_product_id") &&
        sql.includes("selected_option_name") &&
        !sql.includes("selected_flavor_product_id"),
    ),
  );
  assert.ok(sqlSeen.every((sql) => !sql.includes("orders.Order_ID")));

  console.log("Redesigned receipt snapshot tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
