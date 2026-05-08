CREATE TABLE IF NOT EXISTS discount_types (
  discount_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO discount_types (name, percentage, is_active)
SELECT 'Regular customer', 0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM discount_types WHERE LOWER(name) = LOWER('Regular customer')
);

INSERT INTO discount_types (name, percentage, is_active)
SELECT 'PWD', 20, 1
WHERE NOT EXISTS (
  SELECT 1 FROM discount_types WHERE LOWER(name) = LOWER('PWD')
);

INSERT INTO discount_types (name, percentage, is_active)
SELECT 'Senior Citizen', 20, 1
WHERE NOT EXISTS (
  SELECT 1 FROM discount_types WHERE LOWER(name) = LOWER('Senior Citizen')
);
