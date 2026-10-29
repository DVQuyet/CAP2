process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const dup = require('../src/modules/genealogy/duplicates.service');
const controller = require('../src/modules/genealogy/duplicates.controller');
const schemas = require('../src/shared/validation/schemas');

const word = (n) => { let x = n * 7919 + 13; let out = ''; for (let k = 0; k < 6; k += 1) { out += String.fromCharCode(97 + (x % 26)); x = Math.floor(x / 26) + k * 31 + 7; } return out; };

const P = (id, name, extra = {}) => ({
    id, display_name: name, gender: 1, generation: 3,
    birth_date: '1980-05-01', birth_date_precision: 'exact', death_date: null, is_living: 1, ...extra,
});

test('normalizeName bỏ dấu, đ, hoa thường, khoảng trắng', () => {
    assert.strictEqual(dup.normalizeName('  Đinh  Văn   Ân '), 'dinh van an');
    assert.strictEqual(dup.normalizeName('Nguyễn Thị Hương!'), 'nguyen thi huong');
});

test('trùng tên + năm sinh + cha mẹ -> điểm cao, có lý do', () => {
    const rows = {
        people: [P(1, 'Đinh Văn Ba'), P(2, 'Dinh Van Ba'), P(10, 'Cha'), P(11, 'Mẹ', { gender: 2 })],
        families: [{ id: 100, father_id: 10, mother_id: 11 }],
        children: [{ family_id: 100, person_id: 1 }, { family_id: 100, person_id: 2 }],
    };
    const { pairs } = dup.findDuplicateCandidates(rows);
    assert.strictEqual(pairs.length, 1);
    assert.strictEqual(pairs[0].key, '1-2');
    assert.ok(pairs[0].score >= 85 && pairs[0].confidence === 'high');
    const codes = pairs[0].reasons.map((r) => r.code);
    ['name_exact', 'birth_year_same', 'same_parents', 'same_generation'].forEach((c) => assert.ok(codes.includes(c), c));
});

test('khác giới, cha-con, vợ chồng, chênh năm sinh quá lớn -> không là ứng viên', () => {
    const rows = {
        people: [
            P(1, 'Đinh Văn An'), P(2, 'Đinh Văn An', { gender: 2 }),
            P(3, 'Lê Văn Bình'), P(4, 'Lê Văn Bình', { birth_date: '2005-01-01' }),
            P(5, 'Trần Minh Cường'), P(6, 'Trần Minh Cường', { birth_date: '1950-01-01' }),
        ],
        families: [{ id: 1, father_id: 3, mother_id: null }],
        children: [{ family_id: 1, person_id: 4 }],
    };
    assert.strictEqual(dup.findDuplicateCandidates(rows).pairs.length, 0);
});

test('năm sinh chỉ biết năm: so theo năm; precision unknown bị bỏ qua', () => {
    const base = { people: [P(1, 'Phạm Văn Dũng', { birth_date: '1940-01-01', birth_date_precision: 'year' }), P(2, 'Phạm Văn Dũng', { birth_date: '1940-12-31', birth_date_precision: 'year' })], families: [], children: [] };
    const found = dup.findDuplicateCandidates(base).pairs[0];
    assert.ok(found.reasons.some((r) => r.code === 'birth_year_same'));
    assert.ok(!found.reasons.some((r) => r.code === 'birth_date_same'));
    base.people[1].birth_date_precision = 'unknown';
    assert.ok(!dup.findDuplicateCandidates(base).pairs[0].reasons.some((r) => r.code === 'birth_year_same'));
});

test('lỗi gõ 1 ký tự vẫn bắt được; tên khác hẳn thì không', () => {
    const rows = { people: [P(1, 'Hoàng Văn Em'), P(2, 'Hoàng Văn Emm'), P(3, 'Hoàng Văn Giang')], families: [], children: [] };
    const keys = dup.findDuplicateCandidates(rows).pairs.map((p) => p.key);
    assert.deepStrictEqual(keys, ['1-2']);
});

test('bỏ qua cặp đã dismiss và phân trang', () => {
    const people = [];
    for (let i = 0; i < 6; i += 1) { people.push(P(i * 2 + 1, `Vũ Văn ${word(i)}`), P(i * 2 + 2, `Vu Van ${word(i)}`)); }
    const rows = { people, families: [], children: [] };
    assert.strictEqual(dup.findDuplicateCandidates(rows).pairs.length, 6);
    const found = dup.findDuplicateCandidates(rows, { dismissed: new Set(['1-2']) });
    assert.strictEqual(found.pairs.length, 5);
    const page = dup.paginate(found, { limit: 2, offset: 4 });
    assert.strictEqual(page.total, 5);
    assert.strictEqual(page.pairs.length, 1);
    assert.ok(page.pairs[0].a.name && 'birth' in page.pairs[0].a);
});

