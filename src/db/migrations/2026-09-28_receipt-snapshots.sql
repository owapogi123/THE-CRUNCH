-- Additive Stage 2 migration. The existing Receipt table and all order data remain untouched.
CREATE TABLE IF NOT EXISTS receipt_snapshots (
  order_id INT PRIMARY KEY,
  transaction_id CHAR(12) NOT NULL,
  order_number INT UNSIGNED NOT NULL,
  order_date DATETIME NOT NULL,
  order_type VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  discount_name VARCHAR(100) NULL,
  discount_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  service_charge_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  service_charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  cash_tendered DECIMAL(12,2) NULL,
  change_amount DECIMAL(12,2) NULL,
  customer_type VARCHAR(100) NULL,
  table_number VARCHAR(50) NULL,
  order_note TEXT NULL,
  currency VARCHAR(12) NOT NULL,
  merchant_name VARCHAR(150) NOT NULL,
  merchant_tagline VARCHAR(255) NULL,
  merchant_email VARCHAR(150) NULL,
  merchant_phone VARCHAR(100) NULL,
  merchant_address VARCHAR(500) NULL,
  timezone VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipt_snapshots_order
    FOREIGN KEY (order_id) REFERENCES orders(Order_ID)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS receipt_snapshot_items (
  receipt_item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  original_product_id INT NULL,
  product_name VARCHAR(255) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  quantity INT NOT NULL,
  line_subtotal DECIMAL(12,2) NOT NULL,
  item_note TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  INDEX idx_receipt_snapshot_items_order (order_id, sort_order),
  CONSTRAINT fk_receipt_snapshot_items_snapshot
    FOREIGN KEY (order_id) REFERENCES receipt_snapshots(order_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
