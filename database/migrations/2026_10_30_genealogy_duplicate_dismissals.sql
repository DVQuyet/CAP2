SET NAMES utf8mb4;

-- Cặp người được quản lý đánh dấu "không trùng" (thêm mới, idempotent). person_a_id < person_b_id.
CREATE TABLE IF NOT EXISTS genealogy_duplicate_dismissals (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clan_id INT NOT NULL,
  person_a_id INT NOT NULL,
  person_b_id INT NOT NULL,
  account_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_gdd_pair (clan_id, person_a_id, person_b_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
