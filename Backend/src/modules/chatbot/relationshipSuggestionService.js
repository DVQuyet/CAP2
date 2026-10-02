const chatbotAI = require('./chatbotAI');

function normalizeSuggestion(item) {
    if (typeof item === 'string') {
        const text = item.trim();
        return text ? { type: 'followup', text } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const text = String(item.text || '').trim();
    if (!text) return null;
    return {
        type: String(item.type || 'followup').trim() || 'followup',
        text,
    };
}

function ruleBasedSuggestions({ relation } = {}) {
    const targetName = relation?.targetName || relation?.targetPerson?.name || 'người này';
    return [
        { type: 'explore_person', text: `${targetName} có con là ai?` },
        { type: 'explore_person', text: `Vợ/chồng của ${targetName} là ai?` },
        { type: 'explore_generation', text: `${targetName} thuộc đời thứ mấy?` },
        { type: 'explore_branch', text: `Nhánh của ${targetName} gồm những ai?` },
    ];
}

async function suggest({ message, relation, evidence, memory } = {}) {
    const fallback = ruleBasedSuggestions({ relation });
    const result = await chatbotAI.suggestFollowups({ message, relation, evidence, memory });
    if (!result.success || !result.data?.success || !Array.isArray(result.data.suggestions)) {
        return fallback;
    }

    const aiSuggestions = result.data.suggestions
        .map(normalizeSuggestion)
        .filter(Boolean)
        .slice(0, 4);

    return aiSuggestions.length ? aiSuggestions : fallback;
}

module.exports = {
    suggest,
    ruleBasedSuggestions,
};
