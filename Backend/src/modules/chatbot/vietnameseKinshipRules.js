const { compileKinshipRules } = require('./kinshipRuleEngine');
const { VIETNAMESE_KINSHIP_RULES } = require('./vietnameseKinshipRuleSet');
const { interpretKinshipPath } = require('./kinshipPathInterpreter');

const MALE = 1;
const FEMALE = 2;

const normalizeEdge = (edge) => {
    if (!edge) return '';
    if (edge === 'son' || edge === 'daughter') return 'child';
    if (edge === 'adopted_son' || edge === 'adopted_daughter') return 'adopted_child';
    if (edge === 'step_son' || edge === 'step_daughter') return 'step_child';
    if (
        edge === 'older_brother' ||
        edge === 'younger_brother' ||
        edge === 'older_sister' ||
        edge === 'younger_sister' ||
        edge === 'older_sibling' ||
        edge === 'younger_sibling'
    ) {
        return 'sibling';
    }
    return edge;
};

const genderedPerson = (person, maleLabel, femaleLabel, unknownLabel) => {
    if (Number(person?.gender) === MALE) return maleLabel;
    if (Number(person?.gender) === FEMALE) return femaleLabel;
    return unknownLabel || `${maleLabel}/${femaleLabel}`;
};

const edgeToVietnamese = (edge, context = {}) => {
    const targetPerson = context.targetPerson || null;
    const labels = {
        father: 'cha',
        parent: genderedPerson(targetPerson, 'cha', 'mẹ'),
        mother: 'mẹ',
        spouse: genderedPerson(targetPerson, 'chồng', 'vợ'),
        son: 'con trai',
        daughter: 'con gái',
        child: genderedPerson(targetPerson, 'con trai', 'con gái'),
        older_brother: 'anh trai',
        younger_brother: 'em trai',
        older_sister: 'chị gái',
        younger_sister: 'em gái',
        older_sibling: genderedPerson(targetPerson, 'anh trai', 'chị gái'),
        younger_sibling: genderedPerson(targetPerson, 'em trai', 'em gái'),
        step_father: 'cha dượng',
        step_mother: 'mẹ kế',
        adopted_parent: genderedPerson(targetPerson, 'cha nuôi', 'mẹ nuôi'),
        adopted_son: 'con nuôi',
        adopted_daughter: 'con nuôi',
        adopted_child: 'con nuôi',
        step_son: 'con riêng',
        step_daughter: 'con riêng',
        step_child: 'con riêng',
        half_sibling: genderedPerson(
            targetPerson,
            'anh/em trai cùng cha hoặc cùng mẹ',
            'chị/em gái cùng cha hoặc cùng mẹ'
        ),
        sibling: genderedPerson(targetPerson, 'anh/em trai', 'chị/em gái'),
    };
    return labels[edge] || edge;
};

const isBrother = (edge) => edge === 'older_brother' || edge === 'younger_brother';
const isSister = (edge) => edge === 'older_sister' || edge === 'younger_sister';
const isOlderSibling = (edge) => edge === 'older_brother' || edge === 'older_sister';
const isYoungerSibling = (edge) => edge === 'younger_brother' || edge === 'younger_sister';
const isParent = (edge) => edge === 'father' || edge === 'mother' || edge === 'parent';
const isChild = (edge) => edge === 'son' || edge === 'daughter' || edge === 'child';
const isAnyChild = (edge) => (
    isChild(edge) ||
    edge === 'adopted_son' ||
    edge === 'adopted_daughter' ||
    edge === 'adopted_child' ||
    edge === 'step_son' ||
    edge === 'step_daughter' ||
    edge === 'step_child'
);

const every = (path, predicate) => path.length > 0 && path.every(predicate);

const vietnameseRuleMatcher = compileKinshipRules(VIETNAMESE_KINSHIP_RULES, {
    normalizeEdge,
    isAnyChild,
    isParent,
});

function matchVietnameseKinshipRule(path = [], context = {}) {
    return vietnameseRuleMatcher.match(path, { ...context, path });
}

