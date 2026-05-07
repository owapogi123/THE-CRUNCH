import { Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import { useAuth } from "./context/authcontext";
import {
  PermissionKey,
  PermissionsMap,
  readCachedPermissions,
  normalizePermissionsMap,
  cachePermissions,
  hasCachedPermissions,
  normalizeRole,
} from "./lib/permissions";

// ── Admin pages
import AdminDashboard from "./pages/index";
import SalesReports from "./pages/sales-reports";
import Inventory from "./pages/inventory";
import Menu from "./pages/menu";
import StaffAccounts from "./pages/staffaccounts";
import StockManager from "./pages/stockmanager";
import Products from "./pages/products";
import Settings from "./pages/settings";

// ── Cashier / Cook pages
import Order from "./pages/Order";

// ── Shared / Auth
import Login from "./pages/login";
import AboutTheCrunch from "./pages/aboutthecrunch";

// ── Customer pages
import UsersMenu from "./pages/usersmenu";

type Role =
  | "administrator"
  | "cashier"
  | "cook"
  | "inventory_manager"
  | "customer"
  | null;

const ROLE_MAP: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/orders",
  cook: "/orders",
  inventory_manager: "/inventory",
  customer: "/products",
};

const PERMISSION_ROUTE_MAP: Partial<Record<PermissionKey, string>> = {
  overview: "/dashboard",
  orders: "/orders",
  menuManagement: "/inventory",
  menus: "/menu",
  stockManager: "/stockmanager",
  userAccounts: "/users",
  salesReports: "/sales-reports",
  settings: "/settings",
};

function getHomePathForRole(
  role: Role,
  permissions: PermissionsMap,
): string {
  if (!role) return "/login";
  if (role === "customer") return ROLE_MAP.customer;

  const fallback = ROLE_MAP[role] ?? "/unauthorized";
  const rolePermissions = permissions[role];
  if (!rolePermissions) return fallback;

  const fallbackPermission = (
    Object.entries(PERMISSION_ROUTE_MAP) as [PermissionKey, string][]
  ).find(([, path]) => path === fallback)?.[0];

  if (!fallbackPermission || rolePermissions[fallbackPermission]) {
    return fallback;
  }

  const firstAllowedRoute = (
    Object.entries(PERMISSION_ROUTE_MAP) as [PermissionKey, string][]
  ).find(([permissionKey]) => rolePermissions[permissionKey])?.[1];

  return firstAllowedRoute ?? "/unauthorized";
}

// ── Redirects already-logged-in users away from /login ──────────────────────
function PublicOnlyRoute({
  element,
  redirectTo,
}: {
  element: React.ReactElement;
  redirectTo: string;
}) {
  const { user } = useAuth();
  if (user) {
    // Already logged in — send them to their home page instead of /login
    return <Navigate to={redirectTo} replace />;
  }
  return element;
}

function ProtectedRoute({
  element,
  permissionKey,
  isAuth,
  userRole,
  permissions,
  permissionsReady,
}: {
  element: React.ReactElement;
  permissionKey?: PermissionKey;
  isAuth: boolean;
  userRole: Role;
  permissions: PermissionsMap;
  permissionsReady: boolean;
}) {
  if (!isAuth) return <Navigate to="/login" replace />;
  if (!userRole || userRole === "customer") {
    return <Navigate to="/unauthorized" replace />;
  }
  if (!permissionsReady) {
    return null;
  }
  console.log("[App] route check", { userRole, permissionKey, allowed: permissionKey ? permissions[userRole]?.[permissionKey] : true });
  if (permissionKey && !permissions[userRole]?.[permissionKey]) {
    return <Navigate to="/unauthorized" replace />;
  }
  return element;
}

function Unauthorized() {
  const { user } = useAuth();
  const redirectTo = getHomePathForRole(
    normalizeRole(user?.role) as Role,
    readCachedPermissions(),
  );

  return (
    <div
      style={{ fontFamily: "'Poppins', sans-serif" }}
      className="min-h-screen flex flex-col items-center justify-center gap-4"
    >
      <h1 className="text-4xl font-bold text-red-500">403</h1>
      <p className="text-gray-600">You don't have permission to view this page.</p>
      <button
        onClick={() => (window.location.href = redirectTo)}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black"
      >
        Go to my dashboard
      </button>
    </div>
  );
}

