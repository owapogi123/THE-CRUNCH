"use strict";

const assert = require("node:assert/strict");

let databaseCalls = 0;

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async query() {
    databaseCalls += 1;
    throw new Error("legacy stock movements must not reach the database");
  },
  async getConnection() {
    databaseCalls += 1;
    throw new Error("legacy stock movements must not open a transaction");
  },
});

const router = require("./stockStatusRoutes");
const route = router.stack.find(
  (entry) => entry.route?.path === "/" && entry.route.methods?.post,
);
assert.ok(route, "POST /stock-status route missing");
const handler = route.route.stack.at(-1).handle;

async function invoke(body) {
  const result = { statusCode: 200, body: null };
  await handler(
    { body },
    {
      status(code) { result.statusCode = code; return this; },
      json(value) { result.body = value; return this; },
    },
  );
  return result;
}

(async () => {
  for (const type of ["initial", "supplementary", "return"]) {
    const result = await invoke({ product_id: 21, type, quantity: 2 });
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.code, "BATCH_STOCK_MOVEMENT_REQUIRED");
  }
  const unsupported = await invoke({
    product_id: 21,
    type: "manual overwrite",
    quantity: 2,
  });
  assert.equal(unsupported.statusCode, 400);
  assert.equal(databaseCalls, 0);
  console.log("Legacy stock-movement workflow guard tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
