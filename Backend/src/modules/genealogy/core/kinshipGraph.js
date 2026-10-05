// Đồ thị gia phả dùng chung cho kiểm tra quan hệ, ghi dữ liệu, tính đời và xưng hô.
// Không phụ thuộc DB: nhận các dòng people / families / children đã đọc sẵn.
const { compareBirth, personBirth } = require('./dates');

const MALE = 1;
const FEMALE = 2;

const CHILD_TYPES = ['biological', 'adopted', 'heir', 'step', 'foster', 'unknown'];
// Con ruột (và "không rõ" - mặc định coi như ruột) tạo quan hệ huyết thống.
const BLOOD_CHILD_TYPES = new Set(['biological', 'unknown']);
// Con nuôi, con thừa tự: quan hệ pháp lý/nghi lễ như cha mẹ - con.
const ADOPTIVE_CHILD_TYPES = new Set(['adopted', 'heir']);

const UNION_TYPES = ['marriage', 'concubine', 'cohabitation', 'unknown'];
const RELATIONSHIP_STATUSES = ['active', 'divorced', 'widowed', 'separated', 'annulled', 'unknown'];

const toId = (value) => {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
};

// Gia đình mới trong bản nháp có id tạm âm; chỉ loại bỏ id rỗng/0.
const toFamilyId = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const id = Number(value);
    return Number.isFinite(id) && id !== 0 ? id : null;
};

const normalizeGender = (value) => {
    const gender = Number(value);
    return gender === MALE || gender === FEMALE ? gender : null;
};

const normalizeChildType = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return CHILD_TYPES.includes(text) ? text : 'biological';
};

const normalizeUnionType = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return UNION_TYPES.includes(text) ? text : 'marriage';
};

const normalizeRelationshipStatus = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return RELATIONSHIP_STATUSES.includes(text) ? text : 'active';
};

const positiveIntOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
};

const normalizePersonRow = (row) => ({
    ...row,
    id: toId(row.id),
    gender: normalizeGender(row.gender),
    generation: positiveIntOrNull(row.generation),
});

const normalizeFamilyRow = (row) => ({
    ...row,
    id: toFamilyId(row.id ?? row.family_id),
    father_id: toId(row.father_id),
    mother_id: toId(row.mother_id),
    relationship_status: normalizeRelationshipStatus(row.relationship_status),
    union_type: normalizeUnionType(row.union_type),
    wife_rank: positiveIntOrNull(row.wife_rank),
    husband_rank: positiveIntOrNull(row.husband_rank),
});

const normalizeChildRow = (row) => ({
    familyId: toFamilyId(row.family_id ?? row.familyId),
    personId: toId(row.person_id ?? row.personId),
    childType: normalizeChildType(row.child_type ?? row.childType),
    isPrimary: row.is_primary_lineage === undefined && row.isPrimary === undefined
        ? null
        : Number(row.is_primary_lineage ?? row.isPrimary) === 1 || row.isPrimary === true,
    sortOrder: Math.max(0, Math.round(Number(row.sort_order ?? row.sortOrder) || 0)),
});

const isBloodLink = (link) => BLOOD_CHILD_TYPES.has(link.childType);
const isAdoptiveLink = (link) => ADOPTIVE_CHILD_TYPES.has(link.childType);

