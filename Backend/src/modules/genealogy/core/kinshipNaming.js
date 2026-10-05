// Xưng hô giữa hai người dựa trên cấu trúc gia phả (tổ tiên chung gần nhất, vai vế của nhánh,
// bên nội/ngoại, hôn nhân), không dựa vào chuỗi cạnh của đường đi.
// "Vai" theo phong tục Việt: con của nhánh trên (bác) là anh/chị dù ít tuổi hơn.
const { MALE, FEMALE, toId } = require('./kinshipGraph');
const { labelOf, unionInterval } = require('./relationRules');

const REGIONS = ['north', 'central', 'south'];

const normalizeRegion = (value) => (REGIONS.includes(value) ? value : 'north');

const genderOf = (person) => (person?.gender === MALE ? MALE : person?.gender === FEMALE ? FEMALE : null);

const pick = (person, male, female, unknown) => {
    const gender = genderOf(person);
    if (gender === MALE) return male;
    if (gender === FEMALE) return female;
    return unknown ?? `${male}/${female}`;
};

// Đường đi từ tổ tiên xuống một người: [tổ tiên, con, cháu, ..., người].
const pathDown = (graph, startId, ancestorId, kind) => {
    const ancestors = graph.ancestorsWithDepth(startId, { kind, maxDepth: 16 });
    const path = [ancestorId];
    let current = ancestorId;
    let guard = 0;
    while (current !== startId && guard < 32) {
        guard += 1;
        const info = ancestors.get(current);
        if (!info) break;
        current = info.via;
        path.push(current);
    }
    return path;
};

const DESCENDANT_TERMS = ['', 'con', 'cháu', 'chắt', 'chút', 'chít'];
const descendantTerm = (depth) => DESCENDANT_TERMS[depth] || `hậu duệ đời thứ ${depth}`;

const ancestorTerm = (depth, target, side, region) => {
    if (depth === 1) return pick(target, 'cha', 'mẹ');
    const sideSuffix = side === 'paternal' ? ' nội' : side === 'maternal' ? ' ngoại' : '';
    if (depth === 2) return `${pick(target, 'ông', 'bà')}${sideSuffix}`;
    if (depth === 3) {
        return region === 'north'
            ? `cụ${sideSuffix || pick(target, ' ông', ' bà', '')}`
            : `${pick(target, 'ông cố', 'bà cố', 'ông/bà cố')}${sideSuffix}`;
    }
    if (depth === 4) {
        return region === 'south'
            ? pick(target, 'ông sơ', 'bà sơ', 'ông/bà sơ')
            : pick(target, 'kỵ ông', 'kỵ bà', 'kỵ');
    }
    return `tổ tiên đời thứ ${depth} (${pick(target, 'nam', 'nữ', 'chưa rõ giới tính')})`;
};

// Từ xưng hô với anh/chị/em của cha/mẹ (P = cha/mẹ trên đường đi, seniority = vai của người được gọi so với P).
// seniority: 'senior' | 'junior' | null.
const parentSiblingTerm = (target, parentGender, seniority, region) => {
    const male = genderOf(target) === MALE;
    const female = genderOf(target) === FEMALE;
    if (parentGender === MALE) {
        if (male) return seniority === 'senior' ? 'bác' : seniority === 'junior' ? 'chú' : 'bác/chú';
        if (female) {
            if (region === 'central') return 'o';
            if (region === 'north') return seniority === 'senior' ? 'bác' : seniority === 'junior' ? 'cô' : 'bác/cô';
            return 'cô';
        }
        return seniority === 'senior' ? 'bác' : 'chú/cô';
    }
    if (parentGender === FEMALE) {
        if (male) {
            if (region === 'north') return seniority === 'senior' ? 'bác' : seniority === 'junior' ? 'cậu' : 'bác/cậu';
            return 'cậu';
        }
        if (female) {
            if (region === 'north') return seniority === 'senior' ? 'bác' : seniority === 'junior' ? 'dì' : 'bác/dì';
            return 'dì';
        }
        return 'cậu/dì';
    }
    return pick(target, 'bác/chú/cậu', 'bác/cô/dì', 'bác/chú/cô/cậu/dì');
};

