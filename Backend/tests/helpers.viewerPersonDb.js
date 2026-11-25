const assert = require('node:assert/strict');
const { createMockDb } = require('./helpers.mockDb');

const CLAN = 13;
const OTHER_CLAN = 99;
const people = new Map([[18, CLAN], [21, CLAN], [22, CLAN], [23, CLAN], [24, OTHER_CLAN], [25, OTHER_CLAN],
    [31, OTHER_CLAN], [32, OTHER_CLAN], [40, CLAN], [41, CLAN], [42, CLAN], [77, CLAN]]);
// Mỗi dòng gồm account_id, clan_id, person_id và role hoặc status.
const links = [[9, CLAN, 18, 'self'], [8, CLAN, 77, 'self'], [9, OTHER_CLAN, 31, 'self'], [9, CLAN, 32, 'self'],
    [9, CLAN, 40, 'manager'], [9, CLAN, 41, 'viewer'], [9, CLAN, 42, 'editor']];
const memberships = [[9, CLAN, 22, 'active'], [8, CLAN, 23, 'pending'],
    [9, OTHER_CLAN, 24, 'rejected'], [8, OTHER_CLAN, 25, 'active']];

// accounts.person_id hiện tại (hồ sơ chính); test đặt trước khi gọi, token không còn được tin.
const primaryOf = new Map();
const setPrimary = (accountId, personId) => primaryOf.set(accountId, personId);

const mockAccount = ({ missingTable = false } = {}) => createMockDb(async (sql, [first, clanId]) => {
    const inClan = (personId) => people.get(personId) === clanId;
    if (/FROM accounts a JOIN people p/.test(sql)) {
        assert.match(sql, /WHERE a.id = \? AND p.clan_id = \?/);
        const primary = primaryOf.get(first);
        return [inClan(primary) ? [{ id: primary }] : []];
    }
    const matching = (rows, type) => rows.filter(([accountId, clan, , state]) =>
        accountId === first && clan === clanId && state === type);
    if (/FROM account_people/.test(sql)) {
        assert.match(sql, /JOIN people p ON p.id = ap.person_id AND p.clan_id = ap.clan_id/);
        assert.match(sql, /WHERE ap.account_id = \? AND ap.clan_id = \? AND ap.role = 'self'/);
        if (missingTable) {
            const error = new Error('no table');
            error.code = 'ER_NO_SUCH_TABLE';
            throw error;
        }
        return [matching(links, 'self').filter((row) => inClan(row[2])).map((row) => ({ person_id: row[2] }))];
    }
    if (/FROM account_clans/.test(sql)) {
        assert.match(sql, /WHERE ac.account_id = \? AND ac.clan_id = \? AND ac.status = 'active'/);
        const active = matching(memberships, 'active');
        if (/^SELECT 1 /.test(sql)) return [active.length ? [{ 1: 1 }] : []];
        assert.match(sql, /JOIN people p ON p.id = ac.person_id AND p.clan_id = ac.clan_id/);
        return [active.filter((row) => inClan(row[2])).map((row) => ({ person_id: row[2] }))];
    }
    return [[]];
});

module.exports = { CLAN, OTHER_CLAN, mockAccount, setPrimary };
