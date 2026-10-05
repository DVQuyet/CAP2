const BASE_TERMS = new Set(['toi', 'minh', 'em', 'con', 'chau']);

// Xưng hô theo cách dùng phổ biến. Những từ không phân biệt được (bác, cậu, cô, dì)
// dùng cạnh chung để trả về mọi người khớp rồi hỏi lại, thay vì đoán sai một người.
const TERM_EDGE_MAP = new Map([
    ['cha', ['father']],
    ['bo', ['father']],
    ['ba', ['father']],
    ['me', ['mother']],
    ['ma', ['mother']],
    ['bo me', ['parent']],
    ['cha me', ['parent']],
    ['vo', ['spouse']],
    ['chong', ['spouse']],
    ['vo chong', ['spouse']],
    ['ong noi', ['father', 'father']],
    ['ba noi', ['father', 'mother']],
    ['ong ngoai', ['mother', 'father']],
    ['ba ngoai', ['mother', 'mother']],
    ['anh trai', ['older_brother']],
    ['chi gai', ['older_sister']],
    ['em trai', ['younger_brother']],
    ['em gai', ['younger_sister']],
    ['anh', ['older_brother']],
    ['chi', ['older_sister']],
    ['em', ['younger_sibling']],
    ['anh chi em', ['sibling']],
    ['anh em', ['sibling']],
    // Anh/chị/em của cha hoặc mẹ.
    ['bac', ['parent', 'older_sibling']],
    ['bac trai', ['parent', 'older_brother']],
    ['bac gai', ['parent', 'older_sister']],
    ['chu', ['father', 'younger_brother']],
    ['co', ['father', 'sister']],
    ['cau', ['mother', 'brother']],
    ['di', ['mother', 'sister']],
    ['thim', ['father', 'younger_brother', 'spouse']],
    ['mo', ['mother', 'brother', 'spouse']],
    // Con của anh chị em cha mẹ, theo vai: con nhà bác (anh/chị của cha mẹ) là anh/chị họ,
    // con nhà chú/cô/cậu/dì (em của cha mẹ) là em họ - không xét tuổi.
    ['anh ho', ['parent', 'older_sibling', 'son']],
    ['chi ho', ['parent', 'older_sibling', 'daughter']],
    ['em ho', ['parent', 'younger_sibling', 'child']],
    ['anh chi em ho', ['parent', 'sibling', 'child']],
    // Nhà chồng / nhà vợ, dâu rể.
    // "bố/ba" đã được chuẩn hóa thành "cha".
    ['cha chong', ['spouse', 'father']],
    ['me chong', ['spouse', 'mother']],
    ['cha vo', ['spouse', 'father']],
    ['me vo', ['spouse', 'mother']],
    ['con dau', ['son', 'spouse']],
    ['con re', ['daughter', 'spouse']],
    ['con trai', ['son']],
    ['con gai', ['daughter']],
    ['con', ['child']],
    ['chau noi', ['son', 'child']],
    ['chau ngoai', ['daughter', 'child']],
    ['chau', ['child', 'child']],
]);

const SORTED_TERMS = [...TERM_EDGE_MAP.keys()].sort((a, b) => b.split(' ').length - a.split(' ').length);

