process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { validate, validateObject, v } = require('../src/shared/validation/validate');
const schemas = require('../src/shared/validation/schemas');

// Chạy middleware với req giả; trả về { res, nextCalled, req }.
const run = (mw, req) => {
    const res = mockRes();
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    return { res, nextCalled, req };
};

test('string: trim, min/max, pattern, required', () => {
    const rules = {
        a: v.string({ required: true, max: 5 }),
        b: v.string({ min: 2, pattern: /^\d+$/ }),
        c: v.string({ trim: false }),
    };
    let r = validateObject({ a: '  abc  ', b: '12', c: ' x ' }, rules);
    assert.deepStrictEqual(r.errors, []);
    assert.deepStrictEqual(r.values, { a: 'abc', b: '12', c: ' x ' });
    assert.strictEqual(validateObject({ a: 'abcdef' }, rules).errors[0].field, 'a');
    assert.strictEqual(validateObject({ a: '   ' }, rules).errors[0].message, 'Vui lòng nhập a.');
    assert.strictEqual(validateObject({}, rules).errors[0].field, 'a');
    assert.strictEqual(validateObject({ a: 'x', b: '1' }, rules).errors[0].field, 'b');
    assert.strictEqual(validateObject({ a: 'x', b: 'ab' }, rules).errors[0].field, 'b');
    assert.strictEqual(validateObject({ a: { x: 1 } }, rules).errors.length, 1);
});

test('int/number: ép kiểu chuỗi số, min/max, từ chối số lẻ và chữ', () => {
    const rules = { n: v.int({ min: 1, max: 100 }), x: v.number({ min: 0 }) };
    assert.strictEqual(validateObject({ n: '42' }, rules).values.n, 42);
    assert.strictEqual(validateObject({ x: '1.5' }, rules).values.x, 1.5);
    for (const bad of [0, 101, 1.5, 'abc', '1.5', Infinity, true]) {
        assert.strictEqual(validateObject({ n: bad }, rules).errors.length, 1, String(bad));
    }
    assert.strictEqual(validateObject({ n: 0 }, rules).errors[0].message, 'n phải lớn hơn 0.');
});

test('enum, boolean, date, array/ids', () => {
    const rules = {
        e: v.enum(['cash', 'transfer']),
        b: v.boolean(),
        d: v.date(),
        dt: v.date({ allowTime: true }),
        ids: v.ids({ max: 3 }),
    };
    const ok = validateObject({ e: 'cash', b: 'true', d: '2024-02-29', dt: '2024-05-01T10:00:00Z', ids: ['1', 2] }, rules);
    assert.deepStrictEqual(ok.errors, []);
    assert.deepStrictEqual(ok.values, { e: 'cash', b: true, d: '2024-02-29', dt: '2024-05-01T10:00:00Z', ids: [1, 2] });
    assert.strictEqual(validateObject({ e: 'bitcoin' }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ b: 'maybe' }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ d: '2023-02-29' }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ d: '2024-05-01T10:00:00Z' }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ ids: [1, 2, 3, 4] }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ ids: [1, 'x'] }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ ids: 'nope' }, rules).errors.length, 1);
});

test('tùy chọn: undefined/null/rỗng không bắt buộc thì bỏ qua hoặc giữ nguyên; bắt buộc thì lỗi', () => {
    const rules = { id: v.id(), s: v.string() };
    const r = validateObject({ id: null, s: null }, rules);
    assert.deepStrictEqual(r.errors, []);
    assert.deepStrictEqual(r.values, { id: null, s: null });
    assert.deepStrictEqual(validateObject({ id: '' }, rules).values, { id: '' });
    assert.ok(!('id' in validateObject({}, rules).values));
    assert.strictEqual(validateObject({ id: null }, { id: v.id({ required: true }) }).errors.length, 1);
});

