const { matchVietnameseKinshipRule } = require('./vietnameseKinshipRules');

function clamp(value) {
    return Math.max(0.1, Math.min(1, Number(value) || 0));
}

function scoreRelationship({ relation, path, evidence, candidateCount } = {}) {
    const relationshipPath = Array.isArray(path)
        ? path
        : Array.isArray(relation?.relationshipPath)
            ? relation.relationshipPath
            : [];
    let score = Number.isFinite(Number(relation?.confidence)) ? Number(relation.confidence) : 0.86;

    if (relationshipPath.length > 3) score -= (relationshipPath.length - 3) * 0.035;
    if (relationshipPath.length > 6) score -= 0.08;
    if (Number(candidateCount || relation?.candidateCount || 1) > 1) score -= 0.08;

    const ruleMatch = matchVietnameseKinshipRule(relationshipPath, {
        sourcePerson: relation?.sourcePerson || null,
        targetPerson: relation?.targetPerson || null,
    });
    if (ruleMatch?.confidence) score = Math.min(score, Number(ruleMatch.confidence));
    if (!ruleMatch?.id && relationshipPath.length > 1) score -= 0.1;

    if (relationshipPath.some((edge) => String(edge).includes('adopted') || String(edge).includes('step'))) score -= 0.04;
    if (relationshipPath.includes('spouse')) score -= 0.03;
    if (!evidence?.steps?.length && relationshipPath.length) score -= 0.05;

    return Number(clamp(score).toFixed(4));
}

module.exports = {
    scoreRelationship,
};
