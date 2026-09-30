const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  claimDiscountApproval,
  issueDiscountApproval,
  resetConsumedApprovalsForTests,
  verifyAuthorizationCode,
  verifyDiscountApproval,
} = require("./discountAuthorizationService");
const { validateCashTender } = require("./cashValidationService");

const previousAuthorizationCode = process.env.DISCOUNT_AUTH_CODE;
const previousJwtSecret = process.env.JWT_SECRET;
process.env.DISCOUNT_AUTH_CODE = "test-only-discount-code";
process.env.JWT_SECRET = "test-only-jwt-secret";

const items = [
  { product_id: 2, qty: 1 },
  { product_id: 1, qty: 2 },
];

function expectAuthorizationFailure(callback) {
  assert.throws(callback, (error) => error?.statusCode === 403);
}

try {
  resetConsumedApprovalsForTests();

  assert.equal(verifyAuthorizationCode("test-only-discount-code"), true);
  assert.equal(verifyAuthorizationCode("wrong-code"), false);
  delete process.env.DISCOUNT_AUTH_CODE;
  assert.throws(
    () => verifyAuthorizationCode("anything"),
    (error) => error?.statusCode === 503,
  );
  process.env.DISCOUNT_AUTH_CODE = "test-only-discount-code";

  const approvalToken = issueDiscountApproval({
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items,
  });
  const approval = verifyDiscountApproval({
    token: approvalToken,
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items,
  });
  assert.ok(approval.approvalId);

  expectAuthorizationFailure(() => verifyDiscountApproval({
    token: null,
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items,
  }));
  expectAuthorizationFailure(() => verifyDiscountApproval({
    token: approvalToken,
    userId: 10,
    discountId: 5,
    discountRate: 20,
    items,
  }));
  expectAuthorizationFailure(() => verifyDiscountApproval({
    token: approvalToken,
    userId: 11,
    discountId: 4,
    discountRate: 20,
    items,
  }));
  expectAuthorizationFailure(() => verifyDiscountApproval({
    token: approvalToken,
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items: [{ product_id: 1, qty: 1 }],
  }));

  claimDiscountApproval(approval);
  expectAuthorizationFailure(() => verifyDiscountApproval({
    token: approvalToken,
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items,
  }));

  const expiredToken = issueDiscountApproval({
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items,
    expiresInSeconds: -1,
  });
  expectAuthorizationFailure(() => verifyDiscountApproval({
    token: expiredToken,
    userId: 10,
    discountId: 4,
    discountRate: 20,
    items,
  }));

  assert.throws(
    () => validateCashTender(99.99, 100),
    (error) => error?.statusCode === 400,
  );
  assert.throws(
    () => validateCashTender("not-a-number", 100),
    (error) => error?.statusCode === 400,
  );
  assert.deepEqual(validateCashTender(100, 100), {
    cashTendered: 100,
    change: 0,
  });
  assert.deepEqual(validateCashTender(150, 100), {
    cashTendered: 150,
    change: 50,
  });

  const routeSource = fs.readFileSync(
    path.join(__dirname, "..", "routes", "orderRoutes.js"),
    "utf8",
  );
  const createRouteStart = routeSource.indexOf(
    'router.post("/", withOrderRequestTiming, requireAuthenticatedUser',
  );
  const cashValidationIndex = routeSource.indexOf(
    "validateCashTender(",
    createRouteStart,
  );
  const orderInsertIndex = routeSource.indexOf("INSERT INTO orders", createRouteStart);
  const paymentInsertIndex = routeSource.indexOf("INSERT INTO payments", createRouteStart);
  const receiptInsertIndex = routeSource.indexOf("createReceiptSnapshot(conn", createRouteStart);
  const inventoryIndex = routeSource.indexOf(
    "deductPrevalidatedStockForPaidOrder(",
    createRouteStart,
  );

  assert.ok(createRouteStart >= 0, "Order creation must require authentication");
  assert.ok(
    routeSource.includes("? Number(req.user.userId)"),
    "Staff cashier identity must come from the JWT",
  );
  assert.ok(cashValidationIndex > createRouteStart);
  assert.ok(cashValidationIndex < orderInsertIndex);
  assert.ok(cashValidationIndex < paymentInsertIndex);
  assert.ok(cashValidationIndex < receiptInsertIndex);
  assert.ok(cashValidationIndex < inventoryIndex);
  assert.ok(receiptInsertIndex < inventoryIndex, "Inventory timing must remain unchanged");
  assert.ok(routeSource.includes('actorRole === "customer"'));
  assert.ok(routeSource.includes('normalizedPaymentMethod === "cash_on_pickup"'));

  console.log("Order security tests passed");
} finally {
  resetConsumedApprovalsForTests();
  if (previousAuthorizationCode === undefined) delete process.env.DISCOUNT_AUTH_CODE;
  else process.env.DISCOUNT_AUTH_CODE = previousAuthorizationCode;
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
}
