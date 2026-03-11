"use client"

import { useState, useEffect, useRef } from "react"
import { Clock, Menu as MenuIcon, Bell, History, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { api } from "../lib/api"
import { Sidebar } from "@/components/Sidebar"

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
  startedAt?: number
}

interface HistoryEntry {
  id: string
  orderNumber: string
  status: "Completed" | "Cancelled"
  items: OrderItem[]
  orderType: string
  paymentMethod: string
  total: number
  finishedAt: Date
}

const COOK_TIME_SECONDS = 10 * 60

function OrderTimer({ startedAt, orderNumber }: { startedAt: number; orderNumber: string }) {
  const [elapsed, setElapsed] = useState(0)
  const notifiedRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000)
      setElapsed(secs)
      if (secs >= COOK_TIME_SECONDS && !notifiedRef.current) {
        notifiedRef.current = true
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
  const [notifPermission, setNotifPermission] = useState(Notification.permission)
  const [orders, setOrders] = useState<OrderCard[]>([])
  const [servedCount, setServedCount] = useState(0)
  const [activeTab, setActiveTab] = useState<"queue" | "history">("queue")
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const fetchQueue = async () => {
    try {
      const data = await api.get<any[]>('/orders/queue')
      setOrders((data || []).filter((o: any) => !o.isFinished))
    } catch (err) {
      console.error('Failed to fetch queue', err)
    }
  }

  const fetchServedCount = async () => {
    try {
      const data = await api.get<any[]>('/orders')
      const completedIds = new Set(
        (data || [])
          .filter((o: any) => o.status === 'Completed')
          .map((o: any) => String(o.id || o.orderId))
      )
      setServedCount(completedIds.size)
    } catch (err) {
      console.error('Failed to fetch served count', err)
    }
  }

  const fetchHistory = async () => {
    try {
      const data = await api.get<any[]>('/orders')
      const grouped: Record<string, HistoryEntry> = {}

      ;(data || []).forEach((o: any) => {
        if (o.status !== 'Completed' && o.status !== 'Cancelled') return

        const id = String(o.id || o.orderId)
        if (!grouped[id]) {
          grouped[id] = {
            id,
            orderNumber: o.orderNumber || `#${o.id || o.orderId}`,
            status: o.status,
            items: [],
            orderType: o.order_type || o.orderType || 'dine-in',
            paymentMethod: o.payment_method || o.paymentMethod || 'cash',
            total: Number(o.total) || 0,
            finishedAt: new Date(o.updatedAt || o.date || o.createdAt || Date.now()),
          }
        }

        if (o.productId || o.productName) {
          grouped[id].items.push({
            quantity: Number(o.quantity) || 0,
            name: o.productName || `Product #${o.productId}`,
          })
        }
      })

      const finished = Object.values(grouped)
        .sort((a: HistoryEntry, b: HistoryEntry) => b.finishedAt.getTime() - a.finishedAt.getTime())
      setHistory(finished)
    } catch (err) {
      console.error('Failed to fetch history', err)
    }
  }

  // Poll every 3 seconds — no localStorage
  useEffect(() => {
    fetchQueue()
    fetchServedCount()
    fetchHistory()
    const interval = setInterval(() => {
      fetchQueue()
      fetchServedCount()
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const toggleStartOrder = async (id: string) => {
    try {
      await api.patch(`/orders/${id}`, { status: 'preparing', startedAt: new Date().toISOString() })
      fetchQueue()
    } catch (err) {
      console.error('Failed to start order', err)
    }
  }

  const toggleFinishOrder = async (id: string) => {
    try {
      await api.patch(`/orders/${id}`, { status: 'Completed' })
      setOrders((prev) => prev.filter((o) => o.id !== id))
      fetchQueue()
      fetchServedCount()
      fetchHistory()
    } catch (err) {
      console.error('Failed to finish order', err)
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

  const formatTime = (date: Date) => {
    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12 || 12
    return `${hours}:${minutes} ${ampm}`
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      "dine-in": "bg-red-600 text-white",
      "take-out": "bg-amber-600 text-white",
    }
    return colors[status] || "bg-gray-600 text-white"
  }

  const getStatusLabel = (status: string) => status === "dine-in" ? "Dine In" : "Take Out"

  const newCount = orders.filter(o => !o.isPreparing).length
  const processCount = orders.filter(o => o.isPreparing).length

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar />

      {/* MAIN CONTENT */}
      <div className="p-6 pl-24">

        {/* Stats Row */}
        <div className="flex gap-6 items-start mb-6">
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

        {/* Notification banner */}
        {notifPermission !== "granted" && (
          <div className="mb-4">
            <button
              onClick={() => Notification.requestPermission().then(p => setNotifPermission(p))}
              className="flex items-center gap-2 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition"
            >
              <Bell className="w-3 h-3" />
              Enable notifications for order alerts
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("queue")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              activeTab === "queue" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <ClipboardList className="w-4 h-4" />
            Order Queue
            {orders.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {orders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              activeTab === "history" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <History className="w-4 h-4" />
            History
            {history.length > 0 && (
              <span className="bg-gray-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">

          {/* ORDER QUEUE TAB */}
          {activeTab === "queue" && (
            <motion.div
              key="queue"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
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
                            <p className="text-xs text-gray-400 mt-0.5">{order.orderNumber}</p>
                            <span className={`${getStatusColor(order.status)} text-xs font-bold px-3 py-1 rounded-full`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </div>

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
            </motion.div>
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <div style={{ width: 8 }} />
                  {[
                    { label: "TIME", width: 80 },
                    { label: "ORDER #", width: 90 },
                    { label: "ITEMS", flex: 1 },
                    { label: "TYPE", width: 80 },
                    { label: "PAYMENT", width: 90 },
                    { label: "TOTAL", width: 90 },
                    { label: "STATUS", width: 90 },
                  ].map((col) => (
                    <span
                      key={col.label}
                      className="text-xs font-semibold text-gray-400 tracking-wider uppercase"
                      style={col.flex ? { flex: col.flex } : { width: col.width, flexShrink: 0 }}
                    >
                      {col.label}
                    </span>
                  ))}
                </div>

                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                    <History className="w-10 h-10 mb-3" />
                    <p className="text-sm font-medium text-gray-400">No history yet</p>
                    <p className="text-xs text-gray-300 mt-1">Completed and cancelled orders will appear here</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {history.map((entry, i) => (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          entry.status === "Completed" ? "bg-green-500" : "bg-red-400"
                        }`} />
                        <span className="text-xs text-gray-400" style={{ width: 80, flexShrink: 0 }}>
                          {formatTime(entry.finishedAt)}
                        </span>
                        <span className="text-xs font-semibold text-gray-700" style={{ width: 90, flexShrink: 0 }}>
                          {entry.orderNumber}
                        </span>
                        <span className="text-xs text-gray-500 truncate" style={{ flex: 1 }}>
                          {entry.items.map(i => `${i.quantity}x ${i.name}`).join(", ") || "—"}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          entry.orderType === "dine-in" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                        }`} style={{ width: 80, flexShrink: 0, textAlign: "center" }}>
                          {entry.orderType === "dine-in" ? "Dine In" : "Take Out"}
                        </span>
                        <span className="text-xs text-gray-500 capitalize" style={{ width: 90, flexShrink: 0 }}>
                          {entry.paymentMethod}
                        </span>
                        <span className="text-sm font-semibold text-gray-800" style={{ width: 90, flexShrink: 0 }}>
                          ₱{entry.total.toLocaleString()}
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          entry.status === "Completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`} style={{ width: 90, flexShrink: 0, textAlign: "center" }}>
                          {entry.status}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}