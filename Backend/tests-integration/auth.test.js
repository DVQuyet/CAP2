const test = require('node:test');
const assert = require('assert');
const bcrypt = require('../node_modules/bcryptjs');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PROBE = '/api/member/notifications';

let server;
let clanId;

test.before(async () => {
    // Cache tài khoản 0ms để đổi trạng thái trong DB có hiệu lực ngay ở request kế tiếp.
    server = await startServer({ env: { AUTH_ACCOUNT_CACHE_TTL_MS: '0' } });
    clanId = await createTempClan();
});
test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

test('đăng nhập đúng mật khẩu có token; sai mật khẩu 401', async () => {
    const member = await createTempAccount({ role: 'member', clanId });
    const ok = await api(server.baseUrl, 'POST', '/api/auth/login', { body: { email: member.email, password: member.password } });
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.data.token);

    const bad = await api(server.baseUrl, 'POST', '/api/auth/login', { body: { email: member.email, password: 'sai-mat-khau' } });
    assert.strictEqual(bad.status, 401);
    assert.ok(!bad.data.token);
});

test('đổi mật khẩu: sai mật khẩu hiện tại 400, đúng thì thu hồi token cũ và cấp token mới', async () => {
    const member = await createTempAccount({ role: 'member', clanId });
    const newPassword = 'NewPass#67890';
    const oldToken = await login(server.baseUrl, member.email, member.password);
    assert.strictEqual((await api(server.baseUrl, 'GET', PROBE, { token: oldToken })).status, 200);

    const wrong = await api(server.baseUrl, 'PUT', '/api/member/password', { token: oldToken, body: { current_password: 'sai', new_password: newPassword } });
    assert.strictEqual(wrong.status, 400, 'sai mật khẩu hiện tại không được trả 401 (frontend sẽ đăng xuất)');

    await sleep(1100); // iat của JWT tính bằng giây
    const changed = await api(server.baseUrl, 'PUT', '/api/member/password', { token: oldToken, body: { current_password: member.password, new_password: newPassword } });
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.data));
    assert.ok(changed.data.token, 'đổi mật khẩu phải trả token mới');
    const newToken = changed.data.token;

    const old = await api(server.baseUrl, 'GET', PROBE, { token: oldToken });
    assert.strictEqual(old.status, 401);
    assert.strictEqual(old.data.code, 'TOKEN_INVALID');
    assert.strictEqual((await api(server.baseUrl, 'GET', PROBE, { token: newToken })).status, 200);

    const oldLogin = await api(server.baseUrl, 'POST', '/api/auth/login', { body: { email: member.email, password: member.password } });
    assert.strictEqual(oldLogin.status, 401);
    const freshToken = await login(server.baseUrl, member.email, newPassword);
    assert.strictEqual((await api(server.baseUrl, 'GET', PROBE, { token: freshToken })).status, 200);

    const [rows] = await db.query('SELECT UNIX_TIMESTAMP(password_changed_at) AS ts FROM accounts WHERE id = ?', [member.id]);
    assert.ok(Number(rows[0].ts) > 0, 'DB phải ghi password_changed_at');
});

test('đặt lại mật khẩu bằng mã: thu hồi token cũ, mật khẩu mới đăng nhập được', async () => {
    const member = await createTempAccount({ role: 'member', clanId });
    const newPassword = 'Reset#24680';
    const oldToken = await login(server.baseUrl, member.email, member.password);
    await sleep(1100);

    await db.query('DELETE FROM password_reset_tokens WHERE account_id = ?', [member.id]);
    await db.query(
        'INSERT INTO password_reset_tokens (account_id, code_hash, expires_at) VALUES (?, ?, ?)',
        [member.id, await bcrypt.hash('123456', 10), new Date(Date.now() + 10 * 60 * 1000)]
    );

    const wrongCode = await api(server.baseUrl, 'POST', '/api/auth/reset-password', { body: { email: member.email, code: '000000', new_password: newPassword } });
    assert.strictEqual(wrongCode.status, 400);

    const reset = await api(server.baseUrl, 'POST', '/api/auth/reset-password', { body: { email: member.email, code: '123456', new_password: newPassword } });
    assert.strictEqual(reset.status, 200, JSON.stringify(reset.data));

    const old = await api(server.baseUrl, 'GET', PROBE, { token: oldToken });
    assert.strictEqual(old.status, 401);
    assert.strictEqual(old.data.code, 'TOKEN_INVALID');
    const token = await login(server.baseUrl, member.email, newPassword);
    assert.strictEqual((await api(server.baseUrl, 'GET', PROBE, { token })).status, 200);
});

test('tài khoản bị khóa (rejected) bị chặn ngay bằng 403 ACCOUNT_DISABLED', async () => {
    const member = await createTempAccount({ role: 'member', clanId });
    const token = await login(server.baseUrl, member.email, member.password);
    assert.strictEqual((await api(server.baseUrl, 'GET', PROBE, { token })).status, 200);

    await db.query("UPDATE accounts SET status = 'rejected' WHERE id = ?", [member.id]);
    const blocked = await api(server.baseUrl, 'GET', PROBE, { token });
    assert.strictEqual(blocked.status, 403);
    assert.strictEqual(blocked.data.code, 'ACCOUNT_DISABLED');
});
