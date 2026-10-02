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
    // Con của anh chị em cha mẹ (anh/chị/em họ), chưa xét thứ bậc theo vai cha mẹ.
    ['anh ho', ['parent', 'sibling', 'son']],
    ['chi ho', ['parent', 'sibling', 'daughter']],
    ['em ho', ['parent', 'sibling', 'child']],
    ['anh chi em ho', ['parent', 'sibling', 'child']],
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
};
