// JWT secret phải được cấu hình qua biến môi trường, không có giá trị dự phòng
// (giá trị dự phòng nằm trong source công khai => ai cũng ký được token).
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || !String(secret).trim()) {
        throw new Error('Thiếu biến môi trường JWT_SECRET.');
    }
    return secret;
}

// Token riêng cho URL ảnh/ghi âm (thẻ <img>/<audio> không gửi được header Authorization).
// Chỉ xem được media, không dùng được cho API: verifyToken từ chối scope 'media'; media chỉ nhận scope này qua query.
const jsonwebtoken = require('jsonwebtoken');

function signMediaToken(accountId) {
    return jsonwebtoken.sign(
        { id: accountId, account_id: accountId, scope: 'media' },
        getJwtSecret(),
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}

module.exports = { getJwtSecret, signMediaToken };
