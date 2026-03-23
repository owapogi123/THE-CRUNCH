import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, SlidersHorizontal, Plus, X, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

export type UnitType = "box" | "pack" | "piece" | "bottle" | "kg";

export interface Batch {
  id: string;
  productId: number;
  quantity: number;
  unit: UnitType;
  receivedAt: Date;
  expiresAt?: Date;
  status: "active" | "partial" | "returned";
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  image: string;
  incoming: number;
  stock: number;
  price: string;
  unit: UnitType;
  batches: Batch[];
  totalUsedToday: number;
}

interface InventoryClientProps {
  items: InventoryItem[];
  onAddProduct?: (
    productData: Partial<InventoryItem> & { description?: string },
  ) => void;
  onDeleteProduct?: (productId: number) => void;
}

const unitStyles: Record<
  UnitType,
  { bg: string; text: string; label: string }
> = {
  box: { bg: "bg-amber-100", text: "text-amber-700", label: "Box" },
  pack: { bg: "bg-blue-100", text: "text-blue-700", label: "Pack" },
  piece: { bg: "bg-green-100", text: "text-green-700", label: "Piece" },
  bottle: { bg: "bg-purple-100", text: "text-purple-700", label: "Bottle" },
  kg: { bg: "bg-red-100", text: "text-red-700", label: "kg" },
};

