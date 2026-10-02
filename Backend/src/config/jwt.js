// JWT secret phải được cấu hình qua biến môi trường, không có giá trị dự phòng
// (giá trị dự phòng nằm trong source công khai => ai cũng ký được token).
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || !String(secret).trim()) {
        throw new Error('Thiếu biến môi trường JWT_SECRET.');
    }
    return secret;
}

module.exports = { getJwtSecret };
