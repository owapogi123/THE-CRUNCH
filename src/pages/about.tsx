import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Ingredient {
  name: string;
  amount: string;
}

interface Nutrition {
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
}

interface Recipe {
  id: number;
  name: string;
  description: string;
  image: string;
  ingredients: Ingredient[];
  nutrition: Nutrition;
}

interface MoreRecipe {
  name: string;
  time: string;
  img: string;
}

const recipes: Record<string, Recipe[]> = {
  Chicken: [
    {
      id: 1,
      name: "Whole Chicken",
      description:
        "Perfect for family gatherings, celebrations, or when you simply want something extra satisfying. Perfect for family gatherings, celebrations, or when you simply want something extra satisfying.",
      image: "https://i.pinimg.com/736x/cd/17/a9/cd17a90839282baf5e70765610d0f2e3.jpg",
      ingredients: [
        { name: "Chicken", amount: "1 Breast piece" },
        { name: "Crispy Coating", amount: "All Purpose Flour and Cornstarch" },
        { name: "Seasonings", amount: "Garlic Powder, Onion Powder, Pepper, Paprika, and Salt" },
        { name: "Eggs", amount: "2 Piece" },
        { name: "Buttermilk", amount: "1 Cup" },
        { name: "Black Pepper", amount: "1 tsp" },
      ],
      nutrition: { calories: 350, protein: 15, fats: 25, carbs: 90 },
    },
    {
      id: 2,
      name: "Crispy Chicken Pops",
      description:
        "A crispy, juicy chicken burger with a special crunch coating, served on a toasted bun with fresh lettuce and a tangy sauce. Perfect for a quick, satisfying meal.",
      image: "https://i.pinimg.com/1200x/0a/c0/a0/0ac0a07a04a9ddbbe2db399a8bf28504.jpg",
      ingredients: [
        { name: "Chicken", amount: "1 Breast piece" },
        { name: "Honey", amount: "1 Tbsp" },
        { name: "Olive oil", amount: "1 Tbsp" },
        { name: "Eggs", amount: "2 Piece" },
        { name: "Breadcrumbs", amount: "1 Cup" },
        { name: "Paprika", amount: "1 tsp" },
      ],
      nutrition: { calories: 235, protein: 11, fats: 30, carbs: 60 },
    },
  ],
  Skin: [
    {
      id: 3,
      name: "Chicken Skin Chicharon",
      description:
        "Thin strips of real chicken skin are seasoned just right, then fried until golden and irresistibly crunchy. Every piece is light, airy, and packed with rich, savory flavor.",
      image: "https://i.pinimg.com/736x/81/f1/8e/81f18e65198d20177c49dddca7be9238.jpg",
      ingredients: [
        { name: "Chicken Skin", amount: "1 Kilograms" },
        { name: "Vinegar White Cane", amount: "1/4 Cup" },
        { name: "Salt", amount: "1 Table Spoon" },
        { name: "Garlic", amount: "4-5 Cloves" },
        { name: "Bay Leaves", amount: "3 pieces" },
        { name: "Peppercorns", amount: "1 tsp" },
      ],
      nutrition: { calories: 280, protein: 34, fats: 14, carbs: 5 },
    },
  ],
  Drinks: [
    {
      id: 4,
      name: "Kiwi Ice Blended",
      description:
        "Blended until smooth and chilled to perfection, this drink has a refreshing, slightly creamy texture with a bright, citrusy kick.",
      image: "https://i.pinimg.com/1200x/3e/04/b8/3e04b89327ef2c1b50ee0e5b94068aaa.jpg",
      ingredients: [
        { name: "8 Medium-Large Kiwis", amount: "Peeled" },
        { name: "Coconut Condensed Milk", amount: "1/3 Cup" },
        { name: "Coconut Cream", amount: "1 Can 400ml" },
        { name: "Vanilla Extract", amount: "1 tsp" },
        { name: "Ice Cubes", amount: "2 Cups" },
        { name: "Lime Juice", amount: "2 Tbsp" },
      ],
      nutrition: { calories: 180, protein: 3, fats: 2, carbs: 44 },
    },
  ],
  Burger: [
    {
      id: 5,
      name: "Chicken Burger with Cheese",
      description:
        "A crispy, juicy chicken burger with a special crunch coating, served on a toasted bun with fresh lettuce and a tangy sauce. Perfect for a quick, satisfying meal.",
      image: "https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg",
      ingredients: [
        { name: "Chicken Breasts", amount: "200g" },
        { name: "Bun", amount: "Sesame Seed Bun" },
        { name: "Sauce", amount: "Mayonnaise, Garlic Mayo, Spicy Mayo" },
        { name: "Cheese", amount: "Cheddar Cheese Dice" },
        { name: "Lettuce", amount: "2 leaves" },
        { name: "Tomato", amount: "2 slices" },
      ],
      nutrition: { calories: 520, protein: 22, fats: 18, carbs: 68 },
    },
  ],
  Chips: [
    {
      id: 6,
      name: "Crispy Potato Chips",
      description:
        "Each piece is evenly seasoned to bring out a rich, savory flavor that keeps you coming back for more.",
      image: "https://i.pinimg.com/736x/a4/a5/cd/a4a5cd6b777e7bb789ee02288b6eb4d2.jpg",
      ingredients: [
        { name: "Potatoes", amount: "1/8 inch sliced" },
        { name: "Oil", amount: "High-Smoke point oil" },
        { name: "Salt", amount: "1 tsp" },
        { name: "Vinegar Powder", amount: "1/2 tsp" },
        { name: "Onion Powder", amount: "1/2 tsp" },
        { name: "Paprika", amount: "1/4 tsp" },
      ],
      nutrition: { calories: 480, protein: 28, fats: 16, carbs: 58 },
    },
  ],
  Bucket: [
    {
      id: 7,
      name: "Chicken Shots Buckets",
      description:
        "Tossed in our signature spice blend and served by the bucketload, these aren't just snacks they’re addictive, golden nuggets of pure satisfaction",
      image: "https://i.pinimg.com/1200x/5f/c3/c1/5fc3c1693a7e4554f4d23966a896d659.jpg",
      ingredients: [
        { name: "Chicken", amount: "1 Breast piece" },
        { name: "Honey", amount: "1 Tbsp" },
        { name: "Olive oil", amount: "1 Tbsp" },
        { name: "Eggs", amount: "2 Piece" },
        { name: "Breadcrumbs", amount: "1 Cup" },
        { name: "Paprika", amount: "1 tsp" },
      ],
      nutrition: { calories: 320, protein: 30, fats: 18, carbs: 12 },
    },
  ],
};

