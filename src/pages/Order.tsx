"use client"

import { useState, useEffect, useRef } from "react"
import { Link, NavLink } from "react-router-dom"
import { Clock, Menu as MenuIcon, X, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { api } from "../lib/api" // for backend calls

interface OrderItem {
  quantity: number
  name: string
}

interface OrderCard {
  id: string
  orderNumber: string
  tableNumber: number
  status: "dine-in" | "take-out"
  items: OrderItem[]
  isPreparing: boolean
  isFinished: boolean
  startedAt?: number // timestamp when START was clicked
}

const COOK_TIME_SECONDS = 10 * 60 // 10 minutes default cook time

const navigationItems = [
  { label: "Dashboard", path: "/" },
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

// ── Timer display component per card ──────────────────────────────
function OrderTimer({ startedAt, orderNumber }: { startedAt: number; orderNumber: string }) {
  const [elapsed, setElapsed] = useState(0)
  const notifiedRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000)
      setElapsed(secs)

      // 🔔 Notify when cook time is up (once)
      if (secs >= COOK_TIME_SECONDS && !notifiedRef.current) {
        notifiedRef.current = true

        // Browser notification
        if (Notification.permission === "granted") {
          new Notification("🍗 Order Ready!", {
            body: `Order ${orderNumber} is done and ready to serve!`,
            icon: "/favicon.ico",
          })
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [startedAt, orderNumber])

  const remaining = COOK_TIME_SECONDS - elapsed
  const isOverdue = remaining <= 0
  const displaySeconds = isOverdue ? Math.abs(remaining) : remaining
  const mins = Math.floor(displaySeconds / 60)
  const secs = displaySeconds % 60
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`

  return (
    <div className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold mb-3 ${
      isOverdue
        ? "bg-red-100 text-red-600 animate-pulse"
        : elapsed > COOK_TIME_SECONDS * 0.75
        ? "bg-yellow-100 text-yellow-700"
        : "bg-green-100 text-green-700"
    }`}>
      <Clock className="w-3 h-3" />
      {isOverdue ? `OVERDUE +${timeStr}` : timeStr}
    </div>
  )
}