// Vợ/chồng của người được gọi bằng `term` (bác, chú, cô, cậu, dì...).
const parentSiblingSpouseTerm = (term, relative, region) => {
    const relativeMale = genderOf(relative) === MALE;
    if (term === 'chú') return 'thím';
    if (term === 'cậu') return region === 'central' ? 'mự' : 'mợ';
    if (term === 'bác') return relativeMale ? 'bác gái' : 'bác trai';
    if (term === 'cô' || term === 'o' || term === 'dì') return 'dượng';
    if (term === 'bác/chú') return 'bác gái/thím';
    if (term === 'bác/cậu') return 'bác gái/mợ';
    if (term === 'bác/cô' || term === 'bác/dì') return 'bác trai/dượng';
    return relativeMale ? 'thím/mợ/bác gái' : 'dượng/bác trai';
};

const seniorityWord = (value) => (value === -1 ? 'senior' : value === 1 ? 'junior' : null);

const sideOfParent = (parent) => (genderOf(parent) === MALE ? 'paternal' : genderOf(parent) === FEMALE ? 'maternal' : null);

const halfSiblingSuffix = (kind) => {
    if (kind === 'half_paternal') return ' cùng cha khác mẹ';
    if (kind === 'half_maternal') return ' cùng mẹ khác cha';
    return '';
};

const commonAncestry = (graph, sourceId, targetId) => {
    for (const kind of ['blood', 'kin']) {
        const matches = graph.nearestCommonAncestors(sourceId, targetId, { kind, maxDepth: 12 });
        if (!matches.length) continue;
        const best = matches.find((match) => match.branchA && match.branchB) || matches[0];
        return { ...best, kind, adoptive: kind === 'kin' };
    }
    return null;
};