test('middleware: 400 đúng định dạng, message tiếng Việt, ghi đè message', () => {
    const mw = validate({ body: { amount: v.int({ required: true, min: 1, label: 'số tiền' }), n: v.string({ max: 3, message: 'Sai n' }) } });
    const bad = run(mw, { body: { amount: -5, n: 'abcd' } });
    assert.strictEqual(bad.nextCalled, false);
    assert.strictEqual(bad.res.statusCode, 400);
    assert.strictEqual(bad.res.body.success, false);
    assert.strictEqual(bad.res.body.message, 'số tiền phải lớn hơn 0.');
    assert.deepStrictEqual(bad.res.body.errors.map((e) => e.field), ['amount', 'n']);
    assert.strictEqual(bad.res.body.errors[1].message, 'Sai n');
});

test('middleware: làm sạch trường khai báo, giữ nguyên trường lạ; strict thì bỏ trường lạ', () => {
    const schema = { name: v.string({ max: 10 }), age: v.int() };
    const loose = run(validate({ body: schema }), { body: { name: '  An ', age: '7', extra: { a: 1 } } });
    assert.ok(loose.nextCalled);
    assert.deepStrictEqual(loose.req.body, { name: 'An', age: 7, extra: { a: 1 } });
    const strict = run(validate({ body: schema, strict: true }), { body: { name: 'An', extra: 1 } });
    assert.deepStrictEqual(strict.req.body, { name: 'An' });
    const noBody = run(validate({ body: schema }), { body: undefined });
    assert.ok(noBody.nextCalled);
    assert.deepStrictEqual(noBody.req.body, {});
});

test('middleware: params được ép kiểu, query được kiểm tra', () => {
    const mw = validate({ params: { id: v.id() }, query: { page: v.int({ min: 1 }) } });
    const ok = run(mw, { params: { id: '12' }, query: { page: '2' }, body: {} });
    assert.ok(ok.nextCalled);
    assert.strictEqual(ok.req.params.id, 12);
    assert.strictEqual(ok.req.validatedQuery.page, 2);
    assert.strictEqual(run(mw, { params: { id: 'x' }, query: {} }).res.statusCode, 400);
    assert.strictEqual(run(mw, { params: { id: '1' }, query: { page: '0' } }).res.statusCode, 400);
});

// ---- Route-level: schema thật + controller thật + mock DB ----
const fund = require('../src/modules/fund/fund.controller');
const auth = require('../src/modules/auth/auth.controller');

// Mô phỏng chuỗi middleware của route: validate rồi tới controller; trả về res và đảm bảo handler chạy hay không.
const runRoute = async (schemaMw, handler, req) => {
    const res = mockRes();
    let passed = false;
    schemaMw(req, res, () => { passed = true; });
    if (passed) await handler(req, res);
    return { res, passed };
};

test('POST /login: thiếu/quá dài bị 400 trước khi chạm DB; hợp lệ đi qua nguyên vẹn', async () => {
    const mock = createMockDb(async () => [[]]);
    const missing = await runRoute(schemas.login, auth.login, { body: { email: 'a@b.vn' } });
    assert.strictEqual(missing.res.statusCode, 400);
    assert.strictEqual(missing.res.body.message, 'Vui lòng nhập email và mật khẩu!');
    const tooLong = await runRoute(schemas.login, auth.login, { body: { email: 'a'.repeat(300) + '@b.vn', password: 'x' } });
    assert.strictEqual(tooLong.res.statusCode, 400);
    assert.strictEqual(mock.calls.length, 0, 'không được query DB khi dữ liệu sai');

    // Mật khẩu không bị trim; extra field giữ nguyên.
    const req = { body: { email: ' A@B.vn ', password: ' pw ', remember: true } };
    const ok = await runRoute(schemas.login, async () => {}, req);
    assert.ok(ok.passed);
    assert.deepStrictEqual(req.body, { email: 'A@B.vn', password: ' pw ', remember: true });
});

