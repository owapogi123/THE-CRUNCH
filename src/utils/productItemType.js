const STOCK_ITEM = "stock_item";
const MENU_ITEM = "menu_item";
const SELECTION_OPTION = "selection_option";
const { assertTableColumns } = require("../services/schemaAssertions");
const {
  REDESIGNED_SCHEMA_PROFILE,
  getSchemaProfile,
} = require("../db/schemaProfile");
let schemaReady = false;
let schemaReadyPromise = null;

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
  if (normalized === SELECTION_OPTION) return SELECTION_OPTION;
  return fallback;
}

function isRedesignedProfile(profile = getSchemaProfile()) {
  return profile === REDESIGNED_SCHEMA_PROFILE;
}

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName],
  );
  return rows.length > 0;
}

function getMenuDrivenItemTypeCaseSql(
  menuAlias = "m",
  fallbackSql = `'${STOCK_ITEM}'`,
) {
  const menuRef = menuAlias ? `${menuAlias}.` : "";
  const quotedCategories = STOCK_CATEGORY_NAMES.map((name) => `'${name}'`).join(", ");

  return `CASE
    WHEN ${menuRef}Product_ID IS NOT NULL
      AND (
        LOWER(TRIM(COALESCE(${menuRef}Promo, ''))) = 'raw_material'
        OR LOWER(TRIM(COALESCE(${menuRef}Category_Name, ''))) IN (${quotedCategories})
      )
      THEN '${STOCK_ITEM}'
    WHEN ${menuRef}Product_ID IS NOT NULL
      THEN '${MENU_ITEM}'
    ELSE ${fallbackSql}
  END`;
}

async function syncMenuRowsIntoProducts(connection) {
  await connection.query(
    `INSERT INTO products (id, name, price, quantity, description, item_type)
     SELECT
       m.Product_ID,
       COALESCE(NULLIF(TRIM(m.Product_Name), ''), CONCAT('Product #', m.Product_ID)),
       COALESCE(m.Price, 0),
       COALESCE(m.Stock, 0),
       NULL,
       ${getMenuDrivenItemTypeCaseSql("m")}
     FROM Menu m
     LEFT JOIN products p ON p.id = m.Product_ID
     WHERE p.id IS NULL`,
  );
}

async function backfillProductsItemType(connection, overwriteExisting = false) {
  const whereClause = overwriteExisting
    ? ""
    : `WHERE LOWER(TRIM(COALESCE(p.item_type, ''))) NOT IN ('${STOCK_ITEM}', '${MENU_ITEM}')`;
  await connection.query(
    `UPDATE products p
     LEFT JOIN Menu m ON m.Product_ID = p.id
     SET p.item_type = ${getMenuDrivenItemTypeCaseSql(
       "m",
       `CASE
          WHEN LOWER(TRIM(COALESCE(p.item_type, ''))) IN ('${STOCK_ITEM}', '${MENU_ITEM}')
            THEN LOWER(TRIM(p.item_type))
          ELSE '${STOCK_ITEM}'
        END`,
     )}
     ${whereClause}`,
  );
}

// Administrative setup only. Normal request paths must use the read-only
// compatibility assertion below and never repair product data automatically.
async function initializeProductsItemTypeSchema(connection) {
  if (isRedesignedProfile()) {
    await ensureProductsItemTypeSchema(connection);
    return true;
  }

  if (schemaReady) return true;
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    const hasItemTypeColumn = await hasColumn(connection, "products", "item_type");
    if (!hasItemTypeColumn) {
      await connection.query(
        `ALTER TABLE products
         ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT '${STOCK_ITEM}'`,
      );
    }

    await syncMenuRowsIntoProducts(connection);
    // When the column is first introduced, classify all legacy rows once. On
    // later startups, preserve explicit administrator corrections.
    await backfillProductsItemType(connection, !hasItemTypeColumn);

    schemaReady = true;
    return true;
  })();

  try {
    return await schemaReadyPromise;
  } catch (error) {
    schemaReadyPromise = null;
    throw error;
  }
}

