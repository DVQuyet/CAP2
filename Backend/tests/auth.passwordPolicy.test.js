process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const express = require('express');
const {
    PASSWORD_MIN_LENGTH,
    passwordPolicyIssue,
    weakPasswordBody,
    rejectWeakPassword,
    assertStrongPassword,
    errorResponseBody,
} = require('../src/shared/validation/passwordPolicy');
const schemas = require('../src/shared/validation/schemas');
const authRoutes = require('../src/modules/auth/auth.routes');
const memberController = require('../src/modules/member/member.controller');

// ---- Hàm thuần ----
test('quy tắc: tối thiểu 8 ký tự, có chữ và số', () => {
    assert.strictEqual(PASSWORD_MIN_LENGTH, 8);
    assert.strictEqual(passwordPolicyIssue(''), 'too_short');
    assert.strictEqual(passwordPolicyIssue('a'), 'too_short');
    assert.strictEqual(passwordPolicyIssue('abc1234'), 'too_short');
    assert.strictEqual(passwordPolicyIssue('abcdefgh'), 'needs_letter_and_digit');
    assert.strictEqual(passwordPolicyIssue('12345678'), 'needs_letter_and_digit');
    assert.strictEqual(passwordPolicyIssue('!!!!!!!!'), 'needs_letter_and_digit');
    assert.strictEqual(passwordPolicyIssue('abcd1234'), null);
    assert.strictEqual(passwordPolicyIssue('x'.repeat(71) + '1'), null);
    assert.strictEqual(passwordPolicyIssue('x'.repeat(72) + '1'), 'too_long');
    assert.strictEqual(passwordPolicyIssue(undefined), 'too_short');
});

test('quy tắc: chữ có dấu tính là chữ, đếm theo ký tự chứ không theo byte', () => {
    assert.strictEqual(passwordPolicyIssue('mậtkhẩu1'), null);
    assert.strictEqual(passwordPolicyIssue('mậtkh1'), 'too_short');
});

test('quy tắc: tối đa 72 byte UTF-8 vì bcrypt bỏ phần sau; chữ có dấu tính 2–3 byte', () => {
    assert.strictEqual(passwordPolicyIssue('ậ'.repeat(23) + 'a1'), null); // 69 + 2 = 71 byte
    assert.strictEqual(passwordPolicyIssue('ậ'.repeat(24) + '1'), 'too_long'); // 73 byte, chỉ 25 ký tự
});

