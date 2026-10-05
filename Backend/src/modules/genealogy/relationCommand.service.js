// Ghi quan hệ gia phả an toàn: nạp đồ thị dòng họ -> áp thay đổi lên bản nháp -> kiểm tra
// (chỉ tính vấn đề mới phát sinh) -> ghi tất cả trong một transaction, kèm tính lại đời và lưu vết xác nhận.
const { db, ARCHIVED_MEMBER_JOIN_SQL } = require('../manager/common.service');
const core = require('./core');
const { ensureGenealogySchema } = require('./genealogySchema.service');
const { getClanGenealogyPolicy } = require('./genealogyPolicy.service');

const SOURCE_TYPES = ['direct', 'paper_genealogy', 'oral', 'document', 'unknown'];
const PERSON_FIELDS_FOR_RULES = [
    'gender', 'generation', 'birth_date', 'birth_date_precision', 'death_date', 'death_date_precision',
    'is_living', 'source_type', 'display_name', 'surname', 'middle_name', 'first_name',
];
const FAMILY_FIELDS = [
    'father_id', 'mother_id', 'marriage_date', 'marriage_date_precision', 'relationship_status', 'ended_at',
    'ended_at_precision', 'relation_note', 'union_type', 'wife_rank', 'husband_rank', 'source_type',
    'source_note', 'visibility',
];

const STRUCTURAL_CODES = [
    'ANCESTOR_LOOP', 'SELF_PARENT', 'MULTIPLE_BIOLOGICAL_PARENTS', 'SAME_PERSON_AS_SPOUSE',
    'SAME_GENDER_SPOUSE', 'FEMALE_AS_HUSBAND', 'MALE_AS_WIFE', 'DUPLICATE_SPOUSE_FAMILY',
];

const pad = (value) => String(value).padStart(2, '0');

// mysql2 trả DATE thành Date theo giờ địa phương: lấy phần ngày theo giờ địa phương để không lệch múi giờ.
const toIsoDate = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    const text = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

const normalizeSourceType = (value) => {
    const text = String(value || '').trim().toLowerCase();
    return SOURCE_TYPES.includes(text) ? text : null;
};

const normalizeRank = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.min(20, Math.round(number)) : null;
};

const normalizeOptionalText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
};

const normalizeFlag = (value) =>
    value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';

const toId = core.toId;

const loadClanRows = async (connection, clanId) => {
    await ensureGenealogySchema();
    const [peopleRows] = await connection.query(
        `
        SELECT p.id, p.clan_id, p.display_name, p.surname, p.middle_name, p.first_name, p.gender, p.generation,
               p.birth_date, p.birth_date_precision, p.death_date, p.death_date_precision, p.is_living,
               p.source_type, MAX(a.id) AS account_id
        FROM people p
        LEFT JOIN accounts a ON a.person_id = p.id
        ${ARCHIVED_MEMBER_JOIN_SQL}
        WHERE p.clan_id = ? AND am.id IS NULL
        GROUP BY p.id
        `,
        [clanId]
    );
    const [familyRows] = await connection.query(
        `
        SELECT id, clan_id, father_id, mother_id, marriage_date, marriage_date_precision, relationship_status,
               ended_at, ended_at_precision, relation_note, union_type, wife_rank, husband_rank,
               source_type, source_note, visibility
        FROM families
        WHERE clan_id = ?
        `,
        [clanId]
    );
    const [childRows] = await connection.query(
        `
        SELECT c.family_id, c.person_id, c.sort_order, c.child_type, c.is_primary_lineage
        FROM children c
        INNER JOIN families f ON f.id = c.family_id
        WHERE f.clan_id = ?
        ORDER BY c.family_id, c.sort_order, c.id
        `,
        [clanId]
    );
    return {
        people: peopleRows.map((row) => ({
            ...row,
            id: Number(row.id),
            birth_date: toIsoDate(row.birth_date),
            death_date: toIsoDate(row.death_date),
            is_living: row.is_living === null || row.is_living === undefined ? null : Number(row.is_living),
        })),
        families: familyRows.map((row) => ({
            ...row,
            id: Number(row.id),
            marriage_date: toIsoDate(row.marriage_date),
            ended_at: toIsoDate(row.ended_at),
        })),
        children: childRows.map((row) => ({
            family_id: Number(row.family_id),
            person_id: Number(row.person_id),
            sort_order: Number(row.sort_order) || 0,
            child_type: row.child_type || 'biological',
            is_primary_lineage: row.is_primary_lineage === null || row.is_primary_lineage === undefined ? null : Number(row.is_primary_lineage),
        })),
    };
};

