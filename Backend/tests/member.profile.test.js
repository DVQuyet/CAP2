process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const member = require('../src/modules/member/member.controller');

const accountRow = {
    account_id: 9,
    account_email: 'quanly@example.com',
    role_id: 2,
    status: 'active',
    profile_completed: 1,
    person_id: 5,
    display_name: 'Đinh Viết Quản',
    first_name: 'Quản',
    middle_name: 'Viết',
    surname: 'Đinh',
    hometown: 'Hà Tĩnh',
    gender: 1,
    birth_date: '1980-01-01',
    generation: 3,
    clan_id: 13,
    clan_name: 'Dòng họ Đinh',
};

test('GET /profile trả hồ sơ mà không tải cây gia phả như dashboard', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM accounts a/.test(sql) && /LEFT JOIN account_clans/.test(sql)) return [[accountRow]];
        if (/FROM families\s+WHERE father_id/.test(sql)) return [[{ id: 7, father_id: 5, mother_id: 6 }]];
        if (/FROM children WHERE family_id/.test(sql)) return [[{ person_id: 11 }, { person_id: 12 }]];
        return [[]];
    });
    const res = mockRes();
    await member.getProfile({ user: { id: 9 } }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.profile.display_name, 'Đinh Viết Quản');
    assert.strictEqual(res.body.profile.hometown, 'Hà Tĩnh');
    assert.strictEqual(res.body.profile.person_id, 5);
    assert.deepStrictEqual(res.body.profile.children_ids, [11, 12]);
    assert.strictEqual(res.body.clan.clan_name, 'Dòng họ Đinh');

    // Không truy vấn toàn bộ người/gia đình/sự kiện/thông báo của dòng họ.
    const treeQueries = mock.calls.filter((call) => /WHERE p\.clan_id = \?|FROM events|FROM notifications|manager_task_assignments/.test(call.sql));
    assert.strictEqual(treeQueries.length, 0);
});

test('GET /profile báo 404 khi tài khoản không còn', async () => {
    createMockDb(async () => [[]]);
    const res = mockRes();
    await member.getProfile({ user: { id: 404 } }, res);
    assert.strictEqual(res.statusCode, 404);
});
