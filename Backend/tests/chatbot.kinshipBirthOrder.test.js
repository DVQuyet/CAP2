const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTyping, normalizeTypingDetailed } = require('../src/modules/chatbot/typingNormalizer');

test('thứ bậc sau xưng hô được giữ lại thay vì bỏ hẳn', () => {
    const cu = normalizeTypingDetailed('chú út của tôi là ai');
    assert.equal(cu.text, 'chú của tôi là ai');
    assert.deepEqual({ kin: cu.kinOrder.kin, kind: cu.kinOrder.kind }, { kin: 'chú', kind: 'youngest' });

    const ca = normalizeTypingDetailed('bác cả của tôi là ai').kinOrder;
    assert.equal(ca.kind, 'eldest');

    const thim = normalizeTypingDetailed('thím ba có mấy người con').kinOrder;
    assert.deepEqual({ kin: thim.kin, kind: thim.kind, n: thim.n, south: thim.south }, { kin: 'thím', kind: 'num', n: 2, south: false });
});

test('từ Nam Bộ (tía, má, dượng, mợ, anh/chị hai) chọn cách đếm Nam Bộ', () => {
    assert.equal(normalizeTypingDetailed('anh hai của tía tui là ai').kinOrder.south, true);
    assert.equal(normalizeTypingDetailed('dượng ba tên gì').kinOrder.south, true);
    assert.equal(normalizeTypingDetailed('mợ hai là ai trong họ mình').kinOrder.south, true);
    assert.equal(normalizeTypingDetailed('cô ba của tôi là ai').kinOrder.south, false);
});

test('tên riêng viết hoa và cụm không phải thứ bậc không bị coi là thứ bậc', () => {
    for (const text of ['chú Út là ai', 'Nguyễn Văn Út là ai', 'bác trưởng họ là ai', 'chú năm sinh năm nào', 'bác cả nhà tôi là ai']) {
        assert.equal(normalizeTypingDetailed(text).kinOrder, null, text);
    }
});

test('"ong co"/"ba co" không dấu chỉ là cụ khi theo sau là noi/ngoai/toi/minh/cua', () => {
    assert.equal(normalizeTyping('ong co noi toi la ai'), 'cu noi toi la ai');
    assert.equal(normalizeTyping('ong co toi la ai'), 'cu ong toi la ai');
    assert.equal(normalizeTyping('ba co cua toi la ai'), 'cu ba cua toi la ai');
    assert.equal(normalizeTyping('ong co dinh van binh la ai'), 'ong co dinh van binh la ai');
    assert.equal(normalizeTyping('ông cô của tôi là ai'), 'ông cô của tôi là ai');
    assert.equal(normalizeTyping('Ong Co toi la ai'), 'Ong Co toi la ai');
});

test('thứ bậc không dấu chỉ nhận khi cả câu không dấu, viết thường, đúng ngữ cảnh', () => {
    const ut = normalizeTypingDetailed('chu ut cua toi la ai');
    assert.equal(ut.text, 'chu cua toi la ai');
    assert.deepEqual({ kin: ut.kinOrder.kin, kind: ut.kinOrder.kind }, { kin: 'chú', kind: 'youngest' });
    const thim = normalizeTypingDetailed('thim ba co may nguoi con');
    assert.equal(thim.text, 'con cua thím toi la ai');
    assert.deepEqual({ kin: thim.kinOrder.kin, n: thim.kinOrder.n }, { kin: 'thím', n: 2 });
    assert.equal(normalizeTypingDetailed('con cua bac ca la ai').kinOrder.kind, 'eldest');
    assert.equal(normalizeTypingDetailed('co ba cua toi la ai').kinOrder.kin, 'cô');
    for (const text of [
        'chu nam sinh nam nao', 'chu nam nao', 'toi co hai chu', 'ai co ba chu', 'co hai nguoi con', 'Chu Ba cua toi',
        'Nguyen Van Ba la ai', 'chu ba nguoi con', 'anh hai cua toi la ai',
    ]) {
        assert.equal(normalizeTypingDetailed(text).kinOrder, null, text);
    }
});