function stripDiacritics(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function normalizeRelationshipQuery(text) {
    return stripDiacritics(text)
        .toLowerCase()
        .replace(/[?!.:,;()[\]{}"']/g, ' ')
        .replace(/\//g, ' ')
        .replace(/\b(bo|ba)(?!\s+(noi|ngoai))\b/g, 'cha')
        .replace(/\b(má|ma)\b/g, 'me')
        .replace(/\s+/g, ' ')
        .trim();
}

function relationshipTermToEdges(term) {
    const normalized = normalizeRelationshipQuery(term);
    return TERM_EDGE_MAP.get(normalized) || null;
}

function stripQuestionIntent(text) {
    return text
        .replace(/^(ai la|cho toi hoi|toi hoi|xin hoi|hoi)\s+/g, '')
        .replace(/\s+(la ai|ten gi|ten la gi|gom ai|la nhung ai|gom nhung ai|co nhung ai)$/g, '')
        .replace(/\s+(goi toi la gi|goi toi bang gi)$/g, '')
        .replace(/\s+la gi (cua|voi) (toi|minh)$/g, '')
        .trim();
}

function findBase(tokens) {
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
        if (BASE_TERMS.has(tokens[index])) return { index, token: tokens[index] };
    }
    return null;
}

function parseRelationshipTerms(text) {
    const tokens = text.split(/\s+/).filter(Boolean);
    const terms = [];
    let cursor = 0;

    while (cursor < tokens.length) {
        if (tokens[cursor] === 'cua') {
            cursor += 1;
            continue;
        }

        let matched = null;
        for (const term of SORTED_TERMS) {
            const termTokens = term.split(' ');
            const slice = tokens.slice(cursor, cursor + termTokens.length).join(' ');
            if (slice === term) {
                matched = term;
                break;
            }
        }

        if (!matched) {
            return { ok: false, terms, failedAt: tokens[cursor] };
        }

        terms.push(matched);
        cursor += matched.split(' ').length;
    }

    return { ok: true, terms };
}

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

// Tiền tố xưng hô trước tên người ("ông Lâm", "anh Nam"). Không bỏ bác/chú/cô/cậu/dì vì đó là quan hệ với "tôi".
const NAME_HONORIFIC_PATTERN = /^(ông|ong|bà|ba|anh|chị|chi|cụ|cu)\s+(?=\S)/i;
const KINSHIP_PREFIX_PATTERN = /^(bác|bac|chú|chu|cô|co|cậu|cau|dì|di|mợ|mo|thím|thim|dượng|duong)\s/i;

// "<quan hệ> của <tên người>" ("cha của Đinh Viết Lâm", "mẹ của vợ của Nguyễn Văn An", "con trai của ông Lâm").
// Trả null nếu câu không có dạng này hoặc người cuối là "tôi" (luồng parseRelationshipExpression xử lý).
function parseNamedRelationshipExpression(text) {
    const originalText = String(text || '').trim();
    const stripped = originalText
        .replace(/[?!.,;:]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(cho\s+(tôi|toi|mình|minh)\s+hỏi|cho\s+hoi|ai\s+là|ai\s+la|hãy\s+cho\s+biết|hay\s+cho\s+biet)\s+/i, '')
        .replace(/\s+(là\s+ai|la\s+ai|tên\s+(là\s+)?gì|ten\s+(la\s+)?gi|là\s+những\s+ai|la\s+nhung\s+ai|gồm\s+(những\s+)?ai|gom\s+(nhung\s+)?ai|có\s+những\s+ai|co\s+nhung\s+ai|là\s+người\s+nào|la\s+nguoi\s+nao)$/i, '')
        .trim();
    const match = stripped.match(/^(.*\S)\s+(?:của|cua)\s+(.+)$/i);
    if (!match) return null;

    let personName = match[2].trim();
    if (KINSHIP_PREFIX_PATTERN.test(`${personName} `) && personName.split(/\s+/).length <= 2) return null;
    personName = personName.replace(NAME_HONORIFIC_PATTERN, '').trim();
    const normalizedName = normalizeRelationshipQuery(personName);
    if (!personName || BASE_TERMS.has(normalizedName) || normalizedName.split(' ').every((token) => BASE_TERMS.has(token))) {
        return null;
    }

    const relationText = stripQuestionIntent(normalizeRelationshipQuery(match[1]));
    const parsedTerms = parseRelationshipTerms(relationText);
    if (!parsedTerms.ok || !parsedTerms.terms.length) return null;
    const chain = parsedTerms.terms
        .slice()
        .reverse()
        .flatMap((term) => relationshipTermToEdges(term) || []);
    if (!chain.length) return null;

    return {
        type: 'named_relationship_expression',
        originalText,
        personName,
        originalTerms: match[1].trim().replace(/^(ai\s+là|ai\s+la)\s+/i, ''),
        base: 'named',
        chain,
        terms: parsedTerms.terms,
        needsClarification: false,
        confidence: 0.84,
    };
}

function parseRelationshipExpression(text) {
    const originalText = String(text || '');
    const normalizedText = normalizeRelationshipQuery(originalText);
    const expressionText = stripQuestionIntent(normalizedText);
    if (!expressionText) return unsupported(originalText, normalizedText);

    const tokens = expressionText.split(/\s+/).filter(Boolean);
    const base = findBase(tokens);
    if (!base) return unsupported(originalText, normalizedText, 'missing_base_person');

    const beforeBase = tokens.slice(0, base.index).join(' ').trim();
    if (!beforeBase) return unsupported(originalText, normalizedText, 'missing_relationship_terms');

    const parsedTerms = parseRelationshipTerms(beforeBase);
    if (!parsedTerms.ok || !parsedTerms.terms.length) {
        return unsupported(originalText, normalizedText);
    }

    const chain = parsedTerms.terms
        .slice()
        .reverse()
        .flatMap((term) => relationshipTermToEdges(term) || []);

    if (!chain.length) return unsupported(originalText, normalizedText);

    return {
        type: 'relationship_expression',
        originalText,
        normalizedText,
        base: 'me',
        chain,
        terms: parsedTerms.terms,
        needsClarification: false,
        confidence: 0.82,
    };
}

module.exports = {
    normalizeRelationshipQuery,
    relationshipTermToEdges,
    parseRelationshipTerms,
    parseRelationshipExpression,
    parseNamedRelationshipExpression,
};
