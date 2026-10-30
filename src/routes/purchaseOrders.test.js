const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "purchase-order-route-test-secret";

const original = {
  po: null,
  items: [],
  product: null,
  productRows: null,
  batches: [],
};
const state = {
  ...original,
  lockHeld: false,
  waiters: [],
  commits: 0,
  rollbacks: 0,
  inventoryAdds: 0,
  failProductUpdate: false,
  connections: 0,
  productLookup: null,
  notifications: [],
};

function cloneData() {
  return JSON.parse(JSON.stringify({
    po: state.po,
    items: state.items,
    product: state.product,
    productRows: state.productRows,
    batches: state.batches,
    inventoryAdds: state.inventoryAdds,
  }));
}

function restoreData(snapshot) {
  state.po = snapshot.po;
  state.items = snapshot.items;
  state.product = snapshot.product;
  state.productRows = snapshot.productRows;
  state.batches = snapshot.batches;
  state.inventoryAdds = snapshot.inventoryAdds;
}

function reset(status = "Ordered") {
  state.po = { po_id: "PO-0001", supplier: "Supplier", status };
  state.items = [{
    item_id: 1,
    po_id: "PO-0001",
    product_id: 7,
    name: "Flour",
    category: "Raw Material",
    unit: "kg",
    quantity: 3,
    unit_cost: 20,
  }];
  state.product = {
    product_id: 7,
    product_name: "Flour",
    product_quantity: 10,
    menu_product_id: 7,
    menu_stock: 10,
    category_name: "Raw Material",
    inventory_id: 70,
    inventory_stock: 10,
    inventory_unit: "kg",
  };
  state.productRows = null;
  state.batches = [];
  state.commits = 0;
  state.rollbacks = 0;
  state.inventoryAdds = 0;
  state.failProductUpdate = false;
  state.connections = 0;
  state.productLookup = null;
  state.lockHeld = false;
  state.waiters = [];
  state.notifications = [];
}

async function acquireLock() {
  if (!state.lockHeld) {
    state.lockHeld = true;
    return;
  }
  await new Promise((resolve) => state.waiters.push(resolve));
}

function releaseLock() {
  const next = state.waiters.shift();
  if (next) next();
  else state.lockHeld = false;
}

