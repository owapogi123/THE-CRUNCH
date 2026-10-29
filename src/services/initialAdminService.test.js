"use strict";

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const {
  ensureInitialAdministrator,
  readInitialAdministratorConfig,
} = require("./initialAdminService");

const validEnv = {
  INITIAL_ADMIN_USERNAME: "System Administrator",
  INITIAL_ADMIN_EMAIL: "ADMIN@example.com",
  INITIAL_ADMIN_PASSWORD: "Correct-Horse-42!",
};

function createFreshConnection() {
  const state = { users: [], admins: [], committed: 0, rolledBack: 0 };
  return {
    state,
    async beginTransaction() {},
    async commit() { state.committed += 1; },
    async rollback() { state.rolledBack += 1; },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM users WHERE role = 'administrator'/i.test(normalized)) {
        return [state.users.filter((user) => user.role === "administrator")];
      }
      if (/FROM users WHERE LOWER\(username\)/i.test(normalized)) return [[]];
      if (/FROM Admin WHERE Admin_ID/i.test(normalized)) {
        return [state.admins.filter(
          (admin) => admin.Admin_ID === params[0] || admin.Email === params[1],
        )];
      }
      if (/INSERT INTO users/i.test(normalized)) {
        const id = state.users.length + 1;
        state.users.push({
          id,
          username: params[0],
          email: params[1],
          password_hash: params[2],
          role: "administrator",
        });
        return [{ insertId: id }];
      }
      if (/INSERT INTO Admin/i.test(normalized)) {
        state.admins.push({
          Admin_ID: params[0],
          UserName: params[1],
          Email: params[2],
          Password: params[3],
        });
        return [{ insertId: params[0] }];
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };
}

(async () => {
  const parsed = readInitialAdministratorConfig(validEnv);
  assert.equal(parsed.email, "admin@example.com");
  assert.equal(parsed.password, validEnv.INITIAL_ADMIN_PASSWORD);

  assert.throws(
    () => readInitialAdministratorConfig({}),
    (error) =>
      error.code === "INITIAL_ADMIN_CONFIG_ERROR" &&
      !error.message.includes(validEnv.INITIAL_ADMIN_PASSWORD),
  );
  assert.throws(
    () => readInitialAdministratorConfig({
      ...validEnv,
      INITIAL_ADMIN_PASSWORD: "weak-password",
    }),
    /uppercase, lowercase, number, and special/i,
  );

  const connection = createFreshConnection();
  const messages = [];
  const first = await ensureInitialAdministrator(connection, {
    env: validEnv,
    log: { log: (message) => messages.push(message) },
  });
  assert.deepEqual(first, { created: true, legacyCreated: true });
  assert.equal(connection.state.committed, 1);
  assert.equal(connection.state.users.length, 1);
  assert.equal(connection.state.admins.length, 1);
  assert.equal(connection.state.users[0].email, "admin@example.com");
  assert.notEqual(
    connection.state.users[0].password_hash,
    validEnv.INITIAL_ADMIN_PASSWORD,
  );
  assert.equal(
    await bcrypt.compare(
      validEnv.INITIAL_ADMIN_PASSWORD,
      connection.state.users[0].password_hash,
    ),
    true,
  );
  assert.ok(messages.every((message) => !message.includes(validEnv.INITIAL_ADMIN_PASSWORD)));

  const second = await ensureInitialAdministrator(connection, {
    env: {},
    log: { log: (message) => messages.push(message) },
  });
  assert.deepEqual(second, { created: false, legacyCreated: false });
  assert.equal(connection.state.users.length, 1);
  assert.equal(connection.state.admins.length, 1);

  console.log("Initial Administrator bootstrap tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
