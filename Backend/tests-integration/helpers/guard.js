// Mọi helper gọi hàm này trước khi nạp config DB: thiếu RUN_DB_TESTS=1 thì dừng, không chạm DB.
function requireDbTests() {
    if (process.env.RUN_DB_TESTS !== '1') {
        throw new Error('Test tích hợp chạy trên DB thật. Dùng `npm run test:integration` (đặt RUN_DB_TESTS=1), đừng chạy `node --test` trực tiếp.');
    }
}

module.exports = { requireDbTests };