// Quan hệ cùng huyết thống (hoặc theo quan hệ nuôi khi không có huyết thống).
const describeConsanguine = (graph, sourceId, targetId, region) => {
    const source = graph.person(sourceId);
    const target = graph.person(targetId);
    const ancestry = commonAncestry(graph, sourceId, targetId);
    if (!ancestry) return null;
    const { depthA: dA, depthB: dB, ancestorId, kind } = ancestry;
    const pathA = pathDown(graph, sourceId, ancestorId, kind);
    const pathB = pathDown(graph, targetId, ancestorId, kind);
    const branchA = pathA[1] || null;
    const branchB = pathB[1] || null;
    const parentOnPath = dA >= 1 ? graph.person(pathA[pathA.length - 2]) : null;
    const side = sideOfParent(parentOnPath);
    const nuoi = ancestry.adoptive ? ' nuôi' : '';
    const base = {
        kind: ancestry.adoptive ? 'adoptive' : 'blood',
        depthSource: dA,
        depthTarget: dB,
        relativeGeneration: dB - dA,
        commonAncestorId: ancestorId,
        branchSourceId: branchA,
        branchTargetId: branchB,
        side,
        seniority: null,
    };

    if (dA === 0 && dB === 0) return { ...base, category: 'self', label: 'chính bạn', genealogyLabel: 'chính bạn' };

    if (dA === 0) {
        const firstChild = graph.person(pathB[1]);
        if (dB === 1) {
            const link = graph.parentLinks(targetId).find((item) => graph.parentIdsOfFamily(item.familyId).includes(sourceId));
            const type = link?.childType;
            const label = type === 'heir'
                ? 'con thừa tự'
                : type === 'adopted' ? 'con nuôi' : pick(target, 'con trai', 'con gái', 'con');
            return { ...base, category: 'descendant', label, genealogyLabel: label };
        }
        const term = descendantTerm(dB);
        const lineSide = dB === 2 ? (genderOf(firstChild) === MALE ? ' nội' : genderOf(firstChild) === FEMALE ? ' ngoại' : '') : '';
        const label = `${term}${lineSide}${nuoi}`;
        return {
            ...base,
            category: 'descendant',
            label,
            genealogyLabel: `${label} ${pick(target, 'trai', 'gái', '')}`.trim(),
        };
    }

    if (dB === 0) {
        let label = ancestorTerm(dA, target, side, region);
        if (ancestry.adoptive && dA === 1) label = `${label} nuôi`;
        else if (ancestry.adoptive) label = `${label} (theo quan hệ nuôi)`;
        return { ...base, category: 'ancestor', label, genealogyLabel: label };
    }

    const seniority = seniorityWord(graph.compareSiblingSeniority(branchB, branchA));
    const result = { ...base, seniority };

    if (dA === 1 && dB === 1) {
        const siblingKind = graph.siblingKind(sourceId, targetId);
        const older = seniority === 'senior';
        const younger = seniority === 'junior';
        let label = older
            ? pick(target, 'anh trai', 'chị gái', 'anh/chị')
            : younger ? pick(target, 'em trai', 'em gái', 'em') : pick(target, 'anh/em trai', 'chị/em gái', 'anh/chị/em');
        if (ancestry.adoptive || siblingKind === 'adoptive') label = `${label.replace(/ (trai|gái)$/u, '')} nuôi`;
        else label = `${label}${halfSiblingSuffix(siblingKind)}`;
        return { ...result, category: 'sibling', siblingKind, label, genealogyLabel: label };
    }

    if (dA === 1) {
        const label = `${descendantTerm(dB)}${nuoi}`;
        const via = graph.person(branchB);
        return {
            ...result,
            category: 'collateral',
            label,
            genealogyLabel: `${label} (${dB === 2 ? 'con' : 'hậu duệ'} của ${pick(via, 'anh/em trai', 'chị/em gái', 'anh chị em')} bạn)`,
        };
    }

    if (dB === 1) {
        // Anh/chị/em của tổ tiên: dA = 2 là anh/chị/em của cha mẹ, dA = 3 là của ông bà...
        const elder = graph.person(branchA);
        const elderParentGender = genderOf(elder);
        const term = parentSiblingTerm(target, elderParentGender, seniority, region);
        if (dA === 2) {
            return {
                ...result,
                category: 'collateral',
                termCore: term,
                label: `${term}${nuoi}`,
                genealogyLabel: `${term} (${pick(target, 'anh/em trai', 'chị/em gái', 'anh chị em')} của ${elderParentGender === FEMALE ? 'mẹ' : 'cha'})`,
            };
        }
        const prefix = dA === 3 ? pick(target, 'ông', 'bà', 'ông/bà') : 'cụ';
        const label = `${prefix} ${term}`;
        return {
            ...result,
            category: 'collateral',
            termCore: term,
            prefix,
            label,
            genealogyLabel: `${label} (anh chị em của ${ancestorTerm(dA - 1, elder, side, region)})`,
        };
    }

    if (dA === dB) {
        const label = seniority === 'senior'
            ? pick(target, 'anh họ', 'chị họ', 'anh/chị họ')
            : seniority === 'junior' ? 'em họ' : pick(target, 'anh/em họ', 'chị/em họ', 'anh/chị/em họ');
        const commonName = ancestorTerm(dA, graph.person(ancestorId), null, region).replace(/ (nội|ngoại)$/u, '');
        return {
            ...result,
            category: 'cousin',
            label,
            genealogyLabel: `${label} (chung ${commonName.includes('/') ? 'tổ tiên' : commonName})`,
        };
    }

    if (dA > dB) {
        // Người được gọi cùng đời với tổ tiên `above` bậc của nguồn; xưng hô theo giới tính của tổ tiên đó.
        const above = dA - dB;
        const peer = graph.person(pathA[pathA.length - 1 - above]);
        const term = parentSiblingTerm(target, genderOf(peer), seniority, region);
        const prefix = above === 1 ? null : above === 2 ? pick(target, 'ông', 'bà', 'ông/bà') : 'cụ';
        const label = prefix ? `${prefix} ${term} họ` : `${term} họ`;
        return { ...result, category: 'collateral', termCore: `${term} họ`, prefix, label, genealogyLabel: label };
    }

    const below = dB - dA;
    const label = `${descendantTerm(below + 1)} họ`;
    return { ...result, category: 'collateral', label, genealogyLabel: label };
};