const cloneRows = (rows) => ({
    people: rows.people.map((row) => ({ ...row })),
    families: rows.families.map((row) => ({ ...row })),
    children: rows.children.map((row) => ({ ...row })),
});

class RelationError extends Error {
    constructor(result) {
        super(result?.message || 'Quan hệ gia phả không hợp lệ');
        this.relationResult = result;
        this.status = result?.requiresConfirmation ? 409 : 400;
    }
}

const failure = (message, code = 'RELATION_VALIDATION_ERROR', extra = {}) => ({
    ok: false,
    level: 'error',
    code,
    message,
    requiresConfirmation: false,
    ...extra,
});

class RelationDraft {
    constructor({ connection, clanId, rows, policy, now = new Date() }) {
        this.connection = connection;
        this.clanId = Number(clanId);
        // Dòng con thiếu loại quan hệ được coi là con ruột (dữ liệu cũ trước khi có cột child_type).
        rows.children.forEach((row) => { row.child_type = core.normalizeChildType(row.child_type); });
        this.original = rows;
        this.rows = cloneRows(rows);
        this.policy = policy;
        this.now = now;
        this.touchedPeople = new Set();
        this.touchedFamilies = new Set();
        this.lineageSeeds = new Set();
        this.explicitGenerations = new Map();
        this.deletedFamilies = new Set();
        this.notices = [];
        this.nextTempId = -1;
    }

    static async load(connection, clanId, options = {}) {
        // Khóa theo dòng họ để hai người sửa quan hệ cùng lúc không ghi đè nhau.
        await connection.query('SELECT id FROM clans WHERE id = ? FOR UPDATE', [clanId]);
        const rows = await loadClanRows(connection, clanId);
        const policy = options.policy || await getClanGenealogyPolicy(clanId, connection);
        return new RelationDraft({ connection, clanId, rows, policy, now: options.now });
    }

    graph() {
        return core.buildKinshipGraph(this.rows);
    }

    person(id) {
        return this.rows.people.find((row) => row.id === toId(id)) || null;
    }

    family(id) {
        return this.rows.families.find((row) => row.id === Number(id)) || null;
    }

    assertPerson(id, label = 'Thành viên') {
        const person = this.person(id);
        if (!person) throw new RelationError(failure(`${label} không thuộc dòng họ hoặc không tồn tại.`, 'PERSON_NOT_IN_CLAN'));
        return person;
    }

    touchPerson(id) {
        const personId = toId(id);
        if (!personId) return;
        this.touchedPeople.add(personId);
        this.lineageSeeds.add(personId);
    }

    touchFamily(id) {
        if (id === null || id === undefined) return;
        this.touchedFamilies.add(Number(id));
        const family = this.family(id);
        if (family) {
            [family.father_id, family.mother_id].forEach((personId) => this.touchPerson(personId));
            this.childLinksOf(family.id).forEach((link) => this.lineageSeeds.add(link.person_id));
        }
    }

    childLinksOf(familyId) {
        return this.rows.children.filter((row) => row.family_id === Number(familyId));
    }

    parentLinksOf(personId) {
        return this.rows.children.filter((row) => row.person_id === toId(personId));
    }

    // ---------- Người ----------

    updatePerson(personId, fields = {}) {
        const person = this.assertPerson(personId);
        for (const key of PERSON_FIELDS_FOR_RULES) {
            if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
            let value = fields[key];
            if (key === 'birth_date' || key === 'death_date') value = toIsoDate(value);
            if (key === 'is_living') value = value === null || value === undefined || value === '' ? null : Number(value) ? 1 : 0;
            if (key === 'gender') value = core.normalizeGender(value);
            if (key === 'generation') {
                const generation = Number(value);
                const valid = Number.isFinite(generation) && generation > 0;
                // Chỉ coi là người dùng đổi đời khi khác giá trị đang lưu (form luôn gửi kèm đời hiện tại).
                if (valid && Math.round(generation) !== Number(person.generation)) {
                    this.explicitGenerations.set(person.id, Math.round(generation));
                }
                value = valid ? Math.round(generation) : person.generation;
            }
            person[key] = value;
        }
        this.touchPerson(person.id);
    }

    // ---------- Cha mẹ ----------

    findFamilyByParents(fatherId, motherId) {
        const father = toId(fatherId);
        const mother = toId(motherId);
        return this.rows.families.find((row) => (toId(row.father_id) || null) === father && (toId(row.mother_id) || null) === mother) || null;
    }

