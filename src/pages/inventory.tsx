import { InventoryClient } from "@/components/ui/inventoryClient"
import { Sidebar } from "@/components/Sidebar"

// ── Menu Items
import friesImg         from "@/assets/img/fries.jpg"
import chickenImg       from "@/assets/img/chicken.jpg"
import chickenGarlicImg from "@/assets/img/chickengarlic.jpg"
import chipsImg         from "@/assets/img/chips.jpg"
import honeyGlazedImg   from "@/assets/img/honeyglazed.jpg"
import regChickenImg    from "@/assets/img/regchicken.jpg"
import featuredImg      from "@/assets/img/featuredpics.jpg"

// ── Ingredients
import breadingImg  from "@/assets/img/breadingmix.jpg"
import parmesanImg  from "@/assets/img/parmesan.jpg"
import sesameImg    from "@/assets/img/sesameseeds.jpg"

// ── Sauces
import honeyGarlicImg from "@/assets/img/honeygarlic.jpg"
import koreanBBQImg   from "@/assets/img/koreanbbqsauce.jpg"
import teriyakiImg    from "@/assets/img/teriyaki.jpg"
import texasBBQImg    from "@/assets/img/texasbbq.jpg"
import vinegarImg     from "@/assets/img/vinegar.jpg"

// ── Beverages
import lemonJuiceImg  from "@/assets/img/lemonjuice.jpg"
import cokeMismoImg   from "@/assets/img/cokemismo.jpg"
import cocaColaImg    from "@/assets/img/cocacola.jpg"