const moreRecipes: MoreRecipe[] = [
  { name: "Twister Fries", time: "5 minutes cooking time", img: "https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg" },
  { name: "Regular Fries", time: "5 minutes cooking time  ", img: "https://i.pinimg.com/1200x/95/02/12/9502126d74d78185aca0697e53c91197.jpg" },
  { name: "TTEOKBOKKI", time: "15 minutes cooking time", img: "https://i.pinimg.com/736x/3f/b9/cd/3fb9cd58e4e2e8d5bc6edd64d7b65e29.jpg" },
  { name: "Fish Cake", time: "5 minutes cooking time", img: "https://i.pinimg.com/1200x/aa/be/b4/aabeb407a0dd3fa8e84e2687ca0f7490.jpg" },
  { name: "Kimchi", time: "5 minutes cooking time", img: "https://i.pinimg.com/1200x/ff/94/40/ff944099cfa3072a27f2ed9b913545c3.jpg" },
];

const categories: string[] = ["All", "Chicken", "Skin", "Burger", "Drinks", "Chips", "Bucket"];
const mealTypes: string[] = ["Breakfast", "Lunch", "Dinner"];

const PREVIEW_COUNT = 4;

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.45, ease: [0.42, 0, 0.58, 1] },
  }),
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
};

export default function Delicacy() {
  const [activeCategory, setActiveCategory] = useState<string>("Chicken");
  const [activeMeal, setActiveMeal] = useState<string>("Lunch");
  const [favorites, setFavorites] = useState<number[]>([]);
  // Now tracks which cards are EXPANDED (showing all ingredients)
  const [expandedIngredients, setExpandedIngredients] = useState<Record<number, boolean>>({});

  const displayRecipes: Recipe[] =
    activeCategory === "All"
      ? Object.values(recipes).flat()
      : recipes[activeCategory] ?? [];

  const toggleFavorite = (id: number): void => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const toggleIngredients = (id: number): void => {
    setExpandedIngredients((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isExpanded = (id: number): boolean => !!expandedIngredients[id];

  return (
    <div
      style={{
        fontFamily: "'Poppins', sans-serif",
        background: "#f5f6fa",
        minHeight: "100vh",
        paddingBottom: 80,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "52px 36px 0" }}>
        <motion.h1
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            fontSize: 46,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 8,
            letterSpacing: "-0.5px",
          }}
        >
          About
        </motion.h1>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 48,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          {categories.map((cat) => (
            <motion.button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              whileTap={{ scale: 0.96 }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "'Poppins', sans-serif",
                fontSize: 14,
                fontWeight: activeCategory === cat ? 600 : 400,
                color: activeCategory === cat ? "#111827" : "#9ca3af",
                padding: "12px 20px",
                position: "relative",
                transition: "color 0.2s",
              }}
            >
              {cat}
              {activeCategory === cat && (
                <motion.div
                  layoutId="activeTab"
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "#111827",
                    borderRadius: 2,
                  }}
                />
              )}
            </motion.button>
          ))}
        </motion.div>
        <div style={{ display: "flex", gap: 28 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 36,
              paddingTop: 10,
              minWidth: 72,
              alignItems: "center",
            }}
          >
            {mealTypes.map((meal) => (
              <motion.button
                key={meal}
                onClick={() => setActiveMeal(meal)}
                whileHover={{ x: 2 }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "'Poppins', sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 0,
                  position: "relative",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: activeMeal === meal ? 600 : 400,
                    color: activeMeal === meal ? "#111827" : "#d1d5db",
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    letterSpacing: "0.08em",
                    transition: "color 0.2s",
                  }}
                >
                  {meal}
                </span>
                {activeMeal === meal && (
                  <motion.div
                    layoutId="mealDot"
                    style={{
                      position: "absolute",
                      right: -12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#111827",
                    }}
                  />
                )}
              </motion.button>
            ))}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <AnimatePresence mode="wait">
              {displayRecipes.map((recipe, i) => {
                const expanded = isExpanded(recipe.id);
                const visibleIngredients = expanded
                  ? recipe.ingredients
                  : recipe.ingredients.slice(0, PREVIEW_COUNT);
                const hasMore = recipe.ingredients.length > PREVIEW_COUNT;

                return (
                  <motion.div
                    key={recipe.id}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    style={{
                      background: "#ffffff",
                      borderRadius: 28,
                      padding: "36px 40px",
                      boxShadow:
                        "0 1px 4px rgba(0,0,0,0.05), 0 4px 24px rgba(0,0,0,0.05)",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 40,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h2
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: "#111827",
                          marginBottom: 8,
                          lineHeight: 1.3,
                        }}
                      >
                        {recipe.name}
                      </h2>
                      <p
                        style={{
                          fontSize: 12.5,
                          color: "#6b7280",
                          lineHeight: 1.75,
                          marginBottom: 22,
                        }}
                      >
                        {recipe.description.slice(0, 200)}...
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#9ca3af",
                          marginBottom: 12,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Ingredients
                      </p>
                      <motion.div
                        layout
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 9,
                          marginBottom: 16,
                        }}
                      >
                        <AnimatePresence>
                          {visibleIngredients.map((ing, j) => (
                            <motion.div
                              key={ing.name}
                              initial={{ opacity: 0, y: -8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8, scale: 0.96 }}
                              transition={{ duration: 0.22, delay: j * 0.03 }}
                              style={{
                                background: "#f9fafb",
                                border: "1px solid #f3f4f6",
                                borderRadius: 12,
                                padding: "9px 14px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "#374151",
                                }}
                              >
                                {ing.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: "#9ca3af",
                                  marginTop: 2,
                                }}
                              >
                                {ing.amount}
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </motion.div>
                      {hasMore && (
                        <motion.button
                          whileHover={{ backgroundColor: "#f3f4f6" }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleIngredients(recipe.id)}
                          style={{
                            background: "#f9fafb",
                            border: "1px solid #e5e7eb",
                            borderRadius: 9,
                            padding: "7px 16px",
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: "#374151",
                            cursor: "pointer",
                            marginBottom: 22,
                            fontFamily: "'Poppins', sans-serif",
                            transition: "background 0.2s",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <motion.span
                            animate={{ rotate: expanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ display: "inline-block", fontSize: 10 }}
                          >
                            ▼
                          </motion.span>
                          {expanded
                            ? `Hide ingredients (${recipe.ingredients.length - PREVIEW_COUNT} hidden)`
                            : `View all ingredients (+${recipe.ingredients.length - PREVIEW_COUNT} more)`}
                        </motion.button>
                      )}
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#9ca3af",
                          marginBottom: 14,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Nutritional Values
                      </p>
                      <div style={{ display: "flex", gap: 28, marginBottom: 26 }}>
                        {(
                          [
                            { label: "Calories", unit: "Kcal", value: recipe.nutrition.calories },
                            { label: "Protein", unit: "g", value: recipe.nutrition.protein },
                            { label: "Fats", unit: "g", value: recipe.nutrition.fats },
                            { label: "Carbs", unit: "g", value: recipe.nutrition.carbs },
                          ] as { label: string; unit: string; value: number }[]
                        ).map((n) => (
                          <motion.div
                            key={n.label}
                            whileHover={{ y: -2 }}
                            style={{ textAlign: "center" }}
                          >
                            <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
                              {n.value}
                            </div>
                            <div style={{ fontSize: 10.5, fontWeight: 500, color: "#6b7280" }}>
                              {n.label}
                            </div>
                            <div style={{ fontSize: 9.5, color: "#d1d5db" }}>{n.unit}</div>
                          </motion.div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <motion.button
                          whileHover={{ backgroundColor: "#1f2937" }}
                          whileTap={{ scale: 0.97 }}
                          style={{
                            background: "#111827",
                            color: "#fff",
                            border: "none",
                            borderRadius: 11,
                            padding: "11px 28px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "'Poppins', sans-serif",
                            transition: "background 0.2s",
                          }}
                        >
                          Recipe
                        </motion.button>
                        <motion.button
                          onClick={() => toggleFavorite(recipe.id)}
                          whileHover={{
                            backgroundColor: favorites.includes(recipe.id)
                              ? "#fef3c7"
                              : "#f3f4f6",
                          }}
                          whileTap={{ scale: 0.97 }}
                          style={{
                            background: favorites.includes(recipe.id) ? "#fffbeb" : "#f9fafb",
                            color: favorites.includes(recipe.id) ? "#b45309" : "#6b7280",
                            border: `1px solid ${favorites.includes(recipe.id) ? "#fde68a" : "#e5e7eb"}`,
                            borderRadius: 11,
                            padding: "11px 28px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "'Poppins', sans-serif",
                            transition: "all 0.2s",
                          }}
                        >
                          {favorites.includes(recipe.id) ? "Saved ★" : "Add to favorites"}
                        </motion.button>
                      </div>
                    </div>
                    <motion.div
                      whileHover={{ scale: 1.04 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      style={{
                        width: 230,
                        height: 230,
                        borderRadius: "50%",
                        overflow: "hidden",
                        flexShrink: 0,
                        boxShadow: "0 12px 44px rgba(0,0,0,0.12)",
                        marginTop: 8,
                      }}
                    >
                      <img
                        src={recipe.image.trim()}
                        alt={recipe.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {displayRecipes.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  textAlign: "center",
                  padding: 80,
                  color: "#d1d5db",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                No recipes found in this category.
              </motion.div>
            )}
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          style={{ marginTop: 64 }}
        >
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 28,
              letterSpacing: "-0.3px",
            }}
          >
            More recipes
          </h2>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {moreRecipes.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.06 }}
                whileHover={{ y: -5, boxShadow: "0 8px 28px rgba(0,0,0,0.09)" }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  cursor: "pointer",
                  background: "#fff",
                  borderRadius: 20,
                  padding: "22px 26px",
                  minWidth: 130,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  transition: "box-shadow 0.25s",
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.06 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: "50%",
                    overflow: "hidden",
                    marginBottom: 14,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                  }}
                >
                  <img
                    src={r.img}
                    alt={r.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </motion.div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#111827",
                    marginBottom: 4,
                    textAlign: "center",
                  }}
                >
                  {r.name}
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{r.time} Price</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}