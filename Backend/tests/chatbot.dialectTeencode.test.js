process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('assert');
const { normalizeTyping } = require('../src/modules/chatbot/typingNormalizer');
const { parse } = require('../src/modules/chatbot/intentParserService');

// Phương ngữ & teencode: từ chuẩn hóa mới không được làm hỏng tên người.
test('normalizeTyping: không đổi tên người trùng từ phương ngữ/teencode (Má, Út, Lào, Lăm, Tía, Lội, J, Mk)', () => {
    for (const text of [
        'Đinh Thị Má sinh năm nào?',
        'Nguyễn Văn Út sinh năm nào?',
        'nguyen van ut sinh nam nao',
        'văn út là ai',
        'chú Út có vợ chưa?',
        'Tìm Nguyễn Văn Lào',
        'Lê Văn Lăm sinh năm nào?',
        'Đinh Văn Tía là ai?',
        'Bà Lội sinh năm nào?',
        'Văn J là ai?',
        'Hoàng Thị Mk sinh năm nào?',
        'Trần Thị Ng là ai?',
        'Phạm Văn Vs là ai?',
        'Đinh Văn Hùng và Đinh Văn Hòa ai lớn tuổi hơn',
        'anh năm 2000 là ai',
        'chú ba người là ai',
    ]) {
        assert.strictEqual(normalizeTyping(text), text, text);
    }
});

test('normalizeTyping: xưng hô Nam/Trung Bộ và thứ bậc', () => {
    assert.strictEqual(normalizeTyping('tía tui tên là gì vậy bot'), 'bố tôi tên là gì');
    assert.strictEqual(normalizeTyping('má của đinh văn lâm là ai'), 'mẹ của đinh văn lâm là ai');
    assert.strictEqual(normalizeTyping('Má tôi là ai'), 'mẹ tôi là ai');
    assert.strictEqual(normalizeTyping('ông cố nội của tôi là ai'), 'cụ ông nội của tôi là ai');
    assert.strictEqual(normalizeTyping('bà cố tui thọ bao nhiêu tuổi'), 'cụ bà tôi thọ bao nhiêu tuổi');
    assert.strictEqual(normalizeTyping('dượng út tên gì'), 'dượng của tôi tên gì');
    assert.strictEqual(normalizeTyping('mợ hai là ai trong họ mình'), 'mợ của tôi là ai');
    assert.strictEqual(normalizeTyping('thím ba có mấy người con'), 'con của thím tôi là ai');
    assert.strictEqual(normalizeTyping('chú út có vợ chưa'), 'vợ của chú tôi là ai');
    assert.strictEqual(normalizeTyping('anh hai của tía tui là ai'), 'anh của bố tôi là ai');
});

test('normalizeTyping: teencode (j, mik, ng, sn, qh, vs, k cuối câu có/không)', () => {
    assert.strictEqual(normalizeTyping('dinh van hoa la j cua minh'), 'dinh van hoa la gi cua minh');
    assert.strictEqual(normalizeTyping('cho hỏi họ mik có bn ng z'), 'họ mình có bao nhiêu người');
    assert.strictEqual(normalizeTyping('bác bình sn bao nhiu v'), 'bác bình sinh năm bao nhiêu');
    assert.strictEqual(normalizeTyping('ai qh gan nhat vs toi'), 'ai quan he gan nhat voi toi');
    assert.strictEqual(normalizeTyping('dong ho co ai lam quan to k'), 'dong ho co ai lam quan to khong');
    // "k" không phải cuối câu có/không hoặc đứng sau họ lót: giữ nguyên.
    assert.strictEqual(normalizeTyping('Tìm Đinh Văn K'), 'Tìm Đinh Văn K');
    assert.strictEqual(normalizeTyping('tìm văn k'), 'tìm văn k');
});

test('normalizeTyping: l/n, ch/tr, d/gi chỉ sửa trong từ khóa quen thuộc', () => {
    assert.strictEqual(normalizeTyping('bố tôi sinh lăm nào'), 'bố tôi sinh năm nào');
    assert.strictEqual(normalizeTyping('bác đinh văn bình mất dỗ ngày lào'), 'bác đinh văn bình giỗ ngày nào');
    assert.strictEqual(normalizeTyping('Đinh Văn Bình mất dỗ ngày lào'), 'Đinh Văn Bình giỗ ngày nào');
    assert.strictEqual(normalizeTyping('ông lội tôi tên là gì'), 'ông nội tôi tên là gì');
    assert.strictEqual(normalizeTyping('ai chưởng họ vậy bạn'), 'ai trưởng họ');
});

test('normalizeTyping: câu kể chuyện dài chỉ giữ vế hỏi cuối, trừ khi vế hỏi còn chỉ người đã kể', () => {
    assert.strictEqual(
        normalizeTyping('nhà tôi ở bên nhánh bác hai mà lâu ngày không về quê không biết cụ hòa là vai vế gì với tôi'),
        'cụ hòa là gì của tôi'
    );
    assert.strictEqual(
        normalizeTyping('tôi muốn tìm hiểu xem nhánh của ông bình sinh năm 1940 có bao nhiêu người cả trai lẫn gái'),
        'nhánh của ông bình sinh năm 1940 có bao nhiêu người cả trai lẫn gái'
    );
    const kept = 'bố tôi bảo nhà mình có cụ làm quan ngày xưa thế cụ đó tên là gì';
    assert.strictEqual(normalizeTyping(kept), kept);
    // Tên riêng viết hoa trước từ nối thì không cắt.
    const named = 'Ai là cha của Đinh Văn Thế Anh và mẹ của Đinh Văn Xem Hoa là những ai vậy';
    assert.ok(normalizeTyping(named).startsWith('Ai là cha của Đinh Văn Thế Anh'));
});

test('parse: các mẫu câu hỏi mới (X lấy ai, ai là anh ai là em, người thân gần nhất, đếm con cháu, cách gọi vợ/chồng)', () => {
    assert.strictEqual(parse('dinh thi mai lay ai').intent, 'find_spouse');
    assert.strictEqual(parse('dinh van binh voi dinh van hoa ai la anh ai la em').intent, 'compare_relationship');
    assert.strictEqual(parse('ai quan he gan nhat voi toi').intent, 'nearest_relatives');
    assert.strictEqual(parse('nhánh của ông bình sinh năm 1940 có bao nhiêu người cả trai lẫn gái').intent, 'descendant_count');
    assert.strictEqual(parse('vợ của anh trai bố tôi gọi là gì').intent, 'kinship_call_term');
    assert.strictEqual(parse('bác đinh văn bình giỗ ngày nào').intent, 'person_anniversary');
    assert.strictEqual(parse('bố tôi sinh năm nào').intent, 'person_info');
    assert.strictEqual(parse('bác bình sinh năm bao nhiêu').intent, 'person_info');
    assert.strictEqual(parse('dâu trưởng của họ mình là ai').entities.field, 'eldest_daughter_in_law');
});
