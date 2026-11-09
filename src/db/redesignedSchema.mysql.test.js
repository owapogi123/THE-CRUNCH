"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const {
  REDESIGNED_EXPECTED_TABLES,
  verifyRedesignedSchemaCompatibility,
} = require("../services/redesignedSchemaCompatibilityService");

const TEST_ENV_PATH = path.resolve(__dirname, "../../.env.test.local");
const EXPECTED_HOST = "127.0.0.1";
const EXPECTED_PORT = 3306;
const EXPECTED_DATABASE = "the_crunch_integration_test";
const EXPECTED_USER = "the_crunch_test_runner";
const LEGACY_INTEGRATION_TABLES = [
  "admin",
  "batches",
  "inventory",
  "menu",
  "menu_item_ingredients",
  "order_inventory_deductions",
  "order_item",
  "orders",
  "paymongo_checkout_intents",
  "paymongo_webhook_events",
  "products",
  "schema_migrations",
  "stock_status",
];
const ALLOWED_TABLES = new Set([
  ...LEGACY_INTEGRATION_TABLES,
  ...REDESIGNED_EXPECTED_TABLES,
]);

function loadConfig() {
  assert.ok(fs.existsSync(TEST_ENV_PATH), ".env.test.local is required");
  const parsed = dotenv.parse(fs.readFileSync(TEST_ENV_PATH));
  const config = {
    host: String(parsed.INTEGRATION_DB_HOST || "").trim(),
    port: Number(parsed.INTEGRATION_DB_PORT),
    database: String(parsed.INTEGRATION_DB_NAME || "").trim(),
    user: String(parsed.INTEGRATION_DB_USER || "").trim(),
    password: String(parsed.INTEGRATION_DB_PASSWORD || ""),
  };
  assert.equal(config.host, EXPECTED_HOST);
  assert.equal(config.port, EXPECTED_PORT);
  assert.equal(config.database, EXPECTED_DATABASE);
  assert.equal(config.user, EXPECTED_USER);
  assert.ok(config.password);
  return config;
}

function tableName(row) {
  return String(Object.values(row)[0] || "").toLowerCase();
}

async function assertIsolation(connection) {
  const [[identity]] = await connection.query(
    "SELECT CURRENT_USER() AS currentUser, DATABASE() AS database_name, " +
      "@@port AS port, @@read_only AS read_only",
  );
  assert.equal(identity.database_name, EXPECTED_DATABASE);
  assert.equal(Number(identity.port), EXPECTED_PORT);
  assert.equal(Number(identity.read_only), 0);
  assert.match(
    String(identity.currentUser).toLowerCase(),
    /^the_crunch_test_runner@(localhost|127\.0\.0\.1)$/,
  );

  const [grantRows] = await connection.query("SHOW GRANTS");
  for (const row of grantRows) {
    const grant = String(Object.values(row)[0] || "");
    assert.doesNotMatch(grant, /WITH GRANT OPTION/i);
    if (/\bON\b/i.test(grant) && !/^GRANT USAGE ON \*\.\*/i.test(grant)) {
      assert.match(
        grant,
        new RegExp("ON \\x60" + EXPECTED_DATABASE + "\\x60\\.\\*", "i"),
      );
    }
  }

  const [tables] = await connection.query("SHOW TABLES");
  const unexpected = tables
    .map(tableName)
    .filter((name) => !ALLOWED_TABLES.has(name));
  assert.deepEqual(
    unexpected,
    [],
    "Disposable database contains unexpected tables; refusing cleanup.",
  );
}

