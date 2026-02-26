import { Routes, Route } from "react-router-dom"
import AdminDashboard from "./pages/index"
import Order from "./pages/Order"
import Inventory from "./pages/inventory"
import Login from "./pages/login"
import Menu from "./pages/menu"
import Products from "./pages/products"
import UserAccounts from "./pages/useraccounts"
import About from "./pages/about"

export default function App() {
  return (
    <Routes>
        <Route path="/" element={<Login/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="/orders" element={<Order />} />
        <Route path="/inventory" element={<Inventory/>} />
        <Route path="/menu" element={<Menu/>} />
        <Route path="/products" element={<Products/>} />
        <Route path="/users" element={<UserAccounts/>} />
        <Route path="/about" element={<About/>} />
    </Routes>  
  )
}