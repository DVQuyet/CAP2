process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.GROQ_API_KEY = 'test-key';
process.env.GROQ_MODEL = 'model-da-bi-go';
delete process.env.GROQ_FALLBACK_MODELS;

const test = require('node:test');
const assert = require('assert');

// Giả lập groq-sdk: model "model-da-bi-go" trả 404 model_not_found, các model khác trả lời bình thường.
const calls = [];
let failEverything = false;
class FakeGroq {
    constructor() {
        this.chat = {
            completions: {
                create: async (params) => {
                    calls.push(params);
                    if (failEverything) {
                        const error = new Error('500 server error');
                        error.status = 500;
                        throw error;
                    }
                    if (params.model === 'model-da-bi-go' || params.model === 'qwen/qwen3.8-27b-het') {
                        const error = new Error(`404 The model \`${params.model}\` does not exist`);
                        error.status = 404;
                        error.error = { error: { code: 'model_not_found' } };
                        throw error;
                    }
                    return { choices: [{ message: { content: `ok:${params.model}` } }] };
                },
            },
        };
    }
}
const sdkPath = require.resolve('groq-sdk');
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: FakeGroq };

const { callGroq } = require('../src/modules/chatbot/groqClient');

test('model đầu bị gỡ (404 model_not_found) thì chuyển sang model dự phòng và trả lời được', async () => {
    const reply = await callGroq('sys', 'user', 100);
    assert.strictEqual(reply, 'ok:qwen/qwen3.8-27b');
    assert.deepStrictEqual(calls.map((call) => call.model), ['model-da-bi-go', 'qwen/qwen3.8-27b']);
});

test('nhớ model đang chạy được: lần sau không thử lại model đã gỡ', async () => {
    calls.length = 0;
    const reply = await callGroq('sys', 'user', 100);
    assert.strictEqual(reply, 'ok:qwen/qwen3.8-27b');
    assert.deepStrictEqual(calls.map((call) => call.model), ['qwen/qwen3.8-27b']);
});

test('gpt-oss được gọi với reasoning_effort=low (tránh token suy luận ăn hết max_tokens); qwen thì không cần', async () => {
    // Nạp lại module với danh sách dự phòng riêng: model 1 và 2 đã gỡ, model 3 là gpt-oss.
    const clientPath = require.resolve('../src/modules/chatbot/groqClient');
    delete require.cache[clientPath];
    process.env.GROQ_FALLBACK_MODELS = 'qwen/qwen3.8-27b-het,openai/gpt-oss-120b';
    const fresh = require('../src/modules/chatbot/groqClient');
    calls.length = 0;
    const reply = await fresh.callGroq('sys', 'user', 200);
    assert.strictEqual(reply, 'ok:openai/gpt-oss-120b');
    assert.deepStrictEqual(calls.map((call) => call.model), ['model-da-bi-go', 'qwen/qwen3.8-27b-het', 'openai/gpt-oss-120b']);
    assert.strictEqual(calls[2].reasoning_effort, 'low');
    assert.strictEqual(calls[0].reasoning_effort, undefined);
    delete process.env.GROQ_FALLBACK_MODELS;
});

test('lỗi khác 404 (vd 500) không đổi model và trả null thay vì ném lỗi', async () => {
    calls.length = 0;
    failEverything = true;
    const reply = await callGroq('sys', 'user', 100);
    failEverything = false;
    assert.strictEqual(reply, null);
    assert.strictEqual(calls.length, 1, 'lỗi 500 không phải lỗi model, không được duyệt hết danh sách');
});
