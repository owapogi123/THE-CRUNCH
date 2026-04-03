import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import React from "react";

// ── Admin pages
import AdminDashboard from "./pages/index";
import SalesReports from "./pages/sales-reports";
import Inventory from "./pages/inventory";
import Menu from "./pages/menu";
import StaffAccounts from "./pages/staffaccounts";
import StockManager from "./pages/stockmanager";
import Products from "./pages/products";

// ── Cashier pages
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
  if (!allowedRoles.includes(userRole))
    return <Navigate to="/unauthorized" replace />;
  return element;
}

function Unauthorized() {
  const role = localStorage.getItem("userRole");

  // Redirect to their home instead of blank page
  const roleHomeMap: Record<string, string> = {
    administrator: "/dashboard",
    cashier: "/menu",
    cook: "/cook/orders",
    inventory_manager: "/inventory",
    customer: "/usersmenu",
  };

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
        onClick={() => (window.location.href = roleHomeMap[role || ""] || "/")}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black"
      >
        Go to my dashboard
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
      {/* ── Public (Customer) ──────────────────────────────────── */}
      <Route path="/" element={<Products />} />
      <Route path="/login" element={<Login />} />
      <Route path="/aboutthecrunch" element={<AboutTheCrunch />} />
      <Route path="/usersmenu" element={<UsersMenu />} />

      {/* ── Administrator only ─────────────────────────────────── */}
      {/* Dashboard, Sales, Inventory, Menu, Users, Reports        */}
      <Route
        path="/dashboard"
        element={protect(<AdminDashboard />, [
          "administrator",
          "inventory_manager",
        ])}
      />

      <Route
        path="/sales-reports"
        element={protect(<SalesReports />, ["administrator"])}
      />

      <Route
        path="/menu"
        element={protect(<Menu />, ["administrator", "cashier"])}
      />

      <Route
        path="/products"
        element={protect(<Products />, ["administrator", "customer"])}
      />

      <Route
        path="/users"
        element={protect(<StaffAccounts />, ["administrator"])}
      />

      {/* ── Administrator + Inventory Manager ─────────────────── */}
      {/* Inventory dashboard, stock manager, low stock alerts     */}
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

      {/* ── Administrator + Cashier ────────────────────────────── */}
      {/* Orders, payments, receipts, transaction history          */}
      <Route
        path="/orders"
        element={protect(<Order />, ["administrator", "cashier", "cook"])}
      />

      {/* ── Cook only ──────────────────────────────────────────── */}
      {/* Order queue, order status updates, notifications         */}
      <Route
        path="/cook/orders"
        element={protect(<Order />, ["administrator", "cook"])}
      />

      {/* ── Fallbacks ──────────────────────────────────────────── */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
