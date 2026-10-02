let Groq = null;

try {
    // Optional at runtime so local tests still use deterministic fallbacks
    // when dependencies or GROQ_API_KEY are not configured.
    Groq = require('groq-sdk');
} catch (_) {
    Groq = null;
}

// llama3-8b-8192 đã bị Groq ngừng hỗ trợ; dùng model còn hoạt động làm mặc định.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES || 1);

let groq = null;
let lastErrorLogAt = 0;

function getGroqClient() {
    if (!Groq || !process.env.GROQ_API_KEY) return null;
    if (!groq) {
        groq = new Groq({
            apiKey: process.env.GROQ_API_KEY,
            timeout: TIMEOUT_MS,
            maxRetries: MAX_RETRIES,
        });
    }
    return groq;
}

function isGroqConfigured() {
    return Boolean(getGroqClient());
}

// Ghi log lỗi (tối đa 1 lần/phút) để biết khi AI ngừng hoạt động thay vì im lặng
// rơi về fallback. Không log nội dung prompt vì có dữ liệu gia phả.
function logGroqError(error) {
    const now = Date.now();
    if (now - lastErrorLogAt < 60000) return;
    lastErrorLogAt = now;
    console.error('Groq call failed:', {
        model: MODEL,
        status: error?.status || null,
        code: error?.error?.error?.code || error?.code || null,
        message: String(error?.message || error).slice(0, 300),
    });
}

async function callGroq(systemPrompt, userContent, maxTokens = 1000) {
    const client = getGroqClient();
    if (!client) return null;

    try {
        const response = await client.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            max_tokens: maxTokens,
            temperature: 0.1,
        });
        return response?.choices?.[0]?.message?.content || null;
    } catch (error) {
        logGroqError(error);
        return null;
    }
}

module.exports = {
    callGroq,
    isGroqConfigured,
};
