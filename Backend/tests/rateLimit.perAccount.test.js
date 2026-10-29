process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const rateLimits = require('../src/middleware/authRateLimit');

// Express res.set hỗ trợ cả set(tên, giá trị) lẫn set(object); limiter dùng dạng thứ nhất.
const makeRes = () => {
    const res = { statusCode: 200, body: null, headers: {} };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.set = (name, value) => { res.headers[name] = value; return res; };
    return res;
};

const hit = (limiter, req) => {
    const res = makeRes();
    let passed = false;
    limiter(req, res, () => { passed = true; });
    return { res, passed };
};

test('passwordChangeRateLimit: tính theo tài khoản, hai tài khoản cùng IP không dùng chung hạn mức', () => {
    const limiter = rateLimits.passwordChangeRateLimit;
    const a = { ip: '1.1.1.1', user: { id: 1 } };
    const b = { ip: '1.1.1.1', user: { id: 2 } };
    for (let i = 0; i < 10; i += 1) assert.strictEqual(hit(limiter, a).passed, true, `lần ${i + 1}`);
    const blocked = hit(limiter, a);
    assert.strictEqual(blocked.passed, false);
    assert.strictEqual(blocked.res.statusCode, 429);
    assert.ok(Number(blocked.res.headers['Retry-After']) >= 1);
    assert.strictEqual(blocked.res.body.limiter, 'password-change');
    assert.strictEqual(hit(limiter, b).passed, true, 'tài khoản khác vẫn dùng được');
});

test('uploadRateLimit: theo tài khoản, quá hạn mức trả 429', () => {
    const limiter = rateLimits.uploadRateLimit;
    const user = { ip: '2.2.2.2', user: { id: 50 } };
    for (let i = 0; i < 60; i += 1) assert.strictEqual(hit(limiter, user).passed, true);
    assert.strictEqual(hit(limiter, user).res.statusCode, 429);
    assert.strictEqual(hit(limiter, { ip: '2.2.2.2', user: { id: 51 } }).passed, true);
});

test('invitationVerifyRateLimit: theo IP (endpoint không cần đăng nhập)', () => {
    const limiter = rateLimits.invitationVerifyRateLimit;
    for (let i = 0; i < 30; i += 1) assert.strictEqual(hit(limiter, { ip: '3.3.3.3' }).passed, true);
    assert.strictEqual(hit(limiter, { ip: '3.3.3.3' }).res.statusCode, 429);
    assert.strictEqual(hit(limiter, { ip: '4.4.4.4' }).passed, true);
});

// Đảm bảo limiter thật sự được gắn vào route (đặt sau verifyToken để biết tài khoản).
const handlerNames = (router, method, routePath) => {
    const layer = router.stack.find((item) => item.route && item.route.path === routePath && item.route.methods[method]);
    assert.ok(layer, `không thấy route ${method.toUpperCase()} ${routePath}`);
    return layer.route.stack.map((item) => item.name);
};

test('route đổi mật khẩu có limiter sau verifyToken', () => {
    const names = handlerNames(require('../src/modules/member/member.routes'), 'put', '/password');
    assert.ok(names.includes('authRateLimit'), names.join(','));
    assert.ok(names.indexOf('verifyToken') < names.indexOf('authRateLimit'), 'limiter phải đứng sau verifyToken');
});

test('route xác thực lời mời có limiter', () => {
    const names = handlerNames(require('../src/modules/invitations/invitation.routes'), 'get', '/verify');
    assert.ok(names.includes('authRateLimit'), names.join(','));
});
