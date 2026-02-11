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
import { useState, useMemo } from "react"

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
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  // Filter items based on search and filters
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = categoryFilter === "all" || item.category.toLowerCase() === categoryFilter.toLowerCase()
      const matchesStock = stockFilter === "all" || 
        (stockFilter === "low" && item.stock < 50) || 
        (stockFilter === "normal" && item.stock >= 50)
      
      return matchesSearch && matchesCategory && matchesStock
    })
  }, [items, searchQuery, categoryFilter, stockFilter])

  // Pagination calculations
  const totalItems = filteredItems.length
  const totalPages = Math.ceil(totalItems / rowsPerPage)
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems)
  const paginatedItems = filteredItems.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value)
    setCurrentPage(1)
  }

  const handleStockFilterChange = (value: string) => {
    setStockFilter(value)
    setCurrentPage(1)
  }

  const handleRowsPerPageChange = (value: string) => {
    setRowsPerPage(Number(value))
    setCurrentPage(1)
  }

  const toggleItem = (id: number) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    setSelectedItems((prev) =>
      prev.length === paginatedItems.length 
        ? [] 
        : paginatedItems.map((item) => item.id)
    )
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  return (
    <>
      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[250px]">
          <Input
            placeholder="Search for inventory"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
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

        <Select value={categoryFilter} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[180px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="sides">Sides</SelectItem>
            <SelectItem value="beverages">Beverages</SelectItem>
            <SelectItem value="main">Main</SelectItem>
          </SelectContent>
        </Select>

        <Select value={stockFilter} onValueChange={handleStockFilterChange}>
          <SelectTrigger className="w-[180px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Stock Alert" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>

        <Button className="h-12 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl ml-auto transition-all duration-300 hover:scale-105 hover:shadow-lg active:scale-95">
          <Plus className="h-5 w-5 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Table */}
      <Card className="bg-white rounded-2xl overflow-hidden shadow-md border-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-white hover:bg-white border-b-2 border-gray-200">
              <TableHead className="text-gray-700 font-semibold w-[50px]">
                <Checkbox
                  checked={selectedItems.length === paginatedItems.length && paginatedItems.length > 0}
                  onCheckedChange={toggleAll}
                  className="border-gray-300"
                />
              </TableHead>
              <TableHead className="text-gray-700 font-semibold">ITEM</TableHead>
              <TableHead className="text-gray-700 font-semibold">CATEGORY</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">INCOMING</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">STOCK</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">UNIT PRICE</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">ACTION</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No items found
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => (
                <TableRow key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedItems.includes(item.id)}
                      onCheckedChange={() => toggleItem(item.id)}
                    />
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.src = "/img/placeholder.jpg"
                          }}
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
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show</span>
            <Select value={String(rowsPerPage)} onValueChange={handleRowsPerPageChange}>
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

          <span className="text-sm text-gray-600">
            {totalItems === 0 ? (
              "No results"
            ) : (
              <>
                {startIndex + 1}–<span className="font-bold text-black">{endIndex}</span> of{" "}
                <span className="font-bold text-black">{totalItems}</span> Results
              </>
            )}
          </span>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="h-10 px-4 rounded-lg border-2 border-gray-300"
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button 
              className="h-10 px-4 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-all duration-300 hover:scale-105 active:scale-95"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </>
  )
}