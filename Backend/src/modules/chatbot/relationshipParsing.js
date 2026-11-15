// Cửa vào chung cho parser biểu thức quan hệ.
//   CHATBOT_ACCENT_FIRST=1  -> text/relationshipParser.js (đọc chữ có dấu, câu không dấu trả nhiều cách đọc)
//   mặc định                -> relationshipQueryParser.js (bỏ dấu cả câu) cho tới khi danh sách khác biệt được duyệt (L14)
// pickRelationshipReading chọn cách đọc của câu không dấu bằng dữ liệu gia phả: các cách đọc ra cùng người thì
// trả lời, ra người khác nhau thì hỏi lại; không đoán.
const relationshipEngine = require('./relationshipEngine');
const legacyParser = require('./relationshipQueryParser');
const accentParser = require('./text/relationshipParser');

const accentFirst = () => /^(1|true|on)$/i.test(String(process.env.CHATBOT_ACCENT_FIRST || ''));
const parser = () => (accentFirst() ? accentParser : legacyParser);

const parseRelationshipExpression = (text) => parser().parseRelationshipExpression(text);
const parseNamedRelationshipExpression = (text) => parser().parseNamedRelationshipExpression(text);

const capitalizeFirst = (text) => text.charAt(0).toLocaleUpperCase('vi-VN') + text.slice(1);
const idsKey = (people) => people.map((item) => Number(item.id)).sort((a, b) => a - b).join(',');

// ast: kết quả parser. owner: tên người gốc khi câu hỏi về người khác ("ba cua Tran Van Nam"); bỏ trống = người hỏi.
// Trả ast đã chọn cách đọc, hoặc { ...ast, clarification, candidates } khi phải hỏi lại.
async function pickRelationshipReading(ast, { clanId, currentMemberId, owner = null } = {}) {
    const readings = ast?.readings || [];
    if (readings.length < 2 || !currentMemberId) return ast;

    const looked = [];
    for (const reading of readings) {
        const chain = await relationshipEngine.resolveKinshipChain(currentMemberId, reading.terms.slice().reverse(), { clanId });
        looked.push({ reading, people: chain.ok ? chain.last : [] });
    }
    const withPeople = looked.filter((item) => item.people.length);
    // Không cách đọc nào có người: giữ cách đọc đầu để luồng thường báo "chưa có thông tin".
    if (!withPeople.length) return ast;
    const chosen = { ...ast, ...withPeople[0].reading, readings: undefined };
    if (withPeople.every((item) => idsKey(item.people) === idsKey(withPeople[0].people))) return chosen;

    const whose = owner ? `của ${owner}` : 'của bạn';
    const described = withPeople.map((item) => `"${item.reading.label}" (${item.people.map((person) => person.name).join(', ')})`);
    const candidates = [...new Map(withPeople.flatMap((item) => item.people).map((item) => [Number(item.id), item.person || item])).values()];
    return {
        ...ast,
        label: withPeople.map((item) => item.reading.label).join(' / '),
        candidates,
        clarification: {
            success: true,
            intent: 'relationship_expression',
            answer: `Bạn muốn hỏi ${described.join(' hay ')} ${whose}? Gõ có dấu giúp tôi hiểu chính xác hơn.`,
            confidence: 0.5,
            needsClarification: true,
            suggestions: withPeople.map((item) => ({
                type: 'quick_question',
                text: `${capitalizeFirst(item.reading.label)} ${owner ? whose : 'của tôi'} là ai?`,
            })),
        },
    };
}

module.exports = {
    accentFirst,
    parseRelationshipExpression,
    parseNamedRelationshipExpression,
    pickRelationshipReading,
};
