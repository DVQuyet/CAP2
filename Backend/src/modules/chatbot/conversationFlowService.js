// Hội thoại nối tiếp, làm trên câu chữ trước khi phân tích ý định:
//   - đại từ "ông ấy/bà ấy/người đó…" -> tên người vừa được hỏi tới (xét giới tính);
//   - câu lược "Thế còn X?", "Còn con của ông ấy?" -> câu đầy đủ dựa trên câu trước;
//   - đang hỏi lại vì trùng tên: hiểu "1", "người thứ hai", "sinh 1965", tên người.
// Mọi hàm ở đây là hàm thuần để dễ kiểm thử.

const MALE = 1;
const FEMALE = 2;

// [mẫu (có dấu và không dấu), giới tính người được nhắc: 'male' | 'female' | null]
const PRONOUNS = [
    ['(?:ông|ong)\\s+(?:ấy|ay|đó|do|này|nay|kia)', 'male'],
    ['(?:anh|chú|chu|cậu|cau|bác trai|bac trai)\\s+(?:ấy|ay|đó|do)', 'male'],
    ['(?:bà|ba)\\s+(?:ấy|ay|đó|do|này|nay|kia)', 'female'],
    ['(?:chị|chi|cô|co|dì|di|thím|thim|mợ|mo|bác gái|bac gai)\\s+(?:ấy|ay|đó|do)', 'female'],
    ['(?:cụ|cu|bác|bac|em|người|nguoi)\\s+(?:ấy|ay|đó|do|này|nay)', null],
];

const SELECTION_ORDINALS = new Map([
    ['dau tien', 1], ['thu nhat', 1], ['nhat', 1], ['thu hai', 2], ['hai', 2], ['thu ba', 3], ['ba', 3],
    ['thu tu', 4], ['tu', 4], ['thu nam', 5], ['nam', 5],
]);

