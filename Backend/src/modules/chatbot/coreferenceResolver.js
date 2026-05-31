const {
    normalizeRelationshipQuery,
    parseRelationshipTerms,
    relationshipTermToEdges,
} = require('./relationshipQueryParser');

const COREFERENCE_TERMS = [
    'nguoi do',
    'nguoi nay',
    'nguoi ay',
    'ong ay',
    'ba ay',
    'anh ay',
    'chi ay',
    'bac ay',
    'chu ay',
    'co ay',
    'cau ay',
    'di ay',
    'em ay',
];

function stripQuestionIntent(text) {
    return String(text || '')
        .replace(/^(ai la|cho toi hoi|toi hoi|xin hoi|hoi)\s+/g, '')
        .replace(/\s+(la ai|ten gi|gom ai|la nhung ai|khong)$/g, '')
        .trim();
}

function personById(id, peopleById) {
    if (!id || !peopleById) return null;
    if (typeof peopleById.get === 'function') return peopleById.get(Number(id)) || peopleById.get(String(id)) || null;
    return peopleById[id] || peopleById[String(id)] || null;
}

function flattenTermsToChain(terms = []) {
    return terms.flatMap((term) => relationshipTermToEdges(term) || []);
}

function parseRelationshipPrefix(prefix) {
    const parsed = parseRelationshipTerms(prefix);
    if (!parsed.ok || !parsed.terms.length) return null;
    return {
        terms: parsed.terms,
        chain: flattenTermsToChain(parsed.terms),
    };
}

function findCoreferenceTerm(text) {
    return COREFERENCE_TERMS
        .sort((a, b) => b.length - a.length)
        .find((term) => new RegExp(`(^|\\s)${term}(\\s|$)`).test(text));
}

function parseFollowUpExpression(normalizedText, coreferenceTerm) {
    const text = stripQuestionIntent(normalizedText);
    const escaped = coreferenceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const beforeReference = text.match(new RegExp(`^(.+?)\\s+cua\\s+${escaped}(?:\\s|$)`));
    if (beforeReference) return parseRelationshipPrefix(beforeReference[1]);

    const hasRelation = text.match(new RegExp(`^${escaped}\\s+co\\s+(.+?)(?:\\s|$)`));
    if (hasRelation) return parseRelationshipPrefix(hasRelation[1]);

    return null;
}

function resolveCoreference(text, memory, context = {}) {
    const normalizedText = normalizeRelationshipQuery(text);
    const coreferenceTerm = findCoreferenceTerm(normalizedText);
    if (!coreferenceTerm) {
        return {
            resolved: false,
            needsClarification: false,
            reason: 'no_coreference_term',
        };
    }

    const focusId = memory?.currentFocusMember?.id || memory?.recentEntities?.[memory.recentEntities.length - 1]?.id;
    const referencedPersonId = Number(memory?.lastMentionedPersonId || focusId);
    if (!Number.isFinite(referencedPersonId) || referencedPersonId <= 0) {
        return {
            resolved: false,
            needsClarification: true,
            reason: 'missing_conversation_reference',
        };
    }

    const referencedPerson = personById(referencedPersonId, context.peopleById);
    if (!referencedPerson) {
        return {
            resolved: false,
            needsClarification: true,
            reason: 'reference_not_allowed',
        };
    }

    if (context.clanId && Number(referencedPerson.clan_id) && Number(referencedPerson.clan_id) !== Number(context.clanId)) {
        return {
            resolved: false,
            needsClarification: true,
            reason: 'reference_not_allowed',
        };
    }

    const expression = parseFollowUpExpression(normalizedText, coreferenceTerm);
    if (!expression?.chain?.length) {
        return {
            resolved: true,
            resolvedText: normalizedText.replace(coreferenceTerm, memory.lastMentionedPersonName || memory?.currentFocusMember?.name || String(referencedPersonId)),
            referencedPersonId,
            reason: 'last_mentioned_person',
        };
    }

    return {
        resolved: true,
        intent: 'follow_up_relationship_query',
        basePersonId: referencedPersonId,
        referencedPersonId,
        referencedPersonName: memory.lastMentionedPersonName || memory?.currentFocusMember?.name || null,
        relationshipTerms: expression.terms,
        chain: expression.chain,
        reason: 'last_mentioned_person',
    };
}

module.exports = {
    COREFERENCE_TERMS,
    resolveCoreference,
};
