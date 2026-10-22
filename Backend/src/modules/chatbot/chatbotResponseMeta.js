// Trường bổ sung cho mọi câu trả lời của trợ lý: personIds (để "Xem trên cây"), relationshipPath nhất quán,
// và cờ fallback để thống kê câu bot chưa hiểu. Toàn bộ là hàm thuần, không đụng DB.

const RELATIONSHIP_INTENTS = new Set([
    'find_relationship',
    'compare_relationship',
    'relationship_expression',
    'relationship_query',
    'follow_up_relationship_query',
    'find_by_kinship',
]);

const MAX_PERSON_IDS = 30;

const toId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

// Danh sách id người được nhắc trong câu trả lời, người trọng tâm đứng đầu, không trùng.
function collectPersonIds(payload, { currentMemberId = null } = {}) {
    if (!payload || payload.success === false) return [];
    const me = toId(currentMemberId);
    const ids = [];
    const add = (value) => {
        const id = toId(value?.id ?? value);
        if (id && !ids.includes(id)) ids.push(id);
    };

    // Người trọng tâm = người trong câu trả lời (danh sách people), rồi chủ thể câu hỏi, rồi đường đi.
    const source = toId(payload.sourcePerson?.id);
    (payload.people || []).forEach(add);
    add(payload.targetPerson);
    add(payload.subjectPerson);
    add(payload.person);
    if (source && source !== me) add(payload.sourcePerson);
    (payload.pathNodes || []).forEach(add);
    (payload.pathPeople || []).forEach(add);
    (payload.candidates || []).forEach(add);
    // Người hỏi chỉ được giữ khi không còn ai khác để hiển thị.
    if (!ids.length && source) add(payload.sourcePerson);
    return ids.slice(0, MAX_PERSON_IDS);
}

// Câu hỏi quan hệ luôn có relationshipPath (mảng, rỗng nếu không có một đường duy nhất).
function withTreeFields(payload, { currentMemberId = null } = {}) {
    if (!payload || typeof payload !== 'object') return payload;
    const next = { ...payload };
    if (RELATIONSHIP_INTENTS.has(next.intent) && !Array.isArray(next.relationshipPath)) {
        next.relationshipPath = [];
    }
    next.personIds = collectPersonIds(next, { currentMemberId });
    return next;
}

// Cờ để truy vấn câu bot chưa hiểu: intent 'unknown' hoặc phải nhờ LLM lập kế hoạch.
function fallbackFlag({ intent, plannerSource } = {}) {
    if (plannerSource === 'llm_planner') return 'llm_planner';
    if (intent === 'unknown') return 'unknown';
    return null;
}

module.exports = { RELATIONSHIP_INTENTS, collectPersonIds, withTreeFields, fallbackFlag };
