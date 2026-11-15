// Mẫu câu viết MỘT lần bằng chữ có dấu, khớp được ở ba mức (xem vietnameseText.js). Hàm thuần.
//
//   const who = pattern('^{kin} của {self} {ask:who}');
//   who.match('Bà của tôi là ai?')   -> mức 1, groups.kin = 'Bà'
//   who.match('bà của tôi lả ai')    -> mức 2 (sai thanh), độ tin cậy 0,9
//   who.match('ba cua toi la ai')    -> mức 3, plainMatch = true: nơi gọi phải xét các cách đọc của "ba"
//   who.match('ba của tôi là ai')    -> groups.kin = 'ba' (cha), không bao giờ là "bà"
//
// Cách viết nguồn:
//   - Viết từ trọn vẹn, chữ thường, có dấu. Một dấu cách khớp một hay nhiều khoảng trắng.
//   - {nhóm} hoặc {nhóm:con} chèn nhóm từ ở text/lexicon/groups.js và bắt vào groups.<nhóm> (lần hai là <nhóm>2).
//   - \b là ranh giới từ theo Unicode (\b gốc của JS không hiểu "đ", "ô").
//   - Phần còn lại là biểu thức chính quy thường: (?<ten>...), (?:...)?, ^, $.
//
// Mức 2 chỉ bỏ qua LOẠI thanh, không bỏ qua việc có thanh hay không: "lả" khớp "là", còn "ba" không khớp "bà".
// Mỗi mức đổi từng ký tự thành đúng một ký tự nên vị trí khớp dùng lại được trên câu gốc.
const { toNFC, stripTone, stripAll, sentenceMode } = require('./vietnameseText');
const { getGroup } = require('./lexicon/groups');

const LETTER = '[\\p{L}\\p{M}\\p{N}]';
const WORD_BOUNDARY = `(?:(?<!${LETTER})(?=${LETTER})|(?<=${LETTER})(?!${LETTER}))`;
// Thứ tự quan trọng: chuỗi thoát, nhìn trước/sau, tên nhóm bắt, lượng từ, chỗ chèn nhóm từ, từ, dấu cách, ký tự khác.
const PIECE = /\\[pP]\{[^}]*\}|\\k<[^>]*>|\\.|\(\?<?[=!]|\(\?<[^>]*>|\{\d+(?:,\d*)?\}|\{[\p{L}_]+(?::[\p{L}_]+)?\}|[\p{L}\p{M}]+| +|[\s\S]/gu;
const WORD_IN_TEXT = /[\p{L}\p{M}]+/gu;
const CONFIDENCE = { 1: 1, 2: 0.9, 3: 0.8 };

const hasTone = (word) => /[̣̀́̃̉]/.test(word.normalize('NFD'));
// Từ mang thanh -> dạng bỏ thanh VIẾT HOA; từ không thanh giữ nguyên. Câu đem khớp luôn là chữ thường,
// nên "BA" (bà, bá, bả...) không bao giờ trùng "ba".
const toneBlind = (word) => (hasTone(word) ? stripTone(word).toUpperCase() : word);

const WORD_FORM = { exact: (word) => word, noTone: toneBlind, plain: stripAll };

function groupSource(name, mode, captureName) {
    const group = getGroup(name);
    if (!group) throw new Error(`pattern: không có nhóm từ "${name}"`);
    const forms = mode === 'plain' ? group.plain : group.accented;
    const alternatives = [...new Set(forms.map((form) => form.split(' ').map(WORD_FORM[mode]).join('\\s+')))];
    return `${WORD_BOUNDARY}(?<${captureName}>${alternatives.join('|')})${WORD_BOUNDARY}`;
}

function compile(source, mode) {
    const seen = new Map();
    const body = toNFC(source).replace(PIECE, (piece) => {
        if (piece === '\\b') return WORD_BOUNDARY;
        if (piece[0] === '\\' || piece.startsWith('(?')) return piece;
        if (piece[0] === '{') {
            if (/^\{\d/.test(piece)) return piece;
            const name = piece.slice(1, -1);
            const base = name.split(':')[0];
            const count = (seen.get(base) || 0) + 1;
            seen.set(base, count);
            return groupSource(name, mode, count === 1 ? base : `${base}${count}`);
        }
        if (piece[0] === ' ') return '\\s+';
        return /^[\p{L}\p{M}]/u.test(piece) ? WORD_FORM[mode](piece) : piece;
    });
    return new RegExp(body, 'du');
}

// Câu đã đổi sang cùng dạng với mẫu ở từng mức; độ dài không đổi.
const VIEW = {
    exact: (lower) => lower,
    noTone: (lower) => lower.replace(WORD_IN_TEXT, toneBlind),
    plain: (lower) => stripAll(lower),
};

function pattern(source) {
    const regex = { exact: compile(source, 'exact'), noTone: compile(source, 'noTone'), plain: compile(source, 'plain') };

    // mode: 'accented' | 'plain'; bỏ trống thì tự xét theo câu.
    function match(text, mode) {
        const original = toNFC(text);
        const lower = original.toLowerCase();
        if (lower.length !== original.length) return null;
        const attempts = (mode || sentenceMode(lower)) === 'accented' ? [['exact', 1], ['noTone', 2]] : [['plain', 3]];
        for (const [kind, level] of attempts) {
            const view = VIEW[kind](lower);
            if (view.length !== lower.length) continue;
            const found = regex[kind].exec(view);
            if (!found) continue;
            const groups = {};
            const spans = {};
            Object.entries(found.indices.groups || {}).forEach(([name, span]) => {
                if (!span) return;
                groups[name] = original.slice(span[0], span[1]);
                spans[name] = { start: span[0], end: span[1] };
            });
            return {
                groups,
                spans,
                start: found.indices[0][0],
                end: found.indices[0][1],
                level,
                confidence: CONFIDENCE[level],
                plainMatch: level === 3,
            };
        }
        return null;
    }

    return { ...regex, match };
}

module.exports = { pattern };
