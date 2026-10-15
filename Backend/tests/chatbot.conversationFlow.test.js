// Hội thoại nối tiếp: đại từ, câu lược, chọn người khi hỏi lại (không cần DB).
const test = require('node:test');
const assert = require('assert');
const flow = require('../src/modules/chatbot/conversationFlowService');

const people = new Map([
    [14, { id: 14, display_name: 'Đinh Văn Lâm', gender: 1 }],
    [20, { id: 20, display_name: 'Ngô Thị Hoa', gender: 2 }],
]);
const lookup = (id) => people.get(Number(id)) || null;
const memory = {
    lastSubject: { id: 14, name: 'Đinh Văn Lâm' },
    lastAnswerPeople: [{ id: 20, name: 'Ngô Thị Hoa' }],
    lastQuestion: 'Đinh Văn Lâm sinh năm nào?',
    lastFocusText: 'Đinh Văn Lâm',
};

test('đại từ được thay bằng người vừa hỏi tới, đúng giới tính', () => {
    assert.strictEqual(flow.rewritePronoun('Vợ của ông ấy là ai?', memory, lookup).message, 'Vợ của Đinh Văn Lâm là ai?');
    // "bà ấy" không thể là ông Lâm: lấy người nữ trong câu trả lời trước.
    assert.strictEqual(flow.rewritePronoun('Bà ấy sinh năm nào?', memory, lookup).message, 'Ngô Thị Hoa sinh năm nào?');
    assert.strictEqual(flow.rewritePronoun('ong ay sinh nam nao', memory, lookup).message, 'Đinh Văn Lâm sinh nam nao');
    assert.strictEqual(flow.rewritePronoun('Ông nội tôi là ai?', memory, lookup), null, '"ông nội" không phải đại từ');
    assert.strictEqual(flow.rewritePronoun('Vợ của ông ấy là ai?', {}, lookup), null, 'chưa có ai để nhắc lại');
});

test('câu lược "Thế còn X?" dựa trên câu trước', () => {
    assert.deepStrictEqual(flow.rewriteEllipsis('Thế còn Đinh Văn Bình?', memory), { message: 'Đinh Văn Bình sinh năm nào?', kind: 'substitute' });
    assert.deepStrictEqual(flow.rewriteEllipsis('Còn con của ông ấy?', memory), { message: 'con của ông ấy là ai?', kind: 'relation' });
    assert.strictEqual(flow.rewriteEllipsis('Còn sống không?', memory), null, 'câu hỏi đầy đủ, không phải câu lược');
    assert.strictEqual(flow.rewriteEllipsis('Con của Đinh Văn Hòa là ai?', memory), null);
});

test('chọn người khi đang hỏi lại', () => {
    const candidates = [
        { id: 10, name: 'Đinh Văn Hùng', description: 'Đinh Văn Hùng (đời 3, sinh 1960, con của Đinh Văn Hòa và Trần Thị Lan)' },
        { id: 12, name: 'Đinh Văn Hùng', description: 'Đinh Văn Hùng (đời 3, sinh 1965, con của Đinh Văn Hòa và Lê Thị Cúc)' },
    ];
    assert.strictEqual(flow.selectCandidate('1', candidates), 10);
    assert.strictEqual(flow.selectCandidate('người thứ hai', candidates), 12);
    assert.strictEqual(flow.selectCandidate('người sinh 1965', candidates), 12);
    assert.strictEqual(flow.selectCandidate('con bà Lê Thị Cúc', candidates), 12);
    assert.strictEqual(flow.selectCandidate('Gia phả có bao nhiêu người?', candidates), null, 'câu hỏi khác không bị coi là lựa chọn');
});

test('tìm chữ chỉ người được hỏi trong câu', () => {
    assert.strictEqual(flow.findFocusText('Đinh Văn Lâm sinh năm nào?', ['Đinh Văn Lâm']), 'Đinh Văn Lâm');
    assert.strictEqual(flow.findFocusText('Bà nội của tôi là ai?', [null, 'bà nội']), 'Bà nội');
});
