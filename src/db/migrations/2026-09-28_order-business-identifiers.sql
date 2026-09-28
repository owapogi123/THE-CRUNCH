-- Additive Stage 1 migration. Existing Order_ID values and relationships are untouched.
CREATE TABLE IF NOT EXISTS order_daily_counters (
  business_date DATE NOT NULL,
  counter_scope VARCHAR(16) NOT NULL,
  counter_value INT UNSIGNED NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_date, counter_scope)
) ENGINE=InnoDB;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'transaction_id'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN transaction_id CHAR(12) NULL'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'order_number'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN order_number INT UNSIGNED NULL'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'business_date'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD COLUMN business_date DATE NULL'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND INDEX_NAME = 'uq_orders_transaction_id'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD UNIQUE INDEX uq_orders_transaction_id (transaction_id)'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND INDEX_NAME = 'uq_orders_business_order_number'
  ),
  'SELECT 1',
  'ALTER TABLE orders ADD UNIQUE INDEX uq_orders_business_order_number (business_date, order_number)'
);
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;
