SET NAMES utf8mb4;

-- Nội dung trang công khai (đợt 12): cột nội dung chi tiết cho bài tin, thêm mới, idempotent.
-- Tương đương ensureLandingSchema (npm run migrate). Chưa có cột thì bài tin vẫn chạy, chỉ chưa lưu được nội dung chi tiết.
-- Các mục mới (demo, benefits, footer...) dùng chung bảng landing_sections/landing_items nên không cần bảng khác.
SET @has_vi := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'landing_items' AND COLUMN_NAME = 'content_vi'
);
SET @ddl := IF(@has_vi = 0, 'ALTER TABLE landing_items ADD COLUMN content_vi MEDIUMTEXT NULL AFTER link_label_en', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_en := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'landing_items' AND COLUMN_NAME = 'content_en'
);
SET @ddl := IF(@has_en = 0, 'ALTER TABLE landing_items ADD COLUMN content_en MEDIUMTEXT NULL AFTER content_vi', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
