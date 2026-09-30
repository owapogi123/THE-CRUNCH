const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = "paymongo-integrity-test-only-secret";

const {
  createCheckoutContextToken,
  verifyCheckoutAttributes,
} = require("./paymongoCheckoutService");
const {
  claimBypassCheckout,
  issueBypassCheckout,
  verifyBypassCheckout,
} = require("./paymongoMode");

const cartA = [{ product_id: 1, qty: 2 }];
const cartB = [{ product_id: 1, qty: 3 }];

test("checkout creation reloads authoritative items instead of using frontend price/total", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "routes", "paymongoRoutes.js"),
    "utf8",
  );
  assert.match(source, /loadAuthoritativeOrderItems\(db, items\)/);
  assert.match(source, /calculateBillingTotals\(authoritativeItems, billingSettings\)/);
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
    payments: [{ id: "pay_test", attributes: { status: "paid", amount } }],
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

test("PAYMONGO_ENABLED=false bypass remains customer/cart bound and single-use", () => {
  const originalEnabled = process.env.PAYMONGO_ENABLED;
  process.env.PAYMONGO_ENABLED = "false";
  try {
    const checkout = issueBypassCheckout({ customerUserId: 21, items: cartA });
    assert.equal(
      verifyBypassCheckout(checkout.checkoutSessionId, {
        customerUserId: 21,
        items: cartA,
      }).paid,
      true,
    );
    assert.throws(
      () => verifyBypassCheckout(checkout.checkoutSessionId, {
        customerUserId: 22,
        items: cartA,
      }),
      (error) => error?.statusCode === 403,
    );
    assert.throws(
      () => verifyBypassCheckout(checkout.checkoutSessionId, {
        customerUserId: 21,
        items: cartB,
      }),
      (error) => error?.statusCode === 400,
    );
    claimBypassCheckout(checkout.checkoutSessionId, {
      customerUserId: 21,
      items: cartA,
    });
    assert.throws(
      () => claimBypassCheckout(checkout.checkoutSessionId, {
        customerUserId: 21,
        items: cartA,
      }),
      (error) => error?.statusCode === 409,
    );
  } finally {
    if (originalEnabled === undefined) delete process.env.PAYMONGO_ENABLED;
    else process.env.PAYMONGO_ENABLED = originalEnabled;
  }
});
