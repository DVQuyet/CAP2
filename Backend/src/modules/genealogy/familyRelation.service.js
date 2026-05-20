const {
    db,
    parseNullableId,
    parseChildrenIds,
    hasDuplicateIds,
} = require('../manager/common.service');
const {
    validateChildAgainstParents,
    validateFamilyParents,
} = require('./familyValidation.service');
const {
    normalizeForceFlag,
    validateSpouseKinshipConflict,
} = require('./kinshipValidation.service');

let hasEnsuredPeopleTreeLayoutColumns = false;
let hasEnsuredFamilyRelationshipColumns = false;

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

const ensureFamilyRelationshipColumns = async(connection = db) => {
    if (hasEnsuredFamilyRelationshipColumns && connection === db) return;

    const [columns] = await connection.query(
        `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'families'
          AND COLUMN_NAME IN ('relationship_status', 'ended_at', 'relation_note')
        `
    );
    const existing = new Set(columns.map((row) => row.COLUMN_NAME));
    const missing = [
        ['relationship_status', "ENUM('active','divorced','widowed') NOT NULL DEFAULT 'active'"],
        ['ended_at', 'DATE NULL'],
        ['relation_note', 'TEXT NULL'],
    ].filter(([name]) => !existing.has(name));

    for (const [name, definition] of missing) {
        await connection.query(`ALTER TABLE families ADD COLUMN ${name} ${definition}`);
    }

    if (connection === db) hasEnsuredFamilyRelationshipColumns = true;
};

const ensurePeopleExist = async(ids) => {
    if (!ids || ids.length === 0) return true;
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(`SELECT id FROM people WHERE id IN (${placeholders})`, ids);
    return rows.length === ids.length;
};

const normalizeRelationshipStatus = (value) => {
    const status = String(value || 'active').trim().toLowerCase();
    return ['active', 'divorced', 'widowed'].includes(status) ? status : 'active';
};

const normalizeOptionalDate = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    return text || null;
};

const normalizeOptionalText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
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
            marriage_date: family.marriage_date,
            ended_at: family.ended_at,
            relation_note: family.relation_note,
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
            f.marriage_date,
            f.ended_at,
            f.relation_note
        FROM families f
        LEFT JOIN people sp
          ON sp.id = CASE WHEN f.father_id = ? THEN f.mother_id ELSE f.father_id END
        WHERE f.father_id = ? OR f.mother_id = ?
        ORDER BY f.relationship_status = 'active' DESC, f.id DESC
        `,
        [personId, personId, personId, personId]
    );
    if (!familyRows.length) return [];

    const familyIds = familyRows.map((row) => row.family_id);
    const [childRows] = await connection.query(
        `
        SELECT
            c.family_id,
            c.person_id,
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

