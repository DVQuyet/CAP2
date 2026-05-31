const EDGE_WEIGHT = {
    father: 1,
    mother: 1,
    parent: 1,

    son: 1,
    daughter: 1,
    child: 1,

    older_brother: 1.1,
    younger_brother: 1.1,
    older_sister: 1.1,
    younger_sister: 1.1,
    older_sibling: 1.2,
    younger_sibling: 1.2,
    sibling: 1.2,

    spouse: 2.5,

    adopted_parent: 2,
    adopted_child: 2,
    adopted_son: 2,
    adopted_daughter: 2,

    step_father: 3,
    step_mother: 3,
    step_child: 3,
    step_son: 3,
    step_daughter: 3,

    half_sibling: 2,
};

const DEFAULT_EDGE_WEIGHT = 2;
const DEPTH_PENALTY = 0.15;
const EXTRA_SPOUSE_PENALTY = 0.75;

function edgeWeight(edgeType) {
    return EDGE_WEIGHT[edgeType] ?? DEFAULT_EDGE_WEIGHT;
}

function scorePath(path = []) {
    if (!Array.isArray(path)) return Number.POSITIVE_INFINITY;

    const edgeScore = path.reduce((total, edgeType) => total + edgeWeight(edgeType), 0);
    const depthPenalty = path.length * DEPTH_PENALTY;
    const spouseCount = path.filter((edgeType) => edgeType === 'spouse').length;
    const spousePenalty = spouseCount * EXTRA_SPOUSE_PENALTY;

    return Number((edgeScore + depthPenalty + spousePenalty).toFixed(4));
}

function pathOf(candidate) {
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.path)) return candidate.path;
    if (Array.isArray(candidate?.relationshipPath)) return candidate.relationshipPath;
    return [];
}

function pickBestRelationshipPath(paths = []) {
    if (!Array.isArray(paths) || !paths.length) return null;

    return [...paths]
        .map((candidate, index) => ({
            candidate,
            index,
            path: pathOf(candidate),
            score: scorePath(pathOf(candidate)),
        }))
        .sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            if (a.path.length !== b.path.length) return a.path.length - b.path.length;
            return a.index - b.index;
        })[0].candidate;
}

module.exports = {
    EDGE_WEIGHT,
    scorePath,
    pickBestRelationshipPath,
};
