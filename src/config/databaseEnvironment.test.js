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

  const missingModuleError = new Error(
    "Cannot find module '../utils/stockMutationPolicy'\n" +
      "Require stack:\n" +
      "- sensitive text must not be copied from the raw message",
  );
  missingModuleError.code = "MODULE_NOT_FOUND";
  missingModuleError.requireStack = [
    path.join(process.cwd(), "src/routes/productRoutes.js"),
    path.join(process.cwd(), "src/app.js"),
    path.join(process.cwd(), "src/server.js"),
  ];
  missingModuleError.stack = [
    "Error: Cannot find module '../utils/stockMutationPolicy'",
    `    at Object.<anonymous> (${path.join(process.cwd(), "src/routes/productRoutes.js")}:33:5)`,
    "DB_PASSWORD=sensitive text must not be copied from the raw stack",
    "    at Module._compile (node:internal/modules/cjs/loader:1706:14)",
  ].join("\n");
  const missingModuleDetails = getSafeDatabaseErrorDetails(
    missingModuleError,
    privateConfig,
  );
  assert.equal(missingModuleDetails.code, "MODULE_NOT_FOUND");
  assert.equal(
    missingModuleDetails.message,
    "Cannot find module '../utils/stockMutationPolicy'",
  );
  assert.deepEqual(missingModuleDetails.requireStack, [
    "src/routes/productRoutes.js",
    "src/app.js",
    "src/server.js",
  ]);
  assert.match(
    missingModuleDetails.stack,
    /at Object\.<anonymous> \(<app>\/src\/routes\/productRoutes\.js:33:5\)/,
  );
  assert.match(missingModuleDetails.stack, /node:internal\/modules\/cjs\/loader/);
  assert.doesNotMatch(
    JSON.stringify(missingModuleDetails),
    /sensitive text must not be copied/,
  );

  console.log("Database SSL policy tests passed.");
} finally {
  if (originalCaPath === undefined) {
    delete process.env.DB_SSL_CA_PATH;
  } else {
    process.env.DB_SSL_CA_PATH = originalCaPath;
  }
}
