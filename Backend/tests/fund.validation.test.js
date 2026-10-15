process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const fund = require('../src/modules/fund/fund.controller');

// Dòng họ 7; chỉ person 100 (của member) và 101, campaign 50, event 60 thuộc dòng họ 7.
const ownedIds = { people: [100, 101], fund_campaigns: [50], events: [60] };

const setup = ({ affectedRows = 1 } = {}) =>
    createMockDb(async (sql, params) => {
        if (/SELECT p\.clan_id FROM accounts a/.test(sql)) return [[{ clan_id: 7 }]];
        if (/SELECT person_id FROM accounts/.test(sql)) return [[{ person_id: 100 }]];
        const scoped = sql.match(/SELECT 1 FROM (people|fund_campaigns|events) WHERE id = \? AND clan_id = \?/);
        if (scoped) return [ownedIds[scoped[1]].includes(Number(params[0])) && Number(params[1]) === 7 ? [{ 1: 1 }] : []];
        if (/INSERT INTO event_contributions/.test(sql)) return [{ insertId: 1 }];
        if (/INSERT INTO event_costs/.test(sql)) return [{ insertId: 2 }];
        if (/UPDATE event_contributions/.test(sql)) return [{ affectedRows }];
        return [[]];
    });

const member = { id: 9, role_id: 3, role_name: 'member' };
const manager = { id: 8, role_id: 2, role_name: 'manager' };

test('member ghi khoản thu luôn là của chính mình và chờ duyệt', async () => {
    const mock = setup();
    const res = mockRes();
    await fund.addIncome({ user: member, body: { amount: 1000, person_id: 999, campaign_id: 50 } }, res);
    assert.strictEqual(res.statusCode, 200);
    const insert = mock.find(/INSERT INTO event_contributions/)[0];
    assert.strictEqual(insert.params[3], 100);
    assert.strictEqual(insert.params[8], 'pending');
});

test('khoản thu với đợt quỹ của dòng họ khác bị từ chối', async () => {
    const mock = setup();
    const res = mockRes();
    await fund.addIncome({ user: manager, body: { amount: 1000, campaign_id: 999 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(mock.find(/INSERT INTO event_contributions/).length, 0);
});

test('manager ghi khoản thu cho người cùng dòng họ được duyệt ngay', async () => {
    const mock = setup();
    const res = mockRes();
    await fund.addIncome({ user: manager, body: { amount: 1000, person_id: 101 } }, res);
    assert.strictEqual(res.statusCode, 200);
    const insert = mock.find(/INSERT INTO event_contributions/)[0];
    assert.strictEqual(insert.params[3], 101);
    assert.strictEqual(insert.params[8], 'approved');
});

test('khoản chi với người nhận ngoài dòng họ bị từ chối', async () => {
    const mock = setup();
    const res = mockRes();
    await fund.addExpense({ user: manager, body: { amount: 500, recipient_person_id: 999 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(mock.find(/INSERT INTO event_costs/).length, 0);
});

test('approvePayment từ chối trạng thái lạ và id không tồn tại', async () => {
    let mock = setup();
    let res = mockRes();
    await fund.approvePayment({ user: manager, body: { transaction_id: 1, status: 'paid' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(mock.find(/UPDATE event_contributions/).length, 0);

    mock = setup({ affectedRows: 0 });
    res = mockRes();
    await fund.approvePayment({ user: manager, body: { transaction_id: 999, status: 'approved' } }, res);
    assert.strictEqual(res.statusCode, 404);

    mock = setup();
    res = mockRes();
    await fund.approvePayment({ user: manager, body: { transaction_id: 1, status: 'approved' } }, res);
    assert.strictEqual(res.statusCode, 200);
});
