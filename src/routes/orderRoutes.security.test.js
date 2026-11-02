const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "order-route-test-secret";
process.env.DISCOUNT_AUTH_CODE = "test-only-discount-code";
process.env.PAYMONGO_ENABLED = "false";

const state = {
  writes: [],
  commits: 0,
  rollbacks: 0,
  receipts: [],
  deductions: 0,
  paymentReferences: new Set(),
  qrConfigured: true,
};

function resetState() {
  state.writes = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.receipts = [];
  state.deductions = 0;
  state.paymentReferences = new Set();
  state.qrConfigured = true;
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const connection = {
  async beginTransaction() {},
  async commit() { state.commits += 1; },
  async rollback() { state.rollbacks += 1; },
  release() {},
  async query(sql, params = []) {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
    if (normalizedSql.startsWith("INSERT INTO orders")) {
      const paymentReference = params[6];
      if (paymentReference && state.paymentReferences.has(paymentReference)) {
        const duplicate = new Error("Duplicate entry for payment_reference");
        duplicate.code = "ER_DUP_ENTRY";
        duplicate.sqlMessage = "Duplicate entry for key 'uq_orders_payment_reference'";
        throw duplicate;
      }
      if (paymentReference) state.paymentReferences.add(paymentReference);
    }
    if (/^(INSERT|UPDATE|DELETE)\b/i.test(normalizedSql)) {
      state.writes.push({ sql: normalizedSql, params });
    }
    if (normalizedSql.includes("LEFT JOIN system_settings settings")) {
      const discountId = Number(params[0]);
      const isDiscounted = discountId === 2;
      return [[{
        settings_json: "{}",
        discount_id: discountId > 0 ? discountId : null,
        discount_name: discountId > 0 ? (isDiscounted ? "PWD" : "Regular customer") : null,
        discount_percentage: isDiscounted ? 20 : 0,
      }]];
    }
    if (normalizedSql.includes("FROM (SELECT ? AS requestedId) requested")) {
      return [[{ cashierId: Number(params[0]), recordedByAdminId: Number(params[0]) }]];
    }
    if (normalizedSql.startsWith("INSERT INTO orders")) {
      return [{ insertId: 700 + state.commits }];
    }
    return [[]];
  },
};

const db = {
  async getConnection() { return connection; },
  async query(sql, params = []) {
    if (String(sql).includes("FROM discount_types")) {
      const discountId = Number(params[0]);
      return discountId === 2
        ? [[{ discount_id: 2, name: "PWD", percentage: 20 }]]
        : [[]];
    }
    if (String(sql).includes("FROM users")) {
      return [[{
        role: "customer",
        email_verified: 1,
        username: "Customer",
        email: "customer@example.test",
      }]];
    }
    return [[]];
  },
};

mockModule("../config/db", db);
mockModule("../services/inventoryService", {
  async deductPrevalidatedStockForPaidOrder() { state.deductions += 1; },
  async deductStockForPaidOrder() {},
  async prepareOrderItemsAndStock(_conn, items) {
    return {
      authoritativeItems: items.map((item) => ({
        product_id: item.product_id,
        qty: item.qty,
        name: `Product ${item.product_id}`,
        price: 50,
        subtotal: 50 * item.qty,
      })),
      deductions: [],
    };
  },
  async restoreStockForRefundedOrder() {},
});
mockModule("../services/orderIdentifierService", {
  async allocateOrderIdentifiers() {
    return {
      transactionId: "TSN-TEST",
      orderNumber: "ORD-TEST",
      orderNumberValue: 1,
      businessDate: "2026-10-01",
    };
  },
  formatOrderNumber: () => "ORD-TEST",
  formatTransactionId: () => "TSN-TEST",
  getBusinessDateParts: () => ({ businessDate: "2026-10-01" }),
});
mockModule("../services/receiptSnapshotService", {
  collectOrderItemNotes: () => new Map(),
  async createReceiptSnapshot(_conn, payload) {
    state.receipts.push(payload);
    return payload;
  },
  async loadReceiptDto() { return null; },
});
mockModule("../services/emailService", {
  async sendCustomerOrderReceiptEmail() {},
});
mockModule("../services/applicationEvents", {
  publishOrderMutation() {},
});
mockModule("../services/requestTiming", {
  isDevelopmentTimingEnabled: () => false,
  runWithDbQueryTiming: (callback) => callback({ queries: [] }),
});
mockModule("../services/paymentQrService", {
  async getActivePaymentQr() {
    return state.qrConfigured
      ? { filename: "configured-qr.png", updatedAt: "2026-11-03T00:00:00.000Z" }
      : null;
  },
});

const router = require("./orderRoutes");
const createLayer = router.stack.find(
  (layer) => layer.route?.path === "/" && layer.route.methods?.post,
);
assert.ok(createLayer, "POST /orders route was not found");
const createHandlers = createLayer.route.stack.map((layer) => layer.handle);
const authorizationLayer = router.stack.find(
  (layer) => layer.route?.path === "/discount-authorization" && layer.route.methods?.post,
);
assert.ok(authorizationLayer, "POST /orders/discount-authorization route was not found");
const authorizationHandlers = authorizationLayer.route.stack.map((layer) => layer.handle);

async function invokeHandlers(handlers, { token, body }) {
  const req = {
    headers: { authorization: `Bearer ${token}` },
    body,
  };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(payload) { result.body = payload; return this; },
  };

  async function dispatch(index) {
    const handler = handlers[index];
    if (!handler) return;
    await handler(req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return result;
}

const invokeOrder = (request) => invokeHandlers(createHandlers, request);
const invokeAuthorization = (request) => invokeHandlers(authorizationHandlers, request);
const { issueBypassCheckout } = require("../services/paymongoMode");

const cashierToken = jwt.sign(
  { userId: 10, role: "cashier" },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);
const customerToken = jwt.sign(
  { userId: 20, role: "customer" },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);
const baseStaffBody = {
  items: [{ product_id: 1, qty: 2 }],
  order_type: "dine-in",
  payment_method: "cash",
  discount_id: 1,
  discount_name: "Regular customer",
  cashierId: 999,
};
const baseCustomerBody = {
  items: [{ product_id: 1, qty: 2 }],
  order_type: "take-out",
};

function assertRejectedBeforePersistence(result) {
  assert.equal(result.statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.deductions, 0);
  assert.equal(state.commits, 0);
  assert.equal(state.rollbacks, 0);
}

(async () => {
  resetState();
  const insufficient = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 99.99 },
  });
  assert.equal(insufficient.statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.deductions, 0);
  assert.equal(state.commits, 0);
  assert.equal(state.rollbacks, 1);

  resetState();
  const exact = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 100 },
  });
  assert.equal(exact.statusCode, 200);
  assert.equal(state.receipts[0].cashTendered, 100);
  assert.equal(state.receipts[0].changeAmount, 0);
  const exactOrderWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(exactOrderWrite.params[2], 10, "JWT cashier ID must override the body value");
  assert.equal(
    state.deductions,
    0,
    "paid order creation must not deduct stock before completion",
  );

  resetState();
  const missingQrReference = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_status: "Paid",
    },
  });
  assert.equal(missingQrReference.statusCode, 400);
  assert.equal(state.writes.length, 0);

  resetState();
  state.qrConfigured = false;
  const missingQrConfiguration = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: "POS-GCASH-00000000-0000-4000-8000-000000000001",
    },
  });
  assert.equal(missingQrConfiguration.statusCode, 409);
  assert.equal(state.writes.length, 0);

  resetState();
  const manualGcashReference = "POS-GCASH-00000000-0000-4000-8000-000000000002";
  const staleQrConfirmation = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-02T00:00:00.000Z",
      total: 100,
    },
  });
  assert.equal(staleQrConfirmation.statusCode, 409);
  assert.match(staleQrConfirmation.body.message, /QR image changed/i);
  assert.equal(state.writes.length, 0);

  resetState();
  const mismatchedManualGcash = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      total: 1,
    },
  });
  assert.equal(mismatchedManualGcash.statusCode, 409);
  assert.match(mismatchedManualGcash.body.message, /amount changed/i);
  assert.equal(state.receipts.length, 0);

  resetState();
  const manualGcashOrder = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_status: "Pending",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      total: 100,
    },
  });
  assert.equal(manualGcashOrder.statusCode, 200);
  const manualGcashWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(manualGcashWrite.params[0], 100, "backend-calculated total must be authoritative");
  assert.equal(manualGcashWrite.params[4], "Pending", "confirmed payment enters the existing kitchen queue workflow");
  assert.equal(manualGcashWrite.params[6], manualGcashReference);
  assert.equal(manualGcashWrite.params[7], "Paid");
  assert.equal(manualGcashWrite.params[8], "Onsite GCash / E-Payment");
  assert.equal(manualGcashWrite.params[9], null, "new manual GCash flow does not require a proof upload");
  assert.equal(manualGcashWrite.params[10], 10, "authenticated Cashier records manual verification");
  assert.ok(manualGcashWrite.params[11] instanceof Date);
  const manualGcashPayment = state.writes.find((write) => write.sql.startsWith("INSERT INTO payments"));
  assert.deepEqual(manualGcashPayment.params.slice(1, 3), ["Onsite GCash / E-Payment", "Completed"]);
  assert.equal(state.receipts[0].amountPaid, 100);
  assert.equal(state.deductions, 0, "payment confirmation must not deduct inventory");

  const duplicateManualGcash = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      total: 100,
    },
  });
  assert.equal(duplicateManualGcash.statusCode, 409);
  assert.match(duplicateManualGcash.body.message, /already been used/i);
  assert.equal(state.receipts.length, 1, "duplicate confirmation must not create another receipt");

  resetState();
  const wrongAuthorization = await invokeAuthorization({
    token: cashierToken,
    body: {
      discount_id: 2,
      authorization_code: "wrong-code",
      items: baseStaffBody.items,
    },
  });
  assert.equal(wrongAuthorization.statusCode, 403);
  assert.equal(wrongAuthorization.body.message, "Discount authorization failed");

  const approvedAuthorization = await invokeAuthorization({
    token: cashierToken,
    body: {
      discount_id: 2,
      authorization_code: "test-only-discount-code",
      items: baseStaffBody.items,
    },
  });
  assert.equal(approvedAuthorization.statusCode, 200);
  assert.ok(approvedAuthorization.body.approvalToken);

  resetState();
  const missingApproval = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      discount_id: 2,
      discount_name: "PWD",
      cash_tendered: 100,
    },
  });
  assert.equal(missingApproval.statusCode, 403);
  assert.equal(state.writes.length, 0);
  assert.equal(state.receipts.length, 0);
  assert.equal(state.deductions, 0);

  resetState();
  const approvedDiscountOrder = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      discount_id: 2,
      discount_name: "PWD",
      discount_authorization: approvedAuthorization.body.approvalToken,
      cash_tendered: 100,
    },
  });
  assert.equal(approvedDiscountOrder.statusCode, 200);
  assert.equal(state.receipts[0].discountRate, 20);
  assert.equal(state.receipts[0].total, 80);
  assert.equal(state.receipts[0].changeAmount, 20);

  resetState();
  const excess = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 150 },
  });
  assert.equal(excess.statusCode, 200);
  assert.equal(state.receipts[0].changeAmount, 50);

  for (const paymentReference of ["AB12", "AB12_345", "1234567890123456"]) {
    resetState();
    const invalidDelivery = await invokeOrder({
      token: cashierToken,
      body: {
        ...baseStaffBody,
        order_type: "delivery",
        payment_method: "grabfood",
        payment_reference: paymentReference,
      },
    });
    assertRejectedBeforePersistence(invalidDelivery);
  }

  resetState();
  const delivery = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      order_type: "delivery",
      payment_method: "grabfood",
      payment_reference: "GF-1234567890",
    },
  });
  assert.equal(delivery.statusCode, 200);
  const deliveryWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(deliveryWrite.params[6], "GF-1234567890");
  assert.equal(deliveryWrite.params[8], "GrabFood");
  assert.equal(state.receipts[0].cashTendered, null);

  resetState();
  const online = await invokeOrder({
    token: customerToken,
    body: {
      items: [{ product_id: 1, qty: 2 }],
      customerUserId: 999,
      order_type: "take-out",
      payment_method: "cash_on_pickup",
      payment_status: "Pending Payment",
    },
  });
  assert.equal(online.statusCode, 200);
  const onlineOrderWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(onlineOrderWrite.params[2], null);
  assert.equal(onlineOrderWrite.params[4], "Awaiting Cashier Review");
  assert.equal(
    onlineOrderWrite.params[5],
    20,
    "JWT customer ID must override a forged body customerUserId",
  );
  assert.equal(state.deductions, 0);

  resetState();
  const forgedPaidCashOrder = await invokeOrder({
    token: customerToken,
    body: {
      ...baseCustomerBody,
      payment_method: "cash_on_pickup",
      payment_status: "Paid",
      payment_reference: "FAKE-CASH-REFERENCE",
      proof_image_url: "/uploads/payment-proofs/fake.png",
    },
  });
  assert.equal(forgedPaidCashOrder.statusCode, 200);
  const forgedPaidWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(forgedPaidWrite.params[6], null, "customer reference must not authorize cash payment");
  assert.equal(forgedPaidWrite.params[7], "Pending Payment");
  assert.equal(forgedPaidWrite.params[9], null, "customer proof must not be persisted as confirmation");
  assert.equal(state.receipts[0].amountPaid, 0);
  assert.equal(state.deductions, 0);

  for (const unsupportedOrderType of ["dine-in", "delivery"]) {
    resetState();
    const unsupportedOrder = await invokeOrder({
      token: customerToken,
      body: {
        ...baseCustomerBody,
        order_type: unsupportedOrderType,
        payment_method: "cash_on_pickup",
      },
    });
    assertRejectedBeforePersistence(unsupportedOrder);
  }

  resetState();
  const invalidPaymentMethod = await invokeOrder({
    token: customerToken,
    body: {
      ...baseCustomerBody,
      payment_method: "card",
      payment_status: "Paid",
    },
  });
  assertRejectedBeforePersistence(invalidPaymentMethod);

  resetState();
  const fakeReference = await invokeOrder({
    token: customerToken,
    body: {
      ...baseCustomerBody,
      payment_method: "gcash",
      payment_status: "Paid",
      payment_reference: "FAKE-GCASH-REFERENCE",
    },
  });
  assertRejectedBeforePersistence(fakeReference);

  resetState();
  const verifiedCheckout = issueBypassCheckout({
    customerUserId: 20,
    items: baseCustomerBody.items,
  });
  const verifiedOnlineOrder = await invokeOrder({
    token: customerToken,
    body: {
      ...baseCustomerBody,
      payment_method: "gcash",
      checkout_session_id: verifiedCheckout.checkoutSessionId,
      payment_status: "Pending",
      payment_reference: "FORGED-REFERENCE-IGNORED",
    },
  });
  assert.equal(verifiedOnlineOrder.statusCode, 200);
  const verifiedOnlineWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(verifiedOnlineWrite.params[6], verifiedCheckout.paymentReference);
  assert.equal(verifiedOnlineWrite.params[7], "Paid");
  assert.equal(state.receipts[0].amountPaid, 100);
  assert.equal(
    state.deductions,
    0,
    "verified online payment must not deduct stock before completion",
  );

  console.log("Order route security integration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
