// Cạnh trong đồ thị đã mang giới tính và thứ bậc (older_brother, daughter...). Cạnh được hỏi
// có thể cụ thể (older_brother) hoặc chung (sibling, brother, child). Cạnh dữ liệu chưa rõ
// giới tính (older_sibling, child) vẫn được chấp nhận vì không mâu thuẫn với câu hỏi.
const EDGE_ACCEPTS = {
    parent: ['father', 'mother', 'parent'],
    father: ['father', 'parent'],
    mother: ['mother', 'parent'],
    child: ['son', 'daughter', 'child'],
    son: ['son', 'child'],
    daughter: ['daughter', 'child'],
    spouse: ['spouse', 'husband', 'wife'],
    husband: ['spouse', 'husband'],
    wife: ['spouse', 'wife'],
    sibling: ['older_brother', 'younger_brother', 'older_sister', 'younger_sister', 'older_sibling', 'younger_sibling', 'sibling', 'half_sibling'],
    brother: ['older_brother', 'younger_brother', 'older_sibling', 'younger_sibling', 'sibling'],
    sister: ['older_sister', 'younger_sister', 'older_sibling', 'younger_sibling', 'sibling'],
    older_sibling: ['older_brother', 'older_sister', 'older_sibling'],
    younger_sibling: ['younger_brother', 'younger_sister', 'younger_sibling'],
    older_brother: ['older_brother', 'older_sibling'],
    younger_brother: ['younger_brother', 'younger_sibling'],
    older_sister: ['older_sister', 'older_sibling'],
    younger_sister: ['younger_sister', 'younger_sibling'],
};

function uniqueNumbers(values = []) {
    return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
}

function edgeMatches(edgeType, expectedType) {
    if (edgeType === expectedType) return true;
    const accepted = EDGE_ACCEPTS[expectedType];
    return Boolean(accepted && accepted.includes(edgeType));
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
    EDGE_ACCEPTS,
    edgeMatches,
    resolveRelationshipExpression,
};
