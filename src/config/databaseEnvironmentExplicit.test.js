"use strict";

const assert = require("node:assert/strict");
const { validateDatabaseConfig } = require("./databaseEnvironment");

const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const original = new Map(required.map((key) => [key, process.env[key]]));

try {
  for (const key of required) delete process.env[key];
  assert.throws(
    () => validateDatabaseConfig({ port: 3306 }, { requireExplicit: true }),
    (error) => error && error.code === "DB_CONFIG_ERROR",
  );

  Object.assign(process.env, {
    DB_HOST: "127.0.0.1",
    DB_PORT: "3306",
    DB_USER: "test-user",
    DB_PASSWORD: "test-password",
    DB_NAME: "thecrunch_updated_local",
  });
  assert.equal(
    validateDatabaseConfig(
      {
        host: "127.0.0.1",
        port: 3306,
        user: "test-user",
        password: "test-password",
        database: "thecrunch_updated_local",
      },
      { requireExplicit: true },
    ).database,
    "thecrunch_updated_local",
  );
  console.log("Explicit database configuration tests passed.");
} finally {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
