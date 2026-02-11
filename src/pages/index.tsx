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
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />

      {/* Add left padding to make space for burger button */}
      <main className="flex-1 p-8 pl-24">
        <div className="bg-[#FDFAF6] rounded-3xl p-8 min-h-[calc(100vh-5rem)]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src="src/assets/img/logo.jpg" alt="The Crunch Logo" className="w-12 h-12 rounded-full" />
              <span className="text-2xl font-semibold text-[#4A1C1C]">The Crunch</span>
            </div>

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

             <div className="w-16 h-16 bg-[#8B3A3A] rounded-full flex items-center justify-center">
              <img src="src/assets/img/user1.jpg" alt="Profile" className="w-14 h-14 rounded-full object-cover" />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
              <div className="text-sm text-gray-500 mb-2">Total Order</div>
              <div className="text-4xl font-bold text-gray-800 mb-2">20,000</div>
              <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>9.10%</span>
              </div>
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
              <div className="text-sm text-gray-500 mb-2">Total Sales</div>
              <div className="text-4xl font-bold text-gray-800 mb-2">₱100,000</div>
              <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>11.25%</span>
              </div>
            </Card>

            <Card className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 border-0">
              <div className="text-sm text-gray-500 mb-2">Active Order</div>
              <div className="text-4xl font-bold text-gray-800 mb-2">100,000</div>
              <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>10.2%</span>
              </div>
            </Card>
          </div>

          {/* Chart and Right Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            {/* Chart Section - Takes 8 columns */}
            <div className="lg:col-span-8">
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

            {/* Right Panel - Takes 4 columns */}
            <div className="lg:col-span-4">
              <Card className="bg-white rounded-2xl p-6 h-full shadow-md hover:shadow-lg transition-shadow border-0">
                <div className="grid grid-cols-3 gap-4 text-center text-sm font-medium text-gray-600 mb-4">
                  <div>Payment Category</div>
                  <div>Date</div>
                  <div>Time</div>
                </div>
                {/* Add your payment category content here */}
              </Card>
            </div>
          </div>

          {/* Orders Table */}
          <OrdersTable />
        </div>
      </main>
    </div>
  )
}