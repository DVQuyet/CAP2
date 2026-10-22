const { cleanHumanName, normalizeText } = require('./memberSearchService');
const { splitKinshipTerms, normalizeAccented } = require('./kinshipTermService');

const SELF_WORD_PATTERN = '(?:tôi|toi|mình|minh|tui|tớ)';
const CLAN_SUBJECTS = new Set(['dong ho', 'ho', 'gia pha', 'ho toc', 'dong toc', 'ca ho', 'dong ho minh', 'ho minh', 'dong ho nay', 'ho nay', 'gia pha nay', 'dong ho toi', 'ho toi']);
const TITLE_WORDS = /^(ông|bà|anh|chị|em|cô|chú|bác|cậu|dì|cháu|cụ|ong|ba|chi|co|chu|bac|cau|di|chau|cu)\s+/i;

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
    const original = stripQuestionNoise(raw);
    const cleaned = cleanHumanName(original);
    // "ông Bình", "bà Lan": thêm tên không kèm danh xưng để tìm được người có tên đầy đủ.
    const withoutTitle = original.replace(TITLE_WORDS, '').trim();
    return [...new Set([cleaned, original, withoutTitle].filter(Boolean))];
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
    // Câu hỏi về kỷ niệm/sự kiện/lịch không phải tra tên người.
    if (/\b(ky niem|ki niem|cau chuyen|su kien|lich|sinh nhat|gio)\b/.test(normalized)) return null;
    if (!/\b(gia pha|trong cay|cay|ten)\b/.test(normalized) && !/^co\s+.+\s+khong$/.test(normalized) && !/^tim\s+/.test(normalized)) return null;
    // "ai tên X", "người tên X": người dùng nói rõ đó là tên, cho phép tên một chữ ("Lan", "Hùng").
    const explicitName = /\b(ai|nguoi|nguoi nao)\s+(co\s+)?ten\b/.test(normalized);

    let name = normalized
        .replace(/^trong gia pha co\s+/i, '')
        .replace(/^gia pha co\s+/i, '')
        .replace(/^trong cay co\s+/i, '')
        .replace(/^cay co\s+/i, '')
        .replace(/^co\s+/i, '')
        .replace(/^tim\s+/i, '')
        .replace(/^(ai|nguoi nao|nguoi)\s+(co\s+)?ten\s+(la\s+)?/i, '')
        .replace(/\s+co trong (gia pha|cay).*$/i, '')
        .replace(/\s+trong (gia pha|cay).*$/i, '')
        .replace(/\s+khong$/i, '')
        .trim();
    name = cleanExtractedPersonName(name);
    if (!name) return null;
    if (name.split(/\s+/).length < 2 && !explicitName) return null;

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
    const pairText = stripQuestionNoise(message);
    const pair = pairText.match(/^(.+?)\s+(?:với|voi|và|va)\s+(.+?)\s+(?:là gì của nhau|la gi cua nhau|ai là anh(?:\s+ai là em)?|ai la anh(?:\s+ai la em)?|ai lớn hơn|ai lon hon|ai nhỏ hơn|ai nho hon|có quan hệ gì|co quan he gi|quan hệ (?:thế nào|ra sao|gì)|quan he (?:the nao|ra sao|gi)|là họ hàng gì|la ho hang gi|có họ hàng gì không|co ho hang gi khong|có họ với nhau không|co ho voi nhau khong)(?:\s+(?:với nhau|voi nhau))?$/i);
    if (pair) {
        const side = (value) => (new RegExp('^' + SELF_WORD_PATTERN + '$', 'i').test(value.trim())
            ? { self: true, names: [] }
            : { self: false, names: makeNameAlternatives(value) });
        const left = side(pair[1]);
        const right = side(pair[2]);
        if (!(left.self && right.self)) {
            return {
                intent: 'compare_relationship',
                confidence: 0.9,
                entities: { personAName: left.names, personBName: right.names, personASelf: left.self, personBSelf: right.self },
            };
        }
    }
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
    const text = normalizeAccented(stripQuestionNoise(message));
    const core = text
        .replace(/^(ai là|ai la)\s+/, '')
        .replace(/\s+(là ai|la ai|tên gì|ten gi|tên là gì|ten la gi|gồm những ai|gom nhung ai|gồm ai|gom ai|là những ai|la nhung ai|có những ai|co nhung ai|là người nào|la nguoi nao)$/, '')
        .trim();

    let fragment = null;
    let count = false;
    const countMatch = core.match(new RegExp(`^${SELF_WORD_PATTERN}\\s+(?:có|co)\\s+(?:mấy|may|bao nhiêu|bao nhieu)\\s+(.+?)(?:\\s+(?:không|khong))?$`));
    if (countMatch) {
        fragment = countMatch[1];
        count = true;
    } else {
        const ownerMatch = core.match(new RegExp(`^(.+?)\\s+(?:(?:của|cua)\\s+)?${SELF_WORD_PATTERN}$`));
        if (ownerMatch) fragment = ownerMatch[1];
    }
    if (!fragment) return null;
    fragment = fragment.replace(/^(người|nguoi)\s+/, '');

    // Đúng một từ xưng hô; chuỗi "em của ông nội tôi" để parser biểu thức quan hệ xử lý.
    const { terms, rest } = splitKinshipTerms(fragment);
    if (terms.length !== 1 || rest.length) return null;
    const keys = terms[0].keys;
    return {
        intent: 'find_by_kinship',
        confidence: 0.9,
        entities: {
            kinshipTerm: keys[0],
            ambiguousTerms: keys.length > 1 ? keys : null,
            count,
            strict: Boolean(terms[0].strict),
        },
    };
}

