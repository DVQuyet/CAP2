// Ảnh/ghi âm tải qua URL chỉ nhận token media; JWT đăng nhập không được nằm trên URL.
const test = require('node:test');
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('../node_modules/jsonwebtoken');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
const ctx = {};

test.before(async () => {
    server = await startServer({ env: { AUTH_ACCOUNT_CACHE_TTL_MS: '0' } });
    const clanId = await createTempClan('M');
    ctx.member = await createTempAccount({ role: 'member', clanId });
    ctx.outsider = await createTempAccount({ role: 'member', clanId: await createTempClan('O') });
    ctx.loginToken = await login(server.baseUrl, ctx.member.email, ctx.member.password);
    ctx.outsiderToken = await login(server.baseUrl, ctx.outsider.email, ctx.outsider.password);
    // Có khóa ?k= nên đây là media "mới": chỉ tải được khi có khóa hoặc token hợp lệ của người cùng dòng họ.
    const [media] = await db.query(
        "INSERT INTO media_files (owner_account_id, owner_person_id, clan_id, usage_type, original_filename, mime_type, file_size_bytes, image_data, access_key) VALUES (?, ?, ?, 'post_image', 'Ảnh giỗ cụ.png', 'image/png', ?, ?, ?)",
        [ctx.member.id, ctx.member.personId, clanId, PNG.length, PNG, crypto.randomBytes(16).toString('hex')]
    );
    ctx.mediaId = media.insertId;
});
test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

const getMediaToken = async (token) => {
    const result = await api(server.baseUrl, 'GET', '/api/auth/media-token', { token });
    assert.strictEqual(result.status, 200, JSON.stringify(result.data));
    return result.data.media_token;
};
const fetchMedia = (path, headers = {}) => fetch(`${server.baseUrl}${path}`, { headers });

test('media-token: cấp token scope media; token này không gọi được API', async () => {
    const mediaToken = await getMediaToken(ctx.loginToken);
    assert.strictEqual(jwt.decode(mediaToken).scope, 'media');
    const asApi = await api(server.baseUrl, 'GET', '/api/member/notifications', { token: mediaToken });
    assert.strictEqual(asApi.status, 401);
    const noToken = await api(server.baseUrl, 'GET', '/api/auth/media-token', {});
    assert.strictEqual(noToken.status, 401);
});

test('media: ?token=<token media> tải được; ?token=<JWT đăng nhập> bị từ chối', async () => {
    const mediaToken = await getMediaToken(ctx.loginToken);
    const ok = await fetchMedia(`/api/media/${ctx.mediaId}?token=${encodeURIComponent(mediaToken)}`);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers.get('content-type'), 'image/png');
    assert.match(ok.headers.get('content-disposition') || '', /filename\*=UTF-8''/, 'tên file tiếng Việt phải được mã hóa an toàn');

    const loginInUrl = await fetchMedia(`/api/media/${ctx.mediaId}?token=${encodeURIComponent(ctx.loginToken)}`);
    assert.strictEqual(loginInUrl.status, 404, 'JWT đăng nhập trên URL không được chấp nhận');
});

test('media: header Authorization nhận JWT đăng nhập nhưng không nhận token media', async () => {
    const mediaToken = await getMediaToken(ctx.loginToken);
    const withLogin = await fetchMedia(`/api/media/${ctx.mediaId}`, { Authorization: `Bearer ${ctx.loginToken}` });
    assert.strictEqual(withLogin.status, 200);
    const withMedia = await fetchMedia(`/api/media/${ctx.mediaId}`, { Authorization: `Bearer ${mediaToken}` });
    assert.strictEqual(withMedia.status, 404);
});

test('media: token media của người ngoài dòng họ không tải được media của dòng họ khác', async () => {
    const outsiderMedia = await getMediaToken(ctx.outsiderToken);
    const result = await fetchMedia(`/api/media/${ctx.mediaId}?token=${encodeURIComponent(outsiderMedia)}`);
    assert.strictEqual(result.status, 404);
});

test('voice: ?token= chỉ nhận token media, JWT đăng nhập trên URL bị 401', async () => {
    const mediaToken = await getMediaToken(ctx.loginToken);
    const viaLogin = await fetchMedia(`/api/voice/recordings/999999999/audio?token=${encodeURIComponent(ctx.loginToken)}`);
    assert.strictEqual(viaLogin.status, 401);
    const viaMedia = await fetchMedia(`/api/voice/recordings/999999999/audio?token=${encodeURIComponent(mediaToken)}`);
    assert.notStrictEqual(viaMedia.status, 401, 'token media hợp lệ phải qua được bước xác thực (kết quả 404 vì không có bản ghi)');
    const viaGarbage = await fetchMedia('/api/voice/recordings/999999999/audio?token=rac');
    assert.strictEqual(viaGarbage.status, 401);
});

test('đổi mật khẩu thu hồi cả token media cũ', async () => {
    const member = await createTempAccount({ role: 'member', clanId: await createTempClan('P') });
    const token = await login(server.baseUrl, member.email, member.password);
    const oldMedia = await getMediaToken(token);
    await sleep(1100);
    const changed = await api(server.baseUrl, 'PUT', '/api/member/password', { token, body: { current_password: member.password, new_password: 'NewPass#13579' } });
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.data));

    const stale = await fetchMedia(`/api/voice/recordings/999999999/audio?token=${encodeURIComponent(oldMedia)}`);
    assert.strictEqual(stale.status, 401);
    const freshMedia = await getMediaToken(changed.data.token);
    const fresh = await fetchMedia(`/api/voice/recordings/999999999/audio?token=${encodeURIComponent(freshMedia)}`);
    assert.notStrictEqual(fresh.status, 401);
});
