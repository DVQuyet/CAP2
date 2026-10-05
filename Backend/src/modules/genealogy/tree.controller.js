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
    normalizeMediaId,
    parseNullableId,
    parseTreeInt,
    saveTreeLayoutSettings,
} = require('../manager/common.service');

const {
    applyMarriageToDraft,
    ensureFamilyRelationshipColumns,
    ensurePeopleTreeLayoutColumns,
} = require('./familyRelation.service');
const {
    assertCanDeleteTreePerson,
    validatePersonLifeDates,
} = require('./familyValidation.service');
const {
    RelationDraft,
    RelationError,
    evaluateAndCommit,
    readOverrideOptions,
    relationResultPayload,
    successExtras,
    withRelationTransaction,
    normalizeSourceType,
} = require('./relationCommand.service');
const {
    assertCanManagePersonId,
    getManagerClanId,
    resolveManagedClanId,
} = require('../manager/managerClan.service');

const { getMediaUrlById } = require('../../shared/utils/media');
const { ensureClanTreeStyleColumn, ensureTreeLayoutSettingsTable } = require('../../shared/utils/treeLayoutSettings');
const { emitTreeUpdated } = require('../../socket/treeRealtime');
const { normalizePrecision, normalizeChildType } = require('./core');

const relationHttpStatus = (result) => result?.requiresConfirmation ? 409 : 400;
const relationPayload = (result) => relationResultPayload(result);
const relationErrorFromResult = (result) => new RelationError(result);

const nullableText = (value) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
};

// is_living: 1 còn sống, 0 đã mất, null không rõ ('unknown' / -1 / '').
const parseLivingValue = (value, fallback = 1) => {
    if (value === undefined) return fallback;
    if (value === null || value === '' || value === 'unknown' || Number(value) === -1) return null;
    return value === true || Number(value) === 1 || value === '1' ? 1 : 0;
};

