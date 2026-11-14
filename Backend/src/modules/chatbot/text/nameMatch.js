// So tên người theo dấu. Khi người hỏi gõ có dấu, "Hòa" phải thắng "Hoa" và "Hóa"; khi cả câu không dấu
// thì ba tên đó ngang nhau và nơi gọi phải hỏi lại.
const { AsyncLocalStorage } = require('async_hooks');
const { hasVietnameseMarks, tokenize, stripTone } = require('./vietnameseText');

// Câu đang được trả lời có dấu hay không. Đặt một lần cho cả lượt hỏi (runWithQuestion).
const questionContext = new AsyncLocalStorage();

function runWithQuestion(message, fn) {
    return questionContext.run({ accented: hasVietnameseMarks(message) }, fn);
}

// Tên trong câu có được coi là "gõ có dấu" không. Ngoài một lượt hỏi (test, công cụ) thì xét theo chính tên đó.
function typedWithAccents(queryName) {
    const store = questionContext.getStore();
    return store ? store.accented : hasVietnameseMarks(queryName);
}

// Mức khớp dấu của tên đã gõ với tên trong gia phả, xét trên những chữ trùng nhau khi bỏ dấu:
//   1 = mọi chữ trùng cả dấu; 2 = có chữ chỉ khác thanh; 3 = có chữ khác cả dấu mũ/móc (Hưng - Hùng).
// complete = mọi chữ đã gõ đều có trong tên. Trả null nếu không chữ nào trùng.
function accentLevel(queryName, candidateNames = []) {
    const queryTokens = tokenize(queryName);
    const nameTokens = candidateNames.flatMap((name) => tokenize(name));
    let level = 0;
    let matched = 0;
    queryTokens.forEach((token) => {
        const same = nameTokens.filter((item) => item.plain === token.plain);
        if (!same.length) return;
        matched += 1;
        const best = same.some((item) => item.lower === token.lower) ? 1
            : same.some((item) => stripTone(item.lower) === token.noTone) ? 2 : 3;
        level = Math.max(level, best);
    });
    return matched ? { level, complete: matched === queryTokens.length } : null;
}

const LEVEL_FACTOR = { 1: 1, 2: 0.93, 3: 0.75 };
// Trùng trọn tên đã gõ, đúng từng dấu: xếp trên mọi kiểu khớp gần đúng (ngưỡng "chắc chắn" của resolvePerson là 0,98).
const EXACT_ACCENT_SCORE = 0.985;

// Chỉnh điểm so tên (tính trên chữ không dấu) theo dấu. Câu không dấu: giữ nguyên điểm.
function applyAccentScore(baseScore, queryName, candidateNames) {
    if (!baseScore || !typedWithAccents(queryName)) return baseScore;
    const match = accentLevel(queryName, candidateNames);
    if (!match) return baseScore;
    if (match.level === 1) return match.complete && baseScore >= 0.86 ? Math.max(baseScore, EXACT_ACCENT_SCORE) : baseScore;
    return baseScore * LEVEL_FACTOR[match.level];
}

module.exports = { runWithQuestion, typedWithAccents, accentLevel, applyAccentScore };
