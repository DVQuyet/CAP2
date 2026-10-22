// Chuẩn hóa cách gõ thực tế trước khi phân tích câu hỏi: lời xã giao ("cho mình hỏi ... ạ"),
// viết tắt (a/c/e, ck/vk, bn, ko), vài lỗi gõ phổ biến. Không đổi tên riêng và không bỏ/thêm dấu cho phần còn lại.
//
// Nguyên tắc: thà bỏ sót một từ đệm còn hơn làm hỏng tên người ("Nguyễn Thị Tui", "Đinh Ko", "Trần Văn Với").

const { orderFromWord } = require('./kinshipBirthOrder');

const hasDiacritics = (value) => /[^\u0000-\u007f]/.test(String(value || ''));

// `\b` của JS chỉ hiểu ASCII nên không dùng được trước chữ như "đ"; dùng ranh giới theo Unicode.
const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';
const re = (source, flags = 'giu') => new RegExp(source, flags);

const isCapitalised = (token) => /^\p{Lu}/u.test(String(token || ''));
const lastToken = (text, end) => {
    const match = text.slice(0, end).match(/(\S+)\s*$/u);
    return match ? match[1] : null;
};

// Từ đệm đứng sau tên/họ lót: nếu token trước là họ lót thì phần cuối là tên người.
const NAME_PARTICLES = new Set(['văn', 'van', 'thị', 'thi', 'đình', 'dinh', 'hữu', 'huu', 'quốc', 'quoc', 'ngọc', 'ngoc', 'y', 'ê']);

// [mẫu, dạng có dấu, dạng không dấu, kiểu bảo vệ]
//   'lower'  : chỉ đổi khi token viết thường và token đứng trước không viết hoa (không phải một phần tên người)
//   'family' : chỉ đổi "nôi" -> "nội" ngay sau ông/bà/họ
const ABBREVIATIONS = [
    [re(`${B}a\\s*\\/\\s*c\\s*\\/\\s*e${E}`), 'anh chị em', 'anh chi em'],
    [re(`${B}a\\s*\\/\\s*e${E}`), 'anh em', 'anh em'],
    [re(`${B}c\\s*\\/\\s*e${E}`), 'chị em', 'chi em'],
    [re(`${B}bn${E}`), 'bao nhiêu', 'bao nhieu'],
    [re(`${B}ck${E}`), 'chồng', 'chong'],
    [re(`${B}vk${E}`), 'vợ', 'vo'],
    [re(`${B}e\\s+(gái|gai)${E}`), 'em $1'],
    [re(`${B}e\\s+(trai)${E}`), 'em $1'],
    [re(`${B}(ko|k0|hok)${E}`), 'không', 'khong', 'lower'],
    [re(`${B}tui${E}`), 'tôi', 'toi', 'lower'],
    [re(`${B}(nọi|nôi)${E}`), 'nội', 'noi', 'family'],
    // Lỗi phát âm l/n: chỉ sửa ngay sau ông/bà/họ và chỉ khi viết thường ("Bà Lội" là tên người).
    [re(`${B}lội${E}`), 'nội', 'noi', 'familyLower'],
    // Teencode chat: chỉ đổi khi viết thường, không đứng sau tên viết hoa hay họ lót (Văn, Thị...).
    [re(`${B}j${E}`), 'gì', 'gi', 'lower'],
    [re(`${B}(mik|mk)${E}`), 'mình', 'minh', 'lower'],
    [re(`${B}ng${E}`), 'người', 'nguoi', 'lower'],
    [re(`${B}sn${E}`), 'sinh năm', 'sinh nam', 'lower'],
    [re(`${B}qh${E}`), 'quan hệ', 'quan he', 'lower'],
    [re(`${B}vs${E}`), 'với', 'voi', 'lower'],
    [re(`${B}nhiu${E}`), 'nhiêu', 'nhieu', 'lower'],
    // Xưng hô Nam/Trung Bộ -> từ chuẩn. Chỉ đổi khi viết thường, hoặc viết hoa đầu câu và theo sau là "tôi/của".
    [re(`${B}(tía|tia)${E}`), 'bố', 'bo', 'kin'],
    [re(`${B}(má|bầm)${E}`), 'mẹ', 'me', 'kin'],
    [re(`${B}u(?=\\s+(?:tôi|toi|tui|của|cua|mình|minh))`), 'mẹ', 'me', 'kin'],
    // "ông cố (nội/ngoại)", "bà cố" -> cụ ông/cụ bà. Chữ "cố" phải viết thường và có dấu (không dấu "co" lẫn với "cô").
    [re(`${B}(ông|bà)\\s+(cố)(?:\\s+(nội|ngoại))?${E}`), 'cụ $1 $3', null, 'ancestor'],
    // "ong co noi/ngoai", "ba co toi/minh/cua" (không dấu) = cụ. Chỉ khi cả câu không dấu, viết thường và có từ đi sau
    // như trên, tránh nhầm với "ông cô" / "bà cô" (em gái của ông/bà nội).
    [re(`${B}(ong|ba)\\s+co(?=\\s+(?:noi|ngoai)${E})`), 'cu', null, 'plainCu'],
    [re(`${B}(ong|ba)\\s+co(?=\\s+(?:toi|minh|cua)${E})`), 'cu $1', null, 'plainCu'],
    // Lỗi chính tả/phương ngữ trong câu hỏi ngày tháng, chức danh.
    [re(`${B}lăm(?=\\s+(?:nào|nao))`), 'năm', 'nam', 'lower'],
    [re(`${B}(ngày|năm|khi|lúc|tháng|đời)\\s+lào${E}`), '$1 nào', null, 'phrase'],
    [re(`${B}dỗ${E}`), 'giỗ', 'gio', 'lower'],
    [re(`${B}chưởng(?=\\s+(?:họ|chi|tộc))`), 'trưởng', null, 'phrase'],
    [re(`${B}mất\\s+giỗ${E}`), 'giỗ', null, 'phrase'],
];

