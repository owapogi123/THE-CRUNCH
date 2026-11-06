"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "inventory-report-test-secret";

const db = require("../config/db");
const router = require("./reportsRoutes");

function findRoute(path) {
  const route = router.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods?.get,
  )?.route;
  assert.ok(route, `GET ${path} route was not found`);
  return route;
}

async function invoke(path, query) {
  const token = jwt.sign(
    { role: "inventory_manager", userId: 9 },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );
  const req = {
    headers: { authorization: `Bearer ${token}` },
    query,
  };
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
  const stack = findRoute(path).stack.map((layer) => layer.handle);

  async function dispatch(index) {
    if (index >= stack.length) return;
    await stack[index](req, res, () => dispatch(index + 1));
  }

  await dispatch(0);
  return result;
}

test("weekly and monthly reports include received-only materials and current stock-out consumption", async () => {
  const originalQuery = db.query;
  const periodQueries = [];
  const movementRows = [
    {
      product_id: 1,
      product_name: "Chicken",
      category: "Raw Materials",
      unit: "kg",
      withdrawn: "3",
      returned: "1",
      wasted: "0.5",
    },
    {
      product_id: 3,
      product_name: "Oil",
      category: "Raw Materials",
      unit: "L",
      withdrawn: "2",
      returned: "0",
      wasted: "0",
    },
  ];
  const receivedRows = [
    {
      product_id: 2,
      product_name: "Flour",
      category: "Raw Materials",
      unit: "kg",
      received: "5",
    },
    {
      product_id: 3,
      product_name: "Oil",
      category: "Raw Materials",
      unit: "L",
      received: "10",
    },
  ];
  const stockRows = [
    { product_id: 1, remaining: "7" },
    { product_id: 2, remaining: "5" },
    { product_id: 3, remaining: "8" },
    { product_id: 4, remaining: "99" },
  ];

  db.query = async (sql, params = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
      return [[
        { TABLE_NAME: "products", COLUMN_NAME: "id" },
        { TABLE_NAME: "products", COLUMN_NAME: "item_type" },
      ]];
    }
    if (/FROM Stock_Status ss/i.test(normalized)) {
      periodQueries.push({ kind: "movement", sql: normalized, params });
      return [movementRows];
    }
    if (/FROM batches b/i.test(normalized)) {
      periodQueries.push({ kind: "received", sql: normalized, params });
      return [receivedRows];
    }
    if (/SELECT i\.Product_ID AS product_id/i.test(normalized)) {
      return [stockRows];
    }
    throw new Error(`Unexpected query: ${normalized}`);
  };

  try {
    const weekly = await invoke("/weekly", { start: "2026-11-01" });
    assert.equal(weekly.statusCode, 200);
    assert.equal(weekly.body.items.length, 3, "stock-only inactive materials stay out of an activity report");
    assert.deepEqual(
      weekly.body.items.find((item) => item.product_id === 2),
      {
        product_id: 2,
        product_name: "Flour",
        category: "Raw Materials",
        unit: "kg",
        received: 5,
        withdrawn: 0,
        returned: 0,
        wasted: 0,
        remaining: 5,
        consumptionRate: 0,
      },
    );
    assert.equal(weekly.body.totalReceived, 15);
    assert.equal(weekly.body.totalWithdrawn, 5);
    assert.equal(weekly.body.totalReturned, 1);
    assert.equal(weekly.body.totalWasted, 0.5);
    assert.equal(
      weekly.body.items.find((item) => item.product_id === 1).consumptionRate,
      3 / 7,
    );

    const monthly = await invoke("/monthly", { year: "2026", month: "11" });
    assert.equal(monthly.statusCode, 200);
    assert.equal(monthly.body.items.length, 3);
    assert.equal(monthly.body.totalReceived, 15);
    assert.equal(monthly.body.totalWithdrawn, 5);
    assert.equal(
      monthly.body.items.find((item) => item.product_id === 1).consumptionRate,
      3 / 30,
    );

    const movementSql = periodQueries.find((query) => query.kind === "movement").sql;
    assert.match(movementSql, /'stock out','initial','supplementary'/i);
    assert.equal(
      periodQueries.every((query) => query.params[2] === "stock_item"),
      true,
    );
    assert.deepEqual(periodQueries[0].params.slice(0, 2), ["2026-11-01", "2026-11-08"]);
  } finally {
    db.query = originalQuery;
  }
});

