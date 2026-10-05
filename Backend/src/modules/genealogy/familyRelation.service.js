const {
    db,
    parseNullableId,
    hasDuplicateIds,
} = require('../manager/common.service');
const { ensureGenealogySchema } = require('./genealogySchema.service');
const {
    RelationDraft,
    RelationError,
    evaluateAndCommit,
    readOverrideOptions,
    withRelationTransaction,
    failure,
} = require('./relationCommand.service');

let hasEnsuredPeopleTreeLayoutColumns = false;

const ensurePeopleTreeLayoutColumns = async() => {
    if (hasEnsuredPeopleTreeLayoutColumns) return;

    const [columns] = await db.query(
        `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'people'
          AND COLUMN_NAME IN ('tree_x', 'tree_y', 'display_order')
        `
    );
    const existing = new Set(columns.map((row) => row.COLUMN_NAME));
    const missing = [
        ['tree_x', 'INT DEFAULT 0'],
        ['tree_y', 'INT DEFAULT 0'],
        ['display_order', 'INT DEFAULT 0'],
    ].filter(([name]) => !existing.has(name));

    for (const [name, definition] of missing) {
        await db.query(`ALTER TABLE people ADD COLUMN ${name} ${definition}`);
    }

    hasEnsuredPeopleTreeLayoutColumns = true;
};

// Giữ tên cũ: đảm bảo toàn bộ cột của mô hình quan hệ (trạng thái, loại hôn nhân, loại con...).
const ensureFamilyRelationshipColumns = async(connection = db) => {
    await ensureGenealogySchema(connection);
};

const ensurePeopleExist = async(ids) => {
    if (!ids || ids.length === 0) return true;
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(`SELECT id FROM people WHERE id IN (${placeholders})`, ids);
    return rows.length === ids.length;
};

const normalizeChildPersonId = (value) => {
    if (value && typeof value === 'object') {
        return parseNullableId(value.person_id ?? value.id);
    }
    return parseNullableId(value);
};

const normalizeChildMap = (value, readItem) => {
    const map = new Map();
    if (!value) return map;
    if (Array.isArray(value)) {
        value.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const personId = normalizeChildPersonId(item);
            const entry = readItem(item);
            if (personId && entry !== undefined) map.set(personId, entry);
        });
        return map;
    }
    if (typeof value === 'object') {
        Object.entries(value).forEach(([key, raw]) => {
            const personId = parseNullableId(key);
            const entry = readItem(raw);
            if (personId && entry !== undefined) map.set(personId, entry);
        });
    }
    return map;
};

const readOrder = (item) => {
    const raw = item && typeof item === 'object' ? item.sort_order ?? item.child_order ?? item.order : item;
    const order = Number(raw);
    return Number.isFinite(order) ? Math.max(0, Math.round(order)) : undefined;
};

const readChildType = (item) => {
    const raw = item && typeof item === 'object' ? item.child_type ?? item.childType : item;
    return raw ? String(raw) : undefined;
};

const normalizeChildRelationItems = (childrenValue, orderValue, typeValue) => {
    const orderMap = normalizeChildMap(orderValue, readOrder);
    const typeMap = normalizeChildMap(typeValue, readChildType);
    const values = Array.isArray(childrenValue)
        ? childrenValue
        : typeof childrenValue === 'string'
            ? childrenValue.split(',').map((item) => item.trim()).filter(Boolean)
            : childrenValue === undefined || childrenValue === null || childrenValue === ''
                ? []
                : [childrenValue];
    const seen = new Set();
    const items = [];

    values.forEach((item, index) => {
        const personId = normalizeChildPersonId(item);
        if (!personId || seen.has(personId)) return;
        seen.add(personId);
        const itemOrder = item && typeof item === 'object' ? readOrder(item) : undefined;
        const itemType = item && typeof item === 'object' ? readChildType(item) : undefined;
        items.push({
            person_id: personId,
            sort_order: itemOrder ?? orderMap.get(personId) ?? index + 1,
            child_type: itemType ?? typeMap.get(personId),
        });
    });

    return items;
};

