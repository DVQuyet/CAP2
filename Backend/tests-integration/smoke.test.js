const test = require('node:test');
const assert = require('assert');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');

let server;
test.before(async () => { server = await startServer(); });
test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

test('member tạm đăng nhập và đọc được thông báo', async () => {
    const clanId = await createTempClan();
    const member = await createTempAccount({ role: 'member', clanId });
    const token = await login(server.baseUrl, member.email, member.password);
    const result = await api(server.baseUrl, 'GET', '/api/member/notifications', { token });
    assert.strictEqual(result.status, 200, JSON.stringify(result.data));
});

test('server thật trả header bảo mật và CSP; HTTP thường không có HSTS', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/);
    assert.strictEqual(response.headers.get('strict-transport-security'), null);
    assert.strictEqual(response.headers.get('x-powered-by'), null);
});

test('server sau proxy HTTPS (X-Forwarded-Proto) trả HSTS', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.match(response.headers.get('strict-transport-security') || '', /max-age=\d+/);
});
