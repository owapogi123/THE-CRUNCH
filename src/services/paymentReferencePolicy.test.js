"use strict";

const assert = require("node:assert/strict");
const {
  canonicalizeProtectedPaymentReference,
  findProtectedPaymentReference,
  getProtectedPaymentReferenceLockName,
} = require("./paymentReferencePolicy");

function createLockManager() {
  const tails = new Map();
  return async function withLock(name, callback) {
    const previous = tails.get(name) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    tails.set(name, tail);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (tails.get(name) === tail) tails.delete(name);
    }
  };
}

(async () => {
  const upper = "POS-GCASH-ABCDEF12-3456-4789-ABCD-0123456789AB";
  const lower = upper.toLowerCase();
  assert.equal(
    canonicalizeProtectedPaymentReference(`  ${upper}  `),
    lower,
  );
  assert.equal(
    getProtectedPaymentReferenceLockName(upper),
    getProtectedPaymentReferenceLockName(lower),
  );

  const persisted = new Set();
  const observedQueries = [];
  const connection = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      observedQueries.push({ sql: normalized, params });
      const canonical = String(params[0]);
      return [persisted.has(canonical) ? [{ Order_ID: 1 }] : []];
    },
  };
  const withLock = createLockManager();

  async function concurrentlyCreate(reference) {
    const lockName = getProtectedPaymentReferenceLockName(reference);
    return withLock(lockName, async () => {
      const existing = await findProtectedPaymentReference(connection, reference);
      if (existing) {
        const error = new Error("duplicate payment reference");
        error.code = "DUPLICATE_PAYMENT_REFERENCE";
        throw error;
      }
      await new Promise((resolve) => setImmediate(resolve));
      persisted.add(canonicalizeProtectedPaymentReference(reference));
      return true;
    });
  }

  const caseVariantResults = await Promise.allSettled([
    concurrentlyCreate(upper),
    concurrentlyCreate(lower),
  ]);
  assert.equal(caseVariantResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(caseVariantResults.filter((result) => result.status === "rejected").length, 1);

  persisted.clear();
  const identicalResults = await Promise.allSettled([
    concurrentlyCreate(upper),
    concurrentlyCreate(upper),
  ]);
  assert.equal(identicalResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(identicalResults.filter((result) => result.status === "rejected").length, 1);
  assert.ok(
    observedQueries.every(({ sql, params }) =>
      /LOWER\(TRIM\(payment_reference\)\) = \?/i.test(sql) &&
      params[0] === params[0].toLowerCase()),
    "lookup must use the same canonical representation as the named lock",
  );

  console.log("Protected payment-reference concurrency policy tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
