-- Additive Batch 2 migration. Existing purchase-order rows remain unchanged.
SET @has_po_product_id := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'purchase_order_items'
     AND COLUMN_NAME = 'product_id'
);
SET @add_po_product_id := IF(
  @has_po_product_id = 0,
  'ALTER TABLE purchase_order_items ADD COLUMN product_id INT NULL AFTER po_id',
  'SELECT 1'
);
PREPARE add_po_product_id_stmt FROM @add_po_product_id;
EXECUTE add_po_product_id_stmt;
DEALLOCATE PREPARE add_po_product_id_stmt;

SET @has_po_product_index := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'purchase_order_items'
     AND INDEX_NAME = 'idx_purchase_order_items_product_id'
);
SET @add_po_product_index := IF(
  @has_po_product_index = 0,
  'ALTER TABLE purchase_order_items ADD INDEX idx_purchase_order_items_product_id (product_id)',
  'SELECT 1'
);
PREPARE add_po_product_index_stmt FROM @add_po_product_index;
EXECUTE add_po_product_index_stmt;
DEALLOCATE PREPARE add_po_product_index_stmt;
