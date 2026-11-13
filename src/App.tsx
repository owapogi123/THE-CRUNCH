import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import React from "react";
import { useAuth } from "./context/authcontext";
import {
  SkeletonKPICard,
  SkeletonChart,
} from "@/components/ui/skeleton";
import {
  PermissionKey,
  PermissionsMap,
  readCachedPermissions,
  fetchPermissions,
  hasCachedPermissions,
  normalizeRole,
  COOK_VIEW_ROLES,
  canAccessStaffRoles,
  hasPagePermission,
} from "./lib/permissions";

// ── Admin pages
import AdminDashboard from "./pages/index";
import SalesReports from "./pages/sales-reports";
import Inventory from "./pages/inventory";
import Menu from "./pages/menu";
import Order from "./pages/Order";
import StaffAccounts from "./pages/staffaccounts";
import StockManager from "./pages/stockmanager";
import Products from "./pages/products";
import ProductsV2 from "./pages/productv2";
import Settings from "./pages/settings";
import MyAccount from "./pages/my-account";
import { ROLE_HOME_PATHS, resolveRootRoute } from "./lib/rootRoutePolicy";

// ── Shared / Auth
import Login from "./pages/login";
import ForgotPassword from "./pages/forgotpassword";
import AboutTheCrunch from "./pages/aboutthecrunch";

// ── Customer pages
import UsersMenu from "./pages/usersmenu";

type Role =
  | "administrator"
  | "cashier"
  | "inventory_manager"
  | "customer"
  | null;

const PERMISSION_ROUTE_MAP: Partial<Record<PermissionKey, string>> = {
  orders: "/orders",
  overview: "/dashboard",
  menuManagement: "/inventory",
  menus: "/menu",
  stockManager: "/stockmanager",
  userAccounts: "/users",
  salesReports: "/sales-reports",
  settings: "/settings",
};

function getHomePathForRole(role: Role, permissions: PermissionsMap): string {
  if (!role) return "/login";
  if (role === "customer") return ROLE_HOME_PATHS.customer;

  const fallback = ROLE_HOME_PATHS[role] ?? "/unauthorized";
  const rolePermissions = permissions[role];
  if (!rolePermissions) return fallback;

  const fallbackPermission = (
    Object.entries(PERMISSION_ROUTE_MAP) as [PermissionKey, string][]
  ).find(([, path]) => path === fallback)?.[0];

  if (
    !fallbackPermission ||
    hasPagePermission(role, fallbackPermission, permissions)
  ) {
    return fallback;
  }

  const firstAllowedRoute = (
    Object.entries(PERMISSION_ROUTE_MAP) as [PermissionKey, string][]
  ).find(([permissionKey]) =>
    hasPagePermission(role, permissionKey, permissions),
  )?.[1];

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
  allowedRoles,
}: {
  element: React.ReactElement;
  permissionKey?: PermissionKey;
  isAuth: boolean;
  userRole: Role;
  permissions: PermissionsMap;
  permissionsReady: boolean;
  allowedRoles?: readonly Exclude<Role, "customer" | null>[];
}) {
  const location = useLocation();
  if (!isAuth) {
    // Preserve the attempted path for return after login
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (!userRole || userRole === "customer") {
    return <Navigate to="/unauthorized" replace />;
  }
  if (allowedRoles && !canAccessStaffRoles(userRole, allowedRoles)) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (!permissionsReady) {
    return null;
  }
  if (
    permissionKey &&
    !hasPagePermission(userRole, permissionKey, permissions)
  ) {
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
      <p className="text-gray-600">
        You don't have permission to view this page.
      </p>
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
  const { user, isInitialized } = useAuth();
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
  const rootRoute = resolveRootRoute({
    isInitialized,
    role: userRole,
    staffHomePath: homePath,
  });

  React.useEffect(() => {
    if (!userRole || userRole === "customer") {
      setPermissionsReady(true);
      return undefined;
    }

    let cancelled = false;

    const syncPermissions = () => {
      const cached = readCachedPermissions();
      setPermissions(cached);
      setPermissionsReady(true);
    };

    const loadPermissions = async () => {
      try {
        const next = await fetchPermissions();
        if (cancelled) return;
        setPermissions(next);
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

  const protect = (
    element: React.ReactElement,
    permissionKey?: PermissionKey,
    allowedRoles?: readonly Exclude<Role, "customer" | null>[],
  ) => (
    <ProtectedRoute
      element={element}
      permissionKey={permissionKey}
      isAuth={isAuth}
      userRole={userRole}
      permissions={permissions}
      permissionsReady={permissionsReady}
      allowedRoles={allowedRoles}
    />
  );

  if (rootRoute.kind === "pending") {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-8">
        <div className="w-full max-w-7xl">
          <div className="grid grid-cols-4 gap-4">
            <SkeletonKPICard theme="admin" />
            <SkeletonKPICard theme="admin" />
            <SkeletonKPICard theme="admin" />
            <SkeletonKPICard theme="admin" />
          </div>
          <SkeletonChart theme="admin" className="mt-6 h-64" />
        </div>
      </div>
    );
  }

  const rootElement =
    rootRoute.kind === "redirect" ? (
      <Navigate to={rootRoute.to} replace />
    ) : (
      <Products isAuthenticated={isAuth} />
    );

  return (
    <Routes>
      {/* ── Public ───────────────────────────────────────────── */}
      <Route path="/" element={rootElement} />

      {/* /login is only for guests — logged-in users are redirected to their home */}
      <Route
        path="/login"
        element={<PublicOnlyRoute element={<Login />} redirectTo={homePath} />}
      />

      {/* /forgot-password is public — no redirect needed for logged-in users */}
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/aboutthecrunch" element={<AboutTheCrunch />} />
      <Route
        path="/my-account"
        element={isAuth ? <MyAccount /> : <Navigate to="/login?returnTo=/my-account" replace />}
      />

      {/* ── Customer landing (public, but passes auth state for nav) ── */}
      <Route path="/products" element={<Products isAuthenticated={isAuth} />} />
      <Route path="/products-v2" element={<ProductsV2 />} />


      {/* ── Customer menu ────────────────────────────────────── */}
      <Route
        path="/usersmenu"
        element={<UsersMenu />}
      />

      {/* ── Administrator ────────────────────────────────────── */}
      <Route
        path="/orders"
        element={protect(<Order />, "orders", COOK_VIEW_ROLES)}
      />
      <Route
        path="/dashboard"
        element={protect(<AdminDashboard />, "overview")}
      />
      <Route
        path="/sales-reports"
        element={protect(<SalesReports />, "salesReports")}
      />
      <Route path="/menu" element={protect(<Menu />, "menus")} />
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
      {/* ── Fallbacks ────────────────────────────────────────── */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/" replace />} />

      {/* ── Settings ────────────────────────────────────────── */}
      <Route path="/settings" element={protect(<Settings />, "settings")} />
    </Routes>
  );
}
