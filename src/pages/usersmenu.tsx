import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShoppingBag, Heart, X, Minus, Plus, Trash2, CheckCircle } from "lucide-react"

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Nutrition {
  calories: number
  protein:  number
  fats:     number
  carbs:    number
}

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
}

interface MoreRecipe {
  name: string
  time: string
  img:  string
}

interface CartItem {
  recipe:   Recipe
  quantity: number
  flavors:  string[]
}

interface NutritionStat {
  label: string
  unit:  string
  value: number
}

interface TagStyle {
  bg:   string
  text: string
}

/* ─────────────────────────────────────────────
   MOTION PRESETS
───────────────────────────────────────────── */
const SP  = { type: "spring" as const, stiffness: 340, damping: 30 }
const SPG = { type: "spring" as const, stiffness: 200, damping: 24 }

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const FLAVORS: string[] = [
  "Classic", "Honey Garlic", "Teriyaki",
  "Texas BBQ", "Garlic Parmesan", "K-Style", "Spicy K-Style",
]

const RECIPES: Record<string, Recipe[]> = {
  Chicken: [
    { id: 1,  name: "Whole Crispy Fried Chicken",          description: "12 pcs | Perfect for 4–6 pax. Choice of 2 Flavors.",       image: "https://bit.ly/4ckRqHY",  nutrition: { calories: 350, protein: 15, fats: 25, carbs: 90 }, price: 598, maxFlavors: 2, mealTypes: ["Lunch","Dinner"],            tag: "Bestseller" },
    { id: 2,  name: "Half Crispy Fried Chicken",           description: "6 pcs | Perfect for 2–3 pax. Choice of 1 Flavor.",         image: "https://bit.ly/3P8sz0j",  nutrition: { calories: 310, protein: 13, fats: 22, carbs: 80 }, price: 328, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 3,  name: "Crispy Chicken Shots with Drink",     description: "Good for 1 pax.",                                          image: "https://bit.ly/40Z9n7T",  nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 }, price: 128, maxFlavors: 1, mealTypes: ["Breakfast","Lunch","Dinner"], tag: "Hot" },
    { id: 4,  name: "Chicken Skin with Rice and Drink",    description: "Solo Meal.",                                               image: "https://bit.ly/3P6DcAK",  nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 118, maxFlavors: 1, mealTypes: ["Breakfast","Lunch"] },
    { id: 5,  name: "2 pcs. Chicken With Rice and Drink",  description: "Solo Meal.",                                               image: "https://bit.ly/4r5rfZI",  nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 188, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 6,  name: "3 pcs. Chicken With Rice and Drink",  description: "Good for 1 pax.",                                          image: "https://bit.ly/4r1CAtC",  nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 228, maxFlavors: 1, mealTypes: ["Lunch","Dinner"],            tag: "Fan Fave" },
  ],
  Drinks: [
    { id: 7,  name: "Kiwi Ice Blended",                    description: "Chilled to perfection — bright, citrusy, slightly creamy.", image: "https://i.pinimg.com/1200x/3e/04/b8/3e04b89327ef2c1b50ee0e5b94068aaa.jpg", nutrition: { calories: 180, protein: 3, fats: 2, carbs: 44 }, price: 79, mealTypes: ["Breakfast","Lunch","Dinner"] },
  ],
  Burger: [
    { id: 8,  name: "Chicken Burger with Cheese",          description: "Crispy chicken on a toasted bun with fresh lettuce & tangy sauce.", image: "https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg", nutrition: { calories: 520, protein: 22, fats: 18, carbs: 68 }, price: 149, mealTypes: ["Breakfast","Lunch"], tag: "Must Try" },
  ],
  Chips: [
    { id: 9,  name: "Crispy Potato Chips",                 description: "Evenly seasoned — rich, savory, and impossible to put down.", image: "https://i.pinimg.com/736x/a4/a5/cd/a4a5cd6b777e7bb789ee02288b6eb4d2.jpg", nutrition: { calories: 480, protein: 28, fats: 16, carbs: 58 }, price: 69, mealTypes: ["Breakfast","Lunch","Dinner"] },
  ],
  Alacarte: [
    { id: 10, name: "Crispy Chicken Shots",                description: "Solo Meal.",                                               image: "https://static.wixstatic.com/media/d2b544_0a6506e217624c37a1c251bb0e9db0c5~mv2.png/v1/crop/x_0,y_65,w_1042,h_913/fill/w_835,h_732,al_c,q_90,usm_0.66_1.00_0.01,enc_auto/Copy%20of%20Untitled_20250305_163643_0000-20.png", nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 }, price: 88,  maxFlavors: 1, mealTypes: ["Breakfast","Lunch","Dinner"] },
    { id: 11, name: "Chicken Skin with Rice & Drink",      description: "Solo Meal.",                                               image: "https://bit.ly/3P6DcAK",  nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 78,  maxFlavors: 1, mealTypes: ["Breakfast","Lunch"] },
    { id: 12, name: "2 pcs. Chicken With Rice & Drink",    description: "Solo Meal.",                                               image: "https://bit.ly/4r5rfZI",  nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 148, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
    { id: 13, name: "3 pcs. Chicken With Rice & Drink",    description: "Solo Meal.",                                               image: "https://bit.ly/4r1CAtC",  nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5  }, price: 188, maxFlavors: 1, mealTypes: ["Lunch","Dinner"] },
  ],
}

