let Groq = null;

try {
    // Optional at runtime so local tests still use deterministic fallbacks
    // when dependencies or GROQ_API_KEY are not configured.
    Groq = require('groq-sdk');
} catch (_) {
    Groq = null;
}

// Groq thường ngừng cung cấp model (llama3-8b-8192, rồi llama-3.3-70b-versatile đều đã trả 404 model_not_found).
// Nên có danh sách model dự phòng: gặp "model không tồn tại" thì thử model kế tiếp và nhớ model đang chạy được.
// GROQ_MODEL ưu tiên đầu tiên; GROQ_FALLBACK_MODELS (cách nhau dấu phẩy) thay danh sách dự phòng mặc định.
const DEFAULT_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
const MODEL_CANDIDATES = [...new Set([
    process.env.GROQ_MODEL,
    ...(process.env.GROQ_FALLBACK_MODELS ? process.env.GROQ_FALLBACK_MODELS.split(',') : DEFAULT_MODELS),
].map((name) => String(name || '').trim()).filter(Boolean))];
let activeModelIndex = 0;

// Model suy luận của OpenAI (gpt-oss) tiêu token vào suy luận: để mặc định thì max_tokens nhỏ bị ăn hết, nội dung rỗng.
function extraParamsFor(model) {
    return /^openai\/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {};
}

function isModelUnavailable(error) {
    const code = error?.error?.error?.code || error?.code || '';
    return error?.status === 404 || /model_not_found|model_decommissioned/.test(String(code))
        || /decommissioned|does not exist|no longer supported/i.test(String(error?.message || ''));
}
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
        model: MODEL_CANDIDATES[activeModelIndex] || null,
        status: error?.status || null,
        code: error?.error?.error?.code || error?.code || null,
        message: String(error?.message || error).slice(0, 300),
    });
}

// requestOptions: { timeout, maxRetries } cho riêng lần gọi này (vd chat cần trả lời nhanh, không thử lại).
async function callGroq(systemPrompt, userContent, maxTokens = 1000, requestOptions = undefined) {
    const client = getGroqClient();
    if (!client) return null;

    for (let index = activeModelIndex; index < MODEL_CANDIDATES.length; index += 1) {
        const model = MODEL_CANDIDATES[index];
        try {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent },
                ],
                max_tokens: maxTokens,
                temperature: 0.1,
                ...extraParamsFor(model),
            }, requestOptions);
            if (index !== activeModelIndex) {
                console.warn(`Groq: chuyển sang model ${model} (model trước đó không còn khả dụng).`);
                activeModelIndex = index;
            }
            return response?.choices?.[0]?.message?.content || null;
        } catch (error) {
            if (isModelUnavailable(error) && index < MODEL_CANDIDATES.length - 1) continue;
            logGroqError(error);
            return null;
        }
    }
    return null;
}

module.exports = {
    callGroq,
    isGroqConfigured,
};
