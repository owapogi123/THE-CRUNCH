import { Search, TrendingUp, Calendar } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sidebar } from "@/components/Sidebar"
import { OrdersTable } from "@/components/orders-table"
import { SalesChart } from "@/components/sales-chart"
import { useState, useEffect } from "react"
import { api } from "@/lib/api"

interface Order {
  id: number
  orderNumber: string
  items: { name: string; price: number; quantity: number }[]
  total: number
  date: string
  time: string
  orderType: string
  status: string
  paymentCategory: string
}

interface Payment {
  id: number
  category: string
  date: string
  time: string
}

interface RawOrderRow {
  id: number
  total: number | string
  date?: string
  status?: string
  paymentMethod?: string
  payment_method?: string
  orderType?: string
  order_type?: string
  productId?: number
  productName?: string
  price?: number
  quantity?: number
}

interface PeriodOption {
  label: string
  value: string
}

function generatePeriodOptions(): PeriodOption[] {
  const currentYear = new Date().getFullYear()
  const options: PeriodOption[] = [
    { label: "This Month",     value: "month_current" },
    { label: "Last 3 Months",  value: "months_3"      },
    { label: "Last 6 Months",  value: "months_6"      },
    { label: "Last 9 Months",  value: "months_9"      },
    { label: `Year ${currentYear}`, value: `year_${currentYear}` },
  ]
  for (let y = currentYear - 1; y >= currentYear - 5; y--) {
    options.push({ label: `Year ${y}`, value: `year_${y}` })
  }
  return options
}

function filterOrdersByPeriod(orders: Order[], period: string): Order[] {
  const now = new Date()

  return orders.filter((o) => {
    if (!o.date) return false
    const orderDate = new Date(o.date)

    if (period === "month_current") {
      return (
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getFullYear() === now.getFullYear()
      )
    }
    if (period.startsWith("months_")) {
      const months = parseInt(period.split("_")[1], 10)
      const cutoff = new Date(now)
      cutoff.setMonth(cutoff.getMonth() - months)
      return orderDate >= cutoff
    }
    if (period.startsWith("year_")) {
      const year = parseInt(period.split("_")[1], 10)
      return orderDate.getFullYear() === year
    }
    return true
  })
}

