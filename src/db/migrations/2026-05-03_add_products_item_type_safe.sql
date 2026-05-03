-- Safe manual migration for products.item_type
-- Railway / MySQL compatible
-- This file does NOT drop, delete, truncate, or rename anything.
-- Run the preview SELECT first, review the suggested item_type values,
-- then run the ALTER/UPDATE section manually.

-- 1. Preview current records with suggested item_type
SELECT
  p.id AS product_id,
  p.name AS product_name,
  COALESCE(m.Category_Name, '') AS category,
  COALESCE(m.Promo, '') AS promo,
  CASE
    WHEN COALESCE(m.Promo, '') = 'MENU FOOD'
      OR LOWER(COALESCE(m.Category_Name, '')) LIKE '%menu food%'
      THEN 'menu_item'
    WHEN LOWER(TRIM(COALESCE(m.Category_Name, ''))) IN (
      'raw material',
      'raw materials',
      'sauces',
      'ingredients',
      'aromatics',
      'supplies'
    )
      THEN 'stock_item'
    ELSE 'stock_item'
  END AS suggested_item_type
FROM products p
LEFT JOIN Menu m ON m.Product_ID = p.id
ORDER BY p.id ASC;

-- 2. Check whether the column already exists
SELECT
  COUNT(*) AS item_type_column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'products'
  AND COLUMN_NAME = 'item_type';

-- 3. Add the column only if it is missing
SET @item_type_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'item_type'
);

SET @alter_sql := IF(
  @item_type_column_exists = 0,
  "ALTER TABLE products ADD COLUMN item_type ENUM('stock_item','menu_item') NOT NULL DEFAULT 'stock_item'",
  "SELECT 'products.item_type already exists' AS info"
);

PREPARE stmt_alter_item_type FROM @alter_sql;
EXECUTE stmt_alter_item_type;
DEALLOCATE PREPARE stmt_alter_item_type;

-- 4. Backfill explicit menu items
UPDATE products p
LEFT JOIN Menu m ON m.Product_ID = p.id
SET p.item_type = 'menu_item'
WHERE COALESCE(m.Promo, '') = 'MENU FOOD'
   OR LOWER(COALESCE(m.Category_Name, '')) LIKE '%menu food%';

-- 5. Backfill known stock items
UPDATE products p
LEFT JOIN Menu m ON m.Product_ID = p.id
SET p.item_type = 'stock_item'
WHERE LOWER(TRIM(COALESCE(m.Category_Name, ''))) IN (
  'raw material',
  'raw materials',
  'sauces',
  'ingredients',
  'aromatics',
  'supplies'
);

-- 6. Keep uncertain rows as stock_item and review them separately
SELECT
  p.id AS product_id,
  p.name AS product_name,
  COALESCE(m.Category_Name, '') AS category,
  COALESCE(m.Promo, '') AS promo,
  p.item_type
FROM products p
LEFT JOIN Menu m ON m.Product_ID = p.id
WHERE p.item_type = 'stock_item'
  AND COALESCE(m.Promo, '') <> 'MENU FOOD'
  AND LOWER(COALESCE(m.Category_Name, '')) NOT LIKE '%menu food%'
  AND LOWER(TRIM(COALESCE(m.Category_Name, ''))) NOT IN (
    'raw material',
    'raw materials',
    'sauces',
    'ingredients',
    'aromatics',
    'supplies'
  )
ORDER BY p.id ASC;
