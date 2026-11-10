process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const groqClient = require('../src/modules/chatbot/groqClient');
const ai = require('../src/modules/ai/ai.controller');
const svc = require('../src/modules/ai/fundSummary.service');
const schemas = require('../src/shared/validation/schemas');

const NOW = new Date(2026, 9, 30); // 30/10/2026

test('resolveRange: tháng/quý/năm hiện tại và khoảng ngày tùy chọn', () => {
    assert.deepStrictEqual(svc.resolveRange({ period: 'month' }, NOW), { from: '2026-10-01', to: '2026-10-31', period: 'month', label: 'tháng 10/2026' });
    assert.deepStrictEqual(svc.resolveRange({ period: 'quarter' }, NOW), { from: '2026-10-01', to: '2026-12-31', period: 'quarter', label: 'quý 4/2026' });
    assert.deepStrictEqual(svc.resolveRange({ period: 'year' }, NOW), { from: '2026-01-01', to: '2026-12-31', period: 'year', label: 'năm 2026' });
    const custom = svc.resolveRange({ period: 'month', from: '2026-02-01', to: '2026-02-28' }, NOW);
    assert.strictEqual(custom.from, '2026-02-01');
    assert.ok(svc.resolveRange({ period: 'week' }, NOW).error);
    assert.ok(svc.resolveRange({ period: 'month', from: '2026-02-30', to: '2026-03-01' }, NOW).error);
    assert.ok(svc.resolveRange({ period: 'month', from: '2026-03-02', to: '2026-03-01' }, NOW).error);
    assert.ok(svc.resolveRange({ period: 'month', from: '2000-01-01', to: '2026-03-01' }, NOW).error);
    assert.ok(svc.resolveRange({ period: 'month', from: '2026-03-01' }, NOW).error);
});

const aggregates = {
    period: 'month', label: 'tháng 10/2026', from: '2026-10-01', to: '2026-10-31',
    total_income: 12000000, income_count: 5, contributor_count: 4,
    total_expense: 3000000, expense_count: 2, net_change: 9000000,
    opening_balance: 1500000, closing_balance: 10500000,
    top_expense_categories: [{ name: 'Tu sửa', total: 2000000, count: 1 }],
    top_income_sources: [{ name: 'Quỹ khuyến học 2026', total: 12000000, count: 5 }],
    large_threshold: 1500000, large_income_count: 2, large_expense_count: 1,
};

test('findUnverifiedNumbers: chấp nhận số trong dữ kiện, gắn cờ số lạ', () => {
    const good = 'Trong tháng 10/2026, quỹ thu 12.000.000 đồng từ 5 khoản do 4 người đóng góp và chi 3.000.000 đồng. Số dư cuối kỳ là 10.500.000 đồng.';
    assert.deepStrictEqual(svc.findUnverifiedNumbers(good, aggregates), []);
    const bad = 'Quỹ thu 12.000.000 đồng, tăng 25% so với kỳ trước, chi 7.500.000 đồng và có 9 người mới.';
    const flagged = svc.findUnverifiedNumbers(bad, aggregates);
    assert.ok(flagged.includes('25'));
    assert.ok(flagged.includes('7.500.000'));
    assert.ok(flagged.includes('9'));
    assert.ok(!flagged.includes('12.000.000'));
    assert.ok(svc.findUnverifiedNumbers('Thu khoảng 12 triệu đồng', aggregates).includes('12'));
});

test('buildFactsText không chứa tên người; prompt cấm bịa số', () => {
    const facts = svc.buildFactsText(aggregates);
    assert.ok(facts.includes('12.000.000 đồng') && facts.includes('"Tu sửa"'));
    assert.ok(/CHỈ dùng các con số/.test(svc.buildSystemPrompt()));
});

test('schema: kỳ bắt buộc và đúng giá trị', () => {
    const run = (body) => new Promise((resolve) => {
        const res = mockRes();
        schemas.generateFundSummary({ body, query: {}, params: {} }, res, () => resolve({ ok: true }));
        if (res.statusCode === 400) resolve({ ok: false, status: 400, body: res.body });
    });
    return Promise.all([run({}), run({ period: 'week' }), run({ period: 'quarter' }), run({ period: 'month', from: 'abc' })]).then(([a, b, c, d]) => {
        assert.strictEqual(a.ok, false);
        assert.strictEqual(b.ok, false);
        assert.strictEqual(c.ok, true);
        assert.strictEqual(d.ok, false);
    });
});

const GOOD = 'Trong kỳ, quỹ thu 12.000.000 đồng từ 5 khoản và chi 3.000.000 đồng, số dư cuối kỳ là 10.500.000 đồng.';

