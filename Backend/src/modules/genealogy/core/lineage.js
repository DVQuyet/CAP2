// Dòng họ (nội tộc / dâu rể) và cách tính "đời" theo dòng họ.
const { MALE, FEMALE, isBloodLink, isAdoptiveLink, toId } = require('./kinshipGraph');

const DEFAULT_POLICY = Object.freeze({
    // Đời và nội tộc tính theo dòng cha (patrilineal) hoặc dòng mẹ (matrilineal).
    lineage: 'patrilineal',
    // Phong tục: cảnh báo khi vợ chồng có chung tổ tiên trong N đời (chỉ cảnh báo, không chặn).
    sameAncestorWarnGenerations: 5,
    // Luật HN&GĐ 2014 Đ3.18: cấm kết hôn giữa người có họ trong phạm vi 3 đời.
    legalKinshipGenerations: 3,
    // Năm luật cấm đa thê / kết hôn cận huyết bắt đầu áp dụng (cấu hình theo dòng họ, cần đối chiếu văn bản luật).
    marriageLawYear: 1960,
    minParentAge: 12,
    warnParentAge: 16,
    maxMotherAge: 55,
    maxFatherAge: 80,
    // Con sinh sau khi cha mất tối đa ~300 ngày.
    posthumousBirthDays: 300,
    // Quan hệ nhạy cảm của người còn sống (vợ hai không đăng ký...) chỉ quản lý được xem.
    sensitiveRelationVisibility: 'managers',
    // Cách xưng hô theo vùng: 'north' | 'central' | 'south'.
    region: 'north',
});

const normalizePolicy = (value = {}) => {
    const source = value && typeof value === 'object' ? value : {};
    const number = (key, min, max) => {
        const parsed = Number(source[key]);
        if (!Number.isFinite(parsed)) return DEFAULT_POLICY[key];
        return Math.min(max, Math.max(min, Math.round(parsed)));
    };
    return {
        lineage: source.lineage === 'matrilineal' ? 'matrilineal' : 'patrilineal',
        sameAncestorWarnGenerations: number('sameAncestorWarnGenerations', 0, 12),
        legalKinshipGenerations: number('legalKinshipGenerations', 1, 5),
        marriageLawYear: number('marriageLawYear', 1800, 2100),
        minParentAge: number('minParentAge', 8, 20),
        warnParentAge: number('warnParentAge', 10, 25),
        maxMotherAge: number('maxMotherAge', 40, 80),
        maxFatherAge: number('maxFatherAge', 50, 110),
        posthumousBirthDays: number('posthumousBirthDays', 200, 400),
        sensitiveRelationVisibility: source.sensitiveRelationVisibility === 'public' ? 'public' : 'managers',
        region: ['north', 'central', 'south'].includes(source.region) ? source.region : DEFAULT_POLICY.region,
    };
};

const lineageGender = (policy) => (policy.lineage === 'matrilineal' ? FEMALE : MALE);

// Liên kết cha mẹ dùng để xét dòng họ: liên kết dòng chính nếu là ruột/nuôi/thừa tự, nếu không thì liên kết ruột/nuôi đầu tiên.
const lineageLinkOf = (graph, personId) => {
    const links = graph.parentLinks(personId);
    const primary = links.find((link) => link.isPrimary);
    if (primary && (isBloodLink(primary) || isAdoptiveLink(primary))) return primary;
    return links.find((link) => isBloodLink(link) || isAdoptiveLink(link)) || null;
};

// Người cha/mẹ mà con nối dòng theo (cha với dòng nội, mẹ với dòng mẫu hệ; thiếu thì lấy người còn lại).
const lineageParentOf = (graph, personId, policy = DEFAULT_POLICY) => {
    const link = lineageLinkOf(graph, personId);
    if (!link) return null;
    const family = graph.family(link.familyId);
    if (!family) return null;
    const preferred = policy.lineage === 'matrilineal' ? family.mother_id : family.father_id;
    const fallback = policy.lineage === 'matrilineal' ? family.father_id : family.mother_id;
    if (preferred && graph.hasPerson(preferred)) return preferred;
    if (fallback && graph.hasPerson(fallback)) return fallback;
    return null;
};

