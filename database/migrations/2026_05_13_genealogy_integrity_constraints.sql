-- Ràng buộc toàn vẹn dữ liệu cho cây gia phả.
-- Chạy sau khi đã dọn dữ liệu trùng cũ nếu database hiện tại có duplicate.

-- Chuẩn hóa cặp vợ/chồng/parent family theo chiều không phụ thuộc thứ tự
-- để chặn family trùng A-B và B-A. COALESCE(..., 0) giúp UNIQUE hoạt động cả khi một phía NULL.
ALTER TABLE families
  ADD COLUMN spouse_a_id INT GENERATED ALWAYS AS (LEAST(COALESCE(father_id, 0), COALESCE(mother_id, 0))) STORED,
  ADD COLUMN spouse_b_id INT GENERATED ALWAYS AS (GREATEST(COALESCE(father_id, 0), COALESCE(mother_id, 0))) STORED;

ALTER TABLE families
  ADD UNIQUE KEY uk_families_clan_spouse_pair (clan_id, spouse_a_id, spouse_b_id);

-- Đã có UNIQUE (family_id, person_id) trong nhiều schema; câu lệnh dưới dùng để đảm bảo.
-- Nếu index đã tồn tại, bỏ qua lỗi duplicate index name hoặc đổi tên index theo database của bạn.
ALTER TABLE children
  ADD UNIQUE KEY uk_children_family_person (family_id, person_id);

-- Một người chỉ được có một bộ cha/mẹ chính trong cây để tránh duplicate parent-child ở nhiều family.
-- Nếu hệ thống của bạn muốn hỗ trợ nhận nuôi/nhiều gia đình cha mẹ, không chạy constraint này mà chỉ giữ validation code.
ALTER TABLE children
  ADD UNIQUE KEY uk_children_single_parent_family (person_id);
