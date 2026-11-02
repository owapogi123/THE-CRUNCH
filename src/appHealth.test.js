"use strict";

const assert = require("node:assert/strict");

let databaseAvailable = true;
const dbModuleId = require.resolve("./config/db");
require.cache[dbModuleId] = {
  id: dbModuleId,
  filename: dbModuleId,
  loaded: true,
  exports: {
    async query(sql) {
      assert.equal(sql, "SELECT 1 AS ready");
      if (!databaseAvailable) {
        const error = new Error("simulated database outage");
        error.code = "ECONNREFUSED";
        throw error;
      }
      return [[{ ready: 1 }]];
    },
  },
};

const app = require("./app");

(async () => {
  const server = await new Promise((resolve) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const live = await fetch(`${baseUrl}/health/live`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, "ok");

    const corsResponse = await fetch(`${baseUrl}/health/live`, {
      headers: { Origin: "https://thecrunch.site" },
    });
    assert.equal(
      corsResponse.headers.get("access-control-allow-origin"),
      "https://thecrunch.site",
    );

    const productionPreflight = await fetch(`${baseUrl}/api/purchase-orders`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://thecrunch.site",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(productionPreflight.status, 204);
    assert.equal(
      productionPreflight.headers.get("access-control-allow-origin"),
      "https://thecrunch.site",
    );
    assert.equal(
      productionPreflight.headers.get("access-control-allow-credentials"),
      "true",
    );

    const previewCorsResponse = await fetch(`${baseUrl}/health/live`, {
      headers: { Origin: "https://preview-123.the-crunch.pages.dev" },
    });
    assert.equal(
      previewCorsResponse.headers.get("access-control-allow-origin"),
      "https://preview-123.the-crunch.pages.dev",
    );

    const localPreflight = await fetch(`${baseUrl}/api/purchase-orders`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(localPreflight.status, 204);
    assert.equal(
      localPreflight.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );
    assert.equal(
      localPreflight.headers.get("access-control-allow-credentials"),
      "true",
    );

    const protectedError = await fetch(`${baseUrl}/api/events/stream`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(protectedError.status, 401);
    assert.equal(
      protectedError.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );

    const notFound = await fetch(`${baseUrl}/api/not-a-real-route`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(notFound.status, 404);
    assert.equal(
      notFound.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );

    const malformedJsonError = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: "{",
    });
    assert.equal(malformedJsonError.status, 500);
    assert.equal(
      malformedJsonError.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );

    const ready = await fetch(`${baseUrl}/health`);
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).status, "ready");

    databaseAvailable = false;
    const unavailable = await fetch(`${baseUrl}/health/ready`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).status, "unavailable");
    assert.equal(
      unavailable.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );

    console.log("Backend liveness and readiness endpoint tests passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