const LUNAR_ANNIVERSARY_PATTERN = /^(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|30)$/;
const parseLunarAnniversary = (value) => {
    const text = nullableText(value);
    if (!text) return null;
    const match = text.match(LUNAR_ANNIVERSARY_PATTERN);
    if (!match) return null;
    return `${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
};

const parseCalendar = (value) => (String(value || '').toLowerCase() === 'lunar' ? 'lunar' : 'solar');

// Áp quan hệ "người mới tạo là X của người nguồn" lên bản nháp (tạo người và liên kết trong cùng một transaction).
const applyCreateRelation = (draft, newPersonId, relation = {}) => {
    const type = String(relation.type || relation.relation || '').toLowerCase();
    const sourceId = parseNullableId(relation.source_person_id ?? relation.sourcePersonId);
    if (!type || !sourceId) return;
    if (type === 'spouse') {
        draft.upsertUnion({ personId: sourceId, spouseId: newPersonId, fields: relation.union || {} });
        return;
    }
    if (type === 'child') {
        const familyId = parseNullableId(relation.family_id);
        const family = familyId
            ? draft.upsertUnion({ personId: sourceId, familyId })
            : draft.upsertUnion({ personId: sourceId, spouseId: parseNullableId(relation.other_parent_id) });
        draft.addChildLink(family.id, newPersonId, {
            childType: normalizeChildType(relation.child_type),
            sortOrder: relation.sort_order ?? relation.child_order,
        });
        return;
    }
    if (type === 'father' || type === 'mother') {
        const childType = normalizeChildType(relation.child_type);
        const current = draft.parentLinksOf(sourceId).find((link) => (
            childType === 'biological' ? ['biological', 'unknown'].includes(link.child_type) : link.child_type === childType
        ));
        const currentFamily = current ? draft.family(current.family_id) : null;
        draft.setParents(sourceId, {
            fatherId: type === 'father' ? newPersonId : currentFamily?.father_id || null,
            motherId: type === 'mother' ? newPersonId : currentFamily?.mother_id || null,
            childType,
        });
    }
};

const respondRelationError = (res, error) => {
    const result = error.relationResult;
    return res.status(relationHttpStatus(result)).json(relationPayload(result));
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

        const livingValue = parseLivingValue(is_living === undefined || is_living === null ? undefined : is_living, 1);

        const normalizedBirthDate = birth_date ? String(birth_date).trim() : null;
        const normalizedDeathDate = livingValue === 1 ? null : death_date ? String(death_date).trim() : null;
        const datePrecision = {
            birth_date_precision: normalizePrecision(body.birth_date_precision),
            birth_calendar: parseCalendar(body.birth_calendar),
            death_date_precision: normalizePrecision(body.death_date_precision),
            death_calendar: parseCalendar(body.death_calendar),
            death_anniversary_lunar: parseLunarAnniversary(body.death_anniversary_lunar),
            source_type: normalizeSourceType(body.source_type),
            source_note: nullableText(body.source_note),
        };
        const lifeDateValidation = validatePersonLifeDates(normalizedBirthDate, normalizedDeathDate);
        if (!lifeDateValidation.ok) {
            return res.status(400).json(relationPayload(lifeDateValidation));
        }

        const personalEmail = email != null ? String(email).trim() : null;
        const explicitAccountEmail = String(account_email || '').trim().toLowerCase();
        const accountPassword = String(account_password || '');
        const accountEmail = explicitAccountEmail || (accountPassword ? String(personalEmail || '').trim().toLowerCase() : '');
        const shouldCreateAccount = livingValue === 1 && Boolean(accountEmail || accountPassword);

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
                    ? await getMediaUrlById(req, avatarMediaIdValue)
                    : null;

        const fatherId = parseNullableId(parent_father_id ?? father_person_id);
        const motherId = parseNullableId(parent_mother_id ?? mother_person_id);
        const createRelation = body.relation && typeof body.relation === 'object' ? body.relation : null;
        await ensureFamilyRelationshipColumns();

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
                display_order,
                birth_date_precision,
                birth_calendar,
                death_date_precision,
                death_calendar,
                death_anniversary_lunar,
                source_type,
                source_note
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                accountEmail || personalEmail,
                address != null ? String(address).trim() : null,
                hometown != null ? String(hometown).trim() : null,
                avatarUrlValue,
                avatarMediaIdValue,
                bio != null ? String(bio).trim() : null,
                note != null ? String(note).trim() : null,
                treeXValue,
                treeYValue,
                displayOrderValue,
                datePrecision.birth_date_precision,
                datePrecision.birth_calendar,
                datePrecision.death_date_precision,
                datePrecision.death_calendar,
                datePrecision.death_anniversary_lunar,
                datePrecision.source_type,
                datePrecision.source_note,
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

        // Người mới và quan hệ của họ được kiểm tra, ghi trong cùng một transaction:
        // nếu quan hệ bị chặn thì người mới cũng không được tạo.
        let relationResult = null;
        if (fatherId || motherId || createRelation) {
            const draft = await RelationDraft.load(connection, clanId);
            if (fatherId || motherId) {
                draft.setParents(personId, {
                    fatherId,
                    motherId,
                    childType: normalizeChildType(body.parent_child_type),
                    sortOrder: body.sort_order ?? body.child_order,
                });
            }
            if (createRelation) applyCreateRelation(draft, personId, createRelation);
            relationResult = await evaluateAndCommit(
                draft,
                readOverrideOptions(body, req.user, permission.scope),
                'create_person'
            );
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
            ...successExtras(relationResult),
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        if (!error.relationResult) console.error('createPerson error:', error);
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

const MARRIAGE_BODY_KEYS = ['family_id', 'spouse_id', 'spouse_person_id', 'children_ids', 'children_person_ids'];

// Áp các thay đổi quan hệ của một người (từ body liên kết) lên bản nháp.
const applyLinkBodyToDraft = (draft, person, body = {}) => {
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const hasBloodline =
        has('parent_father_id') || has('parent_mother_id') || has('father_person_id') || has('mother_person_id');
    if (hasBloodline) {
        draft.setParents(person.id, {
            fatherId: parseNullableId(body.parent_father_id ?? body.father_person_id),
            motherId: parseNullableId(body.parent_mother_id ?? body.mother_person_id),
            childType: normalizeChildType(body.parent_child_type),
            sortOrder: body.sort_order ?? body.child_order,
            isPrimary: has('is_primary_lineage') ? Number(body.is_primary_lineage) === 1 : undefined,
        });
    }
    const hasMarriage = MARRIAGE_BODY_KEYS.some(has);
    if (hasMarriage) {
        applyMarriageToDraft(draft, { person_id: person.id }, body);
    }
    return hasBloodline || hasMarriage;
};

const loadLinkTarget = async (req, res, body) => {
    const personId = parseNullableId(body.person_id ?? body.id);
    if (!personId) {
        res.status(400).json({ success: false, message: 'person_id không hợp lệ' });
        return null;
    }

    const permission = await assertTreeMutationPermission(req, {
        action: 'link_relations',
        affectedPersonIds: [personId],
    });
    if (!permission.ok) {
        res.status(permission.status).json({ success: false, message: permission.message });
        return null;
    }

    const [personRows] = await db.query('SELECT id, clan_id, gender FROM people WHERE id = ? LIMIT 1', [personId]);
    if (!personRows.length) {
        res.status(404).json({ success: false, message: 'Không tìm thấy người trong gia phả' });
        return null;
    }

    const person = personRows[0];
    if (Number(req.user.role_id) === 2) {
        const managerClanId = await getManagerClanId(req.user.id);
        if (managerClanId == null) {
            res.status(404).json({ success: false, message: 'Không xác định được dòng họ của manager' });
            return null;
        }
        if (Number(person.clan_id) !== Number(managerClanId)) {
            res.status(403).json({ success: false, message: 'Chỉ được liên kết người trong cùng dòng họ' });
            return null;
        }
    }
    return { person: { ...person, id: Number(person.id) }, permission };
};

const linkRelations = async (req, res) => {
    try {
        const body = req.body || {};
        const target = await loadLinkTarget(req, res, body);
        if (!target) return undefined;
        const { person, permission } = target;

        const result = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, person.clan_id);
            applyLinkBodyToDraft(draft, person, body);
            return evaluateAndCommit(draft, readOverrideOptions(body, req.user, permission.scope), 'link_relations');
        });

        emitTreeUpdated(req, person.clan_id, {
            action: 'relations_updated',
            person_id: person.id,
        });

        return res.json({ success: true, message: 'Đã lưu liên kết gia phả', ...successExtras(result) });
    } catch (error) {
        if (error instanceof RelationError) return respondRelationError(res, error);
        console.error('linkRelations error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi liên kết quan hệ' });
    }
};

// Xem trước một thay đổi quan hệ: trả về lỗi/cảnh báo/thông báo và các thay đổi đời, không ghi gì.
const previewRelations = async (req, res) => {
    try {
        const body = req.body || {};
        const target = await loadLinkTarget(req, res, body);
        if (!target) return undefined;
        const { person, permission } = target;

        const evaluation = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, person.clan_id);
            applyLinkBodyToDraft(draft, person, body);
            return draft.evaluate(readOverrideOptions({ ...body, forceSaveHistoricalRelation: false }, req.user, permission.scope));
        });

        const publicList = (items = []) => successExtras({ notices: items }).notices;
        return res.json({
            success: true,
            preview: true,
            can_save: evaluation.ok || Boolean(evaluation.requiresConfirmation),
            requires_confirmation: Boolean(evaluation.requiresConfirmation),
            reason_required: Boolean(evaluation.reasonRequired),
            message: evaluation.message || null,
            blocking: publicList(evaluation.blocking),
            confirm: publicList(evaluation.confirm),
            notices: publicList(evaluation.notices),
            generation_changes: successExtras(evaluation).generation_changes,
        });
    } catch (error) {
        if (error instanceof RelationError) {
            const result = error.relationResult;
            return res.json({
                success: true,
                preview: true,
                can_save: false,
                requires_confirmation: false,
                message: result?.message,
                blocking: [{ code: result?.code, severity: 'error', message: result?.message }],
                confirm: [],
                notices: [],
                generation_changes: [],
            });
        }
        console.error('previewRelations error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi kiểm tra quan hệ' });
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
        let pendingAccountCreation = null;

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
            nextLiving = parseLivingValue(body.is_living, current.is_living);
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
                    if (rid !== 3) {
                        return res.status(400).json({ success: false, message: 'Thanh vien chua co tai khoan chi co the bo sung o vai tro thanh vien.' });
                    }
                    pendingAccountCreation = { roleId: 3 };
                } else {
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
        }

        if (pendingAccountCreation) {
            if (nextLiving !== 1) {
                return res.status(400).json({ success: false, message: 'Chi tao tai khoan cho thanh vien con song.' });
            }

            const accountEmail = String(body.account_email || '').trim().toLowerCase();
            const accountPassword = String(body.account_password || '');

            if (!accountEmail) {
                return res.status(400).json({ success: false, message: 'Can nhap email de tao tai khoan thanh vien.' });
            }

            if (!accountPassword || accountPassword.length < 6) {
                return res.status(400).json({ success: false, message: 'Mat khau tai khoan toi thieu 6 ky tu.' });
            }

            const [emailRows] = await db.query('SELECT id FROM accounts WHERE email = ? LIMIT 1', [accountEmail]);
            if (emailRows.length) {
                return res.status(400).json({ success: false, message: 'Email nay da ton tai trong he thong.' });
            }

            const accountLimitCheck = await ensureCanAddAccount(nextClanId);
            if (!accountLimitCheck.ok) {
                return res.status(accountLimitCheck.status).json({
                    success: false,
                    code: accountLimitCheck.code,
                    message: accountLimitCheck.message,
                    billing: accountLimitCheck.billing,
                });
            }

            pendingAccountCreation.email = accountEmail;
            pendingAccountCreation.password = accountPassword;
        }

        let nextAvatarUrl = strOrKeep('avatar_url', current.avatar_url) || null;
        let nextAvatarMediaId = current.avatar_media_id || null;
        if (has('avatar_media_id')) {
            nextAvatarMediaId = normalizeMediaId(body.avatar_media_id);
        } else if (has('avatar_url')) {
            nextAvatarMediaId = extractMediaIdFromUrl(nextAvatarUrl);
        }
        if (!nextAvatarUrl && nextAvatarMediaId) {
            nextAvatarUrl = await getMediaUrlById(req, nextAvatarMediaId);
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
        const keepOr = (key) => (has(key) ? body[key] : current[key] ?? null);
        const nextHistoricalFields = {
            birth_date_precision: normalizePrecision(keepOr('birth_date_precision')),
            birth_calendar: parseCalendar(keepOr('birth_calendar')),
            death_date_precision: normalizePrecision(keepOr('death_date_precision')),
            death_calendar: parseCalendar(keepOr('death_calendar')),
            death_anniversary_lunar: has('death_anniversary_lunar')
                ? parseLunarAnniversary(body.death_anniversary_lunar)
                : current.death_anniversary_lunar || null,
            source_type: has('source_type') ? normalizeSourceType(body.source_type) : current.source_type || null,
            source_note: has('source_note') ? nullableText(body.source_note) : current.source_note || null,
        };

        const hasBloodline = has('parent_father_id') || has('parent_mother_id') || has('father_person_id') || has('mother_person_id');
        const hasChildOrderField = has('child_order');
        if (permission.scope === 'limited' && hasBloodline) {
            return res.status(403).json({
                success: false,
                message: 'Temporary edit key khong cho phep sua quan he cha me.',
            });
        }

        const hasMarriage = MARRIAGE_BODY_KEYS.some(has);
        if (permission.scope === 'limited' && (hasMarriage || hasChildOrderField)) {
            return res.status(403).json({
                success: false,
                message: 'Temporary edit key khong cho phep sua quan he hon nhan va con cai.',
            });
        }

        // Thông tin người + cha mẹ + hôn nhân + thứ tự con được kiểm tra trên đồ thị và ghi trong một transaction.
        const relationResult = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, current.clan_id);
            draft.updatePerson(personId, {
                display_name: nextDisplay,
                gender: nextGender,
                generation: nextGeneration,
                birth_date: nextBirth,
                birth_date_precision: nextHistoricalFields.birth_date_precision,
                death_date: nextDeath,
                death_date_precision: nextHistoricalFields.death_date_precision,
                is_living: nextLiving,
                source_type: nextHistoricalFields.source_type,
            });
            applyLinkBodyToDraft(draft, { id: personId }, body);
            if (hasChildOrderField && !hasBloodline && !hasMarriage) {
                const links = draft.parentLinksOf(personId);
                const link = links.find((item) => Number(item.is_primary_lineage) === 1) || links[0];
                if (link) {
                    draft.addChildLink(link.family_id, personId, {
                        childType: link.child_type,
                        sortOrder: Math.max(0, parseTreeInt(body.child_order, 0)),
                        isPrimary: Number(link.is_primary_lineage) === 1,
                    });
                }
            }

            await conn.query(
                `UPDATE people SET
                    clan_id = ?, display_name = ?, first_name = ?, middle_name = ?, surname = ?,
                    gender = ?, birth_date = ?, death_date = ?, is_living = ?, generation = ?, branch = ?,
                    hometown = ?, address = ?, phone = ?, email = ?, zalo = ?, facebook = ?,
                    avatar_url = ?, avatar_media_id = ?, bio = ?, note = ?, tree_x = ?, tree_y = ?, display_order = ?,
                    birth_date_precision = ?, birth_calendar = ?, death_date_precision = ?, death_calendar = ?,
                    death_anniversary_lunar = ?, source_type = ?, source_note = ?
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
                    nextHistoricalFields.birth_date_precision,
                    nextHistoricalFields.birth_calendar,
                    nextHistoricalFields.death_date_precision,
                    nextHistoricalFields.death_calendar,
                    nextHistoricalFields.death_anniversary_lunar,
                    nextHistoricalFields.source_type,
                    nextHistoricalFields.source_note,
                    personId,
                ]
            );

            const result = await evaluateAndCommit(
                draft,
                readOverrideOptions(body, req.user, permission.scope),
                'update_person'
            );

            if (pendingRoleAccountId && pendingRoleId) {
                await conn.query('UPDATE accounts SET role_id = ? WHERE id = ?', [pendingRoleId, pendingRoleAccountId]);
            }

            if (pendingAccountCreation) {
                const hashedPassword = await bcrypt.hash(pendingAccountCreation.password, 10);
                const [accountResult] = await conn.query(
                    `INSERT INTO accounts (email, password, person_id, role_id, status)
                     VALUES (?, ?, ?, ?, 'active')`,
                    [pendingAccountCreation.email, hashedPassword, personId, pendingAccountCreation.roleId]
                );

                await conn.query(
                    `INSERT INTO account_clans (account_id, clan_id, person_id, status)
                     VALUES (?, ?, ?, 'active')
                     ON DUPLICATE KEY UPDATE
                       person_id = VALUES(person_id),
                       status = 'active'`,
                    [accountResult.insertId, nextClanId, personId]
                );

                if (!String(body.email || current.email || '').trim()) {
                    await conn.query('UPDATE people SET email = ? WHERE id = ?', [pendingAccountCreation.email, personId]);
                }
            }
            return result;
        });

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
            ...successExtras(relationResult),
        });
    } catch (error) {
        if (error instanceof RelationError) return respondRelationError(res, error);
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
        const treeStyle = req.body?.tree_style ?? req.body?.treeStyle;
        const hasLineRoutes = lineRoutes && typeof lineRoutes === 'object' && !Array.isArray(lineRoutes);
        const hasCardSizes = cardSizes && typeof cardSizes === 'object' && !Array.isArray(cardSizes);
        const hasTreeStyle = treeStyle && typeof treeStyle === 'object' && !Array.isArray(treeStyle);

        if (!people.length && !(hasLineRoutes || hasCardSizes || hasTreeStyle)) return res.json({ success: true, updated: 0 });

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

        if (clanId != null && (hasLineRoutes || hasCardSizes || hasTreeStyle)) {
            await saveTreeLayoutSettings(
                clanId,
                {
                    ...(hasLineRoutes ? { line_routes: lineRoutes } : {}),
                    ...(hasCardSizes ? { card_sizes: cardSizes } : {}),
                    ...(hasTreeStyle ? { tree_style: treeStyle } : {}),
                },
                req.user?.id
            );
        }

        emitTreeUpdated(req, clanId, {
    action: 'tree_layout_updated',
    updated,
    layout_saved: Boolean(clanId != null && (hasLineRoutes || hasCardSizes || hasTreeStyle)),
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
        ...(hasTreeStyle ? { tree_style: treeStyle || {} } : {}),
    },
});

