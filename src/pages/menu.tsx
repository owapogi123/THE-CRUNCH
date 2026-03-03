import { useState, useEffect } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { Search, X, User, ShoppingBag, Clock, Trash2, Menu, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import chickenImg from '../assets/img/chicken.jpg'
import friesImg from '../assets/img/fries.jpg'
import chipsImg from '../assets/img/chips.jpg'
import honeyglazedImg from '../assets/img/honeyglazed.jpg'
import regchickenImg from '../assets/img/regchicken.jpg'
import chickengarlicImg from '../assets/img/chickengarlic.jpg'

interface MenuItem {
  id: number
  name: string
  price: number
  image: string
  category: string
}

interface CartItem {
  id: number
  name: string
  price: number
  image: string
  quantity: number
}

interface Category {
  name: string
  icon: string
}

// Menu items data with image imports
const menuItems: MenuItem[] = [
  { id: 1, name: "French Fries", price: 99, image: friesImg, category: "FRENCH FRIES" },
  { id: 2, name: "Crispy Chips", price: 89, image: chipsImg, category: "SIDES" },
  { id: 3, name: "Honey Glazed Chicken", price: 69, image: honeyglazedImg, category: "CHICKEN" },
  { id: 4, name: "Regular Chicken", price: 60, image: regchickenImg, category: "CHICKEN" },
  { id: 5, name: "Chicken Pops", price: 99, image: chickenImg, category: "CHICKEN POPS" },
  { id: 6, name: "Garlic Buttered Chicken", price: 99, image: chickengarlicImg, category: "CHICKEN" },
]

const categories: Category[] = [
  { name: "ALL ITEMS", icon: "" },
  { name: "FRENCH FRIES", icon: "" },
  { name: "CHICKEN", icon: "" },
  { name: "DRINKS", icon: "" },
  { name: "CHICKEN POPS", icon: "" },
  { name: "SIDES", icon: "" },
]

const navigationItems = [
  { label: "Dashboard", path: "/home" },
  { label: "Order", path: "/orders" },
  { label: "Inventory", path: "/inventory" },
  { label: "Products", path: "/products" },
  { label: "Reports", path: "/reports" },
  { label: "Sales", path: "/sales" },
  { label: "Menus", path: "/menu" },
]

const additionalItems = [
  { label: "User Accounts", path: "/users" },
  { label: "Menu Management", path: "/menu-management" },
  { label: "Supplier Maintenance", path: "/suppliers" },
]

export default function MenuPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL ITEMS")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [paidAmount, setPaidAmount] = useState(0)
  const [orderNumber, setOrderNumber] = useState("")
  const navigate = useNavigate()

  // Load Poppins font on component mount
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  const addToCart = (item: MenuItem) => {
    const existingItem = cart.find((cartItem) => cartItem.name === item.name)
    if (existingItem) {
      setCart(
        cart.map((cartItem) =>
          cartItem.name === item.name
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        )
      )
    } else {
      setCart([...cart, { ...item, quantity: 1 }])
    }
  }

  const removeFromCart = (itemId: number) => {
    setCart(cart.filter((item) => item.id !== itemId))
  }

  const updateQuantity = (itemId: number, change: number) => {
    setCart(
      cart
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(0, item.quantity + change) }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const handlePayment = () => {
    setPaidAmount(totalPrice)
    // Generate random order number
    setOrderNumber(`#${Math.floor(10000 + Math.random() * 90000)}`)
    setShowSuccessModal(true)
  }

  const handleCloseModal = () => {
    setShowSuccessModal(false)
    setCart([]) // Clear the cart after successful payment
  }

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === "ALL ITEMS" || item.category === selectedCategory
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {/* page content begins below */}
      <div className="flex-1 flex flex-col">
  
        <div className="bg-white shadow-sm px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between ml-16">
            <div>
              <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Menu / Manage Cashier</p>
              <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Poppins, sans-serif' }}>Cashier View</h1>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
       
          <div className="flex-1 p-8 overflow-y-auto">
           
            <div className="relative mb-8">
              <input
                type="text"
                placeholder="Search Menu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-md px-5 py-3 pl-12 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 shadow-sm hover:shadow-md text-sm"
                style={{ fontFamily: 'Poppins, sans-serif' }}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

   
            <div className="mb-8">
              <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>Categories</h2>
              <div className="grid grid-cols-6 gap-3">
                {categories.map((category) => (
                  <button
                    key={category.name}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`${
                      selectedCategory === category.name
                        ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg scale-105"
                        : "bg-white text-gray-700 shadow-sm hover:shadow-md hover:scale-105"
                    } rounded-xl px-4 py-3 flex flex-col items-center gap-2 transition-all duration-300 border border-gray-100 hover:border-blue-200`}
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                  >
                    <span className="text-3xl">{category.icon}</span>
                    <span className="text-sm font-semibold text-center leading-tight">
                      {category.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-5">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 border border-gray-100 group"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      onError={(e) => {
                        e.currentTarget.src = chickenImg;
                      }}
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-gray-800 mb-2 text-center line-clamp-2">
                      {item.name}
                    </p>
                    <p className="text-gray-900 font-bold text-center text-base">₱{item.price}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>


          <div className="w-96 bg-white shadow-xl p-6 flex flex-col border-l border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-6" style={{ fontFamily: 'Poppins, sans-serif' }}>Order List</h2>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
                <p className="text-gray-400 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>No items in cart</p>
                <p className="text-gray-400 text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Add items from the menu</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 bg-gradient-to-br from-gray-50 to-white rounded-xl p-3 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100"
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden shadow-sm">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = "none"
                            target.parentElement!.innerHTML = '<div class="w-full h-full bg-gradient-to-br from-orange-200 to-orange-100 flex items-center justify-center text-2xl"></div>'
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>{item.name}</p>
                        <p className="text-gray-900 font-bold text-base mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>₱{item.price}</p>
                        
                  
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-all duration-200 active:scale-90"
                          >
                            <span className="text-gray-700 font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>−</span>
                          </button>
                          <span className="text-sm font-semibold text-gray-700 min-w-[20px] text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-all duration-200 active:scale-90"
                          >
                            <span className="text-gray-700 font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>+</span>
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center transition-all duration-200 active:scale-90 group"
                      >
                        <Trash2 className="w-4 h-4 text-gray-500 group-hover:text-red-600 transition-colors duration-200" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-5 space-y-4">
                  <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>Total Items:</span>
                      <span className="font-bold text-gray-800" style={{ fontFamily: 'Poppins, sans-serif' }}>{totalItems}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>Total Price:</span>
                      <span className="font-bold text-gray-800 text-xl" style={{ fontFamily: 'Poppins, sans-serif' }}>₱{totalPrice}</span>
                    </div>
                  </div>

                  <button 
                    onClick={handlePayment}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95" 
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                  >
                    PAY ₱{totalPrice}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

 
      {showSuccessModal && (
        <>
          
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] transition-all duration-500"
            style={{ animation: 'fadeIn 0.5s ease-out' }}
          />

     
          <div className="fixed inset-0 flex items-center justify-center z-[101] p-4">
            <div 
              className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full relative overflow-hidden"
              style={{ 
                animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                fontFamily: 'Poppins, sans-serif'
              }}
            >

              <button
                onClick={handleCloseModal}
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors duration-200 z-10"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              <div className="flex">
          
                <div className="w-2/5 bg-gradient-to-br from-gray-50 to-gray-100 p-12 flex flex-col items-center justify-center">
           
                  <div 
                    className="relative mb-8"
                    style={{ animation: 'scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s backwards' }}
                  >
            
                    <div 
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'conic-gradient(from 0deg, #10b981, #34d399, #10b981)',
                        animation: 'rotate 3s linear infinite',
                        padding: '3px'
                      }}
                    >
                      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-full" />
                    </div>
                    
             
                    <div 
                      className="relative w-24 h-24 rounded-full flex items-center justify-center"
                      style={{ 
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        animation: 'pulse 2.5s ease-in-out infinite',
                        boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      <Check className="w-12 h-12 text-white" strokeWidth={3.5} />
                    </div>
                  </div>

                  <h2 
                    className="text-2xl font-bold text-center mb-4 text-gray-800"
                    style={{ 
                      animation: 'fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s backwards',
                    }}
                  >
                    Your order is on its way!
                  </h2>

                  <p 
                    className="text-center text-gray-600 text-sm mb-8"
                    style={{ 
                      lineHeight: '1.6',
                      animation: 'fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s backwards'
                    }}
                  >
                    We've processed your payment and your receipt will be printed shortly.
                  </p>

                  <div className="w-full space-y-3" style={{ animation: 'fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s backwards' }}>
                    <button
                      onClick={handleCloseModal}
                      className="w-full py-3 rounded-xl font-semibold text-base text-white transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-95"
                      style={{ 
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)'
                      }}
                    >
                      Got It
                    </button>
                    <button
                      onClick={handleCloseModal}
                      className="w-full py-3 rounded-xl font-semibold text-base text-gray-700 bg-white border border-gray-200 transition-all duration-300 hover:bg-gray-50 hover:scale-[1.02] active:scale-95"
                    >
                      Submit another Order
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-12 bg-white">
                  <h3 className="text-xl font-bold text-gray-800 mb-8">Order Summary</h3>

   
                  <div className="space-y-6 mb-8">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Order Number</p>
                      <p className="text-base font-semibold text-gray-900">{orderNumber}</p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-1">Date</p>
                      <p className="text-base font-semibold text-gray-900">
                        {new Date().toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  </div>
                  <div 
                    className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2 custom-scrollbar"
                  >
                    {cart.map((item) => (
                      <div key={item.id} className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">{item.name}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">x{item.quantity}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">₱{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="border-t-2 border-gray-200 pt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{totalItems} Items</span>
                      <span className="text-base font-semibold text-gray-900">₱{totalPrice}</span>
                    </div>
                    
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-base font-semibold text-gray-700">Total Amount</span>
                      <span className="text-2xl font-bold text-emerald-600">₱{paidAmount}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }

            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(40px) scale(0.95);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }

            @keyframes scaleIn {
              from {
                opacity: 0;
                transform: scale(0.6) rotate(-10deg);
              }
              to {
                opacity: 1;
                transform: scale(1) rotate(0deg);
              }
            }

            @keyframes rotate {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }

            @keyframes pulse {
              0%, 100% {
                box-shadow: 0 10px 40px rgba(16, 185, 129, 0.3);
              }
              50% {
                box-shadow: 0 10px 60px rgba(16, 185, 129, 0.5);
              }
            }

            /* Custom Scrollbar Styles */
            .custom-scrollbar::-webkit-scrollbar {
              width: 6px;
            }

            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }

            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: rgba(209, 213, 219, 0.5);
              border-radius: 10px;
              backdrop-filter: blur(10px);
            }

            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: rgba(156, 163, 175, 0.6);
            }

            /* Firefox scrollbar */
            .custom-scrollbar {
              scrollbar-width: thin;
              scrollbar-color: rgba(209, 213, 219, 0.5) transparent;
            }
          `}</style>
        </>
      )}
    </div>
  )
}