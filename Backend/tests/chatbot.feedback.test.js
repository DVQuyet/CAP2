process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const controller = require('../src/modules/chatbot/chatbotController');
const { validateFeedbackBody } = require('../src/modules/chatbot/chatbotFeedbackService');
const { collectPersonIds, withTreeFields, fallbackFlag } = require('../src/modules/chatbot/chatbotResponseMeta');
const { normalizeTyping } = require('../src/modules/chatbot/typingNormalizer');
const { normalizeQuestion, groupUnknownQuestions } = require('../scripts/chatbot-unknown-report');

// ---- Đánh giá 👍/👎 ----
const messages = [
    { id: 11, account_id: 9, clan_id: 13, role: 'assistant' },
    { id: 12, account_id: 9, clan_id: 13, role: 'user' },
    { id: 13, account_id: 77, clan_id: 13, role: 'assistant' },
];

const mockMessages = () => createMockDb(async (sql, params) => {
    if (/^SELECT \* FROM chatbot_messages WHERE id = \?/.test(sql)) return [messages.filter((row) => row.id === Number(params[0]))];
    if (/^INSERT INTO chatbot_feedback/.test(sql)) return [{ affectedRows: 1 }];
    return [[]];
});

const callFeedback = async ({ id, body, userId = 9 }) => {
    const res = mockRes();
    await controller.feedback({ params: { id }, body, user: userId ? { id: userId, role_name: 'member' } : {} }, res);
    return res;
};

test('validate: rating chỉ nhận 1 hoặc -1, comment là chuỗi tối đa 500 ký tự', () => {
    assert.strictEqual(validateFeedbackBody({ rating: 1 }).ok, true);
    assert.strictEqual(validateFeedbackBody({ rating: -1, comment: '  sai rồi  ' }).comment, 'sai rồi');
    for (const rating of [0, 2, '1.5', 'abc', null, undefined]) {
        assert.strictEqual(validateFeedbackBody({ rating }).ok, false, `rating ${rating}`);
    }
    assert.strictEqual(validateFeedbackBody({ rating: 1, comment: 5 }).ok, false);
    assert.strictEqual(validateFeedbackBody({ rating: 1, comment: 'x'.repeat(501) }).ok, false);
});

test('chủ tài khoản đánh giá được câu trả lời của mình và ghi vào chatbot_feedback', async () => {
    const mock = mockMessages();
    const res = await callFeedback({ id: '11', body: { rating: -1, comment: 'Sai người' } });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, { success: true, messageId: 11, rating: -1, comment: 'Sai người' });
    const insert = mock.find(/^INSERT INTO chatbot_feedback/)[0];
    assert.deepStrictEqual(insert.params, [11, 9, 13, -1, 'Sai người']);
});

test('không được đánh giá tin nhắn của tài khoản khác (403) và không ghi gì', async () => {
    const mock = mockMessages();
    const res = await callFeedback({ id: '13', body: { rating: 1 } });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(mock.find(/^INSERT INTO chatbot_feedback/).length, 0);
});

test('chỉ đánh giá được tin nhắn trả lời của trợ lý, id/rating sai bị từ chối', async () => {
    const mock = mockMessages();
    assert.strictEqual((await callFeedback({ id: '12', body: { rating: 1 } })).statusCode, 400);
    assert.strictEqual((await callFeedback({ id: '999', body: { rating: 1 } })).statusCode, 404);
    assert.strictEqual((await callFeedback({ id: 'abc', body: { rating: 1 } })).statusCode, 400);
    assert.strictEqual((await callFeedback({ id: '11', body: { rating: 5 } })).statusCode, 400);
    assert.strictEqual((await callFeedback({ id: '11', body: {}, userId: null })).statusCode, 400);
    assert.strictEqual((await callFeedback({ id: '11', body: { rating: 1 }, userId: null })).statusCode, 401);
    assert.strictEqual(mock.find(/^INSERT INTO chatbot_feedback/).length, 0);
});

