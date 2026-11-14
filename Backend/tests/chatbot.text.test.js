const test = require('node:test');
const assert = require('node:assert/strict');

const text = require('../src/modules/chatbot/text/vietnameseText');
const lexicon = require('../src/modules/chatbot/text/lexicon');
const { KINSHIP_TERMS } = require('../src/modules/chatbot/text/lexicon/kinship');
const { repairAccents } = require('../src/modules/chatbot/text/repair');
const { accentLevel, applyAccentScore, runWithQuestion } = require('../src/modules/chatbot/text/nameMatch');

const fixed = (sentence) => repairAccents(sentence).text;

test('toNFC: dấu rời và hai kiểu đặt thanh cho cùng một chuỗi', () => {
    for (const word of ['Hòa', 'thủy', 'giỗ', 'Đỗ Thị Hóa', 'khỏe']) {
        assert.equal(text.toNFC(word.normalize('NFD')), word);
    }
    assert.equal(text.toNFC('hoà'), 'hòa');
    assert.equal(text.toNFC('Thuý'), 'Thúy');
    assert.equal(text.toNFC('uỷ ban'), 'ủy ban');
    assert.equal(text.toNFC('quý'), 'quý', 'sau q thì u thuộc phụ âm đầu');
    assert.equal(text.toNFC('hoàn'), 'hoàn', 'vần có âm cuối giữ nguyên');
    assert.equal(text.toNFC(null), '');
});

test('ba mức so khớp', () => {
    assert.equal(text.matchLevel('bà cô', 'Bà Cô'), 1);
    assert.equal(text.matchLevel('hoà', 'hòa'), 1);
    assert.equal(text.matchLevel('giổ', 'giỗ'), 2, 'chỉ khác thanh');
    assert.equal(text.matchLevel('cô', 'có'), 3, 'khác dấu mũ: chỉ trùng khi bỏ hết dấu');
    assert.equal(text.matchLevel('Hưng', 'Hùng'), 3);
    assert.equal(text.matchLevel('ba co', 'bà cô'), 3);
    assert.equal(text.matchLevel('chú', 'bác'), 0);
    assert.equal(text.stripTone('Đỗ Thị Hóa'), 'Đô Thi Hoa');
    assert.equal(text.stripAll('Đỗ Thị Hóa'), 'Do Thi Hoa');
});

test('tokenize: vị trí, chữ hoa, có dấu hay không', () => {
    const tokens = text.tokenize('Ông noi của Hòa?');
    assert.deepEqual(tokens.map((token) => token.text), ['Ông', 'noi', 'của', 'Hòa']);
    assert.deepEqual(tokens.map((token) => token.hasMark), [true, false, true, true]);
    assert.deepEqual(tokens.map((token) => token.capitalised), [true, false, false, true]);
    assert.equal('Ông noi của Hòa?'.slice(tokens[3].start, tokens[3].end), 'Hòa');
    assert.equal(text.sentenceMode('ong noi toi la ai'), 'plain');
    assert.equal(text.sentenceMode('ông noi toi la ai'), 'accented');
});

test('lexicon: không có dạng không dấu viết tay, bảng mơ hồ tự sinh', () => {
    for (const entry of KINSHIP_TERMS) {
        assert.ok(!('plain' in entry), `${entry.key} không được khai báo dạng không dấu`);
        (entry.noPlain || []).forEach((form) => assert.ok(entry.forms.includes(form), `${entry.key}: noPlain phải nằm trong forms`));
    }
    assert.deepEqual(lexicon.ambiguousPlain.get('ba'), ['cha', 'bà']);
    assert.deepEqual(lexicon.ambiguousPlain.get('co'), ['cụ', 'cô'], 'co = cố (cụ) hoặc cô');
    assert.deepEqual(lexicon.plainIndex.index.get('ong noi'), ['ông nội']);
    assert.equal(lexicon.plainIndex.index.has('thay'), false, 'thầy không nhận ở câu không dấu (trùng "thay")');
    assert.equal(lexicon.plainIndex.index.has('chi'), false, 'chị không nhận ở câu không dấu (trùng "chi")');
    assert.deepEqual(lexicon.accentedIndex.index.get('bà cô'), ['bà cô']);
});

