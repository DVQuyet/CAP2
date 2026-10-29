process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.GROQ_API_KEY = ''; // test đơn vị không bao giờ gọi Groq thật

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { buildBiographyFacts, formatDateByPrecision } = require('../src/modules/ai/biographyFacts');
const { buildTemplateBiography } = require('../src/modules/ai/biographyTemplate');
const { generateBiographyDraft } = require('../src/modules/ai/biographyService');
const aiController = require('../src/modules/ai/ai.controller');
const schemas = require('../src/shared/validation/schemas');

const PERSON_ROW = {
    id: 5, clan_id: 2, display_name: 'Nguyễn Văn Lâm', gender: 1, generation: 3, branch: '2', hometown: 'Nam Định',
    bio: 'Làm ruộng.', is_living: 0, birth_iso: '1940-10-25', birth_date_precision: 'exact',
    death_iso: '2010-03-02', death_date_precision: 'exact', death_anniversary_lunar: '15/8', clan_name: 'Nguyễn',
    // Các trường nhạy cảm mà dữ kiện tuyệt đối không được mang theo, kể cả khi DB trả về:
    phone: '0912345678', email: 'lam@example.com', address: '12 Phố Cổ', zalo: 'zalo-lam', facebook: 'fb.com/lam', note: 'ghi chú nội bộ',
};

function mockFamilyDb({ unionVisibility = 'public' } = {}) {
    return createMockDb(async (sql) => {
        if (/FROM people p\s+LEFT JOIN clans/.test(sql)) return [[PERSON_ROW]];
        if (/FROM children ch JOIN families f ON f\.id = ch\.family_id\s+WHERE ch\.person_id/.test(sql)) return [[{ father_id: 10, mother_id: 11, visibility: 'public' }]];
        if (/FROM families f\s+WHERE f\.clan_id/.test(sql)) return [[{ id: 7, father_id: 5, mother_id: 12, visibility: unionVisibility }]];
        if (/FROM children ch JOIN people p/.test(sql)) return [[{ person_id: 20, birth_iso: '1965-03-05' }, { person_id: 21, birth_iso: null }]];
        if (/SELECT id, display_name FROM people WHERE id IN/.test(sql)) {
            const names = { 10: 'Nguyễn Văn Bình', 11: 'Trần Thị Mai', 12: 'Lê Thị Hoa', 20: 'Nguyễn Văn Nam', 21: 'Nguyễn Thị Lan' };
            return [Object.entries(names).map(([id, display_name]) => ({ id: Number(id), display_name }))];
        }
        if (/FROM family_memories/.test(sql)) return [[{ title: 'Mùa gặt năm ấy', content: 'Ông kể chuyện đồng áng.' }]];
        if (/FROM calendar_events/.test(sql)) return [[{ title: 'Giỗ ông Lâm', date_text: '02/03/2026' }]];
        return [[]];
    });
}

test('dữ kiện không mang số điện thoại, email, địa chỉ, zalo, facebook, ghi chú nội bộ', async () => {
    mockFamilyDb();
    const facts = await buildBiographyFacts(5, { role_id: 2 });
    const text = JSON.stringify(facts);
    for (const secret of ['0912345678', 'lam@example.com', '12 Phố Cổ', 'zalo-lam', 'fb.com/lam', 'ghi chú nội bộ']) {
        assert.ok(!text.includes(secret), `lộ ${secret}`);
    }
    assert.strictEqual(facts.person.name, 'Nguyễn Văn Lâm');
    assert.strictEqual(facts.person.birth, '25/10/1940');
    assert.strictEqual(facts.person.death_anniversary_lunar, '15/8');
    assert.strictEqual(facts.person.is_living, false);
    assert.deepStrictEqual(facts.parents.map((item) => item.name), ['Nguyễn Văn Bình', 'Trần Thị Mai']);
    assert.deepStrictEqual(facts.children.map((item) => item.name), ['Nguyễn Văn Nam', 'Nguyễn Thị Lan']);
    assert.strictEqual(facts.memories.length, 1);
});

test('member không thấy vợ/chồng và con thuộc quan hệ chỉ quản lý xem; manager và admin thì thấy', async () => {
    mockFamilyDb({ unionVisibility: 'managers' });
    const asMember = await buildBiographyFacts(5, { role_id: 3 });
    assert.deepStrictEqual(asMember.spouses, []);
    assert.deepStrictEqual(asMember.children, []);

    for (const roleId of [1, 2]) {
        const asManager = await buildBiographyFacts(5, { role_id: roleId });
        assert.deepStrictEqual(asManager.spouses, [{ name: 'Lê Thị Hoa' }]);
        assert.strictEqual(asManager.children.length, 2);
    }
});

