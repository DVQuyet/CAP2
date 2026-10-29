// Những truy vấn chỉ MySQL thật mới kiểm chứng được (test đơn vị dùng DB giả): phân trang row-value và giao dịch thanh toán.
const test = require('node:test');
const assert = require('assert');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');
const { markPaymentAsPaid } = require('../src/modules/payment/payment.controller');

let server;

test.before(async () => { server = await startServer({ env: { AUTH_ACCOUNT_CACHE_TTL_MS: '0' } }); });
test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

test('phân trang keyset (created_at, id) < (...): không trùng, không sót, đúng thứ tự, has_more đúng, kể cả khi trùng thời gian', async () => {
    const clanId = await createTempClan('PG');
    const member = await createTempAccount({ role: 'member', clanId });
    const token = await login(server.baseUrl, member.email, member.password);

    // 4 thông báo trùng đúng một giây (kiểm tra phân xử bằng id) + 3 thông báo ở các thời điểm khác nhau.
    const times = ['2026-10-01 10:00:00', '2026-10-01 10:00:00', '2026-10-01 10:00:00', '2026-10-01 10:00:00', '2026-10-02 08:00:00', '2026-09-30 23:59:59', '2026-10-03 12:30:00'];
    const inserted = [];
    for (const [index, createdAt] of times.entries()) {
        const [result] = await db.query(
            "INSERT INTO notifications (receiver_person_id, receiver_account_id, type, title, message, created_at) VALUES (?, ?, 'itest', ?, 'ITEST', ?)",
            [member.personId, member.id, `ITEST ${index}`, createdAt]
        );
        inserted.push({ id: result.insertId, createdAt });
    }
    const expectedOrder = [...inserted]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
        .map((item) => item.id);

    for (const limit of [3, 2, 1, 7, 10]) {
        const collected = [];
        const hasMoreFlags = [];
        let beforeId = null;
        for (let page = 0; page < 20; page += 1) {
            const query = `limit=${limit}${beforeId ? `&before_id=${beforeId}` : ''}`;
            const result = await api(server.baseUrl, 'GET', `/api/member/notifications?${query}`, { token });
            assert.strictEqual(result.status, 200, JSON.stringify(result.data));
            collected.push(...result.data.notifications.map((item) => item.id));
            hasMoreFlags.push(result.data.has_more);
            if (!result.data.has_more) {
                assert.strictEqual(result.data.next_before_id, null);
                break;
            }
            assert.ok(result.data.next_before_id, 'còn trang sau thì phải có next_before_id');
            beforeId = result.data.next_before_id;
        }
        assert.deepStrictEqual(collected, expectedOrder, `limit=${limit}: phải đủ ${inserted.length} bản ghi, không trùng, đúng thứ tự`);
        assert.strictEqual(hasMoreFlags[hasMoreFlags.length - 1], false);
        assert.ok(hasMoreFlags.slice(0, -1).every(Boolean), `limit=${limit}: has_more phải true ở mọi trang trừ trang cuối`);
    }
});

async function createPendingPayment(clanId, planId, accountId, label) {
    const orderCode = `ITEST${Date.now()}${label}`;
    const [result] = await db.query(
        `INSERT INTO payments (clan_id, plan_id, payer_account_id, provider, order_code, amount_vnd, unit_amount_vnd, period_quantity, period_unit, period_months, billing_cycle, status)
         VALUES (?, ?, ?, 'manual', ?, 100000, 100000, 1, 'month', 1, 'monthly', 'pending')`,
        [clanId, planId, accountId, orderCode]
    );
    const [rows] = await db.query('SELECT * FROM payments WHERE id = ?', [result.insertId]);
    return rows[0];
}

const subscriptionOf = async (clanId) => (await db.query(
    "SELECT status, plan_id, DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expires_text, TIMESTAMPDIFF(HOUR, NOW(), expires_at) AS hours_left FROM subscriptions WHERE clan_id = ?", [clanId]
))[0][0];

test('thanh toán (FOR UPDATE, DATE_ADD): gọi trùng đồng thời chỉ ghi nhận một lần; mua tiếp cùng gói thì cộng dồn hạn', async () => {
    const clanId = await createTempClan('PAY');
    const payer = await createTempAccount({ role: 'manager', clanId });
    const planId = (await subscriptionOf(clanId)).plan_id;

    // 1) Hai lần gọi đồng thời cho cùng một giao dịch (webhook gửi trùng).
    const first = await createPendingPayment(clanId, planId, payer.id, 'A');
    await Promise.all([markPaymentAsPaid(first, { itest: true }), markPaymentAsPaid(first, { itest: true })]);
    const afterFirst = await subscriptionOf(clanId);
    assert.strictEqual(afterFirst.status, 'active');
    // Cho phép lệch múi giờ (gốc DATE_ADD là Date của JS = múi giờ máy chạy, còn NOW() là múi giờ DB; trên Render cả hai UTC).
    assert.ok(afterFirst.hours_left >= 27 * 24 && afterFirst.hours_left <= 31 * 24 + 14, `hạn còn ${afterFirst.hours_left} giờ: phải xấp xỉ 1 tháng, không phải 2`);
    const [[paid]] = await db.query('SELECT status, paid_at, period_expires_at FROM payments WHERE id = ?', [first.id]);
    assert.strictEqual(paid.status, 'paid');
    assert.ok(paid.paid_at);

    // 2) Gọi lại tuần tự: bỏ qua, hạn không đổi.
    const expiryAfterFirst = afterFirst.expires_text;
    await markPaymentAsPaid(first, { itest: true });
    assert.strictEqual((await subscriptionOf(clanId)).expires_text, expiryAfterFirst);

    // 3) Mua tiếp cùng gói khi còn hạn: cộng dồn từ hạn hiện tại (DATE_ADD(hạn cũ, 1 tháng)), không tính lại từ bây giờ.
    const [[expected]] = await db.query("SELECT DATE_FORMAT(DATE_ADD(?, INTERVAL 1 MONTH), '%Y-%m-%d %H:%i:%s') AS next", [expiryAfterFirst]);
    const second = await createPendingPayment(clanId, planId, payer.id, 'B');
    await markPaymentAsPaid(second, { itest: true });
    assert.strictEqual((await subscriptionOf(clanId)).expires_text, expected.next);
});
