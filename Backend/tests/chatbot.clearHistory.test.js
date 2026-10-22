process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const controller = require('../src/modules/chatbot/chatbotController');
const {
    buildConversationSessionId,
    getConversationMemory,
    updateConversationMemory,
} = require('../src/modules/chatbot/conversationMemoryService');

const COLUMNS = ['id', 'conversation_id', 'clan_id', 'account_id', 'current_member_id', 'role', 'message', 'intent', 'confidence', 'metadata', 'created_at', 'hidden_at'];

// Mock DB: bảng chatbot_messages có đủ cột (kể cả hidden_at), người dùng thuộc dòng họ 13.
const mockHistoryDb = (historyRows = []) => createMockDb(async (sql) => {
    if (/INFORMATION_SCHEMA\.TABLES/.test(sql)) return [[{ 1: 1 }]];
    if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [COLUMNS.map((name) => ({ COLUMN_NAME: name }))];
    if (/FROM account_clans/.test(sql)) return [[{ 1: 1 }]];
    if (/^UPDATE chatbot_messages SET hidden_at/.test(sql)) return [{ affectedRows: 3 }];
    if (/FROM chatbot_messages m/.test(sql)) return [historyRows];
    return [[]];
});

const user = (id) => ({ id, role_name: 'member', person_id: 5 });

test('DELETE history: chỉ ẩn tin của tài khoản đang đăng nhập trong dòng họ đó', async () => {
    const mock = mockHistoryDb();
    const res = mockRes();
    await controller.clearHistory({ query: { clanId: '13' }, user: user(9) }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { success: true, cleared: 3 });
    const updates = mock.find(/^UPDATE chatbot_messages SET hidden_at/);
    assert.strictEqual(updates.length, 1);
    assert.match(updates[0].sql, /WHERE account_id = \? AND clan_id = \? AND hidden_at IS NULL/);
    // Tài khoản lấy từ token, không phải từ query; không có lệnh DELETE nào.
    assert.deepStrictEqual(updates[0].params, [9, 13]);
    assert.strictEqual(mock.find(/^DELETE/).length, 0);
});

test('DELETE history: thiếu đăng nhập hoặc clanId bị từ chối, không ghi gì', async () => {
    const mock = mockHistoryDb();
    const noUser = mockRes();
    await controller.clearHistory({ query: { clanId: '13' }, user: {} }, noUser);
    assert.strictEqual(noUser.statusCode, 401);
    const noClan = mockRes();
    await controller.clearHistory({ query: {}, user: user(9) }, noClan);
    assert.strictEqual(noClan.statusCode, 400);
    assert.strictEqual(mock.find(/^UPDATE/).length, 0);
});

test('DELETE history: người ngoài dòng họ bị 403', async () => {
    const mock = createMockDb(async (sql) => {
        if (/INFORMATION_SCHEMA/.test(sql)) return [[]];
        return [[]];
    });
    const res = mockRes();
    await controller.clearHistory({ query: { clanId: '13', currentMemberId: '77' }, user: user(9) }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(mock.find(/^UPDATE/).length, 0);
});

test('DELETE history: reset trí nhớ hội thoại của tài khoản đó, không đụng tài khoản khác', async () => {
    mockHistoryDb();
    const mine = buildConversationSessionId({ sessionId: 'abc', userId: 9, clanId: 13 });
    const otherClan = buildConversationSessionId({ sessionId: 'abc', userId: 9, clanId: 14 });
    const other = buildConversationSessionId({ sessionId: 'abc', userId: 19, clanId: 13 });
    for (const key of [mine, otherClan, other]) updateConversationMemory(key, { lastQuestion: 'x' });

    const res = mockRes();
    await controller.clearHistory({ query: { clanId: '13' }, user: user(9) }, res);
    assert.strictEqual(getConversationMemory(mine), null);
    assert.ok(getConversationMemory(otherClan));
    assert.ok(getConversationMemory(other));
});

test('GET history: lọc tin ẩn, chỉ lấy tin của tài khoản và gắn feedbackRating cho câu trả lời', async () => {
    const mock = createMockDb(async (sql) => {
        if (/INFORMATION_SCHEMA\.TABLES/.test(sql)) return [[{ 1: 1 }]];
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [COLUMNS.map((name) => ({ COLUMN_NAME: name }))];
        if (/FROM account_clans/.test(sql)) return [[{ 1: 1 }]];
        if (/FROM chatbot_messages m/.test(sql)) {
            return [[
                { id: 3, role: 'assistant', message: 'c', metadata: null, feedback_rating: -1 },
                { id: 2, role: 'user', message: 'b', metadata: null, feedback_rating: 1 },
                { id: 1, role: 'assistant', message: 'a', metadata: '{}', feedback_rating: null },
            ]];
        }
        return [[]];
    });
    const res = mockRes();
    await controller.history({ query: { clanId: '13', currentMemberId: '5' }, user: user(9) }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.messages.map((m) => [m.id, m.feedbackRating]), [[1, null], [2, null], [3, -1]]);
    assert.ok(!('feedback_rating' in res.body.messages[0]));

    const select = mock.find(/FROM chatbot_messages m/)[0];
    assert.match(select.sql, /LEFT JOIN chatbot_feedback f ON f\.message_id = m\.id AND f\.account_id = \?/);
    assert.match(select.sql, /m\.account_id = \?/);
    assert.match(select.sql, /m\.hidden_at IS NULL/);
    // account_id cho JOIN feedback đứng đầu, rồi clan, account, member, limit, offset.
    assert.deepStrictEqual(select.params, [9, 13, 9, 5, 50, 0]);
});
