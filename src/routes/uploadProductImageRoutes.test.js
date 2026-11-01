"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

process.env.JWT_SECRET = "product-image-test-only-secret";

const imageRouter = require("./uploadProductImageRoutes");

const recoveredFiles = [
  "chickentexasbbq-1793418786176-7606f185-c8aa-4bc2-89cb-bae969bfc22b.jpg",
  "chickenteriyaki-1793421938140-0482c1db-2157-474d-9541-5839782332c3.jpg",
  "chickentexasbbq-1793491998276-a437c4bd-6ccc-40c3-bd7a-3caebba01ab0.jpg",
  "chickenspecialcheese-1793492251858-f52bace3-2fa1-418b-a512-f0cab58b4b84.jpg",
];

function findRoute(method, routePath) {
  return imageRouter.stack.find(
    (layer) => layer.route?.path === routePath && layer.route.methods?.[method],
  )?.route;
}

async function withServer(operation) {
  const app = express();
  app.use("/api/upload-product-image", imageRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    const address = server.address();
    return await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("upload and retrieval use the same configured durable root", () => {
  assert.equal(
    imageRouter.resolveProductImageUploadRoot({
      RAILWAY_VOLUME_MOUNT_PATH: path.join("tmp", "railway-volume"),
    }),
    path.join("tmp", "railway-volume", "product-images"),
  );
  assert.equal(
    imageRouter.resolveProductImageUploadRoot({
      PRODUCT_IMAGE_UPLOAD_DIR: path.join("tmp", "custom-products"),
      RAILWAY_VOLUME_MOUNT_PATH: path.join("tmp", "railway-volume"),
    }),
    path.resolve("tmp", "custom-products"),
  );
  assert.ok(findRoute("post", "/"));
  assert.ok(findRoute("get", "/files/:filename"));
});

test("the four reviewed legacy image files are packaged for recovery", () => {
  for (const filename of recoveredFiles) {
    const recoveredPath = path.join(imageRouter.recoveredImageRoot, filename);
    assert.equal(fs.existsSync(recoveredPath), true, filename);
    assert.ok(fs.statSync(recoveredPath).size > 0, filename);
  }
});

test("legacy relative URLs serve recovered images and unknown files remain 404", async () => {
  await withServer(async (baseUrl) => {
    for (const filename of recoveredFiles) {
      const response = await fetch(
        `${baseUrl}/api/upload-product-image/files/${encodeURIComponent(filename)}`,
      );
      assert.equal(response.status, 200, filename);
      assert.match(response.headers.get("content-type") || "", /^image\/jpeg/);
      assert.ok((await response.arrayBuffer()).byteLength > 0, filename);
    }

    const missing = await fetch(
      `${baseUrl}/api/upload-product-image/files/not-a-real-product.jpg`,
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), null);
  });
});
