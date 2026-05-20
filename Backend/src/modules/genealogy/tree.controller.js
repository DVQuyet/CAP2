const {
    assertTreeMutationPermission,
    bcrypt,
    buildDisplayNameFromPartsMgr,
    db,
    deletePersonCompletely,
    ensureCanAddAccount,
    ensureCanAddPerson,
    extractMediaIdFromUrl,
    fmtSqlDate,
    getMediaUrl,
    normalizeMediaId,
    parseNullableId,
    parseTreeInt,
    saveTreeLayoutSettings,
} = require('../manager/common.service');

const {
    applyBloodlineForPerson,
    applyMarriageRelationsForPerson,
    ensureFamilyRelationshipColumns,
    ensurePeopleTreeLayoutColumns,
    validateCanCreateOrUpdateSpouse,
} = require('./familyRelation.service');
const {
    assertCanDeleteTreePerson,
    validateChildAgainstParents,
    validateFamilyParents,
    validatePersonBirthDateWithRelations,
    validateProposedChildBirthAgainstParents,
    validateProposedParentBirthAgainstChildren,
    validatePersonLifeDates,
    validatePersonGenderWithFamilyRole,
    validatePersonGenerationWithRelations,
} = require('./familyValidation.service');
const {
    normalizeForceFlag,
    validateSpouseKinshipConflict,
} = require('./kinshipValidation.service');
const {
    assertCanManagePersonId,
    getManagerClanId,
    resolveManagedClanId,
} = require('../manager/managerClan.service');

const { ensureTreeLayoutSettingsTable } = require('../../shared/utils/treeLayoutSettings');
const { emitTreeUpdated } = require('../../socket/treeRealtime');

const relationHttpStatus = (result) => result?.requiresConfirmation ? 409 : 400;
const relationPayload = (result) => ({
    success: false,
    ok: false,
    level: result?.level || 'error',
    code: result?.code || 'RELATION_VALIDATION_ERROR',
    requiresConfirmation: Boolean(result?.requiresConfirmation),
    message: result?.message || 'Quan hệ gia phả không hợp lệ',
});
const relationErrorFromResult = (result) => {
    const err = new Error(result?.message || 'Quan hệ gia phả không hợp lệ');
    err.status = relationHttpStatus(result);
    err.relationResult = result;
    return err;
};

const normalizeFamilyRelationshipStatus = (value) => {
    const status = String(value || 'active').trim().toLowerCase();
    return ['active', 'divorced', 'widowed'].includes(status) ? status : 'active';
};


const parseRelationIdList = (value) => {
    if (Array.isArray(value)) {
        return value.map(parseNullableId).filter(Boolean);
    }
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') {
        return value.split(',').map(parseNullableId).filter(Boolean);
    }
    const single = parseNullableId(value);
    return single ? [single] : [];
};

const nullableText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
};


