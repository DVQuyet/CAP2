const { getRegionalKinshipProfile } = require('./regionalKinshipProfile');

const MALE = 1;
const FEMALE = 2;

const PARENT_EDGES = new Set(['father', 'mother', 'parent', 'adopted_parent', 'step_father', 'step_mother']);
const CHILD_EDGES = new Set(['son', 'daughter', 'child', 'adopted_son', 'adopted_daughter', 'adopted_child', 'step_son', 'step_daughter', 'step_child']);
const SIBLING_EDGES = new Set(['older_brother', 'younger_brother', 'older_sister', 'younger_sister', 'older_sibling', 'younger_sibling', 'sibling', 'half_sibling']);

function edgeGenerationDelta(edge) {
    if (PARENT_EDGES.has(edge)) return -1;
    if (CHILD_EDGES.has(edge)) return 1;
    return 0;
}

function analyzeRelationshipPath(path = [], context = {}) {
    if (!Array.isArray(path) || !path.length) return null;

    let relativeGeneration = 0;
    let upDepth = 0;
    let downDepth = 0;
    let hasSiblingBranch = false;
    let hasSpouse = false;
    let siblingIndex = -1;
    let siblingEdge = null;

    for (let index = 0; index < path.length; index += 1) {
        const edge = path[index];
        const delta = edgeGenerationDelta(edge);
        relativeGeneration += delta;
        if (delta < 0) upDepth += 1;
        if (delta > 0) downDepth += 1;
        if (SIBLING_EDGES.has(edge)) {
            hasSiblingBranch = true;
            if (siblingIndex === -1) {
                siblingIndex = index;
                siblingEdge = edge;
            }
        }
        if (edge === 'spouse') hasSpouse = true;
    }

    const firstBloodEdge = path.find((edge) => edge !== 'spouse');
    const side = firstBloodEdge === 'father'
        ? 'paternal'
        : firstBloodEdge === 'mother'
            ? 'maternal'
            : 'unknown';

    const branchDepth = upDepth >= 4
        ? 'ky'
        : upDepth === 3
            ? 'cu'
            : upDepth === 2
                ? 'grandparent'
                : upDepth === 1
                    ? 'parent'
                    : 'same';

    return {
        relativeGeneration,
        upDepth,
        downDepth,
        hasSiblingBranch,
        hasSpouse,
        side,
        branchDepth,
        siblingIndex,
        siblingEdge,
        isDistant: path.length >= 4 || upDepth >= 3 || downDepth >= 2,
        targetGender: Number(context.targetPerson?.gender) || null,
    };
}

function ancestorName(upDepth) {
    if (upDepth >= 4) return 'cụ/kỵ';
    if (upDepth === 3) return 'ông/bà cố';
    if (upDepth === 2) return 'ông/bà';
    if (upDepth === 1) return 'cha/mẹ';
    return 'bạn';
}

function descendantName(downDepth) {
    if (downDepth <= 0) return '';
    if (downDepth === 1) return 'con';
    if (downDepth === 2) return 'cháu';
    if (downDepth === 3) return 'chắt';
    if (downDepth === 4) return 'chút';
    return `hậu duệ đời dưới ${downDepth} bậc`;
}

function siblingLabel(edge) {
    if (edge === 'older_brother' || edge === 'older_sister') return 'anh/chị';
    if (edge === 'older_sibling') return 'anh/chị em';
    if (edge === 'younger_brother' || edge === 'younger_sister' || edge === 'younger_sibling') return 'em';
    return 'anh/chị em';
}

function isGrandparentSiblingChildSpouse(path = []) {
    return path.length >= 5 &&
        PARENT_EDGES.has(path[0]) &&
        PARENT_EDGES.has(path[1]) &&
        SIBLING_EDGES.has(path[2]) &&
        CHILD_EDGES.has(path[3]) &&
        path[4] === 'spouse';
}

function buildGenealogyLabel(analysis, context = {}) {
    const path = context.path || [];
    if (!analysis || !analysis.hasSiblingBranch) return null;

    if (isGrandparentSiblingChildSpouse(path)) return 'vợ/chồng của họ hàng đời trên';

    if (
        path.length === 3 &&
        PARENT_EDGES.has(path[0]) &&
        SIBLING_EDGES.has(path[1]) &&
        CHILD_EDGES.has(path[2])
    ) {
        return path[1] === 'older_brother' || path[1] === 'older_sister'
            ? 'con của bác'
            : 'con của cô/chú/cậu/dì';
    }

    const ancestor = ancestorName(analysis.upDepth);
    const sibling = siblingLabel(analysis.siblingEdge);
    const descendant = descendantName(analysis.downDepth);

    if (descendant) return `${descendant} của ${sibling} ${ancestor} của bạn`;
    return `${sibling} ${ancestor} của bạn`;
}