// ---- personIds / relationshipPath ----
test('personIds: người trong câu trả lời đứng đầu, không trùng, bỏ qua câu trả lời lỗi', () => {
    const ids = collectPersonIds({
        success: true,
        people: [{ id: 5 }],
        sourcePerson: { id: 101 },
        targetPerson: { id: 5 },
        pathNodes: [101, 10, 3, 5],
    }, { currentMemberId: 101 });
    assert.deepStrictEqual(ids, [5, 101, 10, 3]);
    assert.deepStrictEqual(collectPersonIds({ success: false, people: [{ id: 5 }] }), []);
    assert.deepStrictEqual(collectPersonIds({ success: true, answer: 'chào' }), []);
});

test('withTreeFields: câu hỏi quan hệ luôn có relationshipPath (mảng), intent khác thì không thêm', () => {
    const relation = withTreeFields({ success: true, intent: 'find_relationship', people: [{ id: 4 }] });
    assert.deepStrictEqual(relation.relationshipPath, []);
    assert.deepStrictEqual(relation.personIds, [4]);
    const kept = withTreeFields({ success: true, intent: 'relationship_expression', relationshipPath: ['father'] });
    assert.deepStrictEqual(kept.relationshipPath, ['father']);
    const stats = withTreeFields({ success: true, intent: 'stats_count' });
    assert.strictEqual('relationshipPath' in stats, false);
    assert.deepStrictEqual(stats.personIds, []);
});

// ---- Cờ fallback + báo cáo câu chưa hiểu ----
test('fallbackFlag: llm_planner hoặc unknown mới có cờ', () => {
    assert.strictEqual(fallbackFlag({ intent: 'person_info', plannerSource: 'llm_planner' }), 'llm_planner');
    assert.strictEqual(fallbackFlag({ intent: 'unknown', plannerSource: 'rule_parser' }), 'unknown');
    assert.strictEqual(fallbackFlag({ intent: 'person_info', plannerSource: 'rule_parser' }), null);
});

test('normalizeQuestion gom câu chỉ khác dấu, hoa thường, dấu câu, lời xã giao', () => {
    const a = normalizeQuestion('Cho mình hỏi: Thủy tổ họ Đinh ở đâu ạ?');
    const b = normalizeQuestion('thuy to ho dinh o dau');
    assert.strictEqual(a, b);
});

test('groupUnknownQuestions đếm, sắp giảm dần, bỏ câu bot đã hiểu', () => {
    const row = (intent, question, fallback, day) => ({
        intent,
        created_at: `2026-10-${day}T10:00:00Z`,
        metadata: JSON.stringify({ ...(fallback ? { fallback } : {}), turn: { rawQuestion: question } }),
    });
    const groups = groupUnknownQuestions([
        row('unknown', 'Ai giàu nhất họ?', 'unknown', '20'),
        row('unknown', 'ai giau nhat ho', 'unknown', '21'),
        row('person_info', 'Lan sinh năm nào ạ?', 'llm_planner', '19'),
        row('person_info', 'Bố tôi là ai?', null, '19'),
        { intent: 'unknown', metadata: null },
    ], { top: 5 });
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].question, 'ai giau nhat ho');
    assert.strictEqual(groups[0].count, 2);
    assert.deepStrictEqual(groups[1].fallbacks, ['llm_planner']);
    assert.strictEqual(groupUnknownQuestions([row('unknown', 'a b', 'unknown', '1'), row('unknown', 'c d', 'unknown', '2'), row('unknown', 'c d', 'unknown', '3')], { top: 1 }).length, 1);
});

// ---- Chuẩn hóa cách gõ ----
test('normalizeTyping: viết tắt, lời xã giao, không cắt tên có chữ A cuối', () => {
    assert.strictEqual(normalizeTyping('ck cua dinh thi mai la ai'), 'chong cua dinh thi mai la ai');
    assert.strictEqual(normalizeTyping('toi co bn anh chi em'), 'toi co bao nhieu anh chi em');
    assert.strictEqual(normalizeTyping('a/c/e cua toi gom nhung ai'), 'anh chi em cua toi gom nhung ai');
    assert.strictEqual(normalizeTyping('Cho mình hỏi bố tôi là ai ạ?'), 'bố tôi là ai?');
    assert.strictEqual(normalizeTyping('Con của Nguyễn Văn A'), 'Con của Nguyễn Văn A');
    assert.strictEqual(normalizeTyping('bo toi la ai a'), 'bo toi la ai');
    assert.strictEqual(normalizeTyping('Hỏi'), 'Hỏi');
});
