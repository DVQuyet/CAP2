// Parser biểu thức quan hệ làm trên chữ CÓ dấu (thay relationshipQueryParser.js khi bật CHATBOT_ACCENT_FIRST).
//   "mẹ của bà tôi"      -> terms ['mẹ', 'bà']   (bà, không phải ba)
//   "mẹ của ba tôi"      -> terms ['mẹ', 'cha']  (ba trong câu có dấu là cha)
//   "me cua ba toi"      -> hai cách đọc: ['mẹ', 'cha'] và ['mẹ', 'bà']; nơi gọi tra gia phả rồi trả lời hoặc hỏi lại
// Kết quả cùng dạng với parser cũ; khác ở chỗ `terms` là key có dấu của lexicon và có thêm `readings`
// khi câu không dấu có từ hai cách đọc trở lên. Hàm thuần.
const { toNFC, stripAll, tokenize } = require('./vietnameseText');
const lexicon = require('./lexicon');
const { EXTRA_PLAIN_READINGS } = require('./lexicon/kinship');
const { SELF, SELF_BY_ROLE } = require('./lexicon/groups');
const { edgesFor } = require('./lexicon/kinshipEdges');
const { pattern } = require('./pattern');

const MAX_READINGS = 8;
const PUNCTUATION = /[?!.:,;()[\]{}"'“”/]/g;
const LEADING = pattern('^(?:ai là|cho tôi hỏi|tôi hỏi|xin hỏi|hỏi) ');
const TRAILING = [
    pattern(' (?:là ai|tên gì|tên là gì|gồm ai|là những ai|gồm những ai|có những ai)$'),
    pattern(' (?:gọi tôi là gì|gọi tôi bằng gì)$'),
    pattern(' là gì (?:của|với) (?:tôi|mình)$'),
];
const NAMED_LEADING = pattern('^(?:cho (?:tôi|mình) hỏi|cho hỏi|ai là|hãy cho biết) ');
const NAMED_TRAILING = pattern(' (?:là ai|tên (?:là )?gì|là những ai|gồm (?:những )?ai|có những ai|là người nào)$');
const NAMED_SPLIT = pattern('^(?<relation>.*\\S) của (?<name>.+)$');
// Đứng trước tên người: "ông Lâm", "anh Nam" là cách gọi; "bác Hai", "chú Út" là quan hệ với người hỏi.
const NAME_HONORIFIC = pattern('^(?:ông|bà|anh|chị|cụ) (?=\\S)');
const KINSHIP_PREFIX = pattern('^(?:bác|chú|cô|cậu|dì|mợ|thím|dượng) ');

const SELF_WORDS = [...SELF, ...SELF_BY_ROLE];
const BASE_WORDS = { accented: new Set(SELF_WORDS), plain: new Set(SELF_WORDS.map(stripAll)) };
// "ông cô", "bà chú", "cụ cô": ông/bà/cụ đứng liền trước một xưng hô khác (không có "của") là một cách gọi ghép
// ngoài bảng từ, không phải "ông của cô". Không đoán nghĩa của cụm đó.
const TITLE_KEYS = new Set(['ông', 'bà', 'cụ']);
// "ba" trong câu có dấu là cha (miền Nam, miền Trung); "bà" là một từ khác.
const EXTRA_ACCENTED = new Map(EXTRA_PLAIN_READINGS.map(([form, key]) => [form, [key]]));

// Câu chỉ mang dấu ở tên riêng ("bo cua Đinh Viết Lâm") vẫn là câu không dấu.
function questionMode(text) {
    const tokens = tokenize(text);
    const isName = (token, index) => token.capitalised && (index > 0 || Boolean(tokens[1]?.capitalised));
    return tokens.some((token, index) => token.hasMark && !isName(token, index)) ? 'accented' : 'plain';
}

const cleanSpaces = (text) => text.replace(/\s+/g, ' ').trim();
// Chữ thường, bỏ dấu câu; câu không dấu thì đưa cả câu về không dấu (tên riêng có dấu lẫn trong câu cũng vậy).
function canonical(text, mode) {
    const lower = cleanSpaces(toNFC(text).toLowerCase().replace(PUNCTUATION, ' '));
    return mode === 'plain' ? stripAll(lower) : lower;
}
const matchEither = (compiled, text) => compiled.match(text, 'accented') || compiled.match(text, 'plain');

function stripQuestionIntent(text, mode) {
    let result = text;
    const lead = LEADING.match(result, mode);
    if (lead) result = result.slice(lead.end);
    for (const tail of TRAILING) {
        const found = tail.match(result, mode);
        if (found) result = result.slice(0, found.start);
    }
    return result.trim();
}

// Tách lần lượt các từ xưng hô (cụm dài trước), bỏ "của". Trả { ok, terms: [{ text, keys }] }.
function parseRelationshipTerms(fragment, mode = questionMode(fragment)) {
    const { index, lengths } = mode === 'plain' ? lexicon.plainIndex : lexicon.accentedIndex;
    const linker = mode === 'plain' ? 'cua' : 'của';
    const tokens = String(fragment || '').split(' ').filter(Boolean);
    const terms = [];
    let cursor = 0;
    let linked = true;
    while (cursor < tokens.length) {
        if (tokens[cursor] === linker) {
            cursor += 1;
            linked = true;
            continue;
        }
        const phraseAt = (length) => tokens.slice(cursor, cursor + length).join(' ');
        const length = lengths.find((size) => cursor + size <= tokens.length && index.has(phraseAt(size)));
        const text = phraseAt(length || 1);
        const keys = length ? index.get(text) : (mode === 'accented' && EXTRA_ACCENTED.get(text)) || null;
        if (!keys) return { ok: false, terms, failedAt: tokens[cursor] };
        terms.push({ text, keys, joined: !linked });
        linked = false;
        cursor += length || 1;
    }
    return { ok: true, terms };
}

// Mỗi cách đọc: { terms: [key theo thứ tự trong câu], chain: [cạnh từ người gốc ra], label }.
function buildReadings(terms) {
    let combos = [[]];
    for (const term of terms) {
        combos = combos
            .flatMap((combo) => term.keys.map((key) => [...combo, { key, form: term.keys.length === 1 ? term.text : key, joined: term.joined }]))
            .slice(0, MAX_READINGS);
    }
    const compoundTitle = (combo) => combo.some((item, index) => item.joined && TITLE_KEYS.has(combo[index - 1].key));
    return combos.filter((combo) => !compoundTitle(combo)).map((combo) => {
        const edges = combo.map((item) => edgesFor(item.key, item.form));
        return {
            terms: combo.map((item) => item.key),
            // Thiếu cạnh của một từ thì bỏ cả đường dự phòng: đi nửa đường sẽ ra nhầm người.
            chain: edges.every(Boolean) ? edges.slice().reverse().flat() : [],
            label: combo.map((item) => item.key).join(' của '),
        };
    });
}

const withReadings = (readings) => ({
    chain: readings[0].chain,
    terms: readings[0].terms,
    ...(readings.length > 1 ? { readings } : {}),
});

function unsupported(originalText, normalizedText, reason = 'unsupported_relationship_expression') {
    return {
        type: 'relationship_expression',
        originalText,
        normalizedText,
        base: null,
        chain: [],
        terms: [],
        needsClarification: true,
        reason,
        confidence: 0,
    };
}

// "<quan hệ> của tôi": người gốc là người hỏi.
function parseRelationshipExpression(text) {
    const originalText = String(text || '');
    const mode = questionMode(originalText);
    const normalizedText = canonical(originalText, mode);
    const expressionText = stripQuestionIntent(normalizedText, mode);
    if (!expressionText) return unsupported(originalText, normalizedText);

    const tokens = expressionText.split(' ');
    const baseIndex = tokens.findLastIndex((token) => BASE_WORDS[mode].has(token));
    if (baseIndex < 0) return unsupported(originalText, normalizedText, 'missing_base_person');
    const beforeBase = tokens.slice(0, baseIndex).join(' ');
    if (!beforeBase) return unsupported(originalText, normalizedText, 'missing_relationship_terms');

    const parsed = parseRelationshipTerms(beforeBase, mode);
    const readings = parsed.ok && parsed.terms.length ? buildReadings(parsed.terms) : [];
    if (!readings.length) return unsupported(originalText, normalizedText);

    return {
        type: 'relationship_expression',
        originalText,
        normalizedText,
        base: 'me',
        ...withReadings(readings),
        needsClarification: false,
        confidence: mode === 'plain' ? 0.78 : 0.82,
    };
}

// "<quan hệ> của <tên người>". Trả null nếu câu không có dạng này hoặc người cuối là "tôi".
function parseNamedRelationshipExpression(text) {
    const originalText = toNFC(text).trim();
    const mode = questionMode(originalText);
    let stripped = cleanSpaces(originalText.replace(/[?!.,;:]+/g, ' '));
    const lead = NAMED_LEADING.match(stripped, mode);
    if (lead) stripped = stripped.slice(lead.end);
    const tail = NAMED_TRAILING.match(stripped, mode);
    if (tail) stripped = stripped.slice(0, tail.start).trim();
    const split = NAMED_SPLIT.match(stripped, mode);
    if (!split) return null;

    let personName = split.groups.name.trim();
    if (matchEither(KINSHIP_PREFIX, `${personName} `) && personName.split(' ').length <= 2) return null;
    const honorific = matchEither(NAME_HONORIFIC, personName);
    if (honorific) personName = personName.slice(honorific.end).trim();
    const nameWords = canonical(personName, 'plain').split(' ').filter(Boolean);
    if (!nameWords.length || nameWords.every((word) => BASE_WORDS.plain.has(word))) return null;

    const relation = split.groups.relation.trim();
    const parsed = parseRelationshipTerms(stripQuestionIntent(canonical(relation, mode), mode), mode);
    const readings = parsed.ok && parsed.terms.length ? buildReadings(parsed.terms) : [];
    if (!readings.length) return null;

    return {
        type: 'named_relationship_expression',
        originalText,
        personName,
        originalTerms: relation,
        base: 'named',
        ...withReadings(readings),
        needsClarification: false,
        confidence: mode === 'plain' ? 0.8 : 0.84,
    };
}

module.exports = {
    questionMode,
    parseRelationshipTerms,
    parseRelationshipExpression,
    parseNamedRelationshipExpression,
};
