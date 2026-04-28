const router = require("express").Router();
const db = require("../config/db");

const DEFAULT_FLAVORS = [
  {
    name: "Honey Garlic",
    accent: "#f59e0b",
    desc: "Sticky-sweet glaze with a mellow garlic finish.",
    img: "/vite.svg",
  },
  {
    name: "Spicy Korean",
    accent: "#ef4444",
    desc: "Bold heat with a sweet gochujang-style kick.",
    img: "/vite.svg",
  },
  {
    name: "Texas BBQ",
    accent: "#b45309",
    desc: "Smoky, savory, and built for extra-crispy bites.",
    img: "/vite.svg",
  },
  {
    name: "Teriyaki",
    accent: "#16a34a",
    desc: "Balanced soy-sweet glaze with a glossy finish.",
    img: "/vite.svg",
  },
  {
    name: "Parmesan",
    accent: "#eab308",
    desc: "Buttery, cheesy, and crowd-friendly comfort flavor.",
    img: "/vite.svg",
  },
  {
    name: "Kimchi",
    accent: "#dc2626",
    desc: "Tangy umami heat inspired by classic Korean spice.",
    img: "/vite.svg",
  },
];

function toPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugify(value, fallback = "section") {
  const normalized = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function isDrinkCategory(value) {
  const normalized = String(value || "").toLowerCase();
  return normalized.includes("drink") || normalized.includes("beverage");
}

router.get("/flavors", async (_req, res) => {
  res.json(DEFAULT_FLAVORS);
});

router.get("/menu-sections", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
          COALESCE(m.Product_ID, p.id) AS product_id,
          COALESCE(m.Category_Name, 'Menu Favorites') AS category_name,
          COALESCE(m.Product_Name, p.name, 'Unnamed Item') AS product_name,
          COALESCE(m.Price, p.price, 0) AS price,
          COALESCE(p.description, '') AS description,
          COALESCE(p.promo_label, '') AS promo_label,
          COALESCE(p.image, '') AS image,
          COALESCE(p.availability_status, 'Available') AS availability_status
       FROM Menu m
       LEFT JOIN products p ON p.id = m.Product_ID
       WHERE COALESCE(m.Promo, '') <> 'RAW_MATERIAL'
       ORDER BY category_name ASC, product_name ASC`,
    );

    const grouped = new Map();
    for (const row of rows) {
      const categoryName = String(row.category_name || "Menu Favorites").trim();
      const key = slugify(categoryName, "menu-favorites");
      const group =
        grouped.get(key) ||
        {
          id: key,
          title: categoryName,
          subtext: isDrinkCategory(categoryName)
            ? "Refreshing add-ons and chilled favorites."
            : "Freshly prepared Crunch staples and customer picks.",
          items: [],
          isDrink: isDrinkCategory(categoryName),
        };

      group.items.push({
        name: String(row.product_name || "Unnamed Item"),
        price: toPrice(row.price),
        tag: String(row.promo_label || "").trim() || undefined,
        note: String(row.description || "").trim() || undefined,
        img: String(row.image || "").trim() || undefined,
      });

      grouped.set(key, group);
    }

    res.json(Array.from(grouped.values()));
  } catch (error) {
    console.error("GET /api/menu-sections error:", error);
    res.status(500).json({
      message: "Failed to load menu sections",
      error: error.message,
    });
  }
});

router.get("/promos", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
          p.id,
          COALESCE(m.Product_Name, p.name, 'Crunch Special') AS product_name,
          COALESCE(p.description, '') AS description,
          COALESCE(p.image, '') AS image,
          COALESCE(p.promo_label, '') AS promo_label,
          COALESCE(p.price, 0) AS regular_price,
          COALESCE(p.promo_price, 0) AS promo_price,
          COALESCE(p.is_promotional, 0) AS is_promotional
       FROM products p
       LEFT JOIN Menu m ON m.Product_ID = p.id
       WHERE COALESCE(p.is_promotional, 0) = 1
          OR p.promo_price IS NOT NULL
          OR COALESCE(TRIM(p.promo_label), '') <> ''
       ORDER BY p.id DESC`,
    );

    const promos = rows.map((row, index) => {
      const regularPrice = toPrice(row.regular_price);
      const promoPrice = toPrice(row.promo_price);
      const hasPromoPrice = promoPrice > 0 && promoPrice < regularPrice;
      const discount = hasPromoPrice
        ? `${Math.round(((regularPrice - promoPrice) / regularPrice) * 100)}% OFF`
        : undefined;

      return {
        id: `promo-${row.id}`,
        title: String(row.product_name || "Crunch Special"),
        subtitle: String(row.promo_label || "").trim() || undefined,
        description:
          String(row.description || "").trim() ||
          "Limited-time Crunch deal available while supplies last.",
        img: String(row.image || "").trim() || "",
        badge: index === 0 ? "Featured" : "Promo",
        badgeColor: index === 0 ? "#f59e0b" : "#e8501a",
        tag: hasPromoPrice ? `Now ${promoPrice.toFixed(2)}` : undefined,
        highlight: index === 0,
        discount,
      };
    });

    res.json(promos);
  } catch (error) {
    console.error("GET /api/promos error:", error);
    res.status(500).json({
      message: "Failed to load promos",
      error: error.message,
    });
  }
});

module.exports = router;
