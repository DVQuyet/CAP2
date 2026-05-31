function genderedLabel(person, label) {
    if (!label || typeof label !== 'object') return label;
    if (Number(person?.gender) === 1) return label.male;
    if (Number(person?.gender) === 2) return label.female;
    return label.unknown || `${label.male}/${label.female}`;
}

function matchToken(edge, token, helpers) {
    if (typeof token === 'string') return edge === token;
    if (Array.isArray(token)) return token.includes(edge);
    if (token?.normalize) return helpers.normalizeEdge(edge) === token.normalize;
    if (token?.oneOf) return token.oneOf.includes(edge);
    if (token?.anyChild) return helpers.isAnyChild(edge);
    if (token?.parent) return helpers.isParent(edge);
    return false;
}

function matchPattern(path, pattern, helpers) {
    if (!Array.isArray(pattern) || path.length !== pattern.length) return false;
    return pattern.every((token, index) => matchToken(path[index], token, helpers));
}

function compileKinshipRules(rules = [], helpers = {}) {
    const sortedRules = [...rules].sort((a, b) => {
        const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDiff) return priorityDiff;
        return Number(b.pattern?.length || 0) - Number(a.pattern?.length || 0);
    });

    return {
        match(path = [], context = {}) {
            for (const rule of sortedRules) {
                const matched = typeof rule.match === 'function'
                    ? rule.match(path, context, helpers)
                    : matchPattern(path, rule.pattern, helpers);
                if (!matched) continue;

                const label = typeof rule.label === 'function'
                    ? rule.label(context, helpers)
                    : genderedLabel(context.targetPerson, rule.label);

                return {
                    id: rule.id,
                    label,
                    priority: rule.priority || 0,
                    category: rule.category || 'kinship',
                    confidence: rule.confidence ?? 1,
                };
            }
            return null;
        },
    };
}

module.exports = {
    compileKinshipRules,
    genderedLabel,
};
