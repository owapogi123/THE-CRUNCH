import { InventoryClient } from "@/components/ui/inventoryClient"

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
    <div className="flex min-h-screen bg-[#292929]">
      <main className="flex-1 p-4">
        <div className="mb-3 text-xs text-[#999] uppercase tracking-wider">ADMINISTRATOR VIEW</div>

        <div className="bg-[#F5EFE0] rounded-3xl p-6 min-h-[calc(100vh-5rem)]">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-[#4A1C1C]">INVENTORY</h1>
          </div>

          {/* Client-side interactive component */}
          <InventoryClient items={inventoryItems} />
        </div>
      </main>
    </div>
  )
}
