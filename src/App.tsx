import { Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import { useAuth } from "./context/authcontext";

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

// ── Redirects already-logged-in users away from /login ──────────────────────
function PublicOnlyRoute({ element }: { element: React.ReactElement }) {
  const { user } = useAuth();
  if (user) {
    // Already logged in — send them to their home page instead of /login
    return <Navigate to={ROLE_MAP[user.role] ?? "/"} replace />;
  }
  return element;
}

function ProtectedRoute({
  element,
  allowedRoles,
  isAuth,
  userRole,
}: {
  element: React.ReactElement;
  allowedRoles: Role[];
  isAuth: boolean;
  userRole: Role;
}) {
  if (!isAuth) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(userRole)) return <Navigate to="/unauthorized" replace />;
  return element;
}

function Unauthorized() {
  const { user } = useAuth();

  return (
    <div
      style={{ fontFamily: "'Poppins', sans-serif" }}
      className="min-h-screen flex flex-col items-center justify-center gap-4"
    >
      <h1 className="text-4xl font-bold text-red-500">403</h1>
      <p className="text-gray-600">You don't have permission to view this page.</p>
      <button
        onClick={() =>
          (window.location.href = ROLE_MAP[user?.role ?? ""] || "/login")
        }
        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black"
      >
        Go to my dashboard
      </button>
    </div>
  );
}

export default function App() {
  const { user, logout } = useAuth();
  const isAuth = !!user;
  const userRole = (user?.role ?? null) as Role;

  const protect = (element: React.ReactElement, allowedRoles: Role[]) => (
    <ProtectedRoute
      element={element}
      allowedRoles={allowedRoles}
      isAuth={isAuth}
      userRole={userRole}
    />
  );

  return (
    <Routes>
      {/* ── Public ───────────────────────────────────────────── */}
      <Route path="/" element={<Navigate to="/products" replace />} />

      {/* /login is only for guests — logged-in users are redirected to their home */}
      <Route
        path="/login"
        element={<PublicOnlyRoute element={<Login />} />}
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
        element={protect(<UsersMenu />, ["administrator", "customer"])}
      />

      {/* ── Administrator ────────────────────────────────────── */}
      <Route
        path="/dashboard"
        element={protect(<AdminDashboard />, ["administrator", "inventory_manager"])}
      />
      <Route
        path="/sales-reports"
        element={protect(<SalesReports />, ["administrator", "cashier"])}
      />
      <Route
        path="/menu"
        element={protect(<Menu />, ["administrator", "cashier"])}
      />
      <Route
        path="/users"
        element={protect(<StaffAccounts />, ["administrator"])}
      />

      {/* ── Administrator + Inventory Manager ────────────────── */}
      <Route
        path="/inventory"
        element={protect(<Inventory />, ["administrator", "inventory_manager"])}
      />
      <Route
        path="/stockmanager"
        element={protect(<StockManager />, ["administrator", "inventory_manager"])}
      />

      {/* ── Administrator + Cashier + Cook ───────────────────── */}
      <Route
        path="/orders"
        element={protect(<Order />, ["administrator", "cashier", "cook"])}
      />

      {/* ── Cook ─────────────────────────────────────────────── */}
      <Route
        path="/cook/orders"
        element={protect(<Order />, ["administrator", "cook"])}
      />

      {/* ── Fallbacks ────────────────────────────────────────── */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/" replace />} />



      {/* ── Settings ────────────────────────────────────────── */}
      <Route path="/settings" element={protect(<Settings />, ["administrator" , "cook" , "cashier" , "inventory_manager"])} />
    </Routes>
  );
}