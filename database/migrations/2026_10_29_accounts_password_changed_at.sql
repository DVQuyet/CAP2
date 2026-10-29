-- Mốc đổi/đặt lại mật khẩu gần nhất; verifyToken từ chối token cấp trước mốc này.
-- Idempotent: tương đương ensurePasswordChangedAtColumn (npm run migrate).
SET @has_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'password_changed_at'
);
SET @ddl := IF(@has_col = 0, 'ALTER TABLE accounts ADD COLUMN password_changed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
