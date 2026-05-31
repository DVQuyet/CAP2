SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS chatbot_memory (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  account_id INT NULL,
  clan_id INT NOT NULL,
  memory_json JSON NOT NULL,
  expires_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chatbot_memory_session (session_id),
  KEY idx_chatbot_memory_account_clan (account_id, clan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_ai_audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NULL,
  clan_id INT NULL,
  purpose VARCHAR(80) NOT NULL,
  request_json JSON NULL,
  response_json JSON NULL,
  accepted TINYINT(1) NOT NULL DEFAULT 0,
  rejection_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_chatbot_ai_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_chatbot_ai_index_if_missing()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chatbot_messages'
  ) AND NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chatbot_messages'
      AND INDEX_NAME = 'idx_msgs_conv_time'
  ) THEN
    ALTER TABLE chatbot_messages
      ADD INDEX idx_msgs_conv_time (conversation_id, created_at);
  END IF;
END$$
DELIMITER ;

CALL add_chatbot_ai_index_if_missing();
DROP PROCEDURE IF EXISTS add_chatbot_ai_index_if_missing;