const inventoryItems = [
  // ── MENU ITEMS ──────────────────────────────────────────────
  { id: 1,  name: "French Fries",         category: "Sides",       image: friesImg,         incoming: 25, stock: 200, price: "5,000₱", unit: "pack"   },
  { id: 2,  name: "Chips",                category: "Sides",       image: chipsImg,         incoming: 40, stock: 180, price: "3,000₱", unit: "pack"   },
  { id: 3,  name: "Chicken Wings",        category: "Main",        image: chickenImg,       incoming: 25, stock: 200, price: "5,000₱", unit: "piece"  },
  { id: 4,  name: "Chicken Garlic",       category: "Main",        image: chickenGarlicImg, incoming: 30, stock: 150, price: "6,000₱", unit: "piece"  },
  { id: 5,  name: "Honey Glazed Chicken", category: "Main",        image: honeyGlazedImg,   incoming: 20, stock: 90,  price: "7,500₱", unit: "piece"  },
  { id: 6,  name: "Regular Chicken",      category: "Main",        image: regChickenImg,    incoming: 35, stock: 120, price: "4,500₱", unit: "piece"  },
  { id: 7,  name: "Featured Combo",       category: "Main",        image: featuredImg,      incoming: 15, stock: 60,  price: "9,999₱", unit: "pack"   },

  // ── INGREDIENTS ─────────────────────────────────────────────
  { id: 8,  name: "Breading Mix",         category: "Ingredients", image: breadingImg,      incoming: 22, stock: 14,  price: "800₱",   unit: "box"    },
  { id: 9,  name: "Marinating Mix",       category: "Ingredients", image: breadingImg,      incoming: 2,  stock: 2,   price: "350₱",   unit: "pack"   },
  { id: 10, name: "Crunch Powder",        category: "Ingredients", image: breadingImg,      incoming: 2,  stock: 2,   price: "450₱",   unit: "pack"   },
  { id: 11, name: "Spicy Mix",            category: "Ingredients", image: breadingImg,      incoming: 1,  stock: 1,   price: "300₱",   unit: "pack"   },
  { id: 12, name: "Minced Garlic",        category: "Ingredients", image: chickenGarlicImg, incoming: 1,  stock: 1,   price: "250₱",   unit: "box"    },
  { id: 13, name: "Grated Parmesan",      category: "Ingredients", image: parmesanImg,      incoming: 4,  stock: 1,   price: "600₱",   unit: "box"    },
  { id: 14, name: "Sesame Seeds",         category: "Ingredients", image: sesameImg,        incoming: 1,  stock: 1,   price: "200₱",   unit: "pack"   },

  // ── SAUCES ───────────────────────────────────────────────────
  { id: 15, name: "Spicy K Sauce",        category: "Sauces",      image: koreanBBQImg,     incoming: 8,  stock: 6,   price: "550₱",   unit: "bottle" },
  { id: 16, name: "K Style Sauce",        category: "Sauces",      image: koreanBBQImg,     incoming: 7,  stock: 7,   price: "550₱",   unit: "bottle" },
  { id: 17, name: "Teriyaki Sauce",       category: "Sauces",      image: teriyakiImg,      incoming: 8,  stock: 7,   price: "600₱",   unit: "bottle" },
  { id: 18, name: "Honey Garlic Sauce",   category: "Sauces",      image: honeyGarlicImg,   incoming: 18, stock: 15,  price: "650₱",   unit: "bottle" },
  { id: 19, name: "Texas BBQ Sauce",      category: "Sauces",      image: texasBBQImg,      incoming: 7,  stock: 7,   price: "580₱",   unit: "bottle" },
  { id: 20, name: "Vinegar",              category: "Sauces",      image: vinegarImg,       incoming: 10, stock: 10,  price: "150₱",   unit: "bottle" },

  // ── BEVERAGES ────────────────────────────────────────────────
  { id: 21, name: "Lemon Juice",          category: "Beverages",   image: lemonJuiceImg,    incoming: 25, stock: 200, price: "5,000₱", unit: "piece"  },
  { id: 22, name: "Coke Mismo",           category: "Beverages",   image: cokeMismoImg,     incoming: 31, stock: 17,  price: "25₱",    unit: "piece"  },
  { id: 23, name: "Coke 1.5L",            category: "Beverages",   image: cocaColaImg,      incoming: 21, stock: 26,  price: "75₱",    unit: "bottle" },
  { id: 24, name: "Bottled Water",        category: "Beverages",   image: lemonJuiceImg,    incoming: 7,  stock: 20,  price: "20₱",    unit: "piece"  },

  // ── EXTRA ROWS FOR PAGINATION TESTING ────────────────────────
  { id: 25, name: "Breading Mix",         category: "Ingredients", image: breadingImg,      incoming: 20, stock: 18,  price: "800₱",   unit: "box"    },
  { id: 26, name: "Spicy K Sauce",        category: "Sauces",      image: koreanBBQImg,     incoming: 6,  stock: 5,   price: "550₱",   unit: "bottle" },
  { id: 27, name: "Coke Mismo",           category: "Beverages",   image: cokeMismoImg,     incoming: 26, stock: 14,  price: "25₱",    unit: "piece"  },
  { id: 28, name: "Honey Garlic Sauce",   category: "Sauces",      image: honeyGarlicImg,   incoming: 17, stock: 13,  price: "650₱",   unit: "bottle" },
  { id: 29, name: "Minced Garlic",        category: "Ingredients", image: chickenGarlicImg, incoming: 1,  stock: 1,   price: "250₱",   unit: "box"    },
  { id: 30, name: "Crunch Powder",        category: "Ingredients", image: breadingImg,      incoming: 2,  stock: 1,   price: "450₱",   unit: "pack"   },
  { id: 31, name: "Teriyaki Sauce",       category: "Sauces",      image: teriyakiImg,      incoming: 7,  stock: 6,   price: "600₱",   unit: "bottle" },
  { id: 32, name: "Coke 1.5L",            category: "Beverages",   image: cocaColaImg,      incoming: 23, stock: 25,  price: "75₱",    unit: "bottle" },
  { id: 33, name: "Texas BBQ Sauce",      category: "Sauces",      image: texasBBQImg,      incoming: 6,  stock: 6,   price: "580₱",   unit: "bottle" },
  { id: 34, name: "Sesame Seeds",         category: "Ingredients", image: sesameImg,        incoming: 1,  stock: 1,   price: "200₱",   unit: "pack"   },
  { id: 35, name: "Grated Parmesan",      category: "Ingredients", image: parmesanImg,      incoming: 3,  stock: 0,   price: "600₱",   unit: "box"    },
  { id: 36, name: "Vinegar",              category: "Sauces",      image: vinegarImg,       incoming: 9,  stock: 9,   price: "150₱",   unit: "bottle" },
  { id: 37, name: "Bottled Water",        category: "Beverages",   image: lemonJuiceImg,    incoming: 9,  stock: 16,  price: "20₱",    unit: "piece"  },
  { id: 38, name: "K Style Sauce",        category: "Sauces",      image: koreanBBQImg,     incoming: 5,  stock: 5,   price: "550₱",   unit: "bottle" },
  { id: 39, name: "Marinating Mix",       category: "Ingredients", image: breadingImg,      incoming: 1,  stock: 2,   price: "350₱",   unit: "pack"   },
  { id: 40, name: "Spicy Mix",            category: "Ingredients", image: breadingImg,      incoming: 1,  stock: 1,   price: "300₱",   unit: "pack"   },
  { id: 41, name: "Coke Mismo",           category: "Beverages",   image: cokeMismoImg,     incoming: 42, stock: 17,  price: "25₱",    unit: "piece"  },
  { id: 42, name: "Breading Mix",         category: "Ingredients", image: breadingImg,      incoming: 18, stock: 12,  price: "800₱",   unit: "box"    },
  { id: 43, name: "Honey Garlic Sauce",   category: "Sauces",      image: honeyGarlicImg,   incoming: 16, stock: 11,  price: "650₱",   unit: "bottle" },
]

export default function InventoryPage() {
  return (
    <div className="flex min-h-screen bg-gray-50 font-['Poppins',sans-serif]">
      <Sidebar />
      <main className="flex-1 p-8 pl-24">
        <div className="bg-white rounded-3xl p-8 min-h-[calc(100vh-5rem)] shadow-lg">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Inventory</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your products and stock levels</p>
          </div>
          <InventoryClient items={inventoryItems} />
        </div>
      </main>
    </div>
  )
}