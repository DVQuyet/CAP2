const assert = require('assert');

const {
    MALE,
    FEMALE,
    normalizeBinaryGender,
    validateFamilyParents,
    validateSpouseRoleGender,
    validatePersonGenderWithFamilyRole,
} = require('../src/modules/genealogy/familyValidation.service');

const unknown = { id: 1, gender: null };
const male = { id: 2, gender: MALE };
const female = { id: 3, gender: FEMALE };

assert.strictEqual(normalizeBinaryGender(MALE), MALE);
assert.strictEqual(normalizeBinaryGender(FEMALE), FEMALE);
assert.strictEqual(normalizeBinaryGender(null), null);
assert.strictEqual(normalizeBinaryGender(0), null);
assert.strictEqual(normalizeBinaryGender(3), null);

assert.strictEqual(validateSpouseRoleGender({ husbandPerson: male, wifePerson: unknown }).ok, true);
assert.strictEqual(validateSpouseRoleGender({ husbandPerson: unknown, wifePerson: female }).ok, true);
assert.strictEqual(validateSpouseRoleGender({ husbandPerson: male, wifePerson: female }).ok, true);

assert.strictEqual(
    validateSpouseRoleGender({ husbandPerson: female, wifePerson: unknown }).code,
    'FEMALE_AS_HUSBAND'
);
assert.strictEqual(
    validateSpouseRoleGender({ husbandPerson: unknown, wifePerson: male }).code,
    'MALE_AS_WIFE'
);
assert.strictEqual(
    validateSpouseRoleGender({ husbandPerson: male, wifePerson: male }).code,
    'SAME_GENDER_SPOUSE'
);
assert.strictEqual(
    validateSpouseRoleGender({ husbandPerson: female, wifePerson: female }).code,
    'SAME_GENDER_SPOUSE'
);

const makeRoleConnection = ({ fatherRows = [], motherRows = [] } = {}) => ({
    query: async(sql) => {
        if (sql.includes('father_id')) return [fatherRows];
        if (sql.includes('mother_id')) return [motherRows];
        return [[]];
    },
});

const makeFamilyConnection = (peopleRows = []) => ({
    query: async(sql) => {
        if (sql.includes('FROM people')) return [peopleRows];
        if (sql.includes('FROM families')) return [[]];
        return [[]];
    },
});

(async() => {
    const maleWithUnknownWife = await validateFamilyParents({
        connection: makeFamilyConnection([
            { id: 1, clan_id: 10, gender: MALE },
            { id: 2, clan_id: 10, gender: null },
        ]),
        clanId: 10,
        fatherId: 1,
        motherId: 2,
    });
    assert.strictEqual(maleWithUnknownWife.ok, true);

    const unknownHusbandWithFemale = await validateFamilyParents({
        connection: makeFamilyConnection([
            { id: 3, clan_id: 10, gender: null },
            { id: 4, clan_id: 10, gender: FEMALE },
        ]),
        clanId: 10,
        fatherId: 3,
        motherId: 4,
    });
    assert.strictEqual(unknownHusbandWithFemale.ok, true);

    const maleAsWifeInFamily = await validateFamilyParents({
        connection: makeFamilyConnection([
            { id: 5, clan_id: 10, gender: null },
            { id: 6, clan_id: 10, gender: MALE },
        ]),
        clanId: 10,
        fatherId: 5,
        motherId: 6,
    });
    assert.strictEqual(maleAsWifeInFamily.ok, false);
    assert.strictEqual(maleAsWifeInFamily.code, 'MALE_AS_WIFE');

    const femaleAsWife = await validatePersonGenderWithFamilyRole(
        makeRoleConnection({ fatherRows: [], motherRows: [{ id: 10 }] }),
        1,
        FEMALE
    );
    assert.strictEqual(femaleAsWife.ok, true);

    const maleAsHusband = await validatePersonGenderWithFamilyRole(
        makeRoleConnection({ fatherRows: [{ id: 10 }], motherRows: [] }),
        1,
        MALE
    );
    assert.strictEqual(maleAsHusband.ok, true);

    const femaleAsHusband = await validatePersonGenderWithFamilyRole(
        makeRoleConnection({ fatherRows: [{ id: 10 }], motherRows: [] }),
        1,
        FEMALE
    );
    assert.strictEqual(femaleAsHusband.ok, false);
    assert.strictEqual(femaleAsHusband.code, 'FEMALE_AS_HUSBAND');

    const maleAsWife = await validatePersonGenderWithFamilyRole(
        makeRoleConnection({ fatherRows: [], motherRows: [{ id: 10 }] }),
        1,
        MALE
    );
    assert.strictEqual(maleAsWife.ok, false);
    assert.strictEqual(maleAsWife.code, 'MALE_AS_WIFE');

    console.log('genealogy.spouseGender.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
