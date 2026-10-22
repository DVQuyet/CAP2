// Chuẩn hóa cách gõ thực tế trước khi phân tích câu hỏi: lời xã giao ("cho mình hỏi ... ạ"),
// viết tắt (a/c/e, ck/vk, bn, ko), vài lỗi gõ phổ biến. Không đổi tên riêng và không bỏ/thêm dấu cho phần còn lại.

const hasDiacritics = (value) => /[^\u0000-\u007f]/.test(String(value || ''));

// [mẫu, dạng có dấu, dạng không dấu]
const ABBREVIATIONS = [
    [/\ba\s*\/\s*c\s*\/\s*e\b/gi, 'anh chị em', 'anh chi em'],
    [/\ba\s*\/\s*e\b/gi, 'anh em', 'anh em'],
    [/\bc\s*\/\s*e\b/gi, 'chị em', 'chi em'],
    [/\bbn\b/gi, 'bao nhiêu', 'bao nhieu'],
    [/\bck\b/gi, 'chồng', 'chong'],
    [/\bvk\b/gi, 'vợ', 'vo'],
    [/\be\s+(gái|gai)\b/gi, 'em $1'],
    [/\be\s+(trai)\b/gi, 'em $1'],
    [/\b(ko|k0|hok)\b/gi, 'không', 'khong'],
    [/\btui\b/gi, 'tôi', 'toi'],
    [/\b(nọi|nôi)\b/gi, 'nội', 'noi'],
];

// Lời xã giao ở đầu câu (có dấu hoặc không dấu).
const LEADING_POLITE = /^\s*(?:(?:xin\s+)?cho\s+(?:mình|minh|tôi|toi|em|con|cháu|chau|tui|tớ)?\s*(?:hỏi|hoi)(?:\s+(?:chút|chut|một câu|mot cau|tí|ti))?|xin\s+(?:hỏi|hoi)|(?:mình|minh|tôi|toi|em|con|cháu|chau|tui)\s+(?:muốn|muon)\s+(?:hỏi|hoi)(?:\s+(?:là|la))?|(?:cho\s+)?(?:hỏi|hoi)(?:\s+(?:chút|chut))?(?=\s))[\s,:-]*/i;

// Lời xã giao/từ đệm ở cuối câu.
// "a" đứng một mình chỉ bị bỏ sau từ để hỏi (tránh cắt tên như "Nguyễn Văn A").
const TRAILING_POLITE = /(?:\s+(?:ạ|nhé|nhe|nha|nhỉ|với|voi|vậy|vay|zậy|dzậy|z)|(?<=\b(?:ai|gi|gì|nao|nào|không|khong|nhiêu|nhieu|nhieu|đâu|dau|mấy|may|sao))\s+(?:a|ah))+\s*(?=[?.!]*\s*$)/i;

function normalizeTyping(message) {
    let text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text) return text;
    const plain = !hasDiacritics(text);

    for (const [pattern, accented, unaccented] of ABBREVIATIONS) {
        if (accented === null) continue;
        text = text.replace(pattern, (...args) => {
            const template = plain && unaccented ? unaccented : accented;
            return template.replace(/\$(\d)/g, (_, index) => args[Number(index)] || '');
        });
    }

    // Chỉ bỏ lời xã giao khi vẫn còn nội dung câu hỏi.
    const withoutLead = text.replace(LEADING_POLITE, '');
    if (withoutLead && withoutLead.split(/\s+/).length >= 2) text = withoutLead;
    const withoutTail = text.replace(TRAILING_POLITE, '');
    if (withoutTail && withoutTail.split(/\s+/).length >= 2) text = withoutTail;

    return text.replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeTyping };
