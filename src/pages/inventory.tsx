import { InventoryClient } from "@/components/ui/inventoryClient"
import { Sidebar } from "@/components/Sidebar"

const inventoryItems = [
  {
    id: 1,
    name: "French Fries",
    category: "Sides",
    image: "/french-fries.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 2,
    name: "French Fries",
    category: "Sides",
    image: "/french-fries.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 3,
    name: "French Fries",
    category: "Sides",
    image: "/french-fries.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 4,
    name: "Lemon Juice",
    category: "Beverages",
    image: "/lemon-juice.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 5,
    name: "Lemon Juice",
    category: "Beverages",
    image: "/lemon-juice.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 6,
    name: "Chicken Wings",
    category: "Main",
    image: "/chicken-wings.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 7,
    name: "Chicken Wings",
    category: "Main",
    image: "/chicken-wings.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
  {
    id: 8,
    name: "Chicken Wings",
    category: "Main",
    image: "/chicken-wings.jpg",
    incoming: 25,
    stock: 200,
    price: "5,000₱",
  },
]

export default function InventoryPage() {
  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />
      
      <main className="flex-1 p-8 pl-24">
        <div className="bg-white rounded-3xl p-8 min-h-[calc(100vh-5rem)] shadow-lg">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Inventory</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your products and stock levels</p>
          </div>

          {/* Inventory Client */}
          <InventoryClient items={inventoryItems} />
        </div>
      </main>
    </div>
  )
}