-- Sửa dữ liệu cho DB đã chạy bản cũ của 2026_11_25_fund_tables_upgrade.sql: bản đó thêm clan_id NOT NULL không điền
-- nên bản ghi quỹ cũ nhận clan_id = 0 (không thuộc dòng họ nào, mất khỏi trang quỹ). Điền lại từ events.clan_id theo
-- event_id. Chỉ sửa dòng clan_id = 0 hoặc NULL; chạy lại không đổi gì thêm. Dòng không có sự kiện thì giữ nguyên.
UPDATE event_costs x JOIN events e ON e.id = x.event_id SET x.clan_id = e.clan_id WHERE x.clan_id IS NULL OR x.clan_id = 0;
UPDATE event_contributions x JOIN events e ON e.id = x.event_id SET x.clan_id = e.clan_id WHERE x.clan_id IS NULL OR x.clan_id = 0;
