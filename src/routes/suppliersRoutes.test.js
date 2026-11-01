const assert = require("node:assert/strict");

const state = {
  nextSupplierId: 41,
  suppliers: new Map(),
  supplierInserts: [],
  productLookups: [],
  history: [],
};

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function supplierRow(id) {
  return state.suppliers.get(Number(id)) || null;
}

mockModule("../config/db", {
  async query(sql, params = []) {
    const query = String(sql).replace(/\s+/g, " ").trim();

    if (query.startsWith("SELECT Supplier_ID FROM Suppliers")) {
      const requestedName = String(params[0] || "").trim().toLowerCase();
      const match = [...state.suppliers.values()].find(
        (supplier) => supplier.supplier_name.toLowerCase() === requestedName,
      );
      return [match ? [{ Supplier_ID: match.supplier_id }] : []];
    }

    if (query.includes("FROM products p") && query.includes("WHERE p.id = ?")) {
      state.productLookups.push({ type: "id", value: Number(params[0]) });
      return [[{ item_type: "stock_item" }]];
    }

    if (query.includes("FROM products p") && query.includes("IN (?)")) {
      const names = Array.isArray(params[0]) ? params[0] : [];
      state.productLookups.push({ type: "names", value: names });
      return [names.map((name) => ({
        normalized_name: String(name).toLowerCase(),
        item_type: "stock_item",
      }))];
    }

    if (query.startsWith("INSERT INTO Suppliers")) {
      const supplierId = state.nextSupplierId++;
      const supplier = {
        supplier_id: supplierId,
        supplier_name: params[0],
        contact_number: params[1],
        delivery_schedule: params[2],
        product_id: params[3],
        email: params[4],
        products_supplied: params[5],
      };
      state.suppliers.set(supplierId, supplier);
      state.supplierInserts.push({ query, params: [...params] });
      return [{ insertId: supplierId, affectedRows: 1 }];
    }

    if (
      query.startsWith("SELECT Supplier_ID AS supplier_id") &&
      query.includes("Products_Supplied AS products_supplied")
    ) {
      const supplier = supplierRow(params[0]);
      return [[supplier].filter(Boolean)];
    }

    if (query.startsWith("UPDATE Suppliers SET Products_Supplied = ?")) {
      const supplier = supplierRow(params[1]);
      if (!supplier) return [{ affectedRows: 0 }];
      supplier.products_supplied = params[0];
      return [{ affectedRows: 1 }];
    }

    if (query.includes("FROM Suppliers") && query.includes("WHERE Supplier_ID = ?")) {
      const supplier = supplierRow(params[0]);
      return [[supplier].filter(Boolean)];
    }

    if (query.startsWith("INSERT INTO supplier_history")) {
      state.history.push([...params]);
      return [{ insertId: state.history.length, affectedRows: 1 }];
    }

    throw new Error(`Unexpected supplier test query: ${query}`);
  },
});

mockModule("../utils/productItemType", {
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() {
    return true;
  },
  getProductItemTypeExpression() {
    return "'stock_item'";
  },
});

const router = require("./suppliersRoutes");

function handlerFor(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route was not found`);
  return layer.route.stack.at(-1).handle;
}

const createSupplier = handlerFor("/", "post");
const mergeSupplierProducts = handlerFor("/:supplier_id/products", "patch");

async function invoke(handler, { body = {}, params = {} } = {}) {
  const req = { body, params };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
  };
  await handler(req, res);
  return result;
}

(async () => {
  const withoutProducts = await invoke(createSupplier, {
    body: {
      supplier_name: "No Product Supplier",
      contact_number: "0917-123-4567",
      email: "supplier@example.test",
      products_supplied: "",
    },
  });
  assert.equal(withoutProducts.statusCode, 201);
  assert.equal(withoutProducts.body.supplier_id, 41);
  assert.equal(withoutProducts.body.product_id, null);
  assert.equal(withoutProducts.body.products_supplied, null);
  assert.equal(state.supplierInserts[0].params[3], null);
  assert.equal(state.productLookups.length, 0);

  const invalidProductId = await invoke(createSupplier, {
    body: {
      supplier_name: "Invalid Product Supplier",
      product_id: 0,
    },
  });
  assert.equal(invalidProductId.statusCode, 400);
  assert.match(invalidProductId.body.message, /positive integer/i);
  assert.equal(state.supplierInserts.length, 1);

  const withProduct = await invoke(createSupplier, {
    body: {
      supplier_name: "Product Supplier",
      product_id: 7,
      products_supplied: "Flour",
    },
  });
  assert.equal(withProduct.statusCode, 201);
  assert.equal(withProduct.body.product_id, 7);
  assert.equal(withProduct.body.products_supplied, "Flour");
  assert.deepEqual(
    state.productLookups.map((lookup) => lookup.type),
    ["id", "names"],
  );

  const associatedFromPurchaseOrder = await invoke(mergeSupplierProducts, {
    params: { supplier_id: "41" },
    body: { products: ["Flour"] },
  });
  assert.equal(associatedFromPurchaseOrder.statusCode, 200);
  assert.equal(associatedFromPurchaseOrder.body.products_supplied, "Flour");
  assert.equal(
    state.history.some((entry) => entry[2] === "Products Updated via PO"),
    true,
  );

  console.log(
    "Supplier creation without products, product validation, and PO association tests passed",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