function upperGenerationAddress(analysis, targetGender) {
    const distant = analysis.isDistant ? ' xa' : '';
    const older = analysis.siblingEdge === 'older_brother' || analysis.siblingEdge === 'older_sister' || analysis.siblingEdge === 'older_sibling';
    const younger = analysis.siblingEdge === 'younger_brother' || analysis.siblingEdge === 'younger_sister' || analysis.siblingEdge === 'younger_sibling';

    if (analysis.side === 'maternal') {
        if (targetGender === FEMALE) return `dì họ${distant}`;
        if (targetGender === MALE) return `${older ? 'bác' : 'cậu'} họ${distant}`;
        return `cậu/bác/dì họ${distant}`;
    }

    if (targetGender === FEMALE) return `cô họ${distant}`;
    if (targetGender === MALE) {
        if (younger) return `chú họ${distant}`;
        if (older) return `bác họ${distant}`;
        return `chú/bác họ${distant}`;
    }
    return `bác/chú/cô/dì họ${distant}`;
}

function buildAddressLabel(analysis, context = {}) {
    if (!analysis) return null;
    const path = context.path || [];
    const profile = getRegionalKinshipProfile(context.region);
    const targetGender = Number(context.targetPerson?.gender) || analysis.targetGender;

    if (isGrandparentSiblingChildSpouse(path)) return profile.grandparentSiblingChildSpouse;

    if (!analysis.hasSiblingBranch) return null;

    if (analysis.relativeGeneration <= -3) return targetGender === FEMALE ? 'cụ/bà cố họ' : targetGender === MALE ? 'cụ/ông cố họ' : 'cụ/ông bà cố họ';
    if (analysis.relativeGeneration === -2) return targetGender === FEMALE ? 'bà họ' : targetGender === MALE ? 'ông họ' : 'ông/bà họ';
    if (analysis.relativeGeneration === -1) return upperGenerationAddress(analysis, targetGender);
    if (analysis.relativeGeneration === 0 && analysis.isDistant && analysis.upDepth >= 3) {
        return upperGenerationAddress({ ...analysis, relativeGeneration: -1 }, targetGender);
    }
    if (analysis.relativeGeneration === 0) return 'anh/chị/em họ';
    if (analysis.relativeGeneration === 1) return 'cháu họ';
    if (analysis.relativeGeneration === 2) return 'chắt họ';
    return 'hậu duệ họ';
}

function shortFromAddress(addressLabel) {
    if (!addressLabel) return null;
    return addressLabel
        .replace(/\s+xa$/u, '')
        .replace(/^chú\/bác họ$/u, 'chú/bác họ')
        .trim();
}

function titleCaseVietnamese(value) {
    const lower = String(value || '').toLocaleLowerCase('vi-VN');
    return lower ? lower[0].toLocaleUpperCase('vi-VN') + lower.slice(1) : '';
}

function personGivenName(person) {
    const name = person?.full_name || person?.display_name || person?.name || '';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    return parts.length ? titleCaseVietnamese(parts[parts.length - 1]) : '';
}

function buildSocialLabel(addressLabel, targetPerson) {
    if (!addressLabel) return null;
    const name = personGivenName(targetPerson);
    const base = shortFromAddress(addressLabel).split('/')[0].replace(/\s+họ$/u, '').trim();
    return name && base ? `${base} ${name}` : shortFromAddress(addressLabel);
}

function confidenceForAnalysis(analysis) {
    if (!analysis) return 0;
    let confidence = 0.78;
    if (analysis.hasSiblingBranch) confidence += 0.08;
    if (analysis.side !== 'unknown') confidence += 0.04;
    if (analysis.targetGender === MALE || analysis.targetGender === FEMALE) confidence += 0.05;
    if (analysis.hasSpouse) confidence -= 0.05;
    return Math.max(0.5, Math.min(0.92, Number(confidence.toFixed(2))));
}

function interpretKinshipPath({ path = [], sourcePerson = null, targetPerson = null, mode = 'address', region = 'central' } = {}) {
    const analysis = analyzeRelationshipPath(path, { sourcePerson, targetPerson, region });
    if (!analysis) return null;

    const context = { path, sourcePerson, targetPerson, region };
    const genealogyLabel = buildGenealogyLabel(analysis, context);
    const addressLabel = buildAddressLabel(analysis, context);
    if (!genealogyLabel && !addressLabel) return null;

    const shortLabel = shortFromAddress(addressLabel) || genealogyLabel;
    const socialLabel = buildSocialLabel(addressLabel || genealogyLabel, targetPerson);
    const profile = getRegionalKinshipProfile(region);
    const regionLabel = isGrandparentSiblingChildSpouse(path) ? profile.grandparentSiblingChildSpouse : null;

    const result = {
        genealogyLabel,
        addressLabel,
        shortLabel,
        socialLabel,
        regionLabel,
        relativeGeneration: analysis.relativeGeneration,
        side: analysis.side,
        confidence: confidenceForAnalysis(analysis),
        analysis,
        source: 'kinshipPathInterpreter',
    };

    if (mode === 'genealogy') result.label = genealogyLabel;
    else if (mode === 'short') result.label = shortLabel;
    else if (mode === 'social') result.label = socialLabel;
    else result.label = addressLabel || genealogyLabel;

    return result;
}

module.exports = {
    analyzeRelationshipPath,
    buildGenealogyLabel,
    buildAddressLabel,
    interpretKinshipPath,
};
