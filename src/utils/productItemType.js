const STOCK_ITEM = "stock_item";
const MENU_ITEM = "menu_item";

const STOCK_CATEGORY_NAMES = [
  "raw material",
  "raw materials",
  "sauces",
  "ingredients",
  "aromatics",
  "supplies",
];

function normalizeItemType(value, fallback = STOCK_ITEM) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === MENU_ITEM) return MENU_ITEM;
  if (normalized === STOCK_ITEM) return STOCK_ITEM;
  return fallback;
}

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [
    columnName,
  ]);
  return rows.length > 0;
}

async function ensureProductsItemTypeSchema(connection) {
  return hasColumn(connection, "products", "item_type");
}

function getLegacyItemTypeCaseSql(productAlias = "p", menuAlias = "m") {
  const productRef = productAlias ? `${productAlias}.` : "";
  const menuRef = menuAlias ? `${menuAlias}.` : "";
  const quotedCategories = STOCK_CATEGORY_NAMES.map((name) => `'${name}'`).join(", ");

  return `CASE
    WHEN COALESCE(${menuRef}Promo, '') = 'MENU FOOD'
      OR LOWER(COALESCE(${menuRef}Category_Name, '')) LIKE '%menu food%'
      THEN '${MENU_ITEM}'
    WHEN LOWER(TRIM(COALESCE(${menuRef}Category_Name, ''))) IN (${quotedCategories})
      THEN '${STOCK_ITEM}'
    ELSE '${STOCK_ITEM}'
  END`;
}

function getProductItemTypeExpression(hasItemTypeColumn, productAlias = "p", menuAlias = "m") {
  if (hasItemTypeColumn) {
    return `CASE
      WHEN LOWER(TRIM(COALESCE(${productAlias}.item_type, ''))) IN ('${STOCK_ITEM}', '${MENU_ITEM}')
        THEN LOWER(TRIM(${productAlias}.item_type))
      ELSE ${getLegacyItemTypeCaseSql(productAlias, menuAlias)}
    END`;
  }
  return getLegacyItemTypeCaseSql(productAlias, menuAlias);
}

function inferLegacyItemType(row) {
  const promo = String(row?.promo ?? "").trim().toUpperCase();
  const category = String(row?.category_name ?? row?.category ?? "")
    .trim()
    .toLowerCase();

  if (promo === "MENU FOOD" || category.includes("menu food")) {
    return MENU_ITEM;
  }
  if (STOCK_CATEGORY_NAMES.includes(category)) {
    return STOCK_ITEM;
  }
  return STOCK_ITEM;
}

async function assertProductsMatchItemType(
  connection,
  productIds,
  expectedType,
  label,
) {
  const normalizedIds = Array.from(
    new Set(
      (productIds ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (normalizedIds.length === 0) return;

  const hasItemTypeColumn = await ensureProductsItemTypeSchema(connection);
  const itemTypeExpr = getProductItemTypeExpression(hasItemTypeColumn, "p", "m");
  const [rows] = await connection.query(
    `SELECT
       p.id,
       ${itemTypeExpr} AS effective_item_type,
       COALESCE(m.Promo, '') AS promo,
       COALESCE(m.Category_Name, '') AS category_name
     FROM products p
     LEFT JOIN Menu m ON m.Product_ID = p.id
     WHERE p.id IN (?)`,
    [normalizedIds],
  );

  const rowMap = new Map(
    rows.map((row) => [
      Number(row.id),
      hasItemTypeColumn
        ? normalizeItemType(row.effective_item_type)
        : inferLegacyItemType(row),
    ]),
  );

  for (const productId of normalizedIds) {
    const actualType = rowMap.get(productId);
    if (!actualType) {
      throw new Error(`${label} product ${productId} was not found`);
    }
    if (actualType !== expectedType) {
      throw new Error(
        `${label} product ${productId} must be ${expectedType}, found ${actualType}`,
      );
    }
  }
}

module.exports = {
  MENU_ITEM,
  STOCK_ITEM,
  STOCK_CATEGORY_NAMES,
  ensureProductsItemTypeSchema,
  getProductItemTypeExpression,
  normalizeItemType,
  assertProductsMatchItemType,
};
