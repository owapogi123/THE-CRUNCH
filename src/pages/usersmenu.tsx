import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"

const SP  = { type: "spring" as const, stiffness: 340, damping: 30 }
const SPG = { type: "spring" as const, stiffness: 200, damping: 24 }
const EASE: [number,number,number,number] = [0.22, 1, 0.36, 1]

interface Nutrition { calories: number; protein: number; fats: number; carbs: number }

interface Recipe {
  id:          number
  name:        string
  description: string
  image:       string
  nutrition:   Nutrition
  price:       number
  maxFlavors?: number
  mealTypes:   string[]
  tag?:        string
  note?:       string
  variant?:    "original" | "spicy"
}

interface MoreRecipe { name: string; time: string; img: string }
interface CartItem   { recipe: Recipe; quantity: number; flavors: string[] }

interface HistoryOrder {
  id:    string
  date:  Date
  items: CartItem[]
  total: number
}

const FLAVORS: string[] = [
  "Classic", "Honey Garlic", "Teriyaki",
  "Texas BBQ", "Garlic Parmesan", "K-Style", "Spicy K-Style",
]

const RECIPES: Record<string, Recipe[]> = {
  Chicken: [
    { id: 1,  name: "Whole Crispy Fried Chicken",        description: "12 pcs | Perfect for 4–6 pax. Choice of 2 Flavors.",      image: "https://bit.ly/4ckRqHY",    nutrition: { calories: 350, protein: 15, fats: 25, carbs: 90 }, price: 598, maxFlavors: 2, mealTypes: ["Lunch","Dinner"],            tag: "Bestseller" },
    { id: 2,  name: "Half Crispy Fried Chicken",         description: "6 pcs | Perfect for 2–3 pax. Choice of 1 Flavor.",       image: "https://bit.ly/3P8sz0j",    nutrition: { calories: 310, protein: 13, fats: 22, carbs: 80 }, price: 328, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 3,  name: "Crispy Chicken Shots with Drink",   description: "Good for 1 pax.",                                         image: "https://bit.ly/40Z9n7T",   nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 }, price: 128, maxFlavors: 1, mealTypes: ["Breakfast","Lunch","Dinner"], tag: "Hot" },
    { id: 4,  name: "Chicken Skin with Rice and Drink",  description: "Solo Meal.",                                               image: "https://bit.ly/3P6DcAK",   nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 118, maxFlavors: 1, mealTypes: ["Breakfast","Lunch"] },
    { id: 5,  name: "2 pcs. Chicken With Rice and Drink",description: "Solo Meal.",                                               image: "https://bit.ly/4r5rfZI",   nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 188, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 6,  name: "3 pcs. Chicken With Rice and Drink",description: "Good for 1 pax.",                                         image: "https://bit.ly/4r1CAtC",   nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 228, maxFlavors: 1, mealTypes: ["Lunch","Dinner"],            tag: "Fan Fave" },
    { id: 20, name: "1 pc. Chicken",                     description: "Solo Rice Meal. Choice of Original or Spicy.",            image: "https://bit.ly/4r5rfZI",   nutrition: { calories: 260, protein: 22, fats: 12, carbs: 30 }, price: 80,  maxFlavors: 1, mealTypes: ["Lunch","Dinner"],            variant: "original" },
    { id: 21, name: "2 pcs. Chicken",                    description: "Rice Meal. Choice of Original or Spicy.",                 image: "https://bit.ly/4r5rfZI",   nutrition: { calories: 420, protein: 38, fats: 22, carbs: 40 }, price: 135, maxFlavors: 1, mealTypes: ["Lunch","Dinner"],            variant: "original" },
    { id: 22, name: "3 pcs. Chicken",                    description: "Rice Meal. Choice of Original or Spicy.",                 image: "https://bit.ly/4r1CAtC",   nutrition: { calories: 580, protein: 52, fats: 30, carbs: 50 }, price: 185, maxFlavors: 1, mealTypes: ["Lunch","Dinner"],            tag: "Must Try", variant: "original" },
    { id: 23, name: "Chicken Skin",                      description: "Rice Meal. Crispy and flavorful chicken skin.",           image: "https://bit.ly/3P6DcAK",   nutrition: { calories: 310, protein: 18, fats: 24, carbs: 20 }, price: 70,  maxFlavors: 1, mealTypes: ["Breakfast","Lunch"] },
    { id: 24, name: "Chicken Shots",                     description: "Rice Meal. Bite-sized crispy chicken shots.",             image: "https://bit.ly/40Z9n7T",   nutrition: { calories: 290, protein: 20, fats: 18, carbs: 25 }, price: 75,  maxFlavors: 1, mealTypes: ["Breakfast","Lunch","Dinner"] },
  ],
  Drinks: [
    { id: 7,  name: "Kiwi Ice Blended",      description: "Chilled to perfection — bright, citrusy, slightly creamy.", image: "https://tinyurl.com/56rwyuj8", nutrition: { calories: 180, protein: 3, fats: 2,  carbs: 44 }, price: 79,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 30, name: "Strawberry Fruit Soda", description: "Refreshing fruit soda. Bright and sweet.",                  image: "https://tinyurl.com/3ccde5sv", nutrition: { calories: 120, protein: 0, fats: 0,  carbs: 30 }, price: 70,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 31, name: "Green Apple Fruit Soda",description: "Refreshing fruit soda. Tangy and sweet.",                   image: "https://tinyurl.com/mrydynur", nutrition: { calories: 120, protein: 0, fats: 0,  carbs: 30 }, price: 70,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 32, name: "Kiwi Fruit Soda",       description: "Refreshing fruit soda. Bright and citrusy.",               image: "https://shorturl.at/sBHbi",    nutrition: { calories: 120, protein: 0, fats: 0,  carbs: 30 }, price: 70,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 33, name: "Lychee Fruit Soda",     description: "Refreshing fruit soda. Floral and sweet.",                 image: "https://shorturl.at/RuKTf",    nutrition: { calories: 120, protein: 0, fats: 0,  carbs: 30 }, price: 70,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 34, name: "Mango Fruit Soda",      description: "Refreshing fruit soda. Tropical and juicy.",               image: "https://shorturl.at/MvNpm",    nutrition: { calories: 120, protein: 0, fats: 0,  carbs: 30 }, price: 70,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 35, name: "Blueberry Fruit Soda",  description: "Refreshing fruit soda. Rich and berry-forward.",           image: "https://shorturl.at/PbnDy",    nutrition: { calories: 120, protein: 0, fats: 0,  carbs: 30 }, price: 70,  mealTypes: ["Breakfast","Lunch","Dinner"] },
  ],
  Burger: [
    { id: 8,  name: "The Crunch Burger",             description: "Crispy chicken on a toasted bun with fresh lettuce & tangy sauce.", image: "https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg", nutrition: { calories: 520, protein: 22, fats: 18, carbs: 68 }, price: 80,  mealTypes: ["Breakfast","Lunch"], tag: "Must Try", note: "+₱5 with cheese" },
    { id: 40, name: "The Crunch Burger with Cheese", description: "Crispy chicken burger topped with a melted cheese slice.",        image: "https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg", nutrition: { calories: 560, protein: 24, fats: 21, carbs: 68 }, price: 85,  mealTypes: ["Breakfast","Lunch"], tag: "Must Try" },
  ],
  Chips: [
    { id: 9, name: "Crispy Potato Chips", description: "Evenly seasoned — rich, savory, and impossible to put down.", image: "https://i.pinimg.com/736x/a4/a5/cd/a4a5cd6b777e7bb789ee02288b6eb4d2.jpg", nutrition: { calories: 480, protein: 28, fats: 16, carbs: 58 }, price: 69, mealTypes: ["Breakfast","Lunch","Dinner"] },
  ],
  Sides: [
    { id: 50, name: "Kimchi",                        description: "Traditional fermented kimchi. Perfect add-on to any meal.",       image: "https://bit.ly/47bPoX5",   nutrition: { calories: 40,  protein: 2,  fats: 0,  carbs: 8  }, price: 45,  mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 51, name: "Fishcake",                      description: "Savory fishcake slices. Perfect add-on to any meal.",            image: "https://bit.ly/4s9ZvUC",   nutrition: { calories: 120, protein: 10, fats: 5,  carbs: 12 }, price: 85,  mealTypes: ["Lunch","Dinner"] },
    { id: 52, name: "Tteokbokki",                    description: "Chewy rice cakes in a spicy-sweet sauce.",                       image: "https://bit.ly/3MMEeRT",   nutrition: { calories: 210, protein: 6,  fats: 3,  carbs: 42 }, price: 85,  mealTypes: ["Lunch","Dinner"] },
    { id: 53, name: "Classic Chicken Skin Bucket",   description: "Bucket of crispy classic chicken skin.",                         image: "https://bit.ly/3P6DcAK",   nutrition: { calories: 520, protein: 28, fats: 38, carbs: 10 }, price: 140, mealTypes: ["Lunch","Dinner"],            tag: "Must Try" },
    { id: 54, name: "Flavored Chicken Skin Bucket",  description: "Bucket of crispy flavored chicken skin. Choice of flavor.",      image: "https://bit.ly/3P6DcAK",   nutrition: { calories: 530, protein: 28, fats: 39, carbs: 12 }, price: 140, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 55, name: "Chicken Shots Bucket",          description: "Bucket of bite-sized crispy chicken shots.",                     image: "https://bit.ly/40Z9n7T",   nutrition: { calories: 620, protein: 42, fats: 32, carbs: 30 }, price: 160, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 56, name: "Twister Fries",                 description: "Seasoned spiral-cut fries — crispy and addictive.",              image: "https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg", nutrition: { calories: 380, protein: 5,  fats: 18, carbs: 50 }, price: 140, mealTypes: ["Breakfast","Lunch","Dinner"], tag: "Must Try" },
  ],
  Alacarte: [
    { id: 10, name: "Crispy Chicken Shots",            description: "Solo Meal.", image: "https://bit.ly/40Z9n7T",   nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 }, price: 88,  maxFlavors: 1, mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 11, name: "Chicken Skin with Rice & Drink",  description: "Solo Meal.", image: "https://bit.ly/3P6DcAK",   nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 78,  maxFlavors: 1, mealTypes: ["Breakfast","Lunch"] },
    { id: 12, name: "2 pcs. Chicken With Rice & Drink",description: "Solo Meal.", image: "https://bit.ly/4r5rfZI",   nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 148, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 13, name: "3 pcs. Chicken With Rice & Drink",description: "Solo Meal.", image: "https://bit.ly/4r1CAtC",   nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 188, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
  ],
}