const validateCanCreateOrUpdateSpouse = async({
    connection = db,
    clanId,
    personId,
    spouseId,
    excludeFamilyId = null,
    forceSaveHistoricalRelation = false,
}) => {
    const nextPersonId = parseNullableId(personId);
    const nextSpouseId = parseNullableId(spouseId);
    if (!nextPersonId || !nextSpouseId) return { ok: true };
    if (nextPersonId === nextSpouseId) {
        return { ok: false, message: 'Vo/chong khong the trung voi chinh thanh vien.' };
    }

    const [people] = await connection.query(
        `SELECT id, clan_id, display_name, surname, middle_name, first_name FROM people WHERE id IN (?, ?)`,
        [nextPersonId, nextSpouseId]
    );
    if (
        people.length !== 2 ||
        people.some((person) => Number(person.clan_id) !== Number(clanId))
    ) {
        return { ok: false, message: 'Vo/chong phai la nguoi trong cung dong ho.' };
    }

    const personActive = await getActiveSpouseFamily(connection, clanId, nextPersonId, excludeFamilyId);
    if (personActive && Number(personActive.spouse_id) !== Number(nextSpouseId)) {
        return {
            ok: false,
            level: 'error',
            code: 'PERSON_ALREADY_HAS_ACTIVE_SPOUSE',
            message: 'Thanh vien dang co vo/chong active con song, khong the them vo/chong moi.',
        };
    }

    const spouseActive = await getActiveSpouseFamily(connection, clanId, nextSpouseId, excludeFamilyId);
    if (spouseActive && Number(spouseActive.spouse_id) !== Number(nextPersonId)) {
        return {
            ok: false,
            level: 'error',
            code: 'SPOUSE_ALREADY_HAS_ACTIVE_SPOUSE',
            message: 'Nguoi duoc chon dang co vo/chong active con song, khong the them quan he moi.',
        };
    }

    const kinshipValidation = await validateSpouseKinshipConflict({
        connection,
        clanId,
        personId: nextPersonId,
        spouseId: nextSpouseId,
        forceSaveHistoricalRelation,
        excludeFamilyId,
        skipSpouseUniqueness: true,
    });
    if (!kinshipValidation.ok) return kinshipValidation;

    return { ok: true };
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
        marriage_date: family.marriage_date || null,
        ended_at: family.ended_at || null,
        relation_note: family.relation_note || null,
        children_ids: family.children_ids || [],
        children: family.children || [],
        families,
        marriages: families,
    };
};

