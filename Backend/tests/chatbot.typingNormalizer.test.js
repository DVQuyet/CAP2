process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb, mockRes } = require('./helpers.mockDb');
const { normalizeTyping } = require('../src/modules/chatbot/typingNormalizer');
const { normalizeQuestion } = require('../scripts/chatbot-unknown-report');
const { collectPersonIds } = require('../src/modules/chatbot/chatbotResponseMeta');
const { parse } = require('../src/modules/chatbot/intentParserService');
const controller = require('../src/modules/chatbot/chatbotController');

// Finding 1: \b không khớp trước chữ có dấu (đâu) -> từ đệm "a/ah" sau "đâu" phải bị bỏ.
test('normalizeTyping: bỏ "a/ah" sau từ hỏi có dấu (đâu, gì, nào)', () => {
    assert.strictEqual(normalizeTyping('Nhà thờ họ ở đâu a?'), 'Nhà thờ họ ở đâu?');
    assert.strictEqual(normalizeTyping('Mộ tổ ở đâu ah?'), 'Mộ tổ ở đâu?');
    assert.strictEqual(normalizeTyping('Ông Bình sinh năm nào a'), 'Ông Bình sinh năm nào');
    assert.strictEqual(normalizeTyping('mo to o dau a'), 'mo to o dau');
});

// Finding 2: không làm hỏng tên người.
test('normalizeTyping: không đổi tên người (Tui, Ko, Hỏi) và từ "nôi"', () => {
    for (const text of [
        'Bà Nguyễn Thị Tui sinh năm bao nhiêu?',
        'Cụ Đinh Tui mất năm nào?',
        'Bác Tui là con ai?',
        'Đinh Ko là con ai?',
        'Tìm cụ Y Ko Niê',
        'Hỏi là con ai?',
        'Hỏi sinh năm mấy?',
        'Đinh Văn Hỏi sinh năm nào?',
        'Cái nôi của dòng họ Đinh ở đâu?',
    ]) {
        assert.strictEqual(normalizeTyping(text), text, text);
    }
});

test('normalizeTyping: vẫn sửa viết tắt đúng chỗ (tui/ko viết thường, ông nôi)', () => {
    assert.strictEqual(normalizeTyping('bác tui là con ai'), 'bác tôi là con ai');
    assert.strictEqual(normalizeTyping('ko biết bác Bình sinh năm nào'), 'không biết bác Bình sinh năm nào');
    assert.strictEqual(normalizeTyping('ông nôi tôi tên gì'), 'ông nội tôi tên gì');
    assert.strictEqual(normalizeTyping('Cho hỏi bố tôi là ai'), 'bố tôi là ai');
    assert.strictEqual(normalizeTyping('hỏi chút bố tôi là ai'), 'bố tôi là ai');
    assert.strictEqual(normalizeTyping('xin hỏi bố tôi là ai'), 'bố tôi là ai');
});

// Finding 3: không cắt tên ở cuối câu.
test('normalizeTyping: không cắt tên người ở cuối câu (Với, Nha, Voi, Vay, A)', () => {
    for (const text of [
        'Ai là vợ của ông Trần Văn Với?',
        'Ai là cha của Nguyễn Văn Vay?',
        'Tìm thông tin Lê Văn Voi',
        'Tìm cụ Đinh Thị Nha',
        'Tìm Nguyễn Văn A',
        'tim nguyen van a',
        'Tìm Đinh Văn Di',
    ]) {
        assert.strictEqual(normalizeTyping(text), text, text);
    }
    assert.strictEqual(normalizeTyping('bố tôi là ai nhé ạ?'), 'bố tôi là ai?');
});

test('normalizeQuestion (báo cáo): không cắt tên có chữ cuối trùng từ đệm, vẫn bỏ từ đệm thật', () => {
    assert.strictEqual(normalizeQuestion('Tìm Nguyễn Văn A'), 'tim nguyen van a');
    assert.strictEqual(normalizeQuestion('Tìm cụ Đinh Thị Nha'), 'tim cu dinh thi nha');
    assert.strictEqual(normalizeQuestion('Phạm Văn Di'), 'pham van di');
    assert.strictEqual(normalizeQuestion('Lê Văn Thế'), 'le van the');
    assert.strictEqual(normalizeQuestion('Nguyễn Văn Vay'), 'nguyen van vay');
    assert.strictEqual(normalizeQuestion('bố tôi là ai nhé'), 'bo toi la ai');
    assert.strictEqual(normalizeQuestion('Thủy tổ họ Đinh ở đâu ạ?'), 'thuy to ho dinh o dau');
});

