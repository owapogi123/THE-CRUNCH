import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import React from "react"; // ✅ add this
import AdminDashboard from "./pages/index";
import Order from "./pages/Order";
import Inventory from "./pages/inventory";
import Login from "./pages/login";
import Menu from "./pages/menu";
import Products from "./pages/products";
import StaffAccounts from "./pages/staffaccounts";
import SalesReports from "./pages/sales-reports";
import AboutTheCrunch from "./pages/aboutthecrunch";
import UsersMenu from "./pages/usersmenu";
import StockManager from "./pages/stockmanager";

type Role =
  | "administrator"
  | "cashier"
  | "cook"
  | "inventory_manager"
  | "customer"
  | null;

function ProtectedRoute({
  element,
  allowedRoles,
  isAuth,
  userRole,
}: {
  element: React.ReactElement; // ✅ changed from JSX.Element
  allowedRoles: Role[];
  isAuth: boolean;
  userRole: Role;
}) {
  if (!isAuth) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(userRole))
    return <Navigate to="/unauthorized" replace />;
  return element;
}

function Unauthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-red-500">403</h1>
      <p className="text-gray-600">
        You don't have permission to view this page.
      </p>
      <button
        onClick={() => window.history.back()}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black"
      >
        Go Back
      </button>
    </div>
  );
}

export default function App() {
  const [isAuth, setIsAuth] = useState<boolean>(
    () => localStorage.getItem("isAuthenticated") === "true",
  );

  const [userRole, setUserRole] = useState<Role>(
    () => localStorage.getItem("userRole") as Role,
  );

  useEffect(() => {
    const handler = () => {
      setIsAuth(localStorage.getItem("isAuthenticated") === "true");
      setUserRole(localStorage.getItem("userRole") as Role);
    };
    window.addEventListener("storage", handler);
    window.addEventListener("authChange", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("authChange", handler);
    };
  }, []);

  const protect = (
    element: React.ReactElement,
    allowedRoles: Role[], // ✅ changed
  ) => (
    <ProtectedRoute
      element={element}
      allowedRoles={allowedRoles}
      isAuth={isAuth}
      userRole={userRole}
    />
  );

  return (
    <Routes>
      {/* ── Public ───────────────────────────── */}
      <Route path="/login" element={<Login />} />
      <Route path="/aboutthecrunch" element={<AboutTheCrunch />} />
      <Route path="/usersmenu" element={<UsersMenu />} />
      <Route path="/" element={<Products />} />

      {/* ── Administrator only ───────────────── */}
      <Route
        path="/dashboard"
        element={protect(<AdminDashboard />, ["administrator"])}
      />
      <Route path="/menu" element={protect(<Menu />, ["administrator"])} />
      <Route
        path="/products"
        element={protect(<Products />, ["administrator"])}
      />
      <Route
        path="/users"
        element={protect(<StaffAccounts />, ["administrator"])}
      />
      <Route
        path="/sales-reports"
        element={protect(<SalesReports />, ["administrator"])}
      />

      {/* ── Admin + Cashier + Cook ───────────── */}
      <Route
        path="/orders"
        element={protect(<Order />, ["administrator", "cashier", "cook"])}
      />

      {/* ── Admin + Inventory Manager ────────── */}
      <Route
        path="/inventory"
        element={protect(<Inventory />, ["administrator", "inventory_manager"])}
      />
      <Route
        path="/stockmanager"
        element={protect(<StockManager />, [
          "administrator",
          "inventory_manager",
        ])}
      />

      {/* ── Fallbacks ────────────────────────── */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
