process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_ACCOUNT_CACHE_TTL_MS = '60000';

const test = require('node:test');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { verifyToken, authenticateMediaToken, invalidateAccountCache } = require('../src/middleware/authMiddleware');
const { signMediaToken } = require('../src/config/jwt');
const authController = require('../src/modules/auth/auth.controller');

const SECRET = process.env.JWT_SECRET;
test.beforeEach(() => invalidateAccountCache());
const activeAccount = (id, extra = {}) => createMockDb(async (sql) => (/FROM accounts/.test(sql) ? [[{ id, role_id: 3, status: 'active', ...extra }]] : [[]]));

test('signMediaToken: token có scope media, gắn đúng tài khoản', () => {
    const decoded = jwt.verify(signMediaToken(7), SECRET);
    assert.strictEqual(decoded.scope, 'media');
    assert.strictEqual(decoded.id, 7);
    assert.ok(decoded.exp > decoded.iat);
});

test('verifyToken từ chối token media: không gọi được API bằng token media', async () => {
    activeAccount(7);
    const req = { headers: { authorization: `Bearer ${signMediaToken(7)}` } };
    const res = mockRes();
    let nextCalled = false;
    await verifyToken(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'TOKEN_INVALID');
    assert.strictEqual(nextCalled, false);
});

test('authenticateMediaToken: token media hợp lệ đặt req.user', async () => {
    activeAccount(8);
    const req = {};
    assert.strictEqual(await authenticateMediaToken(req, signMediaToken(8)), true);
    assert.strictEqual(req.user.id, 8);
    assert.strictEqual(req.user.role_name, 'member');
});

test('authenticateMediaToken: JWT đăng nhập, token sai chữ ký hoặc rác bị từ chối', async () => {
    activeAccount(9);
    const login = jwt.sign({ id: 9, role_name: 'member' }, SECRET, { expiresIn: '1h' });
    assert.strictEqual(await authenticateMediaToken({}, login), false);
    const forged = jwt.sign({ id: 9, scope: 'media' }, 'khoa-khac', { expiresIn: '1h' });
    assert.strictEqual(await authenticateMediaToken({}, forged), false);
    assert.strictEqual(await authenticateMediaToken({}, 'abc.def.ghi'), false);
});

test('authenticateMediaToken: tài khoản bị khóa hoặc đã đổi mật khẩu sau khi cấp thì bị từ chối', async () => {
    createMockDb(async (sql) => (/FROM accounts/.test(sql) ? [[{ id: 10, role_id: 3, status: 'rejected' }]] : [[]]));
    assert.strictEqual(await authenticateMediaToken({}, signMediaToken(10)), false);

    invalidateAccountCache();
    const now = Math.floor(Date.now() / 1000);
    activeAccount(11, { password_changed_ts: now + 5 });
    assert.strictEqual(await authenticateMediaToken({}, signMediaToken(11)), false);
});

test('GET /auth/media-token trả token media của chính người gọi', () => {
    const res = mockRes();
    authController.getMediaToken({ user: { id: 12 } }, res);
    assert.strictEqual(res.statusCode, 200);
    const decoded = jwt.verify(res.body.media_token, SECRET);
    assert.strictEqual(decoded.scope, 'media');
    assert.strictEqual(decoded.id, 12);

    const bad = mockRes();
    authController.getMediaToken({ user: {} }, bad);
    assert.strictEqual(bad.statusCode, 401);
});