test('formatDateByPrecision không in ngày tháng khi hồ sơ chỉ biết năm', () => {
    assert.strictEqual(formatDateByPrecision('1940-01-01', 'year'), '1940');
    assert.strictEqual(formatDateByPrecision('1940-10-01', 'month'), '10/1940');
    assert.strictEqual(formatDateByPrecision('1940-10-25', 'exact'), '25/10/1940');
    assert.strictEqual(formatDateByPrecision('1940-10-25', 'unknown'), null);
    assert.strictEqual(formatDateByPrecision(null, 'exact'), null);
});

const FULL_FACTS = {
    person: { name: 'Nguyễn Văn Lâm', gender: 'male', generation: 3, branch: '2', clan: 'Nguyễn', is_living: false, birth: '25/10/1940', death: '02/03/2010', death_anniversary_lunar: '15/8', hometown: 'Nam Định', existing_bio: null },
    parents: [{ relation: 'father', name: 'Nguyễn Văn Bình' }, { relation: 'mother', name: 'Trần Thị Mai' }],
    spouses: [{ name: 'Lê Thị Hoa' }],
    children: [{ name: 'Nguyễn Văn Nam', birth_year: '1965' }, { name: 'Nguyễn Thị Lan', birth_year: null }],
    memories: [{ title: 'Mùa gặt năm ấy', snippet: 'x' }],
    events: [],
};
const BARE_FACTS = { person: { name: 'Trần Thị Hoa', gender: 'female', generation: null, branch: null, clan: null, is_living: true, birth: null, death: null, death_anniversary_lunar: null, hometown: null, existing_bio: null }, parents: [], spouses: [], children: [], memories: [], events: [] };

test('bản mẫu đủ ý với dữ kiện đầy đủ (tiểu sử và tưởng niệm, vi và en)', () => {
    const bio = buildTemplateBiography(FULL_FACTS, { purpose: 'biography', length: 'medium' });
    for (const part of ['Ông Nguyễn Văn Lâm', '25/10/1940', 'Nam Định', 'Nguyễn Văn Bình', 'Trần Thị Mai', 'Lê Thị Hoa', 'Nguyễn Văn Nam', '02/03/2010', '15/8 âm lịch']) {
        assert.ok(bio.includes(part), `thiếu "${part}" trong: ${bio}`);
    }
    const memorial = buildTemplateBiography(FULL_FACTS, { purpose: 'memorial', tone: 'warm' });
    assert.match(memorial, /tưởng nhớ/);
    const en = buildTemplateBiography(FULL_FACTS, { language: 'en', length: 'medium' });
    assert.match(en, /was born on 25\/10\/1940/);
    assert.match(en, /had 2 children/);
});

