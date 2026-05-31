const { edgeToVietnamese, describeRelationshipPath } = require('./vietnameseKinshipRules');

function personDisplayName(person) {
    if (!person) return null;
    const display = String(person.display_name || '').trim();
    if (display) return display;
    const parts = [person.surname, person.middle_name, person.first_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean);
    return parts.join(' ') || null;
}

function personById(id, peopleById) {
    if (!id || !peopleById) return null;
    if (typeof peopleById.get === 'function') return peopleById.get(Number(id)) || peopleById.get(String(id)) || null;
    return peopleById[id] || peopleById[String(id)] || null;
}

function visibleName(person, fallback, canViewPersonName) {
    if (!person) return fallback || 'một người thân';
    if (typeof canViewPersonName === 'function' && !canViewPersonName(person)) {
        return fallback || 'một người thân';
    }
    return personDisplayName(person) || fallback || 'một người thân';
}

function possessiveName(name) {
    return name === 'bạn' || name === 'Bạn' ? 'bạn' : name;
}

function edgeToEvidenceText(edge, fromPerson, toPerson, context = {}) {
    const fromName = context.fromName || visibleName(fromPerson, 'người này', context.canViewPersonName);
    const toName = context.toName || visibleName(toPerson, 'một người thân', context.canViewPersonName);
    const owner = possessiveName(fromName);
    const label = edgeToVietnamese(edge, { targetPerson: toPerson });

    const labels = {
        father: 'cha',
        mother: 'mẹ',
        parent: 'cha/mẹ',
        son: 'con trai',
        daughter: 'con gái',
        child: 'con',
        older_brother: 'anh trai',
        younger_brother: 'em trai',
        older_sister: 'chị gái',
        younger_sister: 'em gái',
        older_sibling: 'anh/chị',
        younger_sibling: 'em',
        spouse: 'vợ/chồng',
        adopted_parent: 'cha/mẹ nuôi',
        adopted_son: 'con nuôi',
        adopted_daughter: 'con nuôi',
        adopted_child: 'con nuôi',
        step_father: 'cha dượng',
        step_mother: 'mẹ kế',
        step_son: 'con riêng',
        step_daughter: 'con riêng',
        step_child: 'con riêng',
        half_sibling: 'anh/chị/em cùng cha hoặc cùng mẹ',
    };

    return `${toName} là ${labels[edge] || label} của ${owner}.`;
}

function buildPathText(relationshipPath = []) {
    if (!relationshipPath.length) return 'Bạn';
    return ['Bạn', ...relationshipPath.map((edge) => edgeToVietnamese(edge))].join(' -> ');
}

function buildSimpleChainSummary({
    sourceName,
    targetName,
    relationshipLabel,
    relationshipPath,
}) {
    if (!relationshipPath?.length) return `${targetName} chính là ${sourceName}.`;

    if (relationshipPath.length === 2) {
        const [firstEdge, secondEdge] = relationshipPath;
        const firstLabel = edgeToVietnamese(firstEdge);
        const secondLabel = edgeToVietnamese(secondEdge);
        return `${targetName} là ${relationshipLabel} của ${sourceName} vì ${targetName} là ${secondLabel} của ${firstLabel} ${possessiveName(sourceName)}.`;
    }

    return null;
}

function buildEvidenceSummary({
    sourcePerson,
    targetPerson,
    relationshipPath = [],
    relationshipLabel,
    canViewPersonName,
}) {
    const sourceName = visibleName(sourcePerson, 'bạn', canViewPersonName);
    const normalizedSourceName = sourceName === 'một người thân' ? 'người này' : sourceName;
    const targetName = visibleName(targetPerson, 'người này', canViewPersonName);
    const label = relationshipLabel || describeRelationshipPath(relationshipPath, { sourcePerson, targetPerson });

    const simple = buildSimpleChainSummary({
        sourceName: normalizedSourceName,
        targetName,
        relationshipLabel: label,
        relationshipPath,
    });
    if (simple) return simple;

    const readablePath = relationshipPath.map((edge) => edgeToVietnamese(edge)).join(' -> ');
    return `${targetName} có quan hệ "${label}" với ${normalizedSourceName}${readablePath ? ` qua đường ${readablePath}` : ''}.`;
}

function buildPathNodesFallback({ sourcePerson, targetPerson, relationshipPath, edges }) {
    if (!relationshipPath?.length) return [sourcePerson?.id || null].filter(Boolean);
    if (!Array.isArray(edges) || !edges.length) return [];
    const nodes = [sourcePerson?.id || edges[0]?.from || null].filter(Boolean);
    for (const edge of edges) {
        if (edge?.to) nodes.push(edge.to);
    }
    if (targetPerson?.id && nodes[nodes.length - 1] !== targetPerson.id) nodes.push(targetPerson.id);
    return nodes;
}

function buildRelationshipEvidence({
    sourcePerson,
    targetPerson,
    relationshipPath = [],
    pathNodes,
    peopleById,
    edges = [],
    relationshipLabel,
    locale = 'vi',
    canViewPersonName,
} = {}) {
    const resolvedPathNodes = Array.isArray(pathNodes) && pathNodes.length
        ? pathNodes
        : buildPathNodesFallback({ sourcePerson, targetPerson, relationshipPath, edges });

    const steps = relationshipPath.map((edge, index) => {
        const fromPersonId = resolvedPathNodes[index] || null;
        const toPersonId = resolvedPathNodes[index + 1] || null;
        const fromPerson = personById(fromPersonId, peopleById) || (index === 0 ? sourcePerson : null);
        const toPerson = personById(toPersonId, peopleById) || (index === relationshipPath.length - 1 ? targetPerson : null);
        const fromName = index === 0
            ? 'bạn'
            : visibleName(fromPerson, 'một người thân', canViewPersonName);
        const toName = visibleName(toPerson, 'một người thân', canViewPersonName);

        return {
            index: index + 1,
            fromPersonId,
            toPersonId,
            fromName,
            toName,
            edge,
            edgeLabel: edgeToVietnamese(edge, { targetPerson: toPerson }),
            text: edgeToEvidenceText(edge, fromPerson, toPerson, {
                fromName,
                toName,
                canViewPersonName,
                locale,
            }),
        };
    });

    return {
        steps,
        summary: buildEvidenceSummary({
            sourcePerson,
            targetPerson,
            relationshipPath,
            relationshipLabel,
            canViewPersonName,
        }),
        pathText: buildPathText(relationshipPath),
    };
}

module.exports = {
    buildRelationshipEvidence,
    edgeToEvidenceText,
    buildEvidenceSummary,
};
