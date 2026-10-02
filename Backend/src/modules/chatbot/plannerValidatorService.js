const VALID_INTENTS = new Set([
    'relationship_expression',
    'relationship_query',
    'find_relationship',
    'list_children',
    'find_spouse',
    'self_identity',
    'family_analytics',
    'person_exists',
    'person_info',
    'clan_history',
    'memories_stories',
    'events_upcoming',
    'stats_count',
    'general_chat',
]);

const { EDGE_ACCEPTS } = require('./relationshipExpressionResolver');

// Cạnh LLM được phép trả về: các cạnh resolver hiểu được, cộng các cạnh viết tắt được
// mở rộng ở EDGE_EXPANSION bên dưới.
const EDGE_EXPANSION = {
    grandfather: ['parent', 'father'],
    grandmother: ['parent', 'mother'],
    grandson: ['child', 'son'],
    granddaughter: ['child', 'daughter'],
    uncle_paternal: ['father', 'brother'],
    aunt_paternal: ['father', 'sister'],
    uncle_maternal: ['mother', 'brother'],
    aunt_maternal: ['mother', 'sister'],
    nephew: ['sibling', 'son'],
    niece: ['sibling', 'daughter'],
    cousin: ['parent', 'sibling', 'child'],
};

const EDGE_NORMALIZATION = {
    husband: 'spouse',
    wife: 'spouse',
};

const VALID_EDGES = new Set([
    ...Object.keys(EDGE_ACCEPTS),
    ...Object.keys(EDGE_EXPANSION),
    ...Object.keys(EDGE_NORMALIZATION),
    'adopted_child',
    'step_child',
]);

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
