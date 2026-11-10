// Danh sách origin được phép gọi API và Socket.IO.
// Nguồn: FRONTEND_URL + CORS_ORIGINS (cách nhau dấu phẩy). Chưa đặt CORS_ORIGINS thì dùng các tên miền production mặc định.
// Origin http:// chỉ nhận cho localhost/127.0.0.1; ngoài production tự thêm các cổng Vite quen dùng.
const DEFAULT_PRODUCTION_ORIGINS = ['https://cap-2-seven.vercel.app', 'https://dinhvietquyet.website'];
const LOCAL_DEV_PORTS = [5173, 5174, 5175, 4173];

function normalizeOrigin(value) {
    try {
        const url = new URL(String(value || '').trim());
        return url.origin === 'null' ? null : url.origin;
    } catch (_) {
        return null;
    }
}

function isLocalOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function buildAllowedOrigins(env = process.env) {
    const configured = env.CORS_ORIGINS ? String(env.CORS_ORIGINS).split(',') : DEFAULT_PRODUCTION_ORIGINS;
    const localDev = env.NODE_ENV === 'production'
        ? []
        : LOCAL_DEV_PORTS.flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
    const origins = [env.FRONTEND_URL, ...configured, ...localDev]
        .map(normalizeOrigin)
        .filter((origin) => origin && (origin.startsWith('https://') || isLocalOrigin(origin)));
    return [...new Set(origins)];
}

module.exports = { buildAllowedOrigins };
