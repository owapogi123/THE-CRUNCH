-- READ-ONLY production audit. This script does not change any records.
-- Run only through the approved production read-only workflow and export the
-- result before requesting approval for the legacy data normalization.

SELECT
  COUNT(*) AS legacy_force_available_count
FROM Menu
WHERE COALESCE(manual_override, 0) = 1
  AND LOWER(TRIM(COALESCE(manual_status, 'Available'))) = 'available';

SELECT
  m.Product_ID AS product_id,
  m.Product_Name AS product_name,
  m.Category_Name AS category,
  m.manual_override,
  m.manual_status,
  COUNT(mi.menu_ingredient_id) AS ingredient_count
FROM Menu m
LEFT JOIN menu_item_ingredients mi
  ON mi.menu_product_id = m.Product_ID
WHERE COALESCE(m.manual_override, 0) = 1
  AND LOWER(TRIM(COALESCE(m.manual_status, 'Available'))) = 'available'
GROUP BY
  m.Product_ID,
  m.Product_Name,
  m.Category_Name,
  m.manual_override,
  m.manual_status
ORDER BY m.Product_ID;