const SELF_WORDS = new Set(['tôi', 'toi', 'tui', 'mình', 'minh', 'của', 'cua']);
// Câu hỏi về vai vế: "vai vế gì với tôi" = "là gì của tôi".
const VAI_VE = re(`${B}(?:(?:là|la)\\s+)?vai\\s+(?:vế|ve)\\s+(?:(?:gì|gi|thế nào|the nao|ra sao)\\s+)?(?:với|voi|đối với|doi voi)\\s+(tôi|toi|mình|minh|tui)${E}`, 'iu');

// Lời xã giao ở đầu câu. "Hỏi" đứng một mình có thể là tên người nên chỉ bỏ các cụm rõ nghĩa.
const LEADING_POLITE = re(
    `^\\s*(?:(?:xin\\s+)?cho\\s+(?:mình|minh|tôi|toi|em|con|cháu|chau|tui|tớ)?\\s*(?:hỏi|hoi)(?:\\s+(?:chút|chut|xíu|xiu|một câu|mot cau|tí|ti))?|xin\\s+(?:hỏi|hoi)|(?:mình|minh|tôi|toi|em|con|cháu|chau|tui)\\s+(?:muốn|muon)\\s+(?:hỏi|hoi)(?:\\s+(?:là|la))?|(?:hỏi|hoi)\\s+(?:chút|chut|xíu|xiu))${E}[\\s,:-]*`,
    'iu'
);

// Từ đệm ở cuối câu (chỉ bỏ khi viết thường nguyên bản).
const TAIL_PARTICLES = new Set(['ạ', 'nhé', 'nhe', 'nha', 'nhỉ', 'với', 'voi', 'vậy', 'vay', 'zậy', 'dzậy', 'z', 'v']);
// "a"/"ah" chỉ là từ đệm khi đứng sau từ để hỏi (tránh cắt tên như "Nguyễn Văn A").
const TAIL_AFTER_QUESTION = new Set(['a', 'ah']);
const QUESTION_WORDS = new Set(['ai', 'gi', 'gì', 'nao', 'nào', 'không', 'khong', 'nhiêu', 'nhieu', 'đâu', 'dau', 'mấy', 'may', 'sao']);
// Câu ngắn (1 từ + từ đệm) vẫn được bỏ đệm nếu từ còn lại là từ để hỏi hoặc xưng hô.
const KNOWN_SHORT_WORDS = new Set([
    ...QUESTION_WORDS,
    'bác', 'bac', 'chú', 'chu', 'cô', 'co', 'dì', 'di', 'cậu', 'cau', 'mợ', 'mo', 'thím', 'thim', 'ông', 'ong', 'bà', 'ba',
    'anh', 'chị', 'chi', 'em', 'cha', 'mẹ', 'me', 'bố', 'bo', 'má', 'ma', 'con', 'cháu', 'chau', 'vợ', 'vo', 'chồng', 'chong',
]);