export default function Order() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isOpen, setIsOpen] = useState(false)
  const [notifPermission, setNotifPermission] = useState(Notification.permission)
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

  // ✅ Load cook queue from localStorage and poll every 3 seconds
  useEffect(() => {
    const loadQueue = () => {
      const queue = JSON.parse(localStorage.getItem("cookQueue") || "[]")
      setOrders(queue)
    }
    loadQueue()
    window.addEventListener("storage", loadQueue)
    const interval = setInterval(loadQueue, 3000)
    return () => {
      window.removeEventListener("storage", loadQueue)
      clearInterval(interval)
    }
  }, [])

  // --- POS state for cashier
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [orderType, setOrderType] = useState<'dine-in'|'take-out'>('dine-in')

  useEffect(() => {
    api.get<any[]>('/products').then(setProducts).catch(console.error)
  }, [])

  const addToCart = (prod: any) => {
    setCart((c) => {
      const existing = c.find((x) => x.id === prod.id)
      if (existing) {
        return c.map((x) =>
          x.id === prod.id
            ? { ...x, qty: x.qty + 1, subtotal: +(x.qty + 1) * prod.price }
            : x
        )
      }
      return [...c, { id: prod.id, name: prod.name, price: +prod.price, qty: 1, subtotal: +prod.price }]
    })
  }

  const updateQty = (id: number, qty: number) => {
    if (qty <= 0) {
      setCart((c) => c.filter((x) => x.id !== id))
    } else {
      setCart((c) =>
        c.map((x) =>
          x.id === id ? { ...x, qty, subtotal: qty * x.price } : x
        )
      )
    }
  }

  const total = cart.reduce((sum, x) => sum + x.subtotal, 0)

  const submitOrder = async () => {
    if (cart.length === 0) return alert('Cart is empty')
    try {
      const items = cart.map((x) => ({ product_id: x.id, qty: x.qty, subtotal: x.subtotal }))
      const body: any = { items, total, orderType }
      const res = await api.post('/orders', body)
      alert('Order saved!')
      // add to localStorage queue and orders
      const saved = JSON.parse(localStorage.getItem('orders') || '[]')
      const newOrder = { id: res.orderId || Date.now(), status: 'Pending', items: cart, total }
      localStorage.setItem('orders', JSON.stringify([newOrder, ...saved]))
      const queue = JSON.parse(localStorage.getItem('cookQueue') || '[]')
      localStorage.setItem('cookQueue', JSON.stringify([newOrder, ...queue]))
      setCart([])
      // refresh inventory
      api.get<any[]>('/products').then(setProducts).catch(console.error)
    } catch (err) {
      console.error(err)
      alert('Failed to submit order')
    }
  }

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      "dine-in": "bg-red-600 text-white",
      "take-out": "bg-amber-600 text-white",
    }
    return colors[status] || "bg-gray-600 text-white"
  }

  const getStatusLabel = (status: string) => status === "dine-in" ? "Dine In" : "Take Out"

  const toggleStartOrder = (id: string) => {
    const updatedOrders = orders.map((order) =>
      order.id === id
        ? { ...order, isPreparing: true, startedAt: Date.now() } // ✅ save start time
        : order
    )
    setOrders(updatedOrders)
    localStorage.setItem("cookQueue", JSON.stringify(updatedOrders))
  }

  const toggleFinishOrder = (id: string) => {
    // updating order
    const allOrders = JSON.parse(localStorage.getItem("orders") || "[]")
    const updatedAllOrders = allOrders.map((o: any) =>
      o.id === Number(id) ? { ...o, status: "Completed" } : o
    )
    localStorage.setItem("orders", JSON.stringify(updatedAllOrders))

    // remove from cook queue
    const updatedQueue = orders.filter((order) => order.id !== id)
    setOrders(updatedQueue)
    localStorage.setItem("cookQueue", JSON.stringify(updatedQueue))
  }   

  const newCount = orders.filter(o => !o.isPreparing).length
  const processCount = orders.filter(o => o.isPreparing).length
  const servedCount = JSON.parse(localStorage.getItem("orders") || "[]").filter((o: any) => o.status === "Completed").length

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {/* SIDEBAR */}
      <>
        {/* Sidebar Toggle Button */}
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

        {/* Backdrop */}
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

      {/* MAIN CONTENT */}
      <div className="p-6 pl-24">
        {/* cashier POS panel */}
        <div className="mb-8 bg-white rounded-2xl p-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Point of Sale</h2>
          <div className="flex flex-col md:flex-row gap-6">
            {/* product list */}
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-2">Products</h3>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                {products.map((p) => (
                  <button
                    key={p.id}
                    className="border rounded p-2 text-left hover:bg-gray-100"
                    onClick={() => addToCart(p)}
                  >
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">₱{p.price}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* cart section */}
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-2">Cart</h3>
              {cart.length === 0 ? (
                <p className="text-gray-500 text-xs">No items</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((c) => (
                    <div key={c.id} className="flex justify-between items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm font-medium flex-1">{c.name}</span>
                      <input
                        type="number"
                        min="1"
                        value={c.qty}
                        onChange={(e) => updateQty(c.id, Number(e.target.value))}
                        className="w-10 border px-1 py-1 text-xs text-center rounded"
                      />
                      <span className="text-sm font-medium min-w-16 text-right">₱{c.subtotal.toFixed(2)}</span>
                      <button
                        onClick={() => updateQty(c.id, 0)}
                        className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 transition"
                        title="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold border-t pt-2 mt-2">
                    <span>Total</span>
                    <span>₱{total.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as any)}
                      className="border px-2 py-1 text-sm rounded"
                    >
                      <option value="dine-in">Dine-In</option>
                      <option value="take-out">Take-Out</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={submitOrder}
                      className="flex-1 bg-green-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-green-700 transition"
                    >
                      Submit Order
                    </button>
                    <button
                      onClick={() => {
                        setCart([])
                        setOrderType('dine-in')
                      }}
                      className="flex-1 bg-red-600 text-white px-3 py-2 rounded text-xs font-bold hover:bg-red-700 transition"
                    >
                      Cancel Order
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-sm font-semibold text-gray-700 tracking-wider">ORDERS</h1>
            {/* Notif */}
            {notifPermission !== "granted" && (
              <button
                onClick={() => Notification.requestPermission().then(p => setNotifPermission(p))}
                className="flex items-center gap-2 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition"
              >
                <Bell className="w-3 h-3" />
                Enable notifications for order alerts
              </button>
            )}
          </div>

          <div className="flex gap-6 items-start mb-8">
            <div className="bg-white rounded-2xl p-6 flex-1 max-w-sm shadow-lg">
              <div className="flex justify-between items-center mb-3">
                <MenuIcon className="w-5 h-5 text-gray-900" />
                <span className="text-xs font-semibold text-gray-500">COOK VIEW</span>
              </div>
              <p className="text-xs text-gray-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDateTime(currentTime)}
              </p>
            </div>

            <div className="flex gap-4 flex-1">
              <div className="bg-red-700 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-white text-sm font-semibold mb-3">NEW</span>
                <span className="text-white text-3xl font-bold">{newCount}</span>
              </div>
              <div className="bg-green-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-white text-sm font-semibold mb-3">READY</span>
                <span className="text-white text-3xl font-bold">0</span>
              </div>
              <div className="bg-yellow-400 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-gray-900 text-sm font-semibold mb-3">PROCESS</span>
                <span className="text-gray-900 text-3xl font-bold">{processCount}</span>
              </div>
              <div className="bg-gray-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
                <span className="text-white text-sm font-semibold mb-3">SERVED</span>
                <span className="text-white text-3xl font-bold">{servedCount}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-100 rounded-3xl p-4 shadow-sm">
            {orders.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-gray-400 text-sm">No pending orders. Orders from the cashier will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {orders.map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                      exit={{ opacity: 0, scale: 0.8, y: -20, transition: { duration: 0.3 } }}
                      whileHover={{ scale: 1.02, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
                      className="bg-white rounded-2xl p-5 shadow-md"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs text-gray-400 mt-0.5">{order.orderNumber}</p>
                        </div>
                        <span className={`${getStatusColor(order.status)} text-xs font-bold px-3 py-1 rounded-full`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>

                      {/* TIMER */}
                      {order.isPreparing && order.startedAt && (
                        <OrderTimer startedAt={order.startedAt} orderNumber={order.orderNumber} />
                      )}

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
                          disabled={order.isPreparing}
                          whileTap={{ scale: order.isPreparing ? 1 : 0.95 }}
                          className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
                            order.isPreparing
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}