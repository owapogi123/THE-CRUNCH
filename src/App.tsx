import { Routes, Route, Navigate } from "react-router-dom";
import { MainLayout } from "./layout/MainLayout";

import Home from "@/pages/index";
import Inventory from "@/pages/inventory";
import Login from "@/pages/login";
import Menu from "@/pages/menu";
import OrderPage from "@/pages/Order";
import Products from "@/pages/products";
import Users from "@/pages/useraccounts";

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuth = localStorage.getItem("isAuthenticated") === "true";
  return isAuth ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public product pages */}
      <Route path="/" element={<Products />} />
      <Route path="/products" element={<Products />} />

      <Route element={<MainLayout />}>
        <Route
          path="/inventory"
          element={
            <RequireAuth>
              <Inventory />
            </RequireAuth>
          }
        />
        <Route
          path="/menu"
          element={
            <RequireAuth>
              <Menu />
            </RequireAuth>
          }
        />
        <Route
          path="/order"
          element={
            <RequireAuth>
              <OrderPage />
            </RequireAuth>
          }
        />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth>
              <Users />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
