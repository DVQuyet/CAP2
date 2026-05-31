const { normalizeEdge } = require('./vietnameseKinshipRules');

function uniqueNumbers(values = []) {
    return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
}

function edgeMatches(edgeType, expectedType) {
    if (edgeType === expectedType) return true;
    if (expectedType === 'child') return edgeType === 'son' || edgeType === 'daughter' || edgeType === 'child';
    if (expectedType === 'parent') return edgeType === 'father' || edgeType === 'mother' || edgeType === 'parent';
    if (expectedType === 'spouse') return edgeType === 'spouse';
    return normalizeEdge(edgeType) === normalizeEdge(expectedType);
}

function resolveRelationshipExpression(ast, context = {}) {
    const sourcePersonId = Number(context.sourcePersonId);
    const graph = context.graph || {};
    const adjacency = graph.adjacency || context.adjacency;
    const chain = Array.isArray(ast?.chain) ? ast.chain : [];

    if (!ast || ast.needsClarification || ast.base !== 'me' || !chain.length) {
        return {
            ok: false,
            needsClarification: true,
            reason: ast?.reason || 'invalid_relationship_expression',
        };
    }

    if (!Number.isFinite(sourcePersonId) || sourcePersonId <= 0) {
        return {
            ok: false,
            needsClarification: true,
            reason: 'missing_source_person',
        };
    }

    if (!adjacency || typeof adjacency.get !== 'function') {
        return {
            ok: false,
            needsClarification: true,
            reason: 'missing_graph_adjacency',
        };
    }

    let currentIds = [sourcePersonId];
    const traversedPath = [];

    for (const expectedEdge of chain) {
        const nextIds = [];
        for (const personId of currentIds) {
            for (const edge of adjacency.get(Number(personId)) || []) {
                if (edgeMatches(edge.type, expectedEdge)) {
                    nextIds.push(Number(edge.to));
                }
            }
        }
        currentIds = uniqueNumbers(nextIds);
        traversedPath.push(expectedEdge);

        if (!currentIds.length) {
            return {
                ok: false,
                basePersonId: sourcePersonId,
                relationshipPath: traversedPath,
                candidatePersonIds: [],
                needsClarification: true,
                reason: 'no_matching_person',
            };
        }
    }

    return {
        ok: true,
        basePersonId: sourcePersonId,
        relationshipPath: chain,
        candidatePersonIds: currentIds,
        needsClarification: currentIds.length !== 1,
        reason: currentIds.length !== 1 ? 'multiple_matching_people' : null,
    };
}

module.exports = {
    resolveRelationshipExpression,
};