test('POST /fund/income: số tiền sai/ngày sai bị 400 trước DB; hợp lệ ép kiểu và vào controller', async () => {
    const mock = createMockDb(async (sql) => {
        if (/SELECT p\.clan_id FROM accounts a/.test(sql)) return [[{ clan_id: 7 }]];
        if (/SELECT person_id FROM accounts/.test(sql)) return [[{ person_id: 100 }]];
        if (/INSERT INTO event_contributions/.test(sql)) return [{ insertId: 1 }];
        return [[{ 1: 1 }]];
    });
    const user = { id: 9, role_id: 3, role_name: 'member' };
    for (const body of [{ amount: -1 }, { amount: 'abc' }, { amount: 0 }, { amount: 1000, date: '31/12/2024' }, { amount: 1000, method: 'x'.repeat(60) }]) {
        const r = await runRoute(schemas.fundIncome, fund.addIncome, { user, body });
        assert.strictEqual(r.res.statusCode, 400, JSON.stringify(body));
    }
    assert.strictEqual(mock.calls.length, 0, 'không được query DB khi dữ liệu sai');

    const good = await runRoute(schemas.fundIncome, fund.addIncome, { user, body: { amount: '1500000', date: '2024-12-31', method: 'Tiền mặt', person_id: 999 } });
    assert.ok(good.passed);
    assert.strictEqual(good.res.statusCode, 200);
    assert.strictEqual(mock.find(/INSERT INTO event_contributions/)[0].params[4], 1500000);
});

test('POST /posts/:id/comments: nội dung quá dài hoặc id sai bị 400 với thông báo cũ', () => {
    const tooLong = run(schemas.postComment, { params: { id: '5' }, body: { content: 'a'.repeat(5001) } });
    assert.strictEqual(tooLong.res.statusCode, 400);
    assert.strictEqual(tooLong.res.body.message, 'Bình luận quá dài (tối đa 5000 ký tự).');
    assert.strictEqual(run(schemas.postComment, { params: { id: 'abc' }, body: { content: 'hi' } }).res.statusCode, 400);
    const ok = run(schemas.postComment, { params: { id: '5' }, body: { content: '  hi  ', parent_id: '' } });
    assert.ok(ok.nextCalled);
    assert.deepStrictEqual(ok.req.body, { content: 'hi', parent_id: '' });
});

test('tree + role: id cha/mẹ rác bị chặn, cập nhật một phần không thêm trường vắng mặt', () => {
    assert.strictEqual(run(schemas.createPerson, { body: { display_name: 'A', parent_father_id: 'abc' } }).res.statusCode, 400);
    assert.strictEqual(run(schemas.updateFamily, { params: { familyId: 'x' }, body: {} }).res.statusCode, 400);
    const partial = run(schemas.updateFamily, { params: { familyId: '3' }, body: { father_id: '8' } });
    assert.ok(partial.nextCalled);
    assert.deepStrictEqual(partial.req.body, { father_id: 8 });
    assert.strictEqual(run(schemas.updateAccountAccess, { params: { id: '2' }, body: { role_id: 'admin' } }).res.statusCode, 400);
    assert.ok(run(schemas.updateAccountAccess, { params: { id: '2' }, body: { role_id: 3 } }).nextCalled);
    assert.strictEqual(run(schemas.createInvitation, { body: { email: '' , role: 'member' } }).nextCalled, true);
});

// ---- Đợt 2: task, kỷ niệm, hồ sơ, dòng họ, tài khoản admin, lưu trữ ----
test('v.object: kiểm tra trường khai báo, giữ trường lạ, từ chối không phải object', () => {
    const rules = { list: v.array(v.object({ id: v.int({ min: 1 }) }), { max: 2 }) };
    const ok = validateObject({ list: [{ id: '3', keep: 'x' }] }, rules);
    assert.deepStrictEqual(ok.errors, []);
    assert.deepStrictEqual(ok.values.list, [{ id: 3, keep: 'x' }]);
    assert.strictEqual(validateObject({ list: ['a'] }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ list: [{ id: 0 }] }, rules).errors.length, 1);
    assert.strictEqual(validateObject({ list: [{}, {}, {}] }, rules).errors.length, 1);
});