function describeAncestor(path, targetPerson) {
    if (!every(path, isParent)) return null;
    if (path.length === 1 && path[0] === 'parent') {
        return genderedPerson(targetPerson, 'cha', 'mẹ');
    }
    if (path.length === 2 && (path[0] === 'parent' || path[1] === 'parent')) {
        return genderedPerson(targetPerson, 'ông', 'bà');
    }
    if (path.length === 3) {
        return genderedPerson(targetPerson, 'ông cố', 'bà cố');
    }
    if (path.length === 1) {
        return path[0] === 'father' ? 'cha' : 'mẹ';
    }
    if (path.length === 2) {
        if (path[0] === 'father' && path[1] === 'father') return 'ông nội';
        if (path[0] === 'father' && path[1] === 'mother') return 'bà nội';
        if (path[0] === 'mother' && path[1] === 'father') return 'ông ngoại';
        if (path[0] === 'mother' && path[1] === 'mother') return 'bà ngoại';
    }
    if (path.length === 4) {
        return genderedPerson(targetPerson, 'cụ ông', 'cụ bà');
    }
    return genderedPerson(
        targetPerson,
        `tổ tiên nam đời trên ${path.length} bậc`,
        `tổ tiên nữ đời trên ${path.length} bậc`
    );
}

function describeDescendant(path, targetPerson) {
    if (!every(path, isAnyChild)) return null;
    if (path.length === 1) {
        if (path[0] === 'adopted_son' || path[0] === 'adopted_daughter' || path[0] === 'adopted_child') return 'con nuôi';
        if (path[0] === 'step_son' || path[0] === 'step_daughter' || path[0] === 'step_child') return 'con riêng';
        return genderedPerson(targetPerson, 'con trai', 'con gái');
    }
    if (path.length === 2) {
        const side = path[0] === 'son' ? 'nội' : path[0] === 'daughter' ? 'ngoại' : '';
        const base = genderedPerson(targetPerson, 'cháu trai', 'cháu gái');
        return side ? `${base} ${side}` : base;
    }
    if (path.length === 3) return genderedPerson(targetPerson, 'chắt trai', 'chắt gái');
    if (path.length === 4) return genderedPerson(targetPerson, 'chút trai', 'chút gái');
    return genderedPerson(
        targetPerson,
        `hậu duệ nam đời dưới ${path.length} bậc`,
        `hậu duệ nữ đời dưới ${path.length} bậc`
    );
}

function describeParentSibling(path, targetPerson) {
    if (path.length < 2 || !isParent(path[0])) return null;
    const parentSide = path[0];
    const sibling = path[1];

    if (path.length === 3 && path[2] === 'spouse') {
        if (parentSide === 'father' && isYoungerSibling(sibling) && isBrother(sibling)) return 'thím';
        if (parentSide === 'mother' && isBrother(sibling)) return 'mợ';
        if (isSister(sibling)) return 'dượng';
        if (isOlderSibling(sibling) && isBrother(sibling)) {
            return genderedPerson(targetPerson, 'bác trai', 'bác gái');
        }
    }

    if (path.length !== 2) return null;

    if (parentSide === 'father') {
        if (isOlderSibling(sibling) && isBrother(sibling)) return 'bác';
        if (isYoungerSibling(sibling) && isBrother(sibling)) return 'chú';
        if (isSister(sibling)) return 'cô';
    }

    if (parentSide === 'mother') {
        if (isBrother(sibling)) return isOlderSibling(sibling) ? 'bác' : 'cậu';
        if (isSister(sibling)) return 'dì';
    }

    return null;
}

function describeCousinOrNibling(path, targetPerson) {
    if (path.length === 2 && normalizeEdge(path[0]) === 'sibling' && isAnyChild(path[1])) {
        return genderedPerson(targetPerson, 'cháu trai', 'cháu gái');
    }

    if (path.length === 3 && isParent(path[0]) && normalizeEdge(path[1]) === 'sibling' && isAnyChild(path[2])) {
        return genderedPerson(targetPerson, 'anh em họ', 'chị em họ');
    }

    return null;
}

