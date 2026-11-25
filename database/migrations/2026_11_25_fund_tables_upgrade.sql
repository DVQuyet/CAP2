-- Nâng cấp bảng quỹ cho DB dựng từ init.sql CŨ (trước 25/11/2026). Ở DB đó, CREATE TABLE IF NOT EXISTS trong
-- database/schema/ giữ nguyên event_costs / event_contributions thiếu cột, còn migration 15/11 nằm trước mốc nên bị
-- bỏ qua -> ensureEventCostRecipientColumns lỗi ở "AFTER campaign_id".
-- 1) Thêm các cột quỹ còn thiếu (cùng định nghĩa và thứ tự như migration 15/11).
-- 2) Cho event_id (thu, chi) và person_id (thu) nhận NULL: góp/chi theo đợt quỹ không gắn sự kiện, nhập Excel không
--    gắn sự kiện lẫn người góp (fund.controller importExcel).
-- Mỗi bước tự kiểm information_schema rồi mới đổi, nên chạy lại hoặc chạy tiếp sau khi lỗi giữa file đều an toàn.
-- Hợp TiDB và MySQL 8: PREPARE từ biến, không trigger/procedure.

-- 1. event_costs: cột còn thiếu
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

-- 1. event_contributions: cột còn thiếu
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

-- 2. Cho NULL: chỉ đổi khi cột đang NOT NULL. MODIFY giữ kiểu INT nên khóa ngoại tới events/people vẫn còn.
SET @notnull := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_costs' AND COLUMN_NAME = 'event_id' AND IS_NULLABLE = 'NO');
SET @ddl := IF(@notnull = 1, 'ALTER TABLE event_costs MODIFY event_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @notnull := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'event_id' AND IS_NULLABLE = 'NO');
SET @ddl := IF(@notnull = 1, 'ALTER TABLE event_contributions MODIFY event_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @notnull := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_contributions' AND COLUMN_NAME = 'person_id' AND IS_NULLABLE = 'NO');
SET @ddl := IF(@notnull = 1, 'ALTER TABLE event_contributions MODIFY person_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
