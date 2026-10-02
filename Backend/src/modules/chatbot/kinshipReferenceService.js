const relationshipEngine = require('./relationshipEngine');
const { parseRelationshipExpression } = require('./relationshipQueryParser');
const { resolveRelationshipExpression } = require('./relationshipExpressionResolver');

// Nhận diện cụm xưng hô ("ông nội tôi", "cậu của tôi", "con trai của chị gái mẹ tôi")
// trong vị trí tên người và tra theo đồ thị gia phả, thay vì tìm người có tên như vậy.
// Trả về null nếu không có cụm xưng hô nào để bước tìm theo tên xử lý tiếp.
async function resolveKinshipReference({ clanId, currentMemberId, names = [] }) {
    const sourcePersonId = Number(currentMemberId);
    if (!Number.isFinite(sourcePersonId) || sourcePersonId <= 0) return null;

    const candidates = (Array.isArray(names) ? names : [names])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    for (const name of candidates) {
        const expression = parseRelationshipExpression(name);
        if (expression.needsClarification) continue;

        const graph = await relationshipEngine.loadClanGraph(clanId);
        const resolved = resolveRelationshipExpression(expression, { sourcePersonId, graph });
        const label = expression.terms.join(' của ');

        if (!resolved.ok) {
            return { status: 'not_found', label, expression };
        }

        const people = resolved.candidatePersonIds
            .map((id) => graph.people.get(Number(id)))
            .filter(Boolean);
        if (people.length === 1) {
            return { status: 'resolved', person: people[0], label, expression };
        }
        return { status: 'ambiguous', candidates: people, label, expression };
    }

    return null;
}

module.exports = {
    resolveKinshipReference,
};
