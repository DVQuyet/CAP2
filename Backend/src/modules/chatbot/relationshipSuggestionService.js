const aiChatbotClient = require('./aiChatbotClient');

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
    const targetName = relation?.targetName || relation?.targetPerson?.name || 'ngÆ°á»i nÃ y';
    return [
        { type: 'explore_person', text: `${targetName} cÃ³ con lÃ  ai?` },
        { type: 'explore_person', text: `Vá»£/chá»“ng cá»§a ${targetName} lÃ  ai?` },
        { type: 'explore_generation', text: `${targetName} thuá»™c Ä‘á»i thá»© máº¥y?` },
        { type: 'explore_branch', text: `NhÃ¡nh cá»§a ${targetName} gá»“m nhá»¯ng ai?` },
    ];
}

async function suggest({ message, relation, evidence, memory } = {}) {
    const fallback = ruleBasedSuggestions({ relation });
    const result = await aiChatbotClient.suggestFollowups({ message, relation, evidence, memory });
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
