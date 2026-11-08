"use strict";

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const {
  bootstrapAdministrator,
  readBootstrapAdminConfig,
} = require("./administratorBootstrapService");

function createFakeConnection() {
  const users = [];
  return {
    users,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT id FROM users")) {
        const administrator = users.find(
          (user) => user.role === "administrator",
        );
        return [administrator ? [{ id: administrator.id }] : []];
      }
      if (normalized.startsWith("SELECT id, role FROM users")) {
        return [users
          .filter(
            (user) => user.username === params[0] || user.email === params[1],
          )
          .map((user) => ({ id: user.id, role: user.role }))
          .slice(0, 1)];
      }
      if (normalized.startsWith("INSERT INTO users")) {
        const user = {
          id: users.length + 1,
          username: params[0],
          email: params[1],
          password_hash: params[2],
          role: "administrator",
        };
        users.push(user);
        return [{ insertId: user.id, affectedRows: 1 }];
      }
      throw new Error("Unexpected SQL: " + normalized);
    },
  };
}

const initialEnv = {
  BOOTSTRAP_ADMIN_USERNAME: "capstone_admin",
  BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
  BOOTSTRAP_ADMIN_PASSWORD: "S3cure!Bootstrap#2026",
};

(async () => {
  assert.throws(
    () =>
      readBootstrapAdminConfig({
        BOOTSTRAP_ADMIN_USERNAME: "partial",
      }),
    (error) => error.code === "ADMIN_BOOTSTRAP_CONFIG_ERROR",
  );
  assert.throws(
    () =>
      readBootstrapAdminConfig({
        BOOTSTRAP_ADMIN_USERNAME: "capstone_admin",
        BOOTSTRAP_ADMIN_EMAIL: "admin@example.test",
        BOOTSTRAP_ADMIN_PASSWORD: "weak",
      }),
    (error) => error.code === "ADMIN_BOOTSTRAP_CONFIG_ERROR",
  );

  const missingConnection = createFakeConnection();
  await assert.rejects(
    bootstrapAdministrator(missingConnection, {
      env: {},
      log: { log() {} },
      bcryptRounds: 4,
    }),
    (error) => error.code === "ADMIN_BOOTSTRAP_CONFIG_ERROR",
  );

  const connection = createFakeConnection();
  const first = await bootstrapAdministrator(connection, {
    env: initialEnv,
    log: { log() {} },
    bcryptRounds: 4,
  });
  assert.equal(first.created, true);
  assert.equal(connection.users.length, 1);
  assert.equal(connection.users[0].password_hash.includes(initialEnv.BOOTSTRAP_ADMIN_PASSWORD), false);
  assert.equal(
    await bcrypt.compare(
      initialEnv.BOOTSTRAP_ADMIN_PASSWORD,
      connection.users[0].password_hash,
    ),
    true,
  );

  const originalHash = connection.users[0].password_hash;
  const second = await bootstrapAdministrator(connection, {
    env: {
      ...initialEnv,
      BOOTSTRAP_ADMIN_PASSWORD: "An0ther!Secure#Password",
    },
    log: { log() {} },
    bcryptRounds: 4,
  });
  assert.equal(second.created, false);
  assert.equal(connection.users.length, 1);
  assert.equal(connection.users[0].password_hash, originalHash);

  const third = await bootstrapAdministrator(connection, {
    env: {},
    log: { log() {} },
    bcryptRounds: 4,
  });
  assert.equal(third.created, false);
  assert.equal(connection.users.length, 1);
  assert.equal(connection.users[0].password_hash, originalHash);

  console.log("Administrator bootstrap tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
