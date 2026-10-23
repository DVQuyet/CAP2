SET NAMES utf8mb4;

-- Sự kiện lịch gắn với một người (giỗ, sinh nhật) và lặp hằng năm: thêm person_id, repeat_yearly.
-- Idempotent: chỉ thêm cột khi chưa có. Code vẫn chạy được nếu chưa chạy file này (bỏ qua hai cột).
SET @has_person_id := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calendar_events' AND COLUMN_NAME = 'person_id'
);
SET @ddl := IF(@has_person_id = 0,
  'ALTER TABLE calendar_events ADD COLUMN person_id INT NULL AFTER note',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_repeat_yearly := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calendar_events' AND COLUMN_NAME = 'repeat_yearly'
);
SET @ddl := IF(@has_repeat_yearly = 0,
  'ALTER TABLE calendar_events ADD COLUMN repeat_yearly TINYINT(1) NOT NULL DEFAULT 0 AFTER person_id',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
