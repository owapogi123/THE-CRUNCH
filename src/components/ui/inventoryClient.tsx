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
import { motion } from "framer-motion"

type UnitType = "box" | "pack" | "piece" | "bottle"

interface InventoryItem {
  id: number
  name: string
  category: string
  image: string
  incoming: number
  stock: number
  price: string
  unit: UnitType
}

interface InventoryClientProps {
  items: InventoryItem[]
}

// Badge colors per unit type
const unitStyles: Record<UnitType, { bg: string; text: string; label: string }> = {
  box:    { bg: "bg-amber-100",  text: "text-amber-700",  label: "Box"    },
  pack:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "Pack"   },
  piece:  { bg: "bg-green-100",  text: "text-green-700",  label: "Piece"  },
  bottle: { bg: "bg-purple-100", text: "text-purple-700", label: "Bottle" },
}

function UnitBadge({ unit }: { unit: UnitType }) {
  const style = unitStyles[unit] ?? { bg: "bg-gray-100", text: "text-gray-600", label: unit }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

export function InventoryClient({ items }: InventoryClientProps) {
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")
  const [unitFilter, setUnitFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = categoryFilter === "all" || item.category.toLowerCase() === categoryFilter.toLowerCase()
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && item.stock < 50) ||
        (stockFilter === "normal" && item.stock >= 50)
      const matchesUnit = unitFilter === "all" || item.unit === unitFilter

      return matchesSearch && matchesCategory && matchesStock && matchesUnit
    })
  }, [items, searchQuery, categoryFilter, stockFilter, unitFilter])

  const totalItems = filteredItems.length
  const totalPages = Math.ceil(totalItems / rowsPerPage)
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems)
  const paginatedItems = filteredItems.slice(startIndex, endIndex)

  const handleSearchChange = (value: string) => { setSearchQuery(value); setCurrentPage(1) }
  const handleCategoryChange = (value: string) => { setCategoryFilter(value); setCurrentPage(1) }
  const handleStockFilterChange = (value: string) => { setStockFilter(value); setCurrentPage(1) }
  const handleUnitFilterChange = (value: string) => { setUnitFilter(value); setCurrentPage(1) }
  const handleRowsPerPageChange = (value: string) => { setRowsPerPage(Number(value)); setCurrentPage(1) }

  const toggleItem = (id: number) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    setSelectedItems((prev) =>
      prev.length === paginatedItems.length ? [] : paginatedItems.map((item) => item.id)
    )
  }

  const goToNextPage = () => { if (currentPage < totalPages) setCurrentPage(currentPage + 1) }
  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(currentPage - 1) }

  return (
    <>
      {/* ── FILTERS ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Input
            placeholder="Search for inventory"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-4 pr-10 h-12 bg-white border-2 border-gray-300 rounded-xl"
          />
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Button size="icon" variant="ghost" className="absolute right-2 top-1/2 -translate-y-1/2">
              <Search className="h-5 w-5" />
            </Button>
          </motion.div>
        </div>

        {/* Filter button */}
        <motion.div
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Button variant="outline" className="h-12 px-6 bg-white border-2 border-gray-300 rounded-xl">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </motion.div>

        {/* Category */}
        <Select value={categoryFilter} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-[160px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="sides">Sides</SelectItem>
            <SelectItem value="beverages">Beverages</SelectItem>
            <SelectItem value="main">Main</SelectItem>
            <SelectItem value="ingredients">Ingredients</SelectItem>
            <SelectItem value="sauces">Sauces</SelectItem>
          </SelectContent>
        </Select>

        {/* Stock Alert */}
        <Select value={stockFilter} onValueChange={handleStockFilterChange}>
          <SelectTrigger className="w-[150px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Stock Alert" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>

        {/* Unit Type */}
        <Select value={unitFilter} onValueChange={handleUnitFilterChange}>
          <SelectTrigger className="w-[140px] h-12 bg-white border-2 border-gray-300 rounded-xl">
            <SelectValue placeholder="Unit Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Units</SelectItem>
            <SelectItem value="box">Box</SelectItem>
            <SelectItem value="pack">Pack</SelectItem>
            <SelectItem value="piece">Piece</SelectItem>
            <SelectItem value="bottle">Bottle</SelectItem>
          </SelectContent>
        </Select>

        {/* Add Product */}
        <motion.div
          className="ml-auto"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Button className="h-12 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors">
            <motion.div
              className="flex items-center"
              whileHover={{ x: 2 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Product
            </motion.div>
          </Button>
        </motion.div>
      </div>

      {/* ── TABLE ── */}
      <Card className="bg-white rounded-2xl overflow-hidden shadow-md border-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-white hover:bg-white border-b-2 border-gray-200">
              <TableHead className="text-gray-700 font-semibold w-[50px]">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Checkbox
                    checked={selectedItems.length === paginatedItems.length && paginatedItems.length > 0}
                    onCheckedChange={toggleAll}
                    className="border-gray-300"
                  />
                </motion.div>
              </TableHead>
              <TableHead className="text-gray-700 font-semibold">ITEM</TableHead>
              <TableHead className="text-gray-700 font-semibold">CATEGORY</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">UNIT</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">INCOMING</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">STOCK</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">UNIT PRICE</TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">ACTION</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No items found
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => (
                <TableRow key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <TableCell>
                    <motion.div
                      whileHover={{ scale: 1.15, rotate: 5 }}
                      whileTap={{ scale: 0.9, rotate: -5 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                      <Checkbox
                        checked={selectedItems.includes(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                      />
                    </motion.div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100"
                        whileHover={{ scale: 1.1, rotate: 3 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      >
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { e.currentTarget.src = "/img/placeholder.jpg" }}
                        />
                      </motion.div>
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </TableCell>

                  <TableCell>{item.category}</TableCell>

                  {/* ── UNIT BADGE ── */}
                  <TableCell className="text-center">
                    <UnitBadge unit={item.unit} />
                  </TableCell>

                  <TableCell className="text-center">{item.incoming}</TableCell>
                  <TableCell className="text-center">{item.stock}</TableCell>
                  <TableCell className="text-center font-medium">{item.price}</TableCell>

                  <TableCell className="text-center">
                    <motion.div
                      className="inline-block"
                      whileHover={{ scale: 1.2, rotate: 90 }}
                      whileTap={{ scale: 0.9, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    >
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </motion.div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* ── PAGINATION ── */}
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
            <motion.div
              whileHover={{ scale: currentPage > 1 ? 1.05 : 1, x: currentPage > 1 ? -2 : 0 }}
              whileTap={{ scale: currentPage > 1 ? 0.95 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button
                variant="outline"
                className="h-10 px-4 rounded-lg border-2 border-gray-300"
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: currentPage < totalPages ? 1.05 : 1, x: currentPage < totalPages ? 2 : 0 }}
              whileTap={{ scale: currentPage < totalPages ? 0.95 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Button
                className="h-10 px-4 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                onClick={goToNextPage}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </motion.div>
          </div>
        </div>
      </Card>
    </>
  )
}