const stripMarks = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

// Câu kể chuyện dài ("nhà tôi ở bên nhánh bác hai mà lâu ngày ... không biết cụ Hòa là gì của tôi"):
// giữ lại mệnh đề cuối có mẫu câu hỏi rõ ràng. Chỉ làm với câu từ 9 chữ trở lên và từ nối viết thường.
const NARRATIVE_CONNECTOR = re(`${B}(?:không biết|ko biết|khong biet|để biết|de biet|xem|thế|vậy thì|vậy)${E}\\s+`);
const CLEAR_QUESTION = /\b(la ai|la gi|ten gi|ten la gi|bao nhieu|may|nao|o dau|vai ve|quan he gi|the nao|co khong)\b/;

function stripNarrative(text) {
    if (text.split(' ').length < 9) return text;
    const matches = [...text.matchAll(NARRATIVE_CONNECTOR)];
    for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index];
        if (match[0] !== match[0].toLowerCase()) continue;
        const prev = lastToken(text, match.index);
        if (prev && (isCapitalised(prev) || NAME_PARTICLES.has(prev.toLowerCase()))) continue;
        const tail = text.slice(match.index + match[0].length).trim();
        // Vế hỏi còn chỉ vào người đã kể ở trên ("cụ đó tên là gì") thì không tự đứng được: giữ cả câu.
        if (tail.split(' ').slice(0, 2).some((word) => ['đó', 'ấy', 'này', 'kia', 'nọ'].includes(word))) continue;
        if (tail.split(' ').length >= 3 && CLEAR_QUESTION.test(stripMarks(tail))) return tail;
    }
    return text;
}

// Thứ bậc kiểu Nam Bộ đi sau xưng hô ("chú út", "anh hai", "thím ba") không phải tên người và không đổi quan hệ.
const ORDER_WORDS = '(?:hai|ba|tư|năm|út|cả|trưởng|sáu|bảy|tám|chín|mười)';
// Thứ bậc được GIỮ LẠI (kinOrder) để chatbot lọc đúng chú/bác/cô... (xem kinshipBirthOrder.js), không còn bị bỏ hẳn.
const NOT_ORDER_FOLLOWER = new Set(['người', 'đời', 'tuổi', 'ngày', 'tháng', 'mươi', 'trăm', 'nghìn', 'con', 'cháu', 'anh', 'chị', 'em', 'nhà', 'họ', 'chi', 'tộc', 'nhánh', 'phòng', 'dòng', 'gia']);
// "năm" vừa là thứ bậc ("chú năm") vừa là năm tháng: chỉ nhận khi chữ đi sau không phải từ chỉ thời gian.
const NOT_NAM_FOLLOWER = new Set(['sinh', 'mất', 'nào', 'nay', 'ngoái', 'trước', 'sau', 'qua', 'tới', 'đó', 'ấy', 'vừa', 'xưa']);
// Từ Nam Bộ trong câu -> "hai" là con thứ nhất. "anh/chị hai", "mợ", "dượng" bản thân đã là cách gọi miền Nam.
const SOUTH_MARKER = re(`${B}(tía|má|bầm|dượng|mợ)${E}`, 'iu');
const SOUTH_KIN = new Set(['anh', 'chị', 'mợ', 'dượng']);
const KIN_WITH_ORDER = re(`${B}(bác|chú|cô|cậu|dì|mợ|thím|dượng|anh|chị|bac|chu|cau|di|mo|thim|duong|chi)\\s+(${ORDER_WORDS}|ut)${E}`, 'giu');
const KIN_AFTER = '(bác|chú|cô|cậu|dì|mợ|thím|dượng)';
const QUESTION_WORD = '(?:là ai|tên gì|tên là gì)';
const BARE_KIN_WHO = new RegExp(`^${KIN_AFTER}\\s+${QUESTION_WORD}(?:\\s+trong\\s+(?:họ|nhà|gia đình)(?:\\s+(?:mình|tôi))?)?$`, 'iu');
const BARE_KIN_CHILDREN = new RegExp(`^${KIN_AFTER}\\s+có\\s+(?:mấy|bao nhiêu)\\s+(?:người\\s+)?con(?:\\s+không)?$`, 'iu');
const BARE_KIN_SPOUSE = new RegExp(`^${KIN_AFTER}\\s+có\\s+(vợ|chồng)\\s+chưa$`, 'iu');

