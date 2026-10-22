SET NAMES utf8mb4;

-- Đánh giá 👍/👎 cho câu trả lời của trợ lý (thêm mới, idempotent).
CREATE TABLE IF NOT EXISTS chatbot_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT NOT NULL,
  account_id INT NOT NULL,
  clan_id INT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_chatbot_feedback_message_account (message_id, account_id),
  KEY idx_chatbot_feedback_clan_rating (clan_id, rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
