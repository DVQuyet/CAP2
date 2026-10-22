// Chuẩn hóa cách gõ thực tế trước khi phân tích câu hỏi: lời xã giao ("cho mình hỏi ... ạ"),
// viết tắt (a/c/e, ck/vk, bn, ko), vài lỗi gõ phổ biến. Không đổi tên riêng và không bỏ/thêm dấu cho phần còn lại.
//
// Nguyên tắc: thà bỏ sót một từ đệm còn hơn làm hỏng tên người ("Nguyễn Thị Tui", "Đinh Ko", "Trần Văn Với").

const hasDiacritics = (value) => /[^\u0000-\u007f]/.test(String(value || ''));

// `\b` của JS chỉ hiểu ASCII nên không dùng được trước chữ như "đ"; dùng ranh giới theo Unicode.
const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const re = (source, flags = 'giu') => new RegExp(source, flags);

const isCapitalised = (token) => /^\p{Lu}/u.test(String(token || ''));
const lastToken = (text, end) => {
    const match = text.slice(0, end).match(/(\S+)\s*$/u);
    return match ? match[1] : null;
};

// Từ đệm đứng sau tên/họ lót: nếu token trước là họ lót thì phần cuối là tên người.
const NAME_PARTICLES = new Set(['văn', 'van', 'thị', 'thi', 'đình', 'dinh', 'hữu', 'huu', 'quốc', 'quoc', 'ngọc', 'ngoc', 'y', 'ê']);

// [mẫu, dạng có dấu, dạng không dấu, kiểu bảo vệ]
//   'lower'  : chỉ đổi khi token viết thường và token đứng trước không viết hoa (không phải một phần tên người)
//   'family' : chỉ đổi "nôi" -> "nội" ngay sau ông/bà/họ
const ABBREVIATIONS = [
    [re(`${B}a\\s*\\/\\s*c\\s*\\/\\s*e${E}`), 'anh chị em', 'anh chi em'],
    [re(`${B}a\\s*\\/\\s*e${E}`), 'anh em', 'anh em'],
    [re(`${B}c\\s*\\/\\s*e${E}`), 'chị em', 'chi em'],
    [re(`${B}bn${E}`), 'bao nhiêu', 'bao nhieu'],
    [re(`${B}ck${E}`), 'chồng', 'chong'],
    [re(`${B}vk${E}`), 'vợ', 'vo'],
    [re(`${B}e\\s+(gái|gai)${E}`), 'em $1'],
    [re(`${B}e\\s+(trai)${E}`), 'em $1'],
    [re(`${B}(ko|k0|hok)${E}`), 'không', 'khong', 'lower'],
    [re(`${B}tui${E}`), 'tôi', 'toi', 'lower'],
    [re(`${B}(nọi|nôi)${E}`), 'nội', 'noi', 'family'],
];

// Lời xã giao ở đầu câu. "Hỏi" đứng một mình có thể là tên người nên chỉ bỏ các cụm rõ nghĩa.
const LEADING_POLITE = re(
    `^\\s*(?:(?:xin\\s+)?cho\\s+(?:mình|minh|tôi|toi|em|con|cháu|chau|tui|tớ)?\\s*(?:hỏi|hoi)(?:\\s+(?:chút|chut|xíu|xiu|một câu|mot cau|tí|ti))?|xin\\s+(?:hỏi|hoi)|(?:mình|minh|tôi|toi|em|con|cháu|chau|tui)\\s+(?:muốn|muon)\\s+(?:hỏi|hoi)(?:\\s+(?:là|la))?|(?:hỏi|hoi)\\s+(?:chút|chut|xíu|xiu))${E}[\\s,:-]*`,
    'iu'
);