const createPerson = async (req, res) => {
    let connection;

    try {
        const permission = await assertTreeMutationPermission(req, {
            action: 'create_person',
        });

        if (!permission.ok) {
            return res.status(permission.status).json({
                success: false,
                message: permission.message,
            });
        }

        await ensurePeopleTreeLayoutColumns();

        const body = req.body || {};

        const {
            display_name,
            surname,
            middle_name,
            first_name,
            gender,
            birth_date,
            death_date,
            is_living,
            generation,
            branch,
            hometown,
            address,
            phone,
            email,
            avatar_url,
            avatar_media_id,
            bio,
            note,
            tree_x,
            tree_y,
            display_order,
            parent_father_id,
            parent_mother_id,
            father_person_id,
            mother_person_id,
            account_email,
            account_password,
        } = body;

        const clanId = await resolveManagedClanId(req, body);

        if (clanId == null) {
            return res.status(404).json({
                success: false,
                message: 'Không xác định được dòng họ cần quản lý',
            });
        }

        const personLimitCheck = await ensureCanAddPerson(clanId);

        if (!personLimitCheck.ok) {
            return res.status(personLimitCheck.status).json({
                success: false,
                code: personLimitCheck.code,
                message: personLimitCheck.message,
                billing: personLimitCheck.billing,
            });
        }

        const surnameValue = surname != null ? String(surname).trim() : '';
        const middleNameValue = middle_name != null ? String(middle_name).trim() : '';
        const firstNameValue = first_name != null ? String(first_name).trim() : '';
        const displayNameValue = String(
            display_name || buildDisplayNameFromPartsMgr(surnameValue, middleNameValue, firstNameValue)
        ).trim();

        if (!displayNameValue && !surnameValue && !firstNameValue) {
            return res.status(400).json({
                success: false,
                message: 'Cần nhập họ tên thành viên',
            });
        }

        let genderValue = null;

        if (gender !== undefined && gender !== null && String(gender).trim() !== '') {
            const parsedGender = Number(gender);
            genderValue = parsedGender === 1 || parsedGender === 2 ? parsedGender : null;
        }

        const generationNumber = Number(generation);
        const branchNumber =
            branch === undefined || branch === null || branch === ''
                ? null
                : Number(branch);

        const livingValue =
            is_living === undefined || is_living === null || is_living === ''
                ? 1
                : Number(is_living)
                    ? 1
                    : 0;

        const normalizedBirthDate = birth_date ? String(birth_date).trim() : null;
        const normalizedDeathDate = livingValue === 1 ? null : death_date ? String(death_date).trim() : null;
        const lifeDateValidation = validatePersonLifeDates(normalizedBirthDate, normalizedDeathDate);
        if (!lifeDateValidation.ok) {
            return res.status(400).json(relationPayload(lifeDateValidation));
        }

        const shouldCreateAccount = livingValue === 1;
        const accountEmail = String(account_email || email || '').trim().toLowerCase();
        const accountPassword = String(account_password || '');

        if (shouldCreateAccount) {
            if (!accountEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Người còn sống cần có email để tạo tài khoản',
                });
            }

            if (!accountPassword || accountPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu tài khoản tối thiểu 6 ký tự',
                });
            }

            const [emailRows] = await db.query(
                'SELECT id FROM accounts WHERE email = ? LIMIT 1',
                [accountEmail]
            );

            if (emailRows.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Email này đã tồn tại trong hệ thống',
                });
            }

            const accountLimitCheck = await ensureCanAddAccount(clanId);

            if (!accountLimitCheck.ok) {
                return res.status(accountLimitCheck.status).json({
                    success: false,
                    code: accountLimitCheck.code,
                    message: accountLimitCheck.message,
                    billing: accountLimitCheck.billing,
                });
            }
        }

        const treeXValue = parseTreeInt(tree_x, 0);
        const treeYValue = parseTreeInt(tree_y, 0);
        const displayOrderValue = parseTreeInt(display_order, 0);

        const avatarMediaIdValue =
            normalizeMediaId(avatar_media_id) || extractMediaIdFromUrl(avatar_url);

        const avatarUrlValue =
            avatar_url != null && String(avatar_url).trim()
                ? String(avatar_url).trim()
                : avatarMediaIdValue
                    ? getMediaUrl(req, avatarMediaIdValue)
                    : null;

        const fatherId = parseNullableId(parent_father_id ?? father_person_id);
        const motherId = parseNullableId(parent_mother_id ?? mother_person_id);
        if (fatherId || motherId) {
            const proposedBirthValidation = await validateProposedChildBirthAgainstParents({
                clanId,
                childBirthDate: normalizedBirthDate,
                fatherId,
                motherId,
            });
            if (!proposedBirthValidation.ok) {
                return res.status(relationHttpStatus(proposedBirthValidation)).json(relationPayload(proposedBirthValidation));
            }
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [personResult] = await connection.query(
            `
            INSERT INTO people (
                clan_id,
                display_name,
                first_name,
                middle_name,
                surname,
                gender,
                generation,
                branch,
                birth_date,
                death_date,
                is_living,
                phone,
                email,
                address,
                hometown,
                avatar_url,
                avatar_media_id,
                bio,
                note,
                tree_x,
                tree_y,
                display_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                clanId,
                displayNameValue || buildDisplayNameFromPartsMgr(surnameValue, middleNameValue, firstNameValue),
                firstNameValue,
                middleNameValue,
                surnameValue,
                genderValue,
                Number.isFinite(generationNumber) && generationNumber > 0 ? generationNumber : 1,
                Number.isFinite(branchNumber) ? branchNumber : null,
                normalizedBirthDate,
                normalizedDeathDate,
                livingValue,
                phone != null ? String(phone).trim() : null,
                accountEmail || (email != null ? String(email).trim() : null),
                address != null ? String(address).trim() : null,
                hometown != null ? String(hometown).trim() : null,
                avatarUrlValue,
                avatarMediaIdValue,
                bio != null ? String(bio).trim() : null,
                note != null ? String(note).trim() : null,
                treeXValue,
                treeYValue,
                displayOrderValue,
            ]
        );

        const personId = personResult.insertId;
        let accountId = null;

        if (shouldCreateAccount) {
            const hashedPassword = await bcrypt.hash(accountPassword, 10);

            const [accountResult] = await connection.query(
                `
                INSERT INTO accounts (
                    email,
                    password,
                    person_id,
                    role_id,
                    status
                )
                VALUES (?, ?, ?, 3, 'active')
                `,
                [accountEmail, hashedPassword, personId]
            );

            accountId = accountResult.insertId;

            await connection.query(
                `
                INSERT INTO account_clans (
                    account_id,
                    clan_id,
                    person_id,
                    status
                )
                VALUES (?, ?, ?, 'active')
                `,
                [accountId, clanId, personId]
            );
        }

        if (fatherId || motherId) {
            const relation = await applyBloodlineForPerson(
                personId,
                clanId,
                fatherId,
                motherId,
                connection,
                { forceSaveHistoricalRelation: body.forceSaveHistoricalRelation }
            );

            if (!relation.ok) {
                throw relationErrorFromResult(relation);
            }
        }

        await connection.commit();

        emitTreeUpdated(req, clanId, {
            action: 'person_created',
            person_id: personId,
        });

        return res.status(201).json({
            success: true,
            message: shouldCreateAccount
                ? 'Đã tạo người trong gia phả và tài khoản đăng nhập'
                : 'Đã tạo người đã mất trong gia phả',
            person_id: personId,
            account_id: accountId,
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        console.error('createPerson error:', error);
        const responseStatus = error.status || 500;

        if (error.relationResult) {
            return res.status(responseStatus).json(relationPayload(error.relationResult));
        }

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Email hoặc liên kết tài khoản đã tồn tại',
            });
        }

        return res.status(responseStatus).json({
            success: false,
            message: error.message || 'Lỗi tạo người trong gia phả',
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const linkRelations = async (req, res) => {
    try {
        const body = req.body || {};
        const personId = parseNullableId(body.person_id ?? body.id);
        if (!personId) {
            return res.status(400).json({ success: false, message: 'person_id không hợp lệ' });
        }

        const permission = await assertTreeMutationPermission(req, {
            action: 'link_relations',
            affectedPersonIds: [personId],
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }

        const [personRows] = await db.query('SELECT id, clan_id, gender FROM people WHERE id = ? LIMIT 1', [personId]);
        if (!personRows.length) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người trong gia phả' });
        }

        const person = personRows[0];
        if (req.user.role_id === 2) {
            const managerClanId = await getManagerClanId(req.user.id);
            if (managerClanId == null) {
                return res.status(404).json({ success: false, message: 'Không xác định được dòng họ của manager' });
            }
            if (Number(person.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({ success: false, message: 'Chỉ được liên kết người trong cùng dòng họ' });
            }
        }

        const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
        const hasBloodline =
            has('parent_father_id') || has('parent_mother_id') || has('father_person_id') || has('mother_person_id');
        if (hasBloodline) {
            const fatherId = parseNullableId(body.parent_father_id ?? body.father_person_id);
            const motherId = parseNullableId(body.parent_mother_id ?? body.mother_person_id);
            if (fatherId || motherId) {
                const relation = await applyBloodlineForPerson(personId, person.clan_id, fatherId, motherId, db, { forceSaveHistoricalRelation: body.forceSaveHistoricalRelation });
                if (!relation.ok) return res.status(relationHttpStatus(relation)).json(relationPayload(relation));
            } else {
                await db.query('DELETE FROM children WHERE person_id = ?', [personId]);
            }
        }

        const hasMarriage =
            has('family_id') || has('spouse_id') || has('spouse_person_id') || has('children_ids') || has('children_person_ids');
        if (hasMarriage) {
            const relationBody = {};
            if (has('family_id')) relationBody.family_id = body.family_id;
            if (has('spouse_id') || has('spouse_person_id')) relationBody.spouse_id = body.spouse_id ?? body.spouse_person_id;
            if (has('children_ids') || has('children_person_ids')) relationBody.children_ids = body.children_ids ?? body.children_person_ids;
            if (has('marriage_date')) relationBody.marriage_date = body.marriage_date;
            if (has('relationship_status')) relationBody.relationship_status = body.relationship_status;
            if (has('ended_at')) relationBody.ended_at = body.ended_at;
            if (has('relation_note')) relationBody.relation_note = body.relation_note;

            const relation = await applyMarriageRelationsForPerson(
                { person_id: personId, clan_id: person.clan_id, gender: person.gender, forceSaveHistoricalRelation: body.forceSaveHistoricalRelation },
                { ...relationBody, forceSaveHistoricalRelation: body.forceSaveHistoricalRelation }
            );
            if (!relation.ok) return res.status(relationHttpStatus(relation)).json(relationPayload(relation));
        }
        emitTreeUpdated(req, person.clan_id, {
         action: 'relations_updated',
        person_id: personId,
        });

        return res.json({ success: true, message: 'Đã lưu liên kết gia phả' });
    } catch (error) {
        console.error('linkRelations error:', error);
        res.status(500).json({ success: false, message: 'Lỗi liên kết quan hệ' });
    }
};

const updateTreePerson = async (req, res) => {
    try {
        await ensurePeopleTreeLayoutColumns();
        const personId = Number(req.params.id);
        const permission = await assertTreeMutationPermission(req, {
            action: 'update_person',
            affectedPersonIds: [personId],
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }
        const gate = await assertCanManagePersonId(req, personId);
        if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });

        const [rows] = await db.query('SELECT * FROM people WHERE id = ? LIMIT 1', [personId]);
        const current = rows[0];
        const body = req.body || {};
        const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
        let pendingRoleAccountId = null;
        let pendingRoleId = null;

        const strOrKeep = (key, currentValue) => {
            if (!has(key)) return currentValue ?? '';
            if (body[key] === null) return '';
            return String(body[key]).trim();
        };
        const dateOrKeep = (key, currentValue) => {
            if (!has(key)) return currentValue;
            if (body[key] === null || body[key] === '') return null;
            const value = String(body[key]).trim();
            return value || null;
        };

        const nextSurname = strOrKeep('surname', current.surname);
        const nextMiddle = strOrKeep('middle_name', current.middle_name);
        const nextFirst = strOrKeep('first_name', current.first_name);
        let nextDisplay = has('display_name') ? String(body.display_name || '').trim() : (current.display_name || '').trim();
        nextDisplay = nextDisplay || buildDisplayNameFromPartsMgr(nextSurname, nextMiddle, nextFirst);
        if (!nextDisplay && !nextSurname && !nextFirst) {
            return res.status(400).json({ success: false, message: 'Can nhap ho ten thanh vien' });
        }

        let nextGender = current.gender;
        if (has('gender')) {
            if (body.gender === null || body.gender === '') nextGender = null;
            else {
                const g = Number(body.gender);
                nextGender = g === 1 || g === 2 ? g : current.gender;
            }
        }

        let nextGeneration = current.generation;
        if (has('generation')) {
            const g = Number(body.generation);
            nextGeneration = Number.isFinite(g) && g > 0 ? g : current.generation || 1;
        }

        let nextBranch = current.branch;
        if (has('branch')) {
            if (body.branch === null || body.branch === '') nextBranch = null;
            else {
                const b = Number(body.branch);
                nextBranch = Number.isFinite(b) ? b : current.branch;
            }
        }

        let nextLiving = current.is_living;
        if (has('is_living')) {
            nextLiving = body.is_living === true || body.is_living === 1 || body.is_living === '1' ? 1 : 0;
        }

        let nextClanId = current.clan_id;
        if (Number(req.user.role_id) === 1 && has('clan_id')) {
            const cid = Number(body.clan_id);
            if (Number.isFinite(cid)) {
                const [clanRows] = await db.query('SELECT id FROM clans WHERE id = ? LIMIT 1', [cid]);
                if (!clanRows.length) {
                    return res.status(400).json({ success: false, message: 'clan_id khong ton tai' });
                }
                nextClanId = cid;
            }
        }

        if (has('role_id')) {
            const roleInput = body.role_id;

            // Cho phép lưu thông tin người không có tài khoản (người đã mất/người thêm thủ công)
            // khi frontend gửi role_id rỗng. Chỉ xử lý đổi vai trò khi role_id thật sự là 2 hoặc 3.
            if (roleInput !== null && roleInput !== '') {
                if (permission.scope !== 'all') {
                    return res.status(403).json({ success: false, message: 'Khong duoc doi vai tro trong che do temporary edit.' });
                }
                if (Number(req.user.role_id) !== 1 && Number(req.user.role_id) !== 2) {
                    return res.status(403).json({ success: false, message: 'Ban khong co quyen doi vai tro thanh vien.' });
                }

                const rid = Number(roleInput);
                if (rid !== 2 && rid !== 3) {
                    return res.status(400).json({ success: false, message: 'Vai tro chi ho tro 2 - toc truong hoac 3 - thanh vien.' });
                }

                const [accountRows] = await db.query(
                    'SELECT id, role_id FROM accounts WHERE person_id = ? ORDER BY id ASC LIMIT 1',
                    [personId]
                );
                if (!accountRows.length) {
                    return res.status(400).json({ success: false, message: 'Thanh vien nay chua co tai khoan de doi vai tro.' });
                }

                const targetAccount = accountRows[0];
                if (Number(req.user.role_id) === 2) {
                    if (Number(targetAccount.id) === Number(req.user.id) && rid !== Number(targetAccount.role_id)) {
                        return res.status(400).json({ success: false, message: 'Manager khong the tu doi vai tro cua chinh minh.' });
                    }
                    if (rid === 3 && Number(targetAccount.role_id) !== 3) {
                        return res.status(403).json({ success: false, message: 'Manager khong duoc ha vai tro cua toc truong khac.' });
                    }
                }

                if (rid !== Number(targetAccount.role_id)) {
                    pendingRoleAccountId = targetAccount.id;
                    pendingRoleId = rid;
                }
            }
        }

        let nextAvatarUrl = strOrKeep('avatar_url', current.avatar_url) || null;
        let nextAvatarMediaId = current.avatar_media_id || null;
        if (has('avatar_media_id')) {
            nextAvatarMediaId = normalizeMediaId(body.avatar_media_id);
        } else if (has('avatar_url')) {
            nextAvatarMediaId = extractMediaIdFromUrl(nextAvatarUrl);
        }
        if (!nextAvatarUrl && nextAvatarMediaId) {
            nextAvatarUrl = getMediaUrl(req, nextAvatarMediaId);
        }

        const nextTreeX = has('tree_x') ? parseTreeInt(body.tree_x, current.tree_x || 0) : current.tree_x || 0;
        const nextTreeY = has('tree_y') ? parseTreeInt(body.tree_y, current.tree_y || 0) : current.tree_y || 0;
        const nextDisplayOrder = has('display_order')
            ? parseTreeInt(body.display_order, current.display_order || 0)
            : current.display_order || 0;
        const nextBirth = dateOrKeep('birth_date', current.birth_date);
        const nextDeath = nextLiving === 1 ? null : dateOrKeep('death_date', current.death_date);
        const lifeDateValidation = validatePersonLifeDates(nextBirth, nextDeath);
        if (!lifeDateValidation.ok) {
            return res.status(400).json(relationPayload(lifeDateValidation));
        }

        const genderValidation = await validatePersonGenderWithFamilyRole(db, personId, nextGender);
        if (!genderValidation.ok) {
            return res.status(400).json({ success: false, message: genderValidation.message });
        }

        const generationValidation = await validatePersonGenerationWithRelations(db, personId, nextGeneration);
        if (!generationValidation.ok) {
            return res.status(400).json({ success: false, message: generationValidation.message });
        }

        const birthValidation = await validatePersonBirthDateWithRelations(db, personId, nextBirth, nextLiving, nextDeath);
        if (!birthValidation.ok) {
            return res.status(400).json(relationPayload(birthValidation));
        }

        const hasBloodline = has('parent_father_id') || has('parent_mother_id') || has('father_person_id') || has('mother_person_id');
        const pendingFatherId = hasBloodline ? parseNullableId(body.parent_father_id ?? body.father_person_id) : null;
        const pendingMotherId = hasBloodline ? parseNullableId(body.parent_mother_id ?? body.mother_person_id) : null;
        if (permission.scope === 'limited' && hasBloodline) {
            return res.status(403).json({
                success: false,
                message: 'Temporary edit key khong cho phep sua quan he cha me.',
            });
        }
        if (hasBloodline && (pendingFatherId || pendingMotherId)) {
            const proposedBirthValidation = await validateProposedChildBirthAgainstParents({
                clanId: nextClanId,
                childBirthDate: nextBirth,
                fatherId: pendingFatherId,
                motherId: pendingMotherId,
            });
            if (!proposedBirthValidation.ok) {
                return res.status(relationHttpStatus(proposedBirthValidation)).json(relationPayload(proposedBirthValidation));
            }
        }

        const hasMarriage = has('family_id') || has('spouse_id') || has('spouse_person_id') || has('children_ids') || has('children_person_ids');
        if (permission.scope === 'limited' && hasMarriage) {
            return res.status(403).json({
                success: false,
                message: 'Temporary edit key khong cho phep sua quan he hon nhan va con cai.',
            });
        }
        if (hasMarriage && (has('children_ids') || has('children_person_ids'))) {
            const childIds = parseRelationIdList(body.children_ids ?? body.children_person_ids);
            const proposedParentValidation = await validateProposedParentBirthAgainstChildren({
                clanId: nextClanId,
                parentBirthDate: nextBirth,
                childIds,
            });
            if (!proposedParentValidation.ok) {
                return res.status(relationHttpStatus(proposedParentValidation)).json(relationPayload(proposedParentValidation));
            }
        }

        await db.query(
            `UPDATE people SET
                clan_id = ?, display_name = ?, first_name = ?, middle_name = ?, surname = ?,
                gender = ?, birth_date = ?, death_date = ?, is_living = ?, generation = ?, branch = ?,
                hometown = ?, address = ?, phone = ?, email = ?, zalo = ?, facebook = ?,
                avatar_url = ?, avatar_media_id = ?, bio = ?, note = ?, tree_x = ?, tree_y = ?, display_order = ?
             WHERE id = ?`,
            [
                nextClanId,
                nextDisplay,
                nextFirst,
                nextMiddle,
                nextSurname,
                nextGender,
                nextBirth,
                nextDeath,
                nextLiving,
                nextGeneration,
                nextBranch,
                strOrKeep('hometown', current.hometown),
                strOrKeep('address', current.address),
                strOrKeep('phone', current.phone),
                strOrKeep('email', current.email),
                strOrKeep('zalo', current.zalo),
                strOrKeep('facebook', current.facebook),
                nextAvatarUrl,
                nextAvatarMediaId,
                strOrKeep('bio', current.bio),
                strOrKeep('note', current.note),
                nextTreeX,
                nextTreeY,
                nextDisplayOrder,
                personId,
            ]
        );

        if (hasBloodline) {
            if (pendingFatherId || pendingMotherId) {
                const relation = await applyBloodlineForPerson(personId, nextClanId, pendingFatherId, pendingMotherId, db, { forceSaveHistoricalRelation: body.forceSaveHistoricalRelation });
                if (!relation.ok) return res.status(relationHttpStatus(relation)).json(relationPayload(relation));
            } else {
                await db.query('DELETE FROM children WHERE person_id = ?', [personId]);
            }
        }

        if (hasMarriage) {
            const relationBody = {};
            if (has('family_id')) relationBody.family_id = body.family_id;
            if (has('spouse_id') || has('spouse_person_id')) relationBody.spouse_id = body.spouse_id ?? body.spouse_person_id;
            if (has('children_ids') || has('children_person_ids')) relationBody.children_ids = body.children_ids ?? body.children_person_ids;
            if (has('marriage_date')) relationBody.marriage_date = body.marriage_date;
            if (has('relationship_status')) relationBody.relationship_status = body.relationship_status;
            if (has('ended_at')) relationBody.ended_at = body.ended_at;
            if (has('relation_note')) relationBody.relation_note = body.relation_note;
            const relation = await applyMarriageRelationsForPerson(
                { person_id: personId, clan_id: nextClanId, gender: nextGender, forceSaveHistoricalRelation: body.forceSaveHistoricalRelation },
                { ...relationBody, forceSaveHistoricalRelation: body.forceSaveHistoricalRelation }
            );
            if (!relation.ok) return res.status(relationHttpStatus(relation)).json(relationPayload(relation));
        }

        if (pendingRoleAccountId && pendingRoleId) {
            await db.query('UPDATE accounts SET role_id = ? WHERE id = ?', [pendingRoleId, pendingRoleAccountId]);
        }

        const [updatedRows] = await db.query(
            `
            SELECT p.*, a.id AS account_id, a.email AS account_email, a.role_id, a.status AS account_status
            FROM people p
            LEFT JOIN accounts a ON a.person_id = p.id
            WHERE p.id = ?
            LIMIT 1
            `,
            [personId]
        );
        const updated = updatedRows[0] || null;
        emitTreeUpdated(req, nextClanId, {
            action: 'person_updated',
            person_id: personId,
        });

        return res.json({
            success: true,
            message: 'Da cap nhat thanh vien',
            person: updated
                ? {
                      ...updated,
                      birth_date: fmtSqlDate(updated.birth_date),
                      death_date: fmtSqlDate(updated.death_date),
                  }
                : null,
        });
    } catch (error) {
        console.error('updateTreePerson error:', error);
        res.status(500).json({ success: false, message: 'Loi cap nhat nguoi trong gia pha' });
    }
};

const updatePersonPosition = async (req, res) => {
    try {
        await ensurePeopleTreeLayoutColumns();
        const personId = Number(req.params.id);
        const permission = await assertTreeMutationPermission(req, {
            action: 'move_person',
            affectedPersonIds: [personId],
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }
        const gate = await assertCanManagePersonId(req, personId);
        if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });
        const [personRows] = await db.query(
            'SELECT clan_id FROM people WHERE id = ? LIMIT 1',
            [personId]
        );
        const clanId = personRows[0]?.clan_id || null;
        const treeX = parseTreeInt(req.body?.tree_x, 0);
        const treeY = parseTreeInt(req.body?.tree_y, 0);
        const hasOrder = Object.prototype.hasOwnProperty.call(req.body || {}, 'display_order');
        if (hasOrder) {
            await db.query('UPDATE people SET tree_x = ?, tree_y = ?, display_order = ? WHERE id = ?', [
                treeX,
                treeY,
                parseTreeInt(req.body.display_order, 0),
                personId,
            ]);
        } else {
            await db.query('UPDATE people SET tree_x = ?, tree_y = ? WHERE id = ?', [treeX, treeY, personId]);
        }

        emitTreeUpdated(req, clanId, {
            action: 'person_position_updated',
            person_id: personId,
        });

        res.json({ success: true, person_id: personId, tree_x: treeX, tree_y: treeY });
    } catch (error) {
        console.error('updatePersonPosition error:', error);
        res.status(500).json({ success: false, message: 'Loi luu vi tri trong cay' });
    }
};

const saveTreeLayout = async (req, res) => {
    try {
        await ensurePeopleTreeLayoutColumns();
        const people = Array.isArray(req.body?.positions)
            ? req.body.positions
            : Array.isArray(req.body?.people)
              ? req.body.people
              : [];
        const permission = await assertTreeMutationPermission(req, {
            action: 'bulk_layout',
            affectedPersonIds: people.map((item) => item.id ?? item.person_id),
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }
        const clanId = await resolveManagedClanId(req, req.body || {});
        const lineRoutes = req.body?.line_routes ?? req.body?.lineRoutes;
        const cardSizes = req.body?.card_sizes ?? req.body?.cardSizes;
        const hasLineRoutes = lineRoutes && typeof lineRoutes === 'object' && !Array.isArray(lineRoutes);
        const hasCardSizes = cardSizes && typeof cardSizes === 'object' && !Array.isArray(cardSizes);

        if (!people.length && !(hasLineRoutes || hasCardSizes)) return res.json({ success: true, updated: 0 });

        let updated = 0;
        for (const item of people) {
            const personId = Number(item.id ?? item.person_id);
            if (!Number.isFinite(personId)) continue;
            const gate = await assertCanManagePersonId(req, personId);
            if (!gate.ok) continue;
            await db.query('UPDATE people SET tree_x = ?, tree_y = ?, display_order = ? WHERE id = ?', [
                parseTreeInt(item.tree_x, 0),
                parseTreeInt(item.tree_y, 0),
                parseTreeInt(item.display_order, 0),
                personId,
            ]);
            updated += 1;
        }

        if (clanId != null && (hasLineRoutes || hasCardSizes)) {
            await saveTreeLayoutSettings(
                clanId,
                {
                    ...(hasLineRoutes ? { line_routes: lineRoutes } : {}),
                    ...(hasCardSizes ? { card_sizes: cardSizes } : {}),
                },
                req.user?.id
            );
        }

        emitTreeUpdated(req, clanId, {
    action: 'tree_layout_updated',
    updated,
    layout_saved: Boolean(clanId != null && (hasLineRoutes || hasCardSizes)),
    client_layout_id: req.body?.client_layout_id || req.body?.clientLayoutId || null,
    layout: {
        nodes: people.map((item) => ({
            person_id: Number(item.id ?? item.person_id),
            tree_x: parseTreeInt(item.tree_x, 0),
            tree_y: parseTreeInt(item.tree_y, 0),
        })).filter((item) => Number.isFinite(item.person_id)),
        line_routes_full: hasLineRoutes,
        card_sizes_full: hasCardSizes,
        ...(hasLineRoutes ? { line_routes: lineRoutes || {} } : {}),
        ...(hasCardSizes ? { card_sizes: cardSizes || {} } : {}),
    },
});

res.json({ success: true, updated, layout_saved: Boolean(clanId != null && (hasLineRoutes || hasCardSizes)) });
    } catch (error) {
        console.error('saveTreeLayout error:', error);
        res.status(500).json({ success: false, message: 'Loi luu bo cuc cay' });
    }
};

const safeLayoutJsonParse = (value, fallback = {}) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
};

const normalizeLayoutPatchObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const mergeNestedLayoutPatch = (current, patch) => {
    const next = { ...(current || {}) };
    Object.entries(normalizeLayoutPatchObject(patch)).forEach(([outerKey, innerValue]) => {
        if (!innerValue || typeof innerValue !== 'object' || Array.isArray(innerValue)) return;
        next[outerKey] = { ...(next[outerKey] || {}), ...innerValue };
    });
    return next;
};

const normalizeBatchNodeChanges = (body) => {
    const source = Array.isArray(body?.nodes)
        ? body.nodes
        : Array.isArray(body?.positions)
          ? body.positions
          : [];
    const byId = new Map();
    source.forEach((item) => {
        const personId = Number(item?.person_id ?? item?.id);
        if (!Number.isFinite(personId) || personId <= 0) return;
        byId.set(personId, {
            person_id: personId,
            tree_x: parseTreeInt(item.tree_x, 0),
            tree_y: parseTreeInt(item.tree_y, 0),
        });
    });
    return [...byId.values()];
};

const saveTreeLayoutBatch = async (req, res) => {
    let connection = null;
    try {
        await ensurePeopleTreeLayoutColumns();
        await ensureTreeLayoutSettingsTable();

        const body = req.body || {};
        const nodeChanges = normalizeBatchNodeChanges(body);
        const lineRoutesPatch = normalizeLayoutPatchObject(body.line_routes ?? body.lineRoutes);
        const cardSizesPatch = normalizeLayoutPatchObject(body.card_sizes ?? body.cardSizes);
        const affectedPersonIds = [
            ...nodeChanges.map((item) => item.person_id),
            ...Object.keys(cardSizesPatch).map(Number).filter((id) => Number.isFinite(id) && id > 0),
        ];

        if (!nodeChanges.length && !Object.keys(lineRoutesPatch).length && !Object.keys(cardSizesPatch).length) {
            return res.json({ success: true, updated: 0, layout: { nodes: [], line_routes: {}, card_sizes: {} } });
        }

        const permission = await assertTreeMutationPermission(req, {
            action: 'bulk_layout',
            affectedPersonIds,
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }

        const clanId = await resolveManagedClanId(req, body);
        if (!clanId) {
            return res.status(400).json({ success: false, message: 'Khong xac dinh duoc dong ho de luu bo cuc.' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        let updated = 0;
        for (const item of nodeChanges) {
            const gate = await assertCanManagePersonId(req, item.person_id);
            if (!gate.ok) {
                await connection.rollback();
                connection.release();
                connection = null;
                return res.status(gate.status).json({ success: false, message: gate.message });
            }
            await connection.query(
                'UPDATE people SET tree_x = ?, tree_y = ? WHERE id = ?',
                [item.tree_x, item.tree_y, item.person_id]
            );
            updated += 1;
        }

        if (Object.keys(lineRoutesPatch).length || Object.keys(cardSizesPatch).length) {
            await connection.query(
                `INSERT IGNORE INTO tree_layout_settings (clan_id, line_routes, card_sizes, updated_by_account_id)
                 VALUES (?, ?, ?, ?)`,
                [clanId, '{}', '{}', req.user?.id || req.user?.account_id || null]
            );
            const [settingsRows] = await connection.query(
                'SELECT line_routes, card_sizes FROM tree_layout_settings WHERE clan_id = ? LIMIT 1 FOR UPDATE',
                [clanId]
            );
            const current = settingsRows[0] || {};
            const nextLineRoutes = mergeNestedLayoutPatch(
                safeLayoutJsonParse(current.line_routes, {}),
                lineRoutesPatch
            );
            const nextCardSizes = {
                ...safeLayoutJsonParse(current.card_sizes, {}),
                ...cardSizesPatch,
            };

            await connection.query(
                `
                INSERT INTO tree_layout_settings (clan_id, line_routes, card_sizes, updated_by_account_id)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  line_routes = VALUES(line_routes),
                  card_sizes = VALUES(card_sizes),
                  updated_by_account_id = VALUES(updated_by_account_id),
                  updated_at = CURRENT_TIMESTAMP
                `,
                [
                    clanId,
                    JSON.stringify(nextLineRoutes || {}),
                    JSON.stringify(nextCardSizes || {}),
                    req.user?.id || req.user?.account_id || null,
                ]
            );
        }

        await connection.commit();
        connection.release();
        connection = null;

        const layout = {
            nodes: nodeChanges,
            line_routes: lineRoutesPatch,
            card_sizes: cardSizesPatch,
        };
        emitTreeUpdated(req, clanId, {
            action: 'tree_layout_updated',
            updated,
            client_layout_id: body.client_layout_id || body.clientLayoutId || null,
            layout,
        });

        return res.json({ success: true, updated, layout });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
            connection.release();
        }
        console.error('saveTreeLayoutBatch error:', error);
        return res.status(500).json({ success: false, message: 'Loi luu batch bo cuc cay' });
    }
};

const createFamily = async (req, res) => {
    try {
        await ensureFamilyRelationshipColumns();
        const permission = await assertTreeMutationPermission(req, {
            action: 'create_family',
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }
        const clanId = await resolveManagedClanId(req, req.body || {});
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Khong xac dinh duoc dong ho' });
        }
        const fatherId = parseNullableId(req.body?.father_id ?? req.body?.father_person_id);
        const motherId = parseNullableId(req.body?.mother_id ?? req.body?.mother_person_id);
        if (!fatherId && !motherId) {
            return res.status(400).json({ success: false, message: 'Can co cha hoac me de tao family' });
        }

        const parentIds = [fatherId, motherId].filter(Boolean);
        const [parents] = await db.query(
            `SELECT id FROM people WHERE clan_id = ? AND id IN (${parentIds.map(() => '?').join(',')})`,
            [clanId, ...parentIds]
        );
        if (parents.length !== parentIds.length) {
            return res.status(400).json({ success: false, message: 'Cha/me phai thuoc cung dong ho' });
        }

        const familyValidation = await validateFamilyParents({
            clanId,
            fatherId,
            motherId,
        });
        if (!familyValidation.ok) {
            return res.status(relationHttpStatus(familyValidation)).json(relationPayload(familyValidation));
        }

        const relationshipStatus = normalizeFamilyRelationshipStatus(req.body?.relationship_status);
        const endedAt = nullableText(req.body?.ended_at);
        const relationNote = nullableText(req.body?.relation_note);

        if (fatherId && motherId && relationshipStatus === 'active') {
            const spouseConflict = await validateCanCreateOrUpdateSpouse({
                clanId,
                personId: fatherId,
                spouseId: motherId,
                forceSaveHistoricalRelation: req.body?.forceSaveHistoricalRelation,
            });
            if (!spouseConflict.ok) {
                return res.status(relationHttpStatus(spouseConflict)).json(relationPayload(spouseConflict));
            }
        }
        if (fatherId && motherId && relationshipStatus !== 'active') {
            const kinshipConflict = await validateSpouseKinshipConflict({
                clanId,
                personId: fatherId,
                spouseId: motherId,
                forceSaveHistoricalRelation: req.body?.forceSaveHistoricalRelation,
                skipSpouseUniqueness: true,
            });
            if (!kinshipConflict.ok) {
                return res.status(relationHttpStatus(kinshipConflict)).json(relationPayload(kinshipConflict));
            }
        }

        const [result] = await db.query(
            `INSERT INTO families
             (clan_id, father_id, mother_id, marriage_date, relationship_status, ended_at, relation_note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                clanId,
                fatherId,
                motherId,
                req.body?.marriage_date || null,
                relationshipStatus,
                endedAt,
                relationNote,
            ]
        );
        emitTreeUpdated(req, clanId, {
            action: 'family_created',
            family_id: result.insertId,
        });

        res.status(201).json({ success: true, family_id: result.insertId });
    } catch (error) {
        console.error('createFamily error:', error);
        res.status(500).json({ success: false, message: 'Loi tao family' });
    }
};

