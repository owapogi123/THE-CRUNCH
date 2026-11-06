"use strict";

const VERSION = "2026-11-06_paymongo-webhook-events";

async function up(connection, { log = console } = {}) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS paymongo_webhook_events (
      event_id VARCHAR(100) NOT NULL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      checkout_session_id VARCHAR(100) NOT NULL,
      customer_user_id INT NOT NULL,
      payment_reference VARCHAR(255) NOT NULL,
      expected_amount_centavos BIGINT UNSIGNED NOT NULL,
      paid_amount_centavos BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL,
      livemode TINYINT(1) NOT NULL,
      provider_created_at BIGINT UNSIGNED NULL,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_paymongo_webhook_checkout_session (checkout_session_id)
    ) ENGINE=InnoDB
  `);
  log.log("Migration: ensured durable PayMongo webhook replay protection.");
}

module.exports = { VERSION, up };