class KinshipGraph {
    constructor({ people = [], families = [], children = [] } = {}) {
        this.people = new Map();
        this.families = new Map();
        this.childLinksByPerson = new Map();
        this.childLinksByFamily = new Map();
        this.familiesByParent = new Map();

        for (const raw of people) {
            const person = normalizePersonRow(raw);
            if (person.id) this.people.set(person.id, person);
        }

        for (const raw of families) {
            const family = normalizeFamilyRow(raw);
            if (!family.id) continue;
            this.families.set(family.id, family);
            for (const parentId of [family.father_id, family.mother_id]) {
                if (!parentId) continue;
                if (!this.familiesByParent.has(parentId)) this.familiesByParent.set(parentId, []);
                this.familiesByParent.get(parentId).push(family.id);
            }
        }

        const seen = new Set();
        for (const raw of children) {
            const link = normalizeChildRow(raw);
            if (!link.familyId || !link.personId || !this.families.has(link.familyId)) continue;
            const key = `${link.familyId}:${link.personId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!this.childLinksByPerson.has(link.personId)) this.childLinksByPerson.set(link.personId, []);
            this.childLinksByPerson.get(link.personId).push(link);
            if (!this.childLinksByFamily.has(link.familyId)) this.childLinksByFamily.set(link.familyId, []);
            this.childLinksByFamily.get(link.familyId).push(link);
        }

        // Dòng chính: nếu chưa đánh dấu thì ưu tiên con ruột, rồi con nuôi/thừa tự, rồi liên kết đầu tiên.
        for (const links of this.childLinksByPerson.values()) {
            const flagged = links.filter((link) => link.isPrimary === true);
            if (flagged.length >= 1) {
                links.forEach((link) => { link.isPrimary = link === flagged[0]; });
                continue;
            }
            const preferred = links.find(isBloodLink) || links.find(isAdoptiveLink) || links[0];
            links.forEach((link) => { link.isPrimary = link === preferred; });
        }
    }

    person(id) {
        return this.people.get(toId(id)) || null;
    }

    family(id) {
        return this.families.get(toFamilyId(id)) || null;
    }

    hasPerson(id) {
        return this.people.has(toId(id));
    }

    parentIdsOfFamily(familyOrId) {
        const family = typeof familyOrId === 'object' ? familyOrId : this.family(familyOrId);
        if (!family) return [];
        return [family.father_id, family.mother_id].filter((id) => id && this.people.has(id));
    }

    parentLinks(personId, { types = null } = {}) {
        const links = this.childLinksByPerson.get(toId(personId)) || [];
        if (!types) return links.slice();
        const allowed = types instanceof Set ? types : new Set(types);
        return links.filter((link) => allowed.has(link.childType));
    }

    primaryParentLink(personId) {
        return (this.childLinksByPerson.get(toId(personId)) || []).find((link) => link.isPrimary) || null;
    }

    biologicalParentLink(personId) {
        return this.parentLinks(personId).find(isBloodLink) || null;
    }

    // Cha mẹ theo loại quan hệ. kind: 'blood' | 'adoptive' | 'any' | 'lineage'
    parentIds(personId, kind = 'blood') {
        const ids = new Set();
        for (const link of this.parentLinksOfKind(personId, kind)) {
            this.parentIdsOfFamily(link.familyId).forEach((id) => ids.add(id));
        }
        return [...ids];
    }

    parentLinksOfKind(personId, kind = 'blood') {
        const links = this.parentLinks(personId);
        if (kind === 'blood') return links.filter(isBloodLink);
        if (kind === 'adoptive') return links.filter(isAdoptiveLink);
        if (kind === 'kin') return links.filter((link) => isBloodLink(link) || isAdoptiveLink(link));
        if (kind === 'lineage') return links.filter((link) => link.isPrimary);
        return links;
    }

    childLinksOfFamily(familyId) {
        return (this.childLinksByFamily.get(toFamilyId(familyId)) || []).slice();
    }

    unionIds(personId) {
        return (this.familiesByParent.get(toId(personId)) || []).slice();
    }

    // Các cuộc hôn nhân/quan hệ của một người (kể cả gia đình khuyết vợ/chồng), sắp theo thứ tự.
    unionsOf(personId) {
        const id = toId(personId);
        return this.unionIds(id)
            .map((familyId) => this.families.get(familyId))
            .filter(Boolean)
            .sort((a, b) => {
                const rankA = a.father_id === id ? a.wife_rank : a.husband_rank;
                const rankB = b.father_id === id ? b.wife_rank : b.husband_rank;
                if (rankA && rankB && rankA !== rankB) return rankA - rankB;
                if (rankA && !rankB) return -1;
                if (!rankA && rankB) return 1;
                const dateA = String(a.marriage_date || '');
                const dateB = String(b.marriage_date || '');
                if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;
                return a.id - b.id;
            });
    }

    spouseIdInFamily(familyOrId, personId) {
        const family = typeof familyOrId === 'object' ? familyOrId : this.family(familyOrId);
        const id = toId(personId);
        if (!family) return null;
        const spouseId = family.father_id === id ? family.mother_id : family.mother_id === id ? family.father_id : null;
        return spouseId && this.people.has(spouseId) ? spouseId : null;
    }

    spouseIds(personId) {
        const ids = [];
        for (const family of this.unionsOf(personId)) {
            const spouseId = this.spouseIdInFamily(family, personId);
            if (spouseId && !ids.includes(spouseId)) ids.push(spouseId);
        }
        return ids;
    }

    childIds(personId, kind = 'blood') {
        const ids = [];
        for (const familyId of this.unionIds(personId)) {
            for (const link of this.childLinksOfFamily(familyId)) {
                if (!this.people.has(link.personId)) continue;
                if (kind === 'blood' && !isBloodLink(link)) continue;
                if (kind === 'adoptive' && !isAdoptiveLink(link)) continue;
                if (kind === 'kin' && !isBloodLink(link) && !isAdoptiveLink(link)) continue;
                if (!ids.includes(link.personId)) ids.push(link.personId);
            }
        }
        return ids;
    }

    // Tổ tiên kèm độ sâu nhỏ nhất (cha mẹ = 1). Lưu thêm "con đi xuống" để dựng lại nhánh.
    ancestorsWithDepth(personId, { kind = 'blood', maxDepth = Infinity } = {}) {
        const start = toId(personId);
        const result = new Map();
        if (!start) return result;
        let frontier = [start];
        let depth = 0;
        const visited = new Set([start]);
        while (frontier.length && depth < maxDepth) {
            depth += 1;
            const next = [];
            for (const currentId of frontier) {
                for (const parentId of this.parentIds(currentId, kind)) {
                    if (visited.has(parentId)) continue;
                    visited.add(parentId);
                    result.set(parentId, { depth, via: currentId });
                    next.push(parentId);
                }
            }
            frontier = next;
        }
        return result;
    }

    descendantIds(personId, { kind = 'any' } = {}) {
        const start = toId(personId);
        const result = new Set();
        const queue = start ? [start] : [];
        while (queue.length) {
            const currentId = queue.shift();
            for (const childId of this.childIds(currentId, kind)) {
                if (childId === start || result.has(childId)) continue;
                result.add(childId);
                queue.push(childId);
            }
        }
        return result;
    }

    isAncestor(ancestorId, personId, kind = 'any') {
        return this.descendantIds(ancestorId, { kind }).has(toId(personId));
    }

    // Các tổ tiên chung gần nhất của a và b (theo tổng độ sâu nhỏ nhất).
    // Mỗi kết quả: { ancestorId, depthA, depthB, branchA, branchB } trong đó branchA/branchB là
    // con của tổ tiên chung nằm trên đường xuống a/b (dùng để xét vai vế).
    nearestCommonAncestors(aId, bId, { kind = 'blood', maxDepth = 12 } = {}) {
        const a = toId(aId);
        const b = toId(bId);
        if (!a || !b) return [];
        const ancestorsA = this.ancestorsWithDepth(a, { kind, maxDepth });
        const ancestorsB = this.ancestorsWithDepth(b, { kind, maxDepth });
        ancestorsA.set(a, { depth: 0, via: null });
        ancestorsB.set(b, { depth: 0, via: null });

        let best = Infinity;
        const matches = [];
        for (const [ancestorId, infoA] of ancestorsA.entries()) {
            const infoB = ancestorsB.get(ancestorId);
            if (!infoB) continue;
            const total = infoA.depth + infoB.depth;
            if (total < best) {
                best = total;
                matches.length = 0;
            }
            if (total === best) {
                matches.push({
                    ancestorId,
                    depthA: infoA.depth,
                    depthB: infoB.depth,
                    branchA: this.branchChild(ancestorsA, a, ancestorId),
                    branchB: this.branchChild(ancestorsB, b, ancestorId),
                });
            }
        }
        return matches;
    }

    // `via` là người con của tổ tiên nằm trên đường đi xuống `startId` (do BFS đi ngược từ startId lên).
    branchChild(ancestorMap, startId, ancestorId) {
        if (ancestorId === startId) return null;
        return ancestorMap.get(ancestorId)?.via ?? null;
    }

    siblingKind(aId, bId) {
        const a = toId(aId);
        const b = toId(bId);
        if (!a || !b || a === b) return null;
        const bloodA = this.biologicalParentLink(a);
        const bloodB = this.biologicalParentLink(b);
        if (bloodA && bloodB) {
            const famA = this.family(bloodA.familyId);
            const famB = this.family(bloodB.familyId);
            const sameFather = Boolean(famA.father_id && famA.father_id === famB.father_id);
            const sameMother = Boolean(famA.mother_id && famA.mother_id === famB.mother_id);
            if (bloodA.familyId === bloodB.familyId || (sameFather && sameMother)) return 'full';
            if (sameFather) return 'half_paternal';
            if (sameMother) return 'half_maternal';
        }
        const kinA = new Set(this.parentIds(a, 'kin'));
        if (this.parentIds(b, 'kin').some((id) => kinA.has(id))) return 'adoptive';
        const parentsA = this.parentIds(a, 'any');
        const parentsB = this.parentIds(b, 'any');
        if (parentsA.some((pa) => parentsB.some((pb) => this.spouseIds(pa).includes(pb)))) return 'step';
        return null;
    }

    // Thứ bậc anh/chị/em: -1 nếu a lớn hơn b, 1 nếu a nhỏ hơn, null nếu chưa đủ dữ liệu.
    // Ưu tiên ngày sinh (khi phân định chắc chắn), rồi "con thứ" trong cùng một gia đình.
    compareSiblingSeniority(aId, bId) {
        const a = this.person(aId);
        const b = this.person(bId);
        if (!a || !b || a.id === b.id) return null;
        const byBirth = compareBirth(personBirth(a), personBirth(b));
        if (byBirth !== null) return byBirth;
        const linksA = this.parentLinks(a.id);
        for (const linkA of linksA) {
            const linkB = this.parentLinks(b.id).find((link) => link.familyId === linkA.familyId);
            if (linkB && linkA.sortOrder > 0 && linkB.sortOrder > 0 && linkA.sortOrder !== linkB.sortOrder) {
                return linkA.sortOrder < linkB.sortOrder ? -1 : 1;
            }
        }
        // Anh chị em khác mẹ: con vợ trước (thứ hạng nhỏ hơn) thường sinh trước khi không có ngày sinh.
        const bloodA = this.biologicalParentLink(a.id);
        const bloodB = this.biologicalParentLink(b.id);
        const famA = bloodA ? this.family(bloodA.familyId) : null;
        const famB = bloodB ? this.family(bloodB.familyId) : null;
        if (famA && famB && famA.id !== famB.id && famA.father_id && famA.father_id === famB.father_id) {
            if (famA.wife_rank && famB.wife_rank && famA.wife_rank !== famB.wife_rank) {
                return famA.wife_rank < famB.wife_rank ? -1 : 1;
            }
        }
        return null;
    }

    // Cụm vợ chồng: tập người nối với nhau qua hôn nhân (dùng cho kiểm tra và hiển thị).
    spouseClusterOf(personId) {
        const start = toId(personId);
        const result = new Set();
        const queue = start ? [start] : [];
        while (queue.length) {
            const current = queue.shift();
            if (result.has(current)) continue;
            result.add(current);
            this.spouseIds(current).forEach((id) => { if (!result.has(id)) queue.push(id); });
        }
        return result;
    }

    // Bản sao nông để thử thay đổi (dry-run) mà không đụng dữ liệu gốc.
    toRows() {
        const children = [];
        for (const links of this.childLinksByFamily.values()) {
            for (const link of links) {
                children.push({
                    family_id: link.familyId,
                    person_id: link.personId,
                    child_type: link.childType,
                    is_primary_lineage: link.isPrimary ? 1 : 0,
                    sort_order: link.sortOrder,
                });
            }
        }
        return {
            people: [...this.people.values()].map((person) => ({ ...person })),
            families: [...this.families.values()].map((family) => ({ ...family })),
            children,
        };
    }
}

const buildKinshipGraph = (rows = {}) => new KinshipGraph(rows);

module.exports = {
    MALE,
    FEMALE,
    CHILD_TYPES,
    UNION_TYPES,
    RELATIONSHIP_STATUSES,
    BLOOD_CHILD_TYPES,
    ADOPTIVE_CHILD_TYPES,
    KinshipGraph,
    buildKinshipGraph,
    normalizeChildType,
    normalizeUnionType,
    normalizeRelationshipStatus,
    normalizeGender,
    isBloodLink,
    isAdoptiveLink,
    toId,
    toFamilyId,
};
