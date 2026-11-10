process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb } = require('./helpers.mockDb');
const { buildGedcom, formatGedcomDate, splitVietnameseName } = require('../src/modules/genealogy/gedcom.service');
const controller = require('../src/modules/genealogy/gedcom.controller');
const { checkRole } = require('../src/middleware/authMiddleware');

const NOW = new Date(Date.UTC(2026, 9, 30));

test('ngày theo độ chính xác', () => {
    assert.strictEqual(formatGedcomDate('1940-11-15', 'exact'), '15 NOV 1940');
    assert.strictEqual(formatGedcomDate('1940-01-01', 'year'), '1940');
    assert.strictEqual(formatGedcomDate('1940-03-01', 'month'), 'MAR 1940');
    assert.strictEqual(formatGedcomDate('1940-01-01', 'approximate'), 'ABT 1940');
    assert.strictEqual(formatGedcomDate('1940-01-01', 'unknown'), null);
    assert.strictEqual(formatGedcomDate(null, 'exact'), null);
    assert.strictEqual(formatGedcomDate(new Date(1940, 10, 15), 'exact'), '15 NOV 1940');
    assert.strictEqual(formatGedcomDate('1940', 'exact'), '1940');
});

test('tách tên Việt: họ là từ đầu', () => {
    assert.deepStrictEqual(splitVietnameseName({ display_name: 'Đinh Văn Ba' }), { surname: 'Đinh', given: 'Văn Ba' });
    assert.deepStrictEqual(splitVietnameseName({ surname: 'Lê', middle_name: 'Thị', first_name: 'Hoa' }), { surname: 'Lê', given: 'Thị Hoa' });
    assert.deepStrictEqual(splitVietnameseName({ display_name: 'Nam' }), { surname: '', given: 'Nam' });
});

const people = [
    { id: 1, display_name: 'Đinh Văn Ba', gender: 1, birth_date: '1940-11-15', birth_date_precision: 'exact', death_date: '1999-01-01', death_date_precision: 'year', hometown: 'Nam Định', bio: 'Dòng 1\nDòng 2 @abc', is_living: 0 },
    { id: 2, display_name: 'Lê Thị Hoa', gender: 2, birth_date: '1945-01-01', birth_date_precision: 'year', is_living: 0, phone: '0900000000', email: 'x@y.z', address: 'Số 1 Phố A' },
    { id: 3, display_name: 'Đinh Văn Con', gender: 1, birth_date: '1970-05-05', birth_date_precision: 'unknown', is_living: 1 },
];
const families = [{ id: 10, father_id: 1, mother_id: 2, marriage_date: '1965-02-03', marriage_date_precision: 'exact', visibility: 'managers' }];
const children = [{ family_id: 10, person_id: 3 }];

test('buildGedcom: HEAD/INDI/FAM/TRLR, tên có họ trong dấu gạch, ngày theo độ chính xác', () => {
    const out = buildGedcom({ clanName: 'Họ Đinh', people, families, children, now: NOW });
    const lines = out.split('\r\n');
    assert.strictEqual(lines[0], '0 HEAD');
    assert.ok(lines.includes('2 VERS 5.5.1'));
    assert.ok(lines.includes('1 CHAR UTF-8'));
    assert.ok(lines.includes('1 DATE 30 OCT 2026'));
    assert.strictEqual(lines[lines.length - 2], '0 TRLR');
    assert.ok(lines.includes('1 NAME Văn Ba /Đinh/'));
    assert.ok(lines.includes('1 SEX M') && lines.includes('1 SEX F'));
    assert.ok(lines.includes('2 DATE 15 NOV 1940'));
    assert.ok(lines.includes('2 DATE 1999'));
    assert.ok(lines.includes('2 PLAC Nam Định'));
    assert.ok(lines.includes('2 DATE 1945'));
    // ngày sinh "unknown" không xuất
    const i3 = lines.indexOf('0 @I3@ INDI');
    assert.ok(!lines.slice(i3, i3 + 8).some((l) => l.includes('1970')));
    // quan hệ
    assert.ok(lines.includes('0 @F10@ FAM'));
    assert.ok(lines.includes('1 HUSB @I1@') && lines.includes('1 WIFE @I2@') && lines.includes('1 CHIL @I3@'));
    assert.ok(lines.includes('1 MARR') && lines.includes('2 DATE 3 FEB 1965'));
    assert.ok(lines.includes('1 FAMS @F10@') && lines.includes('1 FAMC @F10@'));
});

