// Kiểm tra backend chạy ở máy cá nhân có đang dùng cấu hình của bản thật không
// (cùng database, URL đăng nhập/link mời trỏ về web thật, tác vụ nền gửi email thật).

const isLocal = (value) => /localhost|127\.0\.0\.1/i.test(String(value || ''));
const hostOnly = (value) => String(value || '').replace(/^https?:\/\//, '').split(/[/:]/)[0];
// Tên máy chủ DB có thể định danh hạ tầng: chỉ hiện phần đuôi ("*.aivencloud.com").
const maskedHost = (value) => {
    const parts = hostOnly(value).split('.');
    return parts.length > 2 ? `*.${parts.slice(-2).join('.')}` : hostOnly(value);
};

// Trả danh sách cảnh báo (rỗng nếu ổn). Bỏ qua trên Render (tự đặt RENDER) hoặc khi chủ động
// đặt ALLOW_SHARED_PRODUCTION_ENV=true (vd máy chủ triển khai khác Render).
function collectProductionConfigWarnings(env = process.env) {
    if (env.RENDER || env.ALLOW_SHARED_PRODUCTION_ENV === 'true') return [];
    const warnings = [];
    if (env.DB_HOST && !isLocal(env.DB_HOST)) {
        warnings.push(`DB_HOST là máy chủ từ xa (${maskedHost(env.DB_HOST)}): dùng chung dữ liệu với web thật`);
    }
    if (env.FRONTEND_URL && !isLocal(env.FRONTEND_URL)) {
        warnings.push(`FRONTEND_URL = ${hostOnly(env.FRONTEND_URL)}: đăng nhập mạng xã hội, link mời sẽ đưa về web thật`);
    }
    for (const key of ['GOOGLE_CALLBACK_URL', 'FACEBOOK_CALLBACK_URL', 'BACKEND_PUBLIC_URL']) {
        if (env[key] && !isLocal(env[key])) warnings.push(`${key} trỏ về ${hostOnly(env[key])}`);
    }
    if (warnings.length && env.DISABLE_BACKGROUND_JOBS !== 'true') {
        warnings.push('tác vụ nhắc lịch nền sẽ chạy và có thể gửi email/thông báo thật (đặt DISABLE_BACKGROUND_JOBS=true để tắt)');
    }
    return warnings;
}

function warnIfLocalUsesProductionConfig(env = process.env, log = console.warn) {
    const warnings = collectProductionConfigWarnings(env);
    if (!warnings.length) return warnings;
    log([
        '',
        '⚠️  Backend đang chạy ở máy cá nhân nhưng dùng cấu hình của bản thật:',
        ...warnings.map((item) => `   - ${item}`),
        '   Tạo Backend/.env.local (xem Backend/.env.local.example) để dùng DB và URL riêng khi chạy local.',
        '',
    ].join('\n'));
    return warnings;
}

module.exports = {
    collectProductionConfigWarnings,
    warnIfLocalUsesProductionConfig,
};
