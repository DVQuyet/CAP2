const { callGroq } = require('./groqClient');
const {
    buildPlanPrompt,
    buildExplainPrompt,
    buildSuggestPrompt,
    buildTitlePrompt,
} = require('./chatbotPrompts');

function stripJsonBlock(value) {
    return String(value || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
}

function parseJsonObject(value) {
    const clean = stripJsonBlock(value);
    if (!clean) return null;
    try {
        return JSON.parse(clean);
    } catch (_) {
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return JSON.parse(clean.slice(start, end + 1));
        } catch (_error) {
            return null;
        }
    }
}

function fallbackPlan() {
    return {
        intent: 'general_chat',
        ast: null,
        entities: [],
        confidence: 0.5,
        fallback: true,
    };
}

function fallbackExplain({ intent, relation, evidence, userProfile, clanContext } = {}) {
    if (intent === 'general_chat') {
        const name = String(userProfile?.display_name || '').trim();
        const clanName = String(clanContext?.clan_name || '').trim();
        const hello = name ? `Chào ${name}.` : 'Chào bạn.';
        const scope = clanName ? ` trong dòng họ ${clanName}` : '';
        return `${hello} Tôi có thể giúp bạn tra quan hệ, tìm thành viên, xem lịch sử, kỷ niệm và thống kê gia phả${scope}.`;
    }
    const summary = String(evidence?.summary || '').trim();
    if (summary) return summary;
    const label = String(relation || '').trim();
    if (label) return `Theo dữ liệu gia phả hiện tại, quan hệ đã được xác minh là ${label}.`;
    return '';
}

function fallbackSuggest(userProfile) {
    const generation = userProfile?.generation || '';
    return {
        suggestions: [
            'Dòng họ mình có lịch sử thế nào?',
            generation ? `Đời thứ ${generation} có những ai?` : 'Tôi có bao nhiêu anh chị em họ?',
            'Sắp có sự kiện gì của dòng họ không?',
        ],
    };
}

function normalizeSuggestions(result, userProfile) {
    const fallback = fallbackSuggest(userProfile);
    const raw = Array.isArray(result?.suggestions) ? result.suggestions : [];
    const suggestions = raw
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            return String(item?.text || '').trim();
        })
        .filter(Boolean)
        .slice(0, 4);
    return { suggestions: suggestions.length ? suggestions : fallback.suggestions };
}

async function getPlan({ message, history, userProfile, clanContext } = {}) {
    const historyText = (history || [])
        .map((item) => `${item.sender === 'user' ? 'User' : 'Bot'}: ${item.message || ''}`)
        .join('\n');
    const userContent = [
        `Lịch sử hội thoại:\n${historyText || '(chưa có)'}`,
        `Người dùng: ${JSON.stringify(userProfile || {})}`,
        `Dòng họ: ${JSON.stringify(clanContext || {})}`,
        `Câu hỏi mới: "${message || ''}"`,
    ].join('\n\n');

    const raw = await callGroq(buildPlanPrompt(), userContent, 500);
    if (!raw) return fallbackPlan(message);
    const parsed = parseJsonObject(raw);
    return parsed || fallbackPlan(message);
}

async function getExplanation({
    intent,
    userMessage,
    resolvedData,
    relation,
    path,
    evidence,
    clanContext,
    userProfile,
    recentMemories,
    history,
} = {}) {
    const systemPrompt = buildExplainPrompt(clanContext, userProfile, recentMemories);
    let userContent = [
        `Intent: ${intent || ''}`,
        `Câu hỏi: "${userMessage || ''}"`,
        `Dữ liệu đã tra cứu: ${JSON.stringify(resolvedData || {}, null, 2)}`,
        `Quan hệ đã xác minh: ${JSON.stringify({ relation, path: path || [], evidence: evidence || {} }, null, 2)}`,
        `Lịch sử hội thoại: ${JSON.stringify(history || [])}`,
    ].join('\n');

    if (intent === 'general_chat') {
        userContent = `Người dùng nói: "${userMessage || ''}"\nTrả lời thân thiện, ngắn gọn 1-2 câu.`;
    }

    const raw = await callGroq(systemPrompt, userContent, 800);
    const text = String(raw || '').trim();
    return text || fallbackExplain({ intent, relation, evidence, userProfile, clanContext });
}

async function getSuggestions({ intent, resolvedData, relation, evidence, userProfile } = {}) {
    if (intent === 'general_chat') return fallbackSuggest(userProfile);

    const raw = await callGroq(
        buildSuggestPrompt(intent, userProfile),
        `Dữ liệu: ${JSON.stringify({ resolvedData: resolvedData || {}, relation, evidence: evidence || {} })}`,
        300
    );
    const parsed = raw ? parseJsonObject(raw) : null;
    return normalizeSuggestions(parsed, userProfile);
}

async function generateTitle(messages = []) {
    const content = (Array.isArray(messages) ? messages : [])
        .slice(0, 4)
        .map((item) => (typeof item === 'string' ? item : item?.message || ''))
        .filter(Boolean)
        .join(' | ');
    const raw = await callGroq(buildTitlePrompt(), content, 100);
    const parsed = raw ? parseJsonObject(raw) : null;
    const title = String(parsed?.title || '').trim().slice(0, 80);
    return title || 'Cuộc hội thoại mới';
}

async function planChatbotQuery(payload = {}) {
    const data = await getPlan(payload);
    if (data?.fallback) {
        return { success: false, code: 'GROQ_PLAN_UNAVAILABLE', data };
    }
    return { success: true, data };
}

async function explainRelationship(payload = {}) {
    const explanation = await getExplanation(payload);
    return { success: Boolean(explanation), data: { success: Boolean(explanation), explanation } };
}

async function suggestFollowups(payload = {}) {
    const data = await getSuggestions(payload);
    return {
        success: true,
        data: {
            success: true,
            suggestions: (data.suggestions || []).map((text) => ({ type: 'followup', text })),
        },
    };
}

async function generateConversationTitle({ messages } = {}) {
    return { success: true, data: { title: await generateTitle(messages || []) } };
}

module.exports = {
    getPlan,
    getExplanation,
    getSuggestions,
    generateTitle,
    planChatbotQuery,
    explainRelationship,
    suggestFollowups,
    generateConversationTitle,
};