// role: 'founder' (thủy tổ/gốc), 'descendant' (con cháu trong họ), 'in_law' (dâu/rể), 'outside' (con của con gái trong họ...)
const computeLineage = (graph, policy = DEFAULT_POLICY) => {
    const memo = new Map();
    const visiting = new Set();
    const keepGender = lineageGender(policy);

    const rootRole = (person) => {
        const spouses = graph.spouseIds(person.id).map((id) => graph.person(id)).filter(Boolean);
        if (spouses.some((spouse) => lineageLinkOf(graph, spouse.id))) return 'in_law';
        if (person.gender && person.gender !== keepGender) {
            const rootSpouseKeeps = spouses.some((spouse) => !lineageLinkOf(graph, spouse.id) && spouse.gender !== person.gender);
            if (rootSpouseKeeps) return 'in_law';
        }
        return 'founder';
    };

    const resolve = (personId) => {
        const id = toId(personId);
        if (memo.has(id)) return memo.get(id);
        const person = graph.person(id);
        if (!person) return null;
        if (visiting.has(id)) return { role: 'outside', inClan: false, lineageParentId: null };
        visiting.add(id);
        let result;
        const parentId = lineageParentOf(graph, id, policy);
        if (!parentId) {
            const role = rootRole(person);
            result = { role, inClan: role === 'founder', lineageParentId: null };
        } else {
            const parent = resolve(parentId);
            const inClan = Boolean(parent?.inClan);
            result = { role: inClan ? 'descendant' : 'outside', inClan, lineageParentId: parentId };
        }
        visiting.delete(id);
        memo.set(id, result);
        return result;
    };

    for (const id of graph.people.keys()) resolve(id);

    // Gốc của dòng họ chính: các gốc có đời nhỏ nhất (thủy tổ), hòa thì lấy gốc có nhiều con cháu nhất.
    // Các gốc khác (nhà ngoại, nhà thông gia, cha mẹ đẻ của con nuôi) là dòng ngoài.
    const founders = [...memo.entries()].filter(([, info]) => info.role === 'founder').map(([id]) => id);
    if (founders.length > 1) {
        const generationOf = (id) => graph.person(id)?.generation || 1;
        const minGeneration = Math.min(...founders.map(generationOf));
        let main = founders.filter((id) => generationOf(id) === minGeneration);
        if (main.length > 1) {
            const sizes = new Map(main.map((id) => [id, graph.descendantIds(id, { kind: 'kin' }).size]));
            const maxSize = Math.max(...sizes.values());
            main = main.filter((id) => sizes.get(id) === maxSize);
        }
        const mainSet = new Set(main);
        const rootOf = (id, guard = 0) => {
            const info = memo.get(id);
            if (!info || guard > 64) return null;
            if (!info.lineageParentId) return id;
            return rootOf(info.lineageParentId, guard + 1);
        };
        for (const [id, info] of memo.entries()) {
            if (info.role === 'in_law') continue;
            const root = rootOf(id);
            if (root && !mainSet.has(root)) {
                memo.set(id, { ...info, role: info.role === 'founder' ? 'outside_founder' : 'outside', inClan: false });
            }
        }
    }
    return memo;
};

// Đời theo dòng họ: con = đời cha/mẹ nối dòng + 1; dâu/rể cùng đời với vợ/chồng; gốc giữ đời đã nhập.
const computeGenerations = (graph, policy = DEFAULT_POLICY, lineage = computeLineage(graph, policy)) => {
    const memo = new Map();
    const visiting = new Set();

    const stored = (person) => (person?.generation && person.generation > 0 ? person.generation : 1);

    const resolve = (personId) => {
        const id = toId(personId);
        if (memo.has(id)) return memo.get(id);
        const person = graph.person(id);
        if (!person) return null;
        if (visiting.has(id)) return stored(person);
        visiting.add(id);
        let generation;
        const parentId = lineageParentOf(graph, id, policy);
        if (parentId) {
            generation = resolve(parentId) + 1;
        } else if (lineage.get(id)?.role === 'in_law') {
            const spouseIds = graph.spouseIds(id);
            const anchor = spouseIds.find((spouseId) => lineageParentOf(graph, spouseId, policy))
                || spouseIds.find((spouseId) => lineage.get(spouseId)?.role !== 'in_law');
            generation = anchor ? resolve(anchor) : stored(person);
        } else {
            generation = stored(person);
        }
        visiting.delete(id);
        memo.set(id, generation);
        return generation;
    };

    for (const id of graph.people.keys()) resolve(id);
    return memo;
};

// Những người bị ảnh hưởng khi quan hệ của các người trong `seedIds` thay đổi:
// chính họ, con cháu (mọi loại), và vợ/chồng của tất cả những người đó.
const affectedLineageIds = (graph, seedIds = []) => {
    const result = new Set();
    const queue = [...seedIds].map(toId).filter(Boolean);
    while (queue.length) {
        const id = queue.shift();
        if (result.has(id) || !graph.hasPerson(id)) continue;
        result.add(id);
        graph.spouseIds(id).forEach((spouseId) => { if (!result.has(spouseId)) queue.push(spouseId); });
        graph.childIds(id, 'any').forEach((childId) => { if (!result.has(childId)) queue.push(childId); });
    }
    return result;
};

const generationChanges = (graph, policy = DEFAULT_POLICY, scopeIds = null) => {
    const computed = computeGenerations(graph, policy);
    const changes = [];
    for (const [id, generation] of computed.entries()) {
        if (scopeIds && !scopeIds.has(id)) continue;
        const person = graph.person(id);
        if (!person) continue;
        if (Number(person.generation) !== generation) {
            changes.push({ personId: id, from: person.generation || null, to: generation });
        }
    }
    return changes;
};

module.exports = {
    DEFAULT_POLICY,
    normalizePolicy,
    lineageLinkOf,
    lineageParentOf,
    computeLineage,
    computeGenerations,
    affectedLineageIds,
    generationChanges,
};