const hasDuplicateChildRelationItems = (childrenValue) => {
    const values = Array.isArray(childrenValue)
        ? childrenValue
        : typeof childrenValue === 'string'
            ? childrenValue.split(',').map((item) => item.trim()).filter(Boolean)
            : childrenValue === undefined || childrenValue === null || childrenValue === ''
                ? []
                : [childrenValue];
    const ids = values.map(normalizeChildPersonId).filter(Boolean);
    return new Set(ids).size !== ids.length;
};

const personLabel = (person) => {
    if (!person) return null;
    const display = String(person.display_name || '').trim();
    if (display) return display;
    return [person.surname, person.middle_name, person.first_name]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ') || `Ho so #${person.id}`;
};

const mapFamilyRelationRows = (familyRows, childRows) => {
    const childrenByFamily = new Map();
    for (const child of childRows) {
        const familyId = Number(child.family_id);
        if (!childrenByFamily.has(familyId)) childrenByFamily.set(familyId, []);
        childrenByFamily.get(familyId).push({
            id: child.person_id,
            person_id: child.person_id,
            sort_order: child.sort_order,
            child_order: child.sort_order,
            child_type: child.child_type || 'biological',
            is_primary_lineage: child.is_primary_lineage === undefined ? 1 : Number(child.is_primary_lineage),
            display_name: personLabel(child),
            name: personLabel(child),
        });
    }

    return familyRows.map((family) => {
        const children = childrenByFamily.get(Number(family.family_id)) || [];
        return {
            family_id: family.family_id,
            id: family.family_id,
            clan_id: family.clan_id,
            father_id: family.father_id,
            mother_id: family.mother_id,
            spouse_id: family.spouse_id || null,
            spouse_name: personLabel({
                id: family.spouse_id,
                display_name: family.spouse_display_name,
                surname: family.spouse_surname,
                middle_name: family.spouse_middle_name,
                first_name: family.spouse_first_name,
            }),
            spouse_is_living: family.spouse_is_living,
            spouse_death_date: family.spouse_death_date,
            relationship_status: family.relationship_status || 'active',
            union_type: family.union_type || 'marriage',
            wife_rank: family.wife_rank ?? null,
            husband_rank: family.husband_rank ?? null,
            marriage_date: family.marriage_date,
            marriage_date_precision: family.marriage_date_precision || 'exact',
            ended_at: family.ended_at,
            ended_at_precision: family.ended_at_precision || 'exact',
            relation_note: family.relation_note,
            source_type: family.source_type || null,
            source_note: family.source_note || null,
            visibility: family.visibility || 'public',
            children_ids: children.map((child) => child.person_id),
            children,
        };
    });
};

const getFamiliesForPerson = async(personId, connection = db) => {
    if (!personId) return [];
    await ensureFamilyRelationshipColumns(connection);
    const [familyRows] = await connection.query(
        `
        SELECT
            f.id AS family_id,
            f.clan_id,
            f.father_id,
            f.mother_id,
            CASE WHEN f.father_id = ? THEN f.mother_id ELSE f.father_id END AS spouse_id,
            sp.display_name AS spouse_display_name,
            sp.surname AS spouse_surname,
            sp.middle_name AS spouse_middle_name,
            sp.first_name AS spouse_first_name,
            sp.is_living AS spouse_is_living,
            sp.death_date AS spouse_death_date,
            f.relationship_status,
            f.union_type,
            f.wife_rank,
            f.husband_rank,
            f.marriage_date,
            f.marriage_date_precision,
            f.ended_at,
            f.ended_at_precision,
            f.relation_note,
            f.source_type,
            f.source_note,
            f.visibility
        FROM families f
        LEFT JOIN people sp
          ON sp.id = CASE WHEN f.father_id = ? THEN f.mother_id ELSE f.father_id END
        WHERE f.father_id = ? OR f.mother_id = ?
        ORDER BY f.relationship_status = 'active' DESC,
                 COALESCE(CASE WHEN f.father_id = ? THEN f.wife_rank ELSE f.husband_rank END, 255),
                 f.id DESC
        `,
        [personId, personId, personId, personId, personId]
    );
    if (!familyRows.length) return [];

    const familyIds = familyRows.map((row) => row.family_id);
    const [childRows] = await connection.query(
        `
        SELECT
            c.family_id,
            c.person_id,
            c.sort_order,
            c.child_type,
            c.is_primary_lineage,
            p.display_name,
            p.surname,
            p.middle_name,
            p.first_name
        FROM children c
        INNER JOIN people p ON p.id = c.person_id
        WHERE c.family_id IN (${familyIds.map(() => '?').join(',')})
        ORDER BY c.family_id, c.sort_order, c.id
        `,
        familyIds
    );

    return mapFamilyRelationRows(familyRows, childRows);
};

