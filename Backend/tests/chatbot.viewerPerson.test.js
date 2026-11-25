process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Q-2: trợ lý chỉ hỏi với tư cách người của chính tài khoản, kể cả manager và admin.
const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { resolveViewerPersonId } = require('../src/modules/chatbot/viewerPerson');
const relationshipEngine = require('../src/modules/chatbot/relationshipEngine');
const suggestionService = require('../src/modules/chatbot/chatbotSuggestionService');
const chatbot = require('../src/modules/chatbot/chatbotController');

const CLAN = 13;
const OTHER_PERSON = 77; // người khác trong cùng dòng họ

// linked: các person_id tài khoản đã gắn trong account_people của dòng họ CLAN.
const mockAccount = ({ linked = [], missingTable = false } = {}) => createMockDb(async (sql, params) => {
    if (/FROM account_people/.test(sql)) {
        if (missingTable) {
            const error = new Error('no table');
            error.code = 'ER_NO_SUCH_TABLE';
            throw error;
        }
        return [params[1] === CLAN ? linked.map((id) => ({ person_id: id })) : []];
    }
    if (/FROM account_clans/.test(sql)) return [[{ 1: 1 }]];
    return [[]];
});

const userOf = (role, personId) => ({
    id: { member: 9, manager: 8, admin: 1 }[role],
    role_name: role,
    role_id: { admin: 1, manager: 2, member: 3 }[role],
    person_id: personId,
});

test('nhận currentMemberId khi đúng hồ sơ của tài khoản', async () => {
    mockAccount();
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', 21) }, CLAN, 21), 21);
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', 21) }, CLAN, '21'), 21);
});

test('nhận người tài khoản đã chọn làm góc nhìn (account_people) trong cùng dòng họ', async () => {
    mockAccount({ linked: [18] });
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', null) }, CLAN, 18), 18);
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', 21) }, CLAN, 18), 18);
});

test('id người khác bị bỏ qua, dùng người của chính tài khoản', async () => {
    mockAccount({ linked: [18] });
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', 21) }, CLAN, OTHER_PERSON), 21);
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', null) }, CLAN, OTHER_PERSON), 18);
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', null) }, CLAN, null), 18);
});

test('góc nhìn ở dòng họ khác không được dùng cho dòng họ này', async () => {
    mockAccount({ linked: [18] });
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', null) }, 99, 18), null);
});

test('chưa có bảng account_people thì chỉ nhận hồ sơ chính của tài khoản', async () => {
    mockAccount({ missingTable: true });
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', 21) }, CLAN, OTHER_PERSON), 21);
    assert.strictEqual(await resolveViewerPersonId({ user: userOf('member', null) }, CLAN, OTHER_PERSON), null);
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
            query: { clanId: String(CLAN), currentMemberId: String(OTHER_PERSON) },
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
            query: { clanId: String(CLAN), currentMemberId: String(OTHER_PERSON) },
        }, res);
        assert.deepStrictEqual(seen, [21]);
        assert.strictEqual(res.body.success, true);
    });
}
