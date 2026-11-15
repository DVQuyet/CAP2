const test = require('node:test');
const assert = require('node:assert/strict');

const legacy = require('../src/modules/chatbot/relationshipQueryParser');
const accent = require('../src/modules/chatbot/text/relationshipParser');
const { resolveRelationshipExpression } = require('../src/modules/chatbot/relationshipExpressionResolver');
const { plainTermToKey } = require('../src/modules/chatbot/kinshipTermService');
const { runWithQuestion, restoreAccents } = require('../src/modules/chatbot/text/nameMatch');

// Câu mà hai parser phải cho cùng chuỗi cạnh (parser cũ là mốc).
const SHARED = [
    ['ông ngoại của tôi', ['mother', 'father']],
    ['ông ngoại của vợ tôi', ['spouse', 'mother', 'father']],
    ['con của chị gái mẹ tôi', ['mother', 'older_sister', 'child']],
    ['cha của cha của tôi', ['father', 'father']],
    ['ba của tôi', ['father']],
    ['Em trai của bố tôi là ai?', ['father', 'younger_brother']],
    ['Ai là vợ của anh trai tôi?', ['older_brother', 'spouse']],
    ['ong noi cua toi la ai', ['father', 'father']],
    ['con trai cua chu toi', ['father', 'younger_brother', 'son']],
    ['anh họ của tôi tên gì', ['parent', 'older_sibling', 'son']],
];

for (const [name, parser] of [['parser cũ', legacy], ['parser có dấu', accent]]) {
    test(`${name}: chuỗi quan hệ tính từ người hỏi`, () => {
        for (const [sentence, chain] of SHARED) {
            const ast = parser.parseRelationshipExpression(sentence);
            assert.equal(ast.needsClarification, false, sentence);
            assert.equal(ast.base, 'me');
            assert.deepEqual(ast.chain, chain, sentence);
            assert.ok(ast.terms.slice().reverse().every((term) => plainTermToKey(term)), `${sentence}: mọi từ đổi được ra key`);
        }
        const unsupported = parser.parseRelationshipExpression('người bạn thân của tôi là ai');
        assert.equal(unsupported.needsClarification, true);
        assert.deepEqual(unsupported.chain, []);
    });

    test(`${name}: "<quan hệ> của <tên người>"`, () => {
        const father = parser.parseNamedRelationshipExpression('Cha của Đinh Viết Lâm?');
        assert.equal(father.personName, 'Đinh Viết Lâm');
        assert.deepEqual(father.chain, ['father']);
        assert.deepEqual(parser.parseNamedRelationshipExpression('Ai là mẹ của vợ của Nguyễn Văn An?').chain, ['spouse', 'mother']);
        assert.equal(parser.parseNamedRelationshipExpression('Con trai của ông Lâm').personName, 'Lâm');
        assert.equal(parser.parseNamedRelationshipExpression('bo cua Đinh Viết Lâm la ai').personName, 'Đinh Viết Lâm');
        assert.equal(parser.parseNamedRelationshipExpression('Cha của tôi là ai?'), null);
        assert.equal(parser.parseNamedRelationshipExpression('Con của bác Hai là ai?'), null);
        assert.equal(parser.parseNamedRelationshipExpression('Lịch sử của dòng họ'), null);
    });
}

test('parser có dấu: bà khác ba, cố khác cô (parser cũ lẫn cả hai cặp)', () => {
    const terms = (sentence) => accent.parseRelationshipExpression(sentence).terms;
    assert.deepEqual(terms('Mẹ của bà tôi là ai?'), ['mẹ', 'bà']);
    assert.deepEqual(terms('Mẹ của ba tôi là ai?'), ['mẹ', 'cha']);
    assert.deepEqual(terms('Con của cố tôi'), ['con', 'cụ']);
    assert.deepEqual(terms('Con của cô tôi'), ['con', 'cô']);
    assert.deepEqual(terms(('Con của cố tôi').normalize('NFD')), ['con', 'cụ'], 'dấu rời');
    assert.deepEqual(accent.parseRelationshipExpression('Mẹ của bà tôi').chain, ['parent', 'mother', 'mother']);
    assert.equal(accent.parseRelationshipExpression('Mẹ của bà tôi').readings, undefined, 'câu có dấu chỉ có một cách đọc');

    // Mốc hiện trạng: parser cũ đổi "bà" thành "cha", "cố" thành "cô".
    assert.deepEqual(legacy.parseRelationshipExpression('Mẹ của bà tôi là ai?').chain, ['father', 'mother']);
    assert.deepEqual(legacy.parseRelationshipExpression('Con của cố tôi').chain, ['father', 'sister', 'child']);

    assert.deepEqual(accent.parseNamedRelationshipExpression('Bà của Trần Văn Khôi là ai?').terms, ['bà']);
    assert.deepEqual(accent.parseNamedRelationshipExpression('Ba của Trần Văn Khôi là ai?').terms, ['cha']);
    assert.deepEqual(accent.parseNamedRelationshipExpression('Cố của Trần Văn Khôi là ai?').terms, ['cụ']);
});

