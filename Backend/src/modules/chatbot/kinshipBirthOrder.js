// Lọc theo thứ bậc sinh ("chú út", "bác cả", "cô ba", "thím năm", "dượng hai").
//
// typingNormalizer ghi lại từ thứ bậc (kinOrder) thay vì bỏ hẳn; module này giữ nó trong một AsyncLocalStorage
// theo từng yêu cầu để relationshipEngine.findPeopleByKinshipTerm lọc kết quả đúng người.
//
// Quy ước (thứ hạng đếm trong CẢ nhóm anh chị em của cha/mẹ, kể cả chính cha/mẹ, theo ngày sinh rồi "con thứ"):
//   - "cả/trưởng" = lớn nhất, "út" = nhỏ nhất, luôn đúng ở mọi vùng.
//   - Số: Nam Bộ "hai" = thứ 1, "ba" = thứ 2, "tư" = thứ 3...; Bắc Bộ "hai" = thứ 2, "ba" = thứ 3...
//   - Dùng cách đếm Nam Bộ khi câu có từ Nam Bộ (tía, má, dượng, mợ, anh hai, chị hai). Ngược lại mơ hồ:
//     nếu dữ liệu chỉ cho đúng một cách hiểu có người thì trả lời, còn hai cách đều có người khác nhau thì hỏi lại.
//   - "thím/mợ/dượng X": tìm chú/cậu/cô/dì theo thứ bậc rồi lấy vợ/chồng của người đó.
const { AsyncLocalStorage } = require('node:async_hooks');

const store = new AsyncLocalStorage();

// Thứ hạng theo cách đếm Nam Bộ (hai = 1).
const SOUTH_RANK = { hai: 1, ba: 2, tư: 3, năm: 4, sáu: 5, bảy: 6, tám: 7, chín: 8, mười: 9 };
const SPOUSE_KINDS = new Set(['thím', 'mợ', 'dượng']);
const SIBLING_KINDS = new Set(['bác', 'chú', 'cô', 'cậu', 'dì', 'anh', 'chị']);

// order: { kin, word, kind: 'num' | 'eldest' | 'youngest', n, south } hoặc null.
function runWithKinOrder(order, fn) {
    const interp = order && order.kind === 'num' ? (order.south ? 'south' : 'both') : 'any';
    return store.run({ order: order || null, interp, pinnedId: null }, fn);
}

function getKinOrderContext() {
    return store.getStore() || null;
}

function orderFromWord(word, kin, southHint) {
    const text = String(word || '').toLowerCase();
    if (text === 'út') return { kin, word: text, kind: 'youngest', n: null, south: false };
    if (text === 'cả' || text === 'trưởng') return { kin, word: text, kind: 'eldest', n: null, south: false };
    const n = SOUTH_RANK[text];
    if (!n) return null;
    return { kin, word: text, kind: 'num', n, south: Boolean(southHint) };
}

// "chú", "chú ruột", "anh trai" -> từ gốc dùng để so với kin của câu hỏi; null nếu không phải xưng hô có thứ bậc.
function baseKin(termKey) {
    const first = String(termKey || '').split(' ')[0];
    return SPOUSE_KINDS.has(first) || SIBLING_KINDS.has(first) ? first : null;
}

function cmpNullable(a, b) {
    return typeof a === 'number' && typeof b === 'number' ? a - b : 0;
}

// Nhóm anh chị em (cùng cha hoặc cùng mẹ) của một người, sắp từ lớn đến nhỏ.
// Dùng lại KinshipGraph.compareSiblingSeniority: ngày sinh chắc chắn trước, rồi "con thứ" trong cùng gia đình.
function siblingGroup(graph, personId) {
    const kinship = graph.kinship;
    if (!kinship) return [Number(personId)];
    const ids = new Set([Number(personId)]);
    for (const parentId of kinship.parentIds(personId, 'blood')) {
        for (const childId of kinship.childIds(parentId, 'blood')) ids.add(Number(childId));
    }
    return [...ids].sort((a, b) => {
        const seniority = kinship.compareSiblingSeniority(a, b);
        if (seniority) return seniority;
        const pa = graph.people.get(a);
        const pb = graph.people.get(b);
        return cmpNullable(Number(pa?.display_order), Number(pb?.display_order)) || a - b;
    });
}

function rankIn(graph, personId) {
    const group = siblingGroup(graph, personId);
    return { rank: group.indexOf(Number(personId)) + 1, size: group.length };
}

function rankMatches(order, rank, size, interp) {
    if (size < 2) return false;
    if (order.kind === 'eldest') return rank === 1;
    if (order.kind === 'youngest') return rank === size;
    const south = rank === order.n;
    const north = rank === order.n + 1;
    if (interp === 'south') return south;
    if (interp === 'north') return north;
    return south || north;
}

// Người "đứng tên" thứ bậc: chính người đó, hoặc (thím/mợ/dượng) vợ/chồng của họ.
function anchorIdsOf(graph, termKey, person) {
    if (SPOUSE_KINDS.has(baseKin(termKey))) {
        return graph.kinship ? graph.kinship.spouseIds(person.id).map(Number) : [];
    }
    return [Number(person.id)];
}

// Lọc kết quả findPeopleByKinshipTerm theo thứ bậc. Khi còn người ruột thì bỏ bác/chú/cô họ (câu "chú út" là chú ruột).
function filterByKinOrder(graph, termKey, matches, order, { interp = 'both', pinnedId = null } = {}) {
    if (!order || baseKin(termKey) !== order.kin) return matches;
    const kept = matches.filter((match) => anchorIdsOf(graph, termKey, match.person).some((anchorId) => {
        if (pinnedId) return Number(anchorId) === Number(pinnedId);
        const { rank, size } = rankIn(graph, anchorId);
        return rankMatches(order, rank, size, interp);
    }));
    const close = kept.filter((match) => !/(^|\s)họ(\s|$)/.test(String(match.label || '')));
    return close.length ? close : kept;
}

// Gom người đứng tên của kết quả đã lọc (để hỏi lại), kèm thứ hạng trong nhóm anh chị em.
function anchorsOfMatches(graph, termKey, matches) {
    const seen = new Map();
    for (const match of matches) {
        for (const anchorId of anchorIdsOf(graph, termKey, match.person)) {
            if (seen.has(anchorId)) continue;
            const person = graph.people.get(anchorId);
            if (person) seen.set(anchorId, { person, ...rankIn(graph, anchorId) });
        }
    }
    return [...seen.values()];
}

// "chú" -> "chú út" khi câu hỏi có thứ bậc cho đúng xưng hô đó (dùng trong câu trả lời).
function labelWithOrder(label) {
    const order = getKinOrderContext()?.order;
    return order && String(label || '') === order.kin ? `${order.kin} ${order.word}` : label;
}

module.exports = {
    labelWithOrder,
    runWithKinOrder,
    getKinOrderContext,
    orderFromWord,
    baseKin,
    filterByKinOrder,
    anchorsOfMatches,
    rankIn,
};
