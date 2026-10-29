const crypto = require('crypto');

// Đăng nhập Google/Facebook: callback chuyển hướng về frontend kèm mã dùng một lần thay cho JWT,
// để token không nằm trong URL (lịch sử trình duyệt, log, header Referer). Frontend đổi mã lấy token qua POST.
// Lưu trong bộ nhớ nên chỉ đúng khi chạy một instance (Render hiện chạy một); nhiều instance thì chuyển sang bảng DB.
const CODE_TTL_MS = Number(process.env.OAUTH_CODE_TTL_MS || 60 * 1000);
const MAX_CODES = 5000;
const codes = new Map();

function purgeExpired(now) {
    for (const [code, entry] of codes) {
        if (entry.expiresAt <= now) codes.delete(code);
    }
}

function createOAuthCode(token) {
    const now = Date.now();
    purgeExpired(now);
    if (codes.size >= MAX_CODES) {
        // Bị spam: bỏ mã cũ nhất thay vì để bộ nhớ phình ra.
        codes.delete(codes.keys().next().value);
    }
    const code = crypto.randomBytes(32).toString('base64url');
    codes.set(code, { token, expiresAt: now + CODE_TTL_MS });
    return code;
}

// Lấy ra là xóa: mỗi mã chỉ dùng được một lần.
function consumeOAuthCode(code) {
    if (typeof code !== 'string' || !code) return null;
    const entry = codes.get(code);
    if (!entry) return null;
    codes.delete(code);
    return entry.expiresAt > Date.now() ? entry.token : null;
}

module.exports = { createOAuthCode, consumeOAuthCode };
