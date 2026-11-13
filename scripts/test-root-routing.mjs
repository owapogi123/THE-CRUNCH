import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const policySource = fs.readFileSync(
  path.join(root, "src/lib/rootRoutePolicy.ts"),
  "utf8",
);
const compiledPolicy = ts.transpileModule(policySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const policyModule = { exports: {} };
vm.runInNewContext(compiledPolicy, {
  module: policyModule,
  exports: policyModule.exports,
});
const { resolveRootRoute } = policyModule.exports;

const decide = (role, staffHomePath, isInitialized = true) =>
  JSON.parse(JSON.stringify(resolveRootRoute({ role, staffHomePath, isInitialized })));

assert.deepEqual(decide("administrator", "/dashboard"), {
  kind: "redirect",
  to: "/dashboard",
});
assert.deepEqual(decide("cashier", "/menu"), {
  kind: "redirect",
  to: "/menu",
});
assert.deepEqual(decide("inventory_manager", "/inventory"), {
  kind: "redirect",
  to: "/inventory",
});
assert.deepEqual(decide("customer", "/ignored"), {
  kind: "public",
});
assert.deepEqual(decide(null, "/login"), { kind: "public" });
assert.deepEqual(decide(null, "/login"), { kind: "public" }, "expired sessions are public");
assert.deepEqual(decide(null, "/login"), { kind: "public" }, "logout returns public");
assert.deepEqual(decide("administrator", "/dashboard", false), { kind: "pending" });

const appSource = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const authSource = fs.readFileSync(
  path.join(root, "src/context/authcontext.tsx"),
  "utf8",
);
assert.match(appSource, /const rootRoute = resolveRootRoute/);
assert.match(appSource, /rootRoute\.kind === "pending"/);
assert.match(appSource, /<Route path="\/" element=\{rootElement\}/);
assert.doesNotMatch(appSource, /<Route path="\/" element=\{<AboutTheCrunch \/>\}/);
assert.match(authSource, /isInitialized:\s*boolean/);
assert.match(authSource, /const \[isInitialized, setIsInitialized\] = useState\(false\)/);
assert.match(authSource, /if \(isTokenExpired\(token\)\) \{[\s\S]*?clearStoredAuth\(\);[\s\S]*?return null/);
assert.match(authSource, /setUser\(null\);[\s\S]*?clearStoredAuth\(\)/);
assert.match(authSource, /syncStoredAuth\(\);[\s\S]*?addEventListener\("authChange"/);

const compileAuthContext = () => {
  const compiled = ts.transpileModule(authSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const moduleRecord = { exports: {} };
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  vm.runInNewContext(compiled, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require(specifier) {
      if (specifier === "react") {
        return {
          createContext: () => ({}),
          useContext: () => null,
          useState: () => {},
          useRef: () => {},
          useEffect: () => {},
          useCallback: (value) => value,
        };
      }
      if (specifier === "react/jsx-runtime") {
        return { jsx: () => null, jsxs: () => null };
      }
      if (specifier === "../lib/api") {
        return { authApi: { logout: async () => undefined } };
      }
      throw new Error(`Unexpected auth test dependency: ${specifier}`);
    },
    window: {},
    localStorage,
    atob,
    Date,
    console,
  });
  return { auth: moduleRecord.exports, localStorage, values };
};

const encodePayload = (payload) =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
const seedStoredUser = (localStorage, token) => {
  localStorage.setItem("authToken", token);
  localStorage.setItem("isAuthenticated", "true");
  localStorage.setItem("userName", "Admin User");
  localStorage.setItem("userEmail", "admin@example.test");
  localStorage.setItem("userRole", "administrator");
  localStorage.setItem("userId", "7");
  localStorage.setItem("userEmailVerified", "true");
};

const validSession = compileAuthContext();
seedStoredUser(
  validSession.localStorage,
  `header.${encodePayload({ exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`,
);
assert.equal(validSession.auth.readStoredUser().role, "administrator");

const expiredSession = compileAuthContext();
seedStoredUser(
  expiredSession.localStorage,
  `header.${encodePayload({ exp: Math.floor(Date.now() / 1000) - 60 })}.signature`,
);
assert.equal(expiredSession.auth.readStoredUser(), null);
assert.equal(expiredSession.values.size, 0, "expired auth storage must be cleared");

for (const relativePath of [
  "src/components/Sidebar.tsx",
  "src/components/Navbar.tsx",
  "src/pages/usersmenu.tsx",
]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.match(
    source,
    /logout\(\)[\s\S]{0,120}?navigate\(['"]\/['"]\)/,
    `${relativePath} logout must return to the public root`,
  );
}
assert.match(appSource, /const rootElement =[\s\S]*?<Products isAuthenticated=\{isAuth\} \/>/);

console.log("Authenticated root-route and logout regression tests passed");
