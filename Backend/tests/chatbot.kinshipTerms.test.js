// Nhận diện từ xưng hô và khớp với nhãn describeKinship (không cần DB).
const test = require('node:test');
const assert = require('assert');
const { splitKinshipTerms, matchKinshipLabel, plainTermToKey } = require('../src/modules/chatbot/kinshipTermService');
const parser = require('../src/modules/chatbot/intentParserService');

const keysOf = (fragment) => splitKinshipTerms(fragment).terms.map((term) => term.keys.join('|'));
const matches = (label, key, category = 'collateral') => Boolean(matchKinshipLabel({ label, category }, key));

test('tách từ xưng hô có dấu, ưu tiên cụm dài', () => {
    assert.deepStrictEqual(keysOf('bà nội'), ['bà nội']);
    assert.deepStrictEqual(keysOf('ông chú'), ['ông chú']);
    assert.deepStrictEqual(keysOf('em của ông nội'), ['em', 'ông nội']);
    assert.deepStrictEqual(keysOf('anh chị em'), ['anh chị em']);
});

test('câu không dấu: tra theo cụm, "ba" một mình thì mơ hồ', () => {
    assert.deepStrictEqual(keysOf('ba noi'), ['bà nội'], '"ba noi" là bà nội, không phải "cha nội"');
    assert.deepStrictEqual(keysOf('co'), ['cô']);
    assert.deepStrictEqual(keysOf('ba'), ['cha|bà']);
    assert.strictEqual(plainTermToKey('em trai'), 'em trai');
    assert.strictEqual(plainTermToKey('ong noi'), 'ông nội');
    assert.strictEqual(plainTermToKey('vo chong'), null, 'từ không có trong bảng thì trả null để dùng bộ giải cũ');
});

test('khớp nguyên nhãn có dấu, không khớp chuỗi con', () => {
    assert.ok(!matches('cháu họ', 'cha'), '"cha" không được khớp "cháu"');
    assert.ok(!matches('cố nội', 'cô'));
    assert.ok(!matches('bà cô', 'cô'), '"cô" không gồm "bà cô"');
    assert.ok(!matches('ông chú', 'chú'));
    assert.ok(matches('chú họ', 'chú'), '"chú" gồm cả chú họ (trả lời tách nhóm)');
    assert.ok(matches('cụ nội', 'cụ'));
    assert.ok(!matches('bà kế (vợ sau của ông nội)', 'bà nội'));
    assert.ok(matches('em trai cùng cha khác mẹ', 'em trai', 'sibling'));
    assert.ok(!matches('con dâu', 'con'), '"con" không gồm con dâu');
    assert.ok(matches('em gái', 'anh chị em', 'sibling'));
    assert.ok(!matches('em họ', 'anh chị em', 'cousin'));
});

test('nhãn chưa rõ thứ bậc ("bác/chú") khớp nhưng được đánh dấu', () => {
    const result = matchKinshipLabel({ label: 'bác/chú', category: 'collateral' }, 'chú');
    assert.ok(result);
    assert.strictEqual(result.uncertain, true);
});

test('parser: các câu từng trả lời sai', () => {
    const cases = [
        ['Bà nội của tôi là ai?', 'find_by_kinship', { kinshipTerm: 'bà nội' }],
        ['Cô tôi là ai?', 'find_by_kinship', { kinshipTerm: 'cô' }],
        ['Ông chú của tôi là ai?', 'find_by_kinship', { kinshipTerm: 'ông chú' }],
        ['Tôi có mấy anh chị em?', 'find_by_kinship', { kinshipTerm: 'anh chị em', count: true }],
        ['Tôi đời thứ mấy?', 'find_generation', { source: 'current_member' }],
        ['Thủy tổ của dòng họ là ai?', 'list_ancestors', { source: 'clan' }],
        ['Trong gia phả có ai tên Lan không?', 'person_exists', { rawName: 'lan' }],
    ];
    for (const [message, intent, entities] of cases) {
        const result = parser.parse(message);
        assert.strictEqual(result.intent, intent, message);
        for (const [key, value] of Object.entries(entities)) assert.deepStrictEqual(result.entities[key], value, `${message}: ${key}`);
    }
    assert.strictEqual(parser.parse('Đinh Văn Hòa mất năm nào?').subtype, 'death_info');
    assert.strictEqual(parser.parse('Quê quán của Đinh Văn Lâm ở đâu?').subtype, 'hometown_info');
    assert.deepStrictEqual(parser.parse('Quê quán của Đinh Văn Lâm ở đâu?').entities, ['Đinh Văn Lâm']);
    assert.strictEqual(parser.parse('Đinh Công Thành là ai?').subtype, 'overview');
    assert.notStrictEqual(parser.parse('Em trai của bố tôi là ai?').intent, 'person_info', 'chuỗi quan hệ không phải tên người');
    assert.strictEqual(parser.parse('Chú ruột của tôi là ai?').entities.strict, true, '"chú ruột" chỉ lấy chú ruột');
    assert.strictEqual(parser.parse('Chú của tôi là ai?').entities.strict, false);
    assert.notStrictEqual(parser.parse('Nhà thờ họ ở đâu?').intent, 'person_info');
    assert.notStrictEqual(parser.parse('Giỗ cụ tổ là ngày nào?').intent, 'list_ancestors');
    assert.strictEqual(parser.parse('Bạn là ai?').intent, 'general_chat');
});

test('hai người cùng tên đầy đủ: resolvePerson phải hỏi lại, không chọn ngầm', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const { createMockDb } = require('./helpers.mockDb');
    const memberSearch = require('../src/modules/chatbot/memberSearchService');
    const people = [
        { id: 10, clan_id: 13, display_name: 'Đinh Văn Hùng', surname: 'Đinh', middle_name: 'Văn', first_name: 'Hùng', generation: 3 },
        { id: 12, clan_id: 13, display_name: 'Đinh Văn Hùng', surname: 'Đinh', middle_name: 'Văn', first_name: 'Hùng', generation: 3 },
        { id: 14, clan_id: 13, display_name: 'Đinh Văn Lâm', surname: 'Đinh', middle_name: 'Văn', first_name: 'Lâm', generation: 3 },
    ];
    createMockDb(async (sql) => (/FROM people p/.test(sql) ? [people] : [[]]));
    const duplicate = await memberSearch.resolvePerson({ clanId: 13, names: ['Đinh Văn Hùng'] });
    assert.strictEqual(duplicate.status, 'ambiguous');
    assert.deepStrictEqual(duplicate.candidates.map((row) => row.id).sort(), [10, 12]);
    const unique = await memberSearch.resolvePerson({ clanId: 13, names: ['Đinh Văn Lâm'] });
    assert.strictEqual(unique.status, 'resolved');
    assert.strictEqual(unique.person.id, 14);
});
