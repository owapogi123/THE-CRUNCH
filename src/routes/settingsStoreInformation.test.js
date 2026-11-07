"use strict";

const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "store-information-test-only-secret";

const db = require("../config/db");
const originalQuery = db.query;
let writes = 0;
let stored = {
  restaurantName: "The Crunch",
  email: "receipts@example.test",
  phone: "+63 900 000 0000",
  address: "Existing receipt address",
  businessTin: "TIN-EXISTING",
  businessRegistrationDetails: "Permit 123",
  weekdayOpenTime: "08:00",
  weekdayCloseTime: "22:00",
};

db.query = async (sql, params = []) => {
  const normalized = String(sql).replace(/\s+/g, " ").trim();
  if (normalized.startsWith("SELECT settings_json FROM system_settings")) {
    return [[{ settings_json: JSON.stringify(stored) }]];
  }
  if (normalized.startsWith("INSERT INTO system_settings")) {
    stored = JSON.parse(String(params[0]));
    writes += 1;
    return [{ affectedRows: 1 }];
  }
  throw new Error(`Unexpected query: ${normalized}`);
};

const router = require("./settingsRoutes");

function auth(role) {
  const token = jwt.sign({ role, userId: 9 }, process.env.JWT_SECRET, {
    expiresIn: "5m",
  });
  return { Authorization: `Bearer ${token}` };
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
  await withServer(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth("cashier") },
      body: JSON.stringify({ weekdayOpenTime: "09:30" }),
    });
    assert.equal(unauthorized.status, 403);
    assert.equal(writes, 0);

    const saved = await fetch(`${baseUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth("administrator") },
      body: JSON.stringify({ weekdayOpenTime: "09:30" }),
    });
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.weekdayOpenTime, "09:30");
    assert.equal(body.email, "receipts@example.test");
    assert.equal(body.phone, "+63 900 000 0000");
    assert.equal(body.address, "Existing receipt address");
    assert.equal(body.businessTin, "TIN-EXISTING");
    assert.equal(body.businessRegistrationDetails, "Permit 123");
    assert.equal(writes, 1);
  });

  console.log("Hidden Store Information preservation tests passed.");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.query = originalQuery;
  });