// Xưng hô miền Nam không kèm "của tôi": "dượng út tên gì" -> "dượng của tôi tên gì". Chỉ đổi khi cả câu đúng mẫu
// (không có tên riêng đi kèm) nên không ảnh hưởng tên người như "Nguyễn Văn Út".
function rewriteRegionalKinship(text, plain, info = {}, southHint = false) {
    let hadOrder = false;
    let result = text.replace(KIN_WITH_ORDER, (matched, kin, order, offset, whole) => {
        const word = String(order);
        if (word !== word.toLowerCase()) return matched;
        const prev = lastToken(whole, offset);
        if (prev && (isCapitalised(prev) || NAME_PARTICLES.has(prev.toLowerCase()))) return matched;
        const next = (whole.slice(offset + matched.length).match(/^\s+(\S+)/u) || [])[1];
        if (next && (/^\d/.test(next) || NOT_ORDER_FOLLOWER.has(next.toLowerCase()))) return matched;
        // "ut" không dấu chỉ là thứ bậc khi câu không dấu hoàn toàn; "ba/hai" không dấu quá dễ nhầm nên không xét.
        if (word === 'ut' && !plain) return matched;
        if (/^(?:hai|ba|tư|năm|sáu|bảy|tám|chín|mười|cả|trưởng)$/.test(word) && plain) return matched;
        if (word === 'năm' && next && NOT_NAM_FOLLOWER.has(next.toLowerCase())) return matched;
        hadOrder = true;
        if (!info.order) {
            const kinWord = kin.toLowerCase();
            info.order = orderFromWord(word, kinWord, southHint || SOUTH_KIN.has(kinWord));
        }
        return kin;
    });
    const punct = (result.match(/[?.!]*$/) || [''])[0];
    const body = result.slice(0, result.length - punct.length).trim();
    let match = body.match(BARE_KIN_WHO);
    if (match && (hadOrder || /^(dượng|mợ|thím)$/i.test(match[1]))) {
        const question = body.match(new RegExp(`${QUESTION_WORD}`, 'iu'))[0];
        return `${match[1]} của tôi ${question}${punct}`;
    }
    match = body.match(BARE_KIN_CHILDREN);
    if (match) return `con của ${match[1]} tôi là ai${punct}`;
    match = body.match(BARE_KIN_SPOUSE);
    if (match) return `${match[2].toLowerCase()} của ${match[1]} tôi là ai${punct}`;
    return result;
}

// Đuôi gọi bot ("vậy bot", "bot ơi") và "k" = "không" cuối câu hỏi có/không ("... có ai làm quan to k").
const VOCATIVE_TAIL = re('\\s+(?:vậy\\s+(?:bạn|bot)|(?:bạn|bot)\\s+ơi|bot)(?=[?.!]*$)', 'iu');

function expandLoneK(text, plain) {
    const match = text.match(/^(.*?)\s+k([?.!]*)$/su);
    if (!match) return text;
    const tokens = match[1].split(' ').filter(Boolean);
    const prev = tokens[tokens.length - 1] || '';
    const hasYesNoMarker = tokens.slice(0, -1).some((token) => ['có', 'co'].includes(token));
    if (tokens.length < 3 || !hasYesNoMarker || isCapitalised(prev) || NAME_PARTICLES.has(prev.toLowerCase())) return text;
    return `${match[1]} ${plain ? 'khong' : 'không'}${match[2]}`;
}

function stripTrailingParticles(text) {
    const match = text.match(/^(.*?)\s*([?.!]*)$/su);
    const punct = match[2];
    const tokens = match[1].split(' ').filter(Boolean);
    let stripped = false;
    while (tokens.length >= 2) {
        const last = tokens[tokens.length - 1];
        const prev = tokens[tokens.length - 2];
        const prevLower = prev.toLowerCase();
        const isLeadingKnown = tokens.length === 2 && KNOWN_SHORT_WORDS.has(prevLower);
        let strip = false;
        if (TAIL_AFTER_QUESTION.has(last)) {
            strip = QUESTION_WORDS.has(prevLower);
        } else if (TAIL_PARTICLES.has(last)) {
            // Token trước viết hoa (trừ từ hỏi/xưng hô ở đầu câu) hoặc là họ lót -> phần cuối là tên người.
            const nameLike = (isCapitalised(prev) && !isLeadingKnown) || NAME_PARTICLES.has(prevLower);
            strip = !nameLike;
        }
        if (!strip) break;
        // Còn đúng 1 từ thì chỉ bỏ khi đó là từ hỏi/xưng hô.
        if (tokens.length === 2 && !KNOWN_SHORT_WORDS.has(prevLower)) break;
        tokens.pop();
        stripped = true;
    }
    return stripped ? tokens.join(' ') + punct : text;
}

