// Sửa chữ gõ sai thanh hoặc sót dấu TRONG CÂU CÓ DẤU, trước khi phân tích câu.
//   "Giổ ông nội ngày nào?"  -> "Giỗ ông nội ngày nào?"     (sai thanh)
//   "Ông noi tôi là ai?"     -> "Ông nội tôi là ai?"        (sót dấu một chữ)
// Chỉ sửa khi có đúng MỘT từ hiểu được ứng với chữ đã gõ. Tên người (chữ viết hoa giữa câu) không bao giờ bị sửa.
// Câu không dấu hoàn toàn giữ nguyên: ở đó mỗi chữ có nhiều cách hiểu và phải tra gia phả rồi mới quyết định.
const { toNFC, tokenize, sentenceMode } = require('./vietnameseText');
const lexicon = require('./lexicon');

const hasTone = (word) => /[̣̀́̃̉]/.test(word.normalize('NFD'));

// Chữ mang dấu nhưng không phải từ hiểu được: tìm từ hiểu được chỉ khác ở thanh.
function fixWrongTone(token) {
    if (lexicon.isKeepWord(token.lower)) return null;
    const candidates = lexicon.knownWithSameNoTone(token.lower);
    if (candidates.length === 1) return candidates[0];
    // "nhửng": người gõ đã cố ý đặt thanh, nên ưu tiên từ có thanh ("những") hơn từ không thanh.
    const toned = hasTone(token.lower) ? candidates.filter(hasTone) : [];
    return toned.length === 1 ? toned[0] : null;
}

// Chữ không mang dấu trong câu có dấu: thêm dấu khi chỉ có một từ hiểu được khớp.
function fixMissingMarks(token, next) {
    if (lexicon.isKnownWord(token.lower) || lexicon.isKeepPlainWord(token.lower)) return null;
    // Đứng trước tên người ("chu Nam", "co Út"): chỉ có thể là từ gọi người.
    if (next?.capitalised) {
        const titles = lexicon.titlesWithSamePlain(token.lower);
        if (titles.length === 1) return titles[0];
    }
    const candidates = lexicon.knownWithSamePlain(token.lower);
    return candidates.length === 1 ? candidates[0] : null;
}

const matchCase = (replacement, original) => (
    /^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement
);

// Trả { text, repairs: [{ from, to }] }. text đã qua toNFC kể cả khi không sửa gì.
function repairAccents(value) {
    const text = toNFC(value);
    if (sentenceMode(text) !== 'accented') return { text, repairs: [] };

    const tokens = tokenize(text);
    // Chữ viết hoa giữa câu là tên riêng. Chữ đầu câu viết hoa vì là đầu câu nên vẫn xét,
    // trừ khi theo sau cũng là chữ viết hoa: khi đó nó mở đầu một họ tên ("Lê Văn Lăm") hoặc là từ gọi người ("Co Út").
    const startsName = (index) => index === 0 && tokens[0].capitalised && Boolean(tokens[1]?.capitalised);
    const isName = (token, index) => token.capitalised && (index > 0 || startsName(index));
    // Câu chỉ có dấu ở tên riêng ("Đinh Ap toi co su kien gi") vẫn là câu không dấu.
    if (!tokens.some((token, index) => token.hasMark && !isName(token, index))) return { text, repairs: [] };

    const repairs = [];
    let result = '';
    let cursor = 0;
    tokens.forEach((token, index) => {
        let fixed = null;
        if (startsName(index)) {
            const titles = token.hasMark ? [] : lexicon.titlesWithSamePlain(token.lower);
            fixed = titles.length === 1 ? titles[0] : null;
        } else if (!isName(token, index) && token.lower.length > 1 && !lexicon.isKnownWord(token.lower)) {
            fixed = token.hasMark ? fixWrongTone(token) : fixMissingMarks(token, tokens[index + 1]);
        }
        result += text.slice(cursor, token.start);
        if (fixed && fixed !== token.lower) {
            repairs.push({ from: token.text, to: fixed });
            result += matchCase(fixed, token.text);
        } else {
            result += token.text;
        }
        cursor = token.end;
    });
    return { text: result + text.slice(cursor), repairs };
}

module.exports = { repairAccents };
