const { performance } = require("node:perf_hooks");
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

process.env.ORDER_TIMING_ENABLED = "1";
const benchmarkDatabase = `the_crunch_cashier_benchmark_${Date.now()}_${process.pid}`;
process.env.DB_NAME = benchmarkDatabase;

const runCountArg = process.argv.find((value) => value.startsWith("--runs="));
const runCount = Math.max(1, Number(runCountArg?.split("=")[1] || 3));

function describeSql(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
}

async function main() {
  const { setup } = require("../src/db/setup");
  await setup({ log: { log() {}, error: console.error } });

  const db = require("../src/config/db");
  const { ensureProductSchema } = require("../src/services/productSchemaService");
  const { initializeStockManagerSchema } = require("../src/services/stockManagerSchemaService");
  await ensureProductSchema(db);
  await initializeStockManagerSchema(db);

  await db.query(
    `INSERT INTO Admin (Admin_ID, UserName, Email, Password)
     VALUES (1, 'Benchmark Admin', 'benchmark-admin@example.invalid', 'not-used')`,
  );
  await db.query(
    `INSERT INTO users (id, username, email, password_hash, role, email_verified)
     VALUES (1, 'benchmark-admin', 'benchmark-user@example.invalid', 'not-used', 'administrator', 1)`,
  );
  await db.query(
    `INSERT INTO Cashier (Cashier_ID, UserName, Password)
     VALUES (1, 'benchmark-admin', 'not-used')`,
  );
  await db.query(
    `INSERT INTO Menu
       (Product_ID, Product_Name, Price, Availability, Stock, manual_override, manual_status)
     VALUES (1, 'Benchmark Item', 100.00, TRUE, 100, 0, 'Available')`,
  );
  await db.query(
    `INSERT INTO products (id, name, price, quantity, item_type)
     VALUES (1, 'Benchmark Item', 100.00, 100, 'menu_item')`,
  );
  await db.query(
    `INSERT INTO Inventory (Product_ID, Quantity, Stock, Item_Purchased)
     VALUES (1, 100, 100, 'Benchmark Item')`,
  );

  const [products] = await db.query(
    `SELECT
       p.id,
       p.name,
       COALESCE(m.Price, p.price, 0) AS price,
       COALESCE(i.Stock, m.Stock, p.quantity, 0) AS availableStock
     FROM products p
     INNER JOIN Menu m ON m.Product_ID = p.id
     LEFT JOIN Inventory i ON i.Product_ID = p.id
     WHERE LOWER(TRIM(COALESCE(p.item_type, ''))) = 'menu_item'
       AND COALESCE(m.manual_override, 0) = 0
       AND COALESCE(i.Stock, m.Stock, p.quantity, 0) >= 1
     ORDER BY p.id
     LIMIT 1`,
  );
  if (!products.length) {
    throw new Error("No in-stock menu_item is available for a rollback-only benchmark");
  }

  const [staffRows] = await db.query(
    `SELECT id
       FROM users
      WHERE role IN ('administrator', 'cashier', 'inventory_manager')
      ORDER BY CASE WHEN role = 'administrator' THEN 0 ELSE 1 END, id
      LIMIT 1`,
  );
  if (!staffRows.length) {
    throw new Error("No staff user is available for a cashier-order benchmark");
  }

  const product = products[0];
  const cashierId = Number(staffRows[0].id);
  const originalPoolQuery = db.query.bind(db);
  const originalGetConnection = db.getConnection.bind(db);
  let currentStatements = null;

  db.query = async (...args) => {
    const startedAt = performance.now();
    try {
      return await originalPoolQuery(...args);
    } finally {
      if (currentStatements) {
        currentStatements.push({
          sql: describeSql(args[0]),
          durationMs: performance.now() - startedAt,
          source: "pool",
        });
      }
    }
  };

  db.getConnection = async () => {
    const connection = await originalGetConnection();
    const rawQuery = connection.query.bind(connection);
    const rawBegin = connection.beginTransaction.bind(connection);
    const rawCommit = connection.commit.bind(connection);

    connection.query = async (...args) => {
      const startedAt = performance.now();
      try {
        return await rawQuery(...args);
      } finally {
        if (currentStatements) {
          currentStatements.push({
            sql: describeSql(args[0]),
            durationMs: performance.now() - startedAt,
            source: "transaction",
          });
        }
      }
    };
    connection.beginTransaction = async () => {
      const startedAt = performance.now();
      try {
        return await rawBegin();
      } finally {
        if (currentStatements) {
          currentStatements.push({
            sql: "BEGIN",
            durationMs: performance.now() - startedAt,
            source: "transaction",
          });
        }
      }
    };
    connection.commit = async () => {
      const startedAt = performance.now();
      try {
        return await rawCommit();
      } finally {
        if (currentStatements) {
          currentStatements.push({
            sql: "COMMIT",
            durationMs: performance.now() - startedAt,
            source: "transaction",
          });
        }
      }
    };
    return connection;
  };

  const app = require("../src/app");
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}/api/orders`;
  const results = [];

  try {
    for (let index = 0; index < runCount; index += 1) {
      currentStatements = [];
      const payload = {
        items: [{ product_id: Number(product.id), qty: 1 }],
        total: Number(product.price),
        order_type: "dine-in",
        payment_method: "cash",
        customer_type: "Regular customer",
        discount_name: "Regular customer",
        cashierId,
        table_id: null,
        cash_tendered: Number(product.price),
        change_amount: 0,
      };

      const startedAt = performance.now();
      const rawResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await rawResponse.json();
      const response = {
        statusCode: rawResponse.status,
        body,
        durationMs: performance.now() - startedAt,
      };

      const statements = currentStatements;
      currentStatements = null;
      if (response.statusCode !== 200) {
        throw new Error(
          `Benchmark order failed with ${response.statusCode}: ${JSON.stringify(response.body)}`,
        );
      }
      results.push({
        run: index + 1,
        durationMs: Number(response.durationMs.toFixed(1)),
        statementCount: statements.length,
        dbDurationMs: Number(
          statements.reduce((sum, item) => sum + item.durationMs, 0).toFixed(1),
        ),
        statements: statements.map((item) => ({
          ...item,
          durationMs: Number(item.durationMs.toFixed(1)),
        })),
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(JSON.stringify({
    mode: "disposable-database",
    database: benchmarkDatabase,
    product: { id: Number(product.id), name: product.name },
    cashierId,
    results,
  }, null, 2));
  await db.end();
}

async function dropBenchmarkDatabase() {
  if (!/^the_crunch_cashier_benchmark_\d+_\d+$/.test(benchmarkDatabase)) {
    throw new Error(`Refusing to drop unexpected database name: ${benchmarkDatabase}`);
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: Number(process.env.DB_PORT || 3306),
    ...(process.env.DB_SSL_CA_PATH
      ? {
          ssl: {
            ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA_PATH), "utf8"),
            rejectUnauthorized: true,
          },
        }
      : {}),
  });
  try {
    const [rows] = await connection.query("SHOW DATABASES LIKE ?", [benchmarkDatabase]);
    if (rows.length === 1) {
      await connection.query(`DROP DATABASE \`${benchmarkDatabase}\``);
      console.error(`Dropped disposable benchmark database ${benchmarkDatabase}`);
    }
  } finally {
    await connection.end();
  }
}

main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dropBenchmarkDatabase();
  });