function createConnection() {
  let ownsLock = false;
  let snapshot = null;
  return {
    async beginTransaction() {},
    async commit() {
      state.commits += 1;
      snapshot = null;
      if (ownsLock) {
        ownsLock = false;
        releaseLock();
      }
    },
    async rollback() {
      state.rollbacks += 1;
      if (snapshot) restoreData(snapshot);
      snapshot = null;
      if (ownsLock) {
        ownsLock = false;
        releaseLock();
      }
    },
    release() {},
    async query(sql, params = []) {
      const q = String(sql).replace(/\s+/g, " ").trim();
      if (q.includes("FROM purchase_orders") && q.endsWith("FOR UPDATE")) {
        assert.match(q, /FOR UPDATE$/);
        await acquireLock();
        ownsLock = true;
        snapshot = cloneData();
        return [state.po ? [{ ...state.po }] : []];
      }
      if (q.startsWith("SELECT * FROM purchase_orders")) {
        return [state.po ? [{ ...state.po }] : []];
      }
      if (q.startsWith("SELECT * FROM purchase_order_items")) {
        return [state.items.map((item) => ({ ...item }))];
      }
      if (q.startsWith("SELECT value FROM po_counter")) {
        return [[{ value: 1 }]];
      }
      if (q.startsWith("SELECT p.id AS product_id")) {
        state.productLookup = { sql: q, params: [...params] };
        if (state.productRows) {
          return [state.productRows.map((product) => ({ ...product }))];
        }
        return [state.product ? [{ ...state.product }] : []];
      }
      if (q.startsWith("SELECT DISTINCT unit FROM batches")) {
        return [[...new Set(state.batches.map((batch) => batch.unit))].map((unit) => ({ unit }))];
      }
      if (q.includes("FROM inventory_categories")) {
        return [[{ name: "Raw Material", date_tracking_type: "none" }]];
      }
      if (q.startsWith("INSERT INTO batches")) {
        state.batches.push({ product_id: params[0], quantity: params[1], unit: params[3] });
        return [{ insertId: state.batches.length, affectedRows: 1 }];
      }
      if (q.startsWith("INSERT INTO purchase_orders")) {
        state.po = {
          po_id: params[0],
          supplier: params[1],
          contact: params[2],
          order_date: params[3],
          delivery_date: params[4],
          status: params[5],
        };
        state.items = [];
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("INSERT INTO purchase_order_items")) {
        state.items.push({
          item_id: state.items.length + 1,
          po_id: params[0],
          product_id: params[1],
          name: params[2],
          category: params[3],
          unit: params[4],
          quantity: params[5],
          unit_cost: params[6],
        });
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("DELETE FROM purchase_order_items")) {
        state.items = [];
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("INSERT INTO staff_notifications")) {
        state.notifications.push({ sql: q, params: [...params] });
        return [{ insertId: state.notifications.length, affectedRows: 1 }];
      }
      if (q.startsWith("INSERT INTO Inventory")) {
        state.product.inventory_id = 70;
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE Inventory")) {
        state.product.inventory_stock += Number(params[0]);
        state.inventoryAdds += Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE Menu SET Stock")) {
        state.product.menu_stock += Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE products SET quantity")) {
        if (state.failProductUpdate) throw new Error("simulated product update failure");
        state.product.product_quantity += Number(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE purchase_orders SET status = 'Received'")) {
        if (state.po.status !== "Ordered") return [{ affectedRows: 0 }];
        state.po.status = "Received";
        state.po.receipt_no = params[0];
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE purchase_orders SET status = 'Cancelled'")) {
        state.po.status = "Cancelled";
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE purchase_orders SET status = ?")) {
        state.po.status = params[0];
        return [{ affectedRows: 1 }];
      }
      if (q.startsWith("UPDATE purchase_orders SET supplier = ?")) {
        if (state.po.status !== "Draft") return [{ affectedRows: 0 }];
        state.po = {
          ...state.po,
          supplier: params[0],
          contact: params[1],
          order_date: params[2],
          delivery_date: params[3],
          notes: params[4],
        };
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
}

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async getConnection() {
    state.connections += 1;
    return createConnection();
  },
  async query(sql) {
    const q = String(sql).replace(/\s+/g, " ").trim();
    if (q.includes("FROM purchase_orders")) {
      return [state.po ? [{ ...state.po }] : []];
    }
    if (q.includes("FROM purchase_order_items")) {
      return [state.items.map((item) => ({ ...item }))];
    }
    return [{ affectedRows: 1 }];
  },
});
mockModule("../utils/productItemType", {
  STOCK_ITEM: "stock_item",
  async ensureProductsItemTypeSchema() { return true; },
  getProductItemTypeExpression() { return "'stock_item'"; },
});

const router = require("./purchaseOrders");

function handlersFor(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  return layer.route.stack.map((entry) => entry.handle);
}

const statusHandlers = handlersFor("/:id/status", "patch");
const receiveHandlers = handlersFor("/:id/receive", "patch");
const cancelHandlers = handlersFor("/:id", "delete");
const createHandlers = handlersFor("/", "post");
const listHandlers = handlersFor("/", "get");
const detailHandlers = handlersFor("/:id", "get");
const editHandlers = handlersFor("/:id", "put");

function tokenFor(role) {
  return jwt.sign({ role, userId: 20 }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function invoke(
  handlers,
  { role = "inventory_manager", body = {}, authenticated = true } = {},
) {
  const req = {
    headers: authenticated
      ? { authorization: `Bearer ${tokenFor(role)}` }
      : {},
    params: { id: "PO-0001" },
    body,
  };
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(payload) { result.body = payload; return this; },
  };
  async function dispatch(index) {
    if (!handlers[index]) return;
    await handlers[index](req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return result;
}

(async () => {
  reset("Ordered");
  for (const handlers of [listHandlers, detailHandlers]) {
    const unauthenticated = await invoke(handlers, { authenticated: false });
    assert.equal(unauthenticated.statusCode, 401);

    const customer = await invoke(handlers, { role: "customer" });
    assert.equal(customer.statusCode, 403);

    const cashier = await invoke(handlers, { role: "cashier" });
    assert.equal(cashier.statusCode, 403);

    const inventoryManager = await invoke(handlers);
    assert.equal(inventoryManager.statusCode, 200);

    const administrator = await invoke(handlers, { role: "administrator" });
    assert.equal(administrator.statusCode, 200);
  }

  reset("Draft");
  const createAsReceived = await invoke(createHandlers, {
    body: {
      supplier: "Supplier",
      deliveryDate: "2026-10-24",
      status: "Received",
      items: [{ productId: 7, name: "Flour", unit: "kg", quantity: 3 }],
    },
  });
  assert.equal(createAsReceived.statusCode, 409);
  assert.equal(state.connections, 0);

  reset("Draft");
  const created = await invoke(createHandlers, {
    body: {
      supplier: "Supplier",
      deliveryDate: "2026-10-24",
      items: [{ productId: 7, name: "Flour", unit: "kg", quantity: 3 }],
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.status, "Draft");
  assert.equal(created.body.items[0].productId, 7);
  assert.equal(state.items[0].product_id, 7);
  assert.equal(state.notifications.length, 0);

  reset("Draft");
  const edited = await invoke(editHandlers, {
    body: {
      supplier: "Updated Supplier",
      deliveryDate: "2026-10-27",
      notes: "Updated safely",
      items: [
        {
          productId: 7,
          name: "Flour",
          unit: "kg",
          quantity: 4,
          unitCost: 25,
        },
      ],
    },
  });
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.body.status, "Draft");
  assert.equal(edited.body.supplier, "Updated Supplier");
  assert.equal(edited.body.items.length, 1);
  assert.equal(edited.body.items[0].quantity, 4);

  reset("Ordered");
  const editOrdered = await invoke(editHandlers, {
    body: {
      supplier: "Supplier",
      deliveryDate: "2026-10-27",
      items: [{ productId: 7, name: "Flour", unit: "kg", quantity: 4 }],
    },
  });
  assert.equal(editOrdered.statusCode, 409);
  assert.equal(state.items[0].quantity, 3);

  reset("Draft");
  const ordered = await invoke(statusHandlers, { body: { status: "Ordered" } });
  assert.equal(ordered.statusCode, 200);
  assert.equal(state.po.status, "Ordered");
  assert.equal(state.notifications.length, 0);

  const genericReceive = await invoke(statusHandlers, { body: { status: "Received" } });
  assert.equal(genericReceive.statusCode, 409);
  assert.equal(state.po.status, "Ordered");

  reset("Ordered");
  const cancelled = await invoke(cancelHandlers);
  assert.equal(cancelled.statusCode, 200);
  assert.equal(state.po.status, "Cancelled");
  assert.equal(state.notifications.length, 0);

  reset("Received");
  const receivedCancel = await invoke(cancelHandlers);
  assert.equal(receivedCancel.statusCode, 409);
  assert.equal(state.po.status, "Received");

  for (const status of ["Draft", "Received", "Cancelled"]) {
    reset(status);
    const rejected = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
    assert.equal(rejected.statusCode, 409, status);
    assert.equal(state.inventoryAdds, 0);
  }

  reset("Ordered");
  const received = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
  assert.equal(received.statusCode, 200);
  assert.equal(state.po.status, "Received");
  assert.equal(state.inventoryAdds, 3);
  assert.equal(state.product.inventory_stock, 13);
  assert.equal(state.product.menu_stock, 13);
  assert.equal(state.product.product_quantity, 13);
  assert.equal(state.batches.length, 1);
  assert.equal(state.notifications[0].params[0], "purchase_order:PO-0001:received");
  assert.equal(state.notifications[0].params[4], "administrator,inventory_manager");
  assert.equal(state.notifications[0].params[5], null);

  const duplicate = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(state.inventoryAdds, 3);
  assert.equal(state.batches.length, 1);

  reset("Ordered");
  const concurrent = await Promise.all([
    invoke(receiveHandlers, { body: { receivedBy: "Manager A" } }),
    invoke(receiveHandlers, { body: { receivedBy: "Manager B" } }),
  ]);
  assert.equal(concurrent.filter((result) => result.statusCode === 200).length, 1);
  assert.equal(concurrent.filter((result) => result.statusCode === 409).length, 1);
  assert.equal(state.inventoryAdds, 3);
  assert.equal(state.batches.length, 1);

  reset("Ordered");
  state.items[0].product_id = null;
  const uniqueLegacyMapping = await invoke(receiveHandlers, {
    body: { receivedBy: "Manager" },
  });
  assert.equal(uniqueLegacyMapping.statusCode, 200);
  assert.equal(state.po.status, "Received");
  assert.equal(state.inventoryAdds, 3);
  assert.equal(state.batches.length, 1);
  assert.match(state.productLookup.sql, /LOWER\(TRIM\(p\.name\)\)/);
  assert.equal(state.productLookup.params[0], "Flour");

  reset("Ordered");
  state.items[0].product_id = null;
  state.productRows = [
    { ...state.product },
    {
      ...state.product,
      product_id: 8,
      menu_product_id: 8,
      inventory_id: 80,
    },
  ];
  const ambiguousLegacyMapping = await invoke(receiveHandlers, {
    body: { receivedBy: "Manager" },
  });
  assert.equal(ambiguousLegacyMapping.statusCode, 409);
  assert.match(ambiguousLegacyMapping.body.error, /multiple inventory products/i);
  assert.equal(state.po.status, "Ordered");
  assert.equal(state.inventoryAdds, 0);
  assert.equal(state.batches.length, 0);

  reset("Ordered");
  state.items[0].product_id = null;
  state.product = null;
  const missingMapping = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
  assert.equal(missingMapping.statusCode, 422);
  assert.equal(state.po.status, "Ordered");
  assert.equal(state.inventoryAdds, 0);
  assert.equal(state.batches.length, 0);

  reset("Ordered");
  state.failProductUpdate = true;
  const partialFailure = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
  assert.equal(partialFailure.statusCode, 500);
  assert.equal(state.po.status, "Ordered");
  assert.equal(state.inventoryAdds, 0);
  assert.equal(state.batches.length, 0);
  assert.equal(state.product.inventory_stock, 10);

  reset("Ordered");
  state.product.inventory_unit = "g";
  const badUnit = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
  assert.equal(badUnit.statusCode, 422);
  assert.equal(state.inventoryAdds, 0);

  reset("Ordered");
  state.product.menu_stock = 9;
  const outOfSync = await invoke(receiveHandlers, { body: { receivedBy: "Manager" } });
  assert.equal(outOfSync.statusCode, 409);
  assert.equal(state.inventoryAdds, 0);
  assert.equal(state.po.status, "Ordered");

  reset("Ordered");
  const unauthorized = await invoke(receiveHandlers, {
    role: "cashier",
    body: { receivedBy: "Cashier" },
  });
  assert.equal(unauthorized.statusCode, 403);
  assert.equal(state.connections, 0);

  console.log("Purchase-order route integrity and concurrency tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
