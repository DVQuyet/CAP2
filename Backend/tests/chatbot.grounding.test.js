process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const path = require('path');

// Giả lập Groq trước khi nạp chatbotAI (chatbotAI lấy callGroq lúc nạp module).
let nextReply = null;
let lastUserContent = '';
const groqPath = require.resolve('../src/modules/chatbot/groqClient');
require.cache[groqPath] = {
    id: groqPath,
    filename: groqPath,
    loaded: true,
    exports: {
        isGroqConfigured: () => true,
        callGroq: async (_system, userContent) => { lastUserContent = userContent; return nextReply; },
    },
};
const { checkGrounding } = require('../src/modules/chatbot/answerGroundingService');
const chatbotAI = require('../src/modules/chatbot/chatbotAI');

const FACTS = 'Người: Nguyễn Văn Lâm, sinh 1940-10-25, quê Nam Định. Con: Nguyễn Văn Nam (sinh 1965-03-05). Giỗ 15/8 âm lịch.';

test('câu chỉ dùng tên, năm, ngày có trong dữ liệu thì hợp lệ', () => {
    for (const text of [
        'Ông Nguyễn Văn Lâm sinh ngày 25/10/1940 tại Nam Định.',
        'Con của ông Lâm là Nguyễn Văn Nam, sinh ngày 5/3/1965.',
        'Giỗ vào ngày 15/8 âm lịch.',
        'Chào Nam. Theo dữ liệu gia phả, ông Lâm là cha của bạn.',
    ]) {
        const result = checkGrounding(text, FACTS);
        assert.deepStrictEqual(result, { ok: true, unknownNames: [], unknownNumbers: [] }, text);
    }
});

test('tên lạ bị bắt dù họ và tên đệm trùng với người có thật', () => {
    const result = checkGrounding('Ông Nguyễn Văn Tèo là con của ông Lâm.', FACTS);
    assert.strictEqual(result.ok, false);
    assert.ok(result.unknownNames.some((name) => name.includes('Tèo')), JSON.stringify(result));
});

test('tên lạ đứng một mình giữa câu bị bắt', () => {
    const result = checkGrounding('Người cùng đời với ông Lâm là bà Hạnh.', FACTS);
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.unknownNames, ['Hạnh']);
});

test('so sánh không phân biệt dấu và hoa thường', () => {
    assert.strictEqual(checkGrounding('Ông LÂM quê ở Nam Định.', 'nguyen van lam, que nam dinh').ok, true);
    assert.strictEqual(checkGrounding('Ông Lam quê ở Nam Định.', FACTS).ok, true);
});

test('năm và ngày không có trong dữ liệu bị bắt', () => {
    assert.deepStrictEqual(checkGrounding('Ông Lâm sinh năm 1932.', FACTS).unknownNumbers, ['1932']);
    assert.deepStrictEqual(checkGrounding('Giỗ vào ngày 16/8 âm lịch.', FACTS).unknownNumbers, ['16/8']);
    assert.deepStrictEqual(checkGrounding('Ông Lâm sinh ngày 26/10/1940.', FACTS).unknownNumbers, ['26/10/1940']);
});

test('dữ liệu truyền dạng object được làm phẳng; số 0 đầu ngày không ảnh hưởng', () => {
    const facts = { person: { name: 'Trần Thị Hoa', birth_date: '1950-03-07' }, children: [{ name: 'Trần Văn Bình' }] };
    assert.strictEqual(checkGrounding('Bà Hoa sinh ngày 07/03/1950, có con là Trần Văn Bình.', facts).ok, true);
    assert.strictEqual(checkGrounding('Bà Hoa sinh ngày 7/3/1950.', facts).ok, true);
});

test('danh xưng, từ hệ thống và từ đầu câu không bị coi là tên lạ', () => {
    const result = checkGrounding('Hiện tại, Gia Phả ghi nhận Cụ Lâm. Dòng họ có một chi. Âm lịch ngày 15/8.', FACTS);
    assert.strictEqual(result.ok, true, JSON.stringify(result));
});

test('getExplanation giữ nguyên câu LLM khi mọi tên/năm đều có trong dữ liệu', async () => {
    nextReply = 'Ông Nguyễn Văn Lâm sinh năm 1940 tại Nam Định.';
    const result = await chatbotAI.getExplanationDetailed({
        intent: 'memories_stories',
        userMessage: 'Kể về ông Lâm',
        resolvedData: { type: 'person_profile', data: [{ display_name: 'Nguyễn Văn Lâm', birth_date: '1940-10-25', hometown: 'Nam Định' }] },
    });
    assert.deepStrictEqual(result, { text: nextReply, rejected: null });
    assert.ok(lastUserContent.includes('Nguyễn Văn Lâm'), 'dữ liệu phải được gửi cho LLM');
});

test('getExplanation bác câu LLM bịa tên và dùng câu dựng theo luật', async () => {
    nextReply = 'Ông Nguyễn Văn Lâm sinh năm 1940, con trai là Nguyễn Văn Tèo.';
    const result = await chatbotAI.getExplanationDetailed({
        intent: 'find_relationship',
        userMessage: 'ông Lâm là gì của tôi',
        relation: 'chú ruột',
        evidence: { summary: 'Theo dữ liệu gia phả, ông Lâm là chú ruột của bạn.' },
        resolvedData: { type: 'relation', data: [{ display_name: 'Nguyễn Văn Lâm', birth_date: '1940-10-25' }] },
    });
    assert.strictEqual(result.rejected, 'ungrounded');
    assert.strictEqual(result.text, 'Theo dữ liệu gia phả, ông Lâm là chú ruột của bạn.');
});

test('getExplanation bác câu LLM bịa năm', async () => {
    nextReply = 'Ông Nguyễn Văn Lâm sinh năm 1932.';
    const result = await chatbotAI.getExplanationDetailed({
        intent: 'memories_stories',
        userMessage: 'Kể về ông Lâm',
        resolvedData: { type: 'person_profile', data: [{ display_name: 'Nguyễn Văn Lâm', birth_date: '1940-10-25' }] },
    });
    assert.strictEqual(result.rejected, 'ungrounded');
    assert.strictEqual(result.text, '', 'không có bằng chứng thì trả rỗng để nơi gọi dùng câu trả lời riêng');
});

test('LLM không trả lời thì dùng câu dựng theo luật, không tính là bị bác', async () => {
    nextReply = null;
    const result = await chatbotAI.getExplanationDetailed({
        intent: 'find_relationship',
        relation: 'chú ruột',
        evidence: { summary: 'Ông Lâm là chú ruột của bạn.' },
    });
    assert.deepStrictEqual(result, { text: 'Ông Lâm là chú ruột của bạn.', rejected: null });
});

test('explainRelationship báo cờ rejected cho nơi gọi', async () => {
    nextReply = 'Bà Hạnh là vợ ông Lâm.';
    const result = await chatbotAI.explainRelationship({
        intent: 'memories_stories',
        userMessage: 'vợ ông Lâm',
        resolvedData: { data: [{ display_name: 'Nguyễn Văn Lâm' }] },
    });
    assert.strictEqual(result.data.rejected, 'ungrounded');
    assert.strictEqual(path.basename(groqPath), 'groqClient.js');
});
