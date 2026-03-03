import { useState, useEffect } from "react"
import { InventoryClient } from "@/components/ui/inventoryClient"
import type { Batch, InventoryItem, UnitType } from "@/components/ui/inventoryClient"
import { Sidebar } from "@/components/Sidebar"
import { apiCall } from "@/lib/api"

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
        {
          id: "batch-1",
          productId: 1,
          quantity: 30,
          unit: "kg",
          receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          status: "active"
        },
        {
          id: "batch-2",
          productId: 1,
          quantity: 25,
          unit: "kg",
          receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          status: "active"
        }
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
        {
          id: "batch-3",
          productId: 2,
          quantity: 50,
          unit: "kg",
          receivedAt: new Date(),
          status: "active"
        }
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
        {
          id: "batch-4",
          productId: 3,
          quantity: 12,
          unit: "bottle",
          receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          status: "active"
        },
        {
          id: "batch-5",
          productId: 3,
          quantity: 15,
          unit: "bottle",
          receivedAt: new Date(),
          status: "active"
        }
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
        {
          id: "batch-6",
          productId: 4,
          quantity: 8,
          unit: "bottle",
          receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          status: "active"
        }
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
        {
          id: "batch-7",
          productId: 5,
          quantity: 60,
          unit: "piece",
          receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          status: "active"
        }
      ],
      totalUsedToday: 0
    }
  ])

  // helper to load inventory; calls `/api/inventory` so that batch data
  // comes along with the product info. This also allows us to refresh the
  // list after adding a product.
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
      // Keep sample data as fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  // Handle batch added
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
            ? {
                ...i,
                batches: [...(i.batches || []), batch],
                stock: i.stock + batch.quantity // increment stock visually
              }
            : i
        )
      )
      console.log(`Batch added to ${item.name}:`, batch)
    } catch (error) {
      console.error('Failed to add batch:', error)
      alert('Failed to add batch to database')
    }
  }

  // Handle batch returned (end of day)
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
                stock: i.stock + returnedQty, // put back into stock
                batches: i.batches?.map(b =>
                  b.id === batchId
                    ? {
                        ...b,
                        quantity: Math.max(0, b.quantity - returnedQty),
                        status: b.quantity - returnedQty <= 0 ? "returned" : "partial"
                      }
                    : b
                ) || []
              }
            : i
        )
      )
      console.log(`Batch ${batchId} from ${item.name}: ${returnedQty} ${item.unit} returned to inventory`)
    } catch (error) {
      console.error('Failed to return batch:', error)
      alert('Failed to return batch')
    }
  }

  // Add new product
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
        }
      })

      // refresh full list so new product appears (and will be available for
      // batching because backend also inserts it into Menu)
      await loadInventory()

      alert('Product added successfully!')
    } catch (error) {
      console.error('Failed to add product:', error)
      const msg = (error as any)?.message || (error as any)?.data?.message || 'Unknown error'
      alert(`Failed to add product: ${msg}`)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">
        <div className="bg-white rounded-3xl p-8 min-h-[calc(100vh-5rem)] shadow-lg">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
              <p className="text-gray-600 mt-2">
                Manage inventory batches with FIFO (First In First Out) tracking.
                Monitor incoming batches and return excess at end of day.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
              </div>
            ) : (
              <>
                <InventoryClient
                  items={inventoryItems}
                  onBatchAdded={handleBatchAdded}
                  onBatchReturned={handleBatchReturned}
                  onAddProduct={handleAddProduct}
                />

                {/* Information Panel */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
                    <h3 className="font-semibold text-blue-900 mb-2">📦 How Batches Work</h3>
                    <p className="text-sm text-blue-800">
                      Each batch is tracked with a timestamp. When consuming products, the oldest batch is used first (FIFO).
                    </p>
                  </div>

                  <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
                    <h3 className="font-semibold text-green-900 mb-2">✅ Add Batch</h3>
                    <p className="text-sm text-green-800">
                      Click "Add Batch" to input new product quantities. Optional expiry dates can be set for tracking.
                    </p>
                  </div>

                  <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-lg">
                    <h3 className="font-semibold text-orange-900 mb-2">🔄 End of Day</h3>
                    <p className="text-sm text-orange-800">
                      At end of day, return unused batches. Returned quantity is sent back to main inventory.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}