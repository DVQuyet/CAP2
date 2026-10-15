// Nhận diện từ xưng hô trong câu hỏi ("bà nội", "ông chú", "em họ"...) và so với nhãn quan hệ
// do describeKinship (genealogy/core) sinh ra — cùng nguồn với câu "X là gì của tôi".
//
// Làm trên chữ CÓ dấu. Chỉ khi người dùng gõ không dấu mới tra bảng cụm không dấu; cụm còn mơ hồ
// ("ba toi": ba = bố hay bà?) thì trả danh sách khả năng để hỏi lại thay vì đoán.

const KINSHIP_TERMS = [
    // Cha mẹ
    { key: 'cha', words: ['cha', 'bố', 'tía', 'thầy', 'cha ruột', 'bố ruột'], plain: ['cha', 'bo', 'tia', 'cha ruot', 'bo ruot'] },
    { key: 'mẹ', words: ['mẹ', 'má', 'bầm', 'mạ', 'mẹ ruột'], plain: ['me', 'bam', 'me ruot'] },
    { key: 'cha mẹ', words: ['cha mẹ', 'bố mẹ', 'ba mẹ', 'ba má'], plain: ['cha me', 'bo me', 'ba me', 'ba ma'], labels: ['cha', 'mẹ'] },
    // Ông bà, cụ, kỵ
    { key: 'ông nội', words: ['ông nội'], plain: ['ong noi'] },
    { key: 'bà nội', words: ['bà nội'], plain: ['ba noi'] },
    { key: 'ông ngoại', words: ['ông ngoại'], plain: ['ong ngoai'] },
    { key: 'bà ngoại', words: ['bà ngoại'], plain: ['ba ngoai'] },
    { key: 'ông bà', words: ['ông bà', 'ông bà nội ngoại'], plain: ['ong ba'], labels: ['ông nội', 'bà nội', 'ông ngoại', 'bà ngoại'] },
    { key: 'ông bà nội', words: ['ông bà nội'], plain: ['ong ba noi'], labels: ['ông nội', 'bà nội'] },
    { key: 'ông bà ngoại', words: ['ông bà ngoại'], plain: ['ong ba ngoai'], labels: ['ông ngoại', 'bà ngoại'] },
    { key: 'ông', words: ['ông'], plain: ['ong'], qualifiers: ['nội', 'ngoại'] },
    { key: 'bà', words: ['bà'], plain: [], qualifiers: ['nội', 'ngoại'] },
    { key: 'cụ nội', words: ['cụ nội', 'cố nội', 'cụ ông nội', 'cụ bà nội'], plain: ['cu noi', 'co noi'] },
    { key: 'cụ ngoại', words: ['cụ ngoại', 'cố ngoại'], plain: ['cu ngoai', 'co ngoai'] },
    { key: 'cụ', words: ['cụ', 'cố', 'cụ ông', 'cụ bà', 'cụ tổ'], plain: ['cu', 'cu ong', 'cu ba'], qualifiers: ['nội', 'ngoại'] },
    { key: 'kỵ', words: ['kỵ', 'kị', 'sơ'], plain: ['ky'], qualifiers: ['nội', 'ngoại'] },
    // Anh chị em của ông bà
    { key: 'ông chú', words: ['ông chú'], plain: ['ong chu'], qualifiers: ['họ'] },
    { key: 'ông bác', words: ['ông bác'], plain: ['ong bac'], qualifiers: ['họ'] },
    { key: 'ông cậu', words: ['ông cậu'], plain: ['ong cau'], qualifiers: ['họ'] },
    { key: 'bà cô', words: ['bà cô'], plain: ['ba co'], qualifiers: ['họ'] },
    { key: 'bà bác', words: ['bà bác'], plain: ['ba bac'], qualifiers: ['họ'] },
    { key: 'bà dì', words: ['bà dì'], plain: ['ba di'], qualifiers: ['họ'] },
    { key: 'ông trẻ', words: ['ông trẻ'], plain: ['ong tre'], labels: ['ông chú', 'ông cậu'] },
    { key: 'bà trẻ', words: ['bà trẻ'], plain: ['ba tre'], labels: ['bà cô', 'bà dì'] },
    // Anh chị em của cha mẹ và vợ/chồng họ
    { key: 'bác', words: ['bác', 'bác ruột', 'bác trai', 'bác gái'], plain: ['bac', 'bac ruot', 'bac trai', 'bac gai'], qualifiers: ['họ', 'trai', 'gái', 'ruột'] },
    { key: 'chú', words: ['chú', 'chú ruột'], plain: ['chu', 'chu ruot'], qualifiers: ['họ', 'ruột'] },
    { key: 'cô', words: ['cô', 'cô ruột', 'o'], plain: ['co', 'co ruot'], qualifiers: ['họ', 'ruột'] },
    { key: 'cậu', words: ['cậu', 'cậu ruột'], plain: ['cau', 'cau ruot'], qualifiers: ['họ', 'ruột'] },
    { key: 'dì', words: ['dì', 'dì ruột'], plain: ['di', 'di ruot'], qualifiers: ['họ', 'ruột'] },
    { key: 'thím', words: ['thím'], plain: ['thim'], qualifiers: ['họ'] },
    { key: 'mợ', words: ['mợ'], plain: ['mo'], qualifiers: ['họ'] },
    { key: 'dượng', words: ['dượng'], plain: ['duong'], qualifiers: ['họ'] },
    { key: 'chú họ', words: ['chú họ'], plain: ['chu ho'] },
    { key: 'bác họ', words: ['bác họ'], plain: ['bac ho'] },
    { key: 'cô họ', words: ['cô họ'], plain: ['co ho'] },
    { key: 'cậu họ', words: ['cậu họ'], plain: ['cau ho'] },
    { key: 'dì họ', words: ['dì họ'], plain: ['di ho'] },
    // Anh chị em
    { key: 'anh chị em', words: ['anh chị em', 'anh chị em ruột', 'anh em', 'chị em', 'anh em ruột'], plain: ['anh chi em', 'anh chi em ruot', 'anh em', 'chi em', 'anh em ruot'], categories: ['sibling'] },
    { key: 'anh trai', words: ['anh trai', 'anh ruột'], plain: ['anh trai', 'anh ruot'] },
    { key: 'chị gái', words: ['chị gái', 'chị ruột'], plain: ['chi gai', 'chi ruot'] },
    { key: 'em trai', words: ['em trai'], plain: ['em trai'] },
    { key: 'em gái', words: ['em gái'], plain: ['em gai'] },
    { key: 'anh', words: ['anh'], plain: ['anh'], qualifiers: ['trai', 'ruột'] },
    { key: 'chị', words: ['chị'], plain: [], qualifiers: ['gái', 'ruột'] },
    { key: 'em', words: ['em', 'em ruột'], plain: ['em', 'em ruot'], qualifiers: ['trai', 'gái', 'ruột'] },
    // Anh chị em họ
    { key: 'anh chị em họ', words: ['anh chị em họ', 'anh em họ', 'chị em họ'], plain: ['anh chi em ho', 'anh em ho', 'chi em ho'], categories: ['cousin'] },
    { key: 'anh họ', words: ['anh họ'], plain: ['anh ho'] },
    { key: 'chị họ', words: ['chị họ'], plain: ['chi ho'] },
    { key: 'em họ', words: ['em họ'], plain: ['em ho'] },
    // Vợ chồng, con cháu
    { key: 'vợ', words: ['vợ'], plain: ['vo'] },
    { key: 'chồng', words: ['chồng'], plain: ['chong'] },
    { key: 'con', words: ['con', 'con cái', 'con ruột'], plain: ['con', 'con cai', 'con ruot'], qualifiers: ['trai', 'gái', 'nuôi', 'ruột'] },
    { key: 'con trai', words: ['con trai'], plain: ['con trai'] },
    { key: 'con gái', words: ['con gái'], plain: ['con gai'] },
    { key: 'con dâu', words: ['con dâu'], plain: ['con dau'] },
    { key: 'con rể', words: ['con rể'], plain: ['con re'] },
    { key: 'cháu', words: ['cháu'], plain: ['chau'], qualifiers: ['nội', 'ngoại', 'họ', 'trai', 'gái'] },
    { key: 'cháu nội', words: ['cháu nội'], plain: ['chau noi'] },
    { key: 'cháu ngoại', words: ['cháu ngoại'], plain: ['chau ngoai'] },
    { key: 'chắt', words: ['chắt'], plain: ['chat'], qualifiers: ['nội', 'ngoại', 'họ'] },
    // Dâu rể, nhà chồng/vợ
    { key: 'chị dâu', words: ['chị dâu'], plain: ['chi dau'] },
    { key: 'em dâu', words: ['em dâu'], plain: ['em dau'] },
    { key: 'anh rể', words: ['anh rể'], plain: ['anh re'] },
    { key: 'em rể', words: ['em rể'], plain: ['em re'] },
    { key: 'cha chồng', words: ['cha chồng', 'bố chồng'], plain: ['cha chong', 'bo chong'], labels: ['cha chồng', 'bố chồng'] },
    { key: 'mẹ chồng', words: ['mẹ chồng'], plain: ['me chong'] },
    { key: 'cha vợ', words: ['cha vợ', 'bố vợ'], plain: ['cha vo', 'bo vo'], labels: ['cha vợ', 'bố vợ'] },
    { key: 'mẹ vợ', words: ['mẹ vợ'], plain: ['me vo'] },
];

