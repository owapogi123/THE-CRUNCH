"use client"

import { useState, useEffect } from "react"
import { Link, NavLink } from "react-router-dom"
import { Clock, Menu as MenuIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface OrderItem {
  quantity: number
  name: string
}

interface OrderCard {
  id: string
  tableNumber: number
  status: "dine-in" | "take-out"
  items: OrderItem[]
  isPreparing: boolean
  isFinished: boolean
}

interface OrderStats {
  new: number
  ready: number
  process: number
  served: number
}

const navigationItems = [
  { label: "Overview", path: "/dashboard" },
  { label: "Order", path: "/orders" },
  { label: "Inventory", path: "/inventory" },
  { label: "Products", path: "/products" },
  { label: "Reports", path: "/reports" },
  { label: "Sales", path: "/sales" },
  { label: "Menus", path: "/menu" },
]

const additionalItems = [
  { label: "User Accounts", path: "/users" },
  { label: "Menu Management", path: "/menu-management" },
  { label: "Supplier Maintenance", path: "/suppliers" },
]

export default function Order() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isOpen, setIsOpen] = useState(false)
  const [orders, setOrders] = useState<OrderCard[]>([
    {
      id: "1",
      tableNumber: 5,
      status: "dine-in",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: false,
      isFinished: false,
    },
    {
      id: "2",
      tableNumber: 5,
      status: "dine-in",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: true,
      isFinished: false,
    },
    {
      id: "3",
      tableNumber: 5,
      status: "take-out",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: false,
      isFinished: false,
    },
    {
      id: "4",
      tableNumber: 5,
      status: "dine-in",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: false,
      isFinished: false,
    },
    {
      id: "5",
      tableNumber: 5,
      status: "dine-in",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: true,
      isFinished: false,
    },
    {
      id: "6",
      tableNumber: 5,
      status: "take-out",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: false,
      isFinished: false,
    },
    {
      id: "7",
      tableNumber: 5,
      status: "dine-in",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: false,
      isFinished: false,
    },
    {
      id: "8",
      tableNumber: 5,
      status: "take-out",
      items: [
        { quantity: 2, name: "Chicken Pops" },
        { quantity: 2, name: "French Fries" },
        { quantity: 1, name: "Lemonade Juice" },
      ],
      isPreparing: false,
      isFinished: false,
    },
  ])
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatDateTime = (date: Date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayName = days[date.getDay()]
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const year = String(date.getFullYear()).slice(-2)
    
    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12 || 12
    
    return `${dayName}, ${month}/${day}/${year} ${hours}:${minutes} ${ampm}`
  }

  const stats: OrderStats = {
    new: 10,
    ready: 5,
    process: 15,
    served: 8,
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      "dine-in": "bg-red-600 text-white",
      "take-out": "bg-amber-600 text-white",
    }
    return colors[status] || "bg-gray-600 text-white"
  }

  const getStatusLabel = (status: string) => {
    return status === "dine-in" ? "Dine In" : "Take Out"
  }

  const toggleStartOrder = (id: string) => {
    setOrders(orders.map((order) => (order.id === id ? { ...order, isPreparing: true } : order)))
  }

  const toggleFinishOrder = (id: string) => {
    setOrders(orders.map((order) => (order.id === id ? { ...order, isPreparing: false, isFinished: true } : order)))
    
    setTimeout(() => {
      setOrders(prevOrders => prevOrders.filter(order => order.id !== id))
    }, 100)
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Poppins, sans-serif' }}>

      <>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
        >
          {isOpen ? (
            <X className="w-6 h-6 text-black" />
          ) : (
            <MenuIcon className="w-6 h-6 text-black" />
          )}
        </button>

        {isOpen && (
          <div
            className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all duration-300"
            onClick={() => setIsOpen(false)}
          />
        )}
          {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-0 left-0 h-full w-72 bg-white p-6 flex flex-col shadow-2xl z-50 transition-all duration-300 ease-in-out",
            isOpen ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
          )}
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <div className="flex items-center justify-center mb-10 mt-8">
            <span className="text-2xl font-bold text-black">
              The Crunch
            </span>
          </div>

          <div className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-medium px-2">
            Navigation
          </div>

          <nav className="flex-1 space-y-1.5">
            {navigationItems.map((item) => (
              <NavLink key={item.label} to={item.path} end onClick={() => setIsOpen(false)}>
                {({ isActive }) => (
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl text-sm transition-all duration-300 px-4 py-2.5",
                      "text-black hover:bg-gray-50 hover:shadow-sm hover:scale-[1.02] active:scale-95",
                      isActive && "bg-gray-100 text-black font-semibold"
                    )}
                  >
                    {item.label}
                  </Button>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-1.5 mt-6 pt-6 border-t border-gray-100">
            {additionalItems.map((item) => (
              <NavLink key={item.label} to={item.path} onClick={() => setIsOpen(false)}>
                {({ isActive }) => (
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start rounded-xl text-sm transition-all duration-300 px-4 py-2.5",
                      "text-black hover:bg-gray-50 hover:shadow-sm hover:scale-[1.02] active:scale-95",
                      isActive && "bg-gray-100 text-black font-semibold"
                    )}
                  >
                    {item.label}
                  </Button>
                )}
              </NavLink>
            ))}

            <Link to="/login" className="w-full">
              <Button
                variant="ghost"
                className="w-full justify-start rounded-xl text-sm text-black mt-6 transition-all duration-300 px-4 py-2.5 hover:bg-red-50 hover:text-red-600 hover:shadow-sm hover:scale-[1.02] active:scale-95"
                onClick={() => setIsOpen(false)}
              >
                Log Out
              </Button>
            </Link>
          </div>
        </aside>
      </>
      <div className="p-6 pl-24">
        <div className="mb-8">
          <h1 className="text-sm font-semibold text-gray-700 tracking-wider mb-6">ORDERS</h1>
          <div className="flex gap-6 items-start mb-8">
            <div className="bg-white rounded-2xl p-6 flex-1 max-w-sm shadow-lg">
              <div className="flex justify-between items-center mb-3">
                <MenuIcon className="w-5 h-5 text-gray-900" />
                <span className="text-xs font-semibold text-gray-500">COOK VIEW</span>
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-600 flex items-center gap-1 mb-2">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(currentTime)}
                  </p>
                </div>
              </div>
            </div>
     
            <div className="flex gap-4 flex-1">
              <div className="bg-red-700 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-white text-sm font-semibold mb-3">NEW</span>
                <span className="text-white text-3xl font-bold">{stats.new}</span>
              </div>

              <div className="bg-green-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-white text-sm font-semibold mb-3">READY</span>
                <span className="text-white text-3xl font-bold">{stats.ready}</span>
              </div>

              <div className="bg-yellow-400 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-gray-900 text-sm font-semibold mb-3">PROCESS</span>
                <span className="text-gray-900 text-3xl font-bold">{stats.process}</span>
              </div>

              <div className="bg-gray-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-white text-sm font-semibold mb-3">SERVED</span>
                <span className="text-white text-3xl font-bold">{stats.served}</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-100 rounded-3xl p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AnimatePresence mode="popLayout">
                {orders.map((order) => (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      y: 0,
                      transition: {
                        type: "spring",
                        stiffness: 300,
                        damping: 25
                      }
                    }}
                    exit={{ 
                      opacity: 0, 
                      scale: 0.8,
                      y: -20,
                      transition: {
                        duration: 0.3,
                        ease: "easeInOut"
                      }
                    }}
                    whileHover={{ 
                      scale: 1.02,
                      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                      transition: {
                        duration: 0.2
                      }
                    }}
                    className="bg-white rounded-2xl p-5 shadow-md"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">TABLE {order.tableNumber}</span>
                      </div>
                      <span className={`${getStatusColor(order.status)} text-xs font-bold px-3 py-1 rounded-full`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <div className="space-y-2 mb-6 border-b border-gray-200 pb-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm text-gray-700">
                          <span className="font-semibold">{item.quantity}x</span>
                          <span className="text-gray-600">{item.name}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <motion.button
                        onClick={() => toggleStartOrder(order.id)}
                        disabled={order.isPreparing || order.isFinished}
                        whileTap={{ scale: order.isPreparing || order.isFinished ? 1 : 0.95 }}
                        className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
                          order.isPreparing || order.isFinished
                            ? "bg-white text-gray-400 shadow-md opacity-50 cursor-not-allowed"
                            : "bg-white text-gray-900 shadow-md hover:shadow-lg hover:scale-105"
                        }`}
                      >
                        START
                      </motion.button>
                      <motion.button
                        onClick={() => toggleFinishOrder(order.id)}
                        disabled={!order.isPreparing}
                        whileTap={{ scale: order.isPreparing ? 0.95 : 1 }}
                        whileHover={{ scale: order.isPreparing ? 1.05 : 1 }}
                        className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
                          order.isPreparing
                            ? "bg-green-600 text-white hover:bg-green-700 hover:shadow-lg"
                            : "bg-green-600 text-white opacity-50 cursor-not-allowed"
                        }`}
                      >
                        FINISHED
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}