export default function App() {
  const { user, logout } = useAuth();
  const [permissions, setPermissions] = React.useState<PermissionsMap>(() =>
    readCachedPermissions(),
  );
  const [permissionsReady, setPermissionsReady] = React.useState(() =>
    hasCachedPermissions(),
  );
  const isAuth = !!user;
  const userRole = normalizeRole(user?.role) as Role;
  const homePath = React.useMemo(
    () => getHomePathForRole(userRole, permissions),
    [permissions, userRole],
  );

  React.useEffect(() => {
    if (!userRole || userRole === "customer") {
      setPermissionsReady(true);
      return undefined;
    }

    let cancelled = false;

    const syncPermissions = () => {
      const cached = readCachedPermissions();
      console.log("[App] cached permissions", cached);
      console.log("[App] current userRole", userRole);
      setPermissions(cached);
      setPermissionsReady(true);
    };

    const loadPermissions = async () => {
      try {
        const res = await fetch("/api/settings/permissions");
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data || typeof data !== "object") return;
        const next = normalizePermissionsMap(
          "permissions" in data
            ? (data.permissions as Partial<PermissionsMap> | null | undefined) ?? null
            : (data as Partial<PermissionsMap>),
        );
        console.log("[App] loaded permissions", next);
        setPermissions(next);
        cachePermissions(next);
        setPermissionsReady(true);
      } catch {
        syncPermissions();
      }
    };

    if (hasCachedPermissions()) {
      syncPermissions();
      void loadPermissions();
    } else {
      void loadPermissions().finally(() => {
        if (!cancelled) setPermissionsReady(true);
      });
    }
    window.addEventListener("permissionsChange", syncPermissions);
    window.addEventListener("storage", syncPermissions);

    return () => {
      cancelled = true;
      window.removeEventListener("permissionsChange", syncPermissions);
      window.removeEventListener("storage", syncPermissions);
    };
  }, [userRole]);

  const protect = (element: React.ReactElement, permissionKey?: PermissionKey) => (
    <ProtectedRoute
      element={element}
      permissionKey={permissionKey}
      isAuth={isAuth}
      userRole={userRole}
      permissions={permissions}
      permissionsReady={permissionsReady}
    />
  );

  return (
    <Routes>
      {/* ── Public ───────────────────────────────────────────── */}
      <Route path="/" element={<Navigate to="/products" replace />} />

      {/* /login is only for guests — logged-in users are redirected to their home */}
      <Route
        path="/login"
        element={<PublicOnlyRoute element={<Login />} redirectTo={homePath} />}
      />

      <Route path="/aboutthecrunch" element={<AboutTheCrunch />} />

      {/* ── Customer landing (public, but passes auth state for nav) ── */}
      <Route
        path="/products"
        element={
          <Products
            isAuthenticated={isAuth}
            onLogout={logout}
          />
        }
      />

      {/* ── Customer menu ────────────────────────────────────── */}
      <Route
        path="/usersmenu"
        element={
          !isAuth ? (
            <Navigate to="/login" replace />
          ) : userRole === "administrator" || userRole === "customer" ? (
            <UsersMenu />
          ) : (
            <Navigate to="/unauthorized" replace />
          )
        }
      />

      {/* ── Administrator ────────────────────────────────────── */}
      <Route
        path="/dashboard"
        element={protect(<AdminDashboard />, "overview")}
      />
      <Route
        path="/sales-reports"
        element={protect(<SalesReports />, "salesReports")}
      />
      <Route
        path="/menu"
        element={protect(<Menu />, "menus")}
      />
      <Route
        path="/users"
        element={protect(<StaffAccounts />, "userAccounts")}
      />

      {/* ── Administrator + Inventory Manager ────────────────── */}
      <Route
        path="/inventory"
        element={protect(<Inventory />, "menuManagement")}
      />
      <Route
        path="/stockmanager"
        element={protect(<StockManager />, "stockManager")}
      />

      {/* ── Administrator + Cashier + Cook ───────────────────── */}
      <Route
        path="/orders"
        element={protect(<Order />, "orders")}
      />

      {/* ── Cook ─────────────────────────────────────────────── */}
      <Route
        path="/cook/orders"
        element={protect(<Order />, "orders")}
      />

      {/* ── Fallbacks ────────────────────────────────────────── */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/" replace />} />



      {/* ── Settings ────────────────────────────────────────── */}
      <Route path="/settings" element={protect(<Settings />, "settings")} />
    </Routes>
  );
}