test('sửa chữ sai thanh trong câu có dấu', () => {
    assert.equal(fixed('Giổ ông nội ngày nào?'), 'Giỗ ông nội ngày nào?');
    assert.equal(fixed('Bố cũa tôi là ai?'), 'Bố của tôi là ai?');
    assert.equal(fixed('Con của ông Hưng gồm nhửng ai?'), 'Con của ông Hưng gồm những ai?');
    assert.equal(fixed('Bà ngọai tôi là ai?'), 'Bà ngoại tôi là ai?');
    assert.equal(fixed('Chú tôi lả ai?'), 'Chú tôi là ai?');
});

test('thêm dấu cho chữ sót dấu khi chỉ có một cách hiểu', () => {
    assert.equal(fixed('Ông noi tôi là ai?'), 'Ông nội tôi là ai?');
    assert.equal(fixed('Bố toi là ai?'), 'Bố tôi là ai?');
    assert.equal(fixed('Vợ của chu Nam là ai?'), 'Vợ của chú Nam là ai?', 'trước tên người chỉ có thể là từ gọi người');
    assert.equal(fixed('Co Út có mấy con?'), 'Cô Út có mấy con?');
    assert.equal(fixed('Me tôi là ai?'), 'Mẹ tôi là ai?');
});

test('không sửa tên người, từ có thật, từ nhiều cách hiểu, câu không dấu', () => {
    for (const sentence of [
        'Lê Văn Lăm sinh năm nào?',
        'Hoa sinh năm nào?',
        'Chủ tịch họ là ai?',
        'Cái nôi của dòng họ Đinh ở đâu?',
        'Chú tôi sinh nam nào?',
        'Cổ là ai?',
        'Cô Ba của tôi là ai?',
        'ba toi la ai',
        'co toi la ai',
        'Đinh Ap toi co su kien gi',
    ]) {
        assert.equal(fixed(sentence), sentence);
    }
    assert.deepEqual(repairAccents('Giổ ông noi').repairs, [{ from: 'Giổ', to: 'giỗ' }, { from: 'noi', to: 'nội' }]);
});

test('tên người: gõ có dấu thì đúng dấu thắng; câu không dấu thì ngang nhau', () => {
    assert.deepEqual(accentLevel('Hòa', ['Phạm Thị Hòa']), { level: 1, complete: true });
    assert.deepEqual(accentLevel('Hòa', ['Nguyễn Thị Hoa']), { level: 2, complete: true });
    assert.deepEqual(accentLevel('Trần Văn Hưng', ['Trần Văn Hùng']), { level: 3, complete: true });
    assert.equal(accentLevel('Lan', ['Phạm Thị Hòa']), null);

    const score = (question, name, person) => runWithQuestion(question, () => applyAccentScore(0.88, name, [person]));
    const accented = ['Nguyễn Thị Hoa', 'Phạm Thị Hòa', 'Đỗ Thị Hóa'].map((person) => score('Hòa sinh năm nào?', 'Hòa', person));
    assert.ok(accented[1] >= 0.98 && accented[0] < 0.9 && accented[2] < 0.9, 'Hòa thắng Hoa và Hóa');
    const bare = ['Nguyễn Thị Hoa', 'Phạm Thị Hòa', 'Đỗ Thị Hóa'].map((person) => score('Hoa sinh năm nào?', 'Hoa', person));
    assert.ok(bare[0] >= 0.98 && bare[1] < 0.9 && bare[2] < 0.9, 'câu có dấu mà gõ "Hoa" là đúng tên Hoa');
    const plain = ['Nguyễn Thị Hoa', 'Phạm Thị Hòa', 'Đỗ Thị Hóa'].map((person) => score('hoa sinh nam nao', 'hoa', person));
    assert.deepEqual(plain, [0.88, 0.88, 0.88], 'câu không dấu: không đoán, để nơi gọi hỏi lại');
});
