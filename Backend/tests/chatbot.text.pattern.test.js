const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { pattern } = require('../src/modules/chatbot/text/pattern');
const { getGroup, groupNames } = require('../src/modules/chatbot/text/lexicon/groups');
const { stripAll } = require('../src/modules/chatbot/text/vietnameseText');

const who = pattern('^{kin} của {self} {ask:who}');

test('pattern: ba mức khớp của cùng một mẫu viết có dấu', () => {
    const exact = who.match('Bà của tôi là ai?');
    assert.equal(exact.level, 1);
    assert.equal(exact.confidence, 1);
    assert.equal(exact.plainMatch, false);
    assert.deepEqual(exact.groups, { kin: 'Bà', self: 'tôi', ask: 'là ai' });

    const wrongTone = who.match('bà của tôi lả ai');
    assert.equal(wrongTone.level, 2);
    assert.equal(wrongTone.confidence, 0.9);
    assert.equal(wrongTone.groups.kin, 'bà');

    const plain = who.match('ba cua toi la ai');
    assert.equal(plain.level, 3);
    assert.equal(plain.plainMatch, true);
    assert.equal(plain.groups.kin, 'ba');
});

test('pattern: "ba" trong câu có dấu không bao giờ thành "bà", và ngược lại', () => {
    const father = who.match('ba của tôi là ai');
    assert.equal(father.level, 1);
    assert.equal(father.groups.kin, 'ba');

    const grandmother = pattern('^bà của {self} {ask:who}');
    assert.equal(grandmother.match('ba của tôi là ai'), null);
    assert.equal(grandmother.match('bá của tôi là ai').level, 2, 'sai loại thanh vẫn là từ có thanh');
    assert.equal(pattern('^ba của {self}').match('bà của tôi'), null);
    assert.equal(pattern('^cô của {self}').match('cố của tôi'), null, 'cô/cố khác nhau ở cả mức 1 và mức 2');
    assert.equal(pattern('^cô của {self}').match('có của tôi'), null);
});

test('pattern: dấu rời (NFD), kiểu đặt thanh, chữ hoa và vị trí trên câu gốc', () => {
    const sentence = 'Ông Nội của tôi là ai?';
    const nfd = who.match(sentence.normalize('NFD'));
    assert.equal(nfd.level, 1);
    assert.equal(nfd.groups.kin, 'Ông Nội');
    assert.deepEqual(nfd.spans.kin, { start: 0, end: 7 });

    const named = pattern('^{kin} của (?<name>.+?) {ask:who}');
    const found = named.match('vợ của Đinh Văn Hoà tên gì');
    assert.equal(found.groups.name, 'Đinh Văn Hòa', 'tên lấy từ câu gốc đã toNFC, giữ dấu và chữ hoa');
    assert.equal(named.match('vo cua Dinh Van Hoa ten gi').groups.name, 'Dinh Van Hoa');
});

test('pattern: cụm dài khớp trước, ranh giới từ theo Unicode, nhóm lặp', () => {
    assert.equal(who.match('ông bà nội của tôi là ai').groups.kin, 'ông bà nội');
    assert.equal(pattern('{kin}').match('đông người'), null, '"ông" nằm trong "đông" không phải một từ');
    assert.equal(pattern('{kin}').match('xã Đông Cô').groups.kin, 'Cô');
    assert.equal(pattern('\\bô\\b').match('cô'), null);

    const chain = pattern('^{kin} của {kin} {self}');
    const found = chain.match('con của chị gái tôi');
    assert.deepEqual([found.groups.kin, found.groups.kin2], ['con', 'chị gái']);
    assert.equal(pattern('^giỗ {kin}').match('giổ ông nội').level, 2);
    assert.equal(pattern('^cháu {self}').match('chaú tôi').level, 2, 'thanh đặt lệch chữ vẫn là cùng một từ');
});

test('pattern: câu không dấu không nhận cách viết trùng từ thường; nhóm lạ báo lỗi', () => {
    assert.equal(pattern('^{kin} {self}').match('chi toi'), null, '"chi" không dấu không được hiểu là "chị"');
    assert.equal(pattern('^{kin} {self}').match('chị tôi').groups.kin, 'chị');
    assert.equal(who.match('ong noi cua toi la ai', 'accented'), null, 'ép chế độ có dấu thì không mở mức 3');
    assert.throws(() => pattern('{khongco}'), /không có nhóm từ/);
    assert.equal(who.match(null), null);
});

test('nhóm từ: dạng không dấu tự sinh, không viết tay trong thư mục text/', () => {
    for (const name of groupNames()) {
        const group = getGroup(name);
        group.plain.forEach((form) => assert.equal(form, stripAll(form), `${name}: ${form}`));
        assert.ok(group.accented.length > 0);
    }
    assert.ok(getGroup('kin').accented.includes('chị') && !getGroup('kin').plain.includes('chi'));
    const source = fs.readFileSync(path.join(__dirname, '../src/modules/chatbot/text/lexicon/groups.js'), 'utf8');
    const literals = [...source.matchAll(/'([^']+)'/g)].map((item) => item[1]).filter((value) => /^[\p{L} ]+$/u.test(value));
    const handWritten = literals.filter((value) => /^(toi|minh|la ai|ten gi|cua|bao nhieu|o dau|khi nao)$/.test(value));
    assert.deepEqual(handWritten, []);
});
