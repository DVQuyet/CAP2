const { cleanHumanName, normalizeText } = require('./memberSearchService');

const CURRENT_USER_WORDS = /(tôi|toi|mình|minh|con|em|cháu|chau|tao|tui)/i;

function stripQuestionNoise(value) {
    return String(value || '')
        .replace(/[?!.]+$/g, '')
        .replace(/^(cho tôi hỏi|toi hoi|hỏi|hoi|xin hỏi|xin hoi)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSynonyms(value) {
    return normalizeText(value)
        .replace(/\b(ba|bo|bo de|ong gia|thay)\b/g, 'cha')
        .replace(/\b(ma|me de|ba gia|bu)\b/g, 'me')
        .replace(/\b(vo)\b/g, 'vo')
        .replace(/\b(chong)\b/g, 'chong')
        .replace(/\s+/g, ' ')
        .trim();
}

function makeNameAlternatives(raw) {
    const cleaned = cleanHumanName(stripQuestionNoise(raw));
    const original = stripQuestionNoise(raw);
    return [...new Set([cleaned, original].filter(Boolean))];
}

function parseCompareRelationship(message) {
    const normalized = normalizeText(message);
    if (!normalized.includes('quan he') || !/\sva\s/.test(normalized)) return null;

    const text = stripQuestionNoise(message);
    const parts = text.split(/\s+và\s+|\s+va\s+/i);
    if (parts.length < 2) return null;

    const left = parts[0].replace(/^(.*?)(nguyễn|tran|trần|le|lê|pham|phạm|hoang|hoàng|huynh|huỳnh|vo|võ|vu|vũ|dang|đặng|bui|bùi|do|đỗ|ngo|ngô|duong|dương)/i, '$2');
    const right = parts.slice(1).join(' và ').replace(/\s+(có|co)\s+quan\s+hệ\s+gì.*$/i, '');

    if (!left.trim() || !right.trim()) return null;
    return {
        intent: 'compare_relationship',
        confidence: 0.9,
        entities: {
            personAName: makeNameAlternatives(left),
            personBName: makeNameAlternatives(right),
        },
    };
}

function parseKinshipLookup(message) {
    const normalized = normalizeSynonyms(message);
    const knownTerms = [
        'ong noi',
        'ba noi',
        'ong ngoai',
        'ba ngoai',
        'ong co',
        'ba co',
        'cu ong',
        'cu ba',
        'cu',
        'cha',
        'bo',
        'ba',
        'me',
        'bac',
        'chu',
        'co',
        'o',
        'cau',
        'di',
        'duong',
        'mo',
        'mu',
        'thim',
        'vo',
        'chong',
    ];

    if (!normalized.startsWith('ai la') && !/(^|\s)la ai($|\s)/.test(normalized)) return null;
    if (!CURRENT_USER_WORDS.test(normalized)) return null;

    const term = knownTerms
        .sort((a, b) => b.length - a.length)
        .find((item) => new RegExp(`(^|\\s)${item}(\\s|$)`).test(normalized));
    if (!term) return null;

    const displayTerm = {
        'ong noi': 'ông nội',
        'ba noi': 'bà nội',
        'ong ngoai': 'ông ngoại',
        'ba ngoai': 'bà ngoại',
        bo: 'cha',
        me: 'mẹ',
        duong: 'dượng',
        mo: 'mợ',
        thim: 'thím',
    }[term] || term;

    return {
        intent: 'find_by_kinship',
        confidence: 0.9,
        entities: {
            kinshipTerm: displayTerm,
        },
    };
}

function parseCallTermQuestion(message) {
    const normalized = normalizeSynonyms(message);
    if (!normalized.includes('goi') && !normalized.includes('xung ho')) return null;
    const targetMatch = stripQuestionNoise(message).match(/(?:gọi|goi|xưng hô|xung ho)\s+(.+?)\s+(?:bằng|bang|là|la)\s+gì/i);
    if (!targetMatch) return null;
    const target = targetMatch[1].replace(/^(người này|nguoi nay)$/i, '').trim();
    return {
        intent: 'find_relationship',
        confidence: 0.78,
        entities: {
            targetName: target ? makeNameAlternatives(target) : [],
            source: target ? 'current_member' : 'selected_person',
        },
    };
}

function parseRelationshipToCurrentUser(message) {
    const text = stripQuestionNoise(message);
    const match = text.match(/^(.+?)\s+là\s+gì\s+của\s+(tôi|mình|con|em|cháu)\??$/i);
    if (!match) return null;
    return {
        intent: 'find_relationship',
        confidence: 0.92,
        entities: {
            targetName: makeNameAlternatives(match[1]),
            source: 'current_member',
        },
    };
}

function parseChildren(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);

    if (!normalized.includes('con')) return null;

    let target = '';
    let match = text.match(/^con\s+của\s+(.+?)\s+(là\s+ai|gồm\s+ai|là\s+những\s+ai)$/i);
    if (match) target = match[1];

    if (!target) {
        match = text.match(/^(.+?)\s+có\s+(mấy\s+)?(người\s+)?con/i);
        if (match) target = match[1];
    }

    if (!target) return null;
    return {
        intent: 'list_children',
        confidence: 0.88,
        entities: {
            targetName: makeNameAlternatives(target),
        },
    };
}

function parseSpouse(message) {
    const text = stripQuestionNoise(message);
    const match = text.match(/^(vợ|chồng|vo|chong)\s+của\s+(.+?)\s+(là\s+ai|tên\s+gì)?$/i);
    if (!match) return null;

    return {
        intent: 'find_spouse',
        confidence: 0.88,
        entities: {
            spouseType: normalizeText(match[1]).includes('chong') ? 'husband' : 'wife',
            targetName: makeNameAlternatives(match[2]),
        },
    };
}

function parseParents(message) {
    const text = stripQuestionNoise(message);
    const match = text.match(/^(cha|bố|ba|ông già|mẹ|má|bà già|cha mẹ|bố mẹ)\s+(?:của\s+)?(.+?)\s+(là\s+ai|tên\s+gì)?$/i);
    if (!match) return null;

    const normalizedType = normalizeText(match[1]);
    return {
        intent: 'find_parents',
        confidence: 0.86,
        entities: {
            parentType: normalizedType.includes('me') || normalizedType.includes('ma')
                ? 'mother'
                : normalizedType.includes('cha me') || normalizedType.includes('bo me')
                    ? 'both'
                    : 'father',
            targetName: makeNameAlternatives(match[2]),
        },
    };
}

function parseGeneration(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    if (!normalized.includes('doi thu') && !normalized.includes('the he') && !normalized.includes('generation')) return null;

    const withoutQuestion = text
        .replace(/\s*(thuộc|thuoc)?\s*(đời|doi|thế hệ|the he)\s*(thứ|thu)?\s*mấy.*$/i, '')
        .replace(/^người\s+này$/i, '')
        .trim();

    return {
        intent: 'find_generation',
        confidence: 0.84,
        entities: {
            targetName: withoutQuestion ? makeNameAlternatives(withoutQuestion) : [],
            source: withoutQuestion ? 'named_person' : 'current_member',
        },
    };
}

function parseSelfIdentity(message) {
    const normalized = normalizeSynonyms(message);
    if (
        normalized === 'toi la ai trong gia pha' ||
        normalized === 'toi la ai' ||
        normalized.includes('toi dang la ai') ||
        normalized.includes('thong tin cua toi')
    ) {
        return {
            intent: 'self_identity',
            confidence: 0.9,
            entities: {},
        };
    }
    return null;
}

function parse(message) {
    const normalizedMessage = stripQuestionNoise(message);
    if (!normalizedMessage) {
        return { intent: 'unknown', confidence: 0, entities: {} };
    }

    const parsers = [
        parseSelfIdentity,
        parseCompareRelationship,
        parseCallTermQuestion,
        parseRelationshipToCurrentUser,
        parseChildren,
        parseSpouse,
        parseParents,
        parseKinshipLookup,
        parseGeneration,
    ];

    for (const parser of parsers) {
        const result = parser(normalizedMessage);
        if (result) return result;
    }

    return {
        intent: 'unknown',
        confidence: 0.25,
        entities: {},
    };
}

module.exports = {
    parse,
};