const getChildBloodline = async(personId) => {
    if (!personId) return null;
    const [rows] = await db.query(
        `
      SELECT c.family_id, f.father_id AS parent_father_id, f.mother_id AS parent_mother_id
      FROM children c
      INNER JOIN families f ON c.family_id = f.id
      WHERE c.person_id = ?
      ORDER BY c.id ASC
      LIMIT 1
    `, [personId]
    );
    return rows[0] || null;
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

async function applyBloodlineForPerson(targetPersonId, clanId, parentFatherId, parentMotherId, connection = db, options = {}) {
    const forceSaveHistoricalRelation = normalizeForceFlag(options.forceSaveHistoricalRelation);
    if (!parentFatherId && !parentMotherId) {
        return {
            ok: false,
            message: 'Chỉ định huyết thống cần ít nhất ID cha hoặc mẹ (people.id)',
        };
    }

    if (targetPersonId === parentFatherId || targetPersonId === parentMotherId) {
        return {
            ok: false,
            message: 'Thành viên không thể là cha/mẹ của chính mình',
        };
    }

    const childValidation = await validateChildAgainstParents({
        connection,
        clanId,
        childId: targetPersonId,
        fatherId: parentFatherId,
        motherId: parentMotherId,
        forceSaveHistoricalRelation,
    });
    if (!childValidation.ok) return childValidation;

    const [existingBloodlineRows] = await connection.query(
        `
        SELECT c.family_id
        FROM children c
        INNER JOIN families f ON f.id = c.family_id
        WHERE c.person_id = ?
          AND f.clan_id = ?
          AND (f.father_id <=> ?)
          AND (f.mother_id <=> ?)
        LIMIT 1
        `,
        [targetPersonId, clanId, parentFatherId || null, parentMotherId || null]
    );
    if (existingBloodlineRows.length) {
        return {
            ok: false,
            level: 'error',
            code: 'DUPLICATE_PARENT_CHILD',
            message: 'Không được tạo duplicate parent-child.',
        };
    }

    await connection.query(
        'DELETE FROM children WHERE person_id = ?', [targetPersonId]
    );

    const [existing] = await connection.query(
        `
        SELECT id
        FROM families
        WHERE clan_id = ?
          AND (father_id <=> ?)
          AND (mother_id <=> ?)
        LIMIT 1
        `, [clanId, parentFatherId, parentMotherId]
    );

    let familyId;

    if (existing.length > 0) {
        familyId = existing[0].id;
    } else {
        const [insertResult] = await connection.query(
            `
            INSERT INTO families (clan_id, father_id, mother_id)
            VALUES (?, ?, ?)
            `, [clanId, parentFatherId, parentMotherId]
        );

        familyId = insertResult.insertId;
    }

    await connection.query(
        `
        INSERT INTO children (family_id, person_id, sort_order)
        VALUES (?, ?, 0)
        `, [familyId, targetPersonId]
    );

    if (childValidation.childGeneration) {
        await connection.query('UPDATE people SET generation = ? WHERE id = ?', [
            childValidation.childGeneration,
            targetPersonId,
        ]);
    }

    return { ok: true };
}

async function applyMarriageRelationsForPersonV2(context, body) {
    const connection = context?.connection || db;
    const forceSaveHistoricalRelation = normalizeForceFlag(body?.forceSaveHistoricalRelation || context?.forceSaveHistoricalRelation);
    const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);
    const familyIdInput = parseNullableId(body?.family_id);
    const spouseId = parseNullableId(body?.spouse_id);
    const childrenIds = parseChildrenIds(body?.children_ids);
    const hasFamilyField = has('family_id');
    const hasSpouseField = has('spouse_id');
    const hasChildrenField = has('children_ids');
    const hasMarriageDateField = has('marriage_date');
    const hasStatusField = has('relationship_status');
    const hasEndedAtField = has('ended_at');
    const hasNoteField = has('relation_note');
    const relationshipStatus = normalizeRelationshipStatus(body?.relationship_status);
    const marriageDate = normalizeOptionalDate(body?.marriage_date);
    const endedAt = normalizeOptionalDate(body?.ended_at);
    const relationNote = normalizeOptionalText(body?.relation_note);

    await ensureFamilyRelationshipColumns(connection);

    if (hasChildrenField && hasDuplicateIds(body?.children_ids)) {
        return { ok: false, level: 'error', code: 'DUPLICATE_CHILD_IN_FAMILY', message: 'Khong duoc them trung con trong cung mot gia dinh.' };
    }

    const relationIdsToValidate = [spouseId, ...childrenIds].filter((value) => value !== null);
    const allRelationsOk = await ensurePeopleExist(relationIdsToValidate);
    if (!allRelationsOk) {
        return { ok: false, message: 'Mot hoac nhieu ID quan he khong ton tai trong bang people.' };
    }

    const personId = parseNullableId(context?.person_id);
    if (!personId || !context?.clan_id) {
        return { ok: false, message: 'Khong xac dinh duoc thanh vien hoac dong ho.' };
    }
    if (spouseId !== null && spouseId === personId) {
        return { ok: false, message: 'Vo/chong khong the trung voi chinh thanh vien.' };
    }

    let targetFamily = null;
    let selfFamilyId = familyIdInput || null;
    if (hasFamilyField && familyIdInput) {
        const [familyRows] = await connection.query(
            'SELECT id, clan_id, father_id, mother_id, marriage_date, relationship_status, ended_at, relation_note FROM families WHERE id = ? LIMIT 1',
            [familyIdInput]
        );
        if (!familyRows.length) return { ok: false, message: 'Khong tim thay family can cap nhat.' };
        targetFamily = familyRows[0];
        if (Number(targetFamily.clan_id) !== Number(context.clan_id)) {
            return { ok: false, message: 'Family khong thuoc cung dong ho.' };
        }
        if (Number(targetFamily.father_id) !== Number(personId) && Number(targetFamily.mother_id) !== Number(personId)) {
            return { ok: false, message: 'Thanh vien khong phai cha/me trong family nay.' };
        }
    }

    if (hasSpouseField && spouseId === null && !targetFamily && !familyIdInput) {
        const [familyRows] = await connection.query(
            `
            SELECT id, clan_id, father_id, mother_id, marriage_date, relationship_status, ended_at, relation_note
            FROM families
            WHERE clan_id = ?
              AND (father_id = ? OR mother_id = ?)
              AND father_id IS NOT NULL
              AND mother_id IS NOT NULL
            ORDER BY relationship_status = 'active' DESC, id DESC
            LIMIT 1
            `,
            [context.clan_id, personId, personId]
        );
        if (familyRows.length) {
            targetFamily = familyRows[0];
            selfFamilyId = targetFamily.id;
        }
    }

    let spouseRow = null;
    const currentSpouseId = targetFamily
        ? Number(targetFamily.father_id) === Number(personId)
            ? parseNullableId(targetFamily.mother_id)
            : parseNullableId(targetFamily.father_id)
        : null;
    const effectiveSpouseId = hasSpouseField ? spouseId : currentSpouseId;
    const isSpouseUnlinkOnly =
        hasSpouseField &&
        spouseId === null &&
        !hasMarriageDateField &&
        !hasStatusField &&
        !hasEndedAtField &&
        !hasNoteField &&
        (!hasChildrenField || childrenIds.length === 0);
    if (isSpouseUnlinkOnly && !targetFamily) {
        return { ok: true, family_id: null };
    }

    if (effectiveSpouseId) {
        const [spouseRows] = await connection.query('SELECT id, clan_id, gender FROM people WHERE id = ? LIMIT 1', [effectiveSpouseId]);
        if (!spouseRows.length || Number(spouseRows[0].clan_id) !== Number(context.clan_id)) {
            return { ok: false, message: 'Vo/chong phai cung dong ho voi thanh vien.' };
        }
        spouseRow = spouseRows[0];
    }

    for (const childId of childrenIds) {
        const [childRows] = await connection.query('SELECT clan_id FROM people WHERE id = ? LIMIT 1', [childId]);
        if (!childRows.length || Number(childRows[0].clan_id) !== Number(context.clan_id)) {
            return { ok: false, message: 'Danh sach con phai la nguoi cung dong ho.' };
        }
    }

    const contextGender = Number(context.gender);
    const spouseGender = Number(spouseRow?.gender);
    let familyFatherId = targetFamily?.father_id || null;
    let familyMotherId = targetFamily?.mother_id || null;
    if (hasSpouseField || !targetFamily) {
        if (contextGender === 1) {
            familyFatherId = personId;
            familyMotherId = effectiveSpouseId;
        } else if (contextGender === 2) {
            familyFatherId = effectiveSpouseId;
            familyMotherId = personId;
        } else if (spouseGender === 1) {
            familyFatherId = effectiveSpouseId;
            familyMotherId = personId;
        } else if (spouseGender === 2) {
            familyFatherId = personId;
            familyMotherId = effectiveSpouseId;
        } else {
            familyFatherId = personId;
            familyMotherId = effectiveSpouseId;
        }
    }

    const nextStatus = hasStatusField ? relationshipStatus : (targetFamily?.relationship_status || 'active');
    if (effectiveSpouseId && nextStatus === 'active') {
        const spouseValidation = await validateCanCreateOrUpdateSpouse({
            connection,
            clanId: context.clan_id,
            personId,
            spouseId: effectiveSpouseId,
            excludeFamilyId: selfFamilyId,
            forceSaveHistoricalRelation,
        });
        if (!spouseValidation.ok) return spouseValidation;
    }
    if (effectiveSpouseId && nextStatus !== 'active') {
        const kinshipValidation = await validateSpouseKinshipConflict({
            connection,
            clanId: context.clan_id,
            personId,
            spouseId: effectiveSpouseId,
            forceSaveHistoricalRelation,
            skipSpouseUniqueness: true,
        });
        if (!kinshipValidation.ok) return kinshipValidation;
    }

    if (hasChildrenField && childrenIds.length > 0) {
        for (const childId of childrenIds) {
            const childValidation = await validateChildAgainstParents({
                connection,
                clanId: context.clan_id,
                childId,
                fatherId: familyFatherId,
                motherId: familyMotherId,
                forceSaveHistoricalRelation,
            });
            if (!childValidation.ok) return childValidation;
        }
    }

    const needsFamilyRow =
        hasSpouseField ||
        hasMarriageDateField ||
        hasStatusField ||
        hasEndedAtField ||
        hasNoteField ||
        (hasChildrenField && childrenIds.length > 0);

    if (needsFamilyRow) {
        if (!familyFatherId && !familyMotherId) {
            return { ok: false, message: 'Can co vo/chong hoac family de cap nhat quan he.' };
        }

        const familyValidation = await validateFamilyParents({
            connection,
            clanId: context.clan_id,
            fatherId: familyFatherId,
            motherId: familyMotherId,
            excludeFamilyId: selfFamilyId,
        });
        if (!familyValidation.ok) {
            if (!(isSpouseUnlinkOnly && familyValidation.code === 'DUPLICATE_SPOUSE_FAMILY')) {
                return familyValidation;
            }
        }

        if (!selfFamilyId) {
            const [createdFamily] = await connection.query(
                `INSERT INTO families
                 (clan_id, father_id, mother_id, marriage_date, relationship_status, ended_at, relation_note)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    context.clan_id,
                    familyFatherId,
                    familyMotherId,
                    hasMarriageDateField ? marriageDate : null,
                    hasStatusField ? relationshipStatus : 'active',
                    hasEndedAtField ? endedAt : null,
                    hasNoteField ? relationNote : null,
                ]
            );
            selfFamilyId = createdFamily.insertId;
        } else {
            const updates = ['father_id = ?', 'mother_id = ?'];
            const params = [familyFatherId, familyMotherId];
            if (hasMarriageDateField) {
                updates.push('marriage_date = ?');
                params.push(marriageDate);
            }
            if (hasStatusField) {
                updates.push('relationship_status = ?');
                params.push(relationshipStatus);
            }
            if (hasEndedAtField) {
                updates.push('ended_at = ?');
                params.push(endedAt);
            }
            if (hasNoteField) {
                updates.push('relation_note = ?');
                params.push(relationNote);
            }
            params.push(selfFamilyId);
            await connection.query(`UPDATE families SET ${updates.join(', ')} WHERE id = ?`, params);
        }
    }

    if (hasChildrenField && !selfFamilyId) {
        return { ok: false, message: 'Vui long chon gia dinh/cap cha me de them con.' };
    }

    if (selfFamilyId && hasChildrenField) {
        const [familyRows] = await connection.query(
            'SELECT id, clan_id, father_id, mother_id FROM families WHERE id = ? LIMIT 1',
            [selfFamilyId]
        );
        const childFamily = familyRows[0];
        if (!childFamily) return { ok: false, message: 'Khong tim thay family de cap nhat con.' };

        for (const childId of childrenIds) {
            const childValidation = await validateChildAgainstParents({
                connection,
                clanId: context.clan_id,
                childId,
                fatherId: childFamily.father_id,
                motherId: childFamily.mother_id,
                forceSaveHistoricalRelation,
            });
            if (!childValidation.ok) return childValidation;
        }

        await connection.query('DELETE FROM children WHERE family_id = ?', [selfFamilyId]);
        for (const childId of childrenIds) {
            const childValidation = await validateChildAgainstParents({
                connection,
                clanId: context.clan_id,
                childId,
                fatherId: childFamily.father_id,
                motherId: childFamily.mother_id,
                forceSaveHistoricalRelation,
            });
            if (childValidation.childGeneration) {
                await connection.query('UPDATE people SET generation = ? WHERE id = ?', [
                    childValidation.childGeneration,
                    childId,
                ]);
            }
            await connection.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 0)', [
                selfFamilyId,
                childId,
            ]);
        }
    }

    return { ok: true, family_id: selfFamilyId };
}

module.exports = {
    hasEnsuredPeopleTreeLayoutColumns,
    ensurePeopleTreeLayoutColumns,
    ensureFamilyRelationshipColumns,
    ensurePeopleExist,
    getFamiliesForPerson,
    getActiveSpouseFamily,
    validateCanCreateOrUpdateSpouse,
    getOwnedFamilyRelations,
    getChildBloodline,
    buildManagedFamilyTree,
    applyBloodlineForPerson,
    applyMarriageRelationsForPerson: applyMarriageRelationsForPersonV2,
};
