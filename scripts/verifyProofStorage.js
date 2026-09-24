const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "proof-storage-test-secret";

function request(port, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.once("error", reject);
    req.end(options.body);
  });
}

function multipartProof(filename, mimeType, contents) {
  const boundary = `proof-test-${Date.now()}`;
  const opening = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="proof"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([opening, contents, closing]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function main() {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "the-crunch-proof-test-"),
  );
  process.env.PROOF_UPLOAD_DIR = temporaryRoot;

  const existingFilename =
    "1760000000000-11111111-1111-4111-8111-111111111111.png";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await fs.writeFile(path.join(temporaryRoot, existingFilename), png);

  const app = require("../src/app");
  const server = await new Promise((resolve, reject) => {
    const candidate = app.listen(0, "127.0.0.1", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const port = server.address().port;
  const adminToken = jwt.sign(
    { id: 1, userId: 1, role: "administrator" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );
  const customerToken = jwt.sign(
    { id: 2, userId: 2, role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  try {
    const existing = await request(
      port,
      `/api/upload-proof/${existingFilename}`,
      { headers: adminHeaders },
    );
    assert.equal(existing.status, 200);
    assert.match(String(existing.headers["content-type"]), /^image\/png/);
    assert.deepEqual(existing.body, png);

    const multipart = multipartProof("cashier-camera.txt", "image/png", png);
    const uploaded = await request(port, "/api/upload-proof", {
      method: "POST",
      headers: {
        ...adminHeaders,
        "Content-Type": multipart.contentType,
        "Content-Length": multipart.body.length,
      },
      body: multipart.body,
    });
    assert.equal(uploaded.status, 200);
    const uploadPayload = JSON.parse(uploaded.body.toString("utf8"));
    assert.match(
      uploadPayload.fileUrl,
      /^\/api\/upload-proof\/\d{13}-[0-9a-f-]{36}\.png$/i,
    );

    const newlyServed = await request(port, uploadPayload.fileUrl, {
      headers: adminHeaders,
    });
    assert.equal(newlyServed.status, 200);
    assert.deepEqual(newlyServed.body, png);

    const unauthenticated = await request(port, uploadPayload.fileUrl);
    assert.equal(unauthenticated.status, 401);
    const customer = await request(port, uploadPayload.fileUrl, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(customer.status, 403);

    const missing = await request(
      port,
      "/api/upload-proof/1760000000001-22222222-2222-4222-8222-222222222222.jpg",
      { headers: adminHeaders },
    );
    assert.equal(missing.status, 404);
    assert.equal(
      JSON.parse(missing.body.toString("utf8")).message,
      "Payment proof not found",
    );

    const publicLegacyPath = await request(
      port,
      `/uploads/proofs/${existingFilename}`,
    );
    assert.equal(publicLegacyPath.status, 404);

    const traversal = await request(
      port,
      "/api/upload-proof/%2e%2e%2fpackage.json",
      { headers: adminHeaders },
    );
    assert.ok([400, 404].includes(traversal.status));

    const filesBeforeInvalidUpload = await fs.readdir(temporaryRoot);
    const invalidMultipart = multipartProof(
      "not-really-an-image.png",
      "image/png",
      Buffer.from("not an image"),
    );
    const invalidUpload = await request(port, "/api/upload-proof", {
      method: "POST",
      headers: {
        ...adminHeaders,
        "Content-Type": invalidMultipart.contentType,
        "Content-Length": invalidMultipart.body.length,
      },
      body: invalidMultipart.body,
    });
    assert.equal(invalidUpload.status, 400);
    assert.deepEqual(await fs.readdir(temporaryRoot), filesBeforeInvalidUpload);

    console.log(
      JSON.stringify(
        {
          existingProofServed: true,
          newProofUploadedAndServed: true,
          missingProofReturned404: true,
          publicAndCustomerAccessDenied: true,
          traversalBlocked: true,
          invalidImageRejectedAndRemoved: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (!resolvedTemporaryRoot.startsWith(path.resolve(os.tmpdir()))) {
      throw new Error("Refusing to remove proof test directory outside temp");
    }
    await fs.rm(resolvedTemporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