function normalizeCore(message, info) {
    let text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text) return text;
    const plain = !hasDiacritics(text);
    // Từ Nam Bộ phải xét trên câu gốc, trước khi "tía/má" bị đổi thành "bố/mẹ".
    const southHint = SOUTH_MARKER.test(text);

    for (const [pattern, accented, unaccented, guard] of ABBREVIATIONS) {
        text = text.replace(pattern, (...args) => {
            const matched = args[0];
            const offset = args[args.length - 2];
            const whole = args[args.length - 1];
            if (guard === 'lower' || guard === 'kin') {
                // Tên riêng viết hoa (Tui, Ko) hoặc đi sau tên viết hoa/họ lót (Đinh Ko, văn út) thì giữ nguyên.
                const prev = lastToken(whole, offset);
                const sentenceStart = !prev;
                if (matched !== matched.toLowerCase()) {
                    // Xưng hô viết hoa đầu câu ("Má tôi là ai") vẫn đổi nếu ngay sau là tôi/của.
                    const next = (whole.slice(offset + matched.length).match(/^\s+(\S+)/u) || [])[1];
                    if (!(guard === 'kin' && sentenceStart && next && SELF_WORDS.has(next.toLowerCase()))) return matched;
                }
                if (prev && (isCapitalised(prev) || NAME_PARTICLES.has(prev.toLowerCase()))) return matched;
            }
            if (guard === 'phrase' && matched !== matched.toLowerCase()) return matched;
            if (guard === 'ancestor' && args[2] !== 'cố') return matched;
            if (guard === 'plainCu') {
                const prev = lastToken(whole, offset);
                if (!plain || matched !== matched.toLowerCase() || (prev && isCapitalised(prev))) return matched;
            }
            if (guard === 'family' || guard === 'familyLower') {
                if (guard === 'familyLower' && matched !== matched.toLowerCase()) return matched;
                const prev = (lastToken(whole, offset) || '').toLowerCase();
                if (!['ông', 'ong', 'bà', 'ba', 'họ', 'ho'].includes(prev)) return matched;
            }
            const template = plain && unaccented ? unaccented : accented;
            return template.replace(/\$(\d)/g, (_, index) => args[Number(index)] || '');
        });
    }

    text = text.replace(VAI_VE, (matched, who) => (/[^\u0000-\u007f]/.test(matched) ? `là gì của ${who}` : `la gi cua ${who}`));
    // "vợ của anh trai bố tôi thì gọi là gì": "thì" đứng trước "là/gọi" chỉ là từ đệm.
    text = text.replace(/\s+thì(?=\s+(?:là|gọi|la|goi)\s)/g, '');
    text = stripNarrative(text);
    text = rewriteRegionalKinship(text, plain, info, southHint);

    // Chỉ bỏ lời xã giao khi vẫn còn nội dung câu hỏi.
    const withoutLead = text.replace(LEADING_POLITE, '');
    if (withoutLead && withoutLead.split(/\s+/).length >= 2) text = withoutLead;
    text = text.replace(VOCATIVE_TAIL, (matched, offset, whole) => {
        const rest = whole.slice(0, offset);
        const prev = lastToken(rest, rest.length);
        const isLower = matched === matched.toLowerCase();
        return isLower && rest.split(' ').length >= 3 && prev && !isCapitalised(prev) && !NAME_PARTICLES.has(prev.toLowerCase()) ? '' : matched;
    });
    text = expandLoneK(text, plain);
    text = stripTrailingParticles(text);

    return text.replace(/\s+/g, ' ').trim();
}

const normalizeTyping = (message) => normalizeCore(message, {});

// Như normalizeTyping nhưng kèm thứ bậc đã nhận ra: { text, kinOrder: { kin, word, kind, n, south } | null }.
function normalizeTypingDetailed(message) {
    const info = {};
    const text = normalizeCore(message, info);
    return { text, kinOrder: info.order || null };
}

module.exports = { normalizeTyping, normalizeTypingDetailed };