function UnitBadge({ unit }: { unit: UnitType }) {
  const style = unitStyles[unit] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: unit,
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

export function InventoryClient({
  items,
  onAddProduct,
  onDeleteProduct,
}: InventoryClientProps) {
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [expandedBatches, setExpandedBatches] = useState<number[]>([]);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProductData, setNewProductData] = useState({
    name: "",
    category: "Supplies",
    price: "",
    unit: "piece",
    stock: "0",
  });
  const addProductCategories = ["Supplies", "Menu Food"] as const;

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.toLowerCase();
    const normalizedCategory = categoryFilter.toLowerCase();

    return items.filter((item) => {
      const itemName = String(item?.name ?? "").toLowerCase();
      const itemCategory = String(item?.category ?? "").toLowerCase();
      const itemStock = Number(item?.stock ?? 0);

      const matchesSearch = itemName.includes(normalizedSearch);
      const matchesCategory =
        categoryFilter === "all" || itemCategory === normalizedCategory;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && itemStock < 50) ||
        (stockFilter === "normal" && itemStock >= 50);
      const matchesUnit = unitFilter === "all" || item?.unit === unitFilter;

      return matchesSearch && matchesCategory && matchesStock && matchesUnit;
    });
  }, [items, searchQuery, categoryFilter, stockFilter, unitFilter]);

  const totalItems = filteredItems.length;
  const totalPages = Math.ceil(totalItems / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };
  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setCurrentPage(1);
  };
  const handleStockFilterChange = (value: string) => {
    setStockFilter(value);
    setCurrentPage(1);
  };
  const handleUnitFilterChange = (value: string) => {
    setUnitFilter(value);
    setCurrentPage(1);
  };
  const handleRowsPerPageChange = (value: string) => {
    setRowsPerPage(Number(value));
    setCurrentPage(1);
  };

  const toggleItem = (id: number) =>
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  const toggleAll = () =>
    setSelectedItems((prev) =>
      prev.length === paginatedItems.length
        ? []
        : paginatedItems.map((i) => i.id),
    );
  const toggleBatchExpanded = (itemId: number) =>
    setExpandedBatches((prev) =>
      prev.includes(itemId)
        ? prev.filter((i) => i !== itemId)
        : [...prev, itemId],
    );

  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const goToPreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const calculateTotalBatchQuantity = (item: InventoryItem) =>
    item.batches?.reduce(
      (sum, b) => (b.status === "active" ? sum + b.quantity : sum),
      0,
    ) || 0;

  const getBatchColor = (batch: Batch) => {
    const days = Math.floor(
      (Date.now() - batch.receivedAt.getTime()) / 86400000,
    );
    if (days === 0) return "bg-green-50 border-green-200";
    if (days === 1) return "bg-yellow-50 border-yellow-200";
    return "bg-orange-50 border-orange-200";
  };

  const handleAddProductClick = () => {
    if (!newProductData.name || !newProductData.price)
      return alert("Please enter product name and price");
    onAddProduct?.({
      name: newProductData.name,
      category: newProductData.category,
      price: newProductData.price,
      unit: newProductData.unit as UnitType,
      stock: parseInt(newProductData.stock) || 0,
    });
    setNewProductData({
      name: "",
      category: "Supplies",
      price: "",
      unit: "piece",
      stock: "0",
    });
    setShowAddProductModal(false);
  };

  const handleDeleteProduct = (productId: number, productName: string) => {
    if (
      confirm(
        `Are you sure you want to delete "${productName}"? This action cannot be undone.`,
      )
    ) {
      onDeleteProduct?.(productId);
    }
  };

  return (
    <>
      {/* ── FILTERS ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
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
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <Search className="h-5 w-5" />
            </Button>
          </motion.div>
        </div>

        <motion.div
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Button
            variant="outline"
            className="h-12 px-6 bg-white border-2 border-gray-300 rounded-xl"
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </motion.div>

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
            <SelectItem value="kg">kg</SelectItem>
          </SelectContent>
        </Select>

        <motion.div
          className="ml-auto"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Button
            onClick={() => setShowAddProductModal(true)}
            className="h-12 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Product
          </Button>
        </motion.div>
      </div>

      {/* ── TABLE ── */}
      <Card className="bg-white rounded-2xl overflow-hidden shadow-md border-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-white hover:bg-white border-b-2 border-gray-200">
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={
                    selectedItems.length === paginatedItems.length &&
                    paginatedItems.length > 0
                  }
                  onCheckedChange={toggleAll}
                  className="border-gray-300"
                />
              </TableHead>
              <TableHead className="text-gray-700 font-semibold">
                ITEM
              </TableHead>
              <TableHead className="text-gray-700 font-semibold">
                CATEGORY
              </TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">
                UNIT
              </TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">
                BATCHES
              </TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">
                TOTAL BATCH QTY
              </TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">
                STOCK
              </TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">
                UNIT PRICE
              </TableHead>
              <TableHead className="text-gray-700 font-semibold text-center">
                ACTION
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-8 text-gray-500"
                >
                  No items found
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => (
                <React.Fragment key={item.id}>
                  <TableRow className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.includes(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                      />
                    </TableCell>

                    {/* ── ITEM NAME — text only, no image ── */}
                    <TableCell>
                      <span className="font-medium text-gray-800">
                        {item.name}
                      </span>
                    </TableCell>

                    <TableCell>{item.category}</TableCell>

                    <TableCell className="text-center">
                      <UnitBadge unit={item.unit} />
                    </TableCell>

                    <TableCell className="text-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleBatchExpanded(item.id)}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <span className="font-semibold">
                          {item.batches?.length || 0}
                        </span>
                        <span className="text-xs">batches</span>
                      </motion.button>
                    </TableCell>

                    <TableCell className="text-center font-semibold text-blue-600">
                      {calculateTotalBatchQuantity(item)} {item.unit}
                    </TableCell>

                    <TableCell className="text-center">
                      {item.stock > 0 ? (
                        <span className="font-bold text-indigo-600">
                          {item.stock}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center font-medium">
                      {item.price}
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <motion.button
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() =>
                            handleDeleteProduct(item.id, item.name)
                          }
                          className="inline-flex items-center gap-1 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </motion.button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* ── BATCH DETAILS ── */}
                  {expandedBatches.includes(item.id) &&
                    (item.batches?.length || 0) > 0 && (
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableCell colSpan={9}>
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="p-4 space-y-3"
                          >
                            <h4 className="font-semibold text-gray-700">
                              Batch History (FIFO)
                            </h4>
                            <div className="space-y-2">
                              {item.batches
                                ?.sort(
                                  (a, b) =>
                                    a.receivedAt.getTime() -
                                    b.receivedAt.getTime(),
                                )
                                .map((batch, idx) => (
                                  <div
                                    key={batch.id}
                                    className={`p-3 rounded-lg border-2 ${getBatchColor(batch)} flex justify-between items-center`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="font-semibold text-sm bg-white px-2 py-1 rounded">
                                        #{idx + 1}
                                      </span>
                                      <div>
                                        <p className="text-sm font-medium text-gray-700">
                                          {batch.quantity} {batch.unit}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          Received:{" "}
                                          {batch.receivedAt.toLocaleString()}
                                        </p>
                                        {batch.expiresAt && (
                                          <p className="text-xs text-gray-500">
                                            Expires:{" "}
                                            {batch.expiresAt.toLocaleDateString()}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`px-2 py-1 rounded text-xs font-semibold ${batch.status === "active" ? "bg-green-200 text-green-800" : batch.status === "partial" ? "bg-yellow-200 text-yellow-800" : "bg-gray-200 text-gray-800"}`}
                                      >
                                        {batch.status.toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </motion.div>
                        </TableCell>
                      </TableRow>
                    )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>

        {/* ── PAGINATION ── */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show</span>
            <Select
              value={String(rowsPerPage)}
              onValueChange={handleRowsPerPageChange}
            >
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
                {startIndex + 1}–
                <span className="font-bold text-black">{endIndex}</span> of{" "}
                <span className="font-bold text-black">{totalItems}</span>{" "}
                Results
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
              className="h-10 px-4 rounded-lg bg-green-500 hover:bg-green-600 text-white"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* ── ADD PRODUCT MODAL ── */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Add New Product</h2>
              <button
                onClick={() => setShowAddProductModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name
                </label>
                <Input
                  type="text"
                  placeholder="Enter name"
                  value={newProductData.name}
                  onChange={(e) =>
                    setNewProductData({
                      ...newProductData,
                      name: e.target.value,
                    })
                  }
                  className="w-full h-10 border-2 border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <Select
                  value={newProductData.category}
                  onValueChange={(value) =>
                    setNewProductData({ ...newProductData, category: value })
                  }
                >
                  <SelectTrigger className="w-full h-10 bg-white border-2 border-gray-300 rounded-lg">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {addProductCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={newProductData.price}
                  onChange={(e) =>
                    setNewProductData({
                      ...newProductData,
                      price: e.target.value,
                    })
                  }
                  className="w-full h-10 border-2 border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unit
                </label>
                <Select
                  value={newProductData.unit}
                  onValueChange={(val) =>
                    setNewProductData({ ...newProductData, unit: val })
                  }
                >
                  <SelectTrigger className="w-full h-10 bg-white border-2 border-gray-300 rounded-lg">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="piece">Piece</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                    <SelectItem value="bottle">Bottle</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Initial Stock
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newProductData.stock}
                  onChange={(e) =>
                    setNewProductData({
                      ...newProductData,
                      stock: e.target.value,
                    })
                  }
                  className="w-full h-10 border-2 border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1 h-10 border-2 border-gray-300 rounded-lg"
                onClick={() => setShowAddProductModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-10 bg-green-500 hover:bg-green-600 text-white rounded-lg"
                onClick={handleAddProductClick}
              >
                Add Product
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
