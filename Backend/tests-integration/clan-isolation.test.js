// Người của dòng họ A không đọc/ghi được dữ liệu của dòng họ B. Mỗi dòng kiểm cả mã HTTP lẫn trạng thái DB sau đó.
const test = require('node:test');
const assert = require('assert');
const crypto = require('crypto');
const { startServer } = require('./helpers/server');
const { db, NAME_PREFIX, createTempClan, createTempPerson, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');

const DENIED = [400, 403, 404];
const isDenied = (status) => DENIED.includes(status);

let server;
const ctx = {};

test.before(async () => {
    server = await startServer({ env: { AUTH_ACCOUNT_CACHE_TTL_MS: '0' } });
    const clanA = await createTempClan('A');
    const clanB = await createTempClan('B');
    Object.assign(ctx, { clanA, clanB });

    ctx.managerA = await createTempAccount({ role: 'manager', clanId: clanA });
    ctx.memberA = await createTempAccount({ role: 'member', clanId: clanA });
    ctx.managerB = await createTempAccount({ role: 'manager', clanId: clanB });
    ctx.memberB = await createTempAccount({ role: 'member', clanId: clanB });
    ctx.tokenManagerA = await login(server.baseUrl, ctx.managerA.email, ctx.managerA.password);
    ctx.tokenMemberA = await login(server.baseUrl, ctx.memberA.email, ctx.memberA.password);

    // Dữ liệu của dòng họ B.
    ctx.personB = await createTempPerson({ clanId: clanB, name: 'TargetB', generation: 2 });
    ctx.personB2 = await createTempPerson({ clanId: clanB, name: 'SpouseB', gender: 2, generation: 2 });
    const [post] = await db.query(
        "INSERT INTO posts (clan_id, author_id, description, content, status) VALUES (?, ?, 'ITEST mô tả', 'ITEST nội dung', 'approved')",
        [clanB, ctx.memberB.personId]
    );
    ctx.postB = post.insertId;
    const [pendingPost] = await db.query(
        "INSERT INTO posts (clan_id, author_id, description, content, status) VALUES (?, ?, 'ITEST chờ duyệt', 'ITEST chờ duyệt', 'pending')",
        [clanB, ctx.memberB.personId]
    );
    ctx.pendingPostB = pendingPost.insertId;
    const [event] = await db.query(
        "INSERT INTO calendar_events (clan_id, creator_account_id, title, event_date, type, visibility) VALUES (?, ?, 'ITEST lịch B', '2026-12-01', 'personal', 'global')",
        [clanB, ctx.managerB.id]
    );
    ctx.eventB = event.insertId;
    const [contribution] = await db.query(
        "INSERT INTO event_contributions (clan_id, person_id, amount, contribution_date, method, status) VALUES (?, ?, 100000, '2026-10-01', 'cash', 'pending')",
        [clanB, ctx.memberB.personId]
    );
    ctx.contributionB = contribution.insertId;
    ctx.mediaKeyB = crypto.randomBytes(16).toString('hex');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const [media] = await db.query(
        "INSERT INTO media_files (owner_account_id, owner_person_id, clan_id, usage_type, original_filename, mime_type, file_size_bytes, image_data, access_key) VALUES (?, ?, ?, 'post_image', 'itest.png', 'image/png', ?, ?, ?)",
        [ctx.memberB.id, ctx.memberB.personId, clanB, png.length, png, ctx.mediaKeyB]
    );
    ctx.mediaB = media.insertId;
    // Tài khoản đang chờ duyệt ở dòng họ B.
    ctx.pendingB = await createTempAccount({ role: 'member', clanId: clanB, status: 'pending' });
    ctx.tokenManagerB = await login(server.baseUrl, ctx.managerB.email, ctx.managerB.password);
});

test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

const scalar = async (sql, params) => {
    const [rows] = await db.query(sql, params);
    return rows[0];
};

// ---- Cây gia phả ----
for (const [label, tokenKey] of [['manager A', 'tokenManagerA'], ['member A', 'tokenMemberA']]) {
    test(`cây: ${label} không sửa được người của dòng họ B`, async () => {
        const before = await scalar('SELECT display_name FROM people WHERE id = ?', [ctx.personB]);
        const result = await api(server.baseUrl, 'PATCH', `/api/people/${ctx.personB}`, { token: ctx[tokenKey], body: { display_name: `${NAME_PREFIX}HACKED`, first_name: 'HACKED' } });
        assert.ok(isDenied(result.status), `mong đợi bị từ chối, nhận ${result.status} ${JSON.stringify(result.data)}`);
        const after = await scalar('SELECT display_name FROM people WHERE id = ?', [ctx.personB]);
        assert.strictEqual(after.display_name, before.display_name);
    });

    test(`cây: ${label} không xóa được người của dòng họ B`, async () => {
        const result = await api(server.baseUrl, 'DELETE', `/api/people/${ctx.personB}`, { token: ctx[tokenKey] });
        assert.ok(isDenied(result.status), `nhận ${result.status} ${JSON.stringify(result.data)}`);
        const row = await scalar('SELECT id FROM people WHERE id = ?', [ctx.personB]);
        assert.ok(row, 'người của B không được biến mất');
    });
}

test('cây: manager A không đổi được vị trí người của dòng họ B', async () => {
    await db.query('UPDATE people SET tree_x = 10, tree_y = 20 WHERE id = ?', [ctx.personB]);
    const result = await api(server.baseUrl, 'PATCH', `/api/people/${ctx.personB}/position`, { token: ctx.tokenManagerA, body: { x: 999, y: 999, tree_x: 999, tree_y: 999 } });
    assert.ok(isDenied(result.status), `nhận ${result.status} ${JSON.stringify(result.data)}`);
    const row = await scalar('SELECT tree_x, tree_y FROM people WHERE id = ?', [ctx.personB]);
    assert.deepStrictEqual([Number(row.tree_x), Number(row.tree_y)], [10, 20]);
});

test('cây: manager A không tạo được gia đình/liên kết dùng người của dòng họ B', async () => {
    const result = await api(server.baseUrl, 'POST', '/api/families', { token: ctx.tokenManagerA, body: { father_id: ctx.personB, mother_id: ctx.personB2 } });
    assert.ok(isDenied(result.status), `nhận ${result.status} ${JSON.stringify(result.data)}`);
    const row = await scalar('SELECT COUNT(*) AS n FROM families WHERE father_id = ? OR mother_id = ?', [ctx.personB, ctx.personB2]);
    assert.strictEqual(Number(row.n), 0);
});

test('cây: manager A không xem/sửa/lưu trữ được thành viên của dòng họ B', async () => {
    const detail = await api(server.baseUrl, 'GET', `/api/manager/members/${ctx.memberB.id}`, { token: ctx.tokenManagerA });
    assert.ok(isDenied(detail.status), `xem: ${detail.status}`);

    const update = await api(server.baseUrl, 'PUT', `/api/manager/members/${ctx.memberB.id}`, { token: ctx.tokenManagerA, body: { display_name: `${NAME_PREFIX}HACKED2`, first_name: 'HACKED2' } });
    assert.ok(isDenied(update.status), `sửa: ${update.status} ${JSON.stringify(update.data)}`);
    const row = await scalar('SELECT display_name FROM people WHERE id = ?', [ctx.memberB.personId]);
    assert.ok(!row.display_name.includes('HACKED2'));

    const archive = await api(server.baseUrl, 'POST', `/api/manager/members/${ctx.memberB.id}/archive`, { token: ctx.tokenManagerA, body: { reason: 'itest' } });
    assert.ok(isDenied(archive.status), `lưu trữ: ${archive.status} ${JSON.stringify(archive.data)}`);
    const archived = await scalar('SELECT COUNT(*) AS n FROM archived_members WHERE account_id = ?', [ctx.memberB.id]);
    assert.strictEqual(Number(archived.n), 0);
});

test('cây: manager A không duyệt được tài khoản chờ duyệt của dòng họ B', async () => {
    const result = await api(server.baseUrl, 'POST', `/api/manager/approve/${ctx.pendingB.id}`, { token: ctx.tokenManagerA });
    assert.ok(isDenied(result.status), `nhận ${result.status} ${JSON.stringify(result.data)}`);
    const row = await scalar('SELECT status FROM accounts WHERE id = ?', [ctx.pendingB.id]);
    assert.strictEqual(row.status, 'pending');
});

// ---- Lịch ----
test('lịch: A không sửa/xóa được lịch của dòng họ B', async () => {
    const put = await api(server.baseUrl, 'PUT', `/api/calendar/events/${ctx.eventB}`, { token: ctx.tokenManagerA, body: { title: 'HACKED' } });
    assert.ok(isDenied(put.status), `sửa: ${put.status}`);
    const del = await api(server.baseUrl, 'DELETE', `/api/calendar/events/${ctx.eventB}`, { token: ctx.tokenManagerA });
    assert.ok(isDenied(del.status), `xóa: ${del.status}`);
    const row = await scalar('SELECT title FROM calendar_events WHERE id = ?', [ctx.eventB]);
    assert.ok(row, 'lịch của B không được biến mất');
    assert.strictEqual(row.title, 'ITEST lịch B');
});

test('lịch: A không thấy lịch dòng họ B trong danh sách', async () => {
    const list = await api(server.baseUrl, 'GET', '/api/calendar/events?from=2026-11-01&to=2026-12-31', { token: ctx.tokenManagerA });
    assert.strictEqual(list.status, 200);
    assert.ok(!JSON.stringify(list.data).includes('ITEST lịch B'));
});

// ---- Quỹ ----
test('quỹ: manager A không duyệt được khoản đóng của dòng họ B', async () => {
    const result = await api(server.baseUrl, 'POST', '/api/manager/fund/approve', { token: ctx.tokenManagerA, body: { transaction_id: ctx.contributionB, status: 'approved' } });
    assert.ok(isDenied(result.status), `nhận ${result.status} ${JSON.stringify(result.data)}`);
    const row = await scalar('SELECT status FROM event_contributions WHERE id = ?', [ctx.contributionB]);
    assert.strictEqual(row.status, 'pending');
});

// ---- Bài viết ----
test('bài viết: A không bình luận/sửa/xóa được bài của dòng họ B', async () => {
    const comment = await api(server.baseUrl, 'POST', `/api/member/posts/${ctx.postB}/comments`, { token: ctx.tokenMemberA, body: { content: 'ITEST bình luận xâm nhập' } });
    assert.ok(isDenied(comment.status), `bình luận: ${comment.status} ${JSON.stringify(comment.data)}`);
    const comments = await scalar('SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ?', [ctx.postB]);
    assert.strictEqual(Number(comments.n), 0);

    const patch = await api(server.baseUrl, 'PATCH', `/api/member/posts/${ctx.postB}`, { token: ctx.tokenMemberA, body: { content: 'HACKED' } });
    assert.ok(isDenied(patch.status), `sửa: ${patch.status}`);
    const del = await api(server.baseUrl, 'DELETE', `/api/member/posts/${ctx.postB}`, { token: ctx.tokenMemberA });
    assert.ok(isDenied(del.status), `xóa: ${del.status}`);
    const row = await scalar('SELECT content FROM posts WHERE id = ?', [ctx.postB]);
    assert.ok(row, 'bài của B không được biến mất');
    assert.strictEqual(row.content, 'ITEST nội dung');
});

test('bài viết: A không đọc được bình luận và không thích được bài của dòng họ B', async () => {
    const like = await api(server.baseUrl, 'POST', `/api/member/posts/${ctx.postB}/like`, { token: ctx.tokenMemberA });
    assert.ok(isDenied(like.status), `thích: ${like.status}`);
    const likes = await scalar('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?', [ctx.postB]);
    assert.strictEqual(Number(likes.n), 0);

    const feed = await api(server.baseUrl, 'GET', '/api/member/posts/general', { token: ctx.tokenMemberA });
    assert.strictEqual(feed.status, 200);
    assert.ok(!JSON.stringify(feed.data).includes('ITEST nội dung'), 'bảng tin của A không được chứa bài của B');
});

test('bài viết: manager A không duyệt được bài chờ duyệt của dòng họ B', async () => {
    const result = await api(server.baseUrl, 'POST', `/api/manager/approve-post/${ctx.pendingPostB}`, { token: ctx.tokenManagerA });
    assert.ok(isDenied(result.status), `nhận ${result.status} ${JSON.stringify(result.data)}`);
    const row = await scalar('SELECT status FROM posts WHERE id = ?', [ctx.pendingPostB]);
    assert.strictEqual(row.status, 'pending');
});

// ---- Media ----
test('media: A không tải được media của B nếu thiếu khóa ?k=; B và người có khóa thì tải được', async () => {
    const asA = await fetch(`${server.baseUrl}/api/media/${ctx.mediaB}`, { headers: { Authorization: `Bearer ${ctx.tokenManagerA}` } });
    assert.strictEqual(asA.status, 404);
    const asAQuery = await fetch(`${server.baseUrl}/api/media/${ctx.mediaB}?token=${encodeURIComponent(ctx.tokenMemberA)}`);
    assert.strictEqual(asAQuery.status, 404);
    const anonymous = await fetch(`${server.baseUrl}/api/media/${ctx.mediaB}`);
    assert.strictEqual(anonymous.status, 404);

    const asB = await fetch(`${server.baseUrl}/api/media/${ctx.mediaB}`, { headers: { Authorization: `Bearer ${ctx.tokenManagerB}` } });
    assert.strictEqual(asB.status, 200, 'đối chứng: người của B phải tải được');
    const withKey = await fetch(`${server.baseUrl}/api/media/${ctx.mediaB}?k=${ctx.mediaKeyB}`);
    assert.strictEqual(withKey.status, 200, 'đối chứng: có khóa ?k= thì tải được (thiết kế hiện tại)');
});

// ---- Lời mời / phân quyền ----
test('lời mời: manager A truyền clan_id của B vẫn chỉ mời vào dòng họ của A', async () => {
    const email = `itest_invite_${Date.now()}@example.test`;
    await api(server.baseUrl, 'POST', '/api/invitations', { token: ctx.tokenManagerA, body: { email, role_id: 3, clan_id: ctx.clanB } });
    const [rows] = await db.query('SELECT clan_id FROM invitations WHERE email = ?', [email]);
    for (const row of rows) assert.notStrictEqual(Number(row.clan_id), ctx.clanB, 'lời mời không được gắn vào dòng họ B');
    await db.query('DELETE FROM invitations WHERE email = ?', [email]);
});

test('phân quyền: manager/member A không đổi được vai trò hay trạng thái tài khoản của B', async () => {
    for (const token of [ctx.tokenManagerA, ctx.tokenMemberA]) {
        const result = await api(server.baseUrl, 'PUT', `/api/admin/accounts/${ctx.memberB.id}`, { token, body: { role_id: 1, status: 'rejected' } });
        assert.ok(isDenied(result.status), `nhận ${result.status}`);
    }
    const row = await scalar('SELECT role_id, status FROM accounts WHERE id = ?', [ctx.memberB.id]);
    assert.deepStrictEqual([Number(row.role_id), row.status], [3, 'active']);
});

// ---- Đối chứng: cùng payload, nhưng do chính người của dòng họ B làm thì phải thành công ----
// Chạy sau cùng vì các thao tác này thay đổi dữ liệu của B. Chứng minh các test từ chối ở trên không đúng "do sai payload".
test('đối chứng: manager B làm đúng các thao tác đó thì thành công', async () => {
    const patch = await api(server.baseUrl, 'PATCH', `/api/people/${ctx.personB}`, { token: ctx.tokenManagerB, body: { display_name: `${NAME_PREFIX}RenamedByB`, first_name: 'RenamedByB' } });
    assert.strictEqual(patch.status, 200, `sửa người: ${patch.status} ${JSON.stringify(patch.data)}`);
    assert.ok((await scalar('SELECT display_name FROM people WHERE id = ?', [ctx.personB])).display_name.includes('RenamedByB'));

    const put = await api(server.baseUrl, 'PUT', `/api/calendar/events/${ctx.eventB}`, { token: ctx.tokenManagerB, body: { title: 'ITEST lịch B sửa' } });
    assert.strictEqual(put.status, 200, `sửa lịch: ${put.status} ${JSON.stringify(put.data)}`);

    const fund = await api(server.baseUrl, 'POST', '/api/manager/fund/approve', { token: ctx.tokenManagerB, body: { transaction_id: ctx.contributionB, status: 'approved' } });
    assert.strictEqual(fund.status, 200, `duyệt quỹ: ${fund.status} ${JSON.stringify(fund.data)}`);
    assert.strictEqual((await scalar('SELECT status FROM event_contributions WHERE id = ?', [ctx.contributionB])).status, 'approved');

    const approvePost = await api(server.baseUrl, 'POST', `/api/manager/approve-post/${ctx.pendingPostB}`, { token: ctx.tokenManagerB });
    assert.strictEqual(approvePost.status, 200, `duyệt bài: ${approvePost.status} ${JSON.stringify(approvePost.data)}`);
    assert.strictEqual((await scalar('SELECT status FROM posts WHERE id = ?', [ctx.pendingPostB])).status, 'approved');

    const approveUser = await api(server.baseUrl, 'POST', `/api/manager/approve/${ctx.pendingB.id}`, { token: ctx.tokenManagerB });
    assert.strictEqual(approveUser.status, 200, `duyệt tài khoản: ${approveUser.status} ${JSON.stringify(approveUser.data)}`);
    assert.strictEqual((await scalar('SELECT status FROM accounts WHERE id = ?', [ctx.pendingB.id])).status, 'active');
});

test('đối chứng: member B bình luận và thích bài của dòng họ B thì thành công', async () => {
    const tokenMemberB = await login(server.baseUrl, ctx.memberB.email, ctx.memberB.password);
    const comment = await api(server.baseUrl, 'POST', `/api/member/posts/${ctx.postB}/comments`, { token: tokenMemberB, body: { content: 'ITEST bình luận hợp lệ' } });
    assert.ok([200, 201].includes(comment.status), `bình luận: ${comment.status} ${JSON.stringify(comment.data)}`);
    const like = await api(server.baseUrl, 'POST', `/api/member/posts/${ctx.postB}/like`, { token: tokenMemberB });
    assert.strictEqual(like.status, 200, `thích: ${like.status} ${JSON.stringify(like.data)}`);
});

test('đối chứng: manager B đổi vị trí, tạo gia đình, xem và lưu trữ thành viên, xóa người của chính dòng họ B', async () => {
    const position = await api(server.baseUrl, 'PATCH', `/api/people/${ctx.personB}/position`, { token: ctx.tokenManagerB, body: { x: 999, y: 999, tree_x: 999, tree_y: 999 } });
    assert.strictEqual(position.status, 200, `vị trí: ${position.status} ${JSON.stringify(position.data)}`);
    assert.strictEqual(Number((await scalar('SELECT tree_x FROM people WHERE id = ?', [ctx.personB])).tree_x), 999);

    const detail = await api(server.baseUrl, 'GET', `/api/manager/members/${ctx.memberB.id}`, { token: ctx.tokenManagerB });
    assert.strictEqual(detail.status, 200, `xem: ${detail.status} ${JSON.stringify(detail.data)}`);

    const updateMember = await api(server.baseUrl, 'PUT', `/api/manager/members/${ctx.memberB.id}`, { token: ctx.tokenManagerB, body: { display_name: `${NAME_PREFIX}RenamedMember`, first_name: 'RenamedMember' } });
    assert.strictEqual(updateMember.status, 200, `sửa thành viên: ${updateMember.status} ${JSON.stringify(updateMember.data)}`);
    assert.ok((await scalar('SELECT display_name FROM people WHERE id = ?', [ctx.memberB.personId])).display_name.includes('RenamedMember'));

    const family = await api(server.baseUrl, 'POST', '/api/families', { token: ctx.tokenManagerB, body: { father_id: ctx.personB, mother_id: ctx.personB2 } });
    assert.ok([200, 201].includes(family.status), `tạo gia đình: ${family.status} ${JSON.stringify(family.data)}`);
    assert.strictEqual(Number((await scalar('SELECT COUNT(*) AS n FROM families WHERE father_id = ?', [ctx.personB])).n), 1);

    const archive = await api(server.baseUrl, 'POST', `/api/manager/members/${ctx.memberB.id}/archive`, { token: ctx.tokenManagerB, body: { reason: 'itest' } });
    assert.strictEqual(archive.status, 200, `lưu trữ: ${archive.status} ${JSON.stringify(archive.data)}`);

    const del = await api(server.baseUrl, 'DELETE', `/api/people/${ctx.personB2}`, { token: ctx.tokenManagerB });
    assert.ok([200, 204].includes(del.status), `xóa người: ${del.status} ${JSON.stringify(del.data)}`);
});