    createFamilyRow(fatherId, motherId, fields = {}) {
        const id = this.nextTempId;
        this.nextTempId -= 1;
        const row = {
            id,
            clan_id: this.clanId,
            father_id: toId(fatherId),
            mother_id: toId(motherId),
            marriage_date: null,
            marriage_date_precision: 'exact',
            relationship_status: 'active',
            ended_at: null,
            ended_at_precision: 'exact',
            relation_note: null,
            union_type: 'marriage',
            wife_rank: null,
            husband_rank: null,
            source_type: null,
            source_note: null,
            visibility: 'public',
        };
        this.rows.families.push(row);
        this.applyFamilyFields(row, fields);
        this.touchFamily(id);
        return row;
    }

    applyFamilyFields(family, fields = {}) {
        const has = (key) => Object.prototype.hasOwnProperty.call(fields, key);
        if (has('marriage_date')) family.marriage_date = toIsoDate(fields.marriage_date);
        if (has('marriage_date_precision')) family.marriage_date_precision = core.normalizePrecision(fields.marriage_date_precision);
        if (has('relationship_status')) family.relationship_status = core.normalizeRelationshipStatus(fields.relationship_status);
        if (has('ended_at')) family.ended_at = toIsoDate(fields.ended_at);
        if (has('ended_at_precision')) family.ended_at_precision = core.normalizePrecision(fields.ended_at_precision);
        if (has('relation_note')) family.relation_note = normalizeOptionalText(fields.relation_note);
        if (has('union_type')) family.union_type = core.normalizeUnionType(fields.union_type);
        if (has('wife_rank')) family.wife_rank = normalizeRank(fields.wife_rank);
        if (has('husband_rank')) family.husband_rank = normalizeRank(fields.husband_rank);
        if (has('source_type')) family.source_type = normalizeSourceType(fields.source_type);
        if (has('source_note')) family.source_note = normalizeOptionalText(fields.source_note);
        if (has('visibility')) family.visibility = fields.visibility === 'managers' ? 'managers' : 'public';
        if (family.relationship_status === 'active' && has('relationship_status')) {
            family.ended_at = has('ended_at') ? family.ended_at : null;
        }
    }

    // Đặt cha mẹ theo một loại quan hệ (mặc định là ruột). Liên kết cùng loại cũ được thay thế.
    setParents(personId, { fatherId = null, motherId = null, childType = 'biological', sortOrder, isPrimary } = {}) {
        const person = this.assertPerson(personId);
        const father = toId(fatherId);
        const mother = toId(motherId);
        const type = core.normalizeChildType(childType);
        if (father) this.assertPerson(father, 'Cha');
        if (mother) this.assertPerson(mother, 'Mẹ');
        if (father && father === person.id || mother && mother === person.id) {
            throw new RelationError(failure('Thành viên không thể là cha/mẹ của chính mình.', 'SELF_PARENT'));
        }

        const sameKind = (link) => (
            type === 'biological' || type === 'unknown'
                ? link.child_type === 'biological' || link.child_type === 'unknown'
                : link.child_type === type
        );
        const previous = this.parentLinksOf(person.id).filter(sameKind);
        const previousOrder = previous[0]?.sort_order;
        const previousPrimary = previous.some((link) => Number(link.is_primary_lineage) === 1);
        previous.forEach((link) => this.removeChildLink(link.family_id, link.person_id));

        if (!father && !mother) {
            this.touchPerson(person.id);
            return null;
        }
        let family = this.findFamilyByParents(father, mother);
        if (!family) family = this.createFamilyRow(father, mother);
        this.addChildLink(family.id, person.id, {
            childType: type,
            sortOrder: sortOrder ?? previousOrder,
            isPrimary: isPrimary ?? (previousPrimary || undefined),
        });
        return family;
    }

    removeChildLink(familyId, personId) {
        const before = this.rows.children.length;
        this.rows.children = this.rows.children.filter((row) => !(row.family_id === Number(familyId) && row.person_id === toId(personId)));
        if (this.rows.children.length !== before) {
            this.touchFamily(familyId);
            this.touchPerson(personId);
        }
    }