async function clearDisposableDatabase(connection) {
  const [tables] = await connection.query("SHOW TABLES");
  const names = tables.map(tableName);
  const unexpected = names.filter((name) => !ALLOWED_TABLES.has(name));
  assert.deepEqual(unexpected, []);
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    const quote = String.fromCharCode(96);
    for (const name of names) {
      assert.match(name, /^[a-z0-9_]+$/);
      await connection.query(
        "DROP TABLE IF EXISTS " + quote + name + quote,
      );
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
}

(async () => {
  const config = loadConfig();
  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: false,
  });

  try {
    await assertIsolation(connection);
    await clearDisposableDatabase(connection);

    Object.assign(process.env, {
      DB_HOST: config.host,
      DB_PORT: String(config.port),
      DB_NAME: config.database,
      DB_USER: config.user,
      DB_PASSWORD: config.password,
      DB_SCHEMA_PROFILE: "redesigned",
    });
    const firstPassword = "L0cal!Redesigned#Admin";
    const firstEnv = {
      ...process.env,
      BOOTSTRAP_ADMIN_USERNAME: "local_admin",
      BOOTSTRAP_ADMIN_EMAIL: "local-admin@example.test",
      BOOTSTRAP_ADMIN_PASSWORD: firstPassword,
    };

    const { migrate } = require("./migrate");
    await connection.query(
      "CREATE TABLE users (id INT PRIMARY KEY) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TABLE Menu (Product_ID INT PRIMARY KEY) ENGINE=InnoDB",
    );
    await assert.rejects(
      migrate({
        connection,
        env: firstEnv,
        profile: "redesigned",
        log: { log() {}, error() {} },
      }),
      (error) => error.code === "DB_SCHEMA_PROFILE_MISMATCH",
    );
    const [legacyBoundaryTables] = await connection.query("SHOW TABLES");
    assert.deepEqual(
      legacyBoundaryTables.map(tableName).sort(),
      ["menu", "users"],
    );
    await clearDisposableDatabase(connection);

    await migrate({
      connection,
      env: firstEnv,
      profile: "redesigned",
      log: { log() {}, error() {} },
    });
    const verification = await verifyRedesignedSchemaCompatibility(
      connection,
      config.database,
    );
    assert.equal(
      verification.tableCount,
      REDESIGNED_EXPECTED_TABLES.length,
    );

    const [[counts]] = await connection.query(
      "SELECT " +
        "(SELECT COUNT(*) FROM menu_categories) AS menu_categories, " +
        "(SELECT COUNT(*) FROM inventory_categories) AS inventory_categories, " +
        "(SELECT COUNT(*) FROM units) AS units, " +
        "(SELECT COUNT(*) FROM discount_types) AS discounts, " +
        "(SELECT COUNT(*) FROM users WHERE role = 'administrator') AS administrators, " +
        "(SELECT COUNT(*) FROM products) AS products, " +
        "(SELECT COUNT(*) FROM suppliers) AS suppliers, " +
        "(SELECT COUNT(*) FROM inventory_balances) AS inventory_balances, " +
        "(SELECT COUNT(*) FROM orders) AS orders",
    );
    assert.equal(Number(counts.menu_categories), 2);
    assert.equal(Number(counts.inventory_categories), 1);
    assert.equal(Number(counts.units), 8);
    assert.equal(Number(counts.discounts), 3);
    assert.equal(Number(counts.administrators), 1);
    assert.equal(Number(counts.products), 0);
    assert.equal(Number(counts.suppliers), 0);
    assert.equal(Number(counts.inventory_balances), 0);
    assert.equal(Number(counts.orders), 0);

    const [[administrator]] = await connection.query(
      "SELECT id, password_hash FROM users WHERE role = 'administrator'",
    );
    assert.equal(
      await bcrypt.compare(firstPassword, administrator.password_hash),
      true,
    );
    const originalHash = administrator.password_hash;

    await migrate({
      connection,
      env: {
        ...firstEnv,
        BOOTSTRAP_ADMIN_PASSWORD: "D1fferent!Bootstrap#Password",
      },
      profile: "redesigned",
      log: { log() {}, error() {} },
    });
    const [[afterRerun]] = await connection.query(
      "SELECT COUNT(*) AS count, MIN(password_hash) AS password_hash " +
        "FROM users WHERE role = 'administrator'",
    );
    assert.equal(Number(afterRerun.count), 1);
    assert.equal(afterRerun.password_hash, originalHash);

    const [[migrationCount]] = await connection.query(
      "SELECT COUNT(*) AS count FROM schema_migrations",
    );
    assert.equal(Number(migrationCount.count), 2);

    console.log("Redesigned empty-database MySQL integration tests passed.");
  } finally {
    await assertIsolation(connection);
    await clearDisposableDatabase(connection);
    await connection.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
