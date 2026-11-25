// Astra điểm 1: TiDB không có trigger tăng family_graph_versions; phiên bản đồ thị nay tính từ dữ liệu cây.
const test = require('node:test');
const assert = require('assert');
const db = require('../src/config/db');
const graphVersion = require('../src/modules/chatbot/graphVersion');
const engine = require('../src/modules/chatbot/relationshipEngine');

test('computeGraphVersion trả số từ câu dấu vân tay, đủ 5 tham số clan', async () => {
    let seen;
    const version = await graphVersion.computeGraphVersion(7, async (sql, params) => {
        seen = { sql, params };
        return [[{ graph_version: 12345 }]];
    });
    assert.strictEqual(version, 12345);
    assert.deepStrictEqual(seen.params, [7, 7, 7, 7, 7]);
    assert.match(seen.sql, /FROM people p/);
    assert.match(seen.sql, /FROM families f/);
    assert.match(seen.sql, /FROM children c/);
});

test('computeGraphVersion: DB cũ thiếu cột/bảng thì về 1, lỗi khác ném ra', async () => {
    const fail = (code) => async () => { const e = new Error(code); e.code = code; throw e; };
    assert.strictEqual(await graphVersion.computeGraphVersion(1, fail('ER_BAD_FIELD_ERROR')), 1);
    assert.strictEqual(await graphVersion.computeGraphVersion(1, fail('ER_NO_SUCH_TABLE')), 1);
    await assert.rejects(graphVersion.computeGraphVersion(1, fail('ECONNREFUSED')), /ECONNREFUSED/);
});

test('getGraphVersion nhớ tạm trong cửa sổ ngắn, forgetGraphVersion xóa nhớ', async () => {
    graphVersion.forgetGraphVersion();
    let calls = 0;
    const query = async () => { calls += 1; return [[{ graph_version: 100 + calls }]]; };
    assert.strictEqual(await graphVersion.getGraphVersion(9, { query }), 101);
    assert.strictEqual(await graphVersion.getGraphVersion(9, { query }), 101);
    assert.strictEqual(calls, 1);
    graphVersion.forgetGraphVersion(9);
    assert.strictEqual(await graphVersion.getGraphVersion(9, { query }), 102);
    graphVersion.forgetGraphVersion();
});

test('loadClanGraph đọc lại cây khi dữ liệu đổi (không cần trigger), dùng cache khi không đổi', async (t) => {
    const original = db.query;
    t.after(() => { db.query = original; graphVersion.forgetGraphVersion(); });
    let fingerprint = 500;
    let peopleLoads = 0;
    let peopleName = 'Nguyễn Văn A';
    db.query = async (sql) => {
        const text = String(sql);
        if (text.includes('AS graph_version')) return [[{ graph_version: fingerprint }]];
        if (/FROM people p/.test(text) && !/archived/i.test(text.split('FROM people p')[0])) {
            peopleLoads += 1;
            return [[{ id: 1, clan_id: 42, display_name: peopleName, gender: 1, generation: 1 }]];
        }
        return [[]];
    };
    graphVersion.forgetGraphVersion();
    engine.clearClanCache(42);

    const first = await engine.loadClanGraph(42, { tier: 'all' });
    const loadsAfterFirst = peopleLoads;
    assert.ok(loadsAfterFirst >= 1);
    assert.strictEqual(first.graphVersion, 500);

    graphVersion.forgetGraphVersion(42);
    const same = await engine.loadClanGraph(42, { tier: 'all' });
    assert.strictEqual(peopleLoads, loadsAfterFirst, 'không đổi dữ liệu thì dùng cache');
    assert.strictEqual(same, first);

    // Có người sửa cây bằng bất kỳ đường nào: dấu vân tay đổi, lần hỏi sau đọc lại.
    fingerprint = 501;
    peopleName = 'Nguyễn Văn B';
    graphVersion.forgetGraphVersion(42);
    const fresh = await engine.loadClanGraph(42, { tier: 'all' });
    assert.ok(peopleLoads > loadsAfterFirst, 'dữ liệu đổi thì đọc lại');
    assert.strictEqual(fresh.graphVersion, 501);
    engine.clearClanCache(42);
});
