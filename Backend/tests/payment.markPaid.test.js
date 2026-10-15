process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb } = require('./helpers.mockDb');
const { markPaymentAsPaid } = require('../src/modules/payment/payment.controller');

const payment = { id: 5, clan_id: 7, plan_id: 2, period_months: 1, billing_cycle: 'monthly', amount_vnd: 100000 };

const setup = ({ paymentStatus = 'pending', sub = null } = {}) =>
    createMockDb(async (sql) => {
        if (/SELECT status FROM payments/.test(sql)) return [[{ status: paymentStatus }]];
        if (/FROM subscriptions WHERE clan_id/.test(sql)) return [sub ? [sub] : []];
        return [{ affectedRows: 1 }];
    });

const baseTimeOf = (mock, re) => mock.find(re)[0].params[1];

test('webhook gửi trùng cho thanh toán đã paid không ghi nhận lần nữa', async () => {
    const mock = setup({ paymentStatus: 'paid' });
    await markPaymentAsPaid(payment, {});
    assert.strictEqual(mock.find(/UPDATE payments/).length, 0);
    assert.strictEqual(mock.find(/INSERT INTO subscriptions/).length, 0);
    assert.strictEqual(mock.find(/^ROLLBACK/).length, 1);
});

test('mua tiếp cùng gói còn hạn thì cộng dồn từ hạn hiện tại', async () => {
    const expires = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    const mock = setup({ sub: { plan_id: 2, status: 'active', expires_at: expires } });
    await markPaymentAsPaid(payment, {});
    assert.strictEqual(baseTimeOf(mock, /UPDATE payments/).getTime(), expires.getTime());
    assert.strictEqual(mock.find(/^COMMIT/).length, 1);
});

test('đổi gói hoặc gói hết hạn thì tính từ bây giờ', async () => {
    const expires = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    let mock = setup({ sub: { plan_id: 3, status: 'active', expires_at: expires } });
    const before = Date.now();
    await markPaymentAsPaid(payment, {});
    assert.ok(baseTimeOf(mock, /UPDATE payments/).getTime() >= before);

    const expired = new Date(Date.now() - 24 * 3600 * 1000);
    mock = setup({ sub: { plan_id: 2, status: 'active', expires_at: expired } });
    const before2 = Date.now();
    await markPaymentAsPaid(payment, {});
    assert.ok(baseTimeOf(mock, /UPDATE payments/).getTime() >= before2);
});