// Cụm không dấu có thể là hai từ khác nhau: hỏi lại thay vì đoán.
const AMBIGUOUS_PLAIN = new Map([
    ['ba', ['cha', 'bà']],
]);

const TERM_BY_KEY = new Map(KINSHIP_TERMS.map((entry) => [entry.key, entry]));

function stripDiacritics(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

// Chữ thường, NFC, bỏ dấu câu; giữ dấu tiếng Việt.
function normalizeAccented(value) {
    return String(value || '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[?!.:,;()[\]{}"'“”]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasVietnameseDiacritics(value) {
    const text = normalizeAccented(value);
    return text !== stripDiacritics(text);
}

// Bảng tra: chuỗi cụm (có dấu hoặc không dấu) -> danh sách key. Sắp theo số chữ giảm dần để khớp cụm dài trước.
function buildPhraseIndex(accented) {
    const index = new Map();
    const add = (phrase, key) => {
        const list = index.get(phrase) || [];
        if (!list.includes(key)) list.push(key);
        index.set(phrase, list);
    };
    for (const entry of KINSHIP_TERMS) {
        if (accented) entry.words.forEach((word) => add(word, entry.key));
        else entry.plain.forEach((word) => add(word, entry.key));
    }
    if (!accented) {
        for (const [phrase, keys] of AMBIGUOUS_PLAIN) keys.forEach((key) => add(phrase, key));
    }
    return {
        index,
        lengths: [...new Set([...index.keys()].map((phrase) => phrase.split(' ').length))].sort((a, b) => b - a),
    };
}

const ACCENTED_INDEX = buildPhraseIndex(true);
const PLAIN_INDEX = buildPhraseIndex(false);

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

function getKinshipTerm(key) {
    return TERM_BY_KEY.get(key) || null;
}

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