test('task schemas: tiêu đề/ids/trạng thái sai bị 400 với thông báo cũ', () => {
    let r = run(schemas.assignTask, { body: { title: '   ', member_account_ids: [1] } });
    assert.strictEqual(r.res.body.message, 'Tiêu đề công việc là bắt buộc');
    assert.strictEqual(run(schemas.assignTask, { body: { title: 'A', member_account_ids: [1, 'x'] } }).res.statusCode, 400);
    assert.strictEqual(run(schemas.assignTask, { body: { title: 'a'.repeat(300) } }).res.statusCode, 400);
    const ok = run(schemas.assignTask, { body: { title: ' Dọn nhà thờ ', event_id: '4', member_account_ids: ['1', 2], extra: 1 } });
    assert.ok(ok.nextCalled);
    assert.deepStrictEqual(ok.req.body, { title: 'Dọn nhà thờ', event_id: 4, member_account_ids: [1, 2], extra: 1 });
    assert.strictEqual(run(schemas.createEventTask, { params: { eventId: 'x' }, body: { title: 'A' } }).res.statusCode, 400);
    r = run(schemas.updateAssignedTask, { params: { id: '2' }, body: { title: '' } });
    assert.strictEqual(r.res.body.message, 'Tên công việc không được để trống');
    assert.strictEqual(run(schemas.updateAssignedTask, { params: { id: 'abc' }, body: { title: 'A' } }).res.body.message, 'ID công việc không hợp lệ');
    assert.strictEqual(run(schemas.taskIdParam, { params: { id: '0' } }).res.statusCode, 400);
    assert.strictEqual(run(schemas.updateTaskStatus, { params: { id: '1' }, body: { status: 'done' } }).res.body.message, 'Trạng thái không hợp lệ');
    assert.ok(run(schemas.updateTaskStatus, { params: { id: '1' }, body: { status: 'completed' } }).nextCalled);
    const many = Array.from({ length: 51 }, () => ({ title: 't' }));
    assert.strictEqual(run(schemas.bulkAssignTasks, { body: { tasks: many } }).res.body.message, 'Không được giao quá 50 công việc trong một lần');
    const bulk = run(schemas.bulkAssignTasks, { body: { tasks: [{ title: ' A ', dueDate: '2025-01-01', member_ids: ['5'] }] } });
    assert.ok(bulk.nextCalled);
    assert.deepStrictEqual(bulk.req.body.tasks, [{ title: 'A', dueDate: '2025-01-01', member_ids: [5] }]);
});

