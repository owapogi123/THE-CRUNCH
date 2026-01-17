"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Menu } from "lucide-react"

type OrderItem = {
  quantity: number
  name: string
}

type KanbanOrder = {
  id: string
  table: string
  items: OrderItem[]
  status: "NEW" | "READY" | "PROCESS" | "SERVED"
  time: string
}

const initialOrders: KanbanOrder[] = [
  {
    id: "1",
    table: "TABLE 5",
    items: [
      { quantity: 2, name: "Chicken Pops" },
      { quantity: 2, name: "French Fries" },
      { quantity: 1, name: "Lemonade Juice" },
    ],
    status: "NEW",
    time: "Friday, 11/28/25 10:54 AM",
  },
  {
    id: "2",
    table: "TABLE 5",
    items: [
      { quantity: 2, name: "Chicken Pops" },
      { quantity: 2, name: "French Fries" },
      { quantity: 1, name: "Lemonade Juice" },
    ],
    status: "READY",
    time: "Friday, 11/28/25 10:54 AM",
  },
  {
    id: "3",
    table: "TABLE 5",
    items: [
      { quantity: 2, name: "Chicken Pops" },
      { quantity: 2, name: "French Fries" },
      { quantity: 1, name: "Lemonade Juice" },
    ],
    status: "PROCESS",
    time: "Friday, 11/28/25 10:54 AM",
  },
  {
    id: "4",
    table: "TABLE 5",
    items: [
      { quantity: 2, name: "Chicken Pops" },
      { quantity: 2, name: "French Fries" },
      { quantity: 1, name: "Lemonade Juice" },
    ],
    status: "SERVED",
    time: "Friday, 11/28/25 10:54 AM",
  },
]

const statusConfig = {
  NEW: { color: "bg-red-600", label: "NEW", textColor: "text-white" },
  READY: { color: "bg-green-500", label: "READY", textColor: "text-white" },
  PROCESS: { color: "bg-yellow-400", label: "PROCESS", textColor: "text-gray-800" },
  SERVED: { color: "bg-gray-600", label: "SERVED", textColor: "text-white" },
}

export default function KanbanOrderPage() {
  const [orders, setOrders] = useState<KanbanOrder[]>(initialOrders)

  const moveOrder = (orderId: string, newStatus: "NEW" | "READY" | "PROCESS" | "SERVED") => {
    setOrders(orders.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)))
  }

  const getStatusProgression = (currentStatus: string) => {
    const progression: Record<string, "NEW" | "READY" | "PROCESS" | "SERVED"> = {
      NEW: "READY",
      READY: "PROCESS",
      PROCESS: "SERVED",
      SERVED: "NEW",
    }
    return progression[currentStatus]
  }

  const countByStatus = (status: "NEW" | "READY" | "PROCESS" | "SERVED") =>
    orders.filter((order) => order.status === status).length

  const ordersByStatus = (status: "NEW" | "READY" | "PROCESS" | "SERVED") =>
    orders.filter((order) => order.status === status)

  return (
    <div className="min-h-screen bg-red-700 p-8">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between bg-red-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-4">
            <Menu className="h-6 w-6" />
            <div>
              <div className="text-sm font-medium">Friday, 11/28/25 10:54 AM</div>
              <div className="text-sm text-red-100">COOK VIEW</div>
            </div>
          </div>
        </div>

        {/* Status Overview Cards */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {(["NEW", "READY", "PROCESS", "SERVED"] as const).map((status) => {
            const config = statusConfig[status]
            return (
              <div key={status} className={`${config.color} ${config.textColor} rounded-lg p-6 text-center`}>
                <div className="text-sm font-medium mb-2">{config.label}</div>
                <div className="text-3xl font-bold">{countByStatus(status)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(["NEW", "READY", "PROCESS", "SERVED"] as const).map((status) => (
          <div key={status} className="space-y-4">
            {ordersByStatus(status).map((order) => (
              <Card key={order.id} className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                {/* Table Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-700">🍽️</span>
                    </div>
                    <span className="font-semibold text-gray-800">{order.table}</span>
                  </div>
                  <div
                    className={`${statusConfig[status].color} ${statusConfig[status].textColor} px-3 py-1 rounded-full text-xs font-bold`}
                  >
                    {status}
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-2 mb-6 border-t border-b border-gray-200 py-4">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="text-sm text-gray-700">
                      <span className="font-medium">{item.quantity}x</span> {item.name}
                    </div>
                  ))}
                </div>

                {/* Time */}
                <div className="text-xs text-gray-500 mb-4">{order.time}</div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 bg-gray-900 hover:bg-black text-white rounded-lg"
                    onClick={() => {
                      // Reset to NEW or previous status
                      const prevStatus = { READY: "NEW", PROCESS: "READY", SERVED: "PROCESS", NEW: "NEW" }
                      moveOrder(order.id, prevStatus[status as keyof typeof prevStatus] as any)
                    }}
                  >
                    START
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg"
                    onClick={() => moveOrder(order.id, getStatusProgression(status))}
                  >
                    FINISHED
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
