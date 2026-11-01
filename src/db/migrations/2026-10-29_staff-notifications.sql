-- Notification System Phase 2: durable refund-request and purchase-order events.
-- This migration is additive and safe to run after the Phase 1 lifecycle migration.

CREATE TABLE IF NOT EXISTS staff_notifications (
    notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dedupe_key VARCHAR(190) NOT NULL,
    category ENUM('refund_request','purchase_order','inventory_change') NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    audience ENUM('administrator','inventory_manager','administrator,inventory_manager') NOT NULL,
    actor_user_id INT NULL,
    title VARCHAR(190) NOT NULL,
    message VARCHAR(500) NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT '',
    metadata_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    PRIMARY KEY (notification_id),
    UNIQUE KEY uq_staff_notifications_dedupe (dedupe_key),
    KEY idx_staff_notifications_audience_created (audience, created_at),
    KEY idx_staff_notifications_category_entity (category, entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_notification_reads (
    notification_id BIGINT UNSIGNED NOT NULL,
    user_id INT NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id),
    KEY idx_staff_notification_reads_user (user_id, read_at),
    CONSTRAINT fk_staff_notification_reads_notification
      FOREIGN KEY (notification_id) REFERENCES staff_notifications(notification_id)
      ON DELETE CASCADE,
    CONSTRAINT fk_staff_notification_reads_user
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE
) ENGINE=InnoDB;

SET @refund_reason_column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'refund_requests'
     AND COLUMN_NAME = 'reason_snapshot'
);
SET @refund_reason_column_sql = IF(
  @refund_reason_column_exists = 0,
  "ALTER TABLE refund_requests ADD COLUMN reason_snapshot VARCHAR(500) NOT NULL DEFAULT 'Cashier requested a refund review.' AFTER requester_role_snapshot",
  'SELECT 1'
);
PREPARE refund_reason_column_statement FROM @refund_reason_column_sql;
EXECUTE refund_reason_column_statement;
DEALLOCATE PREPARE refund_reason_column_statement;
