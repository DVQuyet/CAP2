const VALID_INTENTS = new Set([
    'relationship_expression',
    'relationship_query',
    'find_relationship',
    'list_children',
    'find_spouse',
    'self_identity',
    'family_analytics',
    'person_info',
    'clan_history',
    'memories_stories',
    'events_upcoming',
    'stats_count',
    'general_chat',
]);

const VALID_EDGES = new Set([
    'father',
    'mother',
    'parent',
    'spouse',
    'husband',
    'wife',
    'child',
    'son',
    'daughter',
    'older_brother',
    'younger_brother',
    'older_sister',
    'younger_sister',
    'sibling',
    'adopted_child',
    'step_child',
    'grandfather',
    'grandmother',
    'grandson',
    'granddaughter',
    'uncle_paternal',
    'aunt_paternal',
    'uncle_maternal',
    'aunt_maternal',
    'nephew',
    'niece',
    'cousin',
]);

const EDGE_NORMALIZATION = {
    husband: 'spouse',
    wife: 'spouse',
};

const EDGE_EXPANSION = {
    grandfather: ['parent', 'father'],
    grandmother: ['parent', 'mother'],
    grandson: ['son', 'son'],
    granddaughter: ['child', 'daughter'],
    uncle_paternal: ['father', 'younger_brother'],
    aunt_paternal: ['father', 'younger_sister'],
    uncle_maternal: ['mother', 'younger_brother'],
    aunt_maternal: ['mother', 'younger_sister'],
    nephew: ['sibling', 'son'],
    niece: ['sibling', 'daughter'],
    cousin: ['parent', 'sibling', 'child'],
};

function parseJson(value) {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (_) {
            return null;
        }
    }
    return value && typeof value === 'object' ? value : null;
}

function normalizeEdge(edge) {
    const normalized = String(edge || '').trim();
    return EDGE_NORMALIZATION[normalized] || normalized;
}

function normalizeSteps(value) {
    if (!Array.isArray(value)) return [];
    return value
        .flatMap((edge) => {
            const normalized = normalizeEdge(edge);
            return EDGE_EXPANSION[normalized] || [normalized];
        })
        .filter(Boolean);
}

function validatePlannerOutput(rawOutput) {
    const output = parseJson(rawOutput?.data || rawOutput);
    if (!output) return { ok: false, reason: 'invalid_json' };
    if (typeof output.answer === 'string' && output.answer.trim()) {
        return { ok: false, reason: 'natural_language_answer_not_allowed' };
    }
    if (!VALID_INTENTS.has(output.intent)) {
        return { ok: false, reason: 'unsupported_intent' };
    }

    const plan = {
        intent: output.intent,
        confidence: Number.isFinite(Number(output.confidence)) ? Number(output.confidence) : null,
        entities: Array.isArray(output.entities)
            ? output.entities
            : output.entities && typeof output.entities === 'object'
                ? output.entities
                : [],
        subtype: output.subtype || null,
        ast: output.ast && typeof output.ast === 'object' ? output.ast : null,
    };

    if (plan.intent === 'relationship_expression' || plan.intent === 'relationship_query') {
        const ast = plan.ast || {};
        const base = ast.base === 'current_focus' || ast.base === 'selected_person' ? ast.base : 'me';
        const steps = normalizeSteps(ast.steps || output.steps || output.expression || output.chain);
        if (!steps.length) return { ok: false, reason: 'missing_relationship_steps' };
        const invalidEdge = steps.find((edge) => !VALID_EDGES.has(edge));
        if (invalidEdge) return { ok: false, reason: `invalid_edge:${invalidEdge}` };
        plan.ast = {
            ...ast,
            base,
            steps,
        };
        plan.expression = steps;
    }

    return { ok: true, plan };
}

module.exports = {
    VALID_INTENTS,
    VALID_EDGES,
    validatePlannerOutput,
};