test('hiệu năng: 3000 người khác tên không tạo O(n^2) cặp', () => {
    const people = [];
    for (let i = 0; i < 3000; i += 1) people.push(P(i + 1, `${word(i % 50)} ${word(1000 + (i % 7))} ${word(2000 + i)}`));
    const started = Date.now();
    const { pairs } = dup.findDuplicateCandidates({ people, families: [], children: [] });
    assert.strictEqual(pairs.length, 0);
    assert.ok(Date.now() - started < 3000);
});

const rowsForDb = [P(1, 'Đinh Văn Ba'), P(2, 'Đinh Văn Ba')];
function setupDb({ dismissedTable = true } = {}) {
    return createMockDb(async (sql) => {
        if (/FROM accounts a/.test(sql) && /p\.clan_id/.test(sql)) return [[{ clan_id: 1 }]];
        if (/FROM people p LEFT JOIN accounts a/.test(sql)) return [rowsForDb.map((r) => ({ ...r, clan_id: 1 }))];
        if (/FROM families/.test(sql)) return [[]];
        if (/FROM children c/.test(sql)) return [[]];
        if (/FROM genealogy_duplicate_dismissals/.test(sql)) {
            if (!dismissedTable) { const e = new Error("Table doesn't exist"); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
            return [[]];
        }
        if (/SELECT id FROM people WHERE id IN/.test(sql)) return [[{ id: 1 }, { id: 2 }]];
        return [[]];
    });
}
const manager = { id: 9, role_id: 2, role_name: 'manager' };
const call = async (fn, req) => { const res = mockRes(); await fn({ params: {}, query: {}, body: {}, ...req }, res); return res; };

test('GET: manager thấy ứng viên; thiếu bảng dismissals vẫn chạy', async () => {
    setupDb({ dismissedTable: false });
    const res = await call(controller.listDuplicateCandidates, { user: manager });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.total, 1);
    assert.strictEqual(res.body.pairs[0].key, '1-2');
});

test('POST dismiss: lưu cặp (a<b) theo dòng họ của manager, không ghi nếu người ngoài dòng họ', async () => {
    const mock = setupDb();
    const res = await call(controller.dismissDuplicate, { user: manager, body: { person_a_id: 2, person_b_id: 1 } });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.key, '1-2');
    const insert = mock.find(/INSERT IGNORE INTO genealogy_duplicate_dismissals/)[0];
    assert.deepStrictEqual(insert.params, [1, 1, 2, 9]);

    const bad = createMockDb(async (sql) => {
        if (/FROM accounts a/.test(sql)) return [[{ clan_id: 1 }]];
        if (/SELECT id FROM people WHERE id IN/.test(sql)) return [[{ id: 1 }]];
        return [[]];
    });
    const res2 = await call(controller.dismissDuplicate, { user: manager, body: { person_a_id: 1, person_b_id: 99 } });
    assert.strictEqual(res2.statusCode, 404);
    assert.strictEqual(bad.find(/INSERT/).length, 0);
    const res3 = await call(controller.dismissDuplicate, { user: manager, body: { person_a_id: 1, person_b_id: 1 } });
    assert.strictEqual(res3.statusCode, 400);
});

test('POST dismiss: bảng chưa có -> tự tạo rồi ghi lại', async () => {
    let first = true;
    const mock = createMockDb(async (sql) => {
        if (/FROM accounts a/.test(sql)) return [[{ clan_id: 1 }]];
        if (/SELECT id FROM people WHERE id IN/.test(sql)) return [[{ id: 1 }, { id: 2 }]];
        if (/INSERT IGNORE INTO genealogy_duplicate_dismissals/.test(sql) && first) { first = false; const e = new Error('x'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
        return [[]];
    });
    const res = await call(controller.dismissDuplicate, { user: manager, body: { person_a_id: 1, person_b_id: 2 } });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(mock.find(/CREATE TABLE IF NOT EXISTS genealogy_duplicate_dismissals/).length, 1);
});

test('schema dismiss và quyền route (chỉ admin/manager)', async () => {
    const run = async (body) => { let ok = false; await schemas.dismissDuplicate({ body, params: {}, query: {} }, mockRes(), () => { ok = true; }); return ok; };
    assert.strictEqual(await run({ person_a_id: 1, person_b_id: 2 }), true);
    assert.strictEqual(await run({ person_a_id: 1 }), false);
    const routes = require('fs').readFileSync(require('path').join(__dirname, '../src/modules/manager/manager.routes.js'), 'utf8');
    assert.match(routes, /\/tree\/duplicates', verifyToken, checkRole\(\['admin', 'manager'\]\)/);
    assert.match(routes, /\/tree\/duplicates\/dismiss', verifyToken, checkRole\(\['admin', 'manager'\]\)/);
});
