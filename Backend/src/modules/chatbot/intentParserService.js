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

function cleanExtractedPersonName(value) {
    return String(value || '')
        .replace(/\b(khong|co khong|trong gia pha|gia pha|trong cay|cay|hien tai|ten)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parsePersonExists(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (/\b(co bao nhieu|bao nhieu|may|so luong|tong so|thong ke|dem)\b/.test(normalized)) return null;
    if (!/\b(co|tim|kiem tra|tra|ton tai)\b/.test(normalized)) return null;
    if (!/\b(gia pha|trong cay|cay|ten)\b/.test(normalized) && !/^co\s+.+\s+khong$/.test(normalized) && !/^tim\s+/.test(normalized)) return null;

    let name = normalized
        .replace(/^trong gia pha co\s+/i, '')
        .replace(/^gia pha co ai ten\s+/i, '')
        .replace(/^gia pha co\s+/i, '')
        .replace(/^trong cay co\s+/i, '')
        .replace(/^cay co\s+/i, '')
        .replace(/^co\s+/i, '')
        .replace(/^tim\s+/i, '')
        .replace(/\s+co trong (gia pha|cay).*$/i, '')
        .replace(/\s+trong (gia pha|cay).*$/i, '')
        .replace(/\s+khong$/i, '')
        .trim();
    name = cleanExtractedPersonName(name);
    if (!name || name.split(/\s+/).length < 2) return null;

    return {
        intent: 'person_exists',
        confidence: 0.9,
        entities: {
            targetName: makeNameAlternatives(name),
            rawName: name,
        },
    };
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
    let normalizedMatch = normalized.match(/^con cua (.+?) (la ai|gom ai|la nhung ai)$/i);
    if (normalizedMatch) target = normalizedMatch[1];
    if (!target) {
        normalizedMatch = normalized.match(/^ai la con cua (.+)$/i);
        if (normalizedMatch) target = normalizedMatch[1];
    }
    let match = text.match(/^con\s+của\s+(.+?)\s+(là\s+ai|gồm\s+ai|là\s+những\s+ai)$/i);
    if (!target && match) target = match[1];

    if (!target) {
        match = text.match(/^(.+?)\s+có\s+(mấy\s+)?(người\s+)?con/i);
        if (match) target = match[1];
    }

    if (!target) {
        normalizedMatch = normalized.match(/^(.+?) co (may )?(nguoi )?con/i);
        if (normalizedMatch) target = normalizedMatch[1];
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
    const normalized = normalizeText(text);
    const normalizedMatch = normalized.match(/^(vo|chong) cua (.+?)( la ai| ten gi)?$/i);
    if (normalizedMatch) {
        return {
            intent: 'find_spouse',
            confidence: 0.88,
            entities: {
                spouseType: normalizedMatch[1] === 'chong' ? 'husband' : 'wife',
                targetName: makeNameAlternatives(normalizedMatch[2]),
            },
        };
    }
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
    const normalized = normalizeText(text);
    const normalizedMatch = normalized.match(/^ai la (cha|bo|ba|me|cha me|bo me) cua (.+)$/i);
    if (normalizedMatch) {
        const parentWord = normalizedMatch[1];
        const parentType = parentWord.includes('me')
            ? (parentWord.includes('cha') || parentWord.includes('bo') ? 'both' : 'mother')
            : 'father';
        return {
            intent: 'find_parents',
            confidence: 0.88,
            entities: {
                parentType,
                targetName: makeNameAlternatives(normalizedMatch[2]),
            },
        };
    }
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

    let withoutQuestion = text
        .replace(/\s*(thuộc|thuoc)?\s*(đời|doi|thế hệ|the he)\s*(thứ|thu)?\s*mấy.*$/i, '')
        .replace(/^người\s+này$/i, '')
        .trim();
    if (normalizeText(withoutQuestion) === normalized) {
        withoutQuestion = normalized
            .replace(/\s*(thuoc\s*)?(doi|the he)\s*(thu\s*)?may.*$/i, '')
            .replace(/^nguoi nay$/i, '')
            .trim();
    }

    return {
        intent: 'find_generation',
        confidence: 0.84,
        entities: {
            targetName: withoutQuestion ? makeNameAlternatives(withoutQuestion) : [],
            source: withoutQuestion ? 'named_person' : 'current_member',
        },
    };
}

function parseStatsCount(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (/\bthuoc\s+(?:doi|the he)\b/.test(normalized) && /\bmay\b/.test(normalized)) return null;
    const asksCount = /\b(co bao nhieu|bao nhieu|may|so luong|tong so|thong ke|dem)\b/.test(normalized);
    const inFamilyScope = /\b(gia pha|dong ho|ho toc|thanh vien|nguoi|doi|the he|chi|nhanh)\b/.test(normalized);
    if (!asksCount || !inFamilyScope) return null;

    const generationMatch = normalized.match(/\b(?:doi|doi thu|the he|the he thu)\s*(?:thu\s*)?(\d{1,3})\b/);
    const generation = generationMatch ? Number(generationMatch[1]) : null;
    const metric = /\b(chi|nhanh)\b/.test(normalized)
        ? 'branch_count'
        : /\b(doi|the he)\b/.test(normalized) && !generation
            ? 'generation_count'
            : 'member_count';

    return {
        intent: 'stats_count',
        confidence: generation ? 0.92 : 0.88,
        entities: {
            metric,
            generation: Number.isFinite(generation) && generation > 0 ? generation : null,
        },
    };
}

function parseClanHistory(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    const asksHistory = /\b(lich su|nguon goc|truyen thong|tu dau|xuat xu|gioi thieu|thong tin|noi ve gi|la gi)\b/.test(normalized);
    const inClanScope = /\b(dong ho|ho toc|gia pha|dong toc|gia pha nay|dong ho nay)\b/.test(normalized);
    if (!asksHistory || !inClanScope) return null;
    return {
        intent: 'clan_history',
        confidence: 0.86,
        entities: {},
    };
}

function parseEventsUpcoming(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    const asksEvent = /\b(su kien|ngay gio|ngay giỗ|lich|sap toi|sap co|sap dien ra|to chuc)\b/.test(normalized);
    const inClanScope = /\b(dong ho|ho toc|gia pha|nha tho|tu duong|le|gio)\b/.test(normalized);
    if (!asksEvent || !inClanScope) return null;
    return {
        intent: 'events_upcoming',
        confidence: 0.84,
        entities: {},
    };
}

function parseMemoriesStories(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (!/\b(ky niem|ki niem|cau chuyen|chuyen xua|hoi uc|gia truyen)\b/.test(normalized)) return null;
    return {
        intent: 'memories_stories',
        confidence: 0.82,
        entities: {},
    };
}

function parsePersonInfo(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    const asksInfo = /\b(thong tin|sinh nam|ngay sinh|nam sinh|que quan|dia chi|tieu su|ghi chu|mat nam|ngay mat)\b/.test(normalized);
    if (!asksInfo) return null;

    let target = text
        .replace(/^(cho\s+tôi\s+biết|cho\s+toi\s+biet|xem|hỏi|hoi)?\s*(thông tin|thong tin)\s+(của|cua|về|ve)?\s*/i, '')
        .replace(/\s+(sinh năm|sinh nam|ngày sinh|ngay sinh|quê quán|que quan|địa chỉ|dia chi|tiểu sử|tieu su|ghi chú|ghi chu|mất năm|mat nam|ngày mất|ngay mat).*$/i, '')
        .trim();
    if (/^(của|cua)\s+/i.test(target)) target = target.replace(/^(của|cua)\s+/i, '').trim();
    if (/^(tôi|toi|mình|minh)$/i.test(normalizeText(target))) target = '';

    return {
        intent: 'person_info',
        confidence: target ? 0.82 : 0.72,
        entities: target ? makeNameAlternatives(target) : [],
    };
}

function parseGeneralChat(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (!/^(chao|xin chao|hello|hi|cam on|thank|thanks|ban la ai|tro ly lam duoc gi)\b/.test(normalized)) return null;
    return {
        intent: 'general_chat',
        confidence: 0.78,
        entities: {},
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
        parseClanHistory,
        parsePersonExists,
        parseCompareRelationship,
        parseCallTermQuestion,
        parseRelationshipToCurrentUser,
        parseChildren,
        parseSpouse,
        parseParents,
        parseKinshipLookup,
        parseStatsCount,
        parseEventsUpcoming,
        parseMemoriesStories,
        parsePersonInfo,
        parseGeneralChat,
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
