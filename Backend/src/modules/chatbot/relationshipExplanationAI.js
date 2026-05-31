const aiChatbotClient = require('./aiChatbotClient');
const fallbackExplanationService = require('./relationshipExplanationService');

function hasUsableEvidence(evidence) {
    return Boolean(evidence && (Array.isArray(evidence.steps) ? evidence.steps.length : evidence.summary));
}

async function buildExplanation({ relation, path, evidence } = {}) {
    const fallback = relation ? fallbackExplanationService.explainRelationship(relation) : null;
    if (!hasUsableEvidence(evidence)) {
        return { explanation: fallback, aiUsed: false, source: 'rule_explanation' };
    }

    const result = await aiChatbotClient.explainRelationship({
        relation: relation?.relationshipLabel || relation?.relation || relation,
        path: path || relation?.relationshipPath || [],
        evidence,
    });

    const explanation = String(result?.data?.explanation || '').trim();
    if (!result.success || !result.data?.success || !explanation) {
        return { explanation: fallback, aiUsed: false, source: 'rule_explanation' };
    }

    return {
        explanation,
        aiUsed: true,
        source: 'llm_language_layer',
    };
}

module.exports = {
    buildExplanation,
};
