SET NAMES utf8mb4;

-- Nội dung trang chủ công khai do admin quản lý (thêm mới, idempotent).
-- Chưa có dòng nào => giao diện dùng nội dung i18n mặc định.
CREATE TABLE IF NOT EXISTS landing_sections (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  section_key VARCHAR(30) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  items_custom TINYINT(1) NOT NULL DEFAULT 0,
  tag_vi VARCHAR(255) NULL, tag_en VARCHAR(255) NULL,
  title_vi VARCHAR(500) NULL, title_en VARCHAR(500) NULL,
  body_vi TEXT NULL, body_en TEXT NULL,
  quote_vi VARCHAR(1000) NULL, quote_en VARCHAR(1000) NULL,
  image_url VARCHAR(1000) NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_landing_section_key (section_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS landing_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  title_vi VARCHAR(500) NULL, title_en VARCHAR(500) NULL,
  body_vi TEXT NULL, body_en TEXT NULL,
  meta_vi VARCHAR(255) NULL, meta_en VARCHAR(255) NULL,
  link_label_vi VARCHAR(255) NULL, link_label_en VARCHAR(255) NULL,
  image_url VARCHAR(1000) NULL,
  link_url VARCHAR(1000) NULL,
  icon VARCHAR(60) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_landing_items_section (section_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