const MORE_RECIPES: MoreRecipe[] = [
  { name: "Twister Fries", time: "5 min",  img: "https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg" },
  { name: "Regular Fries", time: "5 min",  img: "https://i.pinimg.com/1200x/95/02/12/9502126d74d78185aca0697e53c91197.jpg" },
  { name: "Tteokbokki",    time: "15 min", img: "https://bit.ly/3MMEeRT" },
  { name: "Fish Cake",     time: "5 min",  img: "https://bit.ly/4s9ZvUC" },
  { name: "Kimchi",        time: "5 min",  img: "https://bit.ly/47bPoX5" },
]

const CATEGORIES  = ["All", "Chicken", "Burger", "Drinks", "Chips", "Alacarte"]
const MEAL_TYPES  = ["Breakfast", "Lunch", "Dinner"]

const TAG_COLORS: Record<string, TagStyle> = {
  "Bestseller": { bg: "rgba(249,115,22,0.1)", text: "#f97316" },
  "Hot":        { bg: "rgba(239,68,68,0.1)",  text: "#ef4444" },
  "Fan Fave":   { bg: "rgba(34,197,94,0.1)",  text: "#16a34a" },
  "Must Try":   { bg: "rgba(139,92,246,0.1)", text: "#8b5cf6" },
}

/* ─────────────────────────────────────────────
   FLAVOR PICKER
───────────────────────────────────────────── */
function FlavorPicker({
  maxFlavors,
  selected,
  onChange,
}: {
  maxFlavors: number
  selected:   string[]
  onChange:   (f: string[]) => void
}) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(f => f !== name))
    else if (selected.length < maxFlavors) onChange([...selected, name])
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
              whileTap={disabled   ? {} : { scale: 0.93 }}
              transition={SP}
              style={{
                padding:      "6px 14px",
                borderRadius: 30,
                border:  active ? "1.5px solid #111827" : "1.5px solid #e5e7eb",
                background:   active ? "#111827" : "#fafafa",
                color:  active ? "#fff" : disabled ? "#d1d5db" : "#4b5563",
                fontSize:     11.5,
                fontWeight:   600,
                cursor:       disabled ? "not-allowed" : "pointer",
                fontFamily:   "inherit",
                opacity:      disabled ? 0.4 : 1,
                display:      "flex",
                alignItems:   "center",
                gap:          5,
                transition:   "all 0.2s",
              }}
            >
              {name}
              <AnimatePresence>
                {active && (
                  <motion.span
                    key="tick"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={SP}
                    style={{ fontSize: 9 }}
                  >✓</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   ORDER DRAWER
───────────────────────────────────────────── */
function OrderDrawer({
  cart,
  onClose,
  onRemove,
  onChangeQty,
  onClear,
  onCheckout,
}: {
  cart:        CartItem[]
  onClose:     () => void
  onRemove:    (id: number) => void
  onChangeQty: (id: number, delta: number) => void
  onClear:     () => void
  onCheckout:  () => void
}) {
  const total    = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0)
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.28 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 200, backdropFilter: "blur(6px)" }}
      />

      {/* Drawer panel */}
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={SPG}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "#fff", zIndex: 300, display: "flex", flexDirection: "column", boxShadow: "-16px 0 60px rgba(0,0,0,0.08)" }}
      >
        {/* Header */}
        <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0, letterSpacing: "-0.3px" }}>Your Order</h2>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0" }}>
              {totalQty} item{totalQty !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  transition={SP}
                  onClick={onClear}
                  style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 10, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <Trash2 size={12} /> Clear
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} transition={SP}
              onClick={onClose}
              style={{ background: "#f9fafb", border: "1px solid #e5e7eb", color: "#6b7280", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <X size={16} />
            </motion.button>
          </div>
        </div>

        {/* Items list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 32px" }}>
          <AnimatePresence initial={false}>
            {cart.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={SPG}
                style={{ textAlign: "center", paddingTop: 80 }}
              >
                <motion.div
                  animate={{ y: [0,-7,0] }}
                  transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
                  style={{ fontSize: 52, marginBottom: 16 }}
                >🛍️</motion.div>
                <p style={{ color: "#d1d5db", fontSize: 14, fontWeight: 500, lineHeight: 1.75 }}>
                  Your order is empty.<br />Add something delicious!
                </p>
              </motion.div>
            ) : (
              cart.map((item, idx) => (
                <motion.div
                  key={item.recipe.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 28, transition: { duration: 0.18 } }}
                  transition={{ ...SPG, delay: idx * 0.04 }}
                  style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderBottom: "1px solid #f9fafb" }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
                    <img src={item.recipe.image} alt={item.recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.recipe.name}
                    </p>
                    {item.flavors.length > 0 && (
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>
                        {item.flavors.join(" · ")}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {/* Stepper */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", borderRadius: 10, padding: "5px 10px", border: "1px solid #f0f0f0" }}>
                        <motion.button whileTap={{ scale: 0.75 }} transition={SP} onClick={() => onChangeQty(item.recipe.id, -1)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", display: "flex", padding: 0 }}>
                          <Minus size={13} />
                        </motion.button>
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={item.quantity}
                            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                            transition={SP}
                            style={{ fontSize: 13, fontWeight: 700, color: "#111827", minWidth: 14, textAlign: "center" }}
                          >{item.quantity}</motion.span>
                        </AnimatePresence>
                        <motion.button whileTap={{ scale: 0.75 }} transition={SP} onClick={() => onChangeQty(item.recipe.id, 1)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#374151", display: "flex", padding: 0 }}>
                          <Plus size={13} />
                        </motion.button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={item.quantity}
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                            transition={SPG}
                            style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}
                          >₱{(item.recipe.price * item.quantity).toFixed(2)}</motion.span>
                        </AnimatePresence>
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }} transition={SP}
                          onClick={() => onRemove(item.recipe.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#e5e7eb", display: "flex", padding: 0 }}>
                          <Trash2 size={14} />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <AnimatePresence>
          {cart.length > 0 && (
            <motion.div
              key="footer"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              transition={SPG}
              style={{ padding: "20px 32px 32px", borderTop: "1px solid #f3f4f6" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: "#6b7280" }}>Total</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={Math.round(total * 100)}
                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                    transition={SPG}
                    style={{ fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}
                  >₱{total.toFixed(2)}</motion.span>
                </AnimatePresence>
              </div>
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 12px 36px rgba(249,115,22,0.35)" }}
                whileTap={{ scale: 0.97 }} transition={SP}
                onClick={onCheckout}
                style={{ width: "100%", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", border: "none", borderRadius: 16, padding: "16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em", boxShadow: "0 4px 20px rgba(249,115,22,0.3)" }}
              >
                Place Order
              </motion.button>
              <p style={{ textAlign: "center", fontSize: 11, color: "#d1d5db", marginTop: 12 }}>
                Dine-in · Take-out · Pay at counter
              </p>
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
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 400, backdropFilter: "blur(10px)" }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 32 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 20 }}
        transition={{ ...SPG, delay: 0.04 }}
        style={{ position: "fixed", top: "30%", left: "40%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 32, padding: "52px 44px", zIndex: 500, textAlign: "center", maxWidth: 360, width: "90%", boxShadow: "0 40px 80px rgba(0,0,0,0.18)" }}
      >
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 280, damping: 20 }}
          style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 8px 24px rgba(249,115,22,0.35)" }}
        >
          <CheckCircle size={34} color="#fff" />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, ...SPG }}
          style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 10, letterSpacing: "-0.3px" }}
        >Order Placed!</motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.30, ...SPG }}
          style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.75, marginBottom: 28 }}
        >
          Thank you! We're getting everything fresh and crispy for you.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36, ...SPG }}
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={onClose}
          style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 14, padding: "13px 36px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
        >
          Back to Menu
        </motion.button>
      </motion.div>
    </>
  )
}

/* ─────────────────────────────────────────────
   RECIPE CARD
───────────────────────────────────────────── */
function RecipeCard({
  recipe,
  isFav,
  justAdded,
  flavorSel,
  onToggleFav,
  onAddToCart,
  onFlavorChange,
}: {
  recipe:         Recipe
  isFav:          boolean
  justAdded:      boolean
  flavorSel:      string[]
  onToggleFav:    () => void
  onAddToCart:    () => void
  onFlavorChange: (f: string[]) => void
}) {
  const stats: NutritionStat[] = [
    { label: "Calories", unit: "kcal", value: recipe.nutrition.calories },
    { label: "Protein",  unit: "g",    value: recipe.nutrition.protein  },
    { label: "Fats",     unit: "g",    value: recipe.nutrition.fats     },
    { label: "Carbs",    unit: "g",    value: recipe.nutrition.carbs    },
  ]

  const tagStyle: TagStyle | null = recipe.tag ? (TAG_COLORS[recipe.tag] ?? null) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={SPG}
      whileHover={{ boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}
      style={{
        background:    "#fff",
        borderRadius:  28,
        padding:       "32px 36px",
        boxShadow:     "0 2px 16px rgba(0,0,0,0.04)",
        display:       "flex",
        gap:           40,
        alignItems:    "flex-start",
        border:        "1px solid rgba(0,0,0,0.04)",
        transition:    "box-shadow 0.3s",
      }}
    >
      {/* Left */}
      <div style={{ flex: 1 }}>
        {/* Name + tag */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.3, letterSpacing: "-0.3px", flex: 1 }}>
            {recipe.name}
          </h2>
          {tagStyle && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: tagStyle.bg, color: tagStyle.text, whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase", flexShrink: 0, marginTop: 3 }}>
              {recipe.tag}
            </span>
          )}
        </div>

        <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7, marginBottom: 24 }}>
          {recipe.description}
        </p>

        {/* Nutrition */}
        <p style={{ fontSize: 10, fontWeight: 700, color: "#d1d5db", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Nutrition
        </p>
        <div style={{ display: "flex", gap: 20, marginBottom: 26 }}>
          {stats.map(n => (
            <div key={n.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}>{n.value}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", marginTop: 1 }}>{n.label}</div>
              <div style={{ fontSize: 9, color: "#d1d5db" }}>{n.unit}</div>
            </div>
          ))}
        </div>

        {/* Flavor picker */}
        {recipe.maxFlavors !== undefined && (
          <FlavorPicker
            maxFlavors={recipe.maxFlavors}
            selected={flavorSel}
            onChange={onFlavorChange}
          />
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <motion.button
              onClick={onToggleFav}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
              style={{ display: "flex", alignItems: "center", gap: 6, background: isFav ? "#fff7ed" : "#f9fafb", color: isFav ? "#f97316" : "#6b7280", border: `1px solid ${isFav ? "#fed7aa" : "#e5e7eb"}`, borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
            >
              <Heart size={14} fill={isFav ? "#f97316" : "none"} color={isFav ? "#f97316" : "#6b7280"} />
              {isFav ? "Saved" : "Save"}
            </motion.button>

            <motion.button
              onClick={onAddToCart}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.93 }} transition={SP}
              style={{ display: "flex", alignItems: "center", gap: 7, background: justAdded ? "#f0fdf4" : "#111827", color: justAdded ? "#16a34a" : "#fff", border: `1px solid ${justAdded ? "#bbf7d0" : "transparent"}`, borderRadius: 12, padding: "10px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", minWidth: 148, justifyContent: "center", transition: "all 0.25s" }}
            >
              <AnimatePresence mode="wait">
                {justAdded ? (
                  <motion.span key="added" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SP}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle size={14} /> Added!
                  </motion.span>
                ) : (
                  <motion.span key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SP}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ShoppingBag size={14} /> Add to Order
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* Price */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#d1d5db", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Price</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}>
              ₱{recipe.price.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Food image */}
      <motion.div
        whileHover={{ scale: 1.04 }} transition={SPG}
        style={{ width: 210, height: 210, borderRadius: "50%", overflow: "hidden", flexShrink: 0, boxShadow: "0 12px 40px rgba(0,0,0,0.1)", marginTop: 4 }}
      >
        <img
          src={recipe.image}
          alt={recipe.name}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.04) saturate(1.15)" }}
        />
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
export default function Delicacy() {
  const [activeCategory, setActiveCategory] = useState("Chicken")
  const [activeMeal,     setActiveMeal]     = useState("Lunch")
  const [favorites,      setFavorites]      = useState<number[]>([])
  const [flavorSels,     setFlavorSels]     = useState<Record<number, string[]>>({})
  const [cart,           setCart]           = useState<CartItem[]>([])
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [showCheckout,   setShowCheckout]   = useState(false)
  const [justAdded,      setJustAdded]      = useState<number | null>(null)

  const allInCategory: Recipe[] =
    activeCategory === "All"
      ? Object.values(RECIPES).flat()
      : RECIPES[activeCategory] ?? []

  const displayed  = allInCategory.filter(r => r.mealTypes.includes(activeMeal))
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0)

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

  const removeFromCart = (id: number) =>
    setCart(prev => prev.filter(c => c.recipe.id !== id))

  const changeQty = (id: number, delta: number) =>
    setCart(prev =>
      prev.map(c => c.recipe.id === id ? { ...c, quantity: c.quantity + delta } : c)
          .filter(c => c.quantity > 0)
    )

  const clearCart = () => setCart([])

  const handleCheckout = () => {
    setDrawerOpen(false)
    setTimeout(() => { setShowCheckout(true); setCart([]) }, 320)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Poppins', sans-serif", background: "#f7f8fc", minHeight: "100vh", paddingBottom: 100 }}>

      {/* Google Fonts loaded via CDN — not localized */}
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&family=Playfair+Display:wght@700;800;900&display=swap"
        rel="stylesheet"
      />

      {/* ── TOP BAR ── */}
      <motion.div
        initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPG, delay: 0.05 }}
        style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(247,248,252,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.05)", padding: "14px 40px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}
      >
        <motion.button
          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.88 }} transition={SP}
          onClick={() => setDrawerOpen(true)}
          style={{ position: "relative", background: "#111827", color: "#fff", border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", boxShadow: "0 4px 20px rgba(17,24,39,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ShoppingBag size={20} />
          <AnimatePresence>
            {totalItems > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                style={{ position: "absolute", top: -4, right: -4, background: "#f97316", color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #f7f8fc" }}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={totalItems}
                    initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                    transition={SP}
                  >{totalItems}</motion.span>
                </AnimatePresence>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px 0" }}>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, ...SPG }}
          style={{ marginBottom: 36 }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 8px" }}>
            The Crunch Fairview
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(40px,5vw,60px)", fontWeight: 900, color: "#111827", margin: 0, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Our Menu
          </h1>
        </motion.div>

        {/* Category tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ...SPG }}
          style={{ display: "flex", gap: 2, marginBottom: 44, borderBottom: "1px solid #e5e7eb" }}
        >
          {CATEGORIES.map(cat => (
            <motion.button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              whileTap={{ scale: 0.94 }} transition={SP}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: activeCategory === cat ? 700 : 400, color: activeCategory === cat ? "#111827" : "#9ca3af", padding: "12px 20px", position: "relative", transition: "color 0.2s" }}
            >
              {cat}
              {activeCategory === cat && (
                <motion.div
                  layoutId="catTab" transition={SPG}
                  style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,#f97316,#ea580c)", borderRadius: 2 }}
                />
              )}
            </motion.button>
          ))}
        </motion.div>

        <div style={{ display: "flex", gap: 32 }}>

          {/* Meal type sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 40, paddingTop: 8, minWidth: 64, alignItems: "center" }}>
            {MEAL_TYPES.map((meal, mi) => (
              <motion.button
                key={meal}
                initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPG, delay: 0.2 + mi * 0.07 }}
                onClick={() => setActiveMeal(meal)}
                whileHover={{ x: 2 }} whileTap={{ scale: 0.9 }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, padding: 0, position: "relative" }}
              >
                <span style={{ fontSize: 12, fontWeight: activeMeal === meal ? 700 : 400, color: activeMeal === meal ? "#111827" : "#d1d5db", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.08em", transition: "color 0.25s" }}>
                  {meal}
                </span>
                <AnimatePresence>
                  {activeMeal === meal && (
                    <motion.div
                      layoutId="mealDot"
                      initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SP}
                      style={{ position: "absolute", right: -10, top: "50%", transform: "translateY(-50%)", width: 5, height: 5, borderRadius: "50%", background: "#f97316" }}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>

          {/* Recipe cards */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
            <AnimatePresence mode="popLayout">
              {displayed.length > 0 ? (
                displayed.map(recipe => (
                  <RecipeCard
                    key={`${recipe.id}-${activeMeal}-${activeCategory}`}
                    recipe={recipe}
                    isFav={favorites.includes(recipe.id)}
                    justAdded={justAdded === recipe.id}
                    flavorSel={flavorSels[recipe.id] ?? []}
                    onToggleFav={() => toggleFav(recipe.id)}
                    onAddToCart={() => addToCart(recipe)}
                    onFlavorChange={f => setFlavorSels(prev => ({ ...prev, [recipe.id]: f }))}
                  />
                ))
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={SPG}
                  style={{ textAlign: "center", padding: "80px 0", color: "#d1d5db", fontSize: 14, fontWeight: 500 }}
                >
                  No items for {activeMeal} in this category.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Side dishes */}
        <motion.div
          initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPG, delay: 0.4 }}
          style={{ marginTop: 64 }}
        >
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 800, color: "#111827", marginBottom: 28, letterSpacing: "-0.3px" }}>
            Side Dishes
          </h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {MORE_RECIPES.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, y: 18, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...SPG, delay: 0.44 + i * 0.06 }}
                whileHover={{ y: -6, boxShadow: "0 14px 36px rgba(0,0,0,0.09)" }}
                whileTap={{ scale: 0.97 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", background: "#fff", borderRadius: 22, padding: "22px 24px", minWidth: 126, boxShadow: "0 2px 12px rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.04)", transition: "box-shadow 0.3s" }}
              >
                <motion.div
                  whileHover={{ scale: 1.08 }} transition={SPG}
                  style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", marginBottom: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}
                >
                  <img src={r.img} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </motion.div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 3, textAlign: "center" }}>{r.name}</span>
                <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>{r.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Order Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <OrderDrawer
            cart={cart}
            onClose={() => setDrawerOpen(false)}
            onRemove={removeFromCart}
            onChangeQty={changeQty}
            onClear={clearCart}
            onCheckout={handleCheckout}
          />
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckout && <CheckoutModal onClose={() => setShowCheckout(false)} />}
      </AnimatePresence>
    </div>
  )
}