// Bảng tra dựng từ lexicon/kinship.js và lexicon/words.js. Mọi dạng bỏ thanh, dạng không dấu và bảng mơ hồ
// đều sinh ở đây; không có dạng không dấu nào được viết tay.
const { stripAll, stripTone } = require('../vietnameseText');
const { KINSHIP_TERMS, EXTRA_PLAIN_READINGS } = require('./kinship');
const { QUESTION_WORDS, KEEP_WORDS, KEEP_PLAIN_WORDS, NAME_TITLES } = require('./words');

const termByKey = new Map(KINSHIP_TERMS.map((entry) => [entry.key, entry]));

function addTo(index, phrase, key) {
    const keys = index.get(phrase) || [];
    if (!keys.includes(key)) keys.push(key);
    index.set(phrase, keys);
}

// Cụm xưng hô -> danh sách key, kèm các độ dài cụm (số từ) giảm dần để khớp cụm dài trước.
function buildPhraseIndex(toPhrase, { extra = [], skipNoPlain = false } = {}) {
    const index = new Map();
    extra.forEach(([phrase, key]) => addTo(index, phrase, key));
    KINSHIP_TERMS.forEach((entry) => {
        entry.forms
            .filter((form) => !(skipNoPlain && (entry.noPlain || []).includes(form)))
            .forEach((form) => addTo(index, toPhrase(form), entry.key));
    });
    const lengths = [...new Set([...index.keys()].map((phrase) => phrase.split(' ').length))].sort((a, b) => b - a);
    return { index, lengths };
}

const accentedIndex = buildPhraseIndex((form) => form);
const plainIndex = buildPhraseIndex(stripAll, { extra: EXTRA_PLAIN_READINGS, skipNoPlain: true });

// Dạng không dấu ứng với từ hai xưng hô trở lên: phải tra gia phả cho từng cách hiểu rồi mới trả lời.
const ambiguousPlain = new Map([...plainIndex.index].filter(([, keys]) => keys.length > 1));

// ---- Từ đơn, dùng khi sửa chữ gõ sai thanh hoặc sót dấu ----
const kinshipWords = new Set(KINSHIP_TERMS.flatMap((entry) => entry.forms.flatMap((form) => form.split(' '))));
const knownWords = new Set([...kinshipWords, ...QUESTION_WORDS]);
const keepWords = new Set(KEEP_WORDS);
const keepPlainWords = new Set(KEEP_PLAIN_WORDS);

function groupBy(words, toKey) {
    const groups = new Map();
    words.forEach((word) => groups.set(toKey(word), [...(groups.get(toKey(word)) || []), word]));
    return groups;
}

const knownByNoTone = groupBy([...knownWords], stripTone);
const knownByPlain = groupBy([...knownWords], stripAll);
const titlesByPlain = groupBy(NAME_TITLES, stripAll);

module.exports = {
    KINSHIP_TERMS,
    getKinshipTerm: (key) => termByKey.get(key) || null,
    accentedIndex,
    plainIndex,
    ambiguousPlain,
    isKnownWord: (word) => knownWords.has(word),
    isKeepWord: (word) => keepWords.has(word),
    isKeepPlainWord: (word) => keepPlainWords.has(word),
    // Các từ hiểu được có cùng dạng bỏ thanh / cùng dạng không dấu với `word`.
    knownWithSameNoTone: (word) => knownByNoTone.get(stripTone(word)) || [],
    knownWithSamePlain: (word) => knownByPlain.get(stripAll(word)) || [],
    titlesWithSamePlain: (word) => titlesByPlain.get(stripAll(word)) || [],
};
