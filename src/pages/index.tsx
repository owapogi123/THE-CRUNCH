import { Search, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sidebar } from "@/components/Sidebar"
import { OrdersTable } from "@/components/orders-table"
import { SalesChart } from "@/components/sales-chart"

export default function AdminDashboard() {
  return (
    <div className="flex min-h-screen bg-[#292929]">
      <Sidebar />

      <main className="flex-1 p-4">
        <div className="mb-3 text-xs text-[#999] uppercase tracking-wider">Administrator View</div>

        <div className="bg-[#F5EFE0] rounded-3xl p-6 min-h-[calc(100vh-5rem)]">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <img src="src/assets/img/logo.jpg" alt="The Crunch Logo" className="w-12 h-12 rounded-full" />
              <span className="text-2xl font-semibold text-[#4A1C1C]">The Crunch</span>
            </div>

            <div className="flex-1 max-w-xl mx-8">
              <div className="relative">
                <Input
                  type="search"
                  placeholder="Search..."
                  className="w-full bg-[#8B3A3A] border-[#8B3A3A] text-white placeholder:text-white/70 rounded-full pl-6 pr-12 h-12"
                />
                <Button
                  size="icon"
                  className="absolute right-1 top-1 bg-white hover:bg-gray-100 rounded-full h-10 w-10"
                >
                  <Search className="h-5 w-5 text-[#8B3A3A]" />
                </Button>
              </div>
            </div>

            <div className="w-16 h-16 bg-[#8B3A3A] rounded-full flex items-center justify-center">
              <img src="src/assets/img/user1.jpg" alt="Profile" className="w-14 h-14 rounded-full object-cover" />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card className="bg-white border-2 border-[#D4C4A8] rounded-3xl p-6">
              <div className="text-sm text-gray-600 mb-2">Total Order</div>
              <div className="text-4xl font-bold text-[#4A1C1C] mb-2">20,000</div>
              <div className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>9.10%</span>
              </div>
            </Card>

            <Card className="bg-white border-2 border-[#D4C4A8] rounded-3xl p-6">
              <div className="text-sm text-gray-600 mb-2">Total Sales</div>
              <div className="text-4xl font-bold text-[#4A1C1C] mb-2">₱100,000</div>
              <div className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>11.25%</span>
              </div>
            </Card>

            <Card className="bg-white border-2 border-[#D4C4A8] rounded-3xl p-6">
              <div className="text-sm text-gray-600 mb-2">Active Order</div>
              <div className="text-4xl font-bold text-[#4A1C1C] mb-2">100,000</div>
              <div className="flex items-center gap-1 text-sm text-green-600">
                <TrendingUp className="h-4 w-4" />
                <span>10.2%</span>
              </div>
            </Card>
          </div>

          {/* Chart and Right Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <Card className="lg:col-span-2 bg-white border-2 border-[#D4C4A8] rounded-3xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[#4A1C1C]">Order & Sales Review</h2>
                <div className="flex gap-2">
                  <Select defaultValue="sales">
                    <SelectTrigger className="w-32 border-[#8B3A3A] rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="orders">Orders</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="7days">
                    <SelectTrigger className="w-40 border-[#8B3A3A] rounded-xl">
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

            <Card className="bg-white border-2 border-[#D4C4A8] rounded-3xl p-6">
              <div className="grid grid-cols-3 gap-4 text-center text-sm font-medium text-gray-700">
                <div>Payment Category</div>
                <div>Date</div>
                <div>Time</div>
              </div>
            </Card>
          </div>

          {/* Orders Table */}
          <OrdersTable />

          {/* ORDERS */}
          <Card className="mt-6 bg-white border-2 border-[#D4C4A8] rounded-3xl p-6 h-64"></Card>
        </div>
      </main>
    </div>
  )
}
