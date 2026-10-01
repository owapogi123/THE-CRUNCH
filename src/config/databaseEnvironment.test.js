const assert = require("node:assert/strict");
const path = require("node:path");
const {
  getDatabaseSslOptions,
  getSafeDatabaseErrorDetails,
} = require("./databaseEnvironment");

const originalCaPath = process.env.DB_SSL_CA_PATH;

try {
  process.env.DB_SSL_CA_PATH = path.resolve(
    __dirname,
    "../../certificates/ca.pem",
  );

  const privateConfig = { host: "mysql.railway.internal" };
  assert.equal(getDatabaseSslOptions(privateConfig), undefined);
  assert.equal(
    getSafeDatabaseErrorDetails(new Error("test"), privateConfig).sslMode,
    "disabled-private-network",
  );

  const publicSsl = getDatabaseSslOptions({ host: "example.proxy.rlwy.net" });
  assert.equal(publicSsl.rejectUnauthorized, true);
  assert.match(publicSsl.ca, /BEGIN CERTIFICATE/);

  const localSsl = getDatabaseSslOptions({ host: "127.0.0.1" });
  assert.equal(localSsl.rejectUnauthorized, true);

  delete process.env.DB_SSL_CA_PATH;
  assert.equal(
    getDatabaseSslOptions({ host: "external-db.example.com" }),
    undefined,
  );

  console.log("Database SSL policy tests passed.");
} finally {
  if (originalCaPath === undefined) {
    delete process.env.DB_SSL_CA_PATH;
  } else {
    process.env.DB_SSL_CA_PATH = originalCaPath;
  }
}