const getActiveSpouseFamily = async(connection = db, clanId, personId, excludeFamilyId = null) => {
    if (!personId) return null;
    await ensureFamilyRelationshipColumns(connection);
    const [rows] = await connection.query(
        `
        SELECT
            f.id AS family_id,
            CASE WHEN f.father_id = ? THEN f.mother_id ELSE f.father_id END AS spouse_id,
            sp.display_name AS spouse_display_name,
            sp.surname AS spouse_surname,
            sp.middle_name AS spouse_middle_name,
            sp.first_name AS spouse_first_name
        FROM families f
        INNER JOIN people sp
          ON sp.id = CASE WHEN f.father_id = ? THEN f.mother_id ELSE f.father_id END
        WHERE f.clan_id = ?
          AND (f.father_id = ? OR f.mother_id = ?)
          AND f.relationship_status = 'active'
          AND (? IS NULL OR f.id <> ?)
          AND sp.id IS NOT NULL
          AND sp.is_living = 1
          AND sp.death_date IS NULL
        ORDER BY f.id DESC
        LIMIT 1
        `,
        [personId, personId, clanId, personId, personId, excludeFamilyId, excludeFamilyId]
    );
    return rows[0] || null;
};

const getOwnedFamilyRelations = async(personId) => {
    if (!personId) {
        return { family_id: null, spouse_id: null, children_ids: [], families: [], marriages: [] };
    }

    const families = await getFamiliesForPerson(personId);
    const family =
        families.find((item) =>
            item.relationship_status === 'active' &&
            item.spouse_id &&
            Number(item.spouse_is_living) === 1 &&
            !item.spouse_death_date
        ) ||
        families[0] ||
        null;
    if (!family) {
        return { family_id: null, spouse_id: null, children_ids: [], families: [], marriages: [] };
    }

    return {
        family_id: family.family_id,
        spouse_id: family.spouse_id || null,
        spouse_name: family.spouse_name || null,
        relationship_status: family.relationship_status || 'active',
        union_type: family.union_type || 'marriage',
        marriage_date: family.marriage_date || null,
        ended_at: family.ended_at || null,
        relation_note: family.relation_note || null,
        children_ids: family.children_ids || [],
        children: family.children || [],
        families,
        marriages: families,
    };
};

// Cha mẹ của một người: ưu tiên cha mẹ ruột, kèm danh sách mọi gia đình cha mẹ (nuôi, thừa tự...).
const getChildBloodline = async(personId) => {
    if (!personId) return null;
    await ensureFamilyRelationshipColumns();
    const [rows] = await db.query(
        `
      SELECT c.family_id, c.child_type, c.is_primary_lineage, c.sort_order,
             f.father_id AS parent_father_id, f.mother_id AS parent_mother_id
      FROM children c
      INNER JOIN families f ON c.family_id = f.id
      WHERE c.person_id = ?
      ORDER BY c.child_type = 'biological' DESC, c.is_primary_lineage DESC, c.id ASC
    `, [personId]
    );
    if (!rows.length) return null;
    return {
        ...rows[0],
        parent_families: rows,
    };
};

