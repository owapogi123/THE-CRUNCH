import { Routes, Route } from "react-router-dom"
import AdminDashboard from "./pages/index"


import Order from "./pages/Order"
import Inventory from "./pages/inventory"

export default function App() {
  return (
    <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/orders" element={<Order />} />
         <Route path="/inventory" element={<Inventory/>} />
    </Routes>
  )
}
