const db = require('../../config/db');

// Đổi/đặt lại mật khẩu ghi lại thời điểm (giây, theo đồng hồ app) để verifyToken từ chối token cấp trước đó.
// Thiếu cột (chưa chạy migrate) thì lùi về UPDATE cũ, token cũ vẫn dùng được như trước.
async function ensurePasswordChangedAtColumn() {
  const [columns] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'password_changed_at'`
  );
  if (!columns.length) {
    await db.query('ALTER TABLE accounts ADD COLUMN password_changed_at DATETIME NULL');
  }
}

// Trả về mốc thời gian (giây) đã ghi, dùng làm cận dưới khi cấp token mới.
async function updatePasswordHash(executor, accountId, hashedPassword) {
  const changedAt = Math.floor(Date.now() / 1000);
  try {
    await executor.query(
      'UPDATE accounts SET password = ?, password_changed_at = FROM_UNIXTIME(?) WHERE id = ?',
      [hashedPassword, changedAt, accountId]
    );
  } catch (error) {
    if (error.code !== 'ER_BAD_FIELD_ERROR') throw error;
    await executor.query('UPDATE accounts SET password = ? WHERE id = ?', [hashedPassword, accountId]);
  }
  return changedAt;
}

module.exports = { ensurePasswordChangedAtColumn, updatePasswordHash };