const buildManagedFamilyTree = (peopleRows, familyRows, childRows) => {
    const peopleMap = new Map(peopleRows.map((p) => [p.id, p]));
    const childrenByFamily = new Map();
    for (const row of childRows) {
        if (!childrenByFamily.has(row.family_id)) childrenByFamily.set(row.family_id, []);
        childrenByFamily.get(row.family_id).push(row.person_id);
    }

    const childrenByParent = new Map();
    const spouseByPrimary = new Map();
    for (const fam of familyRows) {
        const childIds = childrenByFamily.get(fam.id) || [];
        const parentId = fam.father_id || fam.mother_id;
        if (!parentId) continue;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        const list = childrenByParent.get(parentId);
        for (const childId of childIds) {
            if (!list.includes(childId)) list.push(childId);
        }
        if (childIds.length > 0 && fam.father_id && fam.mother_id) {
            spouseByPrimary.set(parentId, parentId === fam.father_id ? fam.mother_id : fam.father_id);
        }
    }

    const generations = peopleRows.map((p) => Number(p.generation)).filter((g) => Number.isFinite(g) && g > 0);
    const rootGeneration = generations.length ? Math.min(...generations) : 1;
    const rootCandidates = peopleRows.filter((p) => Number(p.generation || rootGeneration) === rootGeneration);
    const placed = new Set();

    const buildNode = (personId) => {
        const person = peopleMap.get(personId);
        if (!person || placed.has(personId)) return null;
        placed.add(personId);

        const spouseId = spouseByPrimary.get(personId);
        let spouse = null;
        if (spouseId && peopleMap.has(spouseId) && !placed.has(spouseId)) {
            spouse = peopleMap.get(spouseId);
            placed.add(spouseId);
        }

        const children = [];
        for (const childId of childrenByParent.get(personId) || []) {
            const childNode = buildNode(childId);
            if (childNode) children.push(childNode);
        }
        return { person, spouse, children };
    };

    const roots = [];
    for (const root of rootCandidates) {
        const node = buildNode(root.id);
        if (node) roots.push(node);
    }
    for (const person of peopleRows) {
        const node = buildNode(person.id);
        if (node) roots.push(node);
    }

    return { roots };
};

const relationFailureFromError = (error) => {
    if (error instanceof RelationError) return { ok: false, ...error.relationResult };
    throw error;
};

// Đặt cha mẹ cho một người (mặc định là cha mẹ ruột; options.child_type để chọn con nuôi/thừa tự...).
// fatherId và motherId cùng rỗng: gỡ cha mẹ thuộc loại đó.
async function applyBloodlineForPerson(targetPersonId, clanId, parentFatherId, parentMotherId, connection = db, options = {}) {
    const personId = parseNullableId(targetPersonId);
    if (!personId) return failure('Không xác định được thành viên.');
    try {
        return await withRelationTransaction(connection, async (conn) => {
            const draft = await RelationDraft.load(conn, clanId);
            draft.setParents(personId, {
                fatherId: parentFatherId,
                motherId: parentMotherId,
                childType: options.child_type || 'biological',
                sortOrder: options.sort_order ?? options.child_order,
                isPrimary: options.is_primary_lineage === undefined || options.is_primary_lineage === null || options.is_primary_lineage === ''
                    ? undefined
                    : Number(options.is_primary_lineage) === 1 || options.is_primary_lineage === true,
            });
            const result = await evaluateAndCommit(
                draft,
                { ...readOverrideOptions(options, options.user, options.permissionScope), dryRun: options.dryRun },
                'set_parents'
            );
            return { ok: true, ...result };
        });
    } catch (error) {
        return relationFailureFromError(error);
    }
}

const MARRIAGE_FIELD_KEYS = [
    'marriage_date', 'marriage_date_precision', 'relationship_status', 'ended_at', 'ended_at_precision',
    'relation_note', 'union_type', 'wife_rank', 'husband_rank', 'source_type', 'source_note',
];