// Vợ/chồng của một người họ hàng R (R có quan hệ huyết thống `rel` với nguồn).
const affinalFromRelative = (graph, sourceId, target, relative, rel, region) => {
    const isWife = genderOf(target) === FEMALE;
    const isHusband = genderOf(target) === MALE;
    const inLawWord = isWife ? 'dâu' : isHusband ? 'rể' : 'dâu/rể';

    if (rel.category === 'descendant') {
        const term = descendantTerm(rel.depthTarget);
        return `${term} ${inLawWord}`;
    }
    if (rel.category === 'collateral' && rel.depthSource === 1) {
        return `${descendantTerm(rel.depthTarget)} ${inLawWord}`;
    }
    if (rel.category === 'collateral' && rel.relativeGeneration > 0) {
        return `${descendantTerm(rel.relativeGeneration + 1)} ${inLawWord} họ`;
    }
    if (rel.category === 'sibling' || rel.category === 'cousin') {
        const suffix = rel.category === 'cousin' ? ' họ' : '';
        if (rel.seniority === 'senior') return `${isWife ? 'chị dâu' : isHusband ? 'anh rể' : 'anh rể/chị dâu'}${suffix}`;
        if (rel.seniority === 'junior') return `${isWife ? 'em dâu' : isHusband ? 'em rể' : 'em rể/em dâu'}${suffix}`;
        return `${isWife ? 'chị/em dâu' : isHusband ? 'anh/em rể' : 'anh chị em dâu/rể'}${suffix}`;
    }
    if (rel.category === 'collateral' && rel.termCore) {
        const core = rel.termCore.replace(/ họ$/u, '');
        const spouseTerm = parentSiblingSpouseTerm(core, relative, region);
        const suffix = rel.termCore.endsWith(' họ') ? ' họ' : '';
        if (rel.prefix) {
            const prefix = rel.prefix === 'cụ' ? 'cụ' : pick(target, 'ông', 'bà', 'ông/bà');
            return `${prefix} ${spouseTerm.replace(/ (gái|trai)$/u, '')}${suffix}`;
        }
        return `${spouseTerm}${suffix}`;
    }
    if (rel.category === 'ancestor') {
        if (rel.depthSource === 1) return null; // xử lý riêng (mẹ kế, cha dượng, mẹ cả, dì)
        return `${pick(target, 'ông', 'bà', 'ông/bà')} kế (${isWife ? 'vợ' : 'chồng'} sau của ${rel.label})`;
    }
    return `${pick(target, 'chồng', 'vợ', 'vợ/chồng')} của ${rel.label}`;
};

// Vợ/chồng khác của cha/mẹ: mẹ kế, cha dượng, mẹ cả (vợ cả), dì (vợ lẽ).
const stepParentTerm = (graph, sourceId, target, parentId, now) => {
    const parent = graph.person(parentId);
    if (genderOf(parent) === FEMALE || genderOf(target) === MALE) {
        return { label: 'cha dượng', genealogyLabel: `chồng khác của mẹ (${labelOf(parent)})` };
    }
    const bloodLink = graph.biologicalParentLink(sourceId) || graph.primaryParentLink(sourceId);
    const ownFamily = bloodLink ? graph.family(bloodLink.familyId) : null;
    const targetFamily = graph.unionsOf(parentId).find((family) => graph.spouseIdInFamily(family, parentId) === target.id);
    if (ownFamily && targetFamily && ownFamily.id !== targetFamily.id) {
        const ownRank = ownFamily.wife_rank;
        const targetRank = targetFamily.wife_rank;
        if (ownRank && targetRank && targetRank < ownRank) {
            return { label: 'mẹ cả', genealogyLabel: `vợ cả của cha (${labelOf(parent)})` };
        }
        const ownInterval = unionInterval(graph, ownFamily, now);
        const targetInterval = unionInterval(graph, targetFamily, now);
        const concurrent = targetFamily.union_type === 'concubine'
            || (ownInterval.endKnown && targetInterval.endKnown
                && ((ownInterval.end === Infinity && targetInterval.end === Infinity)
                    || (Number.isFinite(Math.max(ownInterval.start, targetInterval.start))
                        && Math.max(ownInterval.start, targetInterval.start) < Math.min(ownInterval.end, targetInterval.end))));
        if (concurrent) return { label: 'dì', genealogyLabel: `vợ lẽ/vợ thứ của cha (${labelOf(parent)})` };
    }
    return { label: 'mẹ kế', genealogyLabel: `vợ sau của cha (${labelOf(parent)})` };
};

