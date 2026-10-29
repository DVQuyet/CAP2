// AI soạn tiểu sử: quyền, không ghi vào people, bám dữ kiện. Có một lần gọi Groq thật (nếu có GROQ_API_KEY trong .env).
const test = require('node:test');
const assert = require('assert');
const { startServer } = require('./helpers/server');
const { db, createTempClan, createTempPerson, createTempAccount, api, login, cleanupAll } = require('./helpers/fixtures');
const { buildBiographyFacts } = require('../src/modules/ai/biographyFacts');
const { checkGrounding } = require('../src/modules/chatbot/answerGroundingService');

let server;
const ctx = {};
const draftUrl = (personId) => `/api/ai/person/${personId}/biography-draft`;

test.before(async () => {
    server = await startServer({ env: { AUTH_ACCOUNT_CACHE_TTL_MS: '0' } });
    ctx.clanA = await createTempClan('A');
    ctx.clanB = await createTempClan('B');
    ctx.managerA = await createTempAccount({ role: 'manager', clanId: ctx.clanA });
    ctx.memberA = await createTempAccount({ role: 'member', clanId: ctx.clanA });
    ctx.managerB = await createTempAccount({ role: 'manager', clanId: ctx.clanB });
    ctx.tokenManagerA = await login(server.baseUrl, ctx.managerA.email, ctx.managerA.password);
    ctx.tokenMemberA = await login(server.baseUrl, ctx.memberA.email, ctx.memberA.password);
    ctx.tokenManagerB = await login(server.baseUrl, ctx.managerB.email, ctx.managerB.password);

    // Một gia đình nhỏ có tên tự nhiên: ông Lâm (đã mất), vợ, cha mẹ, hai con.
    const make = (exactName, extra = {}) => createTempPerson({ clanId: ctx.clanA, exactName, ...extra });
    ctx.father = await make('Nguyễn Văn Bình', { generation: 2 });
    ctx.mother = await make('Trần Thị Mai', { gender: 2, generation: 2 });
    ctx.lam = await make('Nguyễn Văn Lâm', { generation: 3, birthDate: '1940-10-25', deathDate: '2010-03-02', isLiving: 0, hometown: 'Nam Định' });
    ctx.wife = await make('Lê Thị Hoa', { gender: 2, generation: 3 });
    ctx.son = await make('Nguyễn Văn Nam', { generation: 4, birthDate: '1965-03-05' });
    ctx.daughter = await make('Nguyễn Thị Lan', { gender: 2, generation: 4, birthDate: '1968-07-14' });
    await db.query('UPDATE people SET bio = ? WHERE id = ?', ['Bản gốc không được đổi.', ctx.lam]);

    const [parentsFamily] = await db.query('INSERT INTO families (clan_id, father_id, mother_id) VALUES (?, ?, ?)', [ctx.clanA, ctx.father, ctx.mother]);
    await db.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 1)', [parentsFamily.insertId, ctx.lam]);
    const [ownFamily] = await db.query('INSERT INTO families (clan_id, father_id, mother_id) VALUES (?, ?, ?)', [ctx.clanA, ctx.lam, ctx.wife]);
    await db.query('INSERT INTO children (family_id, person_id, sort_order) VALUES (?, ?, 1), (?, ?, 2)', [ownFamily.insertId, ctx.son, ownFamily.insertId, ctx.daughter]);
});
test.after(async () => {
    if (server) await server.stop();
    await cleanupAll();
    await db.end();
});

const bioOf = async (personId) => (await db.query('SELECT bio FROM people WHERE id = ?', [personId]))[0][0].bio;

