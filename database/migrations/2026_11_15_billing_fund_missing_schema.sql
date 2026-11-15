-- Bổ sung phần schema mà mã nguồn dùng nhưng DB dựng từ database/schema/init.sql chưa có:
-- gói cước (plans, subscriptions, payments), quỹ (fund_campaigns + cột của event_costs, event_contributions),
-- mã đặt lại mật khẩu (password_reset_tokens). Định nghĩa theo schema bản chạy trước đây, cộng các cột mà
-- ensurePaymentPurchaseColumns / ensureEventCostRecipientColumns / ensurePasswordResetTokensTable thêm.
-- Idempotent: chạy lại không đổi gì. Không tạo dữ liệu: gói FREE do admin tạo ở trang quản trị gói.

CREATE TABLE IF NOT EXISTS plans (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  price_vnd INT NOT NULL DEFAULT 0,
  billing_cycle ENUM('free','monthly','yearly','lifetime') NOT NULL DEFAULT 'monthly',
  person_limit INT NOT NULL,
  account_limit INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT NOT NULL AUTO_INCREMENT,
  clan_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('free','pending','active','expired','cancelled') NOT NULL DEFAULT 'free',
  started_at DATETIME NULL,
  expires_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_subscriptions_clan (clan_id),
  KEY idx_subscriptions_plan (plan_id),
  KEY idx_subscriptions_status_expires (status, expires_at),
  CONSTRAINT fk_subscriptions_clan FOREIGN KEY (clan_id) REFERENCES clans (id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT NOT NULL AUTO_INCREMENT,
  clan_id INT NOT NULL,
  subscription_id INT NULL,
  plan_id INT NOT NULL,
  payer_account_id INT NULL,
  provider ENUM('vnpay','momo','stripe','manual','sepay') NOT NULL DEFAULT 'manual',
  order_code VARCHAR(100) NOT NULL,
  amount_vnd INT NOT NULL,
  unit_amount_vnd INT NULL,
  period_quantity INT NOT NULL DEFAULT 1,
  period_unit ENUM('month','year','lifetime') NOT NULL DEFAULT 'month',
  period_months INT NULL,
  billing_cycle VARCHAR(20) NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  status ENUM('pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
  provider_transaction_id VARCHAR(255) NULL,
  paid_at DATETIME NULL,
  period_started_at DATETIME NULL,
  period_expires_at DATETIME NULL,
  plan_snapshot_json JSON NULL,
  raw_response JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_payments_order_code (order_code),
  KEY idx_payments_clan (clan_id),
  KEY idx_payments_plan (plan_id),
  KEY idx_payments_payer (payer_account_id),
  KEY idx_payments_status_created (status, created_at),
  CONSTRAINT fk_payments_clan FOREIGN KEY (clan_id) REFERENCES clans (id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_payer FOREIGN KEY (payer_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fund_campaigns (
  id INT NOT NULL AUTO_INCREMENT,
  clan_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  target_goal DECIMAL(15,2) DEFAULT 0,
  year INT NOT NULL,
  amount_per_member DECIMAL(15,2) DEFAULT 0.00,
  deadline DATE NULL,
  status ENUM('open','closed') DEFAULT 'open',
  bank_name VARCHAR(100) NULL,
  bank_account VARCHAR(50) NULL,
  bank_owner VARCHAR(100) NULL,
  qr_code_media_id INT NULL,
  contribution_unit_definition ENUM('males_only','adults_all','per_family') DEFAULT 'males_only',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_campaign_clan (clan_id),
  CONSTRAINT fk_campaign_clan FOREIGN KEY (clan_id) REFERENCES clans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_password_reset_account (account_id),
  CONSTRAINT fk_password_reset_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- event_costs: thứ tự dưới đây giữ đúng các mệnh đề AFTER mà ensureEventCostRecipientColumns dùng.
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'clan_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN clan_id INT NOT NULL AFTER id', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'campaign_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN campaign_id INT NULL AFTER event_id', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'category');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN category VARCHAR(100) DEFAULT ''Khác''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'recipient_person_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN recipient_person_id INT NULL AFTER campaign_id', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'recipient_note');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN recipient_note TEXT NULL AFTER note', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'paid_to_manager');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN paid_to_manager TINYINT(1) NOT NULL DEFAULT 0 AFTER recipient_note', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'status');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN status ENUM(''pending'',''approved'',''rejected'') NOT NULL DEFAULT ''approved'' AFTER category', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'evidence_media_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN evidence_media_id INT NULL AFTER category', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'method');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_costs ADD COLUMN method VARCHAR(50) NOT NULL DEFAULT ''Tiền mặt'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND INDEX_NAME = 'fk_costs_clan');
SET @ddl := IF(@has = 0, 'CREATE INDEX fk_costs_clan ON event_costs (clan_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND INDEX_NAME = 'fk_costs_campaign');
SET @ddl := IF(@has = 0, 'CREATE INDEX fk_costs_campaign ON event_costs (campaign_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- event_contributions
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'clan_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_contributions ADD COLUMN clan_id INT NOT NULL AFTER id', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'campaign_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_contributions ADD COLUMN campaign_id INT NULL AFTER event_id', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'status');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_contributions ADD COLUMN status ENUM(''pending'',''approved'',''rejected'') DEFAULT ''approved''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'evidence_media_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_contributions ADD COLUMN evidence_media_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'manager_note');
SET @ddl := IF(@has = 0, 'ALTER TABLE event_contributions ADD COLUMN manager_note TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND INDEX_NAME = 'fk_contrib_clan');
SET @ddl := IF(@has = 0, 'CREATE INDEX fk_contrib_clan ON event_contributions (clan_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND INDEX_NAME = 'fk_contrib_campaign');
SET @ddl := IF(@has = 0, 'CREATE INDEX fk_contrib_campaign ON event_contributions (campaign_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
