-- Dữ liệu tối thiểu để một DB mới chạy được: ba vai trò và gói FREE.
-- Idempotent: INSERT IGNORE theo khóa chính / khóa duy nhất, không ghi đè giá trị admin đã sửa.
SET NAMES utf8mb4;

INSERT IGNORE INTO roles (id, role_name, description) VALUES
  (1, 'admin', 'Quản trị hệ thống'),
  (2, 'manager', 'Quản lý dòng họ'),
  (3, 'member', 'Thành viên dòng họ');

-- Gói FREE: mỗi dòng họ mới được gắn gói này (billing.service ensureFreeSubscriptionForClan).
-- Giới hạn là số đề xuất, admin sửa ở trang quản trị gói.
INSERT IGNORE INTO plans (code, name, description, price_vnd, billing_cycle, person_limit, account_limit, is_active) VALUES
  ('FREE', 'Miễn phí', 'Gói mặc định cho dòng họ mới', 0, 'free', 200, 20, 1);
