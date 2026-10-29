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

    const previewCorsResponse = await fetch(`${baseUrl}/health/live`, {
      headers: { Origin: "https://preview-123.the-crunch.pages.dev" },
    });
    assert.equal(
      previewCorsResponse.headers.get("access-control-allow-origin"),
      "https://preview-123.the-crunch.pages.dev",
    );

    const ready = await fetch(`${baseUrl}/health`);
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).status, "ready");

    databaseAvailable = false;
    const unavailable = await fetch(`${baseUrl}/health/ready`);
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).status, "unavailable");

    console.log("Backend liveness and readiness endpoint tests passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
