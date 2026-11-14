// Nhận diện từ xưng hô trong câu hỏi ("bà nội", "ông chú", "em họ"...) và so với nhãn quan hệ
// do describeKinship (genealogy/core) sinh ra — cùng nguồn với câu "X là gì của tôi".
//
// Làm trên chữ CÓ dấu. Chỉ khi người dùng gõ không dấu mới tra bảng cụm không dấu; cụm còn mơ hồ
// ("ba toi": ba = bố hay bà?) thì trả danh sách khả năng để hỏi lại thay vì đoán.

// Bảng từ nằm ở text/lexicon/kinship.js; dạng không dấu và bảng mơ hồ do text/lexicon tự sinh.
const { stripAll, toNFC, hasVietnameseMarks } = require('./text/vietnameseText');
const lexicon = require('./text/lexicon');

const { KINSHIP_TERMS, accentedIndex: ACCENTED_INDEX, plainIndex: PLAIN_INDEX } = lexicon;
const stripDiacritics = stripAll;
const hasVietnameseDiacritics = hasVietnameseMarks;

// Chữ thường, NFC, bỏ dấu câu; giữ dấu tiếng Việt.
function normalizeAccented(value) {
    return toNFC(value)
        .toLowerCase()
        .replace(/[?!.:,;()[\]{}"'“”]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Tách lần lượt các từ xưng hô trong đoạn văn (khớp cụm dài trước). Từ không phải xưng hô làm hỏng việc tách.
// Trả về { terms: [{ keys, text }], rest: [các từ không nhận ra] }.
function splitKinshipTerms(fragment) {
    const accented = hasVietnameseDiacritics(fragment);
    const text = accented ? normalizeAccented(fragment) : stripDiacritics(normalizeAccented(fragment));
    const { index, lengths } = accented ? ACCENTED_INDEX : PLAIN_INDEX;
    const tokens = text.split(' ').filter(Boolean);
    const terms = [];
    const rest = [];
    let cursor = 0;
    while (cursor < tokens.length) {
        if (tokens[cursor] === 'của' || tokens[cursor] === 'cua') {
            cursor += 1;
            continue;
        }
        let matched = null;
        for (const length of lengths) {
            const phrase = tokens.slice(cursor, cursor + length).join(' ');
            if (index.has(phrase)) {
                matched = { keys: index.get(phrase), text: phrase, length };
                break;
            }
        }
        if (!matched) {
            rest.push(tokens[cursor]);
            cursor += 1;
            continue;
        }
        // "chú ruột", "anh ruột": chỉ lấy họ hàng ruột, bỏ nhánh họ.
        terms.push({ keys: matched.keys, text: matched.text, strict: /(^|\s)(ruột|ruot)(\s|$)/.test(matched.text) });
        cursor += matched.length;
    }
    return { terms, rest, accented };
}

// Từ xưng hô không dấu (kết quả relationshipQueryParser: "em trai", "ong noi", "cha") -> key có dấu, hoặc null.
function plainTermToKey(term) {
    const keys = PLAIN_INDEX.index.get(String(term || '').trim());
    return keys && keys.length === 1 ? keys[0] : null;
}

const { getKinshipTerm } = lexicon;

// Nhãn describeKinship có thể là "chú", "chú họ", "bà kế (vợ sau của ông nội)", "bác/chú" (chưa rõ thứ bậc).
function labelAlternatives(label) {
    // Bỏ phần mô tả thêm không đổi cách gọi: "(vợ sau của ông nội)", "cùng cha khác mẹ".
    const clean = normalizeAccented(String(label || '').replace(/\(.*?\)/g, ' '))
        .replace(/\s+(cùng cha khác mẹ|cùng mẹ khác cha)$/, '');
    if (!clean) return [];
    const parts = clean.split('/').map((part) => part.trim()).filter(Boolean);
    // "bác/chú họ": hậu tố "họ" của phần cuối áp cho mọi phần.
    const last = parts[parts.length - 1] || '';
    const suffix = last.match(/\s(họ)$/) ? ' họ' : '';
    return parts.map((part, index) => (suffix && index < parts.length - 1 && !part.endsWith(' họ') ? `${part}${suffix}` : part));
}

// So một kết quả describeKinship với một từ xưng hô. Trả null nếu không khớp,
// hoặc { label, uncertain } (uncertain = nhãn còn nhiều khả năng, vd "bác/chú").
function matchKinshipLabel(structural, termKey) {
    const entry = getKinshipTerm(termKey);
    if (!entry || !structural?.label) return null;
    const alternatives = labelAlternatives(structural.label);
    const uncertain = alternatives.length > 1;

    if (entry.categories) {
        return entry.categories.includes(structural.category) ? { label: structural.label, uncertain } : null;
    }
    const accepted = entry.labels || [entry.key];
    const qualifiers = entry.qualifiers || [];
    const hit = alternatives.some((alternative) => accepted.some((base) => {
        if (alternative === base) return true;
        if (!alternative.startsWith(`${base} `)) return false;
        return alternative.slice(base.length + 1).split(' ').every((word) => qualifiers.includes(word));
    }));
    return hit ? { label: structural.label, uncertain } : null;
}

module.exports = {
    KINSHIP_TERMS,
    getKinshipTerm,
    plainTermToKey,
    splitKinshipTerms,
    matchKinshipLabel,
    hasVietnameseDiacritics,
    normalizeAccented,
    stripDiacritics,
};
