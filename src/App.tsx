import { Routes, Route } from "react-router-dom"
import { useState, useEffect } from "react"
import AdminDashboard from "./pages/index"

import Order from "./pages/Order"
import Inventory from "./pages/inventory"
import Login from "./pages/login"
import Menu from "./pages/menu"
import Products from "./pages/products"
import UserAccounts from "./pages/useraccounts"
import { Navigate } from "react-router-dom"

export default function App() {
  // keep auth flag in state so routing updates when storage changes (logout/login)
  const [isAuth, setIsAuth] = useState(() =>
    localStorage.getItem("isAuthenticated") === "true"
  );

  // listen for storage events (another tab or manual clear) and custom auth changes
  useEffect(() => {
    const handler = () => {
      setIsAuth(localStorage.getItem("isAuthenticated") === "true");
    };
    window.addEventListener("storage", handler);
    window.addEventListener("authChange", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("authChange", handler);
    };
  }, []);

  return (
    <Routes>
      {/* public pages; if already authenticated, send root to dashboard */}
      <Route
        path="/"
        element={isAuth ? <Navigate to="/dashboard" /> : <Products />}
      />
      <Route path="/login" element={<Login />} />

      {/* protected pages */}
      <Route
        path="/dashboard"
        element={isAuth ? <AdminDashboard /> : <Navigate to="/login" />}
      />
      <Route
        path="/orders"
        element={isAuth ? <Order /> : <Navigate to="/login" />}
      />
      <Route
        path="/inventory"
        element={isAuth ? <Inventory /> : <Navigate to="/login" />}
      />
      <Route
        path="/menu"
        element={isAuth ? <Menu /> : <Navigate to="/login" />}
      />
      <Route
        path="/products"
        element={isAuth ? <Products /> : <Navigate to="/login" />}
      />
      <Route
        path="/users"
        element={isAuth ? <UserAccounts /> : <Navigate to="/login" />}
      />
      {/* catch all redirect */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}