// Che liên hệ trong văn bản tự do và giới hạn tin cũ theo tài khoản, dòng họ, hồ sơ đang hỏi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { redactContactText, HIDDEN } = require('../src/modules/chatbot/contactText');
const { chatbotHistoryScope } = require('../src/modules/chatbot/chatbotHistoryScope');

test('che email, SĐT theo mẫu chung và địa chỉ ngắn theo giá trị trong họ, giữ liên hệ của chính mình', () => {
    const rules = { pattern: /(?<![\p{L}\p{N}])(?:Q\.1)(?![\p{L}\p{N}])/gu, keep: new Set(['0905123456']) };
    const text = 'Ở Q.1, gọi 0905 123 457, +84 905 123 458 hoặc 0905123456; mail a.b@x.vn. Sinh 1945-1990, ngày 12.03.1945.';
    assert.equal(redactContactText(text, rules),
        `Ở ${HIDDEN}, gọi ${HIDDEN}, ${HIDDEN} hoặc 0905123456; mail ${HIDDEN}. Sinh 1945-1990, ngày 12.03.1945.`);
    assert.equal(redactContactText(null), null);
});

test('tin cũ chỉ lấy đúng tài khoản, dòng họ, hồ sơ; không có tài khoản thì không khớp tin nào', () => {
    const columns = new Set(['conversation_id', 'clan_id', 'account_id', 'current_member_id', 'hidden_at']);
    assert.deepEqual(chatbotHistoryScope(columns, { conversationId: 4, clanId: 13, accountId: 9, currentMemberId: 5 }), {
        where: 'conversation_id = ? AND clan_id = ? AND account_id = ? AND current_member_id = ? AND hidden_at IS NULL',
        params: [4, 13, 9, 5],
    });
    assert.deepEqual(chatbotHistoryScope(columns, { conversationId: 4, clanId: 13 }).params, [4, 13, null]);
    assert.match(chatbotHistoryScope(columns, { conversationId: 4, clanId: 13 }).where, /current_member_id IS NULL/);
});
