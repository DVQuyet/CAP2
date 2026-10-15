process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_ACCOUNT_CACHE_TTL_MS = '60000';

const test = require('node:test');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { verifyToken, checkRole, invalidateAccountCache } = require('../src/middleware/authMiddleware');

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
const run = async (token) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = mockRes();
    let nextCalled = false;
    await verifyToken(req, res, () => { nextCalled = true; });
    return { req, res, nextCalled };
};

test.beforeEach(() => invalidateAccountCache());

test('thiếu token trả 401', async () => {
    const { res, nextCalled } = await run(null);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nextCalled, false);
});

test('token sai chữ ký trả 403', async () => {
    const { res, nextCalled } = await run('abc.def.ghi');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(nextCalled, false);
});

test('tài khoản không còn tồn tại trả 401', async () => {
    createMockDb(async () => [[]]);
    const { res, nextCalled } = await run(sign({ id: 10, role_name: 'member' }));
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nextCalled, false);
});

test('tài khoản rejected hoặc đã lưu trữ bị chặn', async () => {
    createMockDb(async (sql) => {
        if (/FROM accounts/.test(sql)) return [[{ id: 11, role_id: 3, status: 'rejected' }]];
        return [[]];
    });
    let result = await run(sign({ id: 11, role_name: 'member' }));
    assert.strictEqual(result.res.statusCode, 403);
    assert.strictEqual(result.res.body.code, 'ACCOUNT_DISABLED');

    invalidateAccountCache();
    createMockDb(async (sql) => {
        if (/FROM accounts/.test(sql)) return [[{ id: 12, role_id: 3, status: 'active' }]];
        if (/FROM archived_members/.test(sql)) return [[{ id: 1 }]];
        return [[]];
    });
    result = await run(sign({ id: 12, role_name: 'member' }));
    assert.strictEqual(result.res.statusCode, 403);
    assert.strictEqual(result.nextCalled, false);
});

test('role lấy từ DB thay vì token cũ', async () => {
    createMockDb(async (sql) => {
        if (/FROM accounts/.test(sql)) return [[{ id: 13, role_id: 2, status: 'active' }]];
        return [[]];
    });
    const { req, nextCalled } = await run(sign({ id: 13, role_id: 3, role_name: 'member' }));
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.user.role_id, 2);
    assert.strictEqual(req.user.role_name, 'manager');

    // Admin bị hạ xuống member thì token admin cũ không còn quyền admin.
    invalidateAccountCache();
    createMockDb(async (sql) => (/FROM accounts/.test(sql) ? [[{ id: 14, role_id: 3, status: 'active' }]] : [[]]));
    const demoted = await run(sign({ id: 14, role_id: 1, role_name: 'admin' }));
    const res = mockRes();
    let allowed = false;
    checkRole(['admin'])(demoted.req, res, () => { allowed = true; });
    assert.strictEqual(allowed, false);
    assert.strictEqual(res.statusCode, 403);
});

test('cache tránh truy vấn lặp và invalidate buộc đọc lại', async () => {
    const mock = createMockDb(async (sql) => (/FROM accounts/.test(sql) ? [[{ id: 15, role_id: 3, status: 'active' }]] : [[]]));
    await run(sign({ id: 15 }));
    await run(sign({ id: 15 }));
    assert.strictEqual(mock.find(/FROM accounts/).length, 1);
    invalidateAccountCache(15);
    await run(sign({ id: 15 }));
    assert.strictEqual(mock.find(/FROM accounts/).length, 2);
});

test('bảng archived_members chưa tồn tại không làm hỏng đăng nhập', async () => {
    createMockDb(async (sql) => {
        if (/FROM accounts/.test(sql)) return [[{ id: 16, role_id: 3, status: 'active' }]];
        const error = new Error('no table');
        error.code = 'ER_NO_SUCH_TABLE';
        throw error;
    });
    const { nextCalled } = await run(sign({ id: 16 }));
    assert.strictEqual(nextCalled, true);
});

test('lỗi DB trả 503 và không cho đi tiếp', async () => {
    createMockDb(async () => { throw new Error('db down'); });
    const { res, nextCalled } = await run(sign({ id: 17 }));
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(nextCalled, false);
});

test('token không gắn tài khoản được chuyển cho checkRole', async () => {
    const { req, nextCalled } = await run(sign({ type: 'social_registration' }));
    assert.strictEqual(nextCalled, true);
    const res = mockRes();
    checkRole(['member'])(req, res, () => assert.fail('không được cho qua'));
    assert.strictEqual(res.statusCode, 403);
});

test('getAccountAccess dùng cho socket/media phản ánh trạng thái và role trong DB', async () => {
    const { getAccountAccess } = require('../src/middleware/authMiddleware');
    createMockDb(async (sql) => {
        if (/FROM accounts/.test(sql)) return [[{ id: 18, role_id: 3, status: 'rejected' }]];
        return [[]];
    });
    const disabled = await getAccountAccess(18);
    assert.strictEqual(disabled.disabled, true);

    invalidateAccountCache();
    createMockDb(async (sql) => (/FROM accounts/.test(sql) ? [[{ id: 19, role_id: 3, status: 'active' }]] : [[]]));
    const demoted = await getAccountAccess(19);
    assert.strictEqual(demoted.disabled, false);
    assert.strictEqual(demoted.roleId, 3);
    assert.strictEqual(demoted.roleName, 'member');

    invalidateAccountCache();
    createMockDb(async () => [[]]);
    assert.strictEqual(await getAccountAccess(20), null);
});