function describeParentCousin(path, targetPerson) {
    if (
        path.length === 4 &&
        isParent(path[0]) &&
        isParent(path[1]) &&
        normalizeEdge(path[2]) === 'sibling' &&
        isAnyChild(path[3])
    ) {
        if (path[0] === 'mother') {
            return genderedPerson(targetPerson, 'cậu họ', 'dì họ');
        }
        return genderedPerson(targetPerson, 'chú họ', 'cô họ/o họ');
    }
    return null;
}

function describeSiblingInLaw(path, targetPerson) {
    if (path.length !== 2 || normalizeEdge(path[0]) !== 'sibling' || path[1] !== 'spouse') return null;
    if (path[0] === 'older_brother') return 'chị dâu';
    if (path[0] === 'older_sister') return 'anh rể';
    if (path[0] === 'younger_brother') return genderedPerson(targetPerson, 'em rể', 'em dâu');
    if (path[0] === 'younger_sister') return genderedPerson(targetPerson, 'em rể', 'em dâu');
    return genderedPerson(targetPerson, 'anh/chị/em rể', 'anh/chị/em dâu');
}

function describeRelationshipPath(path = [], context = {}) {
    const targetPerson = context.targetPerson || null;
    const ruleMatch = matchVietnameseKinshipRule(path, { ...context, targetPerson });
    if (ruleMatch?.label) return ruleMatch.label;

    const interpreted = interpretKinshipPath({
        path,
        sourcePerson: context.sourcePerson || null,
        targetPerson,
        mode: context.mode || 'address',
        region: context.region || 'central',
    });
    if (interpreted?.label) return interpreted.label;

    const direct = describeAncestor(path, targetPerson) ||
        describeDescendant(path, targetPerson) ||
        describeParentSibling(path, targetPerson) ||
        describeParentCousin(path, targetPerson) ||
        describeSiblingInLaw(path, targetPerson) ||
        describeCousinOrNibling(path, targetPerson);

    if (direct) return direct;

    if (path.length === 1) {
        return edgeToVietnamese(path[0], { targetPerson });
    }

    const readablePath = path.map((edge) => edgeToVietnamese(edge)).join(' -> ');
    return `họ hàng qua đường ${readablePath}`;
}

function relationshipKeyFromPath(path = []) {
    return path.map(normalizeEdge).join('.');
}

function normalizeVietnamese(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const KINSHIP_ALIASES = {
    co: ['o'],
    o: ['co'],
    'co ho': ['o ho'],
    'o ho': ['co ho'],
    mo: ['mu'],
    mu: ['mo'],
    'ong co': ['cu ong'],
    'ba co': ['cu ba'],
    cu: ['ong co', 'ba co'],
};

function expandKinshipTerms(term) {
    const normalized = normalizeVietnamese(term);
    if (!normalized) return [];
    const result = new Set([normalized]);
    const queue = [normalized];
    while (queue.length) {
        const current = queue.shift();
        for (const alias of KINSHIP_ALIASES[current] || []) {
            const next = normalizeVietnamese(alias);
            if (!next || result.has(next)) continue;
            result.add(next);
            queue.push(next);
        }
    }
    return [...result];
}

function pathMatchesKinship(path = [], kinshipTerm = '', context = {}) {
    const terms = expandKinshipTerms(kinshipTerm);
    if (!terms.length) return false;
    const label = normalizeVietnamese(describeRelationshipPath(path, context));
    return terms.some((term) => label === term || label.includes(term));
}

module.exports = {
    MALE,
    FEMALE,
    describeRelationshipPath,
    edgeToVietnamese,
    interpretKinshipPath,
    matchVietnameseKinshipRule,
    relationshipKeyFromPath,
    normalizeEdge,
    pathMatchesKinship,
    isParent,
    isChild,
};
