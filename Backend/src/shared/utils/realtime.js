// Ngắt mọi kết nối Socket.IO của một tài khoản (server.js đặt app.locals.disconnectAccount).
// Gọi sau khi token bị thu hồi / tài khoản bị khóa / đổi vai trò, vì socket chỉ kiểm token lúc kết nối:
// kết nối đang mở sẽ không còn nhận sự kiện realtime của dòng họ. Client tự kết nối lại bằng token hiện hành.
function disconnectAccountSockets(req, accountId) {
    const id = Number(accountId);
    if (!Number.isInteger(id) || id <= 0) return;
    try {
        req?.app?.locals?.disconnectAccount?.(id);
    } catch (error) {
        console.warn('disconnectAccountSockets:', error.message);
    }
}

module.exports = { disconnectAccountSockets };
