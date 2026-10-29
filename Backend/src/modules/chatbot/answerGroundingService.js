// Kiểm tra câu trả lời do LLM viết có "bịa" tên người hoặc năm/ngày không có trong dữ liệu đã đưa cho nó.
// Với gia phả, một cái tên hay năm sinh sai là lỗi nặng nên thà dùng câu trả lời theo luật còn hơn câu văn hay nhưng sai.
//
// checkGrounding(text, facts): facts là mọi thứ LLM được thấy (chuỗi hoặc object bất kỳ, sẽ được làm phẳng).
// - Tên: cụm từ viết hoa chữ đầu (có thể 1 từ nếu không đứng đầu câu). Mọi từ của cụm, sau khi bỏ danh xưng/từ thường gặp,
//   phải xuất hiện trong dữ liệu (so sánh không phân biệt dấu/hoa thường).
// - Số: mọi năm 4 chữ số và mọi ngày dd/mm[/yyyy] phải xuất hiện trong dữ liệu (ngày ISO yyyy-mm-dd trong dữ liệu được quy đổi).
// Cố ý không kiểm: từ viết hoa đơn lẻ ở đầu câu (Chào, Theo, Hiện...), số lượng ("3 người con"), số tuổi.

// Danh xưng và từ thường viết hoa trong văn bản gia phả, không phải tên riêng.
// Cố ý không đưa vào đây các từ trùng tên riêng phổ biến (Minh, Thọ, Tâm, Nam, Trường...): bỏ sót tên bịa còn tệ hơn bác oan.
const STOP_WORDS = new Set([
    // danh xưng
    'ong', 'ba', 'cu', 'bac', 'chu', 'co', 'di', 'cau', 'mo', 'thim', 'anh', 'chi', 'em', 'con', 'chau', 'chat',
    'cha', 'me', 'bo', 'vo', 'chong', 'ban', 'toi', 'ngai', 'huynh', 'de', 'than',
    // từ gia phả / lịch thường viết hoa
    'gia', 'pha', 'ho', 'doi', 'nhanh', 'toc', 'nha', 'dong', 'tu', 'am', 'duong', 'lich', 'tet',
    // từ hệ thống / câu chữ thường viết hoa ở đầu cụm
    'theo', 'du', 'lieu', 'tren', 'cay', 'he', 'thong', 'ung', 'dung', 'tro', 'ly', 'ai', 'viet',
    'xin', 'chao', 'cam', 'on', 'vang', 'da', 'vay', 'hien', 'dua', 'day', 'khong', 'rat',
    'thanh', 'vien', 'nguoi', 'tai', 'khoan', 'quan', 'admin', 'manager', 'member',
]);

const stripDiacritics = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const tokenize = (value) => stripDiacritics(value).split(/[^a-z0-9]+/).filter(Boolean);

function flatten(value, out = []) {
    if (value === null || value === undefined) return out;
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'number' || typeof value === 'boolean') out.push(String(value));
    else if (Array.isArray(value)) value.forEach((item) => flatten(item, out));
    else if (typeof value === 'object') Object.values(value).forEach((item) => flatten(item, out));
    return out;
}

const pad2 = (n) => String(Number(n));
// Khóa ngày dạng "d/m" hoặc "d/m/yyyy" (bỏ số 0 đầu) để so sánh 05/03 với 5/3.
const dateKey = (d, m, y) => (y ? `${pad2(d)}/${pad2(m)}/${y}` : `${pad2(d)}/${pad2(m)}`);

function collectKnownNumbers(factsText) {
    const years = new Set();
    const dates = new Set();
    for (const match of factsText.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
        years.add(match[1]);
        dates.add(dateKey(match[3], match[2], match[1]));
        dates.add(dateKey(match[3], match[2]));
    }
    for (const match of factsText.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)) {
        dates.add(dateKey(match[1], match[2], match[3]));
        dates.add(dateKey(match[1], match[2]));
        if (match[3]) years.add(match[3]);
    }
    for (const match of factsText.matchAll(/\b(\d{4})\b/g)) years.add(match[1]);
    return { years, dates };
}

// Các cụm viết hoa chữ đầu trong câu trả lời. Mỗi phần tử: { words, sentenceStart }.
function extractCapitalizedPhrases(text) {
    const phrases = [];
    const wordRe = /\p{Lu}[\p{L}]*/gu;
    let current = null;
    let lastEnd = -1;
    let match;
    while ((match = wordRe.exec(text)) !== null) {
        const start = match.index;
        const before = text.slice(0, start).replace(/[ \t]+$/, '');
        // Đầu câu: đầu văn bản, sau dấu kết câu/xuống dòng/dấu hai chấm, hoặc sau gạch đầu dòng, số thứ tự.
        const atSentenceStart = before === '' || /[.!?:\n]$/.test(before) || /(^|\n)\s*([-*•]|\d+[.)])$/.test(before);
        const prevSeparator = lastEnd >= 0 ? text.slice(lastEnd, start) : '';
        const contiguous = current && lastEnd >= 0 && /^ $/.test(prevSeparator);
        if (contiguous) {
            current.words.push(match[0]);
        } else {
            if (current) phrases.push(current);
            current = { words: [match[0]], sentenceStart: atSentenceStart };
        }
        lastEnd = start + match[0].length;
    }
    if (current) phrases.push(current);
    return phrases;
}

function checkGrounding(text, facts) {
    const answer = String(text || '');
    const factsText = typeof facts === 'string' ? facts : flatten(facts).join('\n');
    const known = new Set(tokenize(factsText));
    const unknownNames = [];
    const unknownNumbers = [];

    for (const phrase of extractCapitalizedPhrases(answer)) {
        let words = phrase.words;
        // Từ đầu câu viết hoa chỉ vì đứng đầu câu (Chào, Theo, Hiện...): bỏ khi cụm còn từ khác; cụm một từ đầu câu bỏ qua.
        if (phrase.sentenceStart) {
            if (words.length === 1) continue;
            words = words.slice(1);
        }
        const names = words.filter((word) => !STOP_WORDS.has(stripDiacritics(word)));
        if (!names.length) continue;
        const unknown = names.filter((word) => {
            const token = stripDiacritics(word);
            return token.length >= 2 && !known.has(token);
        });
        if (unknown.length) unknownNames.push(phrase.words.join(' '));
    }

    const { years, dates } = collectKnownNumbers(factsText);
    for (const match of answer.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)) {
        if (!dates.has(dateKey(match[1], match[2], match[3]))) unknownNumbers.push(match[0]);
    }
    const datePositions = [...answer.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)].map((m) => [m.index, m.index + m[0].length]);
    for (const match of answer.matchAll(/\b(1\d{3}|20\d{2})\b/g)) {
        const inDate = datePositions.some(([from, to]) => match.index >= from && match.index < to);
        if (!inDate && !years.has(match[1])) unknownNumbers.push(match[1]);
    }

    return {
        ok: unknownNames.length === 0 && unknownNumbers.length === 0,
        unknownNames: [...new Set(unknownNames)],
        unknownNumbers: [...new Set(unknownNumbers)],
    };
}

module.exports = { checkGrounding, extractCapitalizedPhrases };
