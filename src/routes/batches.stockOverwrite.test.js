const assert = require("node:assert/strict");

let databaseCalls = 0;

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async query() {
    databaseCalls += 1;
    throw new Error("Rejected quantity edits must not query the database");
  },
  async getConnection() {
    databaseCalls += 1;
    throw new Error("Rejected quantity edits must not open a transaction");
  },
});

const router = require("./batches");
const route = router.stack.find(
  (entry) => entry.route?.path === "/:batch_id" && entry.route.methods?.put,
);
assert.ok(route, "PUT /batches/:batch_id route missing");
const handler = route.route.stack.at(-1).handle;
const createRoute = router.stack.find(
  (entry) => entry.route?.path === "/" && entry.route.methods?.post,
);
assert.ok(createRoute, "POST /batches route missing");
const createHandler = createRoute.route.stack.at(-1).handle;

async function invoke(body) {
  const req = { params: { batch_id: "23" }, body };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(value) { result.body = value; return this; },
  };
  await handler(req, res);
  return result;
}

(async () => {
  for (const field of ["quantity", "remaining_qty", "remainingQuantity", "stock"]) {
    databaseCalls = 0;
    const rejected = await invoke({ [field]: 50 });
    assert.equal(rejected.statusCode, 400, `${field} should be rejected`);
    assert.equal(rejected.body.code, "DIRECT_STOCK_UPDATE_NOT_ALLOWED");
    assert.deepEqual(rejected.body.fields, [field]);
    assert.equal(databaseCalls, 0);
  }

  databaseCalls = 0;
  const directReceipt = { statusCode: 200, body: null };
  await createHandler(
    { body: { product_id: 7, quantity: 50, received_date: "2026-11-01" } },
    {
      status(code) { directReceipt.statusCode = code; return this; },
      json(value) { directReceipt.body = value; return this; },
    },
  );
  assert.equal(directReceipt.statusCode, 400);
  assert.equal(directReceipt.body.code, "STOCK_RECEIPT_REQUIRES_PURCHASE_ORDER");
  assert.equal(databaseCalls, 0);

  console.log("Batch stock-overwrite protection tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