const MORE_RECIPES: MoreRecipe[] = [
  { name: "Twister Fries", time: "5 min",  img: "https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg" },
  { name: "Regular Fries", time: "5 min",  img: "https://i.pinimg.com/1200x/95/02/12/9502126d74d78185aca0697e53c91197.jpg" },
  { name: "Tteokbokki",    time: "15 min", img: "https://bit.ly/3MMEeRT" },
  { name: "Fish Cake",     time: "5 min",  img: "https://bit.ly/4s9ZvUC" },
  { name: "Kimchi",        time: "5 min",  img: "https://bit.ly/47bPoX5" },
]

const CATEGORIES = ["All", "Chicken", "Burger", "Sides", "Drinks", "Chips", "Alacarte"]
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"]

const NAV_LINKS = [
  { label: "Home",  path: "/" },
  { label: "Menu",  path: "/usersmenu" },
  { label: "About", path: "/aboutthecrunch" },
]

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  "Bestseller": { bg: "rgba(245,200,66,0.15)",  text: "#f5c842" },
  "Hot":        { bg: "rgba(239,68,68,0.14)",   text: "#ef4444" },
  "Fan Fave":   { bg: "rgba(34,197,94,0.12)",   text: "#4ade80" },
  "Must Try":   { bg: "rgba(139,92,246,0.12)",  text: "#a78bfa" },
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })
}