test('bản mẫu với dữ kiện thiếu không in undefined/null và vẫn ra câu hoàn chỉnh', () => {
    for (const language of ['vi', 'en']) {
        for (const purpose of ['biography', 'memorial']) {
            const text = buildTemplateBiography(BARE_FACTS, { language, purpose });
            assert.ok(text.length > 10, text);
            assert.ok(!/undefined|null|NaN|\[object/.test(text), text);
        }
    }
    assert.match(buildTemplateBiography(BARE_FACTS, {}), /^Bà Trần Thị Hoa là thành viên của dòng họ\.$/);
});

const goodModel = (draft) => async () => JSON.stringify({ draft, facts_used: ['Ngày sinh 25/10/1940'] });

test('AI trả bản nháp bám dữ kiện thì dùng bản AI', async () => {
    const result = await generateBiographyDraft(FULL_FACTS, { purpose: 'biography' }, { callModel: goodModel('Ông Nguyễn Văn Lâm sinh ngày 25/10/1940 tại Nam Định, là con của Nguyễn Văn Bình.') });
    assert.strictEqual(result.source, 'ai');
    assert.deepStrictEqual(result.facts_used, ['Ngày sinh 25/10/1940']);
});

test('AI bịa tên lần đầu rồi sửa ở lần gọi lại: dùng bản AI và báo đã thử lại', async () => {
    const replies = [
        JSON.stringify({ draft: 'Ông Nguyễn Văn Lâm sinh năm 1940, con trai là Nguyễn Văn Tèo.', facts_used: [] }),
        JSON.stringify({ draft: 'Ông Nguyễn Văn Lâm sinh năm 1940, con trai là Nguyễn Văn Nam.', facts_used: [] }),
    ];
    const prompts = [];
    const result = await generateBiographyDraft(FULL_FACTS, {}, { callModel: async (_system, user) => { prompts.push(user); return replies.shift(); } });
    assert.strictEqual(result.source, 'ai');
    assert.deepStrictEqual(result.warnings, ['ai_retried']);
    assert.match(prompts[1], /Tèo/, 'lần gọi lại phải nêu chi tiết bị bác');
});

test('AI bịa tên hai lần thì dùng bản mẫu', async () => {
    let calls = 0;
    const result = await generateBiographyDraft(FULL_FACTS, {}, { callModel: async () => { calls += 1; return JSON.stringify({ draft: 'Ông Lâm sinh năm 1932, con là Nguyễn Văn Tèo.' }); } });
    assert.strictEqual(calls, 2);
    assert.strictEqual(result.source, 'template');
    assert.deepStrictEqual(result.warnings, ['ai_ungrounded']);
    assert.ok(result.draft.includes('Nguyễn Văn Lâm'));
});

test('Groq lỗi/không có key/trả rác thì dùng bản mẫu, không ném lỗi', async () => {
    for (const reply of [null, '', 'không phải json', JSON.stringify({ draft: '' }), JSON.stringify({ khac: 1 })]) {
        const result = await generateBiographyDraft(FULL_FACTS, {}, { callModel: async () => reply });
        assert.strictEqual(result.source, 'template', String(reply));
        assert.deepStrictEqual(result.warnings, ['ai_unavailable']);
    }
});

test('bản nháp chứa email hoặc số điện thoại bị bác', async () => {
    for (const leak of ['Liên hệ lam@example.com', 'Gọi 0912345678']) {
        const result = await generateBiographyDraft(FULL_FACTS, {}, { callModel: async () => JSON.stringify({ draft: `Ông Nguyễn Văn Lâm sinh năm 1940. ${leak}` }) });
        assert.strictEqual(result.source, 'template', leak);
    }
});

test('controller: lời tưởng niệm cho người còn sống trả 400 và không gọi AI', async () => {
    createMockDb(async (sql) => {
        if (/SELECT id, clan_id, gender FROM people/.test(sql)) return [[{ id: 5, clan_id: 2, gender: 1 }]];
        if (/FROM people p\s+LEFT JOIN clans/.test(sql)) return [[{ ...PERSON_ROW, is_living: 1, death_iso: null }]];
        return [[]];
    });
    const res = mockRes();
    await aiController.generateBiographyDraft({ params: { id: '5' }, body: { purpose: 'memorial' }, user: { id: 1, role_id: 1, role_name: 'admin' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
});

test('controller: admin soạn tiểu sử, không có AI thì ra bản mẫu và không ghi vào bảng people', async () => {
    const mock = createMockDb(async (sql) => {
        if (/SELECT id, clan_id, gender FROM people/.test(sql)) return [[{ id: 5, clan_id: 2, gender: 1 }]];
        if (/FROM people p\s+LEFT JOIN clans/.test(sql)) return [[PERSON_ROW]];
        if (/INSERT INTO ai_audit_logs/.test(sql)) return [{ insertId: 1 }];
        return [[]];
    });
    const res = mockRes();
    await aiController.generateBiographyDraft({ params: { id: '5' }, body: { purpose: 'biography', language: 'vi' }, user: { id: 1, role_id: 1, role_name: 'admin' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.source, 'template');
    assert.match(res.body.draft, /Nguyễn Văn Lâm/);
    assert.strictEqual(mock.find(/^(UPDATE|DELETE|INSERT INTO) (people)\b/i).length, 0, 'không được ghi vào people');
});

test('controller: người không có quyền (member khác, không có khóa sửa cây) nhận 404', async () => {
    createMockDb(async (sql) => {
        if (/SELECT id, clan_id, gender FROM people/.test(sql)) return [[{ id: 5, clan_id: 2, gender: 1 }]];
        if (/SELECT person_id FROM accounts/.test(sql)) return [[{ person_id: 99 }]];
        return [[]];
    });
    const res = mockRes();
    await aiController.generateBiographyDraft({ params: { id: '5' }, body: {}, headers: {}, query: {}, user: { id: 8, role_id: 3, role_name: 'member' } }, res);
    assert.strictEqual(res.statusCode, 404);
});

test('schema biographyDraft: giá trị sai bị 400, mặc định để trống vẫn qua', () => {
    const run = (req) => { const res = mockRes(); let next = false; schemas.biographyDraft(req, res, () => { next = true; }); return { res, next }; };
    assert.strictEqual(run({ params: { id: '5' }, body: {} }).next, true);
    assert.strictEqual(run({ params: { id: '5' }, body: { purpose: 'memorial', tone: 'warm', length: 'medium', language: 'en' } }).next, true);
    for (const bad of [{ purpose: 'hack' }, { tone: 'angry' }, { length: 'huge' }, { language: 'fr' }]) {
        const r = run({ params: { id: '5' }, body: bad });
        assert.strictEqual(r.next, false, JSON.stringify(bad));
        assert.strictEqual(r.res.statusCode, 400);
    }
    assert.strictEqual(run({ params: { id: 'abc' }, body: {} }).res.statusCode, 400);
});