    // Thêm/cập nhật một liên kết con. Con ruột chuyển khỏi gia đình ruột cũ (nếu có).
    addChildLink(familyId, personId, { childType = 'biological', sortOrder, isPrimary } = {}) {
        const family = this.family(familyId);
        if (!family) throw new RelationError(failure('Không tìm thấy gia đình cần thêm con.', 'FAMILY_NOT_FOUND'));
        const child = this.assertPerson(personId, 'Con');
        const type = core.normalizeChildType(childType);
        if ([family.father_id, family.mother_id].includes(child.id)) {
            throw new RelationError(failure('Thành viên không thể là cha/mẹ của chính mình.', 'SELF_PARENT'));
        }

        if (type === 'biological') {
            for (const link of this.parentLinksOf(child.id)) {
                if (link.family_id !== family.id && link.child_type === 'biological') {
                    this.removeChildLink(link.family_id, child.id);
                    this.notices.push({
                        code: 'CHILD_MOVED_FROM_PREVIOUS_PARENTS',
                        severity: 'notice',
                        personIds: [child.id],
                        message: `${core.labelOf(child)} đã được chuyển khỏi gia đình cha mẹ ruột cũ.`,
                    });
                }
            }
        }

        let link = this.rows.children.find((row) => row.family_id === family.id && row.person_id === child.id);
        if (!link) {
            const siblings = this.childLinksOf(family.id);
            const maxOrder = siblings.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), 0);
            link = { family_id: family.id, person_id: child.id, sort_order: maxOrder + 1, child_type: type, is_primary_lineage: null };
            this.rows.children.push(link);
        }
        link.child_type = type;
        if (sortOrder !== undefined && sortOrder !== null && sortOrder !== '') {
            const order = Number(sortOrder);
            if (Number.isFinite(order) && order >= 0) link.sort_order = Math.round(order);
        }

        const otherLinks = this.parentLinksOf(child.id).filter((row) => row !== link);
        let primary = isPrimary;
        if (primary === undefined || primary === null) {
            const currentPrimary = otherLinks.find((row) => Number(row.is_primary_lineage) === 1);
            if (type === 'heir') primary = true;
            else if (type === 'adopted') primary = !otherLinks.some((row) => row.child_type === 'biological');
            else if (type === 'biological' || type === 'unknown') primary = !currentPrimary || ['step', 'foster'].includes(currentPrimary.child_type);
            else primary = otherLinks.length === 0;
        }
        if (primary) {
            otherLinks.forEach((row) => { row.is_primary_lineage = 0; });
            link.is_primary_lineage = 1;
        } else {
            link.is_primary_lineage = 0;
            if (!otherLinks.some((row) => Number(row.is_primary_lineage) === 1)) {
                const fallback = otherLinks.find((row) => ['biological', 'unknown', 'adopted', 'heir'].includes(row.child_type));
                if (fallback) fallback.is_primary_lineage = 1;
                else link.is_primary_lineage = 1;
            }
        }
        this.touchFamily(family.id);
        this.touchPerson(child.id);
        return link;
    }

    // Thay toàn bộ danh sách con của một gia đình (giữ thứ tự, loại con).
    setFamilyChildren(familyId, items = []) {
        const family = this.family(familyId);
        if (!family) throw new RelationError(failure('Không tìm thấy gia đình cần cập nhật con.', 'FAMILY_NOT_FOUND'));
        const wanted = new Map();
        items.forEach((item, index) => {
            const personId = toId(item.personId ?? item.person_id ?? item.id ?? item);
            if (!personId || wanted.has(personId)) return;
            wanted.set(personId, {
                sortOrder: item.sortOrder ?? item.sort_order ?? index + 1,
                childType: item.childType ?? item.child_type,
            });
        });
        for (const link of this.childLinksOf(family.id)) {
            if (!wanted.has(link.person_id)) this.removeChildLink(family.id, link.person_id);
        }
        for (const [personId, item] of wanted.entries()) {
            const existing = this.rows.children.find((row) => row.family_id === family.id && row.person_id === personId);
            this.addChildLink(family.id, personId, {
                childType: item.childType || existing?.child_type || 'biological',
                sortOrder: item.sortOrder,
            });
        }
        this.touchFamily(family.id);
    }

    // ---------- Hôn nhân ----------

    rolesForCouple(personId, spouseId) {
        const person = this.person(personId);
        const spouse = spouseId ? this.person(spouseId) : null;
        const gender = core.normalizeGender(person?.gender);
        const spouseGender = core.normalizeGender(spouse?.gender);
        if (gender === core.FEMALE || (!gender && spouseGender === core.MALE)) {
            return { fatherId: spouse ? spouse.id : null, motherId: person.id };
        }
        return { fatherId: person.id, motherId: spouse ? spouse.id : null };
    }

    // Tạo hoặc cập nhật một cuộc hôn nhân. familyId: gia đình cần sửa (bắt buộc người phải là cha/mẹ trong đó).
    // spouseId = undefined: giữ nguyên vợ/chồng hiện có của gia đình đó.
    upsertUnion({ personId, spouseId, familyId = null, fields = {} } = {}) {
        const person = this.assertPerson(personId);
        const spouseProvided = spouseId !== undefined;
        const spouse = toId(spouseId);
        if (spouse) this.assertPerson(spouse, 'Vợ/chồng');
        if (spouse && spouse === person.id) {
            throw new RelationError(failure('Vợ/chồng không thể trùng với chính thành viên.', 'SAME_PERSON_AS_SPOUSE'));
        }
        let family = familyId ? this.family(familyId) : null;
        if (familyId && !family) throw new RelationError(failure('Không tìm thấy gia đình cần cập nhật.', 'FAMILY_NOT_FOUND'));
        if (family && family.father_id !== person.id && family.mother_id !== person.id) {
            throw new RelationError(failure('Thành viên không phải cha/mẹ trong gia đình này.', 'NOT_FAMILY_PARENT'));
        }

        if (!family && spouse) {
            family = this.rows.families.find((row) => (
                (row.father_id === person.id && row.mother_id === spouse) || (row.mother_id === person.id && row.father_id === spouse)
            )) || null;
        }

        if (family && spouseProvided) {
            const currentSpouse = family.father_id === person.id ? family.mother_id : family.father_id;
            if ((currentSpouse || null) !== (spouse || null)) {
                const roles = this.rolesForCouple(person.id, spouse);
                // Nếu cặp mới đã có gia đình riêng thì gộp con vào gia đình đó thay vì tạo trùng.
                const existingPair = this.rows.families.find((row) => row !== family
                    && (row.father_id || null) === (roles.fatherId || null)
                    && (row.mother_id || null) === (roles.motherId || null));
                if (existingPair) {
                    this.mergeFamilyInto(family, existingPair);
                    family = existingPair;
                } else {
                    family.father_id = roles.fatherId;
                    family.mother_id = roles.motherId;
                }
            }
        }

        if (!family) {
            const roles = this.rolesForCouple(person.id, spouse);
            family = this.findFamilyByParents(roles.fatherId, roles.motherId)
                || this.createFamilyRow(roles.fatherId, roles.motherId);
        }

        this.applyFamilyFields(family, fields);
        if (spouse && !Object.prototype.hasOwnProperty.call(fields, 'wife_rank') && !family.wife_rank && family.father_id && family.mother_id) {
            const fatherUnions = this.rows.families.filter((row) => row !== family && row.father_id === family.father_id && row.mother_id);
            if (fatherUnions.length) {
                const maxRank = fatherUnions.reduce((max, row) => Math.max(max, row.wife_rank || 0), 0);
                family.wife_rank = Math.max(maxRank, fatherUnions.length) + 1;
                fatherUnions.forEach((row, index) => { if (!row.wife_rank) row.wife_rank = index + 1; });
            }
        }
        if (spouse && !Object.prototype.hasOwnProperty.call(fields, 'husband_rank') && !family.husband_rank && family.father_id && family.mother_id) {
            const motherUnions = this.rows.families.filter((row) => row !== family && row.mother_id === family.mother_id && row.father_id);
            if (motherUnions.length) {
                const maxRank = motherUnions.reduce((max, row) => Math.max(max, row.husband_rank || 0), 0);
                family.husband_rank = Math.max(maxRank, motherUnions.length) + 1;
                motherUnions.forEach((row, index) => { if (!row.husband_rank) row.husband_rank = index + 1; });
            }
        }
        this.touchFamily(family.id);
        return family;
    }

    mergeFamilyInto(from, to) {
        for (const link of this.childLinksOf(from.id)) {
            if (!this.rows.children.some((row) => row.family_id === to.id && row.person_id === link.person_id)) {
                this.rows.children.push({ ...link, family_id: to.id });
            }
        }
        this.rows.children = this.rows.children.filter((row) => row.family_id !== from.id);
        this.rows.families = this.rows.families.filter((row) => row !== from);
        if (from.id > 0) this.deletedFamilies.add(from.id);
        this.touchFamily(to.id);
    }

    // Gỡ vợ/chồng khỏi một gia đình. Con vẫn giữ người cha/mẹ còn lại.
    unlinkSpouse({ personId, familyId }) {
        const family = this.family(familyId);
        if (!family) return null;
        const person = this.assertPerson(personId);
        if (family.father_id !== person.id && family.mother_id !== person.id) {
            throw new RelationError(failure('Thành viên không phải cha/mẹ trong gia đình này.', 'NOT_FAMILY_PARENT'));
        }
        const spouseId = family.father_id === person.id ? family.mother_id : family.father_id;
        if (spouseId) this.touchPerson(spouseId);
        this.touchFamily(family.id);
        const children = this.childLinksOf(family.id);
        if (!children.length) {
            this.rows.families = this.rows.families.filter((row) => row !== family);
            if (family.id > 0) this.deletedFamilies.add(family.id);
            return null;
        }
        const roles = this.rolesForCouple(person.id, null);
        const single = this.findFamilyByParents(roles.fatherId, roles.motherId);
        if (single && single !== family) {
            this.mergeFamilyInto(family, single);
            return single;
        }
        family.father_id = roles.fatherId;
        family.mother_id = roles.motherId;
        return family;
    }

    updateFamily(familyId, { fatherId, motherId, fields = {} } = {}) {
        const family = this.family(familyId);
        if (!family) throw new RelationError(failure('Không tìm thấy gia đình cần cập nhật.', 'FAMILY_NOT_FOUND'));
        if (fatherId !== undefined) {
            if (fatherId) this.assertPerson(fatherId, 'Cha');
            family.father_id = toId(fatherId);
        }
        if (motherId !== undefined) {
            if (motherId) this.assertPerson(motherId, 'Mẹ');
            family.mother_id = toId(motherId);
        }
        if (!family.father_id && !family.mother_id) {
            throw new RelationError(failure('Gia đình cần có ít nhất cha hoặc mẹ.', 'FAMILY_WITHOUT_PARENTS'));
        }
        this.applyFamilyFields(family, fields);
        this.touchFamily(family.id);
        return family;
    }

    // ---------- Kiểm tra ----------

    scope() {
        const personIds = new Set(this.touchedPeople);
        const familyIds = new Set([...this.touchedFamilies].filter((id) => this.family(id)));
        return { personIds, familyIds };
    }

    evaluate({ force = false, allowSensitive = false, reason = null } = {}) {
        const scope = this.scope();
        const originalGraph = core.buildKinshipGraph(this.original);
        const draftGraph = this.graph();
        const scopeForOriginal = {
            personIds: scope.personIds,
            familyIds: new Set([...scope.familyIds].filter((id) => originalGraph.family(id))),
        };
        const before = core.validateGraph(originalGraph, { policy: this.policy, now: this.now, scope: scopeForOriginal });
        const after = core.validateGraph(draftGraph, { policy: this.policy, now: this.now, scope });
        const fresh = core.diffIssues(before, after);
        const { blocking, confirm, notices } = core.classifyIssues(fresh, { allowSensitive });

        const generationScope = core.affectedLineageIds(draftGraph, this.lineageSeeds);
        const generationChanges = core.generationChanges(draftGraph, this.policy, generationScope);
        const computed = core.computeGenerations(draftGraph, this.policy);
        for (const [personId, generation] of this.explicitGenerations.entries()) {
            const derived = computed.get(personId);
            const hasParents = Boolean(core.lineageParentOf(draftGraph, personId, this.policy));
            if (hasParents && derived && derived !== generation) {
                blocking.push({
                    code: 'GENERATION_DERIVED_FROM_PARENTS',
                    severity: 'error',
                    personIds: [personId],
                    message: `Đời của ${core.labelOf(draftGraph.person(personId))} được tính theo cha/mẹ (đời ${derived}), không thể đặt là đời ${generation}.`,
                });
            }
        }

        // Lỗi cấu trúc (vòng lặp, tự làm cha mẹ...) nêu trước lỗi ngày tháng.
        blocking.sort((a, b) => (STRUCTURAL_CODES.indexOf(a.code) + 1 || 99) - (STRUCTURAL_CODES.indexOf(b.code) + 1 || 99));
        const result = {
            ok: true,
            blocking,
            confirm,
            notices: [...this.notices, ...notices],
            generationChanges,
            issues: fresh,
        };
        if (blocking.length) {
            const first = blocking[0];
            return {
                ...result,
                ok: false,
                level: 'error',
                code: first.strict ? 'STRICT_KINSHIP_CONFLICT' : first.code,
                requiresConfirmation: false,
                message: blocking.length > 1
                    ? `${first.message} (và ${blocking.length - 1} vấn đề khác)`
                    : first.message,
            };
        }
        const needsReason = confirm.some((issue) => issue.severity === 'legal');
        if (confirm.length && (!force || (needsReason && !normalizeOptionalText(reason)))) {
            const lines = confirm.map((issue) => `• ${issue.message}`).join('\n');
            return {
                ...result,
                ok: false,
                level: 'warning',
                code: confirm.some((issue) => issue.severity === 'legal') ? 'HISTORICAL_RELATION_WARNING' : 'RELATION_PLAUSIBILITY_WARNING',
                requiresConfirmation: true,
                reasonRequired: needsReason,
                message: `${lines}\n${needsReason
                    ? 'Quan hệ này trái quy định hiện hành nhưng có thể là dữ liệu lịch sử (ví dụ ghi trong gia phả giấy). Nhập lý do/nguồn để lưu.'
                    : 'Bạn có chắc muốn tiếp tục lưu không?'}`,
            };
        }
        return result;
    }

    // ---------- Ghi ----------

    async commit({ evaluation, accountId = null, action = 'relation_change', reason = null, sourceType = null, sourceNote = null } = {}) {
        const connection = this.connection;
        const idMap = new Map();
        const originalFamilies = new Map(this.original.families.map((row) => [row.id, row]));
        const sensitive = (evaluation?.confirm || []).some((issue) => issue.sensitive);

        for (const familyId of this.deletedFamilies) {
            await connection.query('DELETE FROM children WHERE family_id = ?', [familyId]);
            await connection.query('DELETE FROM families WHERE id = ? AND clan_id = ?', [familyId, this.clanId]);
        }

        for (const family of this.rows.families) {
            if (sensitive && this.policy.sensitiveRelationVisibility === 'managers'
                && (evaluation.confirm || []).some((issue) => issue.sensitive && issue.familyId === family.id)) {
                family.visibility = 'managers';
            }
            if (family.id < 0) {
                const [result] = await connection.query(
                    `INSERT INTO families (clan_id, ${FAMILY_FIELDS.join(', ')}) VALUES (?, ${FAMILY_FIELDS.map(() => '?').join(', ')})`,
                    [this.clanId, ...FAMILY_FIELDS.map((key) => family[key] ?? defaultFamilyValue(key))]
                );
                idMap.set(family.id, result.insertId);
                continue;
            }
            const before = originalFamilies.get(family.id);
            const changed = FAMILY_FIELDS.filter((key) => String(before?.[key] ?? '') !== String(family[key] ?? ''));
            if (changed.length) {
                await connection.query(
                    `UPDATE families SET ${changed.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND clan_id = ?`,
                    [...changed.map((key) => family[key] ?? defaultFamilyValue(key)), family.id, this.clanId]
                );
            }
        }
        const realFamilyId = (id) => (id < 0 ? idMap.get(id) : id);

        const key = (row) => `${realFamilyId(row.family_id)}:${row.person_id}`;
        const originalChildren = new Map(this.original.children.map((row) => [`${row.family_id}:${row.person_id}`, row]));
        const nextChildren = new Map(this.rows.children.map((row) => [key(row), row]));
        for (const [childKey, row] of originalChildren.entries()) {
            if (!nextChildren.has(childKey) && !this.deletedFamilies.has(row.family_id)) {
                await connection.query('DELETE FROM children WHERE family_id = ? AND person_id = ?', [row.family_id, row.person_id]);
            }
        }
        for (const [childKey, row] of nextChildren.entries()) {
            const familyId = realFamilyId(row.family_id);
            const before = originalChildren.get(childKey);
            const primary = Number(row.is_primary_lineage) === 1 ? 1 : 0;
            if (!before) {
                await connection.query(
                    'INSERT INTO children (family_id, person_id, sort_order, child_type, is_primary_lineage) VALUES (?, ?, ?, ?, ?)',
                    [familyId, row.person_id, Number(row.sort_order) || 0, row.child_type || 'biological', primary]
                );
            } else if (
                Number(before.sort_order) !== Number(row.sort_order)
                || before.child_type !== row.child_type
                || Number(before.is_primary_lineage ?? 1) !== primary
            ) {
                await connection.query(
                    'UPDATE children SET sort_order = ?, child_type = ?, is_primary_lineage = ? WHERE family_id = ? AND person_id = ?',
                    [Number(row.sort_order) || 0, row.child_type || 'biological', primary, familyId, row.person_id]
                );
            }
        }

        const generationChanges = evaluation?.generationChanges || [];
        for (let index = 0; index < generationChanges.length; index += 400) {
            const chunk = generationChanges.slice(index, index + 400);
            await connection.query(
                `UPDATE people SET generation = CASE id ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (${chunk.map(() => '?').join(',')})`,
                [...chunk.flatMap((change) => [change.personId, change.to]), ...chunk.map((change) => change.personId)]
            );
        }

        const confirmed = evaluation?.confirm || [];
        for (const issue of confirmed) {
            const familyId = issue.familyId ? realFamilyId(issue.familyId) : null;
            await connection.query(
                `INSERT INTO genealogy_relation_overrides
                 (clan_id, account_id, action, issue_code, issue_key, severity, message, person_ids, family_id, reason, source_type, source_note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    this.clanId,
                    accountId,
                    action,
                    issue.code,
                    core.issueKey({ ...issue, familyId }).slice(0, 255),
                    issue.severity,
                    issue.message,
                    JSON.stringify(issue.personIds || []),
                    familyId,
                    normalizeOptionalText(reason),
                    normalizeSourceType(sourceType),
                    normalizeOptionalText(sourceNote),
                ]
            );
        }

        return {
            familyIdMap: idMap,
            realFamilyId,
            generationChanges,
            notices: evaluation?.notices || [],
        };
    }
}

const defaultFamilyValue = (key) => {
    if (key === 'relationship_status') return 'active';
    if (key === 'union_type') return 'marriage';
    if (key === 'visibility') return 'public';
    if (key === 'marriage_date_precision' || key === 'ended_at_precision') return 'exact';
    return null;
};

const isPool = (connection) => typeof connection?.getConnection === 'function';

// Chạy fn trong transaction. Nếu đã truyền vào một kết nối đang trong transaction thì dùng luôn.
const withRelationTransaction = async (connection, fn) => {
    const base = connection || db;
    if (!isPool(base)) return fn(base);
    const conn = await base.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (error) {
        try {
            await conn.rollback();
        } catch (_) { /* bỏ qua lỗi rollback */ }
        throw error;
    } finally {
        conn.release();
    }
};

// Đọc các tùy chọn xác nhận từ body request.
const readOverrideOptions = (body = {}, user = null, permissionScope = 'all') => ({
    force: normalizeFlag(body.forceSaveHistoricalRelation ?? body.force_save_historical_relation),
    reason: normalizeOptionalText(body.historicalOverrideReason ?? body.override_reason ?? body.relation_override_reason),
    sourceType: normalizeSourceType(body.override_source_type ?? body.source_type),
    sourceNote: normalizeOptionalText(body.override_source_note ?? body.source_note),
    accountId: user?.id || null,
    allowSensitive: permissionScope === 'all' && [1, 2].includes(Number(user?.role_id)),
});

// Đánh giá rồi ghi; ném RelationError nếu bị chặn hoặc cần xác nhận.
const evaluateAndCommit = async (draft, options = {}, action = 'relation_change') => {
    const evaluation = draft.evaluate(options);
    if (!evaluation.ok) throw new RelationError(evaluation);
    if (options.dryRun) return { ...evaluation, dryRun: true };
    const committed = await draft.commit({
        evaluation,
        accountId: options.accountId,
        action,
        reason: options.reason,
        sourceType: options.sourceType,
        sourceNote: options.sourceNote,
    });
    return { ...evaluation, ...committed };
};

const relationResultPayload = (result) => ({
    success: false,
    ok: false,
    level: result?.level || 'error',
    code: result?.code || 'RELATION_VALIDATION_ERROR',
    requiresConfirmation: Boolean(result?.requiresConfirmation),
    reasonRequired: Boolean(result?.reasonRequired),
    message: result?.message || 'Quan hệ gia phả không hợp lệ',
    issues: (result?.blocking?.length ? result.blocking : result?.confirm || []).map(publicIssue),
});

const publicIssue = (issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    person_ids: issue.personIds || [],
    family_id: issue.familyId || null,
    historical: issue.historical ?? null,
    sensitive: Boolean(issue.sensitive),
});

const successExtras = (result) => ({
    notices: (result?.notices || []).map(publicIssue),
    generation_changes: (result?.generationChanges || []).map((change) => ({
        person_id: change.personId,
        from: change.from,
        to: change.to,
    })),
});

module.exports = {
    RelationDraft,
    RelationError,
    loadClanRows,
    withRelationTransaction,
    evaluateAndCommit,
    readOverrideOptions,
    relationResultPayload,
    successExtras,
    publicIssue,
    toIsoDate,
    normalizeSourceType,
    failure,
};
