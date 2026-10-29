process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { securityHeaders, CSP } = require('../src/middleware/securityHeaders');

const run = (req) => {
    const res = { headers: {}, set(headers) { Object.assign(this.headers, headers); } };
    let nextCalled = false;
    securityHeaders(req, res, () => { nextCalled = true; });
    return { headers: res.headers, nextCalled };
};

test('request HTTP thường: có header cơ bản và CSP nhưng không có HSTS', () => {
    const { headers, nextCalled } = run({ secure: false });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.strictEqual(headers['Content-Security-Policy'], CSP);
    assert.strictEqual(headers['Strict-Transport-Security'], undefined);
});

test('request HTTPS: có HSTS', () => {
    const { headers } = run({ secure: true });
    assert.match(headers['Strict-Transport-Security'], /^max-age=\d+; includeSubDomains$/);
});

test('CSP của API chặn mọi nguồn trừ ảnh/media cùng nguồn', () => {
    assert.match(CSP, /default-src 'none'/);
    assert.match(CSP, /frame-ancestors 'self'/);
    assert.match(CSP, /img-src 'self' data:/);
    assert.ok(!/unsafe-eval|script-src/.test(CSP), 'API không cần và không được cho chạy script');
});
