SET @add_use_default_thresholds = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE Inventory ADD COLUMN use_default_thresholds TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Inventory'
    AND COLUMN_NAME = 'use_default_thresholds'
);
PREPARE stmt FROM @add_use_default_thresholds;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_low_stock_threshold = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE Inventory ADD COLUMN low_stock_threshold INT NULL',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Inventory'
    AND COLUMN_NAME = 'low_stock_threshold'
);
PREPARE stmt FROM @add_low_stock_threshold;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_critical_stock_threshold = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE Inventory ADD COLUMN critical_stock_threshold INT NULL',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Inventory'
    AND COLUMN_NAME = 'critical_stock_threshold'
);
PREPARE stmt FROM @add_critical_stock_threshold;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
