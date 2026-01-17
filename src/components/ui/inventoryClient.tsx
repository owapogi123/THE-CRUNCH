import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, SlidersHorizontal, Plus, MoreVertical } from "lucide-react"
import { useState } from "react"

interface InventoryItem {
  id: number
  name: string
  category: string
  image: string
  incoming: number
  stock: number
  price: string
}

interface InventoryClientProps {
  items: InventoryItem[]
}

export function InventoryClient({ items }: InventoryClientProps) {
  const [selectedItems, setSelectedItems] = useState<number[]>([])

  const toggleItem = (id: number) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    setSelectedItems((prev) =>
      prev.length === items.length ? [] : items.map((item) => item.id)
    )
  }

  return (
    <>
      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Input
            placeholder="Search for inventory"
            className="pl-4 pr-10 h-12 bg-white border-2 border-gray-300 rounded-xl"
          />
          <Button size="icon" variant="ghost" className="absolute right-2 top-1/2 -translate-y-1/2">
            <Search className="h-5 w-5" />
          </Button>
        </div>

        <Button variant="outline" className="h-12 px-6 bg-white border-2 border-gray-300 rounded-xl">
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filter
        </Button>

        <Select defaultValue="all">
          <SelectTrigger className="w-[180px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Category</SelectItem>
            <SelectItem value="sides">Sides</SelectItem>
            <SelectItem value="beverages">Beverages</SelectItem>
            <SelectItem value="main">Main</SelectItem>
          </SelectContent>
        </Select>

        <Select defaultValue="all">
          <SelectTrigger className="w-[180px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Stock Alert" />
          </SelectTrigger>
          <SelectContent>h
            <SelectItem value="all">Stock Alert</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>

        <Button className="h-12 px-6 bg-[#4CAF50] hover:bg-[#45a049] text-white rounded-xl ml-auto">
          <Plus className="h-5 w-5 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-white border-2 border-[#D4C4A8] rounded-3xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#7D2E2E] hover:bg-[#7D2E2E]">
              <TableHead className="text-white w-[50px]">
                <Checkbox
                  checked={selectedItems.length === items.length}
                  onCheckedChange={toggleAll}
                  className="border-white"
                />
              </TableHead>
              <TableHead className="text-white">ITEM</TableHead>
              <TableHead className="text-white">CATEGORY</TableHead>
              <TableHead className="text-white text-center">INCOMING</TableHead>
              <TableHead className="text-white text-center">STOCK</TableHead>
              <TableHead className="text-white text-center">UNIT PRICE</TableHead>
              <TableHead className="text-white text-center">ACTION</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="border-b border-gray-200">
                <TableCell>
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden">
                      <img
                        src={item.image || "/img/example.jpg"}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="font-medium">{item.name}</span>
                  </div>
                </TableCell>

                <TableCell>{item.category}</TableCell>
                <TableCell className="text-center">{item.incoming}</TableCell>
                <TableCell className="text-center">{item.stock}</TableCell>
                <TableCell className="text-center font-medium">{item.price}</TableCell>

                <TableCell className="text-center">
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show</span>
            <Select defaultValue="20">
              <SelectTrigger className="w-[100px] h-10 bg-white border-2 border-gray-300 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 Row</SelectItem>
                <SelectItem value="20">20 Row</SelectItem>
                <SelectItem value="50">50 Row</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span className="text-sm text-gray-600">1–25 of 50 Results</span>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 px-4 rounded-lg border-2 border-gray-300">
              Previous
            </Button>
            <Button className="h-10 px-4 rounded-lg bg-[#4CAF50] hover:bg-[#45a049] text-white">
              Next
            </Button>
          </div>
        </div>
      </Card>
    </>
  )
}
