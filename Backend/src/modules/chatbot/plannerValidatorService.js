const VALID_INTENTS = new Set([
    'relationship_expression',
    'find_relationship',
    'list_children',
    'find_spouse',
    'self_identity',
    'family_analytics',
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
]);

const EDGE_NORMALIZATION = {
    husband: 'spouse',
    wife: 'spouse',
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
    return value.map(normalizeEdge).filter(Boolean);
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
        entities: output.entities && typeof output.entities === 'object' ? output.entities : {},
        ast: output.ast && typeof output.ast === 'object' ? output.ast : null,
    };

    if (plan.intent === 'relationship_expression') {
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
