import { useState, useEffect } from "react"
import { InventoryClient } from "@/components/ui/inventoryClient"
import type { Batch, InventoryItem, UnitType } from "@/components/ui/inventoryClient"
import { Sidebar } from "@/components/Sidebar"
import { apiCall } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import { Package, RefreshCw, Archive } from "lucide-react"

export default function Inventory() {
  const [loading, setLoading] = useState(true)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([
    {
      id: 1,
      name: "Chicken Breast",
      category: "Main",
      image: "/img/placeholder.jpg",
      incoming: 50,
      stock: 120,
      price: "₱250",
      unit: "kg",
      batches: [
        { id: "batch-1", productId: 1, quantity: 30, unit: "kg", receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), status: "active" },
        { id: "batch-2", productId: 1, quantity: 25, unit: "kg", receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), status: "active" }
      ],
      totalUsedToday: 0
    },
    {
      id: 2,
      name: "Rice",
      category: "Ingredients",
      image: "/img/placeholder.jpg",
      incoming: 100,
      stock: 500,
      price: "₱40",
      unit: "kg",
      batches: [
        { id: "batch-3", productId: 2, quantity: 50, unit: "kg", receivedAt: new Date(), status: "active" }
      ],
      totalUsedToday: 0
    },
    {
      id: 3,
      name: "Coke 2L",
      category: "Beverages",
      image: "/img/placeholder.jpg",
      incoming: 20,
      stock: 45,
      price: "₱85",
      unit: "bottle",
      batches: [
        { id: "batch-4", productId: 3, quantity: 12, unit: "bottle", receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), status: "active" },
        { id: "batch-5", productId: 3, quantity: 15, unit: "bottle", receivedAt: new Date(), status: "active" }
      ],
      totalUsedToday: 0
    },
    {
      id: 4,
      name: "Cooking Oil",
      category: "Ingredients",
      image: "/img/placeholder.jpg",
      incoming: 15,
      stock: 80,
      price: "₱180",
      unit: "bottle",
      batches: [
        { id: "batch-6", productId: 4, quantity: 8, unit: "bottle", receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), status: "active" }
      ],
      totalUsedToday: 0
    },
    {
      id: 5,
      name: "Egg",
      category: "Ingredients",
      image: "/img/placeholder.jpg",
      incoming: 30,
      stock: 120,
      price: "₱8",
      unit: "piece",
      batches: [
        { id: "batch-7", productId: 5, quantity: 60, unit: "piece", receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), status: "active" }
      ],
      totalUsedToday: 0
    }
  ])

  const loadInventory = async () => {
    try {
      setLoading(true)
      const data = await apiCall('/inventory', { method: 'GET' })
      if (data && Array.isArray(data)) {
        const itemsWithDates = data.map((item: any) => ({
          id: item.Product_ID ?? item.id,
          name: item.Product_Name || item.name,
          category: item.Category_Name || item.category || 'Uncategorized',
          image: item.image || '/img/placeholder.jpg',
          incoming: 0,
          stock: item.Stock ?? item.quantity ?? 0,
          price: (item.Price ?? item.price)?.toString() || '0',
          unit: (item.unit as UnitType) || 'piece',
          batches: (item.batches || []).map((b: any) => ({
            ...b,
            receivedAt: new Date(b.receivedAt),
            expiresAt: b.expiresAt ? new Date(b.expiresAt) : undefined
          })),
          totalUsedToday: 0
        }))
        setInventoryItems(itemsWithDates)
      }
    } catch (error) {
      console.error('Failed to load inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  const handleBatchAdded = async (item: InventoryItem, batch: Batch) => {
    try {
      await apiCall('/inventory/batches', {
        method: 'POST',
        body: {
          productId: item.id,
          quantity: batch.quantity,
          unit: batch.unit,
          expiresAt: batch.expiresAt?.toISOString()
        } as any
      })
      setInventoryItems(prev =>
        prev.map(i =>
          i.id === item.id
            ? { ...i, batches: [...(i.batches || []), batch], stock: i.stock + batch.quantity }
            : i
        )
      )
    } catch (error) {
      console.error('Failed to add batch:', error)
      alert('Failed to add batch to database')
    }
  }

  const handleBatchReturned = async (item: InventoryItem, batchId: string, returnedQty: number) => {
    try {
      await apiCall(`/inventory/batches/${batchId}/return`, {
        method: 'POST',
        body: { quantity: returnedQty, returnedAt: new Date().toISOString() } as any
      })
      setInventoryItems(prev =>
        prev.map(i =>
          i.id === item.id
            ? {
                ...i,
                stock: i.stock + returnedQty,
                batches: i.batches?.map(b =>
                  b.id === batchId
                    ? { ...b, quantity: Math.max(0, b.quantity - returnedQty), status: b.quantity - returnedQty <= 0 ? "returned" : "partial" }
                    : b
                ) || []
              }
            : i
        )
      )
    } catch (error) {
      console.error('Failed to return batch:', error)
      alert('Failed to return batch')
    }
  }

  const handleAddProduct = async (productData: any) => {
    try {
      await apiCall('/products', {
        method: 'POST',
        body: {
          name: productData.name,
          category: productData.category,
          price: productData.price,
          unit: productData.unit,
          quantity: productData.stock ?? productData.quantity ?? 0,
          description: productData.description || null,
          image: productData.image || '/img/placeholder.jpg',
        } as any
      })
      await loadInventory()
      alert('Product added successfully!')
    } catch (error) {
      console.error('Failed to add product:', error)
      const msg = (error as any)?.message || (error as any)?.data?.message || 'Unknown error'
      alert(`Failed to add product: ${msg}`)
    }
  }

  const totalStock = inventoryItems.reduce((sum, item) => sum + item.stock, 0)
  const totalBatches = inventoryItems.reduce((sum, item) => sum + (item.batches?.length || 0), 0)
  const totalItems = inventoryItems.length

  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Management</p>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-1">FIFO batch tracking — oldest stock is always used first.</p>
        </motion.div>

        {/* Stat Cards */}
        <motion.div
          className="grid grid-cols-3 gap-5 mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          {[
            { label: "Total Products", value: totalItems, icon: <Package className="w-5 h-5" />, color: "bg-blue-50 text-blue-600 border-blue-100" },
            { label: "Total Stock", value: totalStock, icon: <Archive className="w-5 h-5" />, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
            { label: "Active Batches", value: totalBatches, icon: <RefreshCw className="w-5 h-5" />, color: "bg-orange-50 text-orange-600 border-orange-100" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Main Content */}
        <motion.div
          className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-24 gap-4"
              >
                <motion.div
                  className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-blue-500"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                />
                <p className="text-gray-400 text-sm">Loading inventory...</p>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <InventoryClient
                  items={inventoryItems}
                  onBatchAdded={handleBatchAdded}
                  onBatchReturned={handleBatchReturned}
                  onAddProduct={handleAddProduct}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Info Cards */}
        <motion.div
          className="grid grid-cols-3 gap-5 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          {[
            { title: "How Batches Work", desc: "Each batch is tracked with a timestamp. When consuming products, the oldest batch is used first (FIFO).", border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800", title_color: "text-blue-900" },
            { title: "Add Batch", desc: "Click 'Add Batch' to input new product quantities. Optional expiry dates can be set for tracking.", border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800", title_color: "text-emerald-900" },
            { title: "End of Day", desc: "At end of day, return unused batches. Returned quantity is sent back to main inventory.", border: "border-orange-200", bg: "bg-orange-50", text: "text-orange-800", title_color: "text-orange-900" },
          ].map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.07 }}
              className={`${card.bg} border ${card.border} rounded-2xl p-5`}
            >
              <p className={`text-sm ${card.text} leading-relaxed`}>{card.desc}</p>
            </motion.div>
          ))}
        </motion.div>

      </main>
    </div>
  )
}