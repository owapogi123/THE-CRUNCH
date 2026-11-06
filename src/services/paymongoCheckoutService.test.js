const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = "paymongo-integrity-test-only-secret";

const {
  createCheckoutContextToken,
  verifyCheckoutAttributes,
} = require("./paymongoCheckoutService");

const cartA = [{ product_id: 1, qty: 2 }];
const cartB = [{ product_id: 1, qty: 3 }];

test("checkout creation reloads authoritative items instead of using frontend price/total", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "routes", "paymongoRoutes.js"),
    "utf8",
  );
  assert.match(source, /loadAuthoritativeOrderItems\(db, items\)/);
  assert.match(source, /calculateBillingTotals\(subtotal, configuration\.billingSettings\)/);
  assert.match(source, /createOrLoadCheckoutIntent\(db,/);
  assert.doesNotMatch(source, /const \{[^}]*\btotal\b[^}]*\} = req\.body/);
  assert.doesNotMatch(source, /item\.price\s*\|\|\s*req\.body/);
});

function paidAttributes({ customerUserId = 21, items = cartA, amount = 10000 } = {}) {
  return {
    status: "paid",
    metadata: {
      payment_context: createCheckoutContextToken({
        customerUserId,
        items,
        expectedAmountCentavos: amount,
      }),
    },
    payments: [{
      id: "pay_test",
      attributes: { status: "paid", amount, currency: "PHP" },
    }],
  };
}

test("a correctly paid checkout bound to customer, cart, and amount is accepted", () => {
  const result = verifyCheckoutAttributes("cs_test", paidAttributes(), {
    customerUserId: 21,
    items: cartA,
    expectedAmountCentavos: 10000,
  });
  assert.equal(result.paid, true);
  assert.equal(result.expectedAmountCentavos, 10000);
});

test("an unpaid checkout is not accepted as paid", () => {
  const attributes = paidAttributes();
  attributes.status = "active";
  attributes.payments = [];
  const result = verifyCheckoutAttributes("cs_unpaid", attributes, {
    customerUserId: 21,
    items: cartA,
    expectedAmountCentavos: 10000,
  });
  assert.equal(result.paid, false);
});

test("a cancelled or expired checkout is not accepted as paid", () => {
  const attributes = paidAttributes();
  attributes.status = "expired";
  attributes.payments = [];
  const result = verifyCheckoutAttributes("cs_cancelled", attributes, {
    customerUserId: 21,
    items: cartA,
    expectedAmountCentavos: 10000,
  });
  assert.equal(result.paid, false);
  assert.equal(result.status, "expired");
});

test("a low-value checkout cannot authorize a higher-value order", () => {
  assert.throws(
    () => verifyCheckoutAttributes("cs_low", paidAttributes({ amount: 100 }), {
      customerUserId: 21,
      items: cartA,
      expectedAmountCentavos: 10000,
    }),
    (error) => error?.statusCode === 409,
  );
});

test("a checkout for Cart A cannot authorize Cart B", () => {
  assert.throws(
    () => verifyCheckoutAttributes("cs_cart", paidAttributes(), {
      customerUserId: 21,
      items: cartB,
      expectedAmountCentavos: 10000,
    }),
    (error) => error?.statusCode === 409,
  );
});

test("a checkout for Customer A cannot authorize Customer B", () => {
  assert.throws(
    () => verifyCheckoutAttributes("cs_customer", paidAttributes(), {
      customerUserId: 22,
      items: cartA,
      expectedAmountCentavos: 10000,
    }),
    (error) => error?.statusCode === 403,
  );
});

test("provider-reported paid amount must equal the signed amount", () => {
  const attributes = paidAttributes();
  attributes.payments[0].attributes.amount = 100;
  assert.throws(
    () => verifyCheckoutAttributes("cs_provider_amount", attributes, {
      customerUserId: 21,
      items: cartA,
      expectedAmountCentavos: 10000,
    }),
    (error) => error?.statusCode === 409,
  );
});

test("provider-reported paid currency must be PHP", () => {
  const attributes = paidAttributes();
  attributes.payments[0].attributes.currency = "USD";
  assert.throws(
    () => verifyCheckoutAttributes("cs_currency", attributes, {
      customerUserId: 21,
      items: cartA,
      expectedAmountCentavos: 10000,
    }),
    (error) => error?.statusCode === 409,
  );
});

test("application checkout routes contain no paid development bypass", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "..", "routes", "paymongoRoutes.js"),
    "utf8",
  );
  const orderSource = fs.readFileSync(
    path.join(__dirname, "..", "routes", "orderRoutes.js"),
    "utf8",
  );
  const modeSource = fs.readFileSync(
    path.join(__dirname, "paymongoMode.js"),
    "utf8",
  );
  assert.doesNotMatch(routeSource, /issueBypassCheckout|verifyBypassCheckout/);
  assert.doesNotMatch(orderSource, /BypassCheckout|bypassed/);
  assert.match(routeSource, /Idempotency-Key/);
  assert.match(routeSource, /reference_number/);
  assert.match(modeSource, /PAYMONGO_ENABLED\s*\?\?\s*"false"/);
});
