process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { parsePageParams, finishPage } = require('../src/shared/utils/pagination');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const member = require('../src/modules/member/member.controller');

test('parsePageParams áp dụng mặc định, trần và bỏ giá trị rác', () => {
    assert.deepStrictEqual(parsePageParams({}), { limit: 200, beforeId: null });
    assert.deepStrictEqual(parsePageParams({ limit: '20', before_id: '55' }), { limit: 20, beforeId: 55 });
    assert.strictEqual(parsePageParams({ limit: '9999' }).limit, 200);
    assert.strictEqual(parsePageParams({ limit: '-5', before_id: 'abc' }).limit, 200);
    assert.strictEqual(parsePageParams({ before_id: 'abc' }).beforeId, null);
    assert.strictEqual(parsePageParams({ limit: '500' }, { defaultLimit: 50, maxLimit: 100 }).limit, 100);
});

test('finishPage báo còn trang sau và con trỏ kế tiếp', () => {
    const rows = [{ id: 9 }, { id: 8 }, { id: 7 }];
    const page = finishPage(rows, 2);
    assert.deepStrictEqual(page.items.map((r) => r.id), [9, 8]);
    assert.strictEqual(page.has_more, true);
    assert.strictEqual(page.next_before_id, 8);

    const last = finishPage(rows, 3);
    assert.strictEqual(last.has_more, false);
    assert.strictEqual(last.next_before_id, null);
});

test('getNotifications phân trang theo con trỏ', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM notifications/.test(sql)) {
            return [[{ id: 30, is_read: 0 }, { id: 29, is_read: 1 }, { id: 28, is_read: 0 }]];
        }
        return [[]];
    });
    const res = mockRes();
    await member.getNotifications({ user: { id: 5 }, query: { limit: '2', before_id: '40' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.notifications.length, 2);
    assert.strictEqual(res.body.has_more, true);
    assert.strictEqual(res.body.next_before_id, 29);
    assert.strictEqual(res.body.unread_count, 1);

    const query = mock.find(/FROM notifications/)[0];
    assert.match(query.sql, /\(created_at, id\) < \(SELECT n\.created_at, n\.id FROM notifications n WHERE n\.id = \?\)/);
    assert.deepStrictEqual(query.params.slice(-2), [40, 3]);
});
