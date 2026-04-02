import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

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

interface OrdersTableProps {
  orders?: Order[]
}

const PAGE_SIZE = 10

export function OrdersTable({ orders = [] }: OrdersTableProps) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const sorted = [...orders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const statusBadgeClass = (status: string) =>
    status === "Completed"
      ? "bg-green-50 text-green-700 hover:bg-green-50 rounded-lg font-medium border-0"
      : "bg-yellow-50 text-yellow-700 hover:bg-yellow-50 rounded-lg font-medium border-0"

  const orderTypeBadgeClass = (orderType: string) =>
    orderType === 'take-out'
      ? 'bg-amber-50 text-amber-700 hover:bg-amber-50 rounded-lg font-medium border-0'
      : 'bg-rose-50 text-rose-700 hover:bg-rose-50 rounded-lg font-medium border-0'

  return (
    <Card className="bg-white rounded-2xl p-6 shadow-md border-0">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 hover:bg-transparent">
            <TableHead className="text-gray-700 font-semibold">Order ID</TableHead>
            <TableHead className="text-gray-700 font-semibold">Date</TableHead>
            <TableHead className="text-gray-700 font-semibold">Order Type</TableHead>
            <TableHead className="text-gray-700 font-semibold">Status</TableHead>
            <TableHead className="text-gray-700 font-semibold">Payment</TableHead>
            <TableHead className="text-gray-700 font-semibold text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                No orders yet. Orders will appear here once the cashier processes them.
              </TableCell>
            </TableRow>
          ) : (
            paginated.map((order) => (
              <TableRow key={order.id} className="border-gray-100 hover:bg-gray-50 transition-colors">
                <TableCell className="font-medium text-gray-900">{order.orderNumber}</TableCell>
                <TableCell className="text-gray-600">{order.date}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={orderTypeBadgeClass(order.orderType)}>
                    {order.orderType || '-'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusBadgeClass(order.status)}>
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-blue-600 font-medium">{order.paymentCategory}</TableCell>
                <TableCell className="font-semibold text-gray-900 text-right">₱{order.total}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {orders.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, orders.length)} of {orders.length} orders
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...")
                acc.push(p)
                return acc
              }, [])
              .map((p, idx) =>
                p === "..." ? (
                  <span key={`ellipsis-${idx}`} className="text-gray-400 text-sm px-1">...</span>
                ) : (
                  <Button
                    key={p}
                    variant={currentPage === p ? "default" : "outline"}
                    size="icon"
                    className={`h-8 w-8 rounded-lg text-sm ${currentPage === p ? "bg-[#4A1C1C] hover:bg-[#3a1515] text-white border-0" : ""}`}
                    onClick={() => setCurrentPage(p as number)}
                  >
                    {p}
                  </Button>
                )
              )}

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}