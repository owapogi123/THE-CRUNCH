"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const state = {
  product: null,
  history: false,
  deleted: false,
  historicalRows: 0,
};

function reset({ history = false } = {}) {
  state.product = {
    id: 13,
    name: "Historical Chicken",
    item_type: "menu_item",
    availability_status: "Available",
  };
  state.history = history;
  state.deleted = false;
  state.historicalRows = history ? 4 : 0;
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

async function query(sql, params = []) {
  const normalized = String(sql).replace(/\s+/g, " ").trim();
  if (/^SELECT p\.id, p\.name, p\.availability_status/i.test(normalized)) {
    return [state.product ? [{ ...state.product }] : []];
  }
  if (/^UPDATE products SET availability_status/i.test(normalized)) {
    if (!state.product) return [{ affectedRows: 0 }];
    state.product.availability_status = params[0];
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT EXISTS\(SELECT 1 FROM batches/i.test(normalized)) {
    return [[state.history ? { has_order_items: 1 } : { has_order_items: 0 }]];
  }
  if (/^DELETE FROM products/i.test(normalized)) {
    if (!state.product) return [{ affectedRows: 0 }];
    state.deleted = true;
    state.product = null;
    return [{ affectedRows: 1 }];
  }
  if (/^DELETE FROM/i.test(normalized)) return [{ affectedRows: 0 }];
  return [[]];
}

const dbMock = {
  query,
  async getConnection() {
    return {
      query,
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
    };
  },
};

mockModule("../config/db", dbMock);
mockModule("../services/productSchemaService", {
  async ensureProductSchema() {
    return true;
  },
});

const router = require("./productRoutes");
const { loadAuthoritativeOrderItems } = require("../services/orderItemService");
const { resolveProductAvailabilityStatus } = require("../utils/menuAvailability");
const { cache, PRODUCT_CACHE_PREFIX } = require("../services/cacheService");

function routeHandler(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(handler, id = 13) {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await handler({ params: { id: String(id) }, body: {} }, res);
  return result;
}

(async () => {
  const remove = routeHandler("/:id", "delete");
  const archive = routeHandler("/:id/archive", "patch");
  const restore = routeHandler("/:id/restore", "patch");

  reset();
  const removed = await invoke(remove);
  assert.equal(removed.statusCode, 200);
  assert.equal(state.deleted, true, "unused menu item should be hard deleted");

  reset({ history: true });
  const protectedResult = await invoke(remove);
  assert.equal(protectedResult.statusCode, 409);
  assert.equal(protectedResult.body.code, "PRODUCT_HAS_PROTECTED_HISTORY");
  assert.equal(protectedResult.body.canArchive, true);
  assert.equal(state.deleted, false);
  assert.equal(state.historicalRows, 4);

  const productCacheKey = `${PRODUCT_CACHE_PREFIX}archive-lifecycle-test`;
  await cache.set(productCacheKey, [{ id: 13, availability_status: "Available" }], 60_000);
  const archived = await invoke(archive);
  assert.equal(archived.statusCode, 200);
  assert.equal(state.product.availability_status, "Hidden");
  assert.equal(await cache.get(productCacheKey), null, "archiving must invalidate cached product responses");
  assert.equal(state.historicalRows, 4, "archiving must preserve history");
  assert.equal(
    resolveProductAvailabilityStatus(
      { item_type: "menu_item", availability_status: "Hidden" },
      [{ quantity_required: 1, stock: 10 }],
    ),
    "Hidden",
  );

  await assert.rejects(
    () => loadAuthoritativeOrderItems({
      async query() {
        return [[{
          productId: 13,
          productName: "Historical Chicken",
          currentPrice: 99,
          availabilityStatus: "Hidden",
        }]];
      },
    }, [{ product_id: 13, qty: 1 }]),
    (error) => error?.statusCode === 409 && /archived/i.test(error.message),
  );

  const inventoryServiceSource = fs.readFileSync(
    path.join(__dirname, "../services/inventoryService.js"),
    "utf8",
  );
  assert.match(
    inventoryServiceSource,
    /availabilityStatus[\s\S]*archived and cannot be ordered/i,
    "the final order API inventory path must reject archived products",
  );

  await cache.set(productCacheKey, [{ id: 13, availability_status: "Hidden" }], 60_000);
  const restored = await invoke(restore);
  assert.equal(restored.statusCode, 200);
  assert.equal(state.product.availability_status, "Available");
  assert.equal(await cache.get(productCacheKey), null, "restoring must invalidate cached product responses");
  assert.equal(
    resolveProductAvailabilityStatus(
      { item_type: "menu_item", availability_status: "Available" },
      [],
    ),
    "Out of Stock",
    "restore must not bypass recipe availability",
  );
  assert.equal(state.historicalRows, 4);

  console.log("Menu item archive, restore, and deletion-protection tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
