// Nhóm từ dùng trong mẫu câu của text/pattern.js: "{kin} của {self} {ask:who}".
// Mỗi nhóm viết bằng chữ có dấu; dạng không dấu tự sinh bằng stripAll, không viết tay.
const { stripAll } = require('../vietnameseText');
const { KINSHIP_TERMS, EXTRA_PLAIN_READINGS } = require('./kinship');
const { NAME_TITLES } = require('./words');

const SELF = ['tôi', 'mình', 'tui', 'tớ'];
// Người hỏi tự xưng theo vai ("ông nội của con là ai").
const SELF_BY_ROLE = ['em', 'con', 'cháu'];

const ASK = {
    who: ['là ai', 'tên gì', 'tên là gì', 'là những ai', 'gồm những ai', 'gồm ai', 'có những ai', 'là người nào'],
    what: ['là gì', 'gọi là gì'],
    count: ['bao nhiêu', 'mấy'],
    when: ['khi nào', 'ngày nào', 'năm nào', 'bao giờ', 'lúc nào'],
    where: ['ở đâu', 'ở chỗ nào'],
};

const unique = (items) => [...new Set(items)];
const longestFirst = (items) => unique(items).sort((a, b) => b.length - a.length || a.localeCompare(b, 'vi'));

// accented: dùng cho câu có dấu (mức 1 và 2); plain: dùng cho câu không dấu (mức 3).
function makeGroup(accented, plainSource = accented) {
    return { accented: longestFirst(accented), plain: longestFirst(plainSource.map(stripAll)) };
}

const kinForms = KINSHIP_TERMS.flatMap((entry) => entry.forms);
// Cách viết không nhận ở câu không dấu vì trùng một từ thường gặp khác (thầy/thay, chị/chi...).
const kinPlainForms = KINSHIP_TERMS.flatMap((entry) => entry.forms.filter((form) => !(entry.noPlain || []).includes(form)));
// "ba" (miền Nam, miền Trung) = cha: không nằm trong forms vì còn là thứ bậc ("cô ba"), nhưng mẫu câu phải bắt được.
const extraKin = EXTRA_PLAIN_READINGS.map(([form]) => form);

const GROUPS = {
    self: makeGroup(SELF),
    selfAny: makeGroup([...SELF, ...SELF_BY_ROLE]),
    kin: makeGroup([...kinForms, ...extraKin], [...kinPlainForms, ...extraKin]),
    title: makeGroup(NAME_TITLES),
    of: makeGroup(['của']),
    ...Object.fromEntries(Object.entries(ASK).map(([sub, forms]) => [`ask:${sub}`, makeGroup(forms)])),
    ask: makeGroup(Object.values(ASK).flat()),
};

module.exports = {
    SELF,
    SELF_BY_ROLE,
    getGroup: (name) => GROUPS[name] || null,
    groupNames: () => Object.keys(GROUPS),
};
