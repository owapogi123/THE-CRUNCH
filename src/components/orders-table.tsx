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
    <Card className="bg-white border-2 border-[#D4C4A8] rounded-3xl p-6">
      <Table>
        <TableHeader>
          <TableRow className="border-[#D4C4A8]">
            <TableHead className="text-[#4A1C1C] font-semibold">Order ID ↓</TableHead>
            <TableHead className="text-[#4A1C1C] font-semibold">Date ↓</TableHead>
            <TableHead className="text-[#4A1C1C] font-semibold">Order Type</TableHead>
            <TableHead className="text-[#4A1C1C] font-semibold">Status</TableHead>
            <TableHead className="text-[#4A1C1C] font-semibold">Payment</TableHead>
            <TableHead className="text-[#4A1C1C] font-semibold">Amount ↓</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="border-[#D4C4A8]">
              <TableCell className="font-medium text-[#4A1C1C]">{order.id}</TableCell>
              <TableCell className="text-[#4A1C1C]">{order.date}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={
                    order.type === "Complete"
                      ? "bg-green-100 text-green-700 hover:bg-green-100 rounded-full"
                      : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 rounded-full"
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
                      ? "bg-green-100 text-green-700 hover:bg-green-100 rounded-full"
                      : "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 rounded-full"
                  }
                >
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-blue-600 font-medium">{order.payment}</TableCell>
              <TableCell className="font-medium text-[#4A1C1C]">{order.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
