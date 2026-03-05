import { Routes, Route, Navigate } from "react-router-dom"
import { useState, useEffect } from "react"
import AdminDashboard from "./pages/index"
import Order from "./pages/Order"
import Inventory from "./pages/inventory"
import Login from "./pages/login"
import Menu from "./pages/menu"
import Products from "./pages/products"
import StaffAccounts from "./pages/staffaccounts"
import SalesReports from "./pages/sales-reports"
import AboutTheCrunch from "./pages/aboutthecrunch"
import UsersMenu from "./pages/usersmenu"

export default function App() {
  const [isAuth, setIsAuth] = useState(() =>
    localStorage.getItem("isAuthenticated") === "true"
  );

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
      <Route path="/" element={<AboutTheCrunch />} />
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={isAuth ? <AdminDashboard /> : <Navigate to="/login" />} />
      <Route path="/orders"    element={isAuth ? <Order />          : <Navigate to="/login" />} />
      <Route path="/inventory" element={isAuth ? <Inventory />      : <Navigate to="/login" />} />
      <Route path="/menu"      element={isAuth ? <Menu />           : <Navigate to="/login" />} />
      <Route path="/products"  element={isAuth ? <Products />       : <Navigate to="/login" />} />
      <Route path="/users"     element={isAuth ? <StaffAccounts />   : <Navigate to="/login" />} />
      <Route path="/sales-reports" element={isAuth ? <SalesReports /> : <Navigate to="/login" />} />
      <Route path="/aboutthecrunch" element={<AboutTheCrunch />} />\
      <Route path="/usersmenu" element={<UsersMenu />} />

      {/* catch all */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}