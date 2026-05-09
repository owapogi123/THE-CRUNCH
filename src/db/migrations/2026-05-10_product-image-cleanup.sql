UPDATE products
SET image = '/img/placeholder.jpg'
WHERE image IS NOT NULL
  AND TRIM(image) <> ''
  AND image LIKE 'data:image%';