const closestRelative = (graph, sourceId, candidateIds, region) => {
    let best = null;
    for (const candidateId of candidateIds) {
        if (candidateId === sourceId) continue;
        const rel = describeConsanguine(graph, sourceId, candidateId, region);
        if (!rel) continue;
        const distance = rel.depthSource + rel.depthTarget + (rel.kind === 'adoptive' ? 0.5 : 0);
        if (!best || distance < best.distance) best = { relativeId: candidateId, rel, distance };
    }
    return best;
};

const spouseWord = (spouse) => pick(spouse, 'chồng', 'vợ', 'vợ/chồng');

const describeKinship = (graph, sourceIdInput, targetIdInput, options = {}) => {
    const region = normalizeRegion(options.region);
    const now = options.now || new Date();
    const sourceId = toId(sourceIdInput);
    const targetId = toId(targetIdInput);
    const source = graph.person(sourceId);
    const target = graph.person(targetId);
    if (!source || !target) return null;

    const consanguine = describeConsanguine(graph, sourceId, targetId, region);
    if (consanguine) return { ...consanguine, confidence: consanguine.seniority || !['sibling', 'cousin', 'collateral'].includes(consanguine.category) ? 0.95 : 0.85 };

    // Vợ/chồng.
    if (graph.spouseIds(sourceId).includes(targetId)) {
        const family = graph.unionsOf(sourceId).find((item) => graph.spouseIdInFamily(item, sourceId) === targetId);
        const ended = family && family.relationship_status !== 'active';
        const label = `${pick(target, 'chồng', 'vợ', 'vợ/chồng')}${ended ? ' (đã kết thúc)' : ''}`;
        return { kind: 'affinal', category: 'spouse', label, genealogyLabel: label, relativeGeneration: 0, confidence: 0.98 };
    }

    // Người đích thân là vợ/chồng của họ hàng của mình.
    const viaTargetSpouse = closestRelative(graph, sourceId, graph.spouseIds(targetId), region);
    if (viaTargetSpouse) {
        const { rel, relativeId } = viaTargetSpouse;
        const relative = graph.person(relativeId);
        if (rel.category === 'ancestor' && rel.depthSource === 1) {
            const step = stepParentTerm(graph, sourceId, target, relativeId, now);
            return { kind: 'step', category: 'step_parent', relativeGeneration: -1, confidence: 0.9, ...step };
        }
        const label = affinalFromRelative(graph, sourceId, target, relative, rel, region);
        if (label) {
            return {
                kind: 'affinal',
                category: 'spouse_of_relative',
                relativeGeneration: rel.relativeGeneration,
                label,
                genealogyLabel: `${spouseWord(target)} của ${rel.label} ${labelOf(relative)}`,
                viaPersonId: relativeId,
                confidence: rel.seniority || rel.category !== 'sibling' ? 0.9 : 0.8,
            };
        }
    }

    // Họ hàng của vợ/chồng mình.
    for (const spouseId of graph.spouseIds(sourceId)) {
        const spouse = graph.person(spouseId);
        const rel = describeConsanguine(graph, spouseId, targetId, region);
        if (!rel) continue;
        const side = genderOf(spouse) === MALE ? 'chồng' : genderOf(spouse) === FEMALE ? 'vợ' : 'vợ/chồng';
        if (rel.category === 'descendant' && rel.depthTarget === 1) {
            return {
                kind: 'step',
                category: 'step_child',
                relativeGeneration: 1,
                label: `con riêng của ${side}`,
                genealogyLabel: `con riêng của ${side} ${labelOf(spouse)}`,
                confidence: 0.9,
            };
        }
        let label;
        if (rel.category === 'ancestor' && rel.depthSource === 1) {
            const parentWord = genderOf(target) === MALE ? (region === 'north' ? 'bố' : region === 'south' ? 'ba' : 'cha') : 'mẹ';
            label = `${parentWord} ${side}`;
        } else if (rel.category === 'sibling') {
            const head = rel.seniority === 'senior' ? pick(target, 'anh', 'chị', 'anh/chị') : rel.seniority === 'junior' ? 'em' : pick(target, 'anh/em', 'chị/em', 'anh/chị/em');
            label = `${head} ${side}`;
        } else {
            label = `${rel.label.replace(/ (trai|gái)$/u, '')} ${side}`;
        }
        return {
            kind: 'affinal',
            category: 'relative_of_spouse',
            relativeGeneration: rel.relativeGeneration,
            label,
            genealogyLabel: `${rel.label} của ${side} ${labelOf(spouse)}`,
            viaPersonId: spouseId,
            confidence: 0.88,
        };
    }

    // Anh chị em kế (con riêng của cha dượng/mẹ kế).
    if (graph.siblingKind(sourceId, targetId) === 'step') {
        const seniority = seniorityWord(graph.compareSiblingSeniority(targetId, sourceId));
        const head = seniority === 'senior' ? pick(target, 'anh', 'chị', 'anh/chị') : seniority === 'junior' ? 'em' : 'anh/chị/em';
        return { kind: 'step', category: 'step_sibling', relativeGeneration: 0, label: `${head} kế`, genealogyLabel: `${head} kế (con riêng của cha dượng/mẹ kế)`, confidence: 0.85 };
    }

    // Anh em cột chèo / chị em dâu: vợ/chồng của hai người là anh chị em.
    for (const spouseId of graph.spouseIds(sourceId)) {
        for (const targetSpouseId of graph.spouseIds(targetId)) {
            const kind = graph.siblingKind(spouseId, targetSpouseId);
            if (!kind || kind === 'step') continue;
            const seniority = seniorityWord(graph.compareSiblingSeniority(targetSpouseId, spouseId));
            const head = seniority === 'senior' ? 'anh' : seniority === 'junior' ? 'em' : 'anh/em';
            let label;
            if (genderOf(source) === MALE && genderOf(target) === MALE) label = `${head} cột chèo`;
            else if (genderOf(source) === FEMALE && genderOf(target) === FEMALE) label = seniority === 'senior' ? 'chị dâu' : seniority === 'junior' ? 'em dâu' : 'chị/em dâu';
            else label = genderOf(target) === MALE ? `${head} rể` : `${seniority === 'senior' ? 'chị' : seniority === 'junior' ? 'em' : 'chị/em'} dâu`;
            return { kind: 'affinal', category: 'co_in_law', relativeGeneration: 0, label, genealogyLabel: `${label} (vợ/chồng của anh chị em ${spouseWord(graph.person(spouseId))} bạn)`, confidence: 0.85 };
        }
    }

    // Thông gia: con của hai người lấy nhau.
    const childrenOfSource = graph.childIds(sourceId, 'kin');
    const childrenOfTarget = new Set(graph.childIds(targetId, 'kin'));
    if (childrenOfSource.some((childId) => graph.spouseIds(childId).some((spouseId) => childrenOfTarget.has(spouseId)))) {
        const label = region === 'south' ? 'sui gia' : 'thông gia';
        return { kind: 'affinal', category: 'co_parent_in_law', relativeGeneration: 0, label, genealogyLabel: `${label} (con hai bên lấy nhau)`, confidence: 0.9 };
    }

    return null;
};

module.exports = {
    REGIONS,
    normalizeRegion,
    describeKinship,
    describeConsanguine,
    parentSiblingTerm,
    parentSiblingSpouseTerm,
};
