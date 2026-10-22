const db = require('../../config/db');

// Đánh giá 👍/👎 cho câu trả lời của trợ lý. Bảng riêng, thêm mới, không đổi chatbot_messages.
async function ensureChatbotFeedbackSchema() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS chatbot_feedback (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            message_id BIGINT NOT NULL,
            account_id INT NOT NULL,
            clan_id INT NULL,
            rating TINYINT NOT NULL,
            comment VARCHAR(500) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_chatbot_feedback_message_account (message_id, account_id),
            KEY idx_chatbot_feedback_clan_rating (clan_id, rating)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

const MAX_COMMENT_LENGTH = 500;

// Trả { ok: true, rating, comment } hoặc { ok: false, message }.
function validateFeedbackBody(body = {}) {
    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || (rating !== 1 && rating !== -1)) {
        return { ok: false, message: 'rating phải là 1 (hữu ích) hoặc -1 (chưa tốt)' };
    }
    let comment = body?.comment;
    if (comment !== undefined && comment !== null && typeof comment !== 'string') {
        return { ok: false, message: 'comment phải là chuỗi' };
    }
    comment = String(comment || '').replace(/\s+/g, ' ').trim();
    if (comment.length > MAX_COMMENT_LENGTH) {
        return { ok: false, message: `comment tối đa ${MAX_COMMENT_LENGTH} ký tự` };
    }
    return { ok: true, rating, comment: comment || null };
}

// Chỉ chủ tài khoản của tin nhắn trả lời (role assistant) mới được đánh giá.
async function saveFeedback({ messageId, accountId, body }) {
    const id = Number(messageId);
    if (!Number.isInteger(id) || id <= 0) return { status: 400, body: { success: false, message: 'id tin nhắn không hợp lệ' } };
    const checked = validateFeedbackBody(body);
    if (!checked.ok) return { status: 400, body: { success: false, message: checked.message } };
    if (!accountId) return { status: 401, body: { success: false, message: 'Chưa đăng nhập' } };

    const [rows] = await db.query('SELECT * FROM chatbot_messages WHERE id = ? LIMIT 1', [id]);
    const message = rows?.[0];
    if (!message) return { status: 404, body: { success: false, message: 'Không tìm thấy tin nhắn' } };
    const role = message.role || (message.sender === 'bot' ? 'assistant' : message.sender);
    if (role !== 'assistant') return { status: 400, body: { success: false, message: 'Chỉ đánh giá được câu trả lời của trợ lý' } };
    if (Number(message.account_id) !== Number(accountId)) {
        return { status: 403, body: { success: false, message: 'Bạn không có quyền đánh giá tin nhắn này' } };
    }

    await db.query(
        `INSERT INTO chatbot_feedback (message_id, account_id, clan_id, rating, comment)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
        [id, accountId, message.clan_id || null, checked.rating, checked.comment]
    );
    return { status: 200, body: { success: true, messageId: id, rating: checked.rating, comment: checked.comment } };
}

module.exports = { ensureChatbotFeedbackSchema, validateFeedbackBody, saveFeedback, MAX_COMMENT_LENGTH };