function stripDiacritics(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

function pronounRegex(pattern) {
    return new RegExp(`(^|\\s)(${pattern})(?=\\s|$|[?.,!])`, 'i');
}

// Tìm đại từ trong câu: { text, gender } hoặc null.
function findPronoun(message) {
    const text = String(message || '').normalize('NFC');
    for (const [pattern, gender] of PRONOUNS) {
        const match = text.match(pronounRegex(pattern));
        if (match) return { text: match[2], gender };
    }
    return null;
}

function genderMatches(person, gender) {
    if (!gender || !person) return true;
    const value = Number(person.gender);
    if (!value) return true;
    return gender === 'male' ? value === MALE : value === FEMALE;
}

// Người được "ông ấy/bà ấy" nhắc tới: ưu tiên người vừa được hỏi tới, rồi người trong câu trả lời trước (đúng giới tính).
// lookup(id) trả hồ sơ có giới tính (vd từ đồ thị gia phả).
function resolvePronounPerson(memory, gender, lookup = () => null) {
    const candidates = [];
    if (memory?.lastSubject?.id) candidates.push(memory.lastSubject);
    for (const person of memory?.lastAnswerPeople || []) candidates.push(person);
    for (const candidate of candidates) {
        const profile = lookup(candidate.id) || candidate;
        if (genderMatches(profile, gender)) return { id: Number(candidate.id), name: candidate.name || profile.display_name || null };
    }
    return null;
}

// "Vợ của ông ấy là ai?" -> "Vợ của Đinh Văn Lâm là ai?"
function rewritePronoun(message, memory, lookup) {
    const pronoun = findPronoun(message);
    if (!pronoun) return null;
    const person = resolvePronounPerson(memory, pronoun.gender, lookup);
    if (!person?.name) return null;
    const rewritten = String(message).normalize('NFC').replace(pronounRegex(pronoun.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), (all, lead) => `${lead}${person.name}`);
    return { message: rewritten, person };
}

const ELLIPSIS_PREFIX = /^(?:thế còn|the con|vậy còn|vay con|còn)\s+(.+?)(?:\s+(?:thì sao|thi sao|thì thế nào|thi the nao|thì|thi|nữa|nua))?\s*[?.!]*$/i;
const ELLIPSIS_SUFFIX = /^(.+?)\s+(?:thì sao|thi sao|thì thế nào|thi the nao)\s*[?.!]*$/i;

// "Thế còn Đinh Văn Bình?" -> phần còn lại ("Đinh Văn Bình"); null nếu không phải câu lược.
function detectEllipsis(message) {
    const text = String(message || '').normalize('NFC').trim();
    const match = text.match(ELLIPSIS_PREFIX) || text.match(ELLIPSIS_SUFFIX);
    if (!match) return null;
    const rest = match[1].trim();
    if (!rest || rest.split(/\s+/).length > 8) return null;
    // Đã là câu hỏi đầy đủ ("còn sống không") thì không coi là câu lược.
    if (/\b(la ai|ten gi|khong|bao nhieu|may|nam nao|ngay nao|o dau|song)\b/.test(stripDiacritics(rest))) return null;
    return rest;
}

function replaceInsensitive(text, search, replacement) {
    const index = String(text).toLocaleLowerCase('vi-VN').indexOf(String(search).toLocaleLowerCase('vi-VN'));
    if (index < 0) return null;
    return `${text.slice(0, index)}${replacement}${text.slice(index + search.length)}`;
}

// Câu lược -> câu đầy đủ. memory.lastQuestion: câu trước (đã thay đại từ); memory.lastFocusText: tên/xưng hô trong câu đó.
function rewriteEllipsis(message, memory) {
    const rest = detectEllipsis(message);
    if (!rest) return null;
    // "Còn con của ông ấy?": phần còn lại tự là một câu hỏi quan hệ.
    if (/(^|\s)(của|cua)(\s|$)/i.test(rest)) return { message: `${rest} là ai?`, kind: 'relation' };
    if (!memory?.lastQuestion || !memory?.lastFocusText) return null;
    const replaced = replaceInsensitive(memory.lastQuestion, memory.lastFocusText, rest);
    return replaced ? { message: replaced, kind: 'substitute' } : null;
}

// Chọn ứng viên khi đang hỏi lại: số thứ tự, "người thứ hai", năm sinh, hoặc tên/mô tả. Trả id hoặc null.
function selectCandidate(message, candidates = []) {
    if (!candidates.length) return null;
    const text = stripDiacritics(message).replace(/[?.,!:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text.split(' ').length > 10) return null;
    const cleaned = text.replace(/^(chon|toi chon|nguoi|la|so)\s+/g, '').replace(/^(nguoi|so)\s+/, '').trim();
    const number = cleaned.match(/^(\d{1,2})$/);
    if (number) return candidates[Number(number[1]) - 1]?.id || null;
    if (SELECTION_ORDINALS.has(cleaned)) return candidates[SELECTION_ORDINALS.get(cleaned) - 1]?.id || null;
    const year = text.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
    if (year) {
        const byYear = candidates.filter((item) => String(item.description || item.birthYear || '').includes(year[1]) || Number(item.birthYear) === Number(year[1]));
        if (byYear.length === 1) return byYear[0].id;
    }
    // Theo từ khóa trong mô tả ("con bà Lê Thị Cúc" -> lê, thị, cúc), bỏ các từ đệm.
    const STOP_WORDS = new Set(['con', 'ba', 'ong', 'cua', 'nguoi', 'chon', 'toi', 'la', 'va', 'cu', 'anh', 'chi', 'em', 'co', 'chu', 'bac', 'sinh', 'doi', 'nam', 'cai']);
    const tokens = text.split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token));
    if (!tokens.length) return null;
    const byText = candidates.filter((item) => {
        const description = stripDiacritics(item.description || item.name || '');
        return tokens.every((token) => new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(description));
    });
    return byText.length === 1 ? byText[0].id : null;
}

// Chữ trong câu dùng để chỉ người được hỏi (để câu lược thay đúng chỗ).
function findFocusText(message, candidates = []) {
    const text = String(message || '');
    const lower = text.toLocaleLowerCase('vi-VN');
    for (const candidate of candidates.filter(Boolean)) {
        const value = String(candidate).trim();
        if (!value) continue;
        const index = lower.indexOf(value.toLocaleLowerCase('vi-VN'));
        if (index >= 0) return text.slice(index, index + value.length);
    }
    return null;
}

module.exports = {
    findPronoun,
    resolvePronounPerson,
    rewritePronoun,
    detectEllipsis,
    rewriteEllipsis,
    selectCandidate,
    findFocusText,
};