const updateFamily = async (req, res) => {
    try {
        await ensureFamilyRelationshipColumns();
        const familyId = Number(req.params.familyId);
        if (!Number.isFinite(familyId)) {
            return res.status(400).json({ success: false, message: 'family_id khong hop le' });
        }

        const [families] = await db.query('SELECT * FROM families WHERE id = ? LIMIT 1', [familyId]);
        if (!families.length) return res.status(404).json({ success: false, message: 'Khong tim thay family' });
        const current = families[0];

        const permission = await assertTreeMutationPermission(req, {
            action: 'update_family',
            affectedPersonIds: [current.father_id, current.mother_id].filter(Boolean),
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }

        if (Number(req.user.role_id) === 2) {
            const managerClanId = await getManagerClanId(req.user.id);
            if (Number(current.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({ success: false, message: 'Chi duoc sua family trong cung dong ho' });
            }
        }

        const has = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
        const fatherId = has('father_id') || has('father_person_id')
            ? parseNullableId(req.body?.father_id ?? req.body?.father_person_id)
            : parseNullableId(current.father_id);
        const motherId = has('mother_id') || has('mother_person_id')
            ? parseNullableId(req.body?.mother_id ?? req.body?.mother_person_id)
            : parseNullableId(current.mother_id);
        const relationshipStatus = has('relationship_status')
            ? normalizeFamilyRelationshipStatus(req.body?.relationship_status)
            : normalizeFamilyRelationshipStatus(current.relationship_status);

        const familyValidation = await validateFamilyParents({
            clanId: current.clan_id,
            fatherId,
            motherId,
            excludeFamilyId: familyId,
        });
        if (!familyValidation.ok) {
            return res.status(relationHttpStatus(familyValidation)).json(relationPayload(familyValidation));
        }

        const [existingChildren] = await db.query(
            'SELECT person_id FROM children WHERE family_id = ? ORDER BY sort_order, id',
            [familyId]
        );
        for (const child of existingChildren) {
            const childValidation = await validateChildAgainstParents({
                clanId: current.clan_id,
                childId: child.person_id,
                fatherId,
                motherId,
                forceSaveHistoricalRelation: req.body?.forceSaveHistoricalRelation,
            });
            if (!childValidation.ok) {
                return res.status(relationHttpStatus(childValidation)).json(relationPayload(childValidation));
            }
        }

        if (fatherId && motherId && relationshipStatus === 'active') {
            const spouseValidation = await validateCanCreateOrUpdateSpouse({
                clanId: current.clan_id,
                personId: fatherId,
                spouseId: motherId,
                excludeFamilyId: familyId,
                forceSaveHistoricalRelation: req.body?.forceSaveHistoricalRelation,
            });
            if (!spouseValidation.ok) {
                return res.status(relationHttpStatus(spouseValidation)).json(relationPayload(spouseValidation));
            }
        }
        if (fatherId && motherId && relationshipStatus !== 'active') {
            const kinshipValidation = await validateSpouseKinshipConflict({
                clanId: current.clan_id,
                personId: fatherId,
                spouseId: motherId,
                forceSaveHistoricalRelation: req.body?.forceSaveHistoricalRelation,
                skipSpouseUniqueness: true,
            });
            if (!kinshipValidation.ok) {
                return res.status(relationHttpStatus(kinshipValidation)).json(relationPayload(kinshipValidation));
            }
        }

        const marriageDate = has('marriage_date') ? nullableText(req.body?.marriage_date) : current.marriage_date;
        const endedAt = has('ended_at') ? nullableText(req.body?.ended_at) : current.ended_at;
        const relationNote = has('relation_note') ? nullableText(req.body?.relation_note) : current.relation_note;

        await db.query(
            `UPDATE families
             SET father_id = ?, mother_id = ?, marriage_date = ?, relationship_status = ?, ended_at = ?, relation_note = ?
             WHERE id = ?`,
            [fatherId, motherId, marriageDate, relationshipStatus, endedAt, relationNote, familyId]
        );

        emitTreeUpdated(req, current.clan_id, {
            action: 'family_updated',
            family_id: familyId,
        });

        return res.json({ success: true, family_id: familyId });
    } catch (error) {
        console.error('updateFamily error:', error);
        return res.status(500).json({ success: false, message: 'Loi cap nhat family' });
    }
};

const addFamilyChild = async (req, res) => {
    try {
        await ensureFamilyRelationshipColumns();
        const familyId = Number(req.params.familyId);
        const childId = parseNullableId(req.body?.person_id ?? req.body?.child_id);
        if (!Number.isFinite(familyId) || !childId) {
            return res.status(400).json({ success: false, message: 'family_id hoac person_id khong hop le' });
        }
        const permission = await assertTreeMutationPermission(req, {
            action: 'add_family_child',
            affectedPersonIds: [childId],
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }

        const [families] = await db.query('SELECT id, clan_id, father_id, mother_id FROM families WHERE id = ? LIMIT 1', [familyId]);
        if (!families.length) return res.status(404).json({ success: false, message: 'Khong tim thay family' });
        const family = families[0];
        if (Number(req.user.role_id) === 2) {
            const managerClanId = await getManagerClanId(req.user.id);
            if (Number(family.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({ success: false, message: 'Chi duoc sua family trong cung dong ho' });
            }
        }

        const [childRows] = await db.query('SELECT id FROM people WHERE id = ? AND clan_id = ? LIMIT 1', [
            childId,
            family.clan_id,
        ]);
        if (!childRows.length) {
            return res.status(400).json({ success: false, message: 'Con phai thuoc cung dong ho' });
        }

        const [existingChildRows] = await db.query(
            'SELECT id FROM children WHERE family_id = ? AND person_id = ? LIMIT 1',
            [familyId, childId]
        );
        if (existingChildRows.length) {
            return res.json({ success: true, family_id: familyId, person_id: childId, unchanged: true });
        }
        if (existingChildRows.length) {
            return res.status(400).json({ success: false, message: 'Không được thêm trùng con trong cùng một gia đình.' });
        }

        const childValidation = await validateChildAgainstParents({
            clanId: family.clan_id,
            childId,
            fatherId: family.father_id,
            motherId: family.mother_id,
            forceSaveHistoricalRelation: req.body?.forceSaveHistoricalRelation,
        });
        if (!childValidation.ok) {
            return res.status(relationHttpStatus(childValidation)).json(relationPayload(childValidation));
        }

        await db.query('DELETE FROM children WHERE person_id = ?', [childId]);
        if (childValidation.childGeneration) {
            await db.query('UPDATE people SET generation = ? WHERE id = ?', [
                childValidation.childGeneration,
                childId,
            ]);
        }
        await db.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, ?)', [
            familyId,
            childId,
            parseTreeInt(req.body?.sort_order, 0),
        ]);
        emitTreeUpdated(req, family.clan_id, {
            action: 'family_child_added',
            family_id: familyId,
            person_id: childId,
        });
        res.status(201).json({ success: true });
    } catch (error) {
        console.error('addFamilyChild error:', error);
        res.status(500).json({ success: false, message: 'Loi them con vao family' });
    }
};

const deleteTreePerson = async (req, res) => {
    try {
        const personId = Number(req.params.id);
        const permission = await assertTreeMutationPermission(req, {
            action: 'delete_person',
            affectedPersonIds: [personId],
        });
        if (!permission.ok) {
            return res.status(permission.status).json({ success: false, message: permission.message });
        }
        const gate = await assertCanManagePersonId(req, personId);
        if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });
        const [personRows] = await db.query(
            'SELECT * FROM people WHERE id = ? LIMIT 1',
            [personId]
        );
        if (!personRows.length) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thành viên cần xóa' });
        }
        const person = personRows[0];
        const clanId = person.clan_id || null;

        // Tự động lưu trữ thành viên vào Kho lưu trữ khi xóa khỏi sơ đồ cây gia phả
        const { ensureArchivedMembersTable } = require('../manager/archive.service');
        await ensureArchivedMembersTable();

        const [accountRows] = await db.query(
            'SELECT * FROM accounts WHERE person_id = ? LIMIT 1',
            [personId]
        );

        const account = accountRows[0] || null;
        const targetAccountId = account ? account.id : -personId;
        const accountJson = account ? JSON.stringify(account) : '{}';
        const reason = 'Tự động lưu trữ khi xóa khỏi sơ đồ cây gia phả';

        await db.query(
            `INSERT INTO archived_members
             (account_id, archived_by_account_id, clan_id, archived_reason, account_json, person_json)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                archived_by_account_id = VALUES(archived_by_account_id),
                clan_id = VALUES(clan_id),
                archived_reason = VALUES(archived_reason),
                account_json = VALUES(account_json),
                person_json = VALUES(person_json),
                archived_at = CURRENT_TIMESTAMP`, [
                targetAccountId,
                req.user.id,
                clanId,
                reason,
                accountJson,
                JSON.stringify(person),
            ]
        );

        emitTreeUpdated(req, clanId, {
            action: 'person_deleted',
            person_id: personId,
        });

        return res.json({
            success: true,
            person_id: personId,
            archived: true,
            message: 'Thành viên đã được tự động chuyển vào Kho lưu trữ thành viên để có thể phục hồi sau này.',
        });
    } catch (error) {
        console.error('deleteTreePerson error:', error);
        res.status(500).json({ success: false, message: 'Loi xoa nguoi khoi gia pha' });
    }
};



module.exports = {
    createPerson,
    linkRelations,
    updateTreePerson,
    updatePersonPosition,
    saveTreeLayout,
    saveTreeLayoutBatch,
    createFamily,
    updateFamily,
    addFamilyChild,
    deleteTreePerson,
};
