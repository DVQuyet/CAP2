const AI_SERVER_URL = String(process.env.AI_SERVER_URL || 'http://localhost:8001').replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_CHATBOT_TIMEOUT_MS || 8000);

async function postJson(path, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${AI_SERVER_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
            signal: controller.signal,
        });
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = { success: false, message: text || 'AI server returned non-JSON response' };
        }
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        return {
            ok: false,
            status: error.name === 'AbortError' ? 504 : 503,
            data: {
                success: false,
                code: error.name === 'AbortError' ? 'AI_CHATBOT_TIMEOUT' : 'AI_CHATBOT_UNAVAILABLE',
                message: error.message,
            },
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function planChatbotQuery({ message, memory, context } = {}) {
    const result = await postJson('/chatbot/plan', { message, memory: memory || {}, context: context || {} });
    if (!result.ok) {
        return { success: false, code: result.data?.code || 'AI_PLAN_FAILED', status: result.status, data: result.data };
    }
    return { success: true, data: result.data };
}

async function explainRelationship({ relation, path, evidence } = {}) {
    const result = await postJson('/chatbot/explain', { relation, path: path || [], evidence: evidence || {} });
    if (!result.ok) {
        return { success: false, code: result.data?.code || 'AI_EXPLAIN_FAILED', status: result.status, data: result.data };
    }
    return { success: true, data: result.data };
}

async function suggestFollowups({ message, relation, evidence, memory } = {}) {
    const result = await postJson('/chatbot/suggest', {
        message,
        relation,
        evidence: evidence || {},
        memory: memory || {},
    });
    if (!result.ok) {
        return { success: false, code: result.data?.code || 'AI_SUGGEST_FAILED', status: result.status, data: result.data };
    }
    return { success: true, data: result.data };
}

module.exports = {
    planChatbotQuery,
    explainRelationship,
    suggestFollowups,
};
