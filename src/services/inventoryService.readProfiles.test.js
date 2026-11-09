"use strict";

const assert = require("node:assert/strict");

const sqlCalls = [];
const sampleInventoryRow = {
  inventory_id: 17,
  product_id: 17,
  product_name: "Chicken Fillet",
  category: "Raw Materials",
  unit: "kg",
  mainStock: "12.5000",
  quantity: "12.5000",
  reorderPoint: "10.0000",
  criticalPoint: "3.0000",
  availability_status: "Available",
  item_type: "stock_item",
};
const sampleAlertRow = {
  inventory_id: 17,
  product_id: 17,
  product_name: "Chicken Fillet",
  category: "Raw Materials",
  unit: "kg",
  mainStock: "12.5000",
  useDefaultThresholds: 0,
  lowStockThreshold: "10.0000",
  criticalStockThreshold: "3.0000",
  item_type: "stock_item",
};

const connection = {
  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    sqlCalls.push(normalized);
    if (normalized.includes("AS dailyWithdrawn")) {
      return [[sampleInventoryRow]];
    }
    return [[sampleAlertRow]];
  },
};

const {
  listRedesignedInventoryAlertRows,
  listRedesignedInventoryRows,
} = require("./inventoryService");

(async () => {
  const inventoryRows = await listRedesignedInventoryRows(connection);
  assert.deepEqual(inventoryRows, [sampleInventoryRow]);

  const alertRows = await listRedesignedInventoryAlertRows(connection);
  assert.deepEqual(alertRows, [sampleAlertRow]);
  assert.equal(sqlCalls.length, 2);

  const inventorySql = sqlCalls[0];
  assert.match(inventorySql, /FROM products p/i);
  assert.match(inventorySql, /LEFT JOIN inventory_balances balance/i);
  assert.match(inventorySql, /FROM stock_movements/i);
  assert.match(inventorySql, /FROM inventory_batches/i);
  assert.match(inventorySql, /LEFT JOIN units unit/i);
  assert.match(inventorySql, /p\.product_type = 'stock_item'/i);
  assert.doesNotMatch(
    inventorySql,
    /\bFROM Inventory\b|\bJOIN Inventory\b|\bMenu\b|Stock_Status|p\.quantity/i,
  );

  const alertSql = sqlCalls[1];
  assert.match(alertSql, /FROM products p/i);
  assert.match(alertSql, /inventory_balances/i);
  assert.match(alertSql, /inventory_categories/i);
  assert.match(alertSql, /units/i);
  assert.doesNotMatch(
    alertSql,
    /\bFROM Inventory\b|\bJOIN Inventory\b|\bMenu\b|Stock_Status|p\.quantity/i,
  );

  for (const sql of sqlCalls) {
    assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  }

  console.log("redesigned inventory read helper tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
