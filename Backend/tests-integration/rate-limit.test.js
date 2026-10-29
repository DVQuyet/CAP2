// Giới hạn số lần gọi theo tài khoản trên server thật (hạn mức nhỏ đặt qua biến môi trường).
const test = require('node:test');
const assert = require('assert');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');

let server;
let clanId;

test.before(async () => {
    server = await startServer({
        env: {
            AUTH_ACCOUNT_CACHE_TTL_MS: '0',
            PASSWORD_CHANGE_RATE_LIMIT_MAX: '3',
            UPLOAD_RATE_LIMIT_MAX: '3',
            INVITATION_VERIFY_RATE_LIMIT_MAX: '3',
        },
    });
    clanId = await createTempClan('R');
});
test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

test('đổi mật khẩu: nhập sai quá hạn mức thì 429, tài khoản khác không bị ảnh hưởng', async () => {
    const victim = await createTempAccount({ role: 'member', clanId });
    const other = await createTempAccount({ role: 'member', clanId });
    const victimToken = await login(server.baseUrl, victim.email, victim.password);
    const otherToken = await login(server.baseUrl, other.email, other.password);

    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
        const result = await api(server.baseUrl, 'PUT', '/api/member/password', { token: victimToken, body: { current_password: `sai-${i}`, new_password: 'NewPass#12345' } });
        statuses.push(result.status);
    }
    assert.deepStrictEqual(statuses, [400, 400, 400, 429, 429]);

    const fine = await api(server.baseUrl, 'PUT', '/api/member/password', { token: otherToken, body: { current_password: 'sai', new_password: 'NewPass#12345' } });
    assert.strictEqual(fine.status, 400, 'tài khoản khác chưa chạm hạn mức');
});

test('upload: quá hạn mức theo tài khoản thì 429', async () => {
    const user = await createTempAccount({ role: 'member', clanId });
    const token = await login(server.baseUrl, user.email, user.password);
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
        // Không đính kèm file nên trả lỗi 4xx của controller, nhưng vẫn tính vào hạn mức.
        const result = await api(server.baseUrl, 'POST', '/api/upload', { token });
        statuses.push(result.status);
    }
    assert.ok(statuses.slice(0, 3).every((status) => status !== 429), statuses.join(','));
    assert.deepStrictEqual(statuses.slice(3), [429, 429]);
});

test('xác thực lời mời: quá hạn mức theo IP thì 429', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
        const result = await api(server.baseUrl, 'GET', `/api/invitations/verify?token=khong-ton-tai-${i}`);
        statuses.push(result.status);
    }
    assert.ok(statuses.slice(0, 3).every((status) => status !== 429), statuses.join(','));
    assert.deepStrictEqual(statuses.slice(3), [429, 429]);
});