// Cách gọi vợ/chồng của anh chị em cha mẹ hoặc của chính mình, theo cấu trúc quan hệ (không cần dữ liệu gia phả).
const SPOUSE_CALL_TERMS = {
    'vo|anh trai|cha': { term: 'bác gái (còn gọi là bác dâu)', phrase: 'vợ của anh trai bố' },
    'vo|em trai|cha': { term: 'thím', phrase: 'vợ của em trai bố' },
    'chong|chi gai|cha': { term: 'bác (bác rể)', phrase: 'chồng của chị gái bố' },
    'chong|em gai|cha': { term: 'dượng (chồng của cô)', phrase: 'chồng của em gái bố' },
    'vo|anh trai|me': { term: 'mợ', phrase: 'vợ của anh trai mẹ' },
    'vo|em trai|me': { term: 'mợ', phrase: 'vợ của em trai mẹ' },
    'chong|chi gai|me': { term: 'dượng (chồng của dì)', phrase: 'chồng của chị gái mẹ' },
    'chong|em gai|me': { term: 'dượng (chồng của dì)', phrase: 'chồng của em gái mẹ' },
    'vo|anh trai|toi': { term: 'chị dâu', phrase: 'vợ của anh trai bạn' },
    'vo|em trai|toi': { term: 'em dâu', phrase: 'vợ của em trai bạn' },
    'chong|chi gai|toi': { term: 'anh rể', phrase: 'chồng của chị gái bạn' },
    'chong|em gai|toi': { term: 'em rể', phrase: 'chồng của em gái bạn' },
};

// "Vợ của anh trai bố tôi thì gọi là gì?" -> bác gái.
function parseKinshipCallTerm(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    const match = normalized.match(/^(vo|chong) (?:cua )?(anh trai|em trai|chi gai|em gai) (?:cua )?(bo|cha|me|toi|minh)(?: toi| minh)? (?:goi la gi|goi bang gi|xung ho the nao|xung ho ra sao|la gi)$/);
    if (!match) return null;
    const owner = match[3] === 'bo' ? 'cha' : (match[3] === 'minh' ? 'toi' : match[3]);
    const entry = SPOUSE_CALL_TERMS[`${match[1]}|${match[2]}|${owner}`];
    if (!entry) return null;
    return { intent: 'kinship_call_term', confidence: 0.84, entities: { term: entry.term, phrase: entry.phrase } };
}

// "Ai quan hệ gần nhất với tôi?", "Người thân gần nhất của tôi là ai?"
function parseNearestRelatives(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (!/\b(quan he|ho hang|nguoi than)\b/.test(normalized) || !/\b(gan nhat|than nhat|gan gui nhat)\b/.test(normalized)) return null;
    if (!/\b(toi|minh|tui)\b/.test(normalized)) return null;
    return { intent: 'nearest_relatives', confidence: 0.8, entities: {} };
}