function setup({ configured = true, reply = GOOD, empty = false } = {}) {
    const groqCalls = [];
    groqClient.isGroqConfigured = () => configured;
    groqClient.callGroq = async (system, user) => { groqCalls.push({ system, user }); return reply; };
    const mock = createMockDb(async (sql, params) => {
        if (/FROM accounts a/.test(sql)) return [[{ account_id: 9, clan_id: 1 }]];
        if (empty) {
            if (/COUNT\(DISTINCT person_id\)/.test(sql)) return [[{ total: 0, cnt: 0, contributors: 0 }]];
            return [[{ total: 0, cnt: 0 }]];
        }
        if (/COUNT\(DISTINCT person_id\)/.test(sql)) return [[{ total: 12000000, cnt: 5, contributors: 4 }]];
        if (/FROM event_contributions WHERE clan_id = \? AND status = 'approved' AND contribution_date < \?/.test(sql)) return [[{ total: 1500000 }]];
        if (/FROM event_costs WHERE clan_id = \? AND status = 'approved' AND DATE\(created_at\) < \?/.test(sql)) return [[{ total: 0 }]];
        if (/GROUP BY category/.test(sql)) return [[{ category: 'Tu sửa', total: 2000000, cnt: 1 }]];
        if (/GROUP BY ec\.campaign_id/.test(sql)) return [[{ name: 'Quỹ khuyến học', total: 12000000, cnt: 5 }]];
        if (/COUNT\(\*\) AS cnt FROM event_contributions/.test(sql)) return [[{ cnt: 2 }]];
        if (/COUNT\(\*\) AS cnt FROM event_costs/.test(sql) && /amount >= \?/.test(sql)) return [[{ cnt: 1 }]];
        if (/FROM event_costs/.test(sql)) return [[{ total: 3000000, cnt: 2 }]];
        return [[]];
    });
    return { groqCalls, mock };
}

const member = { id: 9, role_id: 3, role_name: 'member' };
const admin = { id: 1, role_id: 1, role_name: 'admin' };
const call = async (user, body, query = {}) => {
    const res = mockRes();
    await ai.generateFundSummaryAI({ user, body, query, headers: {}, params: {} }, res);
    return res;
};

test('tóm tắt: số liệu do server tính, prompt chỉ gồm số liệu, trả numbers + unverified rỗng, không ghi DB', async () => {
    const { groqCalls, mock } = setup();
    const res = await call(member, { period: 'month', total_income: 999 /* client gửi số giả: bị bỏ qua */ });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.numbers.total_income, 12000000);
    assert.strictEqual(res.body.numbers.net_change, 9000000);
    assert.strictEqual(res.body.numbers.closing_balance, 10500000);
    assert.strictEqual(res.body.numbers.contributor_count, 4);
    assert.strictEqual(res.body.numbers.large_income_count, 2);
    assert.deepStrictEqual(res.body.unverified, []);
    assert.strictEqual(res.body.ai, true);
    assert.ok(groqCalls[0].user.includes('12.000.000 đồng') && !groqCalls[0].user.includes('999'));
    assert.strictEqual(mock.find(/INSERT|UPDATE|DELETE/i).length, 0);
    // mọi truy vấn lọc theo dòng họ của người dùng (clan 1) và chỉ khoản đã duyệt
    mock.calls.filter((c) => /event_(contributions|costs)/.test(c.sql)).forEach((c) => {
        assert.strictEqual(c.params[0], 1);
        assert.ok(/status = 'approved'/.test(c.sql));
    });
});

test('tóm tắt: số lạ trong đầu ra AI bị gắn cờ unverified', async () => {
    setup({ reply: 'Quỹ thu 12.000.000 đồng, tăng 40% và có 77 người đóng góp.' });
    const res = await call(member, { period: 'year' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.unverified.includes('40'));
    assert.ok(res.body.unverified.includes('77'));
});

test('tóm tắt: thiếu GROQ_API_KEY -> 503 AI_UNAVAILABLE, không đụng DB', async () => {
    const { mock } = setup({ configured: false });
    const res = await call(member, { period: 'month' });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'AI_UNAVAILABLE');
    assert.strictEqual(mock.calls.length, 0);
});

test('tóm tắt: kỳ rỗng thì không gọi AI', async () => {
    const { groqCalls } = setup({ empty: true });
    const res = await call(member, { period: 'month' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.ai, false);
    assert.strictEqual(groqCalls.length, 0);
    assert.ok(res.body.summary.includes('chưa có khoản thu'));
});

test('tóm tắt: AI trả rỗng -> 503; khoảng ngày sai -> 400; dòng họ khác -> 403', async () => {
    setup({ reply: '' });
    assert.strictEqual((await call(member, { period: 'month' })).statusCode, 503);
    setup();
    assert.strictEqual((await call(member, { period: 'month', from: '2026-05-01', to: '2026-04-01' })).statusCode, 400);
    const other = await call(member, { period: 'month', clan_id: 2 });
    assert.strictEqual(other.statusCode, 403);
});

test('admin chọn dòng họ bằng clan_id', async () => {
    const { mock } = setup();
    const res = await call(admin, { period: 'month', clan_id: 7 });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.clan_id, 7);
    assert.ok(mock.find(/event_contributions/).every((c) => c.params[0] === 7));
});