// Áp các thay đổi hôn nhân/con cho một người lên bản nháp (dùng chung cho các API).
const applyMarriageToDraft = (draft, context, body = {}) => {
    const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
    const personId = parseNullableId(context?.person_id);
    if (!personId) throw new RelationError(failure('Không xác định được thành viên hoặc dòng họ.'));
    const familyIdInput = parseNullableId(body.family_id);
    const spouseProvided = has('spouse_id') || has('spouse_person_id');
    const spouseId = spouseProvided ? parseNullableId(body.spouse_id ?? body.spouse_person_id) : undefined;
    const childrenProvided = has('children_ids') || has('children_person_ids');
    const childrenValue = body.children_ids ?? body.children_person_ids;
    const childItems = normalizeChildRelationItems(childrenValue, body.child_orders ?? body.children_orders, body.child_types);
    const fields = {};
    MARRIAGE_FIELD_KEYS.forEach((key) => { if (has(key)) fields[key] = body[key]; });

    if (childrenProvided && (hasDuplicateIds(childItems.map((item) => item.person_id)) || hasDuplicateChildRelationItems(childrenValue))) {
        throw new RelationError(failure('Không được thêm trùng con trong cùng một gia đình.', 'DUPLICATE_CHILD_IN_FAMILY'));
    }

    const unlinkOnly = spouseProvided && spouseId === null && !Object.keys(fields).length && (!childrenProvided || !childItems.length);
    if (unlinkOnly) {
        const family = familyIdInput
            ? draft.family(familyIdInput)
            : draft.rows.families
                .filter((row) => (row.father_id === personId || row.mother_id === personId) && row.father_id && row.mother_id)
                .sort((a, b) => (b.relationship_status === 'active') - (a.relationship_status === 'active') || b.id - a.id)[0];
        if (!family) return null;
        return draft.unlinkSpouse({ personId, familyId: family.id });
    }

    const needsFamily = spouseProvided || Object.keys(fields).length || (childrenProvided && childItems.length) || familyIdInput;
    if (!needsFamily) return null;

    const family = draft.upsertUnion({
        personId,
        spouseId,
        familyId: familyIdInput,
        fields,
    });
    if (childrenProvided) {
        draft.setFamilyChildren(family.id, childItems.map((item) => ({
            personId: item.person_id,
            sortOrder: item.sort_order,
            childType: item.child_type,
        })));
    }
    return family;
};

async function applyMarriageRelationsForPerson(context, body = {}) {
    const connection = context?.connection || db;
    if (!parseNullableId(context?.person_id) || !context?.clan_id) {
        return failure('Không xác định được thành viên hoặc dòng họ.');
    }
    try {
        return await withRelationTransaction(connection, async (conn) => {
            const draft = await RelationDraft.load(conn, context.clan_id);
            const family = applyMarriageToDraft(draft, context, body);
            const options = readOverrideOptions(
                { ...body, forceSaveHistoricalRelation: body?.forceSaveHistoricalRelation ?? context?.forceSaveHistoricalRelation },
                context?.user,
                context?.permissionScope
            );
            const result = await evaluateAndCommit(draft, { ...options, dryRun: context?.dryRun }, 'set_marriage');
            return {
                ok: true,
                ...result,
                family_id: family ? (result.realFamilyId ? result.realFamilyId(family.id) : family.id) : null,
            };
        });
    } catch (error) {
        return relationFailureFromError(error);
    }
}

module.exports = {
    hasEnsuredPeopleTreeLayoutColumns,
    ensurePeopleTreeLayoutColumns,
    ensureFamilyRelationshipColumns,
    ensurePeopleExist,
    getFamiliesForPerson,
    getActiveSpouseFamily,
    getOwnedFamilyRelations,
    getChildBloodline,
    buildManagedFamilyTree,
    normalizeChildRelationItems,
    applyMarriageToDraft,
    applyBloodlineForPerson,
    applyMarriageRelationsForPerson,
};
