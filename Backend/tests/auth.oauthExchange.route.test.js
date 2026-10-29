process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const express = require('express');
const { createOAuthCode } = require('../src/modules/auth/oauthCodeStore');
const { buildOAuthRedirectUrl } = require('../src/modules/auth/socialAuth.service');
const authRoutes = require('../src/modules/auth/auth.routes');

let server;
let baseUrl;
test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

const exchange = (body) => fetch(`${baseUrl}/api/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

test('router thật: đổi mã qua HTTP trả token đúng một lần', async () => {
    const code = createOAuthCode('jwt-http');
    const first = await exchange({ code });
    assert.strictEqual(first.status, 200);
    assert.deepStrictEqual(await first.json(), { success: true, token: 'jwt-http' });

    const second = await exchange({ code });
    assert.strictEqual(second.status, 400);
});

test('router thật: thiếu mã, mã rỗng hoặc quá dài bị 400', async () => {
    for (const body of [{}, { code: '' }, { code: 'x'.repeat(200) }, { code: 'ma-khong-ton-tai' }]) {
        const response = await exchange(body);
        assert.strictEqual(response.status, 400, JSON.stringify(body).slice(0, 40));
    }
});

test('URL chuyển hướng OAuth mang mã dùng một lần, không mang JWT', () => {
    const url = new URL(buildOAuthRedirectUrl({ code: 'abc123' }));
    assert.strictEqual(url.pathname, '/auth/callback');
    assert.strictEqual(url.searchParams.get('code'), 'abc123');
    assert.strictEqual(url.searchParams.get('token'), null);
    // Dù ai đó truyền nhầm token vào builder thì cũng không được đưa lên URL.
    const leaked = new URL(buildOAuthRedirectUrl({ code: 'x', token: 'jwt-secret' }));
    assert.strictEqual(leaked.searchParams.get('token'), null);
});
