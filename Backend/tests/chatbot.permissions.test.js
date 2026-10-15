process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');
const memberSearch = require('../src/modules/chatbot/memberSearchService');
const me = require('../src/modules/me/me.controller');

// Ông Hòa (3) có vợ cả Lan (6) và vợ lẽ Cúc (7); quan hệ vợ lẽ đặt "chỉ quản lý được xem".
const people = [
    { id: 3, clan_id: 13, display_name: 'Đinh Văn Hòa', gender: 1, generation: 2, is_living: 0 },
    { id: 6, clan_id: 13, display_name: 'Trần Thị Lan', gender: 2, generation: 2, is_living: 0 },
    { id: 7, clan_id: 13, display_name: 'Lê Thị Cúc', gender: 2, generation: 2, is_living: 0 },
];
const families = [
    { id: 2, clan_id: 13, father_id: 3, mother_id: 6, relationship_status: 'active', union_type: 'marriage', visibility: 'public' },
    { id: 3, clan_id: 13, father_id: 3, mother_id: 7, relationship_status: 'active', union_type: 'concubine', visibility: 'managers' },
];

const mockClan = () => createMockDb(async (sql) => {
    if (/^SELECT p\.\* FROM people p/.test(sql)) return [people];
    if (/^SELECT \* FROM families WHERE clan_id/.test(sql)) return [families];
    if (/FROM people p WHERE p\.clan_id = \? AND \( p\.display_name LIKE/.test(sql)) return [people.filter((row) => /Cúc/.test(row.display_name))];
    return [[]];
});

test('thành viên thường không thấy quan hệ nhạy cảm, quản lý thì thấy', async () => {
    mockClan();
    relationshipEngine.clearClanCache(13);
    const memberView = await relationshipEngine.runWithViewer({ canSeeSensitive: false }, () => relationshipEngine.getSpousesOf(3, { clanId: 13 }));
    assert.deepStrictEqual(memberView.map((person) => person.id), [6]);
    const managerView = await relationshipEngine.runWithViewer({ canSeeSensitive: true }, () => relationshipEngine.getSpousesOf(3, { clanId: 13 }));
    assert.deepStrictEqual(managerView.map((person) => person.id).sort(), [6, 7]);
});

test('người chỉ có quan hệ ẩn không được tìm thấy qua trợ lý với thành viên thường', async () => {
    mockClan();
    relationshipEngine.clearClanCache(13);
    const member = await relationshipEngine.runWithViewer({ canSeeSensitive: false }, () => memberSearch.resolvePerson({ clanId: 13, names: ['Lê Thị Cúc'] }));
    assert.strictEqual(member.status, 'not_found');
    const manager = await relationshipEngine.runWithViewer({ canSeeSensitive: true }, () => memberSearch.resolvePerson({ clanId: 13, names: ['Lê Thị Cúc'] }));
    assert.strictEqual(manager.status, 'resolved');
});

// ---- Chọn "bạn là ai" trong khung chat ----
const setupContext = ({ person, ownerAccountId = null, clanOfAccount = 13 }) => createMockDb(async (sql, params) => {
    if (/FROM accounts a LEFT JOIN account_people ap/.test(sql)) {
        return [[{ account_id: 9, role_id: 3, account_person_id: null, mapped_person_id: null, mapped_clan_id: null, membership_person_id: null, membership_clan_id: clanOfAccount }]];
    }
    if (/SELECT id, clan_name FROM clans/.test(sql)) return [[{ id: clanOfAccount, clan_name: 'Họ Đinh' }]];
    if (/FROM people WHERE id = \? LIMIT 1 FOR UPDATE/.test(sql)) return [[person].filter(Boolean)];
    if (/SELECT id FROM accounts WHERE person_id = \? AND id <> \?/.test(sql)) return [ownerAccountId ? [{ id: ownerAccountId }] : []];
    return [[]];
});

const callSetCurrentPerson = async (body) => {
    const res = mockRes();
    await me.setCurrentPerson({ user: { id: 9, role_id: 3, role_name: 'member' }, body }, res);
    return res;
};

test('không thể chọn người ở dòng họ khác bằng cách gửi clanId khác', async () => {
    setupContext({ person: { id: 501, clan_id: 99, display_name: 'Người họ khác', is_living: 1 } });
    const res = await callSetCurrentPerson({ personId: 501, clanId: 99 });
    assert.strictEqual(res.statusCode, 403);
});

test('không nhận hồ sơ đã thuộc tài khoản khác, không chọn người đã mất', async () => {
    setupContext({ person: { id: 21, clan_id: 13, display_name: 'Đinh Văn Nam', is_living: 1 }, ownerAccountId: 44 });
    assert.strictEqual((await callSetCurrentPerson({ personId: 21, clanId: 13 })).statusCode, 409);

    setupContext({ person: { id: 1, clan_id: 13, display_name: 'Đinh Công Thành', is_living: 0 } });
    assert.strictEqual((await callSetCurrentPerson({ personId: 1, clanId: 13 })).statusCode, 400);
});

test('chọn hợp lệ chỉ lưu góc nhìn cho trợ lý, không gắn tài khoản với hồ sơ', async () => {
    const mock = setupContext({ person: { id: 18, clan_id: 13, display_name: 'Đinh Thị Linh', is_living: 1 } });
    const res = await callSetCurrentPerson({ personId: 18, clanId: 13 });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.currentMemberId, 18);
    assert.strictEqual(mock.find(/UPDATE accounts SET person_id/).length, 0);
    assert.strictEqual(mock.find(/INSERT INTO account_clans/).length, 0);
    assert.strictEqual(mock.find(/INSERT INTO account_people/).length, 1);
});
