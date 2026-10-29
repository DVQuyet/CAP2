// Header bảo mật cho mọi phản hồi của backend (API JSON + file media).
// - HSTS chỉ gửi khi request đi qua HTTPS (req.secure; app đã bật trust proxy nên đúng trên Render). Local (http) không gửi.
// - CSP: backend chỉ trả JSON và file ảnh/ghi âm/video nên chặn mọi nguồn khác. img/media 'self' để mở ảnh trực tiếp trên tab mới vẫn hiển thị.
const CSP = "default-src 'none'; frame-ancestors 'self'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";
const HSTS = 'max-age=15552000; includeSubDomains';

function securityHeaders(req, res, next) {
    const headers = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Security-Policy': CSP,
    };
    if (req.secure) headers['Strict-Transport-Security'] = HSTS;
    res.set(headers);
    next();
}

module.exports = { securityHeaders, CSP, HSTS };
