-- Nâng cấp families cho DB dựng từ init.sql CŨ (trước 25/11/2026): bảng đó không có spouse_a_id / spouse_b_id và khóa
-- duy nhất uk_families_clan_spouse_pair (chặn hai family cùng cặp vợ chồng A-B và B-A). Migration tạo khóa
-- (2026_05_13) nằm trước mốc BASELINE nên bị bỏ qua.
-- 1) Thêm hai cột generated VIRTUAL (TiDB không cho thêm cột STORED bằng ALTER), mỗi ALTER một cột.
-- 2) Có cặp trùng thì DỪNG với lỗi nói rõ, không tự gộp: gộp family phải chuyển con, ngày cưới, ghi chú… cần người xem.
--    Tìm cặp trùng: SELECT clan_id, spouse_a_id, spouse_b_id, GROUP_CONCAT(id) FROM families
--                   GROUP BY clan_id, spouse_a_id, spouse_b_id HAVING COUNT(*) > 1;
--    Gộp xong chạy lại npm run migrate: file này chưa được ghi nhận nên chạy lại từ đầu, các bước đã xong tự bỏ qua.
-- 3) Không trùng thì tạo khóa duy nhất. Mỗi bước tự kiểm information_schema nên chạy lại an toàn.

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'families' AND COLUMN_NAME = 'spouse_a_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE families ADD COLUMN spouse_a_id INT GENERATED ALWAYS AS (LEAST(COALESCE(father_id, 0), COALESCE(mother_id, 0))) VIRTUAL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'families' AND COLUMN_NAME = 'spouse_b_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE families ADD COLUMN spouse_b_id INT GENERATED ALWAYS AS (GREATEST(COALESCE(father_id, 0), COALESCE(mother_id, 0))) VIRTUAL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'families' AND INDEX_NAME = 'uk_families_clan_spouse_pair');
SET @dups := (SELECT COUNT(*) FROM (SELECT 1 FROM families GROUP BY clan_id, spouse_a_id, spouse_b_id HAVING COUNT(*) > 1) d);
SET @blocked := IF(@has = 0 AND @dups > 0, 1, 0);
-- Cột không tồn tại -> lỗi ER_BAD_FIELD_ERROR "Unknown column 'families_trung_cap_vo_chong_xem_dau_file_nay'";
-- migrate dừng và không ghi nhận file này. Tên cột giữ dưới 64 ký tự ASCII (giới hạn tên của MySQL).
SET @ddl := IF(@blocked = 1, 'SELECT families_trung_cap_vo_chong_xem_dau_file_nay FROM families LIMIT 1', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(@has = 0, 'CREATE UNIQUE INDEX uk_families_clan_spouse_pair ON families (clan_id, spouse_a_id, spouse_b_id)', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