res.json({ success: true, updated, layout_saved: Boolean(clanId != null && (hasLineRoutes || hasCardSizes || hasTreeStyle)) });
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
        await ensureClanTreeStyleColumn();

        const body = req.body || {};
        const nodeChanges = normalizeBatchNodeChanges(body);
        const lineRoutesPatch = normalizeLayoutPatchObject(body.line_routes ?? body.lineRoutes);
        const cardSizesPatch = normalizeLayoutPatchObject(body.card_sizes ?? body.cardSizes);
        const treeStyle = normalizeLayoutPatchObject(body.tree_style ?? body.treeStyle);
        const affectedPersonIds = [
            ...nodeChanges.map((item) => item.person_id),
            ...Object.keys(cardSizesPatch).map(Number).filter((id) => Number.isFinite(id) && id > 0),
        ];

        if (!nodeChanges.length && !Object.keys(lineRoutesPatch).length && !Object.keys(cardSizesPatch).length && !Object.keys(treeStyle).length) {
            return res.json({ success: true, updated: 0, layout: { nodes: [], line_routes: {}, card_sizes: {}, tree_style: {} } });
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

        if (Object.keys(treeStyle).length) {
            await connection.query(
                'UPDATE clans SET tree_style = ? WHERE id = ?',
                [JSON.stringify(treeStyle || {}), clanId]
            );
        }

        await connection.commit();
        connection.release();
        connection = null;

        const layout = {
            nodes: nodeChanges,
            line_routes: lineRoutesPatch,
            card_sizes: cardSizesPatch,
            tree_style: treeStyle,
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

const FAMILY_BODY_FIELDS = [
    'marriage_date', 'marriage_date_precision', 'relationship_status', 'ended_at', 'ended_at_precision',
    'relation_note', 'union_type', 'wife_rank', 'husband_rank', 'source_type', 'source_note',
];

const pickFamilyFields = (body = {}) => {
    const fields = {};
    FAMILY_BODY_FIELDS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(body, key)) fields[key] = body[key];
    });
    return fields;
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
        const body = req.body || {};
        const clanId = await resolveManagedClanId(req, body);
        if (clanId == null) {
            return res.status(404).json({ success: false, message: 'Khong xac dinh duoc dong ho' });
        }
        const fatherId = parseNullableId(body.father_id ?? body.father_person_id);
        const motherId = parseNullableId(body.mother_id ?? body.mother_person_id);
        if (!fatherId && !motherId) {
            return res.status(400).json({ success: false, message: 'Can co cha hoac me de tao family' });
        }

        let familyId = null;
        const result = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, clanId);
            const anchorId = fatherId || motherId;
            const spouseId = fatherId && motherId ? (anchorId === fatherId ? motherId : fatherId) : null;
            if (draft.findFamilyByParents(fatherId, motherId)) {
                throw new RelationError({
                    ok: false,
                    level: 'error',
                    code: 'DUPLICATE_SPOUSE_FAMILY',
                    message: 'Cặp cha mẹ này đã có gia đình. Hãy cập nhật gia đình hiện có.',
                });
            }
            const family = draft.createFamilyRow(fatherId, motherId, pickFamilyFields(body));
            draft.assertPerson(anchorId, 'Cha/mẹ');
            if (spouseId) draft.assertPerson(spouseId, 'Vợ/chồng');
            const committed = await evaluateAndCommit(draft, readOverrideOptions(body, req.user, permission.scope), 'create_family');
            familyId = committed.realFamilyId(family.id);
            return committed;
        });

        emitTreeUpdated(req, clanId, {
            action: 'family_created',
            family_id: familyId,
        });

        return res.status(201).json({ success: true, family_id: familyId, ...successExtras(result) });
    } catch (error) {
        if (error instanceof RelationError) return respondRelationError(res, error);
        console.error('createFamily error:', error);
        return res.status(500).json({ success: false, message: 'Loi tao family' });
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

        const body = req.body || {};
        const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
        const result = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, current.clan_id);
            draft.updateFamily(familyId, {
                fatherId: has('father_id') || has('father_person_id') ? parseNullableId(body.father_id ?? body.father_person_id) : undefined,
                motherId: has('mother_id') || has('mother_person_id') ? parseNullableId(body.mother_id ?? body.mother_person_id) : undefined,
                fields: pickFamilyFields(body),
            });
            if (has('children') || has('children_ids')) {
                const items = Array.isArray(body.children) ? body.children : body.children_ids;
                draft.setFamilyChildren(familyId, Array.isArray(items) ? items : []);
            }
            return evaluateAndCommit(draft, readOverrideOptions(body, req.user, permission.scope), 'update_family');
        });

        emitTreeUpdated(req, current.clan_id, {
            action: 'family_updated',
            family_id: familyId,
        });

        return res.json({ success: true, family_id: familyId, ...successExtras(result) });
    } catch (error) {
        if (error instanceof RelationError) return respondRelationError(res, error);
        console.error('updateFamily error:', error);
        return res.status(500).json({ success: false, message: 'Loi cap nhat family' });
    }
};

