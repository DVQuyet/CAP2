process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { createMockDb } = require('./helpers.mockDb');
const { getSuggestions } = require('../src/modules/chatbot/chatbotSuggestionService');

const texts = (list) => list.map((item) => item.text);

test('chip gợi ý dùng tên người thật trong dòng họ, không còn chuỗi giữ chỗ', async () => {
    const mock = createMockDb(async (sql, params) => {
        if (/JOIN children c ON c\.person_id = p\.id/.test(sql)) return [[{ id: 5, display_name: 'Đinh Viết Lâm' }]];
        if (/f\.father_id = p\.id OR f\.mother_id = p\.id/.test(sql)) return [[{ id: 2, display_name: 'Đinh Viết Hòa' }]];
        if (/SELECT 1 FROM people WHERE id = \? AND clan_id = \?/.test(sql)) return [[{ 1: 1 }]];
        return [[]];
    });

    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: 5 }));
    assert.ok(list.includes('Ai là cha của Đinh Viết Lâm?'));
    assert.ok(list.includes('Con của Đinh Viết Hòa là ai?'));
    assert.ok(list.includes('Ông nội tôi là ai?'));
    assert.ok(list.every((text) => !/\[.*\]/.test(text)), 'không có chuỗi giữ chỗ');
    // Mọi truy vấn đều bị giới hạn theo dòng họ 13.
    assert.ok(mock.calls.every((call) => call.params.includes(13)));
});

test('không có dòng họ hoặc DB lỗi thì chỉ trả các câu chung', async () => {
    createMockDb(async () => { throw new Error('db down'); });

    const noClan = texts(await getSuggestions({}));
    assert.ok(noClan.includes('Gia phả có bao nhiêu người?'));
    assert.ok(noClan.every((text) => !/\[.*\]/.test(text)));

    const onError = texts(await getSuggestions({ clanId: 13, currentMemberId: 5 }));
    assert.deepStrictEqual(onError, noClan);
});

test('không gợi ý "tôi" khi tài khoản chưa gắn với người trong cây', async () => {
    createMockDb(async () => [[]]);
    const list = texts(await getSuggestions({ clanId: 13, currentMemberId: null }));
    assert.ok(!list.includes('Ông nội tôi là ai?'));
    assert.ok(list.every((text) => !/Ai là cha của|Con của/.test(text)), 'không có người thì không có chip theo tên');
});