// "Nhánh của ông Bình có bao nhiêu người?", "Con cháu của X có bao nhiêu người cả trai lẫn gái?"
function parseDescendantCount(message) {
    const text = stripQuestionNoise(message);
    const match = text.match(/^(?:nhánh|nhanh|con cháu|con chau|hậu duệ|hau due|dòng dõi|dong doi)\s+(?:của|cua)\s+(.+?)\s+(?:có|co)\s+(?:bao nhiêu|bao nhieu|mấy|may)\s+(?:người|nguoi)(?:\s+.*)?$/i);
    if (!match) return null;
    // Bỏ phần mô tả thêm sau tên: "ông bình sinh năm 1940".
    const name = match[1].replace(/\s+(?:sinh|sanh|mất|mat)\s+(?:năm|nam)\s+\d{3,4}$/i, '').trim();
    if (!name || new RegExp('^' + SELF_WORD_PATTERN + '$', 'i').test(name)) return null;
    return { intent: 'descendant_count', confidence: 0.82, entities: { targetName: makeNameAlternatives(name) } };
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
    const match = text.match(new RegExp(`^(.+?)\\s+(?:là|la)\\s+(?:gì|gi)\\s+(?:của|cua)\\s+(${SELF_WORD_PATTERN}|con|em|cháu|chau)\\??$`, 'i'));
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

    const ORDER_WORDS = { hai: 2, ba: 3, tu: 4, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
    const filterOf = (word) => {
        const value = normalizeText(word);
        if (/^(nuoi)$/.test(value)) return { childFilter: 'adopted' };
        if (/^(rieng)$/.test(value)) return { childFilter: 'step' };
        if (/^(ruot)$/.test(value)) return { childFilter: 'biological' };
        if (/^(trai)$/.test(value)) return { childFilter: 'son' };
        if (/^(gai)$/.test(value)) return { childFilter: 'daughter' };
        if (/^(truong|ca|dau long|dau)$/.test(value)) return { order: 'first' };
        if (/^(ut)$/.test(value)) return { order: 'last' };
        const nth = value.match(/^thu (\d+|\S+)$/);
        if (nth) return { order: Number(nth[1]) || ORDER_WORDS[nth[1]] || null };
        return null;
    };
    // "Con nuôi/con trưởng/con thứ hai của X là ai"
    const typed = text.match(/^(?:ai\s+là\s+|ai\s+la\s+)?con\s+(nuôi|nuoi|riêng|rieng|ruột|ruot|trưởng|truong|cả|ca|út|ut|đầu lòng|dau long|thứ\s+\S+|thu\s+\S+)\s+(?:của|cua)\s+(.+?)(?:\s+(?:là ai|la ai|tên gì|ten gi|là những ai|la nhung ai|gồm những ai|gom nhung ai|gồm ai|gom ai))?$/i);
    if (typed && filterOf(typed[1]) && !new RegExp('^' + SELF_WORD_PATTERN + '$', 'i').test(typed[2].trim())) {
        return { intent: 'list_children', confidence: 0.88, entities: { targetName: makeNameAlternatives(typed[2]), ...filterOf(typed[1]) } };
    }
    // "X có mấy con nuôi/con trai"
    const countTyped = text.match(/^(.+?)\s+(?:có|co)\s+(?:mấy|may|bao nhiêu|bao nhieu)\s+(?:người\s+|nguoi\s+)?con(?:\s+(nuôi|nuoi|riêng|rieng|ruột|ruot|trai|gái|gai))?(?:\s+(?:không|khong))?$/i);
    if (countTyped && !new RegExp('^' + SELF_WORD_PATTERN + '$', 'i').test(countTyped[1].trim())) {
        return { intent: 'list_children', confidence: 0.88, entities: { targetName: makeNameAlternatives(countTyped[1]), count: true, ...(countTyped[2] ? filterOf(countTyped[2]) : {}) } };
    }

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
    // "Con của tôi", "Tôi có mấy người con": người hỏi là gốc, để tra xưng hô xử lý.
    if (new RegExp(`^${SELF_WORD_PATTERN}$`, 'i').test(String(target).trim())) return null;
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
    const isSelf = (value) => new RegExp('^' + SELF_WORD_PATTERN + '$', 'i').test(String(value || '').trim());
    // "X có mấy vợ/chồng"
    const count = text.match(/^(.+?)\s+(?:có|co)\s+(?:mấy|may|bao nhiêu|bao nhieu)\s+(?:người\s+|nguoi\s+)?(vợ|chồng|vo|chong)(?:\s+(?:không|khong))?$/i);
    if (count && !isSelf(count[1])) {
        return {
            intent: 'find_spouse',
            confidence: 0.86,
            entities: { spouseType: normalizeText(count[2]) === 'chong' ? 'husband' : 'wife', targetName: makeNameAlternatives(count[1]), count: true },
        };
    }
    // "Đinh Thị Mai lấy ai", "ông Hòa cưới ai": hỏi vợ/chồng của X (giới tính tự suy ra từ dữ liệu).
    const marry = text.match(/^(.+?)\s+(?:lấy|lay|cưới|cuoi|kết hôn với|ket hon voi)\s+(?:ai|người nào|nguoi nao)$/i);
    if (marry && !isSelf(marry[1])) {
        return { intent: 'find_spouse', confidence: 0.84, entities: { spouseType: 'wife', targetName: makeNameAlternatives(marry[1]) } };
    }
    // "Vợ lẽ/vợ cả/vợ hai của X là ai"
    const ranked = text.match(/^(?:ai\s+là\s+|ai\s+la\s+)?((?:vợ|vo)\s+(?:lẽ|le|bé|be|hai|ba|thứ\s+\S+|thu\s+\S+|sau|cả|ca|đầu|dau|trước|truoc))\s+(?:của|cua)\s+(.+?)(?:\s+(?:là ai|la ai|tên gì|ten gi|là những ai|la nhung ai|gồm những ai|gom nhung ai))?$/i);
    if (ranked && !isSelf(ranked[2])) {
        const rank = /\b(ca|dau|truoc)$/.test(normalizeText(ranked[1])) ? 'first' : 'secondary';
        return { intent: 'find_spouse', confidence: 0.86, entities: { spouseType: 'wife', rank, targetName: makeNameAlternatives(ranked[2]) } };
    }
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

// Tên người sau "với/của"; "tôi/mình" hoặc không có tên nghĩa là chính người đang hỏi.
function extractSubjectAfterPreposition(text) {
    const match = String(text || '').match(/(?:\bvới\b|\bvoi\b|\bcủa\b|\bcua\b)\s+(.+)$/i);
    const raw = match
        ? stripQuestionNoise(match[1])
            .replace(/\s+(là ai|la ai|là những ai|la nhung ai|gồm những ai|gom nhung ai|gồm ai|gom ai|là gì|la gi|tên gì|ten gi)$/i, '')
            .trim()
        : '';
    if (raw && CLAN_SUBJECTS.has(normalizeText(raw))) return { source: 'clan', targetName: [] };
    if (!raw || /^(tôi|toi|mình|minh|em|con|cháu|chau|tui)$/i.test(raw) || /^(toi|minh)$/.test(normalizeText(raw))) {
        return { source: 'current_member', targetName: [] };
    }
    return { source: 'named_person', targetName: makeNameAlternatives(raw) };
}

function parseSameGeneration(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    if (!/\b(cung doi|cung the he|ngang doi|ngang the he)\b/.test(normalized)) return null;
    return {
        intent: 'same_generation',
        confidence: 0.84,
        entities: extractSubjectAfterPreposition(text),
    };
}

function parseAncestors(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    if (!/\b(to tien|thuy to|tien nhan|ong to|cu to)\b/.test(normalized)) return null;
    if (/\b(gio|ngay gio|ky nhat)\b/.test(normalized)) return null;
    const subject = extractSubjectAfterPreposition(text);
    // "Thủy tổ dòng họ là ai", "Cụ tổ là ai": hỏi người lập dòng họ, không phải tổ tiên riêng của người hỏi.
    if (/\b(thuy to|ong to|cu to)\b/.test(normalized) && subject.source !== 'named_person') {
        return { intent: 'list_ancestors', confidence: 0.86, entities: { source: 'clan', targetName: [] } };
    }
    return {
        intent: 'list_ancestors',
        confidence: 0.84,
        entities: subject,
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

    if (new RegExp(`^${SELF_WORD_PATTERN}$`, 'i').test(withoutQuestion)) withoutQuestion = '';
    return {
        intent: 'find_generation',
        confidence: 0.84,
        entities: {
            targetName: withoutQuestion ? makeNameAlternatives(withoutQuestion) : [],
            source: withoutQuestion ? 'named_person' : 'current_member',
        },
    };
}

function parseAgeRanking(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    const oldest = /\b(lon tuoi nhat|cao tuoi nhat|gia nhat|nhieu tuoi nhat|cao nien nhat)\b/.test(normalized);
    const youngest = /\b(nho tuoi nhat|tre nhat|it tuoi nhat|be nhat)\b/.test(normalized);
    if (!oldest && !youngest) return null;
    return {
        intent: 'stats_count',
        confidence: 0.86,
        entities: { metric: oldest ? 'oldest_living' : 'youngest_living', generation: null },
    };
}

function parseStatsCount(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (/\bthuoc\s+(?:doi|the he)\b/.test(normalized) && /\bmay\b/.test(normalized)) return null;
    // "Tôi đời thứ mấy" hỏi đời của một người; "Tôi có mấy anh chị em/con" là tra xưng hô.
    if (/\b(doi thu may|the he thu may)\b/.test(normalized)) return null;
    // "X sinh năm bao nhiêu": hỏi năm sinh/mất của một người ("năm" không dấu trùng "nam" giới tính).
    if (/\b(sinh|mat|qua doi)\s+nam\b/.test(normalized) || /\bnam\s+(sinh|mat)\b/.test(normalized)) return null;
    if (/^(toi|minh|tui)\s+co\s+(may|bao nhieu)\s+/.test(normalized)) return null;
    const asksCount = /\b(co bao nhieu|bao nhieu|may|so luong|tong so|thong ke|dem)\b/.test(normalized);
    const inFamilyScope = /\b(gia pha|dong ho|ho toc|thanh vien|nguoi|doi|the he|chi|nhanh|nam|nu|con song|da mat|qua doi)\b/.test(normalized);
    if (!asksCount || !inFamilyScope) return null;

    const generationMatch = normalized.match(/\b(?:doi|doi thu|the he|the he thu)\s*(?:thu\s*)?(\d{1,3})\b/);
    const generation = generationMatch ? Number(generationMatch[1]) : null;
    const metric = /\b(da mat|qua doi|da khuat|tu tran)\b/.test(normalized)
        ? 'deceased_count'
        : /\b(con song|dang song|con tai the)\b/.test(normalized)
            ? 'living_count'
            : /\b(nam va nu|nam nu|bao nhieu nam|bao nhieu nu|may nam|may nu|gioi tinh)\b/.test(normalized)
                ? 'gender_count'
                : /\b(chi|nhanh)\b/.test(normalized)
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

function detectEventWindow(normalized) {
    if (/\bhom nay\b/.test(normalized)) return 'today';
    if (/\bngay mai\b/.test(normalized)) return 'tomorrow';
    if (/\b(tuan sau|tuan toi)\b/.test(normalized)) return 'next_week';
    if (/\btuan nay\b/.test(normalized)) return 'week';
    if (/\b(thang sau|thang toi)\b/.test(normalized)) return 'next_month';
    if (/\bthang nay\b/.test(normalized)) return 'month';
    return null;
}

function parseEventsUpcoming(message) {
    // "lịch sử" là câu hỏi về dòng họ, không phải lịch sự kiện.
    const normalized = normalizeText(stripQuestionNoise(message)).replace(/\blich su\b/g, ' ');
    const asksEvent = /\b(su kien|ngay gio|lich|sap toi|sap co|sap dien ra|to chuc)\b/.test(normalized);
    const inClanScope = /\b(dong ho|ho toc|gia pha|nha tho|tu duong|le|gio)\b/.test(normalized);
    const eventNoun = /\b(su kien|lich|gio|ngay gio|ky nhat|sinh nhat|le hoi|le)\b/.test(normalized);
    const hasWhen = /\b(sap toi|sap co|sap dien ra|sap den|hom nay|ngay mai|tuan nay|tuan sau|tuan toi|thang nay|thang sau|thang toi|gan day|ke tiep|tiep theo)\b/.test(normalized);
    if (!(asksEvent && inClanScope) && !(eventNoun && hasWhen)) return null;

    const kind = /\b(gio|ky nhat)\b/.test(normalized)
        ? 'death_anniversary'
        : /\bsinh nhat\b/.test(normalized)
            ? 'birthday'
            : null;
    return {
        intent: 'events_upcoming',
        confidence: 0.84,
        entities: { window: detectEventWindow(normalized), kind },
    };
}

function parseMemoriesStories(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (!/\b(ky niem|ki niem|cau chuyen|chuyen xua|hoi uc|gia truyen|ke chuyen)\b/.test(normalized)) return null;
    return {
        intent: 'memories_stories',
        confidence: 0.82,
        entities: {},
    };
}

const PERSON_FIELD_PATTERNS = [
    ['contact_info', /\b(so dien thoai|dien thoai|sdt|email|lien lac|zalo)\b/],
    ['death_info', /\b(mat nam nao|mat nam|nam mat|ngay mat|mat ngay|mat khi nao|qua doi|tu tran|mat luc nao)\b/],
    ['alive_info', /\b(con song khong|con song|con khong|da mat chua|mat chua|con tai the)\b/],
    ['age_info', /\b(bao nhieu tuoi|may tuoi|tuoi|tho bao nhieu)\b/],
    ['birth_info', /\b(sinh nam nao|sinh nam|nam sinh|ngay sinh|sinh ngay|sinh khi nao|sinh luc nao)\b/],
    ['hometown_info', /\b(que quan|que o dau|que)\b/],
    ['address_info', /\b(dia chi|song o dau|o dau)\b/],
    ['bio_info', /\b(tieu su|cuoc doi|la nguoi the nao|lam nghe gi)\b/],
];

// Từ hỏi trường thông tin (có dấu và không dấu), để cắt khỏi câu khi tách tên.
const PERSON_FIELD_WORDS = '(?:thọ bao nhiêu tuổi|tho bao nhieu tuoi|thọ bao nhiêu|tho bao nhieu|số điện thoại|so dien thoai|điện thoại|dien thoai|sđt|sdt|email|liên lạc|lien lac|zalo|sinh năm nào|sinh nam nao|sinh năm|sinh nam|năm sinh|nam sinh|ngày sinh|ngay sinh|sinh ngày|sinh ngay|mất năm nào|mat nam nao|mất năm|mat nam|năm mất|nam mat|ngày mất|ngay mat|mất khi nào|mat khi nao|qua đời|qua doi|còn sống không|con song khong|còn sống|con song|đã mất chưa|da mat chua|bao nhiêu tuổi|bao nhieu tuoi|mấy tuổi|may tuoi|quê quán|que quan|quê ở đâu|que o dau|quê|que|địa chỉ|dia chi|sống ở đâu|song o dau|tiểu sử|tieu su|cuộc đời|cuoc doi|ghi chú|ghi chu|thông tin|thong tin)';

function parsePersonInfo(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    const field = (PERSON_FIELD_PATTERNS.find(([, pattern]) => pattern.test(normalized)) || [null])[0];
    const asksOverview = /\s(là ai|la ai)$/i.test(text) || /^(giới thiệu|gioi thieu|cho tôi biết về|cho toi biet ve)\s+/i.test(text);
    const asksInfo = Boolean(field) || /\b(thong tin|ghi chu)\b/.test(normalized) || asksOverview;
    if (!asksInfo) return null;

    let target = text
        .replace(/^(cho\s+tôi\s+biết|cho\s+toi\s+biet|xem|hỏi|hoi|giới thiệu|gioi thieu)\s+(về\s+|ve\s+)?/i, '')
        .replace(new RegExp(`^${PERSON_FIELD_WORDS}\\s+(?:của|cua|về|ve)?\\s*`, 'i'), '')
        .replace(new RegExp(`\\s+${PERSON_FIELD_WORDS}.*$`, 'i'), '')
        .replace(/\s+(là ai|la ai|là gì|la gi|ở đâu|o dau|là năm nào|la nam nao|là ngày nào|la ngay nao|năm nào|nam nao|khi nào|khi nao|không|khong)$/i, '')
        .trim();
    if (/^(của|cua|về|ve)\s+/i.test(target)) target = target.replace(/^(của|cua|về|ve)\s+/i, '').trim();
    if (new RegExp(`^${SELF_WORD_PATTERN}$`, 'i').test(target)) target = '';
    const normalizedTarget = normalizeText(target);
    if (/\b(nha tho|tu duong|dong ho|gia pha|ho toc|truong ho|truong chi|thuy to|to tien)\b/.test(normalizedTarget)) return null;
    if (/(^|\s)(của|cua)(\s|$)/i.test(target)) return null;
    if (target) {
        const { terms, rest } = splitKinshipTerms(target);
        const onlySelfWords = rest.every((word) => /^(tôi|toi|mình|minh|tui|tớ)$/i.test(word));
        if (terms.length && onlySelfWords && !field) return null;
    }

    if (asksOverview && !field) {
        // "X là ai": X phải là tên người (không phải đại từ hay từ xưng hô) — "Bạn là ai", "Ông nội tôi là ai" đã có parser khác.
        if (!target || /^(bạn|ban|em|anh|chị|chi|ông ấy|bà ấy|người đó|người này|họ|ai)$/i.test(target)) return null;
        if (/\b(thuy to|to tien|dong ho|gia pha|nha tho|truong ho|ho toc|truong chi)\b/.test(normalizeText(target))) return null;
        const { terms, rest } = splitKinshipTerms(target);
        if (terms.length && !rest.length) return null;
        const tokens = target.split(/\s+/);
        if (tokens.length < 2 && !TITLE_WORDS.test(`${target} `)) return null;
    }

    return {
        intent: 'person_info',
        confidence: target ? 0.82 : 0.72,
        subtype: field || (asksOverview ? 'overview' : null),
        entities: target ? makeNameAlternatives(target) : [],
    };
}

function parseGeneralChat(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (/\b(ban|tro ly|ai)\s+(co the\s+)?(lam duoc|giup duoc|biet)\s+(nhung\s+)?gi\b|\bhuong dan\b.*\b(su dung|dung)\b|^ban lam duoc gi\b|\bco the lam gi\b/.test(normalized)) {
        return { intent: 'general_chat', confidence: 0.8, entities: { topic: 'capabilities' } };
    }
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

// "Nhà thờ họ ở đâu?", "Ai là trưởng họ?"
function parseClanInfo(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (/\b(nha tho|tu duong)\b/.test(normalized) && /\b(o dau|dia chi|nam o|cho nao|tai dau|nam dau)\b/.test(normalized)) {
        return { intent: 'clan_info', confidence: 0.88, entities: { field: 'hall' } };
    }
    if (/\b(truong ho|toc truong|truong toc|truong chi)\b/.test(normalized)) {
        return { intent: 'clan_info', confidence: 0.86, entities: { field: 'head' } };
    }
    // Chức vụ, thành tích, "dâu trưởng": gia phả chưa có trường dữ liệu này, trả lời rõ thay vì "chưa hiểu".
    const inClan = /\b(dong ho|ho toc|ho minh|ho nha|nha minh|nha toi|gia pha|dong toc)\b/.test(normalized);
    if (inClan && /\b(lam quan|quan to|chuc vu|chuc sac|thanh dat|noi tieng|lam to|giau nhat)\b/.test(normalized)) {
        return { intent: 'clan_info', confidence: 0.7, entities: { field: 'notable' } };
    }
    if (inClan && /\b(dau truong|dau ca|con dau truong)\b/.test(normalized)) {
        return { intent: 'clan_info', confidence: 0.7, entities: { field: 'eldest_daughter_in_law' } };
    }
    return null;
}

const ANNIVERSARY_TAIL = '(?:là\\s+|la\\s+|vào\\s+|vao\\s+|rơi vào\\s+|roi vao\\s+)?(?:ngày nào|ngay nao|khi nào|khi nao|bao giờ|bao gio|lúc nào|luc nao|hôm nào|hom nao|tháng nào|thang nao|ngày mấy|ngay may)';

// "Ngày giỗ của X là ngày nào?", "Giỗ cụ tổ là ngày nào?", "Giỗ ông nội tôi vào ngày nào?"
function parsePersonAnniversary(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    if (!/\b(gio|ky nhat)\b/.test(normalized)) return null;
    let match = text.match(new RegExp('(?:ngày\\s+giỗ|ngay\\s+gio|giỗ|gio|kỵ\\s+nhật|ky\\s+nhat)\\s+(?:của\\s+|cua\\s+)?(.+?)\\s+' + ANNIVERSARY_TAIL, 'i'));
    // Nói đảo: "bác Bình giỗ ngày nào", "ông nội tôi giỗ khi nào".
    if (!match) match = text.match(new RegExp('^(.+?)\\s+(?:giỗ|gio|kỵ\\s+nhật|ky\\s+nhat)\\s+' + ANNIVERSARY_TAIL + '$', 'i'));
    if (!match) return null;
    const subject = match[1].replace(/\s+(năm nay|nam nay|năm tới|nam toi|năm sau|nam sau)$/i, '').trim();
    const plain = normalizeText(subject);
    // "Ngày giỗ sắp tới là khi nào" hỏi danh sách sự kiện, không hỏi một người.
    if (!subject || /^(sap toi|tiep theo|ke tiep|gan nhat|nay|tiep)$/.test(plain)) return null;
    if (/^(cu to|ong to|thuy to|cu thuy to|ong ba to)$/.test(plain)) {
        return { intent: 'person_anniversary', confidence: 0.88, entities: { source: 'clan' } };
    }
    // "Giỗ tổ" thường là ngày lễ chung của họ: tìm sự kiện trước, không có mới lấy ngày giỗ thủy tổ.
    if (/^(to|ho|dong ho|to ho)$/.test(plain)) {
        return { intent: 'person_anniversary', confidence: 0.8, entities: { source: 'clan', preferEvent: 'giỗ tổ' } };
    }
    const withoutSelf = subject.replace(new RegExp('\\s+(?:của\\s+|cua\\s+)?' + SELF_WORD_PATTERN + '$', 'i'), '').trim();
    const { terms, rest } = splitKinshipTerms(withoutSelf);
    if (terms.length === 1 && !rest.length) {
        return { intent: 'person_anniversary', confidence: 0.86, entities: { source: 'kinship', kinshipTerm: terms[0].keys[0] } };
    }
    return { intent: 'person_anniversary', confidence: 0.84, entities: { source: 'named_person', targetName: makeNameAlternatives(subject) } };
}

// Từ chỉ sự kiện của họ (nhiều chữ để không nhầm họ "Lê" với "lễ").
const EVENT_LOOKUP_WORDS = /\b(hop ho|hop chi|hop mat|hop toc|gio to|le hoi|le gio|le mung tho|mung tho|tao mo|dai hoi|khanh thanh|trung tu|sinh hoat ho|tet ho|le tet|le cung)\b/;

// "Họp họ năm nay tổ chức khi nào?", "Lễ mừng thọ ông Bình vào ngày nào?"
function parseEventLookup(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    if (!/\b(khi nao|bao gio|ngay nao|luc nao|vao ngay|dien ra|o dau)\b/.test(normalized)) return null;
    if (!EVENT_LOOKUP_WORDS.test(normalized)) return null;
    const keyword = text
        .replace(/\s+(năm nay|nam nay|năm sau|nam sau|tháng này|thang nay|sắp tới|sap toi|lần tới|lan toi)(?=\s|$)/gi, ' ')
        .replace(/\s+(sẽ\s+|se\s+|được\s+|duoc\s+)?(tổ chức|to chuc|diễn ra|dien ra)(\s.*)?$/i, '')
        .replace(/\s+(là\s+|la\s+|vào\s+|vao\s+)?(khi nào|khi nao|bao giờ|bao gio|ngày nào|ngay nao|lúc nào|luc nao|ở đâu|o dau)(\s.*)?$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!keyword) return null;
    return { intent: 'event_lookup', confidence: 0.82, entities: { keyword } };
}

// "Đinh Văn Phúc là con ruột hay con nuôi?", "X có phải con nuôi không?"
function parseChildStatus(message) {
    const text = stripQuestionNoise(message);
    const normalized = normalizeText(text);
    let nameText = null;
    if (/^.+? (la )?con (ruot|nuoi|rieng)( hay| hoac)( la)? con (ruot|nuoi|rieng)$/.test(normalized)) {
        nameText = text.split(/\s+(?:là\s+|la\s+)?con\s+/i)[0];
    } else if (/^.+? co phai (la )?con (ruot|nuoi|rieng)( cua .+?)?( khong)?$/.test(normalized)) {
        nameText = text.split(/\s+(?:có phải|co phai)\s+/i)[0];
    }
    if (!nameText || new RegExp('^' + SELF_WORD_PATTERN + '$', 'i').test(nameText.trim())) return null;
    return { intent: 'child_status', confidence: 0.86, entities: { targetName: makeNameAlternatives(nameText.trim()) } };
}

// "Đời nào đông người nhất?"
function parseGenerationRanking(message) {
    const normalized = normalizeText(stripQuestionNoise(message));
    if (!/\b(doi|the he) nao (dong|nhieu)( nguoi)?( nhat)?\b/.test(normalized) && !/\b(doi|the he) (dong|nhieu nguoi) nhat\b/.test(normalized)) return null;
    return { intent: 'stats_count', confidence: 0.86, entities: { metric: 'largest_generation', generation: null } };
}

function parse(message) {
    const normalizedMessage = stripQuestionNoise(message);
    if (!normalizedMessage) {
        return { intent: 'unknown', confidence: 0, entities: {} };
    }

    const parsers = [
        parseSelfIdentity,
        parseClanInfo,
        parsePersonAnniversary,
        parseChildStatus,
        parseClanHistory,
        parsePersonExists,
        parseCompareRelationship,
        parseCallTermQuestion,
        parseKinshipCallTerm,
        parseRelationshipToCurrentUser,
        parseChildren,
        parseSpouse,
        parseNearestRelatives,
        parseDescendantCount,
        parseParents,
        parseKinshipLookup,
        parseAgeRanking,
        parseGenerationRanking,
        parseStatsCount,
        parseEventsUpcoming,
        parseMemoriesStories,
        parseSameGeneration,
        parseAncestors,
        parsePersonInfo,
        parseEventLookup,
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
