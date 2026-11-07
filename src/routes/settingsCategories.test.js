"use strict";

const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "category-settings-test-only-secret";

const db = require("../config/db");
const originalQuery = db.query;
const originalGetConnection = db.getConnection;

const categoryTables = {
  menu_categories: [
    { category_id: 1, name: "Snack", display_order: 1, is_active: 1 },
    { category_id: 2, name: "Drinks", display_order: 2, is_active: 1 },
  ],
  inventory_categories: [
    {
      category_id: 10,
      name: "Ingredients",
      type: "ingredient",
      date_tracking_type: "none",
      is_active: 1,
    },
  ],
};
const products = [
  { id: 101, item_type: "menu_item", category: "Snack" },
  { id: 102, item_type: "stock_item", category: "Snack" },
  { id: 103, item_type: "stock_item", category: "Ingredients" },
];

function rowFor(tableName, id) {
  return categoryTables[tableName].find(
    (row) => Number(row.category_id) === Number(id),
  );
}

function cloneRow(row) {
  return row ? { ...row, created_at: null, updated_at: null } : undefined;
}

const connection = {
  began: 0,
  committed: 0,
  rolledBack: 0,
  released: 0,
  async beginTransaction() {
    this.began += 1;
  },
  async commit() {
    this.committed += 1;
  },
  async rollback() {
    this.rolledBack += 1;
  },
  release() {
    this.released += 1;
  },
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    const tableName = normalized.includes("inventory_categories")
      ? "inventory_categories"
      : normalized.includes("menu_categories")
        ? "menu_categories"
        : null;

    if (normalized.startsWith("SELECT name FROM") && normalized.endsWith("FOR UPDATE")) {
      return [[cloneRow(rowFor(tableName, params[0]))].filter(Boolean)];
    }
    if (normalized.startsWith("SELECT category_id FROM") && normalized.includes("category_id <> ?")) {
      const [name, excludedId] = params;
      const duplicate = categoryTables[tableName].find(
        (row) =>
          row.name.toLowerCase() === String(name).toLowerCase() &&
          Number(row.category_id) !== Number(excludedId),
      );
      return [[duplicate ? { category_id: duplicate.category_id } : null].filter(Boolean)];
    }
    if (normalized.startsWith(`UPDATE ${tableName} SET name = ?`)) {
      const row = rowFor(tableName, params.at(-1));
      if (row) row.name = String(params[0]);
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (normalized.startsWith("UPDATE Menu m INNER JOIN products p")) {
      const [nextName, previousName] = params;
      const itemType = normalized.includes("= 'menu_item'")
        ? "menu_item"
        : "stock_item";
      let affectedRows = 0;
      for (const product of products) {
        if (
          product.item_type === itemType &&
          product.category.trim().toLowerCase() ===
            String(previousName).trim().toLowerCase()
        ) {
          product.category = String(nextName);
          affectedRows += 1;
        }
      }
      return [{ affectedRows }];
    }
    if (normalized.startsWith("SELECT category_id, name")) {
      return [[cloneRow(rowFor(tableName, params[0]))].filter(Boolean)];
    }
    throw new Error(`Unexpected transaction query: ${normalized}`);
  },
};

db.getConnection = async () => connection;
db.query = async (sql, params = []) => {
  const normalized = String(sql).replace(/\s+/g, " ").trim();
  if (normalized.startsWith("SELECT category_id FROM")) {
    const tableName = normalized.includes("inventory_categories")
      ? "inventory_categories"
      : "menu_categories";
    const duplicate = categoryTables[tableName].find(
      (row) => row.name.toLowerCase() === String(params[0]).toLowerCase(),
    );
    return [[duplicate ? { category_id: duplicate.category_id } : null].filter(Boolean)];
  }
  throw new Error(`Unexpected database query: ${normalized}`);
};

const router = require("./settingsRoutes");

function auth(role = "administrator") {
  const token = jwt.sign({ role, userId: 7 }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });
  return { Authorization: `Bearer ${token}` };
}

async function withServer(operation) {
  const app = express();
  app.use(express.json());
  app.use("/api/settings", router);
  const server = await new Promise((resolve) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  });
  try {
    await operation(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function patchCategory(baseUrl, path, body, role = "administrator") {
  return fetch(`${baseUrl}/api/settings/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(role) },
    body: JSON.stringify(body),
  });
}

(async () => {
  await withServer(async (baseUrl) => {
    const unauthorized = await patchCategory(
      baseUrl,
      "menu-categories/1",
      { name: "Snacks" },
      "cashier",
    );
    assert.equal(unauthorized.status, 403);

    const menuRename = await patchCategory(baseUrl, "menu-categories/1", {
      name: "Snacks",
    });
    assert.equal(menuRename.status, 200);
    assert.equal((await menuRename.json()).name, "Snacks");
    assert.equal(products[0].category, "Snacks");
    assert.equal(
      products[1].category,
      "Snack",
      "menu category rename must not rewrite stock-item categories",
    );

    const inventoryRename = await patchCategory(
      baseUrl,
      "inventory-categories/10",
      { name: "Kitchen Ingredients" },
    );
    assert.equal(inventoryRename.status, 200);
    assert.equal(products[2].category, "Kitchen Ingredients");

    const duplicate = await patchCategory(baseUrl, "menu-categories/1", {
      name: "dRiNkS",
    });
    assert.equal(duplicate.status, 409);
    assert.equal(categoryTables.menu_categories[0].name, "Snacks");

    const empty = await patchCategory(baseUrl, "menu-categories/1", {
      name: "   ",
    });
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).message, /required/i);
  });

  assert.equal(connection.began, connection.committed + connection.rolledBack);
  assert.equal(connection.released, connection.began);
  console.log("Category settings rename and authorization tests passed.");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
  });
