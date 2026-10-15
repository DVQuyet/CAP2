// Các loại câu hỏi mới của giai đoạn 2 (chỉ phần hiểu câu, không cần DB).
const test = require('node:test');
const assert = require('assert');
const parser = require('../src/modules/chatbot/intentParserService');

const parse = (message) => parser.parse(message);

test('vợ chồng: đếm, vợ cả/vợ lẽ', () => {
    assert.deepStrictEqual(parse('Đinh Văn Hòa có mấy vợ?').entities, { spouseType: 'wife', targetName: ['Đinh Văn Hòa'], count: true });
    assert.strictEqual(parse('Vợ lẽ của Đinh Văn Hòa là ai?').entities.rank, 'secondary');
    assert.strictEqual(parse('Vợ cả của Đinh Văn Hòa là ai?').entities.rank, 'first');
    assert.strictEqual(parse('Tôi có mấy vợ?').intent, 'find_by_kinship', '"tôi" để tra xưng hô');
});

test('con: nuôi, trưởng, thứ N, đếm; con ruột hay con nuôi', () => {
    assert.strictEqual(parse('Ai là con nuôi của Đinh Văn Bình?').entities.childFilter, 'adopted');
    assert.strictEqual(parse('Ai là con trưởng của Đinh Văn Hòa?').entities.order, 'first');
    assert.strictEqual(parse('Con thứ hai của Đinh Văn Hòa là ai?').entities.order, 2);
    assert.strictEqual(parse('Con út của Đinh Văn Hòa là ai?').entities.order, 'last');
    assert.strictEqual(parse('Đinh Văn Hòa có mấy người con?').entities.count, true);
    assert.strictEqual(parse('Đinh Văn Phúc là con ruột hay con nuôi?').intent, 'child_status');
    assert.strictEqual(parse('Đinh Văn Phúc có phải con nuôi không?').intent, 'child_status');
});

test('ngày giỗ của một người khác với danh sách giỗ sắp tới', () => {
    assert.deepStrictEqual(parse('Giỗ cụ tổ là ngày nào?').entities, { source: 'clan' });
    assert.strictEqual(parse('Giỗ tổ năm nay vào ngày nào?').entities.preferEvent, 'giỗ tổ');
    assert.deepStrictEqual(parse('Ngày giỗ của Đinh Văn Hòa là ngày nào?').entities, { source: 'named_person', targetName: ['Đinh Văn Hòa'] });
    assert.deepStrictEqual(parse('Giỗ ông nội tôi là ngày nào?').entities, { source: 'kinship', kinshipTerm: 'ông nội' });
    assert.strictEqual(parse('Ngày giỗ sắp tới là khi nào').intent, 'events_upcoming');
});

test('sự kiện theo tên, nhà thờ họ, trưởng họ, đời đông nhất', () => {
    assert.deepStrictEqual(parse('Họp họ năm nay tổ chức khi nào?').entities, { keyword: 'Họp họ' });
    assert.notStrictEqual(parse('Lê Thị Cúc sinh năm nào?').intent, 'event_lookup', 'họ "Lê" không phải "lễ"');
    assert.deepStrictEqual(parse('Nhà thờ họ ở đâu?').entities, { field: 'hall' });
    assert.deepStrictEqual(parse('Ai là trưởng họ?').entities, { field: 'head' });
    assert.strictEqual(parse('Đời nào đông người nhất?').entities.metric, 'largest_generation');
});

test('"A với B là gì của nhau", có hoặc không có "tôi"', () => {
    const self = parse('Tôi với Đinh Văn Nam là gì của nhau?');
    assert.strictEqual(self.intent, 'compare_relationship');
    assert.strictEqual(self.entities.personASelf, true);
    assert.deepStrictEqual(self.entities.personBName, ['Đinh Văn Nam']);
    const named = parse('Đinh Văn Lâm và Phạm Minh Tuấn có quan hệ gì?');
    assert.deepStrictEqual(named.entities.personAName, ['Đinh Văn Lâm']);
    assert.deepStrictEqual(named.entities.personBName, ['Phạm Minh Tuấn']);
});

test('số điện thoại là trường riêng tư', () => {
    const result = parse('Số điện thoại của Đinh Văn Bình là gì?');
    assert.strictEqual(result.intent, 'person_info');
    assert.strictEqual(result.subtype, 'contact_info');
    assert.deepStrictEqual(result.entities, ['Đinh Văn Bình']);
});
