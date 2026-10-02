const { callGroq } = require('./groqClient');
const {
    buildPlanPrompt,
    buildExplainPrompt,
    buildExplainData,
    escapeDataBlock,
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

async function getPlan({ message, history, userProfile, clanContext } = {}) {
    const historyText = (history || [])
        .map((item) => `${item.sender === 'user' ? 'User' : 'Bot'}: ${item.message || ''}`)
        .join('\n');
    // Bộ phân tích chỉ cần biết người hỏi thuộc đời/chi nào; không gửi địa chỉ, ngày sinh, tiểu sử.
    const profile = {
        display_name: userProfile?.display_name || null,
        gender: userProfile?.gender ?? null,
        generation: userProfile?.generation ?? null,
        branch: userProfile?.branch || null,
    };
    const userContent = escapeDataBlock([
        `Lịch sử hội thoại:\n${historyText || '(chưa có)'}`,
        `Người dùng: ${JSON.stringify(profile)}`,
        `Dòng họ: ${clanContext?.clan_name || ''}`,
    ].join('\n\n')) + `\n\n<cau_hoi>${escapeDataBlock(message || '')}</cau_hoi>`;

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
    const systemPrompt = buildExplainPrompt();
    const lookup = [
        `Loại câu hỏi: ${intent || ''}`,
        `Dữ liệu đã tra cứu: ${JSON.stringify(resolvedData || {})}`,
        `Quan hệ đã xác minh: ${JSON.stringify({ relation, path: path || [], evidence: evidence || {} })}`,
        `Lịch sử hội thoại: ${JSON.stringify((history || []).slice(-6))}`,
    ].join('\n');
    const data = buildExplainData({ clanContext, userProfile, recentMemories, extra: intent === 'general_chat' ? '' : lookup });
    const question = intent === 'general_chat'
        ? `${escapeDataBlock(userMessage || '')}\n(Trả lời thân thiện, ngắn gọn 1-2 câu.)`
        : escapeDataBlock(userMessage || '');
    const userContent = `<du_lieu>\n${data}\n</du_lieu>\n\n<cau_hoi>${question}</cau_hoi>`;

    const raw = await callGroq(systemPrompt, userContent, 800);
    const text = String(raw || '').trim();
    return text || fallbackExplain({ intent, relation, evidence, userProfile, clanContext });
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

async function generateConversationTitle({ messages } = {}) {
    return { success: true, data: { title: await generateTitle(messages || []) } };
}

module.exports = {
    getPlan,
    getExplanation,
    generateTitle,
    planChatbotQuery,
    explainRelationship,
    generateConversationTitle,
};
