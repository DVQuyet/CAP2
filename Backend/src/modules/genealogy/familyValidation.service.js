// Kiểm tra đơn lẻ dùng trước khi ghi (giới tính theo vai trò, ngày sinh/mất, điều kiện xóa người).
// Các luật quan hệ đầy đủ (huyết thống, hôn nhân, thời gian, đời) nằm ở ./core và relationCommand.service.
const {
    db,
    uniquePositiveIds,
    loadPeopleByIds,
} = require('../manager/common.service');
const { parseHistoricalDate, isDefinitelyBefore, todayDayNumber } = require('./core');

const MALE = 1;
const FEMALE = 2;

const normalizeBinaryGender = (gender) => {
    const value = Number(gender);
    return value === MALE || value === FEMALE ? value : null;
};

const validateSpouseRoleGender = ({ husbandPerson = null, wifePerson = null } = {}) => {
    const husbandGender = normalizeBinaryGender(husbandPerson?.gender);
    const wifeGender = normalizeBinaryGender(wifePerson?.gender);

    if (husbandGender && wifeGender && husbandGender === wifeGender) {
        return {
            ok: false,
            code: 'SAME_GENDER_SPOUSE',
            message: 'Khong the tao quan he vo/chong giua hai nguoi cung gioi tinh.',
        };
    }

    if (husbandGender === FEMALE) {
        return {
            ok: false,
            code: 'FEMALE_AS_HUSBAND',
            message: 'Khong the chon nguoi co gioi tinh nu lam chong.',
        };
    }

    if (wifeGender === MALE) {
        return {
            ok: false,
            code: 'MALE_AS_WIFE',
            message: 'Khong the chon nguoi co gioi tinh nam lam vo.',
        };
    }

    return { ok: true };
};

const validateFamilyParents = async({ connection = db, clanId, fatherId, motherId, excludeFamilyId = null }) => {
    const nextFatherId = uniquePositiveIds([fatherId])[0] || null;
    const nextMotherId = uniquePositiveIds([motherId])[0] || null;
    const parentIds = uniquePositiveIds([nextFatherId, nextMotherId]);

    if (nextFatherId && nextMotherId && nextFatherId === nextMotherId) {
        return { ok: false, message: 'Cha va me khong the la cung mot nguoi.' };
    }

    const peopleById = await loadPeopleByIds(connection, parentIds);
    for (const parentId of parentIds) {
        const parent = peopleById.get(parentId);
        if (!parent || Number(parent.clan_id) !== Number(clanId)) {
            return { ok: false, message: 'Cha/me phai la nguoi trong cung dong ho hoac ID khong ton tai.' };
        }
    }

    const spouseRoleGender = validateSpouseRoleGender({
        husbandPerson: nextFatherId ? peopleById.get(nextFatherId) : null,
        wifePerson: nextMotherId ? peopleById.get(nextMotherId) : null,
    });
    if (!spouseRoleGender.ok) return spouseRoleGender;

    if (nextFatherId || nextMotherId) {
        const [duplicates] = await connection.query(
            `
            SELECT id
            FROM families
            WHERE clan_id = ?
              AND (father_id <=> ?)
              AND (mother_id <=> ?)
              AND (? IS NULL OR id <> ?)
            LIMIT 1
            `,
            [clanId, nextFatherId, nextMotherId, excludeFamilyId, excludeFamilyId]
        );
        if (duplicates.length) {
            return {
                ok: false,
                level: 'error',
                code: 'DUPLICATE_SPOUSE_FAMILY',
                message: 'Khong duoc tao duplicate spouse/family theo chieu nguoc hoac trung cap.',
            };
        }
    }

    return { ok: true, parentsById: peopleById };
};

const validatePersonGenderWithFamilyRole = async(connection, personId, nextGender) => {
    const gender = normalizeBinaryGender(nextGender);
    if (!gender) return { ok: true };

    if (gender === FEMALE) {
        const [fatherRows] = await connection.query('SELECT id FROM families WHERE father_id = ? LIMIT 1', [personId]);
        if (fatherRows.length) {
            return {
                ok: false,
                code: 'FEMALE_AS_HUSBAND',
                message: 'Khong the dat gioi tinh nu cho nguoi dang o vai tro chong/cha.',
            };
        }
    }

    if (gender === MALE) {
        const [motherRows] = await connection.query('SELECT id FROM families WHERE mother_id = ? LIMIT 1', [personId]);
        if (motherRows.length) {
            return {
                ok: false,
                code: 'MALE_AS_WIFE',
                message: 'Khong the dat gioi tinh nam cho nguoi dang o vai tro vo/me.',
            };
        }
    }

    return { ok: true };
};

// Kiểm tra nhanh ngày sinh/mất của một người (ngày đầy đủ). Ngày không đầy đủ được xét kỹ trong lõi quan hệ.
const validatePersonLifeDates = (birthDate, deathDate) => {
    const birth = parseHistoricalDate(birthDate);
    const death = parseHistoricalDate(deathDate);
    if (birth && birth.start > todayDayNumber()) {
        return { ok: false, level: 'error', code: 'BIRTH_DATE_IN_FUTURE', message: 'Ngày sinh không được lớn hơn ngày hiện tại.' };
    }
    if (birth && death && isDefinitelyBefore(death, birth)) {
        return { ok: false, level: 'error', code: 'INVALID_LIFE_DATES', message: 'Ngày mất không được trước ngày sinh.' };
    }
    return { ok: true, level: 'ok' };
};

const assertCanDeleteTreePerson = async(personId) => {
    const [parentFamilyRows] = await db.query(
        'SELECT id FROM families WHERE father_id = ? OR mother_id = ? LIMIT 1',
        [personId, personId]
    );
    if (parentFamilyRows.length) {
        return { ok: false, message: 'Không thể xóa người còn liên kết vợ/chồng hoặc con.' };
    }

    const [childRows] = await db.query('SELECT family_id FROM children WHERE person_id = ? LIMIT 1', [personId]);
    if (childRows.length) {
        return { ok: false, message: 'Không thể xóa người còn liên kết cha/mẹ.' };
    }

    return { ok: true };
};

module.exports = {
    MALE,
    FEMALE,
    normalizeBinaryGender,
    validateSpouseRoleGender,
    validateFamilyParents,
    validatePersonGenderWithFamilyRole,
    validatePersonLifeDates,
    assertCanDeleteTreePerson,
};
