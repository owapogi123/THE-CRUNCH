import { useState, useEffect } from "react"
import { Search, ShoppingBag, Trash2, Check, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Sidebar } from "@/components/Sidebar"
import { api } from "../lib/api"
import chickenImg from '../assets/img/chicken.jpg'

interface MenuItem {
  id: number
  name: string
  price: number
  image: string
  category: string
  remainingStock?: number
}

interface CartItem {
  id: number
  name: string
  price: number
  image: string
  quantity: number
}

export default function MenuPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL ITEMS")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [products, setProducts] = useState<MenuItem[]>([])
  const [orderType, setOrderType] = useState<'dine-in' | 'take-out'>('dine-in')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'e-payment'>('cash')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [paidAmount, setPaidAmount] = useState(0)
  const [orderNumber, setOrderNumber] = useState("")
  const [savedCart, setSavedCart] = useState<CartItem[]>([])

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    api.get<any[]>('/products')
      .then((data) => {
        const mapped = (data || []).map((p: any) => ({
          id: Number(p.id),
          name: String(p.name ?? `Product #${p.id}`),
          price: Number(p.price ?? 0),
          image: String(p.image ?? chickenImg),
          category: String(p.category ?? 'UNCATEGORIZED').toUpperCase(),
          remainingStock: Number(p.remainingStock ?? p.quantity ?? 0),
        }))
        setProducts(mapped)
      })
      .catch(console.error)
  }, [])

  const categoryNames = [
    'ALL ITEMS',
    ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))),
  ]

  const addToCart = (item: MenuItem) => {
    const remaining = Number(item.remainingStock ?? 0)
    if (remaining <= 0) {
      alert('Out of stock')
      return
    }

    const existingItem = cart.find((cartItem) => cartItem.id === item.id)
    if (existingItem) {
      const nextQty = existingItem.quantity + 1
      if (nextQty > remaining) return

      setCart(cart.map((cartItem) =>
        cartItem.id === item.id
          ? { ...cartItem, quantity: nextQty }
          : cartItem
      ))
    } else {
      setCart([...cart, { ...item, quantity: 1 }])
    }
  }

  const removeFromCart = (itemId: number) => {
    setCart(cart.filter((item) => item.id !== itemId))
  }

  const updateQuantity = (itemId: number, change: number) => {
    const product = products.find((p) => p.id === itemId)
    const remaining = Number(product?.remainingStock ?? 0)

    setCart((prev) => prev
      .map((item) => {
        if (item.id !== itemId) return item
        const nextQty = Math.max(0, item.quantity + change)
        if (nextQty > remaining) return item
        return { ...item, quantity: nextQty }
      })
      .filter((item) => item.quantity > 0)
    )
  }

  const handlePayment = async () => {
    if (cart.length === 0) return alert('Cart is empty')

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const items = cart.map((item) => ({
      product_id: item.id,
      qty: item.quantity,
      subtotal: item.price * item.quantity,
      name: item.name,
      price: item.price,
    }))

    try {
      const response = await api.post<any>('/orders', {
        items,
        total,
        order_type: orderType,
        payment_method: paymentMethod,
      })

      setSavedCart([...cart])
      setPaidAmount(total)
      setOrderNumber(String(response?.orderNumber ?? `#${Math.floor(10000 + Math.random() * 90000)}`))
      setShowSuccessModal(true)

      const refreshed = await api.get<any[]>('/products')
      setProducts((refreshed || []).map((p: any) => ({
        id: Number(p.id),
        name: String(p.name ?? `Product #${p.id}`),
        price: Number(p.price ?? 0),
        image: String(p.image ?? chickenImg),
        category: String(p.category ?? 'UNCATEGORIZED').toUpperCase(),
        remainingStock: Number(p.remainingStock ?? p.quantity ?? 0),
      })))
    } catch (error) {
      console.error(error)
      alert('Failed to submit order')
    }
  }

  const handleCloseModal = () => {
    setShowSuccessModal(false)
    setCart([])
    setSavedCart([])
    setPaymentMethod('cash')
    setOrderType('dine-in')
  }

  const filteredItems = products.filter((item) => {
    const matchesCategory = selectedCategory === "ALL ITEMS" || item.category === selectedCategory
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <motion.div className="bg-white shadow-sm px-8 py-6 border-b border-gray-200" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }}>
          <div className="flex items-center justify-between ml-16">
            <div>
              <p className="text-xs text-gray-500 mb-1">Menu / Manage Cashier</p>
              <h1 className="text-2xl font-bold text-gray-800">Cashier View</h1>
            </div>
          </div>
        </motion.div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-8 overflow-y-auto">
            <motion.div className="relative mb-8" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
              <input
                type="text"
                placeholder="Search Menu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-md px-5 py-3 pl-12 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm text-sm"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </motion.div>

            <motion.div className="mb-8" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
              <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Categories</h2>
              <div className="flex flex-wrap gap-2">
                {categoryNames.map((categoryName) => (
                  <button
                    key={categoryName}
                    onClick={() => setSelectedCategory(categoryName)}
                    className="relative px-5 py-2 text-sm font-medium rounded-full transition-colors duration-200 focus:outline-none"
                    style={{ color: selectedCategory === categoryName ? '#2563eb' : '#6b7280' }}
                  >
                    {selectedCategory === categoryName && (
                      <motion.span
                        layoutId="categoryPill"
                        className="absolute inset-0 rounded-full bg-blue-50 border border-blue-200"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{categoryName}</span>
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div className="grid grid-cols-4 gap-5" layout>
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, index) => (
                  (() => {
                    const stock = Number(item.remainingStock ?? 0)
                    const isOutOfStock = stock <= 0
                    return (
                  <motion.button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={isOutOfStock}
                    className={`bg-white rounded-2xl overflow-hidden shadow-sm border group transition-all ${isOutOfStock ? "border-red-200 opacity-70 cursor-not-allowed" : "border-gray-100"}`}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, delay: 0.03 * index }}
                    whileHover={isOutOfStock ? undefined : {
                      y: -4,
                      boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                      transition: { duration: 0.2 }
                    }}
                    whileTap={isOutOfStock ? undefined : { scale: 0.97, y: 0 }}
                  >
                    <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                      <img
                        src={item.image}
                        alt={item.name}
                        className={`w-full h-full object-cover ${isOutOfStock ? "grayscale" : ""}`}
                        onError={(e) => { e.currentTarget.src = chickenImg; }}
                      />
                    </div>
                    <div className="p-4">
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <p className="text-xs font-semibold text-gray-800 text-center line-clamp-2">{item.name}</p>
                        {isOutOfStock && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">OUT OF STOCK</span>
                        )}
                      </div>
                      <p className="text-gray-900 font-bold text-center text-base">₱{item.price}</p>
                      <p className={`text-xs mt-1 text-center ${isOutOfStock ? "text-red-500 font-semibold" : "text-gray-500"}`}>
                        Stock: {stock}
                      </p>
                    </div>
                  </motion.button>
                    )
                  })()
                ))}
              </AnimatePresence>
            </motion.div>
          </div>

          <motion.div className="w-96 bg-white shadow-xl p-6 flex flex-col border-l border-gray-200" initial={{ x: 384, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: "spring", damping: 25, stiffness: 200 }}>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Order List</h2>
            <AnimatePresence mode="wait">
              {cart.length === 0 ? (
                <motion.div key="empty" className="flex-1 flex flex-col items-center justify-center text-center p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="text-gray-400 font-medium">No items in cart</p>
                  <p className="text-gray-400 text-sm mt-1">Add items from the menu</p>
                </motion.div>
              ) : (
                <motion.div key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-full">
                  <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                    <AnimatePresence mode="popLayout">
                      {cart.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.2 }}
                          className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100"
                        >
                          <div className="w-16 h-16 rounded-lg overflow-hidden shadow-sm">
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800 text-sm">{item.name}</p>
                            <p className="text-gray-900 font-bold text-base mt-0.5">₱{item.price}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <motion.button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center" whileTap={{ scale: 0.9 }}>
                                <span className="text-gray-700 font-bold text-sm">−</span>
                              </motion.button>
                              <motion.span
                                className="text-sm font-semibold text-gray-700 min-w-[20px] text-center"
                                key={item.quantity}
                                initial={{ scale: 1.2 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.15 }}
                              >
                                {item.quantity}
                              </motion.span>
                              <motion.button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center" whileTap={{ scale: 0.9 }}>
                                <span className="text-gray-700 font-bold text-sm">+</span>
                              </motion.button>
                            </div>
                          </div>
                          <motion.button
                            onClick={() => removeFromCart(item.id)}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-50 flex items-center justify-center group"
                            whileTap={{ scale: 0.9 }}
                          >
                            <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  <motion.div className="border-t border-gray-200 pt-5 space-y-4" layout>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-gray-600 font-medium">Total Items:</span>
                        <span className="font-bold text-gray-800">{totalItems}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Total Price:</span>
                        <span className="font-bold text-gray-800 text-xl">₱{totalPrice}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as 'dine-in' | 'take-out')}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="dine-in">Dine In</option>
                        <option value="take-out">Take Out</option>
                      </select>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'e-payment')}
                        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="cash">Cash</option>
                        <option value="e-payment">E-Payment</option>
                      </select>
                    </div>
                    <motion.button
                      onClick={() => { void handlePayment() }}
                      className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-lg shadow-md"
                      whileHover={{ scale: 1.02 }}
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
            <motion.div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <div className="fixed inset-0 flex items-center justify-center z-[101] p-4">
              <motion.div
                className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full relative overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.button onClick={handleCloseModal} className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 z-10" whileTap={{ scale: 0.9 }}>
                  <X className="w-5 h-5 text-gray-600" />
                </motion.button>
                <div className="flex">
                  <div className="w-2/5 bg-gray-50 p-12 flex flex-col items-center justify-center">
                    <motion.div
                      className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                    >
                      <Check className="w-12 h-12 text-white" strokeWidth={3.5} />
                    </motion.div>
                    <motion.h2 className="text-2xl font-bold text-center mb-4 text-gray-800" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                      Your order is on its way!
                    </motion.h2>
                    <motion.p className="text-center text-gray-600 text-sm mb-8" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                      We've processed your payment and your receipt will be printed shortly.
                    </motion.p>
                    <motion.div className="w-full space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                      <motion.button onClick={handleCloseModal} className="w-full py-3 rounded-xl font-semibold text-base text-white" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Got It</motion.button>
                      <motion.button onClick={handleCloseModal} className="w-full py-3 rounded-xl font-semibold text-base text-gray-700 bg-white border border-gray-200" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Submit another Order</motion.button>
                    </motion.div>
                  </div>
                  <motion.div className="flex-1 p-12 bg-white" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                    <h3 className="text-xl font-bold text-gray-800 mb-8">Order Summary</h3>
                    <div className="space-y-6 mb-8">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Order Number</p>
                        <p className="text-base font-semibold text-gray-900">{orderNumber}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Date</p>
                        <p className="text-base font-semibold text-gray-900">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                    </div>
                    <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                      {savedCart.map((item, index) => (
                        <motion.div key={item.id} className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + 0.04 * index }}>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">x{item.quantity}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">₱{item.price * item.quantity}</span>
                        </motion.div>
                      ))}
                    </div>
                    <div className="border-t-2 border-gray-200 pt-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{savedCart.reduce((s, i) => s + i.quantity, 0)} Items</span>
                        <span className="text-base font-semibold text-gray-900">₱{paidAmount}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-base font-semibold text-gray-700">Total Amount</span>
                        <span className="text-2xl font-bold text-emerald-600">₱{paidAmount}</span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}