test('manager soạn tiểu sử (gọi Groq thật nếu có key): bám dữ kiện và không ghi vào people', async () => {
    const result = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { token: ctx.tokenManagerA, body: { purpose: 'biography', tone: 'formal', length: 'medium', language: 'vi' } });
    assert.strictEqual(result.status, 200, JSON.stringify(result.data));
    assert.ok(['ai', 'template'].includes(result.data.source), result.data.source);
    console.log(`  (nguồn bản nháp: ${result.data.source}${result.data.warnings.length ? `, cảnh báo: ${result.data.warnings.join(',')}` : ''})`);
    console.log(`  (bản nháp: ${result.data.draft})`);

    assert.ok(result.data.draft.includes('Nguyễn Văn Lâm') || result.data.draft.includes('Lâm'), result.data.draft);
    const facts = await buildBiographyFacts(ctx.lam, { role_id: 2 });
    const grounding = checkGrounding(result.data.draft, facts);
    assert.strictEqual(grounding.ok, true, `bản nháp có chi tiết ngoài dữ kiện: ${JSON.stringify(grounding)}`);
    assert.strictEqual(await bioOf(ctx.lam), 'Bản gốc không được đổi.', 'AI không được tự ghi tiểu sử');
});

test('lời tưởng niệm cho người đã mất; cho người còn sống thì 400', async () => {
    const memorial = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { token: ctx.tokenManagerA, body: { purpose: 'memorial', tone: 'warm', length: 'short' } });
    assert.strictEqual(memorial.status, 200, JSON.stringify(memorial.data));
    assert.ok(memorial.data.draft.length > 20);

    const living = await api(server.baseUrl, 'POST', draftUrl(ctx.son), { token: ctx.tokenManagerA, body: { purpose: 'memorial' } });
    assert.strictEqual(living.status, 400);
});

test('tiếng Anh: có bản nháp bằng tiếng Anh', async () => {
    const result = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { token: ctx.tokenManagerA, body: { language: 'en', length: 'short' } });
    assert.strictEqual(result.status, 200, JSON.stringify(result.data));
    assert.ok(result.data.draft.length > 20);
});

test('phân quyền: manager dòng họ khác 404; member không có quyền sửa 404; member soạn cho chính mình được', async () => {
    const otherClan = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { token: ctx.tokenManagerB, body: {} });
    assert.strictEqual(otherClan.status, 404, 'manager dòng họ khác không được biết người này tồn tại');

    const memberOthers = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { token: ctx.tokenMemberA, body: {} });
    assert.strictEqual(memberOthers.status, 404);

    const memberSelf = await api(server.baseUrl, 'POST', draftUrl(ctx.memberA.personId), { token: ctx.tokenMemberA, body: {} });
    assert.strictEqual(memberSelf.status, 200, JSON.stringify(memberSelf.data));
});

test('đầu vào sai bị 400; không đăng nhập bị 401; người không tồn tại 404', async () => {
    const badOption = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { token: ctx.tokenManagerA, body: { purpose: 'hack' } });
    assert.strictEqual(badOption.status, 400);
    const anonymous = await api(server.baseUrl, 'POST', draftUrl(ctx.lam), { body: {} });
    assert.strictEqual(anonymous.status, 401);
    const missing = await api(server.baseUrl, 'POST', draftUrl(999999999), { token: ctx.tokenManagerA, body: {} });
    assert.strictEqual(missing.status, 404);
});

test('dữ kiện thật từ DB: có cha mẹ, vợ, hai con, không lộ liên lạc', async () => {
    await db.query("UPDATE people SET phone = '0912345678', email = 'lam@example.test', address = '12 Phố Cổ' WHERE id = ?", [ctx.lam]);
    const facts = await buildBiographyFacts(ctx.lam, { role_id: 2 });
    assert.deepStrictEqual(facts.parents.map((item) => item.name).sort(), ['Nguyễn Văn Bình', 'Trần Thị Mai']);
    assert.deepStrictEqual(facts.spouses, [{ name: 'Lê Thị Hoa' }]);
    assert.deepStrictEqual(facts.children.map((item) => item.name), ['Nguyễn Văn Nam', 'Nguyễn Thị Lan']);
    assert.strictEqual(facts.person.birth, '25/10/1940');
    const text = JSON.stringify(facts);
    for (const secret of ['0912345678', 'lam@example.test', '12 Phố Cổ']) assert.ok(!text.includes(secret));
});
