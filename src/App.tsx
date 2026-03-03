import { Routes, Route } from "react-router-dom"
import AdminDashboard from "./pages/index"

import Order from "./pages/Order"
import Inventory from "./pages/inventory"
import Login from "./pages/login"
import Menu from "./pages/menu"
import Products from "./pages/products"
import UserAccounts from "./pages/useraccounts"
import { Navigate } from "react-router-dom"

export default function App() {
  const isAuth = localStorage.getItem("isAuthenticated") === "true";

  return (
    <Routes>
      {/* public pages */}
      <Route path="/" element={<Products />} />
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