test('parser có dấu: câu không dấu trả mọi cách đọc, không tự chọn', () => {
    const ast = accent.parseRelationshipExpression('me cua ba toi la ai');
    assert.deepEqual(ast.readings.map((reading) => reading.label), ['mẹ của cha', 'mẹ của bà']);
    assert.deepEqual(ast.terms, ['mẹ', 'cha'], 'trường chính là cách đọc đầu');

    const named = accent.parseNamedRelationshipExpression('co cua tran van khoi la ai');
    assert.equal(named.personName, 'tran van khoi');
    assert.deepEqual(named.readings.map((reading) => reading.label), ['cụ', 'cô']);
    assert.deepEqual(accent.parseNamedRelationshipExpression('ba cua Trần Văn Khôi').readings.length, 2, 'dấu chỉ ở tên riêng vẫn là câu không dấu');

    assert.equal(accent.parseRelationshipExpression('ong noi cua toi').readings, undefined, 'một cách đọc thì không có readings');
    assert.equal(accent.parseRelationshipExpression('chi cua toi').needsClarification, true, '"chi" không dấu không được hiểu là "chị"');
});

test('parser có dấu: từ mới của bảng từ, cụm ghép ngoài bảng, đường dự phòng', () => {
    const great = accent.parseNamedRelationshipExpression('Chắt của Trần Văn Cả là ai?');
    assert.deepEqual(great.terms, ['chắt']);
    assert.deepEqual(great.chain, ['child', 'child', 'child']);

    // "ông cô" không phải "ông của cô"; "ông của cô tôi" thì có "của" nên được hiểu.
    assert.equal(accent.parseRelationshipExpression('ông cô của tôi là ai').needsClarification, true);
    assert.deepEqual(accent.parseRelationshipExpression('ông của cô tôi là ai').terms, ['ông', 'cô']);
    assert.deepEqual(accent.parseRelationshipExpression('bà cô của tôi').terms, ['bà cô'], 'cụm có trong bảng từ khớp trước');

    // Từ không có cạnh chắc chắn (dượng): giữ key để tra theo nhãn, bỏ đường dự phòng thay vì đi nửa đường.
    const uncle = accent.parseRelationshipExpression('con của dượng tôi');
    assert.deepEqual(uncle.terms, ['con', 'dượng']);
    assert.deepEqual(uncle.chain, []);
    assert.equal(resolveRelationshipExpression(uncle, { sourcePersonId: 1, graph: { adjacency: new Map() } }).ok, false);
    assert.deepEqual(accent.parseRelationshipExpression('con của bác trai tôi').chain, ['parent', 'older_brother', 'child']);
});

test('restoreAccents: lấy lại chữ có dấu của cụm mà parser cũ đã bỏ dấu', () => {
    runWithQuestion('Chồng của bà tôi là ai?', () => {
        assert.equal(restoreAccents('ba toi'), 'bà tôi');
        assert.equal(restoreAccents('bà tôi'), 'bà tôi');
        assert.equal(restoreAccents('ong noi'), 'ong noi', 'cụm không có trong câu thì giữ nguyên');
    });
    runWithQuestion('Giổ của bà tôi', () => assert.equal(restoreAccents('gio cua ba toi'), 'giỗ của bà tôi', 'đã sửa sai thanh'));
    runWithQuestion('ba tôi và bà tôi', () => assert.equal(restoreAccents('ba toi'), 'ba toi', 'hai cụm khác dấu: không chọn'));
    runWithQuestion('chong cua ba toi la ai', () => assert.equal(restoreAccents('ba toi'), 'ba toi'));
    assert.equal(restoreAccents('ba toi'), 'ba toi', 'ngoài một lượt hỏi');
});
