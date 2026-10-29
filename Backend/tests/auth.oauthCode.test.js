process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { mockRes } = require('./helpers.mockDb');
const { createOAuthCode, consumeOAuthCode } = require('../src/modules/auth/oauthCodeStore');
const authController = require('../src/modules/auth/auth.controller');
const schemas = require('../src/shared/validation/schemas');

test('mã đăng nhập dùng được đúng một lần', () => {
    const code = createOAuthCode('jwt-abc');
    assert.ok(code.length >= 40, 'mã phải đủ dài/ngẫu nhiên');
    assert.strictEqual(consumeOAuthCode(code), 'jwt-abc');
    assert.strictEqual(consumeOAuthCode(code), null);
});

test('mã lạ, rỗng hoặc sai kiểu trả null', () => {
    for (const bad of ['khong-ton-tai', '', null, undefined, 123, {}]) {
        assert.strictEqual(consumeOAuthCode(bad), null);
    }
});

test('mã hết hạn sau TTL', () => {
    const realNow = Date.now;
    const code = createOAuthCode('jwt-old');
    try {
        const start = realNow();
        Date.now = () => start + 61 * 1000;
        assert.strictEqual(consumeOAuthCode(code), null);
    } finally {
        Date.now = realNow;
    }
});

test('hai mã khác nhau không lẫn token', () => {
    const a = createOAuthCode('token-a');
    const b = createOAuthCode('token-b');
    assert.notStrictEqual(a, b);
    assert.strictEqual(consumeOAuthCode(b), 'token-b');
    assert.strictEqual(consumeOAuthCode(a), 'token-a');
});

test('POST /oauth/exchange: mã đúng trả token một lần, mã sai/đã dùng trả 400', () => {
    const code = createOAuthCode('jwt-xyz');
    let res = mockRes();
    authController.exchangeOAuthCode({ body: { code } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { success: true, token: 'jwt-xyz' });

    res = mockRes();
    authController.exchangeOAuthCode({ body: { code } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);

    res = mockRes();
    authController.exchangeOAuthCode({ body: {} }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('schema oauthExchange: thiếu/quá dài/sai kiểu bị 400 trước controller', () => {
    const run = (body) => {
        const res = mockRes();
        let nextCalled = false;
        schemas.oauthExchange({ body }, res, () => { nextCalled = true; });
        return { res, nextCalled };
    };
    assert.strictEqual(run({ code: 'abc' }).nextCalled, true);
    for (const bad of [{}, { code: '' }, { code: 'x'.repeat(101) }, { code: { a: 1 } }]) {
        const r = run(bad);
        assert.strictEqual(r.nextCalled, false, JSON.stringify(bad));
        assert.strictEqual(r.res.statusCode, 400);
    }
});