export default function AdminDashboard() {
  const [orders, setOrders]           = useState<Order[]>([])
  const [paymentData, setPaymentData] = useState<Payment[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<string>("month_current")

  const periodOptions   = generatePeriodOptions()
  const filteredOrders  = filterOrdersByPeriod(orders, selectedPeriod)

  const totalOrders  = filteredOrders.length
  const totalSales   = filteredOrders.reduce((sum, o) => sum + o.total, 0)
  const activeOrders = filteredOrders.filter(
    (o) => !["Completed", "Cancelled"].includes(o.status)
  ).length

  useEffect(() => {
    const fetchFromDB = async () => {
      try {
        const rows = await api.get<RawOrderRow[]>('/orders')
        if (!rows || !rows.length) {
          setOrders([])
          return
        }

        const grouped: Record<number, Order> = {}

        rows.forEach((r) => {
          if (!grouped[r.id]) {
            grouped[r.id] = {
              id:             r.id,
              orderNumber:    `#${r.id}`,
              items:          [],
              total:          Number(r.total) || 0,
              date:           r.date ? new Date(r.date).toLocaleDateString() : '',
              time:           r.date ? new Date(r.date).toLocaleTimeString() : '',
              orderType:      r.orderType      ?? r.order_type      ?? '',
              status:         r.status         ?? '',
              paymentCategory: r.paymentMethod ?? r.payment_method  ?? '',
            }
          }
          if (r.productId) {
            grouped[r.id].items.push({
              name:     r.productName ?? '',
              price:    r.price       ?? 0,
              quantity: r.quantity    ?? 1,
            })
          }
        })

        setOrders(Object.values(grouped))
      } catch (err) {
        console.error('Failed to fetch orders:', err)
      }
    }

    fetchFromDB()
    const interval = setInterval(fetchFromDB, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">
        <div className="bg-[#FDFAF6] rounded-3xl p-8 min-h-[calc(100vh-5rem)]">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-8">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img
                src="src/assets/img/logo.jpg"
                alt="The Crunch Logo"
                className="w-12 h-12 rounded-full"
              />
              <span className="text-2xl font-semibold text-[#4A1C1C]">The Crunch</span>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-2xl mx-8">
              <div className="relative">
                <Input
                  type="search"
                  placeholder="Search..."
                  className="w-full bg-white border-2 border-gray-200 text-gray-800 placeholder:text-gray-400 rounded-full pl-6 pr-12 h-12 shadow-sm focus:shadow-md transition-shadow"
                />
                <Button
                  size="icon"
                  className="absolute right-1 top-1 bg-gray-100 hover:bg-gray-200 rounded-full h-10 w-10 transition-all duration-300 hover:scale-105"
                >
                  <Search className="h-5 w-5 text-gray-700" />
                </Button>
              </div>
            </div>

            {/* Period Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#4A1C1C]" />
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-44 border-2 border-[#4A1C1C]/20 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow text-[#4A1C1C] font-medium">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
              <div className="text-sm text-gray-500 mb-2">Total Orders</div>
              <div className="text-4xl font-bold text-gray-800 mb-2">
                {totalOrders.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>Live</span>
              </div>
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
              <div className="text-sm text-gray-500 mb-2">Total Sales</div>
              <div className="text-4xl font-bold text-gray-800 mb-2">
                ₱{totalSales.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>Live</span>
              </div>
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
              <div className="text-sm text-gray-500 mb-2">Active Orders</div>
              <div className="text-4xl font-bold text-gray-800 mb-2">
                {activeOrders.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>Live</span>
              </div>
            </Card>
          </div>

          {/* ── Chart + Payments ── */}
          <div className={`grid grid-cols-1 gap-6 mb-8 ${paymentData.length > 0 ? 'lg:grid-cols-12' : ''}`}>
            <div className={paymentData.length > 0 ? 'lg:col-span-8' : ''}>
              <Card className="bg-white rounded-2xl p-6 h-full shadow-md hover:shadow-lg transition-shadow border-0">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-800">Order & Sales Review</h2>
                  <div className="flex gap-2">
                    <Select defaultValue="sales">
                      <SelectTrigger className="w-32 border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="orders">Orders</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select defaultValue="7days">
                      <SelectTrigger className="w-40 border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7days">Last 7 Days</SelectItem>
                        <SelectItem value="30days">Last 30 Days</SelectItem>
                        <SelectItem value="90days">Last 90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <SalesChart />
              </Card>
            </div>

            {paymentData.length > 0 ? (
              <div className="lg:col-span-4">
                <Card className="bg-white rounded-2xl p-6 h-full shadow-md hover:shadow-lg transition-shadow border-0">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Payments</h3>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm font-medium text-gray-600 mb-4">
                    <div>Payment Category</div>
                    <div>Date</div>
                    <div>Time</div>
                  </div>
                  <div className="space-y-3">
                    {paymentData.map((payment) => (
                      <div
                        key={payment.id}
                        className="grid grid-cols-3 gap-4 text-center text-sm text-gray-700 py-2 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="font-medium">{payment.category}</div>
                        <div>{payment.date}</div>
                        <div>{payment.time}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ) : (
              <div className="lg:col-span-4">
                <Card className="bg-white rounded-2xl p-6 h-full shadow-md border-0 flex items-center justify-center">
                  <p className="text-gray-400 text-sm text-center">
                    No payments yet.<br />Orders will appear here after cashier processes them.
                  </p>
                </Card>
              </div>
            )}
          </div>

          <OrdersTable orders={filteredOrders} />
        </div>
      </main>
    </div>
  )
}