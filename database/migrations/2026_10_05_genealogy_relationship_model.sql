-- Mô hình quan hệ gia phả đầy đủ: nhiều cuộc hôn nhân (vợ cả / vợ lẽ), con nuôi, con thừa tự,
-- ngày tháng không đầy đủ (chỉ năm, ước lượng, âm lịch), nguồn dữ liệu và lưu vết xác nhận.
-- Backend tự bổ sung các cột này khi chạy (genealogySchema.service.js); file này để chạy tay nếu cần.
-- Chỉ thêm cột/bảng, không xóa dữ liệu. Nếu một câu báo "Duplicate column" nghĩa là cột đã có, bỏ qua.

-- people: độ chính xác và loại lịch của ngày sinh/mất, ngày giỗ âm lịch (MM-DD), nguồn dữ liệu.
ALTER TABLE people
  ADD COLUMN birth_date_precision ENUM('exact','month','year','approximate','unknown') NOT NULL DEFAULT 'exact',
  ADD COLUMN birth_calendar ENUM('solar','lunar') NOT NULL DEFAULT 'solar',
  ADD COLUMN death_date_precision ENUM('exact','month','year','approximate','unknown') NOT NULL DEFAULT 'exact',
  ADD COLUMN death_calendar ENUM('solar','lunar') NOT NULL DEFAULT 'solar',
  ADD COLUMN death_anniversary_lunar VARCHAR(5) NULL,
  ADD COLUMN source_type ENUM('direct','paper_genealogy','oral','document','unknown') NULL,
  ADD COLUMN source_note TEXT NULL;
-- is_living = NULL nghĩa là "không rõ còn sống hay đã mất" (cột vốn cho phép NULL).

-- families: loại quan hệ, thứ tự vợ/chồng, độ chính xác ngày, nguồn, mức hiển thị.
ALTER TABLE families
  MODIFY COLUMN relationship_status ENUM('active','divorced','widowed','separated','annulled','unknown') NOT NULL DEFAULT 'active',
  ADD COLUMN union_type ENUM('marriage','concubine','cohabitation','unknown') NOT NULL DEFAULT 'marriage',
  ADD COLUMN wife_rank TINYINT UNSIGNED NULL COMMENT 'Vợ thứ mấy của người chồng (1 = vợ cả)',
  ADD COLUMN husband_rank TINYINT UNSIGNED NULL COMMENT 'Chồng thứ mấy của người vợ',
  ADD COLUMN marriage_date_precision ENUM('exact','month','year','approximate','unknown') NOT NULL DEFAULT 'exact',
  ADD COLUMN ended_at_precision ENUM('exact','month','year','approximate','unknown') NOT NULL DEFAULT 'exact',
  ADD COLUMN source_type ENUM('direct','paper_genealogy','oral','document','unknown') NULL,
  ADD COLUMN source_note TEXT NULL,
  ADD COLUMN visibility ENUM('public','managers') NOT NULL DEFAULT 'public';

-- children: loại con và dòng chính (để tính đời, hiển thị một vị trí chính trên cây).
ALTER TABLE children
  MODIFY COLUMN child_type ENUM('biological','adopted','heir','step','foster','unknown') NOT NULL DEFAULT 'biological',
  ADD COLUMN is_primary_lineage TINYINT(1) NOT NULL DEFAULT 1;
-- Nếu cột child_type chưa có (chưa chạy migration chatbot), dùng câu sau thay cho MODIFY ở trên:
-- ALTER TABLE children ADD COLUMN child_type ENUM('biological','adopted','heir','step','foster','unknown') NOT NULL DEFAULT 'biological';

-- Cho phép một người có nhiều gia đình cha mẹ (ruột + nuôi/thừa tự).
-- Mỗi người tối đa một cha mẹ ruột và một dòng chính được kiểm tra ở backend.
ALTER TABLE children DROP INDEX uk_children_single_parent_family;

-- clans: chính sách gia phả của dòng họ (dòng nội/mẫu hệ, vùng xưng hô, mốc luật, số đời phong tục...).
ALTER TABLE clans ADD COLUMN genealogy_policy JSON NULL;

-- Lưu vết các lần quản lý xác nhận lưu quan hệ trái luật/bất thường (dữ liệu lịch sử, gia phả giấy).
CREATE TABLE IF NOT EXISTS genealogy_relation_overrides (
  id INT NOT NULL AUTO_INCREMENT,
  clan_id INT NOT NULL,
  account_id INT NULL,
  action VARCHAR(64) NOT NULL,
  issue_code VARCHAR(64) NOT NULL,
  issue_key VARCHAR(255) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  message TEXT NULL,
  person_ids JSON NULL,
  family_id INT NULL,
  reason TEXT NULL,
  source_type VARCHAR(32) NULL,
  source_note TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gro_clan (clan_id, created_at),
  KEY idx_gro_issue (clan_id, issue_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
