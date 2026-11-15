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

// Gói miễn phí giới hạn token/phút theo từng model (vd qwen chỉ 1000 token ra/phút): 429 ở model này
// không có nghĩa model kế tiếp cũng hết lượt, nên thử model kế tiếp cho riêng lần gọi đó.
function isRateLimited(error) {
    return error?.status === 429 || error?.status === 413;
}

// requestOptions: { timeout, maxRetries } cho riêng lần gọi này (vd chat cần trả lời nhanh, không thử lại).
// behavior.requireComplete: nơi gọi cần trọn câu trả lời (JSON); bị cắt vì hết max_tokens thì thử model kế tiếp.
async function callGroq(systemPrompt, userContent, maxTokens = 1000, requestOptions = undefined, behavior = {}) {
    const client = getGroqClient();
    if (!client) return null;

    const last = MODEL_CANDIDATES.length - 1;
    for (let index = activeModelIndex; index <= last; index += 1) {
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
                // Còn model dự phòng thì không để SDK chờ rồi thử lại chính model đang bị giới hạn.
            }, index < last ? { maxRetries: 0, ...requestOptions } : requestOptions);
            const choice = response?.choices?.[0];
            if (behavior.requireComplete && choice?.finish_reason === 'length' && index < last) continue;
            return choice?.message?.content || null;
        } catch (error) {
            if (index < last && isModelUnavailable(error)) {
                // Model đã bị gỡ: nhớ để lần sau không thử lại. Giới hạn tốc độ thì chỉ bỏ qua trong lần gọi này.
                if (index === activeModelIndex) {
                    activeModelIndex = index + 1;
                    console.warn(`Groq: model ${model} không còn khả dụng, chuyển sang ${MODEL_CANDIDATES[index + 1]}.`);
                }
                continue;
            }
            if (index < last && isRateLimited(error)) continue;
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
