const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "order-route-test-secret";
process.env.DISCOUNT_AUTH_CODE = "test-only-discount-code";
process.env.PAYMONGO_ENABLED = "false";
const validProofUrl = "/api/upload-proof/1793664000000-00000000-0000-4000-8000-000000000003.png";

const state = {
  writes: [],
  commits: 0,
  rollbacks: 0,
  receipts: [],
  deductions: 0,
  deductionError: null,
  paymentReferences: new Set(),
  lockNames: [],
  qrConfigured: true,
};

function resetState() {
  state.writes = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.receipts = [];
  state.deductions = 0;
  state.deductionError = null;
  state.paymentReferences = new Set();
  state.lockNames = [];
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
    if (normalizedSql.startsWith("SELECT GET_LOCK")) {
      state.lockNames.push(String(params[0]));
      return [[{ acquired: 1 }]];
    }
    if (normalizedSql.startsWith("SELECT RELEASE_LOCK")) {
      return [[{ released: 1 }]];
    }
    if (
      normalizedSql.startsWith("SELECT Order_ID FROM orders") &&
      normalizedSql.includes("LOWER(TRIM(payment_reference)) = ?")
    ) {
      return [state.paymentReferences.has(String(params[0]).toLowerCase()) ? [{ Order_ID: 1 }] : []];
    }
    if (normalizedSql.startsWith("INSERT INTO orders")) {
      const paymentReference = params[6];
      if (paymentReference) state.paymentReferences.add(String(paymentReference).trim().toLowerCase());
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
  async deductPrevalidatedStockForPaidOrder() {
    state.deductions += 1;
    if (state.deductionError) throw state.deductionError;
  },
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
mockModule("./uploadProofRoutes", {
  async validateStoredProofUrl(value) {
    if (value === validProofUrl) return value;
    const error = new Error("Payment proof must use the protected upload endpoint");
    error.statusCode = 400;
    throw error;
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
const legacyProofUploadLayer = router.stack.find(
  (layer) => layer.route?.path === "/payment-proofs" && layer.route.methods?.post,
);
assert.ok(legacyProofUploadLayer, "legacy payment-proof POST route was not found");
const legacyProofUploadHandlers = legacyProofUploadLayer.route.stack.map((layer) => layer.handle);
assert.ok(
  router.stack.some(
    (layer) => layer.route?.path === "/payment-proofs/:filename" && layer.route.methods?.get,
  ),
  "historical legacy proof retrieval must remain available",
);

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
const administratorToken = jwt.sign(
  { userId: 30, role: "administrator" },
  process.env.JWT_SECRET,
  { expiresIn: "5m" },
);
const inventoryManagerToken = jwt.sign(
  { userId: 20, role: "inventory_manager" },
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
  const blockedLegacyProof = await invokeHandlers(legacyProofUploadHandlers, {
    token: inventoryManagerToken,
    body: { dataUrl: "data:image/png;base64,invalid" },
  });
  assert.equal(blockedLegacyProof.statusCode, 403);
  const retiredLegacyProof = await invokeHandlers(legacyProofUploadHandlers, {
    token: cashierToken,
    body: { dataUrl: "data:image/png;base64,invalid" },
  });
  assert.equal(retiredLegacyProof.statusCode, 410);
  assert.equal(retiredLegacyProof.body.code, "LEGACY_PAYMENT_PROOF_UPLOAD_RETIRED");

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
    1,
    "paid onsite order creation must deduct stock before commit",
  );

  resetState();
  const onsiteStockError = new Error(
    'Insufficient stock for "Chicken". Required 2, available 1.',
  );
  onsiteStockError.statusCode = 409;
  state.deductionError = onsiteStockError;
  const rejectedOnsiteOrder = await invokeOrder({
    token: cashierToken,
    body: { ...baseStaffBody, cash_tendered: 100 },
  });
  assert.equal(rejectedOnsiteOrder.statusCode, 409);
  assert.match(rejectedOnsiteOrder.body.message, /Insufficient stock/);
  assert.equal(state.deductions, 1);
  assert.equal(state.commits, 0, "failed onsite deduction must not commit the order");
  assert.equal(state.rollbacks, 1, "failed onsite deduction must roll back all order writes");

  resetState();
  const administratorOrder = await invokeOrder({
    token: administratorToken,
    body: { ...baseStaffBody, cash_tendered: 100 },
  });
  assert.equal(administratorOrder.statusCode, 200);
  assert.equal(state.deductions, 1, "Administrator-created paid onsite orders must deduct once");

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
      proof_image_url: validProofUrl,
      total: 1,
    },
  });
  assert.equal(mismatchedManualGcash.statusCode, 409);
  assert.match(mismatchedManualGcash.body.message, /amount changed/i);
  assert.equal(state.receipts.length, 0);

  resetState();
  const missingManualGcashProof = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      total: 100,
    },
  });
  assert.equal(missingManualGcashProof.statusCode, 400);
  assert.match(missingManualGcashProof.body.message, /payment proof is required/i);
  assert.equal(state.writes.length, 0);

  resetState();
  const externalManualGcashProof = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      proof_image_url: "https://example.invalid/untrusted-proof.png",
      total: 100,
    },
  });
  assert.equal(externalManualGcashProof.statusCode, 400);
  assert.match(externalManualGcashProof.body.message, /protected upload endpoint/i);
  assert.equal(state.writes.length, 0);

  resetState();
  const manualGcashOrder = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_status: "Pending",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      proof_image_url: validProofUrl,
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
  assert.equal(manualGcashWrite.params[9], validProofUrl, "onsite GCash proof URL must be stored on the order");
  assert.equal(manualGcashWrite.params[10], 10, "authenticated Cashier records manual verification");
  assert.ok(manualGcashWrite.params[11] instanceof Date);
  const manualGcashPayment = state.writes.find((write) => write.sql.startsWith("INSERT INTO payments"));
  assert.deepEqual(manualGcashPayment.params.slice(1, 3), ["Onsite GCash / E-Payment", "Completed"]);
  assert.equal(state.receipts[0].amountPaid, 100);
  assert.equal(state.deductions, 1, "onsite GCash confirmation must deduct inventory once");

  const duplicateManualGcash = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference,
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      proof_image_url: validProofUrl,
      total: 100,
    },
  });
  assert.equal(duplicateManualGcash.statusCode, 409);
  assert.match(duplicateManualGcash.body.message, /already been used/i);
  assert.equal(state.receipts.length, 1, "duplicate confirmation must not create another receipt");

  const caseVariantManualGcash = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      payment_method: "gcash_onsite",
      payment_reference: manualGcashReference.toLowerCase(),
      payment_qr_version: "2026-11-03T00:00:00.000Z",
      proof_image_url: validProofUrl,
      total: 100,
    },
  });
  assert.equal(caseVariantManualGcash.statusCode, 409);
  assert.match(caseVariantManualGcash.body.message, /already been used/i);
  assert.equal(
    new Set(state.lockNames).size,
    1,
    "case-equivalent protected references must acquire the same named lock",
  );

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

  for (const paymentReference of [
    "",
    "GF-",
    "AB12_345",
    "-ABC",
    "ABC-",
    "A".repeat(256),
  ]) {
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
  const unsupportedOtherPlatform = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      order_type: "delivery",
      payment_method: "other",
      payment_reference: "OTHER-123",
    },
  });
  assert.equal(unsupportedOtherPlatform.statusCode, 400);
  assert.match(unsupportedOtherPlatform.body.message, /GrabFood or Foodpanda/i);
  assertRejectedBeforePersistence(unsupportedOtherPlatform);

  resetState();
  const delivery = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      order_type: "delivery",
      payment_method: "grabfood",
      payment_reference: "GF-123",
    },
  });
  assert.equal(delivery.statusCode, 200);
  const deliveryWrite = state.writes.find((write) => write.sql.startsWith("INSERT INTO orders"));
  assert.equal(deliveryWrite.params[6], "GF-123");
  assert.equal(deliveryWrite.params[8], "GrabFood");
  assert.equal(state.receipts[0].cashTendered, null);
  assert.equal(state.deductions, 1, "paid third-party Cashier orders must deduct once");
  assert.equal(state.lockNames.length, 0, "reusable third-party references must not use the protected lock");

  const repeatedDelivery = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      order_type: "delivery",
      payment_method: "grabfood",
      payment_reference: "GF-123",
    },
  });
  assert.equal(
    repeatedDelivery.statusCode,
    200,
    "third-party short references may legitimately be reused",
  );

  const fullGrabBooking = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      order_type: "delivery",
      payment_method: "grabfood",
      payment_reference: "GRAB-BOOKING-2026-ABC-9876543210",
    },
  });
  assert.equal(fullGrabBooking.statusCode, 200);

  resetState();
  const missingFoodpandaReference = await invokeOrder({
    token: cashierToken,
    body: {
      ...baseStaffBody,
      order_type: "delivery",
      payment_method: "foodpanda",
      payment_reference: "",
    },
  });
  assert.equal(missingFoodpandaReference.statusCode, 400);
  assert.match(missingFoodpandaReference.body.message, /Foodpanda order reference/i);

  resetState();
  for (const paymentReference of [
    "FP9X7",
    "FOOD-2026-ORDER-ABC-12345678901234567890",
  ]) {
    const foodpandaDelivery = await invokeOrder({
      token: cashierToken,
      body: {
        ...baseStaffBody,
        order_type: "delivery",
        payment_method: "foodpanda",
        payment_reference: paymentReference,
      },
    });
    assert.equal(foodpandaDelivery.statusCode, 200);
  }

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
    "verified online submission must wait for Cashier acceptance before deducting stock",
  );

  console.log("Order route security integration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
