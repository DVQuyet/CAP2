const chatbotAI = require('./chatbotAI');
const fallbackExplanationService = require('./relationshipExplanationService');

function hasUsableEvidence(evidence) {
    return Boolean(evidence && (Array.isArray(evidence.steps) ? evidence.steps.length : evidence.summary));
}

async function buildExplanation({ relation, path, evidence } = {}) {
    const fallback = relation ? fallbackExplanationService.explainRelationship(relation) : null;
    // Lời giải thích dựng bằng luật đã nêu đủ tên người dọc đường quan hệ; chỉ gọi LLM khi bật CHATBOT_LLM_REWRITE=all.
    if (process.env.CHATBOT_LLM_REWRITE !== 'all' || !hasUsableEvidence(evidence)) {
        return { explanation: fallback, aiUsed: false, source: 'rule_explanation' };
    }

    const result = await chatbotAI.explainRelationship({
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
