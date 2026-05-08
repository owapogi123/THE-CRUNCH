CREATE TABLE IF NOT EXISTS inventory_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  type ENUM('raw_material','ingredient','finished') NOT NULL DEFAULT 'ingredient',
  date_tracking_type ENUM('none','expiry','shelf_life') NOT NULL DEFAULT 'none',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS type ENUM('raw_material','ingredient','finished') NOT NULL DEFAULT 'ingredient',
  ADD COLUMN IF NOT EXISTS date_tracking_type ENUM('none','expiry','shelf_life') NOT NULL DEFAULT 'none';

UPDATE inventory_categories
   SET type = CASE
     WHEN LOWER(TRIM(name)) = 'raw material' THEN 'raw_material'
     WHEN type IS NULL OR type = '' THEN 'ingredient'
     ELSE type
   END,
       date_tracking_type = CASE
     WHEN LOWER(TRIM(name)) = 'raw material' THEN 'shelf_life'
     WHEN LOWER(TRIM(name)) IN ('sauces', 'aromatics') THEN 'expiry'
     WHEN LOWER(TRIM(name)) = 'ingredients' THEN 'shelf_life'
     WHEN LOWER(TRIM(name)) = 'packaging' THEN 'none'
     ELSE COALESCE(NULLIF(date_tracking_type, ''), 'none')
   END;

CREATE TABLE IF NOT EXISTS inventory_units (
  unit_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  abbreviation VARCHAR(30) NULL,
  base_unit VARCHAR(100) NULL,
  conversion_to_base DECIMAL(12,4) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE inventory_units
  ADD COLUMN IF NOT EXISTS base_unit VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS conversion_to_base DECIMAL(12,4) NULL;

CREATE TABLE IF NOT EXISTS menu_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO inventory_categories (name, type, date_tracking_type, is_active)
SELECT 'Raw Material', 'raw_material', 'shelf_life', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER('Raw Material')
);

INSERT INTO inventory_categories (name, type, date_tracking_type, is_active)
SELECT 'Sauces', 'ingredient', 'expiry', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER('Sauces')
);

INSERT INTO inventory_categories (name, type, date_tracking_type, is_active)
SELECT 'Ingredients', 'ingredient', 'shelf_life', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER('Ingredients')
);

INSERT INTO inventory_categories (name, type, date_tracking_type, is_active)
SELECT 'Aromatics', 'ingredient', 'expiry', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER('Aromatics')
);

INSERT INTO inventory_categories (name, type, date_tracking_type, is_active)
SELECT 'Packaging', 'finished', 'none', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_categories WHERE LOWER(name) = LOWER('Packaging')
);

INSERT INTO menu_categories (name, display_order, is_active)
SELECT 'Menu Food', 1, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories WHERE LOWER(name) = LOWER('Menu Food')
);

INSERT INTO menu_categories (name, display_order, is_active)
SELECT 'Beverages', 2, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories WHERE LOWER(name) = LOWER('Beverages')
);

INSERT INTO menu_categories (name, display_order, is_active)
SELECT 'Desserts', 3, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories WHERE LOWER(name) = LOWER('Desserts')
);

INSERT INTO menu_categories (name, display_order, is_active)
SELECT 'Combo Meals', 4, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories WHERE LOWER(name) = LOWER('Combo Meals')
);

INSERT INTO menu_categories (name, display_order, is_active)
SELECT 'Snacks', 5, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories WHERE LOWER(name) = LOWER('Snacks')
);

INSERT INTO menu_categories (name, display_order, is_active)
SELECT 'Promotional Items', 6, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM menu_categories WHERE LOWER(name) = LOWER('Promotional Items')
);
