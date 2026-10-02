// Giới hạn số lần gọi các endpoint xác thực (đăng nhập, đăng ký, quên mật khẩu)
// theo IP để chống dò mật khẩu / spam mã OTP. Lưu trong bộ nhớ, giống chatbotRateLimit.
const DEFAULT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const DEFAULT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);
const MAX_BUCKETS = Number(process.env.AUTH_RATE_LIMIT_MAX_BUCKETS || 10000);

function createAuthRateLimit({ name, windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX, keyGenerator = null }) {
    const buckets = new Map();
    let lastCleanupAt = 0;

    return function authRateLimit(req, res, next) {
        const key = String((keyGenerator && keyGenerator(req)) || req.ip || 'anonymous');
        const current = Date.now();

        if (current - lastCleanupAt > windowMs) {
            lastCleanupAt = current;
            for (const [bucketKey, bucket] of buckets.entries()) {
                if (current > bucket.resetAt) buckets.delete(bucketKey);
            }
            if (buckets.size > MAX_BUCKETS) {
                const overflow = buckets.size - MAX_BUCKETS;
                for (const bucketKey of [...buckets.keys()].slice(0, overflow)) buckets.delete(bucketKey);
            }
        }

        const bucket = buckets.get(key) || { count: 0, resetAt: current + windowMs };

        if (current > bucket.resetAt) {
            bucket.count = 0;
            bucket.resetAt = current + windowMs;
        }

        bucket.count += 1;
        buckets.set(key, bucket);

        if (bucket.count > max) {
            const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
            res.set('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                success: false,
                code: 'AUTH_RATE_LIMITED',
                limiter: name,
                message: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.',
            });
        }

        return next();
    };
}

module.exports = {
    createAuthRateLimit,
    loginRateLimit: createAuthRateLimit({ name: 'login' }),
    registerRateLimit: createAuthRateLimit({ name: 'register', windowMs: 60 * 60 * 1000, max: 10 }),
    forgotPasswordRateLimit: createAuthRateLimit({ name: 'forgot-password', max: 5 }),
    resetPasswordRateLimit: createAuthRateLimit({ name: 'reset-password', max: 10 }),
};