// Từ đệm ở cuối câu (chỉ bỏ khi viết thường nguyên bản).
const TAIL_PARTICLES = new Set(['ạ', 'nhé', 'nhe', 'nha', 'nhỉ', 'với', 'voi', 'vậy', 'vay', 'zậy', 'dzậy', 'z']);
// "a"/"ah" chỉ là từ đệm khi đứng sau từ để hỏi (tránh cắt tên như "Nguyễn Văn A").
const TAIL_AFTER_QUESTION = new Set(['a', 'ah']);
const QUESTION_WORDS = new Set(['ai', 'gi', 'gì', 'nao', 'nào', 'không', 'khong', 'nhiêu', 'nhieu', 'đâu', 'dau', 'mấy', 'may', 'sao']);
// Câu ngắn (1 từ + từ đệm) vẫn được bỏ đệm nếu từ còn lại là từ để hỏi hoặc xưng hô.
const KNOWN_SHORT_WORDS = new Set([
    ...QUESTION_WORDS,
    'bác', 'bac', 'chú', 'chu', 'cô', 'co', 'dì', 'di', 'cậu', 'cau', 'mợ', 'mo', 'thím', 'thim', 'ông', 'ong', 'bà', 'ba',
    'anh', 'chị', 'chi', 'em', 'cha', 'mẹ', 'me', 'bố', 'bo', 'má', 'ma', 'con', 'cháu', 'chau', 'vợ', 'vo', 'chồng', 'chong',
]);

function stripTrailingParticles(text) {
    const match = text.match(/^(.*?)\s*([?.!]*)$/su);
    const punct = match[2];
    const tokens = match[1].split(' ').filter(Boolean);
    let stripped = false;
    while (tokens.length >= 2) {
        const last = tokens[tokens.length - 1];
        const prev = tokens[tokens.length - 2];
        const prevLower = prev.toLowerCase();
        const isLeadingKnown = tokens.length === 2 && KNOWN_SHORT_WORDS.has(prevLower);
        let strip = false;
        if (TAIL_AFTER_QUESTION.has(last)) {
            strip = QUESTION_WORDS.has(prevLower);
        } else if (TAIL_PARTICLES.has(last)) {
            // Token trước viết hoa (trừ từ hỏi/xưng hô ở đầu câu) hoặc là họ lót -> phần cuối là tên người.
            const nameLike = (isCapitalised(prev) && !isLeadingKnown) || NAME_PARTICLES.has(prevLower);
            strip = !nameLike;
        }
        if (!strip) break;
        // Còn đúng 1 từ thì chỉ bỏ khi đó là từ hỏi/xưng hô.
        if (tokens.length === 2 && !KNOWN_SHORT_WORDS.has(prevLower)) break;
        tokens.pop();
        stripped = true;
    }
    return stripped ? tokens.join(' ') + punct : text;
}

function normalizeTyping(message) {
    let text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text) return text;
    const plain = !hasDiacritics(text);

    for (const [pattern, accented, unaccented, guard] of ABBREVIATIONS) {
        text = text.replace(pattern, (...args) => {
            const matched = args[0];
            const offset = args[args.length - 2];
            const whole = args[args.length - 1];
            if (guard === 'lower') {
                // Tên riêng viết hoa (Tui, Ko) hoặc đi sau tên viết hoa (Đinh Ko) thì giữ nguyên.
                if (matched !== matched.toLowerCase()) return matched;
                const prev = lastToken(whole, offset);
                if (prev && isCapitalised(prev)) return matched;
            }
            if (guard === 'family') {
                const prev = (lastToken(whole, offset) || '').toLowerCase();
                if (!['ông', 'ong', 'bà', 'ba', 'họ', 'ho'].includes(prev)) return matched;
            }
            const template = plain && unaccented ? unaccented : accented;
            return template.replace(/\$(\d)/g, (_, index) => args[Number(index)] || '');
        });
    }

    // Chỉ bỏ lời xã giao khi vẫn còn nội dung câu hỏi.
    const withoutLead = text.replace(LEADING_POLITE, '');
    if (withoutLead && withoutLead.split(/\s+/).length >= 2) text = withoutLead;
    text = stripTrailingParticles(text);

    return text.replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeTyping };
