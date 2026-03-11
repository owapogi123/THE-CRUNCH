import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Nutrition { calories: number; protein: number; fats: number; carbs: number; }
interface Recipe {
  id: number; name: string; description: string; image: string;
  nutrition: Nutrition; price: number; maxFlavors?: number; mealTypes: string[];
}
interface MoreRecipe { name: string; time: string; img: string; }
interface CartItem { recipe: Recipe; quantity: number; flavors: string[]; }

// ── Shared spring / easing configs ────────────────────────────────────────
const SPRING_SOFT   = { type: "spring" as const, stiffness: 240, damping: 26 };
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 400, damping: 36 };
const SPRING_GENTLE = { type: "spring" as const, stiffness: 160, damping: 22 };

const FLAVORS = [
  { name: "Classic" }, { name: "Honey Garlic" }, { name: "Teriyaki" },
  { name: "Texas BBQ" }, { name: "Garlic Parmesan" }, { name: "K-Style" }, { name: "Spicy K-Style" },
];

const recipes: Record<string, Recipe[]> = {
  Chicken: [
    { id: 1, name: "Whole Crispy Fried Chicken", description: "12 pcs | Perfect for 4-6 pax (Choice of 2 Flavors)", image: "https://bit.ly/4ckRqHY", nutrition: { calories: 350, protein: 15, fats: 25, carbs: 90 }, price: 598, maxFlavors: 2, mealTypes: ["Lunch", "Dinner"] },
    { id: 2, name: "Half Crispy Fried Chicken", description: "6 pcs | Perfect for 2-3 pax. (Choice of 1 Flavor)", image: "https://bit.ly/3P8sz0j", nutrition: { calories: 350, protein: 15, fats: 25, carbs: 90 }, price: 328, maxFlavors: 1, mealTypes: ["Lunch", "Dinner"] },
    { id: 3, name: "Crispy Chicken Shots with Drink", description: "Good For 1 Pax.", image: "https://bit.ly/3P6DcAK", nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 }, price: 128, maxFlavors: 1, mealTypes: ["Breakfast", "Lunch", "Dinner"] },
    { id: 4, name: "Chicken Skin with Rice and Drink", description: "Solo Meal.", image: "https://bit.ly/3P6DcAK", nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 }, price: 118, maxFlavors: 1, mealTypes: ["Breakfast", "Lunch"] },
    { id: 5, name: "2 pcs. Chicken With Rice and Drink", description: "Solo Meal.", image: "https://bit.ly/4r5rfZI", nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 }, price: 188, maxFlavors: 1, mealTypes: ["Lunch", "Dinner"] },
    { id: 6, name: "3 pcs. Chicken With Rice and Drink", description: "Good for 1 pax.", image: "https://bit.ly/4r1CAtC", nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 }, price: 228, maxFlavors: 1, mealTypes: ["Lunch", "Dinner"] },
  ],
  Drinks: [
    { id: 7, name: "Kiwi Ice Blended", description: "Blended until smooth and chilled to perfection, this drink has a refreshing, slightly creamy texture with a bright, citrusy kick.", image: "https://i.pinimg.com/1200x/3e/04/b8/3e04b89327ef2c1b50ee0e5b94068aaa.jpg", nutrition: { calories: 180, protein: 3, fats: 2, carbs: 44 }, price: 4.49, mealTypes: ["Breakfast", "Lunch", "Dinner"] },
  ],
  Burger: [
    { id: 8, name: "Chicken Burger with Cheese", description: "A crispy, juicy chicken burger with a special crunch coating, served on a toasted bun with fresh lettuce and a tangy sauce.", image: "https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg", nutrition: { calories: 520, protein: 22, fats: 18, carbs: 68 }, price: 9.99, mealTypes: ["Breakfast", "Lunch"] },
  ],
  Chips: [
    { id: 9, name: "Crispy Potato Chips", description: "Each piece is evenly seasoned to bring out a rich, savory flavor that keeps you coming back for more.", image: "https://i.pinimg.com/736x/a4/a5/cd/a4a5cd6b777e7bb789ee02288b6eb4d2.jpg", nutrition: { calories: 480, protein: 28, fats: 16, carbs: 58 }, price: 3.49, mealTypes: ["Breakfast", "Lunch", "Dinner"] },
  ],
  Alacarte: [
    { id: 10, name: "Crispy Chicken Shots with Drink", description: "Solo Meal", image: "https://static.wixstatic.com/media/d2b544_0a6506e217624c37a1c251bb0e9db0c5~mv2.png/v1/crop/x_0,y_65,w_1042,h_913/fill/w_835,h_732,al_c,q_90,usm_0.66_1.00_0.01,enc_auto/Copy%20of%20Untitled_20250305_163643_0000-20.png", nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 }, price: 88, maxFlavors: 1, mealTypes: ["Breakfast", "Lunch", "Dinner"] },
    { id: 11, name: "Chicken Skin with Rice and Drink", description: "Solo Meal", image: "https://bit.ly/3P6DcAK", nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 }, price: 78, maxFlavors: 1, mealTypes: ["Breakfast", "Lunch"] },
    { id: 12, name: "2 pcs. Chicken With Rice and Drink", description: "Solo Meal", image: "https://bit.ly/4r5rfZI", nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 }, price: 148, maxFlavors: 1, mealTypes: ["Lunch", "Dinner"] },
    { id: 13, name: "3 pcs. Chicken With Rice and Drink", description: "Solo Meal", image: "https://bit.ly/4r1CAtC", nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 }, price: 188, maxFlavors: 1, mealTypes: ["Lunch", "Dinner"] },
  ],
};

const moreRecipes: MoreRecipe[] = [
  { name: "Twister Fries", time: "5 min", img: "https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg" },
  { name: "Regular Fries", time: "5 min", img: "https://i.pinimg.com/1200x/95/02/12/9502126d74d78185aca0697e53c91197.jpg" },
  { name: "TTEOKBOKKI", time: "15 min", img: "https://bit.ly/3MMEeRT" },
  { name: "Fish Cake", time: "5 min", img: "https://bit.ly/4s9ZvUC" },
  { name: "Kimchi", time: "5 min", img: "https://bit.ly/47bPoX5" },
];

const categories = ["All", "Chicken", "Burger", "Drinks", "Chips", "Alacarte"];
const mealTypes  = ["Breakfast", "Lunch", "Dinner"];

// Card variants: simple fade only
const cardVariants = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { delay: i * 0.04, duration: 0.25 },
  }),
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// ── Flavor Picker ──────────────────────────────────────────────────────────
function FlavorPicker({ maxFlavors, selected, onChange }: {
  maxFlavors: number; selected: string[]; onChange: (f: string[]) => void;
}) {
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(f => f !== name));
    else if (selected.length < maxFlavors) onChange([...selected, name]);
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Signature Flavor{maxFlavors > 1 ? "s" : ""} — pick {maxFlavors === 1 ? "1" : `up to ${maxFlavors}`}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {FLAVORS.map(flavor => {
          const isSelected = selected.includes(flavor.name);
          const isDisabled = !isSelected && selected.length >= maxFlavors;
          return (
            <motion.button
              key={flavor.name}
              onClick={() => !isDisabled && toggle(flavor.name)}
              whileHover={!isDisabled ? { y: -2, scale: 1.04 } : {}}
              whileTap={!isDisabled ? { scale: 0.92 } : {}}
              transition={SPRING_SNAPPY}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 9,
                border: isSelected ? "2px solid #111827" : "1.5px solid #e5e7eb",
                background: isSelected ? "#111827" : "#f9fafb",
                color: isSelected ? "#fff" : isDisabled ? "#d1d5db" : "#374151",
                fontSize: 11.5, fontWeight: 600,
                cursor: isDisabled ? "not-allowed" : "pointer",
                fontFamily: "'Poppins', sans-serif",
                opacity: isDisabled ? 0.4 : 1,
                letterSpacing: "0.02em",
                transition: "background 0.22s, border-color 0.22s, color 0.22s",
              }}
            >
              {flavor.name}
              <AnimatePresence>
                {isSelected && (
                  <motion.span
                    key="check"
                    initial={{ scale: 0, opacity: 0, rotate: -30 }}
                    animate={{ scale: 1, opacity: 0.9, rotate: 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={SPRING_SNAPPY}
                    style={{ fontSize: 10 }}
                  >✓</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Order Drawer ───────────────────────────────────────────────────────────
function OrderDrawer({ cart, onClose, onRemove, onChangeQty, onClear, onCheckout }: {
  cart: CartItem[]; onClose: () => void; onRemove: (id: number) => void;
  onChangeQty: (id: number, delta: number) => void; onClear: () => void; onCheckout: () => void;
}) {
  const total = cart.reduce((s, i) => s + i.recipe.price * i.quantity, 0);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      {/* Backdrop — smooth fade + blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.28)", zIndex: 200, backdropFilter: "blur(7px)" }}
      />

      {/* Panel — spring slide */}
      <motion.div
        initial={{ x: "105%", opacity: 0.7 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "105%", opacity: 0.7 }}
        transition={{ ...SPRING_GENTLE, restDelta: 0.001 }}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, background: "#fff", zIndex: 300, display: "flex", flexDirection: "column", boxShadow: "-16px 0 64px rgba(0,0,0,0.13)" }}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ...SPRING_SOFT }}
          style={{ padding: "28px 32px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "'Poppins', sans-serif" }}>Your Order</h2>
            <AnimatePresence mode="wait">
              <motion.p
                key={totalQty}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={SPRING_SNAPPY}
                style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0", fontFamily: "'Poppins', sans-serif" }}
              >
                {totalQty} item{totalQty !== 1 ? "s" : ""}
              </motion.p>
            </AnimatePresence>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.8, x: 12 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 12 }}
                  transition={SPRING_SNAPPY}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={onClear}
                  style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 9, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins', sans-serif" }}
                >
                  Clear all
                </motion.button>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.88 }}
              transition={SPRING_SNAPPY}
              onClick={onClose}
              style={{ background: "#f9fafb", border: "1px solid #e5e7eb", color: "#6b7280", borderRadius: "50%", width: 36, height: 36, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >✕</motion.button>
          </div>
        </motion.div>

        {/* Items list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 32px" }}>
          <AnimatePresence initial={false}>
            {cart.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ ...SPRING_SOFT, delay: 0.06 }}
                style={{ textAlign: "center", paddingTop: 80 }}
              >
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
                  style={{ fontSize: 52, marginBottom: 16 }}
                ></motion.div>
                <p style={{ color: "#d1d5db", fontSize: 14, fontWeight: 500, fontFamily: "'Poppins', sans-serif", lineHeight: 1.75 }}>
                  Your order is empty.<br />Add something delicious!
                </p>
              </motion.div>
            ) : (
              cart.map((item, idx) => (
                <motion.div
                  key={item.recipe.id}
                  layout
                  initial={{ opacity: 0, x: 28, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 36, scale: 0.93, transition: { duration: 0.22, ease: "easeInOut" } }}
                  transition={{ ...SPRING_SOFT, delay: idx * 0.05 }}
                  style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "16px 0", borderBottom: "1px solid #f3f4f6" }}
                >
                  <motion.div
                    whileHover={{ scale: 1.07 }}
                    transition={SPRING_SNAPPY}
                    style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", flexShrink: 0, boxShadow: "0 3px 14px rgba(0,0,0,0.1)" }}
                  >
                    <img src={item.recipe.image} alt={item.recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </motion.div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "#111827", margin: "0 0 3px", fontFamily: "'Poppins', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.recipe.name}
                    </p>
                    {item.flavors.length > 0 && (
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px", fontFamily: "'Poppins', sans-serif" }}>
                        {item.flavors.join(" · ")}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {/* Stepper */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#f9fafb", borderRadius: 10, padding: "5px 12px", border: "1px solid #e5e7eb" }}>
                        <motion.button
                          whileTap={{ scale: 0.72 }}
                          transition={SPRING_SNAPPY}
                          onClick={() => onChangeQty(item.recipe.id, -1)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#374151", padding: 0, lineHeight: 1 }}
                        >−</motion.button>

                        <AnimatePresence mode="wait">
                          <motion.span
                            key={item.quantity}
                            initial={{ opacity: 0, scale: 0.6, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.6, y: -4 }}
                            transition={SPRING_SNAPPY}
                            style={{ fontSize: 13, fontWeight: 700, color: "#111827", minWidth: 16, textAlign: "center", fontFamily: "'Poppins', sans-serif", display: "block" }}
                          >{item.quantity}</motion.span>
                        </AnimatePresence>

                        <motion.button
                          whileTap={{ scale: 0.72 }}
                          transition={SPRING_SNAPPY}
                          onClick={() => onChangeQty(item.recipe.id, 1)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#374151", padding: 0, lineHeight: 1 }}
                        >+</motion.button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={item.quantity}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={SPRING_SOFT}
                            style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "'Poppins', sans-serif" }}
                          >
                            ₱{(item.recipe.price * item.quantity).toFixed(2)}
                          </motion.span>
                        </AnimatePresence>

                        <motion.button
                          whileHover={{ scale: 1.25 }}
                          whileTap={{ scale: 0.82 }}
                          transition={SPRING_SNAPPY}
                          onClick={() => onRemove(item.recipe.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 15, padding: 0, lineHeight: 1 }}
                        >🗑</motion.button>
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
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={SPRING_SOFT}
              style={{ padding: "20px 32px 32px", borderTop: "1px solid #f3f4f6" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontSize: 14, color: "#6b7280", fontFamily: "'Poppins', sans-serif" }}>Subtotal</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={Math.round(total * 100)}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={SPRING_SOFT}
                    style={{ fontSize: 22, fontWeight: 700, color: "#111827", fontFamily: "'Poppins', sans-serif", letterSpacing: "-0.4px" }}
                  >
                    ₱{total.toFixed(2)}
                  </motion.span>
                </AnimatePresence>
              </div>

              <motion.button
                whileHover={{ scale: 1.025, boxShadow: "0 10px 32px rgba(9, 83, 243, 0.3)" }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_SNAPPY}
                onClick={onCheckout}
                style={{ width: "100%", background: "#111827", color: "#fff", border: "none", borderRadius: 16, padding: "16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins', sans-serif", letterSpacing: "0.02em", boxShadow: "0 4px 20px rgba(17,24,39,0.22)" }}
              >
                Place Order!
              </motion.button>
              <p style={{ textAlign: "center", fontSize: 11, color: "#d1d5db", marginTop: 12, fontFamily: "'Poppins', sans-serif" }}>
                Taxes and fees calculated at checkout
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

// ── Checkout Success Modal ─────────────────────────────────────────────────
function CheckoutModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
        style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.42)", zIndex: 400, backdropFilter: "blur(10px)" }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.86, y: 20 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
        style={{ position: "fixed", top: "40%", left: "40%", transform: "translate(-50%, -50%)", background: "#fff", borderRadius: 32, padding: "52px 48px", zIndex: 500, textAlign: "center", maxWidth: 380, width: "90%", boxShadow: "0 32px 80px rgba(0,0,0,0.22)" }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -24 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, ...SPRING_SNAPPY }}
          style={{ fontSize: 64, marginBottom: 20 }}
        ></motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, ...SPRING_SOFT }}
          style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 10, fontFamily: "'Poppins', sans-serif" }}
        >Order Placed!</motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, ...SPRING_SOFT }}
          style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.75, marginBottom: 28, fontFamily: "'Poppins', sans-serif" }}
        >
          Thank you for your order. We're getting everything ready fresh for you!
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ...SPRING_SOFT }}
          whileHover={{ scale: 1.05, boxShadow: "0 8px 24px rgba(17,24,39,0.22)" }}
          whileTap={{ scale: 0.94 }}
          onClick={onClose}
          style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 14, padding: "13px 40px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins', sans-serif" }}
        >
          Back to Menu
        </motion.button>
      </motion.div>
    </>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function Delicacy() {
  const [activeCategory,    setActiveCategory]    = useState("Chicken");
  const [activeMeal,        setActiveMeal]        = useState("Lunch");
  const [favorites,         setFavorites]         = useState<number[]>([]);
  const [flavorSelections,  setFlavorSelections]  = useState<Record<number, string[]>>({});
  const [cart,              setCart]              = useState<CartItem[]>([]);
  const [drawerOpen,        setDrawerOpen]        = useState(false);
  const [showCheckout,      setShowCheckout]      = useState(false);
  const [justAdded,         setJustAdded]         = useState<number | null>(null);

  const allInCategory: Recipe[] =
    activeCategory === "All" ? Object.values(recipes).flat() : recipes[activeCategory] ?? [];
  const displayRecipes = allInCategory.filter(r => r.mealTypes.includes(activeMeal));

  const toggleFavorite = (id: number) =>
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

  const addToCart = (recipe: Recipe) => {
    const flavors = flavorSelections[recipe.id] || [];
    setCart(prev => {
      const existing = prev.find(c => c.recipe.id === recipe.id);
      if (existing) return prev.map(c => c.recipe.id === recipe.id ? { ...c, quantity: c.quantity + 1, flavors } : c);
      return [...prev, { recipe, quantity: 1, flavors }];
    });
    setJustAdded(recipe.id);
    setTimeout(() => setJustAdded(null), 1400);
  };

  const removeFromCart = (id: number) => setCart(prev => prev.filter(c => c.recipe.id !== id));
  const changeQty      = (id: number, delta: number) =>
    setCart(prev => prev.map(c => c.recipe.id === id ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0));
  const clearCart      = () => setCart([]);
  const handleCheckout = () => {
    setDrawerOpen(false);
    setTimeout(() => { setShowCheckout(true); setCart([]); }, 340);
  };

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: "#f5f6fa", minHeight: "100vh", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── Sticky Topbar ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ y: -64, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.06 }}
        style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(245,246,250,0.88)", backdropFilter: "blur(18px)", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "14px 36px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}
      >
        <motion.button
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.86 }}
          transition={SPRING_SNAPPY}
          onClick={() => setDrawerOpen(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#111827", color: "#fff", border: "none", borderRadius: "50%", width: 48, height: 48, cursor: "pointer", boxShadow: "0 4px 20px rgba(17,24,39,0.28)", position: "relative" }}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>

          <AnimatePresence>
            {totalItems > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={SPRING_SNAPPY}
                style={{ position: "absolute", top: -5, right: -5, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #f5f6fa" }}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={totalItems}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={SPRING_SNAPPY}
                  >
                    {totalItems}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "52px 36px 0" }}>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: -22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ fontSize: 46, fontWeight: 700, color: "#111827", marginBottom: 8, letterSpacing: "-0.5px" }}
        >
          Menu
        </motion.h1>

        {/* Category Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ display: "flex", gap: 4, marginBottom: 48, borderBottom: "1px solid #e5e7eb" }}
        >
          {categories.map(cat => (
            <motion.button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              whileHover={{ color: "#111827" }}
              whileTap={{ scale: 0.93 }}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Poppins', sans-serif", fontSize: 14, fontWeight: activeCategory === cat ? 600 : 400, color: activeCategory === cat ? "#111827" : "#9ca3af", padding: "12px 20px", position: "relative", transition: "color 0.22s ease" }}
            >
              {cat}
              {activeCategory === cat && (
                <motion.div
                  layoutId="activeTab"
                  transition={SPRING_SOFT}
                  style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 2, background: "#111827", borderRadius: 2 }}
                />
              )}
            </motion.button>
          ))}
        </motion.div>

        <div style={{ display: "flex", gap: 28 }}>
          {/* Meal type sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 36, paddingTop: 10, minWidth: 72, alignItems: "center" }}>
            {mealTypes.map((meal, mi) => (
              <motion.button
                key={meal}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING_SOFT, delay: 0.24 + mi * 0.08 }}
                onClick={() => setActiveMeal(meal)}
                whileHover={{ x: 3 }}
                whileTap={{ scale: 0.9 }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Poppins', sans-serif", display: "flex", alignItems: "center", gap: 8, padding: 0, position: "relative" }}
              >
                <span style={{ fontSize: 12, fontWeight: activeMeal === meal ? 600 : 400, color: activeMeal === meal ? "#111827" : "#d1d5db", writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.08em", transition: "color 0.28s ease" }}>
                  {meal}
                </span>
                <AnimatePresence>
                  {activeMeal === meal && (
                    <motion.div
                      layoutId="mealDot"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={SPRING_SNAPPY}
                      style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 6, height: 6, borderRadius: "50%", background: "#111827" }}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>

          {/* Recipe Cards */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
            <AnimatePresence mode="popLayout">
              {displayRecipes.length > 0 ? (
                displayRecipes.map((recipe, i) => (
                  <motion.div
                    key={`${recipe.id}-${activeMeal}-${activeCategory}`}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    style={{ background: "#ffffff", borderRadius: 28, padding: "36px 40px", boxShadow: "0 1px 4px rgba(0,0,0,0.05), 0 4px 24px rgba(0,0,0,0.04)", display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 40 }}
                  >
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8, lineHeight: 1.3 }}>{recipe.name}</h2>
                      <p style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.75, marginBottom: 22 }}>{recipe.description.slice(0, 200)}</p>

                      <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nutritional Values</p>
                      <div style={{ display: "flex", gap: 28, marginBottom: 26 }}>
                        {([
                          { label: "Calories", unit: "Kcal", value: recipe.nutrition.calories },
                          { label: "Protein",  unit: "g",    value: recipe.nutrition.protein },
                          { label: "Fats",     unit: "g",    value: recipe.nutrition.fats },
                          { label: "Carbs",    unit: "g",    value: recipe.nutrition.carbs },
                        ] as { label: string; unit: string; value: number }[]).map((n) => (
                          <div key={n.label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{n.value}</div>
                            <div style={{ fontSize: 10.5, fontWeight: 500, color: "#6b7280" }}>{n.label}</div>
                            <div style={{ fontSize: 9.5, color: "#d1d5db" }}>{n.unit}</div>
                          </div>
                        ))}
                      </div>

                      {recipe.maxFlavors && (
                        <FlavorPicker
                          maxFlavors={recipe.maxFlavors}
                          selected={flavorSelections[recipe.id] || []}
                          onChange={flavors => setFlavorSelections(prev => ({ ...prev, [recipe.id]: flavors }))}
                        />
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10 }}>
                          {/* Favorite btn */}
                          <motion.button
                            onClick={() => toggleFavorite(recipe.id)}
                            whileTap={{ scale: 0.95 }}
                            style={{ background: favorites.includes(recipe.id) ? "#fffbeb" : "#f9fafb", color: favorites.includes(recipe.id) ? "#b45309" : "#6b7280", border: `1px solid ${favorites.includes(recipe.id) ? "#fde68a" : "#e5e7eb"}`, borderRadius: 11, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins', sans-serif", transition: "background 0.2s, border-color 0.2s, color 0.2s" }}
                          >
                            {favorites.includes(recipe.id) ? "Saved" : "Save"}
                          </motion.button>

                          {/* Add to Order btn */}
                          <motion.button
                            onClick={() => addToCart(recipe)}
                            whileTap={{ scale: 0.95 }}
                            style={{ background: justAdded === recipe.id ? "#3b894ac6" : "#111827", color: "#ffffff", border: "none", borderRadius: 11, padding: "11px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins', sans-serif", transition: "background 0.3s ease", display: "flex", alignItems: "center", gap: 7, minWidth: 142, justifyContent: "center", overflow: "hidden" }}
                          >
                            <AnimatePresence mode="wait">
                              {justAdded === recipe.id ? (
                                <motion.span
                                  key="check"
                                  initial={{ opacity: 0, scale: 0.65, y: 8 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.65, y: -8 }}
                                  transition={SPRING_SNAPPY}
                                >Added!</motion.span>
                              ) : (
                                <motion.span
                                  key="add"
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -8 }}
                                  transition={SPRING_SNAPPY}
                                >Add to Order</motion.span>
                              )}
                            </AnimatePresence>
                          </motion.button>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>Price</span>
                          <span style={{ fontSize: 26, fontWeight: 700, color: "#111827", letterSpacing: "-0.5px" }}>₱{recipe.price.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Food image */}
                    <div style={{ width: 230, height: 230, borderRadius: "50%", overflow: "hidden", flexShrink: 0, boxShadow: "0 14px 50px rgba(0,0,0,0.13)", marginTop: 8 }}>
                      <img src={recipe.image.trim()} alt={recipe.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  </motion.div>
                ))
              ) : (
                <motion.div
                  key="empty-cards"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={SPRING_SOFT}
                  style={{ textAlign: "center", padding: 80, color: "#d1d5db", fontSize: 14, fontWeight: 500 }}
                >
                  No items available for {activeMeal} in this category.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Side Dishes */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_GENTLE, delay: 0.42 }}
          style={{ marginTop: 64 }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 28, letterSpacing: "-0.3px" }}>Side Dishes</h2>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {moreRecipes.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...SPRING_SOFT, delay: 0.46 + i * 0.07 }}
                whileHover={{ y: -7, scale: 1.03, boxShadow: "0 12px 36px rgba(0,0,0,0.11)" }}
                whileTap={{ scale: 0.96 }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", background: "#fff", borderRadius: 20, padding: "22px 26px", minWidth: 130, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: -4 }}
                  transition={SPRING_SOFT}
                  style={{ width: 76, height: 76, borderRadius: "50%", overflow: "hidden", marginBottom: 14, boxShadow: "0 3px 14px rgba(0,0,0,0.09)" }}
                >
                  <img src={r.img} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </motion.div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 4, textAlign: "center" }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{r.time} cooking time</span>
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
  );
}