/* ── Inline SVG icons — no emoji, no external deps ── */
function IconHistory() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12 8 12 12 14 14"/>
      <path d="M3.05 11a9 9 0 1 0 .5-4.5"/>
      <polyline points="1 4 3 6 5 4"/>
    </svg>
  )
}
function IconReceipt() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/>
      <line x1="8" y1="9" x2="16" y2="9"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  )
}
function IconChevronDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
function IconEmptyClipboard() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="2"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  )
}

/* ─────────────────────────────────────────────
   HISTORY DRAWER
───────────────────────────────────────────── */
function HistoryDrawer({ orders, onClose }: { orders: HistoryOrder[]; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(orders[0]?.id ?? null)

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.28 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, backdropFilter: "blur(8px)" }}
      />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={SPG}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 460, background: "#151210", zIndex: 300, display: "flex", flexDirection: "column", boxShadow: "-24px 0 80px rgba(0,0,0,0.5)", borderLeft: "1px solid rgba(240,237,232,0.07)" }}
      >
        {/* Header */}
        <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(240,237,232,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <span style={{ color: "#f5c842" }}><IconReceipt /></span>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f0ede8", margin: 0, fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}>Order History</h2>
            </div>
            <p style={{ fontSize: 12, color: "rgba(240,237,232,0.35)", margin: 0 }}>
              {orders.length} order{orders.length !== 1 ? "s" : ""} this session
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} transition={SP}
            onClick={onClose}
            style={{ background: "rgba(240,237,232,0.07)", border: "1px solid rgba(240,237,232,0.1)", color: "rgba(240,237,232,0.6)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}
          >×</motion.button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px 32px" }}>
          <AnimatePresence initial={false}>
            {orders.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={SPG}
                style={{ textAlign: "center", paddingTop: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
              >
                <span style={{ color: "rgba(240,237,232,0.2)" }}><IconEmptyClipboard /></span>
                <p style={{ color: "rgba(240,237,232,0.25)", fontSize: 14, fontWeight: 400, lineHeight: 1.75, margin: 0 }}>
                  No orders yet this session.<br />Place your first order to see it here.
                </p>
              </motion.div>
            ) : (
              orders.map((order, oi) => {
                const isOpen   = expanded === order.id
                const totalQty = order.items.reduce((s, i) => s + i.quantity, 0)
                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPG, delay: oi * 0.04 }}
                    style={{ marginBottom: 10 }}
                  >
                    {/* Accordion header */}
                    <motion.button
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                      whileHover={{ borderColor: isOpen ? "rgba(245,200,66,0.35)" : "rgba(240,237,232,0.18)" }}
                      style={{
                        width: "100%",
                        background: isOpen ? "rgba(245,200,66,0.05)" : "rgba(240,237,232,0.03)",
                        border: `1px solid ${isOpen ? "rgba(245,200,66,0.25)" : "rgba(240,237,232,0.09)"}`,
                        borderRadius: isOpen ? "16px 16px 0 0" : 16,
                        padding: "14px 16px",
                        cursor: "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 12,
                        transition: "all 0.22s", textAlign: "left" as const,
                      }}
                    >
                      {/* Order number bubble */}
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: isOpen ? "#f5c842" : "rgba(240,237,232,0.07)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, transition: "background 0.22s",
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: isOpen ? "#111" : "rgba(240,237,232,0.38)", letterSpacing: "-0.01em" }}>
                          #{orders.length - oi}
                        </span>
                      </div>

                      {/* Date + item preview icons */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#f0ede8", marginBottom: 5 }}>
                          {formatDate(order.date)}
                          <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(240,237,232,0.32)", marginLeft: 7 }}>
                            {formatTime(order.date)}
                          </span>
                        </div>
                        {/* Stacked product image icons */}
                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          {order.items.slice(0, 6).map((item, ii) => (
                            <div
                              key={ii}
                              title={item.recipe.name}
                              style={{ width: 22, height: 22, borderRadius: "50%", overflow: "hidden", border: "1.5px solid rgba(14,12,10,0.9)", flexShrink: 0, marginLeft: ii > 0 ? -6 : 0, position: "relative", zIndex: order.items.length - ii }}
                            >
                              <img src={item.recipe.image} alt={item.recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                          ))}
                          {order.items.length > 6 && (
                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(240,237,232,0.1)", border: "1.5px solid rgba(14,12,10,0.9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: -6 }}>
                              <span style={{ fontSize: 7.5, fontWeight: 800, color: "rgba(240,237,232,0.5)" }}>+{order.items.length - 6}</span>
                            </div>
                          )}
                          <span style={{ fontSize: 10.5, color: "rgba(240,237,232,0.28)", marginLeft: 8 }}>
                            {totalQty} item{totalQty !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Total + chevron */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#f5c842", letterSpacing: "-0.02em" }}>
                          ₱{order.total.toFixed(2)}
                        </span>
                        <motion.span
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={SP}
                          style={{ color: "rgba(240,237,232,0.28)", display: "flex", alignItems: "center" }}
                        >
                          <IconChevronDown />
                        </motion.span>
                      </div>
                    </motion.button>

                    {/* Expanded item list */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="items"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: EASE }}
                          style={{ overflow: "hidden", background: "rgba(240,237,232,0.02)", border: "1px solid rgba(245,200,66,0.22)", borderTop: "none", borderRadius: "0 0 16px 16px" }}
                        >
                          <div style={{ padding: "6px 0 6px" }}>
                            {order.items.map((item, ii) => (
                              <div
                                key={ii}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: ii < order.items.length - 1 ? "1px solid rgba(240,237,232,0.05)" : "none" }}
                              >
                                {/* Product image as the identifier icon */}
                                <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "1.5px solid rgba(240,237,232,0.1)" }}>
                                  <img src={item.recipe.image} alt={item.recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </div>

                                {/* Name + flavors */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12.5, fontWeight: 600, color: "#f0ede8", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {item.recipe.name}
                                  </p>
                                  {item.flavors.length > 0 && (
                                    <p style={{ fontSize: 10.5, color: "rgba(240,237,232,0.3)", margin: 0 }}>
                                      {item.flavors.join(" · ")}
                                    </p>
                                  )}
                                </div>

                                {/* Qty × price */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "rgba(240,237,232,0.06)", color: "rgba(240,237,232,0.4)", border: "1px solid rgba(240,237,232,0.09)" }}>
                                    ×{item.quantity}
                                  </span>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#f5c842", minWidth: 54, textAlign: "right" as const }}>
                                    ₱{(item.recipe.price * item.quantity).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}

                            {/* Order total row */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px 6px", borderTop: "1px solid rgba(240,237,232,0.07)", marginTop: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.28)", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>Order total</span>
                              <span style={{ fontSize: 16, fontWeight: 900, color: "#f5c842", letterSpacing: "-0.02em" }}>₱{order.total.toFixed(2)}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  )
}

/* ─────────────────────────────────────────────
   FLAVOR PICKER
───────────────────────────────────────────── */
function FlavorPicker({ maxFlavors, selected, onChange }: { maxFlavors: number; selected: string[]; onChange: (f: string[]) => void }) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(f => f !== name))
    else if (selected.length < maxFlavors) onChange([...selected, name])
  }
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.3)", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>
        Pick {maxFlavors === 1 ? "1 flavor" : `up to ${maxFlavors} flavors`}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {FLAVORS.map(name => {
          const active   = selected.includes(name)
          const disabled = !active && selected.length >= maxFlavors
          return (
            <motion.button
              key={name}
              onClick={() => !disabled && toggle(name)}
              whileHover={disabled ? {} : { scale: 1.04 }}
              whileTap={disabled ? {} : { scale: 0.93 }}
              transition={SP}
              style={{
                padding: "6px 14px", borderRadius: 30,
                border: active ? "1.5px solid #f5c842" : "1.5px solid rgba(240,237,232,0.12)",
                background: active ? "rgba(245,200,66,0.12)" : "rgba(240,237,232,0.04)",
                color: active ? "#f5c842" : disabled ? "rgba(240,237,232,0.2)" : "rgba(240,237,232,0.55)",
                fontSize: 11.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: disabled ? 0.4 : 1,
                display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s",
              }}
            >
              {name}
              <AnimatePresence>
                {active && (
                  <motion.span key="tick" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={SP} style={{ fontSize: 9 }}>✓</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function VariantToggle({ selected, onChange }: { selected: "original" | "spicy"; onChange: (v: "original" | "spicy") => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      {(["original", "spicy"] as const).map(v => {
        const active = selected === v
        return (
          <motion.button key={v} onClick={() => onChange(v)} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
            style={{ padding: "6px 16px", borderRadius: 30, border: active ? "1.5px solid #f5c842" : "1.5px solid rgba(240,237,232,0.12)", background: active ? "rgba(245,200,66,0.12)" : "rgba(240,237,232,0.04)", color: active ? (v === "spicy" ? "#f97316" : "#f5c842") : "rgba(240,237,232,0.45)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
            {v === "spicy" ? "Spicy" : "Original"}
          </motion.button>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────
   ORDER DRAWER
───────────────────────────────────────────── */
function OrderDrawer({ cart, onClose, onRemove, onChangeQty, onClear, onCheckout }: {
  cart: CartItem[]; onClose: () => void; onRemove: (id: number) => void
  onChangeQty: (id: number, delta: number) => void; onClear: () => void; onCheckout: () => void
}) {
  const total    = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0)
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }} onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, backdropFilter: "blur(8px)" }} />
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={SPG}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "#151210", zIndex: 300, display: "flex", flexDirection: "column", boxShadow: "-24px 0 80px rgba(0,0,0,0.5)", borderLeft: "1px solid rgba(240,237,232,0.07)" }}
      >
        <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(240,237,232,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f0ede8", margin: 0, fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}>Your Order</h2>
            <p style={{ fontSize: 12, color: "rgba(240,237,232,0.35)", margin: "4px 0 0" }}>{totalQty} item{totalQty !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SP} onClick={onClear}
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Clear
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }} transition={SP} onClick={onClose}
              style={{ background: "rgba(240,237,232,0.07)", border: "1px solid rgba(240,237,232,0.1)", color: "rgba(240,237,232,0.6)", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>
              ×
            </motion.button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 32px" }}>
          <AnimatePresence initial={false}>
            {cart.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPG} style={{ textAlign: "center", paddingTop: 88 }}>
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 3.0, ease: "easeInOut" }} style={{ fontSize: 44, marginBottom: 18 }}>🍗</motion.div>
                <p style={{ color: "rgba(240,237,232,0.25)", fontSize: 14, fontWeight: 400, lineHeight: 1.75 }}>Your order is empty.<br />Add something delicious!</p>
              </motion.div>
            ) : (
              cart.map((item, idx) => (
                <motion.div key={item.recipe.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28, transition: { duration: 0.18 } }} transition={{ ...SPG, delay: idx * 0.04 }}
                  style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 0", borderBottom: "1px solid rgba(240,237,232,0.06)" }}>
                  <div style={{ width: 50, height: 50, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "1px solid rgba(240,237,232,0.08)" }}>
                    <img src={item.recipe.image} alt={item.recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#f0ede8", margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.recipe.name}</p>
                    {item.flavors.length > 0 && (
                      <p style={{ fontSize: 11, color: "rgba(240,237,232,0.35)", margin: "0 0 10px" }}>{item.flavors.join(" · ")}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(240,237,232,0.06)", borderRadius: 10, padding: "5px 12px", border: "1px solid rgba(240,237,232,0.08)" }}>
                        <motion.button whileTap={{ scale: 0.75 }} transition={SP} onClick={() => onChangeQty(item.recipe.id, -1)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,237,232,0.6)", fontSize: 16, lineHeight: 1, padding: 0, fontWeight: 700 }}>−</motion.button>
                        <AnimatePresence mode="wait">
                          <motion.span key={item.quantity} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={SP} style={{ fontSize: 13, fontWeight: 700, color: "#f0ede8", minWidth: 14, textAlign: "center" as const }}>{item.quantity}</motion.span>
                        </AnimatePresence>
                        <motion.button whileTap={{ scale: 0.75 }} transition={SP} onClick={() => onChangeQty(item.recipe.id, 1)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,237,232,0.6)", fontSize: 16, lineHeight: 1, padding: 0, fontWeight: 700 }}>+</motion.button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <AnimatePresence mode="wait">
                          <motion.span key={item.quantity} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={SPG} style={{ fontSize: 14, fontWeight: 700, color: "#f5c842" }}>₱{(item.recipe.price * item.quantity).toFixed(2)}</motion.span>
                        </AnimatePresence>
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }} transition={SP} onClick={() => onRemove(item.recipe.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(240,237,232,0.2)", fontSize: 16, lineHeight: 1, padding: 0 }}>×</motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {cart.length > 0 && (
            <motion.div key="footer" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={SPG} style={{ padding: "20px 32px 36px", borderTop: "1px solid rgba(240,237,232,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ fontSize: 13, color: "rgba(240,237,232,0.4)" }}>Total</span>
                <AnimatePresence mode="wait">
                  <motion.span key={Math.round(total * 100)} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={SPG} style={{ fontSize: 28, fontWeight: 900, color: "#f5c842", letterSpacing: "-0.03em", fontFamily: "'Inter', sans-serif" }}>₱{total.toFixed(2)}</motion.span>
                </AnimatePresence>
              </div>
              <motion.button whileHover={{ scale: 1.02, backgroundColor: "#e6b800" }} whileTap={{ scale: 0.97 }} transition={SP} onClick={onCheckout}
                style={{ width: "100%", background: "#f5c842", color: "#111", border: "none", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em", transition: "background 0.2s" }}>
                Place Order
              </motion.button>
              <p style={{ textAlign: "center" as const, fontSize: 11, color: "rgba(240,237,232,0.22)", marginTop: 12 }}>Dine-in · Take-out · Pay at counter</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

/* ─────────────────────────────────────────────
   CHECKOUT MODAL
───────────────────────────────────────────── */
function CheckoutModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 400, backdropFilter: "blur(12px)" }} onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.88, y: 32 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ ...SPG, delay: 0.04 }}
        style={{ position: "fixed", top: "30%", left: "40%", transform: "translate(-50%, -50%)", background: "#151210", borderRadius: 28, padding: "52px 44px", zIndex: 500, textAlign: "center" as const, maxWidth: 360, width: "90%", boxShadow: "0 40px 80px rgba(0,0,0,0.5)", border: "1px solid rgba(240,237,232,0.08)" }}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.18, type: "spring", stiffness: 280, damping: 20 }}
          style={{ width: 72, height: 72, borderRadius: "50%", background: "#f5c842", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 8px 28px rgba(245,200,66,0.3)", fontSize: 30 }}>✓</motion.div>
        <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, ...SPG }}
          style={{ fontSize: 24, fontWeight: 800, color: "#f0ede8", marginBottom: 10, letterSpacing: "-0.02em", fontFamily: "'Inter', sans-serif" }}>Order Placed!</motion.h2>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.30, ...SPG }}
          style={{ fontSize: 14, color: "rgba(240,237,232,0.5)", lineHeight: 1.75, marginBottom: 32, fontWeight: 300 }}>Thank you! We're getting everything fresh and crispy for you.</motion.p>
        <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36, ...SPG }}
          whileHover={{ scale: 1.04, backgroundColor: "#e6b800" }} whileTap={{ scale: 0.96 }} onClick={onClose}
          style={{ background: "#f5c842", color: "#111", border: "none", borderRadius: 12, padding: "13px 40px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "background 0.2s", letterSpacing: "0.02em" }}>
          Back to Menu
        </motion.button>
      </motion.div>
    </>
  )
}

/* ─────────────────────────────────────────────
   RECIPE CARD
───────────────────────────────────────────── */
function RecipeCard({ recipe, isFav, justAdded, flavorSel, variantSel, onToggleFav, onAddToCart, onFlavorChange, onVariantChange }: {
  recipe: Recipe; isFav: boolean; justAdded: boolean; flavorSel: string[]
  variantSel: "original" | "spicy"; onToggleFav: () => void; onAddToCart: () => void
  onFlavorChange: (f: string[]) => void; onVariantChange: (v: "original" | "spicy") => void
}) {
  const tagStyle = recipe.tag ? (TAG_COLORS[recipe.tag] ?? null) : null
  return (
    <motion.div layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={SPG}
      whileHover={{ borderColor: "rgba(245,200,66,0.22)" }}
      style={{ background: "#151210", borderRadius: 24, padding: "32px 36px", border: "1px solid rgba(240,237,232,0.07)", display: "flex", gap: 40, alignItems: "flex-start", transition: "border-color 0.3s", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 32, right: 32, height: 2, background: "linear-gradient(90deg, transparent, rgba(245,200,66,0.18), transparent)", borderRadius: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f0ede8", margin: 0, lineHeight: 1.28, letterSpacing: "-0.02em", flex: 1, fontFamily: "'Inter', sans-serif" }}>{recipe.name}</h2>
          {tagStyle && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: tagStyle.bg, color: tagStyle.text, whiteSpace: "nowrap" as const, letterSpacing: "0.06em", textTransform: "uppercase" as const, flexShrink: 0, marginTop: 3, border: `1px solid ${tagStyle.text}28` }}>
              {recipe.tag}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: "rgba(240,237,232,0.42)", lineHeight: 1.7, marginBottom: recipe.note ? 6 : 20, fontWeight: 300 }}>{recipe.description}</p>
        {recipe.note && <p style={{ fontSize: 11, color: "#f5c842", fontWeight: 600, marginBottom: 18, letterSpacing: "0.02em" }}>{recipe.note}</p>}
        <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(240,237,232,0.2)", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>Nutrition</p>
        <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
          {[
            { label: "Cal",     unit: "kcal", value: recipe.nutrition.calories },
            { label: "Protein", unit: "g",    value: recipe.nutrition.protein  },
            { label: "Fats",    unit: "g",    value: recipe.nutrition.fats     },
            { label: "Carbs",   unit: "g",    value: recipe.nutrition.carbs    },
          ].map(n => (
            <div key={n.label} style={{ textAlign: "center" as const }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f0ede8", letterSpacing: "-0.04em", lineHeight: 1 }}>{n.value}</div>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: "rgba(240,237,232,0.35)", marginTop: 3 }}>{n.label}</div>
              <div style={{ fontSize: 9, color: "rgba(240,237,232,0.2)" }}>{n.unit}</div>
            </div>
          ))}
        </div>
        {recipe.variant !== undefined && <VariantToggle selected={variantSel} onChange={onVariantChange} />}
        {recipe.maxFlavors !== undefined && <FlavorPicker maxFlavors={recipe.maxFlavors} selected={flavorSel} onChange={onFlavorChange} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <motion.button onClick={onToggleFav} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
              style={{ display: "flex", alignItems: "center", gap: 7, background: isFav ? "rgba(245,200,66,0.1)" : "rgba(240,237,232,0.05)", color: isFav ? "#f5c842" : "rgba(240,237,232,0.45)", border: `1px solid ${isFav ? "rgba(245,200,66,0.3)" : "rgba(240,237,232,0.1)"}`, borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
              {isFav ? "★ Saved" : "☆ Save"}
            </motion.button>
            <motion.button onClick={onAddToCart} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
              style={{ display: "flex", alignItems: "center", gap: 7, background: justAdded ? "rgba(74,222,128,0.1)" : "#f5c842", color: justAdded ? "#4ade80" : "#111", border: justAdded ? "1px solid rgba(74,222,128,0.25)" : "none", borderRadius: 12, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minWidth: 148, justifyContent: "center", transition: "all 0.25s" }}>
              <AnimatePresence mode="wait">
                {justAdded
                  ? <motion.span key="added" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SP}>Added!</motion.span>
                  : <motion.span key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SP}>Add to Order</motion.span>
                }
              </AnimatePresence>
            </motion.button>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: "rgba(240,237,232,0.25)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 }}>Price</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#f5c842", letterSpacing: "-0.04em", fontFamily: "'Inter', sans-serif" }}>₱{recipe.price.toFixed(2)}</div>
          </div>
        </div>
      </div>
      <motion.div whileHover={{ scale: 1.05 }} transition={SPG}
        style={{ width: 200, height: 200, borderRadius: "50%", overflow: "hidden", flexShrink: 0, boxShadow: "0 12px 48px rgba(0,0,0,0.45)", marginTop: 4, border: "1px solid rgba(240,237,232,0.08)" }}>
        <img src={recipe.image} alt={recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.96) saturate(1.1)" }} />
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function Delicacy() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState("Chicken")
  const [activeMeal,     setActiveMeal]     = useState("Lunch")
  const [favorites,      setFavorites]      = useState<number[]>([])
  const [flavorSels,     setFlavorSels]     = useState<Record<number, string[]>>({})
  const [variantSels,    setVariantSels]    = useState<Record<number, "original" | "spicy">>({})
  const [cart,           setCart]           = useState<CartItem[]>([])
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [historyOpen,    setHistoryOpen]    = useState(false)
  const [showCheckout,   setShowCheckout]   = useState(false)
  const [justAdded,      setJustAdded]      = useState<number | null>(null)
  const [highlightedId,  setHighlightedId]  = useState<number | null>(null)
  const [scrolled,       setScrolled]       = useState(false)
  /* In-session order history — populated only when Place Order is confirmed */
  const [orderHistory,   setOrderHistory]   = useState<HistoryOrder[]>([])
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const allInCategory: Recipe[] = activeCategory === "All"
    ? Object.values(RECIPES).flat()
    : RECIPES[activeCategory] ?? []

  const displayed  = allInCategory.filter(r => r.mealTypes.includes(activeMeal))
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", fn)
    return () => window.removeEventListener("scroll", fn)
  }, [])

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const itemSlug = params.get("item")
    if (!itemSlug) return

    const needle     = decodeURIComponent(itemSlug).trim().toLowerCase()
    const allRecipes = Object.values(RECIPES).flat()

    let match = allRecipes.find(r => r.name.trim().toLowerCase() === needle)
    if (!match) match = allRecipes.find(r => r.name.trim().toLowerCase().includes(needle) || needle.includes(r.name.trim().toLowerCase()))
    if (!match) return

    const matchCategory = Object.entries(RECIPES).find(([, recipes]) =>
      recipes.some(r => r.id === match!.id)
    )?.[0] ?? "All"

    setActiveCategory(matchCategory)
    setActiveMeal(match.mealTypes[0] ?? "Lunch")

    setTimeout(() => {
      const el = cardRefs.current[match!.id]
      if (el) {
        const rect   = el.getBoundingClientRect()
        const offset = rect.top + window.scrollY - (window.innerHeight / 2) + (rect.height / 2)
        window.scrollTo({ top: offset, behavior: "smooth" })
      }
      setTimeout(() => {
        setHighlightedId(match!.id)
        setTimeout(() => setHighlightedId(null), 3200)
      }, 600)
    }, 480)
  }, [])

  const toggleFav = (id: number) =>
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])

  const addToCart = (recipe: Recipe) => {
    const flavors = flavorSels[recipe.id] ?? []
    setCart(prev => {
      const found = prev.find(c => c.recipe.id === recipe.id)
      if (found) return prev.map(c => c.recipe.id === recipe.id ? { ...c, quantity: c.quantity + 1, flavors } : c)
      return [...prev, { recipe, quantity: 1, flavors }]
    })
    setJustAdded(recipe.id)
    setTimeout(() => setJustAdded(null), 1400)
  }

  const removeFromCart = (id: number) => setCart(prev => prev.filter(c => c.recipe.id !== id))
  const changeQty      = (id: number, delta: number) =>
    setCart(prev => prev.map(c => c.recipe.id === id ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0))
  const clearCart = () => setCart([])

  /* Checkout — snapshot the current cart into history, then clear it */
  const handleCheckout = () => {
    const snapshot: HistoryOrder = {
      id:    `order-${Date.now()}`,
      date:  new Date(),
      items: cart.map(c => ({ ...c })),
      total: cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0),
    }
    setOrderHistory(prev => [snapshot, ...prev])
    setDrawerOpen(false)
    setTimeout(() => { setShowCheckout(true); setCart([]) }, 320)
  }

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated")
    localStorage.removeItem("authToken")
    localStorage.removeItem("userName")
    localStorage.removeItem("userRole")
    localStorage.removeItem("userId")
    navigate("/aboutthecrunch")
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0e0c0a", minHeight: "100vh", paddingBottom: 120, color: "#f0ede8" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Ambient glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-8%", left: "10%",    width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle,rgba(245,200,66,0.05) 0%,transparent 65%)" }} />
        <div style={{ position: "absolute", top: "45%", right: "-8%",   width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle,rgba(245,200,66,0.03) 0%,transparent 65%)" }} />
        <div style={{ position: "absolute", bottom: "-8%", left: "30%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(245,200,66,0.04) 0%,transparent 65%)" }} />
      </div>

      {/* ── NAV BAR ── */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.65, ease: EASE }}
        style={{ position: "sticky", top: 0, zIndex: 100, background: scrolled ? "rgba(14,12,10,0.96)" : "rgba(14,12,10,0.80)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(240,237,232,0.07)", padding: "0 40px", height: 68, display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.4s ease" }}
      >
        {/* Logo */}
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={SP}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 900, color: "#f0ede8", letterSpacing: "-0.03em", lineHeight: 1 }}>
            The <span style={{ color: "#f5c842" }}>Crunch</span>
          </span>
        </motion.button>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Nav links */}
          {NAV_LINKS.map((item) => (
            <motion.button key={item.label} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={SP}
              onClick={() => navigate(item.path)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13.5, fontWeight: 500, color: "rgba(240,237,232,0.45)", padding: "7px 14px", borderRadius: 8, transition: "color 0.2s, background 0.2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#f0ede8"; e.currentTarget.style.background = "rgba(240,237,232,0.07)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(240,237,232,0.45)"; e.currentTarget.style.background = "transparent" }}>
              {item.label}
            </motion.button>
          ))}

          <div style={{ width: 1, height: 16, background: "rgba(240,237,232,0.12)", margin: "0 6px" }} />

          {/* History icon button */}
          <motion.button
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} transition={SP}
            onClick={() => setHistoryOpen(true)}
            title="Order History"
            style={{ position: "relative", background: orderHistory.length > 0 ? "rgba(245,200,66,0.08)" : "rgba(240,237,232,0.06)", border: `1px solid ${orderHistory.length > 0 ? "rgba(245,200,66,0.25)" : "rgba(240,237,232,0.12)"}`, color: orderHistory.length > 0 ? "#f5c842" : "rgba(240,237,232,0.42)", borderRadius: 10, width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.22s", flexShrink: 0 }}
          >
            <IconHistory />
            {/* Count badge */}
            <AnimatePresence>
              {orderHistory.length > 0 && (
                <motion.span key="hbadge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                  style={{ position: "absolute", top: -5, right: -5, background: "#f5c842", color: "#111", borderRadius: 20, minWidth: 16, height: 16, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", pointerEvents: "none" }}>
                  {orderHistory.length}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* My Order button */}
          <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} transition={SP}
            onClick={() => setDrawerOpen(true)}
            style={{ position: "relative", background: "#f5c842", color: "#111", border: "none", borderRadius: 10, padding: "9px 20px", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.02em" }}>
            My Order
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                  style={{ background: "#111", color: "#f5c842", borderRadius: 20, minWidth: 20, height: 20, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                  <AnimatePresence mode="wait">
                    <motion.span key={totalItems} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={SP}>{totalItems}</motion.span>
                  </AnimatePresence>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Log Out */}
          <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} transition={SP} onClick={handleLogout}
            style={{ background: "rgba(240,237,232,0.06)", color: "#f0ede8", border: "1px solid rgba(240,237,232,0.12)", borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: "0.02em" }}>
            Log Out
          </motion.button>
        </div>
      </motion.nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "52px 40px 0", position: "relative", zIndex: 1 }}>

        {/* ── TITLE ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.75, ease: EASE }} style={{ marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 1, background: "#f5c842" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#f5c842", letterSpacing: "0.25em", textTransform: "uppercase" as const }}>The Crunch Fairview</span>
          </div>
          <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: "clamp(40px,5.5vw,68px)", fontWeight: 900, color: "#f0ede8", margin: 0, letterSpacing: "-0.025em", lineHeight: 1.02 }}>
            Our <em style={{ color: "#f5c842" }}>Menu.</em>
          </h1>
        </motion.div>

        {/* ── CATEGORY TABS ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.65, ease: EASE }}
          style={{ display: "flex", gap: 0, marginBottom: 48, borderBottom: "1px solid rgba(240,237,232,0.07)", overflowX: "auto" }}>
          {CATEGORIES.map(cat => (
            <motion.button key={cat} onClick={() => setActiveCategory(cat)} whileTap={{ scale: 0.95 }} transition={SP}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: activeCategory === cat ? 700 : 400, color: activeCategory === cat ? "#f5c842" : "rgba(240,237,232,0.3)", padding: "13px 22px", position: "relative", transition: "color 0.22s", whiteSpace: "nowrap" as const }}>
              {cat}
              {activeCategory === cat && (
                <motion.div layoutId="catTab" transition={SPG} style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "#f5c842", borderRadius: 2 }} />
              )}
            </motion.button>
          ))}
        </motion.div>

        <div style={{ display: "flex", gap: 36 }}>

          {/* ── MEAL TYPE SIDEBAR ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 44, paddingTop: 8, minWidth: 64, alignItems: "center", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(240,237,232,0.06)", transform: "translateX(-50%)" }} />
            {MEAL_TYPES.map((meal, mi) => (
              <motion.button key={meal}
                initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.22 + mi * 0.07 }}
                onClick={() => setActiveMeal(meal)} whileHover={{ x: 2 }} whileTap={{ scale: 0.9 }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 0, padding: 0, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 11.5, fontWeight: activeMeal === meal ? 700 : 400, color: activeMeal === meal ? "#f5c842" : "rgba(240,237,232,0.22)", writingMode: "vertical-rl" as const, transform: "rotate(180deg)", letterSpacing: "0.1em", transition: "color 0.25s" }}>
                  {meal}
                </span>
                <AnimatePresence>
                  {activeMeal === meal && (
                    <motion.div layoutId="mealDot" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                      style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 5, height: 5, borderRadius: "50%", background: "#f5c842" }} />
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>

          {/* ── RECIPE CARDS ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            <AnimatePresence mode="popLayout">
              {displayed.length > 0 ? (
                displayed.map(recipe => {
                  const isHighlighted = highlightedId === recipe.id
                  return (
                    <div
                      key={`${recipe.id}-${activeMeal}-${activeCategory}`}
                      ref={(el: HTMLDivElement | null) => { cardRefs.current[recipe.id] = el }}
                      style={{ position: "relative" }}
                    >
                      <AnimatePresence>
                        {isHighlighted && (
                          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: [0, 1, 0.7, 1, 0.5, 0], scale: [0.96, 1.015, 1.01, 1.015, 1.01, 1] }} exit={{ opacity: 0 }} transition={{ duration: 2.8, ease: "easeInOut" }}
                            style={{ position: "absolute", inset: -4, borderRadius: 28, border: "2px solid rgba(245,200,66,0.8)", boxShadow: "0 0 0 4px rgba(245,200,66,0.15), 0 0 48px rgba(245,200,66,0.3)", pointerEvents: "none", zIndex: 10 }} />
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {isHighlighted && (
                          <motion.div initial={{ x: "-100%", opacity: 0.7 }} animate={{ x: "200%", opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.85, ease: "easeOut", delay: 0.1 }}
                            style={{ position: "absolute", inset: 0, borderRadius: 24, background: "linear-gradient(105deg, transparent 20%, rgba(245,200,66,0.18) 50%, transparent 80%)", pointerEvents: "none", zIndex: 11 }} />
                        )}
                      </AnimatePresence>
                      <AnimatePresence>
                        {isHighlighted && (
                          <motion.div initial={{ opacity: 0, y: -12, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.9 }} transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.2 }}
                            style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "#f5c842", color: "#111", fontSize: 11, fontWeight: 800, padding: "5px 16px", borderRadius: 30, letterSpacing: "0.06em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const, boxShadow: "0 4px 20px rgba(245,200,66,0.5)", zIndex: 20, pointerEvents: "none" }}>
                            ✦ Tap to Order
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <motion.div animate={isHighlighted ? { scale: [1, 1.012, 1.008, 1.012, 1] } : { scale: 1 }} transition={{ duration: 2.4, ease: "easeInOut" }} style={{ borderRadius: 24 }}>
                        <RecipeCard
                          recipe={recipe}
                          isFav={favorites.includes(recipe.id)}
                          justAdded={justAdded === recipe.id}
                          flavorSel={flavorSels[recipe.id] ?? []}
                          variantSel={variantSels[recipe.id] ?? "original"}
                          onToggleFav={() => toggleFav(recipe.id)}
                          onAddToCart={() => addToCart(recipe)}
                          onFlavorChange={f => setFlavorSels(prev => ({ ...prev, [recipe.id]: f }))}
                          onVariantChange={v => setVariantSels(prev => ({ ...prev, [recipe.id]: v }))}
                        />
                      </motion.div>
                    </div>
                  )
                })
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPG}
                  style={{ textAlign: "center", padding: "88px 0", color: "rgba(240,237,232,0.2)", fontSize: 14, fontWeight: 400 }}>
                  No items for {activeMeal} in this category.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── SIDE DISHES ── */}
        <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: EASE, delay: 0.42 }} style={{ marginTop: 72 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={{ width: 28, height: 1, background: "#f5c842" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#f5c842", letterSpacing: "0.25em", textTransform: "uppercase" as const }}>Quick Add</span>
          </div>
          <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 800, color: "#f0ede8", margin: "0 0 28px", letterSpacing: "-0.02em" }}>Side Dishes</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
            {MORE_RECIPES.map((r, i) => (
              <motion.div key={r.name}
                initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.46 + i * 0.07 }}
                whileHover={{ y: -7, borderColor: "rgba(245,200,66,0.25)" }} whileTap={{ scale: 0.97 }}
                style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", cursor: "pointer", background: "#151210", borderRadius: 22, padding: "22px 24px", minWidth: 126, border: "1px solid rgba(240,237,232,0.07)", transition: "border-color 0.3s", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 12, right: 12, height: 1, background: "linear-gradient(90deg, transparent, rgba(245,200,66,0.15), transparent)" }} />
                <motion.div whileHover={{ scale: 1.08 }} transition={SPG} style={{ width: 70, height: 70, borderRadius: "50%", overflow: "hidden", marginBottom: 14, border: "1px solid rgba(240,237,232,0.08)" }}>
                  <img src={r.img} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </motion.div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#f0ede8", marginBottom: 4, textAlign: "center" as const }}>{r.name}</span>
                <span style={{ fontSize: 10, color: "rgba(240,237,232,0.3)", fontWeight: 400 }}>{r.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── DRAWERS & MODALS ── */}
      <AnimatePresence>
        {drawerOpen && (
          <OrderDrawer cart={cart} onClose={() => setDrawerOpen(false)} onRemove={removeFromCart} onChangeQty={changeQty} onClear={clearCart} onCheckout={handleCheckout} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyOpen && (
          <HistoryDrawer orders={orderHistory} onClose={() => setHistoryOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCheckout && <CheckoutModal onClose={() => setShowCheckout(false)} />}
      </AnimatePresence>
    </div>
  )
}