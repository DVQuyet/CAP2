process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const {
    PASSWORD_MIN_LENGTH,
    passwordPolicyIssue,
    weakPasswordBody,
    rejectWeakPassword,
    assertStrongPassword,
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
    assert.strictEqual(passwordPolicyIssue('x'.repeat(128) + '1'), 'too_long');
    assert.strictEqual(passwordPolicyIssue(undefined), 'too_short');
});

test('quy tắc: chữ có dấu tính là chữ, đếm theo ký tự chứ không theo byte', () => {
    assert.strictEqual(passwordPolicyIssue('mậtkhẩu1'), null);
    assert.strictEqual(passwordPolicyIssue('mậtkh1'), 'too_short');
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

test('PUT /member/password: mật khẩu mới yếu bị 400 trước DB', async () => {
    const res = fakeRes();
    await memberController.changePassword({ user: { id: 1 }, body: { current_password: 'cu', new_password: 'abcdefgh' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'WEAK_PASSWORD');
});

// ---- Chốt chặn: mọi chỗ ghi mật khẩu người dùng nhập phải gọi quy tắc ----
test('mọi controller tạo tài khoản hoặc đổi mật khẩu đều dùng passwordPolicy, không còn kiểm "< 6"', () => {
    const modules = path.join(__dirname, '..', 'src', 'modules');
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) files.push(full);
        }
    };
    walk(modules);
    // socialAuth.service băm mật khẩu ngẫu nhiên 64 ký tự do máy sinh, không phải mật khẩu người dùng nhập.
    const exempt = new Set(['socialAuth.service.js']);
    const writers = files.filter((f) => !exempt.has(path.basename(f)))
        .filter((f) => /INSERT INTO accounts|updatePasswordHash\(/.test(fs.readFileSync(f, 'utf8')));
    assert.ok(writers.length >= 7, `chỉ thấy ${writers.length} file`);
    for (const file of writers) {
        const text = fs.readFileSync(file, 'utf8');
        assert.match(text, /shared\/validation\/passwordPolicy/, path.basename(file));
        assert.doesNotMatch(text, /(password|pwd|np|next)\.length\s*<\s*6/i, path.basename(file));
    }
});
