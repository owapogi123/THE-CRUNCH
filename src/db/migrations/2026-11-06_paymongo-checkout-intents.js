"use strict";

const VERSION = "2026-11-06_paymongo-checkout-intents";

async function up(connection, { log = console } = {}) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS paymongo_checkout_intents (
      intent_id CHAR(36) NOT NULL PRIMARY KEY,
      checkout_request_id CHAR(36) NOT NULL,
      customer_user_id INT NOT NULL,
      items_json JSON NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      tax_rate DECIMAL(9,4) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      service_charge_rate DECIMAL(9,4) NOT NULL DEFAULT 0,
      service_charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL,
      amount_centavos BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'PHP',
      order_type VARCHAR(20) NOT NULL DEFAULT 'take-out',
      customer_type VARCHAR(100) NULL,
      order_note TEXT NULL,
      payment_context_token TEXT NOT NULL,
      checkout_session_id VARCHAR(100) NULL,
      checkout_url VARCHAR(2048) NULL,
      payment_reference VARCHAR(255) NULL,
      provider_status VARCHAR(50) NULL,
      livemode TINYINT(1) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending_session',
      verified_at DATETIME NULL,
      finalized_order_id INT NULL,
      finalized_at DATETIME NULL,
      finalization_attempts INT UNSIGNED NOT NULL DEFAULT 0,
      reconciliation_code VARCHAR(100) NULL,
      reconciliation_message VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_paymongo_intents_checkout_request (checkout_request_id),
      UNIQUE KEY uq_paymongo_intents_checkout_session (checkout_session_id),
      INDEX idx_paymongo_intents_customer_status (customer_user_id, status),
      INDEX idx_paymongo_intents_finalized_order (finalized_order_id)
    ) ENGINE=InnoDB
  `);
  log.log("Migration: ensured durable PayMongo checkout intents.");
}

module.exports = { VERSION, up };
