-- Additive, idempotent notification lifecycle storage.
-- This migration preserves inventory data and existing users.
CREATE TABLE IF NOT EXISTS inventory_alerts (
  alert_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inventory_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(150) NOT NULL,
  category VARCHAR(150) NOT NULL DEFAULT 'Uncategorized',
  unit VARCHAR(50) NOT NULL DEFAULT 'piece',
  stock_value DECIMAL(14,4) NOT NULL DEFAULT 0,
  severity ENUM('low','critical','out') NOT NULL,
  low_threshold DECIMAL(14,4) NOT NULL DEFAULT 0,
  critical_threshold DECIMAL(14,4) NOT NULL DEFAULT 0,
  active_episode TINYINT(1) NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolution_reason ENUM('recovered','severity_changed','inventory_removed') NULL,
  UNIQUE KEY uq_inventory_alerts_active (inventory_id, active_episode),
  KEY idx_inventory_alerts_history (inventory_id, created_at),
  KEY idx_inventory_alerts_resolved (resolved_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_alert_reads (
  alert_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alert_id, user_id),
  KEY idx_inventory_alert_reads_user (user_id, read_at),
  CONSTRAINT fk_inventory_alert_reads_alert
    FOREIGN KEY (alert_id) REFERENCES inventory_alerts(alert_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_inventory_alert_reads_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;
