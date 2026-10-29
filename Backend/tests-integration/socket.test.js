// Socket.IO chỉ kiểm token lúc kết nối: đổi mật khẩu / khóa tài khoản phải ngắt kết nối đang mở và chặn kết nối lại bằng token cũ.
const test = require('node:test');
const assert = require('assert');
const { io } = require('socket.io-client');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let clanId;
const sockets = [];

function connect(token) {
    const socket = io(server.baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000 });
    sockets.push(socket);
    return socket;
}

// Chờ sự kiện đầu tiên trong số các sự kiện cho trước; trả về { name, payload }.
function waitFor(socket, names, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Hết ${timeoutMs}ms chờ ${names.join('/')}`)), timeoutMs);
        for (const name of names) {
            socket.once(name, (payload) => { clearTimeout(timer); resolve({ name, payload }); });
        }
    });
}

async function connectOk(token) {
    const socket = connect(token);
    const event = await waitFor(socket, ['connect', 'connect_error']);
    assert.strictEqual(event.name, 'connect', `kết nối thất bại: ${event.payload?.message}`);
    return socket;
}

test.before(async () => {
    server = await startServer({ env: { AUTH_ACCOUNT_CACHE_TTL_MS: '0' } });
    clanId = await createTempClan('S');
});
test.after(async () => {
    for (const socket of sockets) socket.disconnect();
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

test('đối chứng: token hợp lệ kết nối được, token rác bị từ chối', async () => {
    const member = await createTempAccount({ role: 'member', clanId });
    const token = await login(server.baseUrl, member.email, member.password);
    await connectOk(token);

    const bad = connect('khong-phai-jwt');
    const event = await waitFor(bad, ['connect', 'connect_error']);
    assert.strictEqual(event.name, 'connect_error');
});

test('đổi mật khẩu ngắt socket đang mở; token cũ không kết nối lại được, token mới thì được', async () => {
    const member = await createTempAccount({ role: 'member', clanId });
    const oldToken = await login(server.baseUrl, member.email, member.password);
    const socket = await connectOk(oldToken);

    await sleep(1100); // iat tính bằng giây
    const disconnected = waitFor(socket, ['disconnect']);
    const changed = await api(server.baseUrl, 'PUT', '/api/member/password', { token: oldToken, body: { current_password: member.password, new_password: 'NewPass#24680' } });
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.data));
    const event = await disconnected;
    assert.strictEqual(event.payload, 'io server disconnect');

    const stale = connect(oldToken);
    const staleEvent = await waitFor(stale, ['connect', 'connect_error']);
    assert.strictEqual(staleEvent.name, 'connect_error');
    assert.match(staleEvent.payload.message, /revoked/i);

    await connectOk(changed.data.token);
});

test('manager khóa thành viên: socket của thành viên bị ngắt và không kết nối lại được', async () => {
    const manager = await createTempAccount({ role: 'manager', clanId });
    const member = await createTempAccount({ role: 'member', clanId });
    const managerToken = await login(server.baseUrl, manager.email, manager.password);
    const memberToken = await login(server.baseUrl, member.email, member.password);
    const socket = await connectOk(memberToken);

    const disconnected = waitFor(socket, ['disconnect']);
    const locked = await api(server.baseUrl, 'PUT', `/api/manager/members/${member.id}`, { token: managerToken, body: { status: 'rejected' } });
    assert.strictEqual(locked.status, 200, JSON.stringify(locked.data));
    await disconnected;

    const retry = connect(memberToken);
    const retryEvent = await waitFor(retry, ['connect', 'connect_error']);
    assert.strictEqual(retryEvent.name, 'connect_error');
    assert.match(retryEvent.payload.message, /disabled/i);
});

test('manager đặt mật khẩu hộ thành viên: token cũ của thành viên bị thu hồi và socket bị ngắt', async () => {
    const manager = await createTempAccount({ role: 'manager', clanId });
    const member = await createTempAccount({ role: 'member', clanId });
    const managerToken = await login(server.baseUrl, manager.email, manager.password);
    const memberToken = await login(server.baseUrl, member.email, member.password);
    const socket = await connectOk(memberToken);

    await sleep(1100);
    const disconnected = waitFor(socket, ['disconnect']);
    const reset = await api(server.baseUrl, 'PUT', `/api/manager/members/${member.id}`, { token: managerToken, body: { new_password: 'ManagerSet#97531' } });
    assert.strictEqual(reset.status, 200, JSON.stringify(reset.data));
    await disconnected;

    const stale = await api(server.baseUrl, 'GET', '/api/member/notifications', { token: memberToken });
    assert.strictEqual(stale.status, 401);
    assert.strictEqual(stale.data.code, 'TOKEN_INVALID');
    assert.ok(await login(server.baseUrl, member.email, 'ManagerSet#97531'));
});

test('admin đặt mật khẩu hộ và khóa tài khoản: token cũ bị thu hồi, socket bị ngắt', async () => {
    const admin = await createTempAccount({ role: 'admin' });
    const member = await createTempAccount({ role: 'member', clanId });
    const adminToken = await login(server.baseUrl, admin.email, admin.password);
    const memberToken = await login(server.baseUrl, member.email, member.password);
    const socket = await connectOk(memberToken);

    await sleep(1100);
    const disconnected = waitFor(socket, ['disconnect']);
    const reset = await api(server.baseUrl, 'PUT', `/api/admin/accounts/${member.id}`, { token: adminToken, body: { password: 'AdminSet#11223' } });
    assert.strictEqual(reset.status, 200, JSON.stringify(reset.data));
    await disconnected;

    const stale = await api(server.baseUrl, 'GET', '/api/member/notifications', { token: memberToken });
    assert.strictEqual(stale.status, 401);
    assert.strictEqual(stale.data.code, 'TOKEN_INVALID');

    const freshToken = await login(server.baseUrl, member.email, 'AdminSet#11223');
    const lock = await api(server.baseUrl, 'PUT', `/api/admin/accounts/${member.id}`, { token: adminToken, body: { status: 'rejected' } });
    assert.strictEqual(lock.status, 200, JSON.stringify(lock.data));
    const blocked = await api(server.baseUrl, 'GET', '/api/member/notifications', { token: freshToken });
    assert.strictEqual(blocked.status, 403);
    assert.strictEqual(blocked.data.code, 'ACCOUNT_DISABLED');
});
