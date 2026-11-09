"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const calls = [];
const redesignedHandlersId = require.resolve("./redesignedProductHandlers");
const redesignedHandlers = {
  async listProducts(_req, res) { calls.push("list"); return res.json([]); },
  async createProduct(_req, res) { calls.push("create"); return res.status(201).json({ id: 1 }); },
  async updateProduct(_req, res) { calls.push("update"); return res.json({ id: 1 }); },
  async setArchiveState(_req, res, archived) {
    calls.push(archived ? "archive" : "restore");
    return res.json({ archived });
  },
  async deleteProduct(_req, res) { calls.push("delete"); return res.json({}); },
};
require.cache[redesignedHandlersId] = {
  id: redesignedHandlersId,
  filename: redesignedHandlersId,
  loaded: true,
  exports: redesignedHandlers,
};

const router = require("./productRoutes");

function routeHandler(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.at(-1).handle;
}

async function invoke(path, method) {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
  await routeHandler(path, method)(
    { params: { id: "1" }, query: {}, body: {} },
    res,
  );
  return result;
}

(async () => {
  await invoke("/", "get");
  await invoke("/", "post");
  await invoke("/:id", "put");
  await invoke("/:id/archive", "patch");
  await invoke("/:id/restore", "patch");
  await invoke("/:id", "delete");
  assert.deepEqual(calls, ["list", "create", "update", "archive", "restore", "delete"]);
  console.log("product route redesigned profile dispatch tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