async function ensureProductsItemTypeSchema(connection) {
  const contract = isRedesignedProfile()
    ? { products: ["product_id", "product_type"] }
    : { products: ["id", "item_type"] };
  await assertTableColumns(
    connection,
    contract,
    "Product item-type schema",
  );
  return true;
}

function getLegacyItemTypeCaseSql(productAlias = "p", menuAlias = "m") {
  const fallbackSql = productAlias
    ? `CASE
         WHEN LOWER(TRIM(COALESCE(${productAlias}.item_type, ''))) IN ('${STOCK_ITEM}', '${MENU_ITEM}')
           THEN LOWER(TRIM(${productAlias}.item_type))
         ELSE '${STOCK_ITEM}'
       END`
    : `'${STOCK_ITEM}'`;

  return getMenuDrivenItemTypeCaseSql(menuAlias, fallbackSql);
}

function getProductItemTypeExpression(
  hasItemTypeColumn,
  productAlias = "p",
  menuAlias = "m",
) {
  if (isRedesignedProfile()) {
    const productRef = productAlias ? `${productAlias}.` : "";
    return `LOWER(TRIM(${productRef}product_type))`;
  }

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
  const normalizedExpectedType = normalizeItemType(expectedType, null);
  if (!normalizedExpectedType) {
    throw new Error(`Unsupported product type: ${expectedType}`);
  }

  const normalizedIds = Array.from(
    new Set(
      (productIds ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (normalizedIds.length === 0) return;

  const hasItemTypeColumn = await ensureProductsItemTypeSchema(connection);
  let rows;
  if (isRedesignedProfile()) {
    [rows] = await connection.query(
      `SELECT
         p.product_id AS id,
         p.product_type AS effective_item_type,
         p.selling_price,
         category.system_key AS category_system_key,
         balance.product_id AS balance_product_id
       FROM products p
       LEFT JOIN menu_categories category
         ON category.category_id = p.menu_category_id
       LEFT JOIN inventory_balances balance
         ON balance.product_id = p.product_id
       WHERE p.product_id IN (?)`,
      [normalizedIds],
    );
  } else {
    const itemTypeExpr = getProductItemTypeExpression(
      hasItemTypeColumn,
      "p",
      "m",
    );
    [rows] = await connection.query(
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
  }

  const rowMap = new Map(
    rows.map((row) => {
      const itemType = hasItemTypeColumn
        ? normalizeItemType(row.effective_item_type, null)
        : inferLegacyItemType(row);
      return [Number(row.id), { itemType, row }];
    }),
  );

  for (const productId of normalizedIds) {
    const matched = rowMap.get(productId);
    if (!matched?.itemType) {
      throw new Error(`${label} product ${productId} was not found`);
    }
    const actualType = matched.itemType;
    if (actualType !== normalizedExpectedType) {
      throw new Error(
        `${label} product ${productId} must be ${normalizedExpectedType}, found ${actualType}`,
      );
    }
    if (isRedesignedProfile() && actualType === SELECTION_OPTION) {
      const categorySystemKey = String(matched.row.category_system_key || "")
        .trim()
        .toLowerCase();
      const sellingPrice = matched.row.selling_price;
      if (categorySystemKey !== "chicken_flavors") {
        throw new Error(
          `${label} product ${productId} is not in the protected chicken_flavors category`,
        );
      }
      if (sellingPrice !== null && Number(sellingPrice) !== 0) {
        throw new Error(`${label} product ${productId} cannot have a selling price`);
      }
      if (
        matched.row.balance_product_id !== null &&
        matched.row.balance_product_id !== undefined
      ) {
        throw new Error(`${label} product ${productId} cannot have an inventory balance`);
      }
    }
  }
}

module.exports = {
  MENU_ITEM,
  SELECTION_OPTION,
  STOCK_ITEM,
  STOCK_CATEGORY_NAMES,
  ensureProductsItemTypeSchema,
  initializeProductsItemTypeSchema,
  getProductItemTypeExpression,
  normalizeItemType,
  assertProductsMatchItemType,
};