test('memory/profile/clan/admin/archive schemas', () => {
    assert.strictEqual(run(schemas.createFamilyMemory, { body: { title: 'x', readers: 'nope' } }).res.statusCode, 400);
    assert.strictEqual(run(schemas.createFamilyMemory, { body: { readers: [{ account_id: 'abc' }] } }).res.statusCode, 400);
    const mem = run(schemas.createFamilyMemory, { body: { visibility: 'selected', readers: [{ account_id: '3' }, { person_id: 4 }] } });
    assert.ok(mem.nextCalled);
    assert.deepStrictEqual(mem.req.body.readers, [{ account_id: 3 }, { person_id: 4 }]);
    assert.strictEqual(run(schemas.updateFamilyMemory, { params: { id: 'x' }, body: {} }).res.body.message, 'ID kỷ niệm không hợp lệ.');
    assert.strictEqual(run(schemas.updateMyProfile, { body: { full_name: 'a'.repeat(200) } }).res.statusCode, 400);
    assert.strictEqual(run(schemas.updateMyProfile, { body: { phone: '1'.repeat(40) } }).res.statusCode, 400);
    assert.ok(run(schemas.updateMyProfile, { body: { full_name: 'Nguyễn A', avatar_url: 'data:image/png;base64,AAAA' } }).nextCalled);
    assert.strictEqual(run(schemas.updateMemberProfile, { body: { generation: 'abc' } }).res.statusCode, 400);
    assert.ok(run(schemas.updateMemberProfile, { body: { generation: '', family_id: 'zzz' } }).nextCalled);
    assert.strictEqual(run(schemas.updateClanInfo, { body: { clan_name: '  ' } }).res.body.message, 'Tên dòng họ không được để trống');
    assert.strictEqual(run(schemas.registerClan, { body: { clan_name: 'A', chief_account_id: 'x' } }).res.body.message, 'Thiếu id trưởng họ (chief_account_id) hoặc không hợp lệ');
    assert.strictEqual(run(schemas.registerClanWithManager, { body: { clan_name: 'A', email: 'a@b.vn' } }).res.body.message, 'Thiếu mật khẩu');
    assert.strictEqual(run(schemas.adminCreateAccount, { body: { email: 'a@b.vn', password: 'x', role_id: 'admin' } }).res.statusCode, 400);
    assert.ok(run(schemas.adminCreateAccount, { body: { email: 'a@b.vn', password: 'secret1', role_id: '3', clan_id: '' } }).nextCalled);
    assert.strictEqual(run(schemas.adminCreateManager, { body: { email: 'a@b.vn', password: 'secret1' } }).res.body.message, 'Cần clan_id (dòng họ) hợp lệ');
    assert.strictEqual(run(schemas.adminDeleteAccount, { params: { id: 'x' } }).res.body.message, 'account_id không hợp lệ');
    assert.strictEqual(run(schemas.archiveMember, { params: { id: '1' }, body: { reason: 'x'.repeat(1001) } }).res.statusCode, 400);
    assert.strictEqual(run(schemas.restoreArchivedMember, { params: { id: 'q' } }).res.body.message, 'archive_id không hợp lệ');
});

const memberCtl = require('../src/modules/member/member.controller');
const clanCtl = require('../src/modules/clan/clan.controller');

test('POST /member/memories: readers sai bị 400 trước mọi truy vấn DB; hợp lệ vào controller', async () => {
    const mock = createMockDb(async () => [[]]);
    const user = { id: 9, role_id: 3 };
    for (const body of [{ title: 'x', readers: 'abc' }, { title: 'x', readers: [{ account_id: 'zz' }] }, { title: 'x'.repeat(300) }]) {
        const r = await runRoute(schemas.createFamilyMemory, memberCtl.createFamilyMemory, { user, body });
        assert.strictEqual(r.res.statusCode, 400, JSON.stringify(body));
        assert.strictEqual(r.passed, false);
    }
    assert.strictEqual(mock.calls.length, 0, 'không được query DB khi dữ liệu sai');
    const good = await runRoute(schemas.createFamilyMemory, memberCtl.createFamilyMemory, { user, body: { title: 'x' } });
    assert.ok(good.passed);
    assert.ok(mock.calls.length > 0);
});

test('POST /auth/register-clan: thiếu tên/chief sai bị 400 với thông báo cũ trước DB', async () => {
    const mock = createMockDb(async () => [[]]);
    const a = await runRoute(schemas.registerClan, clanCtl.registerClan, { body: { chief_account_id: 1 } });
    assert.strictEqual(a.res.statusCode, 400);
    assert.strictEqual(a.res.body.message, 'Thiếu tên dòng họ (clan_name)');
    const b = await runRoute(schemas.registerClan, clanCtl.registerClan, { body: { clan_name: 'Họ Nguyễn', chief_account_id: 'abc' } });
    assert.strictEqual(b.res.statusCode, 400);
    const c = await runRoute(schemas.registerClan, clanCtl.registerClan, { body: { clan_name: 'x'.repeat(256), chief_account_id: 1 } });
    assert.strictEqual(c.res.statusCode, 400);
    assert.strictEqual(mock.calls.length, 0, 'không được query DB khi dữ liệu sai');
});
