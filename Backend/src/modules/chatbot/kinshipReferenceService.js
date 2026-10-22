const relationshipEngine = require('./relationshipEngine');
const { parseRelationshipExpression } = require('./relationshipQueryParser');
const { resolveRelationshipExpression } = require('./relationshipExpressionResolver');
const { plainTermToKey, splitKinshipTerms } = require('./kinshipTermService');
const { getKinOrderContext } = require('./kinshipBirthOrder');

const SELF_WORDS = new Set(['tôi', 'toi', 'mình', 'minh', 'tui', 'tớ']);

// Nhận diện cụm xưng hô ("ông nội tôi", "cậu của tôi", "con trai của chị gái mẹ tôi")
// trong vị trí tên người và tra theo đồ thị gia phả, thay vì tìm người có tên như vậy.
// Trả về null nếu không có cụm xưng hô nào để bước tìm theo tên xử lý tiếp.
async function resolveKinshipReference({ clanId, currentMemberId, names = [] }) {
    const sourcePersonId = Number(currentMemberId);
    if (!Number.isFinite(sourcePersonId) || sourcePersonId <= 0) return null;

    const candidates = (Array.isArray(names) ? names : [names])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    for (const name of candidates) {
        let expression = parseRelationshipExpression(name);
        // Xưng hô ngoài bảng quan hệ cơ bản ("cụ bà tôi", "dượng tôi", "thím tôi"): tách bằng bảng từ xưng hô.
        let spoken = null;
        if (expression.needsClarification) {
            const split = splitKinshipTerms(name);
            const selfOnly = split.rest.length > 0 && split.rest.every((word) => SELF_WORDS.has(word));
            if (!split.terms.length || !selfOnly || split.terms.some((term) => term.keys.length !== 1)) continue;
            spoken = split.terms;
            expression = { ...expression, terms: spoken.map((term) => term.text) };
        }

        const graph = await relationshipEngine.loadClanGraph(clanId);
        // Tra theo nhãn xưng hô cấu trúc (anh em cùng cha khác mẹ, thứ bậc theo năm sinh...), nhãn hiển thị có dấu.
        const keys = spoken
            ? spoken.map((term) => term.keys[0]).reverse()
            : expression.terms.slice().reverse().map(plainTermToKey);
        const accentedLabel = keys.every(Boolean) ? keys.slice().reverse().join(' của ') : null;
        const structural = async () => {
            if (!accentedLabel || typeof relationshipEngine.resolveKinshipChain !== 'function') return null;
            const chain = await relationshipEngine.resolveKinshipChain(sourcePersonId, keys, { clanId });
            if (!chain.ok) return null;
            // Chỉ lấy họ hàng ruột khi người hỏi không nói "họ" ("chú tôi" không gồm chú họ).
            const lastKey = keys[keys.length - 1];
            let matches = chain.last.filter((item) => / họ$/.test(lastKey) || !/(^|\s)họ(\s|$)/.test(String(item.label || '')));
            // "cụ bà", "cụ ông": lọc theo giới tính.
            const gender = spoken && spoken[0].text === 'cụ bà' ? 2 : (spoken && spoken[0].text === 'cụ ông' ? 1 : null);
            if (gender) matches = matches.filter((item) => Number(item.person?.gender) === gender);
            const found = matches.map((item) => graph.people.get(Number(item.id))).filter(Boolean);
            if (found.length === 1) return { status: 'resolved', person: found[0], label: accentedLabel, expression };
            if (found.length > 1) return { status: 'ambiguous', candidates: found, label: accentedLabel, expression };
            return null;
        };
        if (spoken) {
            return (await structural()) || { status: 'not_found', label: spoken.map((term) => term.text).join(' của '), expression };
        }
        // Câu có thứ bậc ("thím út", "chú ba"): bảng cụm từ không biết thứ tự anh em nên đi đường cấu trúc,
        // nơi findPeopleByKinshipTerm đã lọc theo thứ bậc (kinshipBirthOrder).
        const ordering = getKinOrderContext()?.order;
        if (ordering && accentedLabel && keys.includes(ordering.kin)) {
            return (await structural()) || { status: 'not_found', label: accentedLabel, expression };
        }
        const resolved = resolveRelationshipExpression(expression, { sourcePersonId, graph });
        const label = accentedLabel || expression.terms.join(' của ');

        if (!resolved.ok) {
            return (await structural()) || { status: 'not_found', label, expression };
        }

        const people = resolved.candidatePersonIds
            .map((id) => graph.people.get(Number(id)))
            .filter(Boolean);
        if (people.length === 1) {
            return { status: 'resolved', person: people[0], label, expression };
        }
        return { status: 'ambiguous', candidates: people, label, expression };
    }

    return null;
}

module.exports = {
    resolveKinshipReference,
};
