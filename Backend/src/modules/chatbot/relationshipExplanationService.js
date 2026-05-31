const { edgeToVietnamese, describeRelationshipPath } = require('./vietnameseKinshipRules');
const { personName } = require('./relationshipEngine');

function subjectForStep(index) {
    if (index === 0) return 'bạn';
    return 'người đó';
}

function describeStep(edgeType, index) {
    const subject = subjectForStep(index);
    const labels = {
        parent: `cha/mẹ của ${subject}`,
        father: `cha của ${subject}`,
        mother: `mẹ của ${subject}`,
        spouse: `vợ/chồng của ${subject}`,
        son: `con trai của ${subject}`,
        daughter: `con gái của ${subject}`,
        child: `con của ${subject}`,
        older_brother: `anh trai của ${subject}`,
        younger_brother: `em trai của ${subject}`,
        older_sister: `chị gái của ${subject}`,
        younger_sister: `em gái của ${subject}`,
        older_sibling: `anh/chị của ${subject}`,
        younger_sibling: `em của ${subject}`,
        step_father: `cha dượng của ${subject}`,
        step_mother: `mẹ kế của ${subject}`,
        adopted_parent: `cha/mẹ nuôi của ${subject}`,
        adopted_child: `con nuôi của ${subject}`,
        half_sibling: `anh/chị/em cùng cha hoặc cùng mẹ của ${subject}`,
    };
    return labels[edgeType] || `${edgeToVietnamese(edgeType)} của ${subject}`;
}

function buildBreadcrumb(relation) {
    const path = relation?.relationshipPath || [];
    const crumbs = ['Bạn'];
    for (let i = 0; i < path.length; i += 1) {
        crumbs.push(describeStep(path[i], i));
    }
    if (relation?.relationshipLabel) crumbs.push(relation.relationshipLabel);
    return crumbs;
}

function explainRelationship(relation) {
    if (!relation?.found) return null;
    const targetName = relation.targetName || personName(relation.targetPerson);
    const sourceName = relation.sourceName || personName(relation.sourcePerson) || 'bạn';
    const label = relation.relationshipLabel || describeRelationshipPath(relation.relationshipPath || [], {
        sourcePerson: relation.sourcePerson,
        targetPerson: relation.targetPerson,
    });

    if (!relation.relationshipPath?.length) {
        return `${targetName} chính là ${sourceName}.`;
    }

    const readable = relation.relationshipPath.map((edge, index) => describeStep(edge, index));
    const reason = readable.length ? ` vì ${readable.join(', rồi đến ')}.` : '.';
    return `${targetName} là ${label} của ${sourceName}${reason}`;
}

function buildPathVisualizer(relation) {
    const breadcrumb = buildBreadcrumb(relation);
    return {
        breadcrumb,
        text: breadcrumb.join(' -> '),
        edges: (relation?.relationshipPath || []).map((edge, index) => ({
            index,
            edge,
            label: edgeToVietnamese(edge),
            description: describeStep(edge, index),
        })),
    };
}

module.exports = {
    explainRelationship,
    buildBreadcrumb,
    buildPathVisualizer,
};
