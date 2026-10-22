process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const member = require('../src/modules/member/member.controller');
const manager = require('../src/modules/manager/eventTask.controller');

// Danh sách sự kiện: không gửi limit/before_id thì giữ hành vi cũ (tương thích client cũ).
test('getManagerEvents không gửi limit/before_id thì không LIMIT và không có has_more', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM events e/.test(sql) && !/COUNT\(\*\)/.test(sql)) return [[{ id: 3 }, { id: 2 }, { id: 1 }]];
        return [[]];
    });
    const res = mockRes();
    await manager.getManagerEvents({ user: { id: 1, role_id: 1 }, query: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.events.length, 3);
    assert.strictEqual(res.body.has_more, undefined);
    assert.doesNotMatch(mock.find(/FROM events e(?!.*COUNT)/)[0].sql, /LIMIT/);
});

test('getManagerEvents phân trang keyset theo (ngày bắt đầu, id) và trả has_more', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM events e/.test(sql) && !/COUNT\(\*\)/.test(sql)) return [[{ id: 30 }, { id: 29 }, { id: 28 }]];
        return [[]];
    });
    const res = mockRes();
    await manager.getManagerEvents({ user: { id: 1, role_id: 1 }, query: { limit: '2', before_id: '40', clan_id: '7' } }, res);
    assert.strictEqual(res.body.events.length, 2);
    assert.strictEqual(res.body.has_more, true);
    assert.strictEqual(res.body.next_before_id, 29);

    const query = mock.find(/FROM events e(?!.*COUNT)/)[0];
    assert.match(query.sql, /\(COALESCE\(e\.start_date, e\.event_date\), e\.id\) < \(SELECT/);
    assert.match(query.sql, /e\.clan_id = \?/);
    assert.deepStrictEqual(query.params, [7, 40, 3]);
});

test('getManagerEvents trang cuối: has_more=false và không có con trỏ', async () => {
    createMockDb(async (sql) => (/FROM events e/.test(sql) && !/COUNT\(\*\)/.test(sql) ? [[{ id: 5 }]] : [[]]));
    const res = mockRes();
    await manager.getManagerEvents({ user: { id: 1, role_id: 1 }, query: { limit: '10' } }, res);
    assert.strictEqual(res.body.has_more, false);
    assert.strictEqual(res.body.next_before_id, null);
});

test('getManagerEvents chặn limit quá lớn ở 100', async () => {
    const mock = createMockDb(async () => [[]]);
    const res = mockRes();
    await manager.getManagerEvents({ user: { id: 1, role_id: 1 }, query: { limit: '5000' } }, res);
    assert.strictEqual(mock.find(/FROM events e(?!.*COUNT)/)[0].params.slice(-1)[0], 101);
});

test('getFamilyMemories phân trang theo con trỏ, giữ bộ lọc quyền xem', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM family_memories fm/.test(sql)) return [[{ id: 20 }, { id: 19 }, { id: 18 }]];
        return [[{ id: 5, account_id: 5, clan_id: 1, person_id: 9, role_id: 3 }]];
    });
    const res = mockRes();
    await member.getFamilyMemories({ user: { id: 5, role_id: 3 }, query: { limit: '2', before_id: '25' } }, res);
    const query = mock.find(/FROM family_memories fm/)[0];
    assert.ok(query, 'phải truy vấn kỉ niệm');
    assert.strictEqual(res.body.memories.length, 2);
    assert.strictEqual(res.body.has_more, true);
    assert.strictEqual(res.body.next_before_id, 19);
    assert.match(query.sql, /fm\.status = 'approved'/);
    assert.match(query.sql, /\(fm\.created_at, fm\.id\) < \(SELECT c\.created_at, c\.id FROM family_memories c WHERE c\.id = \?\)/);
    assert.deepStrictEqual(query.params.slice(-2), [25, 3]);
});

test('getManagerEvents trang đầu kèm counts toàn dòng họ, trang sau thì không', async () => {
    const mock = createMockDb(async (sql) => {
        if (/COUNT\(\*\)/.test(sql)) return [[{ total: '12', ongoing: '2', ended: '7' }]];
        if (/FROM events e/.test(sql)) return [[{ id: 5 }]];
        return [[]];
    });
    const res = mockRes();
    await manager.getManagerEvents({ user: { id: 1, role_id: 1 }, query: { limit: '10', clan_id: '7' } }, res);
    assert.deepStrictEqual(res.body.counts, { total: 12, ongoing: 2, ended: 7 });
    const countQuery = mock.find(/COUNT\(\*\)/)[0];
    assert.match(countQuery.sql, /e\.clan_id = \?/);
    assert.deepStrictEqual(countQuery.params, [7]);

    const res2 = mockRes();
    await manager.getManagerEvents({ user: { id: 1, role_id: 1 }, query: { limit: '10', before_id: '9' } }, res2);
    assert.strictEqual(res2.body.counts, undefined);
});
