"use strict";

require("dotenv").config();

const jwt = require("jsonwebtoken");
const db = require("../src/config/db");

const originalQuery = db.query.bind(db);
let activeMeasurement = null;

db.query = async (...args) => {
  const startedAt = process.hrtime.bigint();
  try {
    return await originalQuery(...args);
  } finally {
    if (activeMeasurement) {
      activeMeasurement.statements += 1;
      activeMeasurement.dbDurationMs +=
        Number(process.hrtime.bigint() - startedAt) / 1e6;
    }
  }
};

const app = require("../src/app");

const endpoints = [
  "/api/inventory",
  "/api/inventory/alerts",
  "/api/settings/inventory-categories?activeOnly=1",
  "/api/settings/inventory-units?activeOnly=1",
  "/api/purchase-orders",
  "/api/suppliers",
  "/api/settings",
];

const firstRenderEndpoints = [
  "/api/inventory",
  "/api/settings/inventory-categories?activeOnly=1",
  "/api/settings",
];

const completePageEndpoints = [...firstRenderEndpoints];

function getAdminToken() {
  return jwt.sign(
    { id: 0, username: "stock-manager-benchmark", role: "administrator" },
    process.env.JWT_SECRET || "secretkey",
    { expiresIn: "5m" },
  );
}

async function measureRequest(origin, endpoint, token) {
  const measurement = { statements: 0, dbDurationMs: 0 };
  activeMeasurement = measurement;
  const startedAt = process.hrtime.bigint();
  try {
    const response = await fetch(`${origin}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.arrayBuffer();
    return {
      endpoint,
      status: response.status,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      statements: measurement.statements,
      dbDurationMs: measurement.dbDurationMs,
      responseBytes: body.byteLength,
    };
  } finally {
    activeMeasurement = null;
  }
}

async function measureConcurrent(origin, requestEndpoints, token) {
  const measurement = { statements: 0, dbDurationMs: 0 };
  activeMeasurement = measurement;
  const startedAt = process.hrtime.bigint();
  try {
    const responses = await Promise.all(
      requestEndpoints.map((endpoint) =>
        fetch(`${origin}${endpoint}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
    );
    await Promise.all(responses.map((response) => response.arrayBuffer()));
    return {
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      statements: measurement.statements,
      statuses: responses.map((response) => response.status),
    };
  } finally {
    activeMeasurement = null;
  }
}

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const token = getAdminToken();

  try {
    const runs = [];
    for (let run = 1; run <= 3; run += 1) {
      const results = [];
      for (const endpoint of endpoints) {
        results.push(await measureRequest(origin, endpoint, token));
      }
      runs.push({ run, results });
    }

    const pageRuns = [];
    for (let run = 1; run <= 3; run += 1) {
      pageRuns.push({
        run,
        firstUsefulRender: await measureConcurrent(
          origin,
          firstRenderEndpoints,
          token,
        ),
        completePageLoad: await measureConcurrent(
          origin,
          completePageEndpoints,
          token,
        ),
      });
    }

    process.stdout.write(`${JSON.stringify({ runs, pageRuns }, null, 2)}\n`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
