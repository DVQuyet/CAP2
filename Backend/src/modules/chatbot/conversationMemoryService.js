const MEMORY_TTL_MS = Number(process.env.CHATBOT_MEMORY_TTL_MS || 30 * 60 * 1000);
const MAX_MEMORY_SESSIONS = Number(process.env.CHATBOT_MEMORY_MAX_SESSIONS || 1000);
const MAX_RECENT_ENTITIES = Number(process.env.CHATBOT_MEMORY_MAX_RECENT_ENTITIES || 20);
const memoryStore = new Map();

function normalizePart(value, fallback = 'anonymous') {
    const text = String(value || '').trim();
    return text || fallback;
}

function buildConversationSessionId({ sessionId, userId, clanId } = {}) {
    const scopedUserId = normalizePart(userId);
    const scopedClanId = normalizePart(clanId, 'no-clan');
    const scopedSessionId = normalizePart(sessionId, `${scopedUserId}:${scopedClanId}`);
    return `${scopedUserId}:${scopedClanId}:${scopedSessionId}`;
}

function memoryKey(sessionId) {
    if (typeof sessionId === 'object' && sessionId !== null) return buildConversationSessionId(sessionId);
    return normalizePart(sessionId);
}

function now() {
    return Date.now();
}

function emptyMemory(key) {
    return {
        sessionId: key,
        mentionedMembers: [],
        currentFocusMember: null,
        lastRelationQuery: null,
        conversationState: {},
        recentEntities: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: now() + MEMORY_TTL_MS,
    };
}

function isExpired(memory) {
    return Number(memory?.expiresAt || 0) <= now();
}

function pruneMemoryStore() {
    const current = now();
    for (const [key, memory] of memoryStore.entries()) {
        if (Number(memory?.expiresAt || 0) <= current) memoryStore.delete(key);
    }

    if (memoryStore.size <= MAX_MEMORY_SESSIONS) return;
    const overflow = memoryStore.size - MAX_MEMORY_SESSIONS;
    const oldest = [...memoryStore.entries()]
        .sort((a, b) => Date.parse(a[1]?.updatedAt || 0) - Date.parse(b[1]?.updatedAt || 0))
        .slice(0, overflow);
    for (const [key] of oldest) memoryStore.delete(key);
}

function normalizeMember(value) {
    if (!value) return null;
    const id = Number(value.id || value.personId || value.person_id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return {
        id,
        name: value.name || value.display_name || value.displayName || null,
        relationshipLabel: value.relationshipLabel || value.relationship_label || null,
        updatedAt: new Date().toISOString(),
    };
}

function mergeMembers(existing = [], nextMembers = []) {
    const merged = new Map();
    for (const item of existing) {
        const member = normalizeMember(item);
        if (member) merged.set(member.id, { ...member, ...item });
    }
    for (const item of nextMembers) {
        const member = normalizeMember(item);
        if (member) merged.set(member.id, { ...(merged.get(member.id) || {}), ...member });
    }
    return [...merged.values()].slice(-MAX_RECENT_ENTITIES);
}

function getConversationMemory(sessionId) {
    const key = memoryKey(sessionId);
    const memory = memoryStore.get(key) || null;
    if (!memory) return null;
    if (isExpired(memory)) {
        memoryStore.delete(key);
        return null;
    }
    return memory;
}

function updateConversationMemory(sessionId, patch = {}) {
    const key = memoryKey(sessionId);
    pruneMemoryStore();
    const current = getConversationMemory(key) || emptyMemory(key);
    const focusMember = normalizeMember(patch.currentFocusMember || patch.targetPerson || patch.person || (
        patch.lastMentionedPersonId
            ? {
                id: patch.lastMentionedPersonId,
                name: patch.lastMentionedPersonName,
                relationshipLabel: patch.lastRelationshipLabel,
            }
            : null
    ));
    const mentionedMembers = mergeMembers(
        current.mentionedMembers || [],
        [
            ...(Array.isArray(patch.mentionedMembers) ? patch.mentionedMembers : []),
            ...(focusMember ? [focusMember] : []),
        ]
    );
    const recentEntities = mergeMembers(
        current.recentEntities || [],
        [
            ...(Array.isArray(patch.recentEntities) ? patch.recentEntities : []),
            ...(focusMember ? [focusMember] : []),
        ]
    );
    const next = {
        ...current,
        ...patch,
        mentionedMembers,
        recentEntities,
        currentFocusMember: focusMember || patch.currentFocusMember || current.currentFocusMember || null,
        lastRelationQuery: patch.lastRelationQuery || (patch.lastRelationshipPath ? {
            relationshipLabel: patch.lastRelationshipLabel || null,
            relationshipPath: patch.lastRelationshipPath || null,
            pathNodes: patch.lastPathNodes || null,
            evidence: patch.lastEvidence || null,
        } : current.lastRelationQuery || null),
        conversationState: {
            ...(current.conversationState || {}),
            ...(patch.conversationState || {}),
        },
        sessionId: key,
        updatedAt: new Date().toISOString(),
        expiresAt: now() + MEMORY_TTL_MS,
    };
    memoryStore.set(key, next);
    return next;
}

function clearConversationMemory(sessionId) {
    const key = memoryKey(sessionId);
    memoryStore.delete(key);
}

module.exports = {
    buildConversationSessionId,
    getConversationMemory,
    updateConversationMemory,
    clearConversationMemory,
    pruneMemoryStore,
};