test('buildGedcom: tiểu sử nhiều dòng dùng CONT, @ được nhân đôi, không lộ SĐT/email/địa chỉ', () => {
    const out = buildGedcom({ people, families, children, now: NOW });
    const lines = out.split('\r\n');
    assert.ok(lines.includes('1 NOTE Dòng 1'));
    assert.ok(lines.includes('2 CONT Dòng 2 @@abc'));
    assert.ok(!/0900000000|x@y\.z|Phố A/.test(out));
});

test('buildGedcom: tiểu sử dài tách CONC, không dòng nào quá 255 ký tự', () => {
    const long = 'ă'.repeat(700);
    const out = buildGedcom({ people: [{ id: 1, display_name: 'A B', bio: long }], now: NOW });
    const lines = out.split('\r\n');
    assert.ok(lines.every((l) => Array.from(l).length <= 255));
    const joined = lines.filter((l) => /^(1 NOTE|2 CONC) /.test(l)).map((l) => l.replace(/^\d (NOTE|CONC) /, '')).join('');
    assert.strictEqual(joined, long);
});

test('buildGedcom: bỏ người/quan hệ ngoài dòng họ, gia đình rỗng', () => {
    const out = buildGedcom({
        people: [people[0]],
        families: [{ id: 1, father_id: 1, mother_id: 99 }, { id: 2, father_id: 98, mother_id: 99 }],
        children: [{ family_id: 1, person_id: 77 }],
        now: NOW,
    });
    assert.ok(out.includes('0 @F1@ FAM'));
    assert.ok(!out.includes('@F2@') && !out.includes('@I99@') && !out.includes('@I77@'));
});

function fakeRes() {
    const res = { statusCode: 200, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.send = (b) => { res.body = b; return res; };
    return res;
}

test('GET export: quản lý tải file GEDCOM của dòng họ mình, tên file an toàn, gồm families managers', async () => {
    const mock = createMockDb(async (sql) => {
        if (/FROM accounts a/.test(sql) && /p\.clan_id/.test(sql)) return [[{ clan_id: 1 }]];
        if (/FROM people p LEFT JOIN accounts a/.test(sql)) return [people.map((p) => ({ ...p, clan_id: 1 }))];
        if (/FROM families/.test(sql)) return [families];
        if (/FROM children c/.test(sql)) return [children];
        if (/SELECT id, hometown, bio FROM people/.test(sql)) return [people.map((p) => ({ id: p.id, hometown: p.hometown, bio: p.bio }))];
        if (/FROM clans WHERE id/.test(sql)) return [[{ clan_name: 'Họ Đinh "Nam"/Định' }]];
        return [[]];
    });
    const res = fakeRes();
    await controller.exportGedcom({ user: { id: 9, role_id: 2, role_name: 'manager' }, query: {}, params: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.headers['Content-Type'], /charset=utf-8/);
    assert.match(res.headers['Content-Disposition'], /^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    assert.ok(!res.headers['Content-Disposition'].includes('/'));
    assert.ok(res.body.includes('0 @F10@ FAM'));
    assert.ok(res.body.includes('2 PLAC Nam Định'));
    assert.strictEqual(mock.find(/FROM people WHERE clan_id = \?/)[0].params[0], 1);
});

test('quyền: chỉ admin/manager; member bị 403', () => {
    const guard = checkRole(['admin', 'manager']);
    for (const [role, expected] of [['member', 403], ['manager', 'next'], ['admin', 'next']]) {
        const res = fakeRes();
        let nexted = false;
        guard({ user: { role_name: role } }, res, () => { nexted = true; });
        if (expected === 'next') assert.ok(nexted); else assert.strictEqual(res.statusCode, expected);
    }
    const router = require('../src/modules/manager/manager.routes');
    const layer = router.stack.find((l) => l.route && l.route.path === '/tree/export.gedcom');
    assert.ok(layer, 'route /tree/export.gedcom phải tồn tại');
    assert.strictEqual(layer.route.stack.length, 3); // verifyToken, checkRole, handler
});
