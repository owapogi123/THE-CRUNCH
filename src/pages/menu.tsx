import { useState, useEffect } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { Search, X, User, ShoppingBag, Clock, Trash2, Menu, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
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
  { label: "Overview", path: "/dashboard" },
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
  const [isOpen, setIsOpen] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [paidAmount, setPaidAmount] = useState(0)
  const [orderNumber, setOrderNumber] = useState("")
  const navigate = useNavigate()


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
    setOrderNumber(`#${Math.floor(10000 + Math.random() * 90000)}`)
    setShowSuccessModal(true)
  }

  const handleCloseModal = () => {
    setShowSuccessModal(false)
    setCart([])
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
    
      <>
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <X className="w-6 h-6 text-black" />
              </motion.div>
            ) : (
              <motion.div
                key="menu"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Menu className="w-6 h-6 text-black" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

   
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40"
              onClick={() => setIsOpen(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isOpen && (
            <motion.aside
              initial={{ x: -288, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -288, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 h-full w-72 bg-white p-6 flex flex-col shadow-2xl z-50"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              <motion.div 
                className="flex items-center justify-center mb-10 mt-8"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <span className="text-2xl font-bold text-black">
                  The Crunch
                </span>
              </motion.div>

              <motion.div 
                className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-medium px-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                Navigation
              </motion.div>

              <nav className="flex-1 space-y-1.5">
                {navigationItems.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * index }}
                  >
                    <NavLink to={item.path} end onClick={() => setIsOpen(false)}>
                      {({ isActive }) => (
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start rounded-xl text-sm transition-all duration-200 px-4 py-2.5",
                            "text-black hover:bg-gray-50",
                            isActive && "bg-gray-100 text-black font-semibold"
                          )}
                        >
                          {item.label}
                        </Button>
                      )}
                    </NavLink>
                  </motion.div>
                ))}
              </nav>

              <div className="space-y-1.5 mt-6 pt-6 border-t border-gray-100">
                {additionalItems.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 + 0.05 * index }}
                  >
                    <NavLink to={item.path} onClick={() => setIsOpen(false)}>
                      {({ isActive }) => (
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start rounded-xl text-sm transition-all duration-200 px-4 py-2.5",
                            "text-black hover:bg-gray-50",
                            isActive && "bg-gray-100 text-black font-semibold"
                          )}
                        >
                          {item.label}
                        </Button>
                      )}
                    </NavLink>
                  </motion.div>
                ))}

                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.45 }}
                >
                  <Link to="/login" className="w-full">
                    <Button
                      variant="ghost"
                      className="w-full justify-start rounded-xl text-sm text-black mt-6 transition-all duration-200 px-4 py-2.5 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setIsOpen(false)}
                    >
                      Log Out
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </>

      <div className="flex-1 flex flex-col">
    
        <motion.div 
          className="bg-white shadow-sm px-8 py-6 border-b border-gray-200"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center justify-between ml-16">
            <div>
              <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Menu / Manage Cashier</p>
              <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Poppins, sans-serif' }}>Cashier View</h1>
            </div>
          </div>
        </motion.div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-8 overflow-y-auto">
            <motion.div 
              className="relative mb-8"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <input
                type="text"
                placeholder="Search Menu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-md px-5 py-3 pl-12 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-sm"
                style={{ fontFamily: 'Poppins, sans-serif' }}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </motion.div>
            <motion.div 
              className="mb-8"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide" style={{ fontFamily: 'Poppins, sans-serif' }}>Categories</h2>
              <div className="grid grid-cols-6 gap-3">
                {categories.map((category, index) => (
                  <motion.button
                    key={category.name}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`${
                      selectedCategory === category.name
                        ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg"
                        : "bg-white text-gray-700 shadow-sm"
                    } rounded-xl px-4 py-3 flex flex-col items-center gap-2 transition-colors duration-200 border border-gray-100`}
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05 * index }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span className="text-3xl">{category.icon}</span>
                    <span className="text-sm font-semibold text-center leading-tight">
                      {category.name}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
            <motion.div 
              className="grid grid-cols-4 gap-5"
              layout
            >
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, index) => (
                  <motion.button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 group"
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                    layout
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ delay: 0.03 * index }}
                    whileHover={{ scale: 1.05, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center overflow-hidden">
                      <motion.img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.3 }}
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
                  </motion.button>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
          <motion.div 
            className="w-96 bg-white shadow-xl p-6 flex flex-col border-l border-gray-200"
            initial={{ x: 384, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-6" style={{ fontFamily: 'Poppins, sans-serif' }}>Order List</h2>

            <AnimatePresence mode="wait">
              {cart.length === 0 ? (
                <motion.div 
                  key="empty"
                  className="flex-1 flex flex-col items-center justify-center text-center p-8"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="text-gray-400 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>No items in cart</p>
                  <p className="text-gray-400 text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Add items from the menu</p>
                </motion.div>
              ) : (
                <motion.div
                  key="cart"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col h-full"
                >
                  <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                    <AnimatePresence mode="popLayout">
                      {cart.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center gap-3 bg-gradient-to-br from-gray-50 to-white rounded-xl p-3 shadow-sm border border-gray-100"
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
                              <motion.button
                                onClick={() => updateQuantity(item.id, -1)}
                                className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors duration-200"
                                whileTap={{ scale: 0.9 }}
                              >
                                <span className="text-gray-700 font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>−</span>
                              </motion.button>
                              <motion.span 
                                className="text-sm font-semibold text-gray-700 min-w-[20px] text-center" 
                                style={{ fontFamily: 'Poppins, sans-serif' }}
                                key={item.quantity}
                                initial={{ scale: 1.3 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.2 }}
                              >
                                {item.quantity}
                              </motion.span>
                              <motion.button
                                onClick={() => updateQuantity(item.id, 1)}
                                className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors duration-200"
                                whileTap={{ scale: 0.9 }}
                              >
                                <span className="text-gray-700 font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>+</span>
                              </motion.button>
                            </div>
                          </div>
                          <motion.button
                            onClick={() => removeFromCart(item.id)}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center transition-colors duration-200 group"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <Trash2 className="w-4 h-4 text-gray-500 group-hover:text-red-600 transition-colors duration-200" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <motion.div 
                    className="border-t border-gray-200 pt-5 space-y-4"
                    layout
                  >
                    <motion.div 
                      className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-100"
                      layout
                    >
                      <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>Total Items:</span>
                        <motion.span 
                          className="font-bold text-gray-800" 
                          style={{ fontFamily: 'Poppins, sans-serif' }}
                          key={totalItems}
                          initial={{ scale: 1.2 }}
                          animate={{ scale: 1 }}
                        >
                          {totalItems}
                        </motion.span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>Total Price:</span>
                        <motion.span 
                          className="font-bold text-gray-800 text-xl" 
                          style={{ fontFamily: 'Poppins, sans-serif' }}
                          key={totalPrice}
                          initial={{ scale: 1.2 }}
                          animate={{ scale: 1 }}
                        >
                          ₱{totalPrice}
                        </motion.span>
                      </div>
                    </motion.div>

                    <motion.button 
                      onClick={handlePayment}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-xl font-bold text-lg shadow-lg" 
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                      whileHover={{ scale: 1.02, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
                      whileTap={{ scale: 0.98 }}
                    >
                      PAY ₱{totalPrice}
                    </motion.button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {showSuccessModal && (
          <>
            <motion.div 
              className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4">
              <motion.div 
                className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full relative overflow-hidden"
                style={{ fontFamily: 'Poppins, sans-serif' }}
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                <motion.button
                  onClick={handleCloseModal}
                  className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors duration-200 z-10"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>

                <div className="flex">
                  <div className="w-2/5 bg-gradient-to-br from-gray-50 to-gray-100 p-12 flex flex-col items-center justify-center">
                    <motion.div 
                      className="relative mb-8"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.2 }}
                    >
                      <motion.div 
                        className="w-24 h-24 rounded-full flex items-center justify-center"
                        style={{ 
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        }}
                        animate={{ 
                          boxShadow: [
                            "0 10px 40px rgba(16, 185, 129, 0.3)",
                            "0 10px 60px rgba(16, 185, 129, 0.5)",
                            "0 10px 40px rgba(16, 185, 129, 0.3)",
                          ]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <motion.div
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.5, delay: 0.4 }}
                        >
                          <Check className="w-12 h-12 text-white" strokeWidth={3.5} />
                        </motion.div>
                      </motion.div>
                    </motion.div>

                    <motion.h2 
                      className="text-2xl font-bold text-center mb-4 text-gray-800"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      Your order is on its way!
                    </motion.h2>

                    <motion.p 
                      className="text-center text-gray-600 text-sm mb-8"
                      style={{ lineHeight: '1.6' }}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                    >
                      We've processed your payment and your receipt will be printed shortly.
                    </motion.p>

                    <motion.div 
                      className="w-full space-y-3"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <motion.button
                        onClick={handleCloseModal}
                        className="w-full py-3 rounded-xl font-semibold text-base text-white"
                        style={{ 
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        }}
                        whileHover={{ scale: 1.02, boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)" }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Got It
                      </motion.button>
                      <motion.button
                        onClick={handleCloseModal}
                        className="w-full py-3 rounded-xl font-semibold text-base text-gray-700 bg-white border border-gray-200"
                        whileHover={{ scale: 1.02, backgroundColor: "rgb(249, 250, 251)" }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Submit another Order
                      </motion.button>
                    </motion.div>
                  </div>
                  <motion.div 
                    className="flex-1 p-12 bg-white"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h3 className="text-xl font-bold text-gray-800 mb-8">Order Summary</h3>

                    <div className="space-y-6 mb-8">
                      <motion.div
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <p className="text-sm text-gray-600 mb-1">Order Number</p>
                        <p className="text-base font-semibold text-gray-900">{orderNumber}</p>
                      </motion.div>

                      <motion.div
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.35 }}
                      >
                        <p className="text-sm text-gray-600 mb-1">Date</p>
                        <p className="text-base font-semibold text-gray-900">
                          {new Date().toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                      </motion.div>
                    </div>

                    <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {cart.map((item, index) => (
                        <motion.div 
                          key={item.id} 
                          className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0"
                          initial={{ x: 20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.4 + 0.05 * index }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">x{item.quantity}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">₱{item.price * item.quantity}</span>
                        </motion.div>
                      ))}
                    </div>

                    <motion.div 
                      className="border-t-2 border-gray-200 pt-4 space-y-3"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{totalItems} Items</span>
                        <span className="text-base font-semibold text-gray-900">₱{totalPrice}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-base font-semibold text-gray-700">Total Amount</span>
                        <span className="text-2xl font-bold text-emerald-600">₱{paidAmount}</span>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            </div>

            <style>{`
              .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
              }

              .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
              }

              .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(209, 213, 219, 0.5);
                border-radius: 10px;
              }

              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: rgba(156, 163, 175, 0.6);
              }

              .custom-scrollbar {
                scrollbar-width: thin;
                scrollbar-color: rgba(209, 213, 219, 0.5) transparent;
              }
            `}</style>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}