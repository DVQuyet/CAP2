process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Q-2: trợ lý chỉ hỏi với tư cách người của chính tài khoản, kể cả manager và admin.
const test = require('node:test');
const assert = require('assert');
const { mockRes } = require('./helpers.mockDb');
const { CLAN, OTHER_CLAN, mockAccount } = require('./helpers.viewerPersonDb');
const { resolveViewerPersonId } = require('../src/modules/chatbot/viewerPerson');
const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');
const suggestionService = require('../src/modules/chatbot/chatbotSuggestionService');
const chatbot = require('../src/modules/chatbot/chatbotController');

const OTHER_PERSON = 77; // hồ sơ có thật cùng họ, là self của tài khoản khác (8)
// Hồ sơ có thật cùng họ nhưng thuộc tài khoản khác với người gửi (manager là tài khoản 8 nên dùng 18 của tài khoản 9).
const otherPersonFor = (role) => (role === 'manager' ? 18 : OTHER_PERSON);

const userOf = (role, personId) => ({
    id: { member: 9, manager: 8, admin: 1 }[role],
    role_name: role,
    role_id: { admin: 1, manager: 2, member: 3 }[role],
    person_id: personId,
});

test('chỉ dùng hồ sơ chính trong đúng dòng họ cho cả id yêu cầu và dự phòng', async () => {
    mockAccount();
    assert.strictEqual(await resolveViewerPersonId(9, 21, CLAN, '21'), 21);
    assert.strictEqual(await resolveViewerPersonId(9, 21, CLAN, OTHER_PERSON), 21);
    assert.strictEqual(await resolveViewerPersonId(9, 31, CLAN, 31), 18);
    assert.strictEqual(await resolveViewerPersonId(9, 31, CLAN, null), 18);
});

test('chỉ nhận account_people self của đúng tài khoản, đúng dòng họ', async () => {
    mockAccount();
    assert.strictEqual(await resolveViewerPersonId(9, 21, CLAN, 18), 18);
    assert.strictEqual(await resolveViewerPersonId(8, null, CLAN, 18), 77);
    assert.strictEqual(await resolveViewerPersonId(9, null, OTHER_CLAN, 18), 31);
    for (const requestedId of [77, 31, 32, 40, 41, 42, null]) {
        assert.strictEqual(await resolveViewerPersonId(9, null, CLAN, requestedId), 18);
    }
});

test('thiếu account_people vẫn có thể dùng hồ sơ chính hoặc thành viên đang hoạt động', async () => {
    mockAccount({ missingTable: true });
    assert.strictEqual(await resolveViewerPersonId(9, 21, CLAN, OTHER_PERSON), 21);
    assert.strictEqual(await resolveViewerPersonId(9, null, CLAN, OTHER_PERSON), 22);
    assert.strictEqual(await resolveViewerPersonId(8, null, CLAN, 22), null);
    assert.strictEqual(await resolveViewerPersonId(9, null, OTHER_CLAN, 22), null);
    assert.strictEqual(await resolveViewerPersonId(8, null, OTHER_CLAN, 22), 25);
});

test('/relationship/:id dùng liên kết thành viên khi tài khoản chỉ có account_clans trong dòng họ', async (t) => {
    mockAccount();
    const findRelationship = t.mock.method(relationshipEngine, 'findRelationship', async () => ({ found: false }));
    const res = mockRes();
    await chatbot.getRelationshipById({
        user: userOf('manager', null),
        params: { id: '31' },
        query: { clanId: String(OTHER_CLAN), currentMemberId: '31' },
    }, res);
    assert.deepStrictEqual(findRelationship.mock.calls.map(({ arguments: args }) => args), [[25, 31, { clanId: OTHER_CLAN }]]);
    assert.strictEqual(res.statusCode, 404);
});

for (const role of ['member', 'manager', 'admin']) {
    test(`${role} gửi id người khác: /relationship/:id vẫn tính từ chính mình`, async (t) => {
        mockAccount();
        const sources = [];
        t.mock.method(relationshipEngine, 'findRelationship', async (sourceId) => {
            sources.push(sourceId);
            return { found: false };
        });
        const res = mockRes();
        await chatbot.getRelationshipById({
            user: userOf(role, 21),
            params: { id: '40' },
            query: { clanId: String(CLAN), currentMemberId: String(otherPersonFor(role)) },
        }, res);
        assert.deepStrictEqual(sources, [21]);
        assert.strictEqual(res.statusCode, 404);
    });

    test(`${role} gửi id người khác: gợi ý câu hỏi vẫn theo chính mình`, async (t) => {
        mockAccount();
        const seen = [];
        t.mock.method(suggestionService, 'getSuggestions', async (args) => {
            seen.push(args.currentMemberId);
            return [];
        });
        const res = mockRes();
        await chatbot.suggestions({
            user: userOf(role, 21),
            query: { clanId: String(CLAN), currentMemberId: String(otherPersonFor(role)) },
        }, res);
        assert.deepStrictEqual(seen, [21]);
        assert.strictEqual(res.body.success, true);
    });
}
