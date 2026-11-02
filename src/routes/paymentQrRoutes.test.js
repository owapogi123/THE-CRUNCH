"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "payment-qr-test-only-secret";

const paymentQrRouter = require("./paymentQrRoutes");
const { createPaymentQrRouter } = paymentQrRouter;

function createDatabase() {
  let settingsJson = null;
  return {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("SELECT settings_json")) {
        return [settingsJson
          ? [{ settings_json: settingsJson, updated_at: new Date() }]
          : []];
      }
      if (normalized.startsWith("INSERT INTO system_settings")) {
        settingsJson = params[1];
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith("DELETE FROM system_settings")) {
        settingsJson = null;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${normalized}`);
    },
  };
}

function tokenFor(role, userId = 7) {
  return jwt.sign({ role, userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function withServer(router, operation) {
  const app = express();
  app.use("/api/payment-qr", router);
  const server = await new Promise((resolve) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
  });
  try {
    return await operation(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve()));
  }
}

function auth(role) {
  return { Authorization: `Bearer ${tokenFor(role)}` };
}

function imageForm(buffer, type, name) {
  const form = new FormData();
  form.append("image", new Blob([buffer], { type }), name);
  return form;
}

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const validWebp = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89",
  "base64",
);
test("Administrator manages a durable QR while Cashier receives read-only access", async (t) => {
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), "crunch-payment-qr-"));
  t.after(() => fs.rm(uploadRoot, { recursive: true, force: true }));
  const database = createDatabase();
  const env = { QR_PAYMENT_UPLOAD_DIR: uploadRoot, NODE_ENV: "production" };
  const router = createPaymentQrRouter({ database, env });

  await withServer(router, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/payment-qr`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/payment-qr`, {
      headers: auth("customer"),
    })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/payment-qr`, {
      headers: auth("inventory_manager"),
    })).status, 403);

    const cashierUpload = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("cashier"),
      body: imageForm(validPng, "image/png", "qr.png"),
    });
    assert.equal(cashierUpload.status, 403);

    const invalidUpload = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(Buffer.from("not an image"), "image/png", "fake.png"),
    });
    assert.equal(invalidUpload.status, 400);

    const truncatedJpeg = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg", "fake.jpg"),
    });
    assert.equal(truncatedJpeg.status, 400);

    const oversizedUpload = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(Buffer.alloc(5 * 1024 * 1024 + 1, 0x41), "image/png", "too-large.png"),
    });
    assert.equal(oversizedUpload.status, 400);
    assert.match((await oversizedUpload.json()).message, /5 MB or smaller/);

    const uploaded = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(validPng, "image/png", "qr.png"),
    });
    assert.equal(uploaded.status, 200);
    assert.equal((await uploaded.json()).configured, true);

    const cashierConfig = await fetch(`${baseUrl}/api/payment-qr`, {
      headers: auth("cashier"),
    });
    assert.equal(cashierConfig.status, 200);
    const configBody = await cashierConfig.json();
    assert.equal(configBody.configured, true);
    assert.match(configBody.imageUrl, /^\/api\/payment-qr\/image\?v=/);

    assert.equal((await fetch(`${baseUrl}${configBody.imageUrl}`)).status, 401);

    const image = await fetch(`${baseUrl}${configBody.imageUrl}`, {
      headers: auth("cashier"),
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), validPng);

    const restartedRouter = createPaymentQrRouter({ database, env });
    await withServer(restartedRouter, async (restartedBaseUrl) => {
      const persisted = await fetch(`${restartedBaseUrl}/api/payment-qr`, {
        headers: auth("cashier"),
      });
      assert.equal(persisted.status, 200);
      assert.equal((await persisted.json()).configured, true);
    });

    const validJpeg = await fs.readFile(path.join(
      __dirname,
      "..",
      "..",
      "assets",
      "product-images",
      "legacy",
      "chickenteriyaki-1793421938140-0482c1db-2157-474d-9541-5839782332c3.jpg",
    ));
    const replaced = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(validJpeg, "image/jpeg", "replacement.jpg"),
    });
    assert.equal(replaced.status, 200);
    const filesAfterReplace = await fs.readdir(uploadRoot);
    assert.equal(filesAfterReplace.length, 1);
    assert.match(filesAfterReplace[0], /\.jpg$/);

    const webpReplacement = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(validWebp, "image/webp", "replacement.webp"),
    });
    assert.equal(webpReplacement.status, 200);
    const filesAfterWebpReplace = await fs.readdir(uploadRoot);
    assert.equal(filesAfterWebpReplace.length, 1);
    assert.match(filesAfterWebpReplace[0], /\.webp$/);

    const removed = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "DELETE",
      headers: auth("administrator"),
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).configured, false);
    assert.deepEqual(await fs.readdir(uploadRoot), []);

    const missing = await fetch(`${baseUrl}/api/payment-qr`, {
      headers: auth("cashier"),
    });
    assert.equal((await missing.json()).configured, false);
  });
});

test("production upload fails closed without a durable storage path", async () => {
  const router = createPaymentQrRouter({
    database: createDatabase(),
    env: { NODE_ENV: "production" },
  });
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/payment-qr`, {
      method: "POST",
      headers: auth("administrator"),
      body: imageForm(validPng, "image/png", "qr.png"),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /Durable QR image storage/);
  });
});
