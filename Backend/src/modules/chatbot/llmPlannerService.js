const VALID_EDGES = new Set([
    'father',
    'mother',
    'parent',
    'son',
    'daughter',
    'child',
    'older_brother',
    'younger_brother',
    'older_sister',
    'younger_sister',
    'older_sibling',
    'younger_sibling',
    'sibling',
    'spouse',
    'adopted_parent',
    'adopted_child',
    'adopted_son',
    'adopted_daughter',
    'step_father',
    'step_mother',
    'step_child',
    'step_son',
    'step_daughter',
    'half_sibling',
]);

const VALID_INTENTS = new Set([
    'relationship_query',
    'find_related_person',
    'relationship_expression',
]);

const VALID_QUERY_TYPES = new Set([
    'who_is_target',
    'how_should_source_call_target',
    'how_are_source_and_target_related',
    'find_related_person',
]);

function parsePlannerJson(value) {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }
    return value && typeof value === 'object' ? value : null;
}

function validateEndpoint(endpoint, fieldName) {
    if (!endpoint || typeof endpoint !== 'object') return `${fieldName}_missing`;
    if (endpoint.base !== 'me' && endpoint.base !== 'selected_person') return `${fieldName}_unsupported_base`;
    if ('name' in endpoint || 'displayName' in endpoint || 'personName' in endpoint) return `${fieldName}_invented_person`;
    if (endpoint.personId !== undefined && !Number.isFinite(Number(endpoint.personId))) return `${fieldName}_invalid_person_id`;

    if (endpoint.chain !== undefined) {
        if (!Array.isArray(endpoint.chain)) return `${fieldName}_invalid_chain`;
        const invalidEdge = endpoint.chain.find((edge) => !VALID_EDGES.has(edge));
        if (invalidEdge) return `${fieldName}_invalid_edge:${invalidEdge}`;
    }

    return null;
}

function validatePlannerOutput(value) {
    const json = parsePlannerJson(value);
    if (!json) return { ok: false, reason: 'invalid_json' };
    if (!VALID_INTENTS.has(json.intent)) return { ok: false, reason: 'unsupported_intent' };
    if (json.queryType && !VALID_QUERY_TYPES.has(json.queryType)) return { ok: false, reason: 'unsupported_query_type' };

    const sourceError = validateEndpoint(json.source, 'source');
    if (sourceError) return { ok: false, reason: sourceError };

    const targetError = validateEndpoint(json.target, 'target');
    if (targetError) return { ok: false, reason: targetError };

    const unsupportedKeys = Object.keys(json).filter((key) => !['intent', 'queryType', 'source', 'target', 'confidence'].includes(key));
    if (unsupportedKeys.length) return { ok: false, reason: `unsupported_keys:${unsupportedKeys.join(',')}` };

    return {
        ok: true,
        value: {
            intent: json.intent,
            queryType: json.queryType || 'who_is_target',
            source: {
                base: json.source.base,
                personId: json.source.personId ?? null,
                chain: json.source.chain || [],
            },
            target: {
                base: json.target.base,
                personId: json.target.personId ?? null,
                chain: json.target.chain || [],
            },
            confidence: Number.isFinite(Number(json.confidence)) ? Number(json.confidence) : null,
        },
    };
}

function buildPlannerPrompt(message) {
    return [
        'Return strict JSON only. Do not answer the relationship.',
        'Use only supported graph edges. Do not invent people.',
        `User message: ${String(message || '')}`,
    ].join('\n');
}

module.exports = {
    VALID_EDGES,
    buildPlannerPrompt,
    validatePlannerOutput,
};
