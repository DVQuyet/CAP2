require('dotenv').config();
const db = require('./src/config/db');

async function runMigration() {
    try {
        console.log("Bắt đầu thay đổi cấu trúc bảng people...");
        await db.query("ALTER TABLE people ADD COLUMN pending_avatar_url TEXT");
        await db.query("ALTER TABLE people ADD COLUMN pending_bio TEXT");
        await db.query("ALTER TABLE people ADD COLUMN moderation_status ENUM('none', 'pending', 'rejected') DEFAULT 'none'");
        await db.query("ALTER TABLE people ADD COLUMN moderation_reason VARCHAR(255)");
        console.log("Migration thêm các cột moderation thành công!");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Ít nhất một cột đã tồn tại trong bảng people. Bỏ qua Migration cho cột đó hoặc kiểm tra lại.");
        } else {
            console.error("Lỗi khi chạy Migration:", e);
        }
    } finally {
        await db.end?.();
    }
}

runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Migration failed:", error);
        db.end?.()
            .catch(() => {})
            .finally(() => process.exit(1));
    });
