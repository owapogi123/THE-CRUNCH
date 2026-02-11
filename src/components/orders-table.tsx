import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const orders = [
  { id: "01550", date: "07-25-25", type: "Complete", status: "Complete", payment: "Paid", amount: "₱88" },
  { id: "32404", date: "07-25-25", type: "Complete", status: "Complete", payment: "Paid", amount: "₱78" },
  { id: "11100", date: "07-25-25", type: "Pending", status: "Pending", payment: "Paid", amount: "₱148" },
  { id: "66666", date: "07-25-25", type: "Complete", status: "Complete", payment: "Paid", amount: "₱188" },
  { id: "11111", date: "07-25-25", type: "Pending", status: "Pending", payment: "Paid", amount: "₱78" },
  { id: "05123", date: "07-25-25", type: "Complete", status: "Complete", payment: "Paid", amount: "₱148" },
]

export function OrdersTable() {
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
          {orders.map((order) => (
            <TableRow 
              key={order.id} 
              className="border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <TableCell className="font-medium text-gray-900">{order.id}</TableCell>
              <TableCell className="text-gray-600">{order.date}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={
                    order.type === "Complete"
                      ? "bg-green-50 text-green-700 hover:bg-green-50 rounded-lg font-medium border-0"
                      : "bg-yellow-50 text-yellow-700 hover:bg-yellow-50 rounded-lg font-medium border-0"
                  }
                >
                  {order.type}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={
                    order.status === "Complete"
                      ? "bg-green-50 text-green-700 hover:bg-green-50 rounded-lg font-medium border-0"
                      : "bg-yellow-50 text-yellow-700 hover:bg-yellow-50 rounded-lg font-medium border-0"
                  }
                >
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-blue-600 font-medium">{order.payment}</TableCell>
              <TableCell className="font-semibold text-gray-900 text-right">{order.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}