// Finding 9
test('normalizeTyping: câu ngắn "Ai ạ?", "Bác ạ?" vẫn bỏ từ đệm', () => {
    assert.strictEqual(normalizeTyping('Ai ạ?'), 'Ai?');
    assert.strictEqual(normalizeTyping('Bác ạ?'), 'Bác?');
    assert.strictEqual(normalizeTyping('Ai vậy?'), 'Ai?');
    assert.strictEqual(normalizeTyping('Hỏi'), 'Hỏi');
    assert.strictEqual(normalizeTyping('Nam ạ'), 'Nam ạ');
});

// Finding 5
test('collectPersonIds: người hỏi không bị thêm lại; chỉ còn người hỏi thì vẫn giữ', () => {
    assert.deepStrictEqual(collectPersonIds({ success: true, people: [{ id: 5 }], sourcePerson: { id: 101 } }, { currentMemberId: 101 }), [5]);
    assert.deepStrictEqual(collectPersonIds({ success: true, sourcePerson: { id: 101 } }, { currentMemberId: 101 }), [101]);
    assert.deepStrictEqual(collectPersonIds({ success: true, people: [{ id: 5 }], sourcePerson: { id: 7 } }, { currentMemberId: 101 }), [5, 7]);
});

// Finding 8
test('parse: "X là gì của tớ" nhận "tớ" và "tui"', () => {
    for (const who of ['tớ', 'tui', 'tôi']) {
        const parsed = parse(`Đinh Văn Nam là gì của ${who}?`);
        assert.ok(parsed, who);
        assert.strictEqual(parsed.intent, 'find_relationship');
    }
});

// Finding 4
test('câu hỏi quan hệ trùng tên: phản hồi làm rõ có relationshipPath', async () => {
    createMockDb(async () => [[]]);
    const res = mockRes();
    assert.ok(controller.__test?.ambiguityResponse, 'cần export __test.ambiguityResponse');
    await controller.__test.ambiguityResponse(res, 'find_relationship', [
        { id: 1, name: 'Nam', score: 1 }, { id: 2, name: 'Nam', score: 1 },
    ], 'Nam');
    assert.ok(Array.isArray(res.body.relationshipPath));
    assert.ok(Array.isArray(res.body.personIds));
});

// Finding 7
const feedbackDb = ({ withAccountColumn = true, allowed = true } = {}) => createMockDb(async (sql) => {
    if (/^SELECT \* FROM chatbot_messages WHERE id = \?/.test(sql)) {
        return [[withAccountColumn
            ? { id: 11, account_id: 9, clan_id: 13, role: 'assistant', conversation_id: 4 }
            : { id: 11, clan_id: 13, role: 'assistant', conversation_id: 4 }]];
    }
    if (/FROM conversations WHERE id = \?/.test(sql)) return [[{ account_id: 9 }]];
    if (/FROM account_clans/.test(sql)) return [allowed ? [{ 1: 1 }] : []];
    if (/FROM people WHERE id = \?/.test(sql)) return [[]];
    return [[]];
});
const callFeedback = async (userId = 9) => {
    const res = mockRes();
    await controller.feedback({ params: { id: '11' }, body: { rating: 1 }, query: {}, user: { id: userId, role_name: 'member', person_id: 55 } }, res);
    return res;
};

test('feedback: thành viên đã rời dòng họ bị từ chối (403), không ghi', async () => {
    const mock = feedbackDb({ allowed: false });
    const res = await callFeedback();
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(mock.find(/^INSERT INTO chatbot_feedback/).length, 0);
});

test('feedback: bảng không có account_id thì dùng chủ hội thoại, không 403 oan', async () => {
    const mock = feedbackDb({ withAccountColumn: false });
    assert.strictEqual((await callFeedback(9)).statusCode, 200);
    assert.strictEqual(mock.find(/^INSERT INTO chatbot_feedback/).length, 1);
    feedbackDb({ withAccountColumn: false });
    assert.strictEqual((await callFeedback(77)).statusCode, 403);
});
