// Xử lý chữ tiếng Việt cho trợ lý: chuẩn hóa dấu, ba mức so khớp, tách từ. Hàm thuần.
//   Mức 1: chữ có dấu đầy đủ (NFC, chữ thường)        "bà cô" = "Bà Cô"
//   Mức 2: bỏ thanh, giữ ă â ê ô ơ ư đ                 "giổ" = "giỗ"
//   Mức 3: bỏ hết dấu                                   "ba co" = "bà cô"
// stripAll ở file này là nơi duy nhất trong chatbot được bỏ hết dấu.

const TONE_MARKS = /[̣̀́̃̉]/g; // huyền, sắc, ngã, hỏi, nặng
const ALL_MARKS = /[̀-ͯ]/g;
const WORD = /[\p{L}\p{M}\p{N}]+/gu;
// Thanh đặt ở chữ thứ hai của vần oa, oe, uy khi vần đứng cuối tiếng ("hoà", "khoẻ", "thuỷ").
// Sau q thì u thuộc phụ âm đầu ("quý") nên không đổi.
const TONE_ON_SECOND = /(?<![qQ])([oO])([aAeE])([̣̀́̃̉])(?![\p{L}\p{M}])|(?<![qQ])([uU])([yY])([̣̀́̃̉])(?![\p{L}\p{M}])/gu;

// Gộp dấu rời (macOS/iOS gửi dạng NFD) và đưa hai kiểu đặt thanh về một kiểu: hoà -> hòa, thuỷ -> thủy.
function toNFC(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(TONE_ON_SECOND, (_, o, a, tone1, u, y, tone2) => (o ? `${o}${tone1}${a}` : `${u}${tone2}${y}`))
        .normalize('NFC');
}

function stripTone(value) {
    return toNFC(value).normalize('NFD').replace(TONE_MARKS, '').normalize('NFC');
}

function stripAll(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(ALL_MARKS, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

// Chữ thường, NFC, bỏ dấu câu, gộp khoảng trắng; giữ dấu tiếng Việt.
function normalizeAccented(value) {
    return toNFC(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\s/]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Mỗi từ: { text, lower, noTone, plain, start, end, capitalised, hasMark }; start/end tính trên chuỗi đã toNFC.
function tokenize(value) {
    const text = toNFC(value);
    return [...text.matchAll(WORD)].map((match) => {
        const lower = match[0].toLowerCase();
        const plain = stripAll(lower);
        return {
            text: match[0],
            lower,
            noTone: stripTone(lower),
            plain,
            start: match.index,
            end: match.index + match[0].length,
            capitalised: /^\p{Lu}/u.test(match[0]),
            hasMark: lower !== plain,
        };
    });
}

function hasVietnameseMarks(value) {
    const text = toNFC(value).toLowerCase();
    return text !== stripAll(text);
}

// 'accented': có ít nhất một chữ mang dấu; 'plain': cả câu không dấu.
function sentenceMode(value) {
    return hasVietnameseMarks(value) ? 'accented' : 'plain';
}

// Mức khớp cao nhất giữa hai chuỗi: 1, 2, 3; 0 nếu không khớp.
function matchLevel(a, b) {
    const left = normalizeAccented(a);
    const right = normalizeAccented(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (stripTone(left) === stripTone(right)) return 2;
    return stripAll(left) === stripAll(right) ? 3 : 0;
}

module.exports = {
    toNFC,
    stripTone,
    stripAll,
    normalizeAccented,
    tokenize,
    hasVietnameseMarks,
    sentenceMode,
    matchLevel,
};