test('errorResponseBody: giữ code/reason của lỗi có status, lỗi nội bộ trả câu cố định', () => {
    let thrown;
    try { assertStrongPassword('abcdefgh'); } catch (e) { thrown = e; }
    assert.deepStrictEqual(errorResponseBody(thrown, 'Lỗi'), {
        success: false, message: thrown.message, code: 'WEAK_PASSWORD', reason: 'needs_letter_and_digit',
    });
    const dbError = Object.assign(new Error("Table 'x' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
    assert.deepStrictEqual(errorResponseBody(dbError, 'Lỗi tạo tài khoản'), { success: false, message: 'Lỗi tạo tài khoản' });
});

test('quy tắc: không trùng email, phần trước @ hay tên đăng nhập (không phân biệt hoa thường)', () => {
    const identity = { email: 'NguyenVan1990@Example.com' };
    assert.strictEqual(passwordPolicyIssue('nguyenvan1990@example.com', identity), 'same_as_identity');
    assert.strictEqual(passwordPolicyIssue('NGUYENVAN1990', identity), 'same_as_identity');
    assert.strictEqual(passwordPolicyIssue('nguyenvan1990x', identity), null);
    assert.strictEqual(passwordPolicyIssue('quyet2026', { username: 'Quyet2026' }), 'same_as_identity');
    assert.strictEqual(passwordPolicyIssue('quyet2026', {}), null);
});

test('weakPasswordBody/rejectWeakPassword/assertStrongPassword trả cùng mã lỗi', () => {
    assert.strictEqual(weakPasswordBody('abcd1234'), null);
    const body = weakPasswordBody('abc');
    assert.deepStrictEqual(Object.keys(body).sort(), ['code', 'message', 'reason', 'success']);
    assert.strictEqual(body.code, 'WEAK_PASSWORD');
    assert.strictEqual(body.reason, 'too_short');

    const res = fakeRes();
    assert.strictEqual(rejectWeakPassword(res, 'abcdefgh'), true);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.reason, 'needs_letter_and_digit');
    assert.strictEqual(rejectWeakPassword(fakeRes(), 'abcd1234'), false);

    assert.throws(() => assertStrongPassword('1'), (e) => e.status === 400 && e.reason === 'too_short');
    assert.doesNotThrow(() => assertStrongPassword('abcd1234'));
});

function fakeRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

// ---- Qua router/controller thật, dừng trước DB ----
let server;
let baseUrl;
test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.post('/login-schema', schemas.login, (req, res) => res.json({ ok: true }));
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

const post = (url, body) => fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

test('POST /auth/register: mật khẩu yếu bị 400 WEAK_PASSWORD trước DB', async () => {
    const cases = [
        ['123', 'too_short'],
        ['abcdefgh', 'needs_letter_and_digit'],
        ['ba2026xx', 'same_as_identity'],
    ];
    for (const [password, reason] of cases) {
        const response = await post('/api/auth/register', { email: 'ba2026xx@example.com', password, clan_id: 1 });
        assert.strictEqual(response.status, 400, password);
        const body = await response.json();
        assert.strictEqual(body.code, 'WEAK_PASSWORD');
        assert.strictEqual(body.reason, reason);
    }
});

test('POST /auth/reset-password: mật khẩu mới yếu bị 400 trước DB', async () => {
    const response = await post('/api/auth/reset-password', { email: 'a@example.com', code: '123456', new_password: 'abc12' });
    assert.strictEqual(response.status, 400);
    assert.strictEqual((await response.json()).reason, 'too_short');
});

test('Đăng nhập không áp quy tắc: mật khẩu cũ một ký tự vẫn qua lớp kiểm tra', async () => {
    const response = await post('/login-schema', { email: 'admin@example.com', password: '1' });
    assert.strictEqual(response.status, 200);
});

test('Schema đếm mật khẩu theo ký tự (code point) như quy tắc; mật khẩu cũ dài tới 128 vẫn đăng nhập được', async () => {
    const emoji = '😀'.repeat(100); // 100 ký tự nhưng 200 đơn vị UTF-16: trước đây bị chặn 400
    assert.strictEqual((await post('/login-schema', { email: 'a@example.com', password: emoji })).status, 200);
    assert.strictEqual((await post('/login-schema', { email: 'a@example.com', password: 'x'.repeat(128) })).status, 200);
    assert.strictEqual((await post('/login-schema', { email: 'a@example.com', password: 'x'.repeat(129) })).status, 400);
});

test('PUT /member/password: mật khẩu mới yếu bị 400 trước DB', async () => {
    const res = fakeRes();
    await memberController.changePassword({ user: { id: 1 }, body: { current_password: 'cu', new_password: 'abcdefgh' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'WEAK_PASSWORD');
});

// Mỗi đường ghi mật khẩu được kiểm bằng handler thật ở tests/passwordWritePaths.test.js.

// ---- Không trim mật khẩu mới: đăng nhập so nguyên văn (bcrypt.compare(String(password), hash)) ----
test('tự đổi mật khẩu: dấu cách đầu/cuối được giữ, đăng nhập đúng nguyên văn', async () => {
    const bcrypt = require('bcryptjs');
    const db = require('../src/config/db');
    const currentHash = await bcrypt.hash('cu12345678', 4);
    const original = db.query;
    let savedHash = null;
    db.query = async (sql, params) => {
        if (/^SELECT password, email FROM accounts/.test(sql)) return [[{ password: currentHash, email: 'a@example.com' }]];
        if (/^UPDATE accounts SET password/.test(sql)) { savedHash = params[0]; return [{ affectedRows: 1 }]; }
        throw new Error(`truy vấn không mong đợi: ${sql}`);
    };
    try {
        const res = fakeRes();
        const req = { user: { id: 7, role_id: 3 }, body: { current_password: 'cu12345678', new_password: '  moi12345  ' } };
        await memberController.changePassword(req, res);
        assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
        assert.ok(savedHash, 'phải ghi mật khẩu mới');
        assert.strictEqual(await bcrypt.compare('  moi12345  ', savedHash), true);
        assert.strictEqual(await bcrypt.compare('moi12345', savedHash), false);
    } finally {
        db.query = original;
    }
});