const addFamilyChild = async (req, res) => {
    try {
        await ensureFamilyRelationshipColumns();
        const familyId = Number(req.params.familyId);
        const body = req.body || {};
        const childId = parseNullableId(body.person_id ?? body.child_id);
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

        const [families] = await db.query('SELECT id, clan_id FROM families WHERE id = ? LIMIT 1', [familyId]);
        if (!families.length) return res.status(404).json({ success: false, message: 'Khong tim thay family' });
        const family = families[0];
        if (Number(req.user.role_id) === 2) {
            const managerClanId = await getManagerClanId(req.user.id);
            if (Number(family.clan_id) !== Number(managerClanId)) {
                return res.status(403).json({ success: false, message: 'Chi duoc sua family trong cung dong ho' });
            }
        }

        const result = await withRelationTransaction(null, async (conn) => {
            const draft = await RelationDraft.load(conn, family.clan_id);
            draft.addChildLink(familyId, childId, {
                childType: normalizeChildType(body.child_type),
                sortOrder: body.sort_order,
                isPrimary: Object.prototype.hasOwnProperty.call(body, 'is_primary_lineage')
                    ? Number(body.is_primary_lineage) === 1
                    : undefined,
            });
            return evaluateAndCommit(draft, readOverrideOptions(body, req.user, permission.scope), 'add_family_child');
        });

        emitTreeUpdated(req, family.clan_id, {
            action: 'family_child_added',
            family_id: familyId,
            person_id: childId,
        });
        return res.status(201).json({ success: true, family_id: familyId, person_id: childId, ...successExtras(result) });
    } catch (error) {
        if (error instanceof RelationError) return respondRelationError(res, error);
        console.error('addFamilyChild error:', error);
        return res.status(500).json({ success: false, message: 'Loi them con vao family' });
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
    previewRelations,
    updateTreePerson,
    updatePersonPosition,
    saveTreeLayout,
    saveTreeLayoutBatch,
    createFamily,
    updateFamily,
    addFamilyChild,
    deleteTreePerson,
};
