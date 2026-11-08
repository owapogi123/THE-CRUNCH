"use strict";

const assert = require("node:assert/strict");

(async () => {
  const itemTypeQueries = [];
  const existingSchema = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      itemTypeQueries.push(normalized);
      if (normalized.startsWith("SHOW COLUMNS")) return [[{ Field: "item_type" }]];
      return [[]];
    },
  };

  const { initializeProductsItemTypeSchema } = require("./productItemType");
  await initializeProductsItemTypeSchema(existingSchema);
  const backfill = itemTypeQueries.find((query) => query.startsWith("UPDATE products p"));
  assert.ok(backfill, "item-type compatibility backfill should run");
  assert.match(
    backfill,
    /WHERE LOWER\(TRIM\(COALESCE\(p\.item_type, ''\)\)\) NOT IN \('stock_item', 'menu_item'\)/,
    "startup must preserve valid explicit product classifications",
  );

  const stockSyncQueries = [];
  const compatibleSchema = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      stockSyncQueries.push(normalized);
      if (normalized.startsWith("SELECT 1 FROM information_schema.COLUMNS")) {
        return [[{ present: 1 }]];
      }
      return [[]];
    },
  };
  const { initializeStockManagerSchema } = require("../services/stockManagerSchemaService");
  await initializeStockManagerSchema(compatibleSchema);
  const stockMirrorSync = stockSyncQueries.find((query) =>
    query.startsWith("INSERT INTO Inventory"),
  );
  assert.ok(stockMirrorSync, "missing stock mirrors should be reconciled at startup");
  assert.match(stockMirrorSync, /LEFT JOIN Inventory i ON i\.Product_ID = m\.Product_ID/);
  assert.match(stockMirrorSync, /i\.Inventory_ID IS NULL/);
  assert.match(stockMirrorSync, /p\.item_type, 'stock_item'.*= 'stock_item'/);

  console.log("Product classification and stock-mirror integrity tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
