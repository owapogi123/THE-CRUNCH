"use strict";

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "my-account-route-test-secret";

const state = {
  users: new Map(),
  writes: [],
  nextId: 20,
};

function mockModule(request, exports) {
  const id = require.resolve(request);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

mockModule("../config/db", {
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.includes("SELECT id, username, email, role, password_hash") && normalized.includes("WHERE id = ?")) {
      const user = state.users.get(Number(params[0]));
      return [user ? [{ ...user }] : []];
    }
    if (normalized.includes("SELECT id, username, email, password_hash, role, email_verified") && normalized.includes("WHERE email = ? OR username = ?")) {
      const email = String(params[0]).toLowerCase();
      const username = String(params[1]).toLowerCase();
      const user = [...state.users.values()].find(
        (entry) => entry.email.toLowerCase() === email || entry.username.toLowerCase() === username,
      );
      return [user ? [{ ...user, email_verified: 1 }] : []];
    }
    if (normalized.includes("WHERE LOWER(username) = LOWER(?) AND id <> ?")) {
      const username = String(params[0]).toLowerCase();
      const excludedId = Number(params[1]);
      const duplicate = [...state.users.values()].find(
        (user) => user.id !== excludedId && user.username.toLowerCase() === username,
      );
      return [duplicate ? [{ id: duplicate.id }] : []];
    }
    if (normalized === "UPDATE users SET username = ? WHERE id = ?") {
      const user = state.users.get(Number(params[1]));
      user.username = String(params[0]);
      state.writes.push({ sql: normalized, params: [...params] });
      return [{ affectedRows: 1 }];
    }
    if (normalized === "UPDATE users SET password_hash = ? WHERE id = ?") {
      const user = state.users.get(Number(params[1]));
      user.password_hash = String(params[0]);
      state.writes.push({ sql: normalized, params: [...params] });
      return [{ affectedRows: 1 }];
    }
    if (normalized === "SELECT id FROM users WHERE email = ? OR username = ?") {
      const email = String(params[0]).toLowerCase();
      const username = String(params[1]).toLowerCase();
      const duplicate = [...state.users.values()].find(
        (user) => user.email.toLowerCase() === email || user.username.toLowerCase() === username,
      );
      return [duplicate ? [{ id: duplicate.id }] : []];
    }
    if (normalized.startsWith("INSERT INTO users")) {
      const id = state.nextId++;
      state.users.set(id, {
        id,
        username: params[0],
        email: params[1],
        password_hash: params[2],
        role: params[3],
      });
      state.writes.push({ sql: normalized, params: [...params] });
      return [{ insertId: id, affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${normalized}`);
  },
});
mockModule("../services/schemaAssertions", {
  async assertTableColumns() {},
});

const router = require("./userRoutes");
const authRouter = require("./authRoutes");

function handlersFor(path, method, targetRouter = router) {
  const route = targetRouter.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  )?.route;
  assert.ok(route, `${method.toUpperCase()} ${path} route missing`);
  return route.stack.map((entry) => entry.handle);
}

function tokenFor(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function invoke(handlers, { userId, role, body = {}, authenticated = true }) {
  const req = {
    headers: authenticated ? { authorization: `Bearer ${tokenFor(userId, role)}` } : {},
    body,
  };
  const result = { statusCode: 200, body: null, headers: {} };
  const res = {
    status(code) { result.statusCode = code; return this; },
    set(name, value) { result.headers[name] = value; return this; },
    json(payload) { result.body = payload; return this; },
  };
  async function dispatch(index) {
    if (!handlers[index]) return;
    let nextPromise = null;
    await handlers[index](req, res, () => {
      nextPromise = dispatch(index + 1);
      return nextPromise;
    });
    if (nextPromise) await nextPromise;
  }
  await dispatch(0);
  return result;
}

(async () => {
  const roles = ["administrator", "cashier", "cook", "inventory_manager", "customer"];
  const passwordHash = await bcrypt.hash("Oldpass1", 4);
  roles.forEach((role, index) => {
    const id = index + 1;
    state.users.set(id, {
      id,
      username: `${role.replace("_", " ")} user`,
      email: `${role}@example.test`,
      role,
      password_hash: passwordHash,
    });
  });

  const getHandlers = handlersFor("/me", "get");
  const updateHandlers = handlersFor("/me", "put");
  const passwordHandlers = handlersFor("/me/password", "put");
  const createStaffHandlers = handlersFor("/staff/create", "post");
  const loginHandlers = handlersFor("/login", "post", authRouter);

  const unauthenticated = await invoke(getHandlers, {
    userId: 1,
    role: "administrator",
    authenticated: false,
  });
  assert.equal(unauthenticated.statusCode, 401);

  for (let index = 0; index < roles.length; index += 1) {
    const id = index + 1;
    const response = await invoke(getHandlers, { userId: id, role: roles[index] });
    assert.equal(response.statusCode, 200, roles[index]);
    assert.equal(response.body.id, id);
    assert.equal(response.body.role, roles[index]);
    assert.equal("password_hash" in response.body, false);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
  }

  state.writes = [];
  const crossAccountAttempt = await invoke(updateHandlers, {
    userId: 2,
    role: "cashier",
    body: { id: 5, username: "Changed Customer", role: "administrator" },
  });
  assert.equal(crossAccountAttempt.statusCode, 400);
  assert.equal(state.writes.length, 0);
  assert.notEqual(state.users.get(5).username, "Changed Customer");

  const duplicateEmailAttempt = await invoke(updateHandlers, {
    userId: 5,
    role: "customer",
    body: { username: "Updated Customer", email: state.users.get(2).email },
  });
  assert.equal(duplicateEmailAttempt.statusCode, 400);
  assert.notEqual(state.users.get(5).email, state.users.get(2).email);

  const customerUpdate = await invoke(updateHandlers, {
    userId: 5,
    role: "customer",
    body: { username: "Updated Customer" },
  });
  assert.equal(customerUpdate.statusCode, 200);
  assert.equal(customerUpdate.body.username, "Updated Customer");
  assert.equal(customerUpdate.body.role, "customer");
  assert.equal(state.writes.at(-1).params[1], 5);

  const duplicate = await invoke(updateHandlers, {
    userId: 5,
    role: "customer",
    body: { username: state.users.get(2).username },
  });
  assert.equal(duplicate.statusCode, 409);

  state.writes = [];
  const wrongPassword = await invoke(passwordHandlers, {
    userId: 3,
    role: "cook",
    body: {
      currentPassword: "Wrongpass1",
      newPassword: "Newpass2",
      confirmPassword: "Newpass2",
    },
  });
  assert.equal(wrongPassword.statusCode, 400);
  assert.match(wrongPassword.body.message, /incorrect/i);
  assert.equal(state.writes.length, 0);

  const changedPassword = await invoke(passwordHandlers, {
    userId: 3,
    role: "cook",
    body: {
      currentPassword: "Oldpass1",
      newPassword: "Newpass2",
      confirmPassword: "Newpass2",
    },
  });
  assert.equal(changedPassword.statusCode, 200);
  assert.equal(state.writes.at(-1).params[1], 3);
  assert.equal(await bcrypt.compare("Newpass2", state.users.get(3).password_hash), true);
  assert.equal(state.users.get(2).password_hash, passwordHash);

  const cookLogin = await invoke(loginHandlers, {
    userId: 0,
    role: "",
    authenticated: false,
    body: { email: "cook@example.test", password: "Newpass2" },
  });
  assert.equal(cookLogin.statusCode, 403);
  assert.match(cookLogin.body.message, /retired/i);

  const createCook = await invoke(createStaffHandlers, {
    userId: 1,
    role: "administrator",
    body: {
      username: "Kitchen Cook",
      email: "new-cook@example.test",
      password: "Cookpass1",
      role: "cook",
    },
  });
  assert.equal(createCook.statusCode, 400);
  assert.equal(createCook.body.message, "Invalid role");

  console.log("My Account ownership, password, and retired Cook-role guards passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
