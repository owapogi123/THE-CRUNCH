"use strict";

const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "delivery-links-test-only-secret";

const db = require("../config/db");
const originalQuery = db.query;
const settings = new Map([
  ["restaurant_settings", JSON.stringify({ taxRate: "12" })],
]);
let writes = 0;

db.query = async (sql, params = []) => {
  const normalized = String(sql).replace(/\s+/g, " ").trim();
  if (normalized.startsWith("SELECT settings_json")) {
    const value = settings.get(String(params[0]));
    return [value ? [{ settings_json: value }] : []];
  }
  if (normalized.startsWith("INSERT INTO system_settings")) {
    settings.set(String(params[0]), String(params[1]));
    writes += 1;
    return [{ affectedRows: 1 }];
  }
  throw new Error(`Unexpected query: ${normalized}`);
};

const router = require("./settingsRoutes");
const { validateDeliveryPlatformUrl } = router.permissionPolicy;

function tokenFor(role) {
  return jwt.sign({ role, userId: 17 }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });
}

function auth(role) {
  return { Authorization: `Bearer ${tokenFor(role)}` };
}

async function withServer(operation) {
  const app = express();
  app.use(express.json());
  app.use("/api/settings", router);
  const server = await new Promise((resolve) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  });
  try {
    await operation(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

(async () => {
  for (const value of [
    "https://r.grab.com/g/store-link",
    "https://food.grab.com/ph/en/restaurant/the-crunch",
    "https://app.grab.com/s/store-link",
  ]) {
    assert.equal(validateDeliveryPlatformUrl(value, "grabfood"), value);
  }
  for (const value of [
    "https://foodpanda.go.link/store-link",
    "https://www.foodpanda.ph/restaurant/the-crunch",
  ]) {
    assert.equal(validateDeliveryPlatformUrl(value, "foodpanda"), value);
  }
  assert.throws(
    () => validateDeliveryPlatformUrl("https://foodpanda.go.link/store-link", "grabfood"),
    /approved official GrabFood domain/i,
  );

  await withServer(async (baseUrl) => {
    const publicInitial = await fetch(`${baseUrl}/api/settings/delivery-links`);
    assert.equal(publicInitial.status, 200);
    assert.deepEqual(await publicInitial.json(), {
      grabfoodUrl: null,
      foodpandaUrl: null,
    });

    for (const role of [null, "cashier", "inventory_manager", "customer"]) {
      const response = await fetch(`${baseUrl}/api/settings/delivery-links`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(role ? auth(role) : {}),
        },
        body: JSON.stringify({
          grabfoodUrl: "https://r.grab.com/g/store-link",
          foodpandaUrl: "https://foodpanda.go.link/store-link",
        }),
      });
      assert.equal(response.status, role ? 403 : 401);
    }
    assert.equal(writes, 0, "unauthorized requests must not persist settings");

    const invalidUrls = [
      "http://r.grab.com/g/store-link",
      "https://localhost/store-link",
      "https://127.0.0.1/store-link",
      "https://r.grab.com.evil.example/store-link",
      "javascript:alert(1)",
      "not a URL",
    ];
    for (const grabfoodUrl of invalidUrls) {
      const response = await fetch(`${baseUrl}/api/settings/delivery-links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...auth("administrator") },
        body: JSON.stringify({ grabfoodUrl, foodpandaUrl: "" }),
      });
      assert.equal(response.status, 400, grabfoodUrl);
    }
    assert.equal(writes, 0, "invalid URLs must not persist settings");

    const created = await fetch(`${baseUrl}/api/settings/delivery-links`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth("administrator") },
      body: JSON.stringify({
        grabfoodUrl: "https://r.grab.com/g/store-link?source=the-crunch",
        foodpandaUrl: "https://foodpanda.go.link/store-link",
      }),
    });
    assert.equal(created.status, 200);
    assert.deepEqual(await created.json(), {
      grabfoodUrl: "https://r.grab.com/g/store-link?source=the-crunch",
      foodpandaUrl: "https://foodpanda.go.link/store-link",
    });

    const publicSaved = await fetch(`${baseUrl}/api/settings/delivery-links`);
    assert.equal(publicSaved.status, 200);
    const publicBody = await publicSaved.json();
    assert.deepEqual(Object.keys(publicBody).sort(), [
      "foodpandaUrl",
      "grabfoodUrl",
    ]);
    assert.equal(publicBody.grabfoodUrl, "https://r.grab.com/g/store-link?source=the-crunch");

    const replaced = await fetch(`${baseUrl}/api/settings/delivery-links`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth("administrator") },
      body: JSON.stringify({
        grabfoodUrl: "https://food.grab.com/ph/en/restaurant/the-crunch",
        foodpandaUrl: "",
      }),
    });
    assert.equal(replaced.status, 200);
    assert.deepEqual(await replaced.json(), {
      grabfoodUrl: "https://food.grab.com/ph/en/restaurant/the-crunch",
      foodpandaUrl: null,
    });
    assert.equal(
      settings.get("restaurant_settings"),
      JSON.stringify({ taxRate: "12" }),
      "delivery-link saves must not overwrite unrelated settings",
    );

    settings.set("delivery_platform_links", JSON.stringify({
      grabfoodUrl: "https://evil.example/redirect",
      foodpandaUrl: "https://www.foodpanda.ph/restaurant/the-crunch",
    }));
    const sanitizedStoredLinks = await fetch(`${baseUrl}/api/settings/delivery-links`);
    assert.deepEqual(await sanitizedStoredLinks.json(), {
      grabfoodUrl: null,
      foodpandaUrl: "https://www.foodpanda.ph/restaurant/the-crunch",
    });
  });

  console.log("Delivery platform settings authorization and validation tests passed.");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.query = originalQuery;
  });
