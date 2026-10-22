SET NAMES utf8mb4;

-- "Xóa lịch sử chatbot" ẩn mềm tin nhắn: thêm hidden_at (idempotent, chỉ thêm khi chưa có cột).
SET @has_hidden_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chatbot_messages' AND COLUMN_NAME = 'hidden_at'
);
SET @ddl := IF(@has_hidden_at = 0,
  'ALTER TABLE chatbot_messages ADD COLUMN hidden_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
