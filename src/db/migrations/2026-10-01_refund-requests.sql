CREATE TABLE IF NOT EXISTS refund_requests (
  refund_request_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  order_number_snapshot VARCHAR(32) NOT NULL,
  requester_user_id INT NOT NULL,
  requester_name_snapshot VARCHAR(100) NOT NULL,
  requester_role_snapshot VARCHAR(50) NOT NULL DEFAULT 'cashier',
  status ENUM('Pending','Ignored','Actioned') NOT NULL DEFAULT 'Pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_user_id INT NULL,
  reviewed_at TIMESTAMP NULL,
  UNIQUE KEY uq_refund_requests_order (order_id),
  KEY idx_refund_requests_status_requested (status, requested_at),
  CONSTRAINT fk_refund_requests_order
    FOREIGN KEY (order_id) REFERENCES orders(Order_ID)
) ENGINE=InnoDB;
