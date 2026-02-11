"use client"

import { useState, useEffect } from "react"
import { Clock, Menu } from "lucide-react"

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

export default function Order() {
  const [currentTime, setCurrentTime] = useState(new Date())
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

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Format date and time
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
    
    // Remove the order after 500ms animation delay
    setTimeout(() => {
      setOrders(prevOrders => prevOrders.filter(order => order.id !== id))
    }, 500)
  }

  return (
    <div className="min-h-screen bg-white p-6 font-['Poppins',sans-serif]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-sm font-semibold text-gray-700 tracking-wider mb-6">ORDERS</h1>

        {/* Top Status Section */}
        <div className="flex gap-6 items-start mb-8">
          {/* Cook View Card */}
          <div className="bg-white rounded-2xl p-6 flex-1 max-w-sm shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <Menu className="w-5 h-5 text-gray-900" />
              <span className="text-xs font-semibold text-gray-500">COOK VIEW</span>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-gray-600 flex items-center gap-1 mb-2">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(currentTime)}
                </p>
                <p className="text-sm font-bold text-gray-900">Hi, COOK!</p>
              </div>
            </div>
          </div>
 
          {/* Status Boxes */}
          <div className="flex gap-4 flex-1">
            {/* New Orders */}
            <div className="bg-red-700 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-white text-sm font-semibold mb-3">NEW</span>
              <span className="text-white text-3xl font-bold">{stats.new}</span>
            </div>

            {/* Ready Orders */}
            <div className="bg-green-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-white text-sm font-semibold mb-3">READY</span>
              <span className="text-white text-3xl font-bold">{stats.ready}</span>
            </div>

            {/* Processing Orders */}
            <div className="bg-yellow-400 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-gray-900 text-sm font-semibold mb-3">PROCESS</span>
              <span className="text-gray-900 text-3xl font-bold">{stats.process}</span>
            </div>

            {/* Served Orders */}
            <div className="bg-gray-600 rounded-xl p-6 flex flex-col items-center justify-center min-w-24">
              <span className="text-white text-sm font-semibold mb-3">SERVED</span>
              <span className="text-white text-3xl font-bold">{stats.served}</span>
            </div>
          </div>
        </div>

        {/* Orders Grid */}
        <div className="bg-gray-50 rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {orders.map((order) => (
              <div 
                key={order.id} 
                className={`bg-white rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-500 ${
                  order.isFinished ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                }`}
              >
                {/* Order Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">TABLE {order.tableNumber}</span>
                  </div>
                  <span className={`${getStatusColor(order.status)} text-xs font-bold px-3 py-1 rounded-full`}>
                    {getStatusLabel(order.status)}
                  </span>
                </div>

                {/* Order Items */}
                <div className="space-y-2 mb-6 border-b border-gray-200 pb-4">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm text-gray-700">
                      <span className="font-semibold">{item.quantity}x</span>
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => toggleStartOrder(order.id)}
                    disabled={order.isPreparing || order.isFinished}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                      order.isPreparing || order.isFinished
                        ? "bg-white text-gray-400 shadow-md opacity-50 cursor-not-allowed"
                        : "bg-white text-gray-900 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                    }`}
                  >
                    START
                  </button>
                  <button
                    onClick={() => toggleFinishOrder(order.id)}
                    disabled={!order.isPreparing}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                      order.isPreparing
                        ? "bg-green-600 text-white hover:bg-green-700 hover:shadow-lg hover:scale-105 active:scale-95"
                        : "bg-green-600 text-white opacity-50 cursor-not-allowed"
                    }`}
                  >
                    FINISHED
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}