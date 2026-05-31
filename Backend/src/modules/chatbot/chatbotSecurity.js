const WINDOW_MS = Number(process.env.CHATBOT_RATE_LIMIT_WINDOW_MS || 60000);
const MAX_REQUESTS = Number(process.env.CHATBOT_RATE_LIMIT_MAX || 30);
const MESSAGE_MAX_LENGTH = Number(process.env.CHATBOT_MESSAGE_MAX_LENGTH || 800);
const MAX_BUCKETS = Number(process.env.CHATBOT_RATE_LIMIT_MAX_BUCKETS || 5000);

const buckets = new Map();
let lastCleanupAt = 0;

function sanitizeMessage(value) {
    return String(value || '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MESSAGE_MAX_LENGTH);
}

function looksLikePromptInjection(message) {
    const text = String(message || '').toLowerCase();
    return [
        'ignore previous instructions',
        'bỏ qua hướng dẫn',
        'bo qua huong dan',
        'system prompt',
        'developer message',
        'hãy bịa',
        'hay bia',
        'không cần dữ liệu',
        'khong can du lieu',
    ].some((needle) => text.includes(needle));
}

function chatbotRateLimit(req, res, next) {
    const accountId = req.user?.id || req.user?.account_id || req.ip || 'anonymous';
    const key = String(accountId);
    const current = Date.now();

    if (current - lastCleanupAt > WINDOW_MS) {
        lastCleanupAt = current;
        for (const [bucketKey, bucket] of buckets.entries()) {
            if (current > bucket.resetAt) buckets.delete(bucketKey);
        }
        if (buckets.size > MAX_BUCKETS) {
            const overflow = buckets.size - MAX_BUCKETS;
            for (const bucketKey of [...buckets.keys()].slice(0, overflow)) buckets.delete(bucketKey);
        }
    }

    const bucket = buckets.get(key) || { count: 0, resetAt: current + WINDOW_MS };

    if (current > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = current + WINDOW_MS;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > MAX_REQUESTS) {
        return res.status(429).json({
            success: false,
            code: 'CHATBOT_RATE_LIMITED',
            message: 'Bạn đang hỏi quá nhanh. Vui lòng thử lại sau ít phút.',
        });
    }

    return next();
}

module.exports = {
    sanitizeMessage,
    looksLikePromptInjection,
    chatbotRateLimit,
};
