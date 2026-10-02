// Bộ câu hỏi mẫu có đáp án để đo độ chính xác của chatbot (không cần DB hay LLM).
// Khi sửa bộ phân tích, chạy `npm test` để chắc không làm hỏng câu hỏi đang trả lời đúng.
const assert = require('assert');
const path = require('path');

const MALE = 1;
const FEMALE = 2;

// Gia phả mẫu, nhìn từ "tôi" (id 1, nam).
const people = new Map();
const adjacency = new Map();
function person(id, gender) {
    people.set(id, { id, gender, display_name: `P${id}` });
}
function edge(from, to, type) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ to, type });
}
function parentChild(parentId, childId) {
    const parent = people.get(parentId);
    const child = people.get(childId);
    edge(childId, parentId, parent.gender === MALE ? 'father' : 'mother');
    edge(parentId, childId, child.gender === MALE ? 'son' : 'daughter');
}
function siblings(olderId, youngerId) {
    const older = people.get(olderId);
    const younger = people.get(youngerId);
    edge(youngerId, olderId, older.gender === MALE ? 'older_brother' : 'older_sister');
    edge(olderId, youngerId, younger.gender === MALE ? 'younger_brother' : 'younger_sister');
}
function spouses(a, b) {
    edge(a, b, 'spouse');
    edge(b, a, 'spouse');
}

[[1, MALE], [2, MALE], [3, FEMALE], [4, MALE], [5, FEMALE], [6, MALE], [7, MALE], [8, FEMALE], [9, MALE],
    [10, MALE], [11, FEMALE], [12, FEMALE], [13, MALE], [14, FEMALE], [15, MALE], [16, MALE], [17, MALE],
    [20, MALE], [21, FEMALE], [22, MALE], [23, FEMALE], [24, FEMALE], [30, MALE], [31, FEMALE], [32, FEMALE], [33, FEMALE],
].forEach(([id, gender]) => person(id, gender));

spouses(2, 3); spouses(20, 21); spouses(30, 31); spouses(1, 12); spouses(4, 24); spouses(6, 32);
[20, 21].forEach((grandparent) => [22, 5, 2, 4, 23].forEach((child) => parentChild(grandparent, child)));
[30, 31].forEach((grandparent) => [6, 3, 7, 8].forEach((child) => parentChild(grandparent, child)));
[2, 3].forEach((parent) => [10, 1, 11].forEach((child) => parentChild(parent, child)));
// Thứ tự trong nhà nội: 22 > 5 > 2 > 4 > 23; nhà ngoại: 6 > 3 > 7 > 8; nhà mình: 10 > 1 > 11.
[[22, 5], [22, 2], [22, 4], [22, 23], [5, 2], [5, 4], [5, 23], [2, 4], [2, 23], [4, 23]].forEach(([a, b]) => siblings(a, b));
[[6, 3], [6, 7], [6, 8], [3, 7], [3, 8], [7, 8]].forEach(([a, b]) => siblings(a, b));
[[10, 1], [10, 11], [1, 11]].forEach(([a, b]) => siblings(a, b));
parentChild(4, 9); parentChild(24, 9);
parentChild(6, 33); parentChild(32, 33);
parentChild(10, 15);
parentChild(1, 13); parentChild(12, 13); parentChild(1, 14); parentChild(12, 14);
parentChild(13, 16);
parentChild(14, 17);

const enginePath = path.join(__dirname, '../src/modules/chatbot/relationshipEngine.js');
require.cache[require.resolve(enginePath)] = {
    id: enginePath,
    filename: enginePath,
    loaded: true,
    exports: { loadClanGraph: async () => ({ people, adjacency }) },
};

const intentParser = require('../src/modules/chatbot/intentParserService');
const { parseRelationshipExpression } = require('../src/modules/chatbot/relationshipQueryParser');
const { resolveKinshipReference } = require('../src/modules/chatbot/kinshipReferenceService');

// Câu hỏi xưng hô -> những người đúng trong gia phả mẫu ([] = không có ai).
const KINSHIP_CASES = [
    ['Bố tôi là ai?', [2]],
    ['Mẹ của tôi là ai?', [3]],
    ['Ông nội tôi là ai?', [20]],
    ['Bà nội của tôi', [21]],
    ['Ông ngoại của tôi tên gì?', [30]],
    ['Bà ngoại tôi', [31]],
    ['Chú tôi tên gì?', [4]],
    ['Bác của tôi là ai?', [5, 6, 22]],
    ['Bác trai của tôi', [6, 22]],
    ['Bác gái tôi', [5]],
    ['Cô của tôi là ai?', [5, 23]],
    ['Cậu của tôi là ai?', [6, 7]],
    ['Dì tôi là ai?', [8]],
    ['Thím tôi là ai?', [24]],
    ['Mợ của tôi', [32]],
    ['Anh trai tôi là ai?', [10]],
    ['Em gái của tôi', [11]],
    ['Anh chị em của tôi', [10, 11]],
    ['Vợ tôi là ai?', [12]],
    ['Con trai tôi', [13]],
    ['Con gái của tôi', [14]],
    ['Con của tôi gồm những ai?', [13, 14]],
    ['Cháu nội của tôi', [16]],
    ['Cháu ngoại tôi', [17]],
    ['Anh họ tôi là ai?', [9]],
    ['Chị họ của tôi', [33]],
    ['Con trai của chú tôi', [9]],
    ['Con của cậu tôi', [33]],
    ['Vợ của chú tôi', [24]],
    ['Con trai của anh trai tôi', [15]],
    ['Bố của mẹ tôi', [30]],
    ['Chồng của em gái tôi', []],
];

// Câu hỏi -> intent của bộ phân tích bằng luật (và metric với câu thống kê).
const INTENT_CASES = [
    ['Xin chào', 'general_chat'],
    ['cảm ơn nhé', 'general_chat'],
    ['Tôi là ai?', 'self_identity'],
    ['Dòng họ mình có lịch sử thế nào?', 'clan_history'],
    ['Nguồn gốc dòng họ từ đâu?', 'clan_history'],
    ['Sắp có sự kiện gì của dòng họ không?', 'events_upcoming'],
    ['Ngày giỗ sắp tới là khi nào?', 'events_upcoming'],
    ['Kể cho tôi kỷ niệm gia đình', 'memories_stories'],
    ['Kể chuyện xưa của dòng họ', 'memories_stories'],
    ['Đời thứ 3 có những ai?', 'find_generation'],
    ['Nguyễn Văn An là gì của tôi?', 'find_relationship'],
    ['Tôi nên gọi Nguyễn Văn Bình là gì?', 'find_relationship'],
    ['Vợ của Nguyễn Văn An là ai?', 'find_spouse'],
    ['Nguyễn Văn An có mấy con?', 'list_children'],
    ['Ông Nguyễn Văn An sinh năm nào?', 'person_info'],
    ['Gia phả có bao nhiêu người?', 'stats_count', 'member_count'],
    ['Đời thứ 3 có bao nhiêu người?', 'stats_count', 'member_count'],
    ['Dòng họ có bao nhiêu chi?', 'stats_count', 'branch_count'],
    ['Gia phả có mấy đời?', 'stats_count', 'generation_count'],
    ['Có bao nhiêu nam và nữ?', 'stats_count', 'gender_count'],
    ['Dòng họ có bao nhiêu người đã mất?', 'stats_count', 'deceased_count'],
    ['Bao nhiêu người còn sống?', 'stats_count', 'living_count'],
    ['Ai lớn tuổi nhất họ?', 'stats_count', 'oldest_living'],
    ['Ai trẻ nhất trong dòng họ?', 'stats_count', 'youngest_living'],
];

(async () => {
    const failures = [];

    for (const [question, expectedIds] of KINSHIP_CASES) {
        const result = await resolveKinshipReference({ clanId: 1, currentMemberId: 1, names: [question] });
        const actual = result?.status === 'resolved'
            ? [result.person.id]
            : result?.status === 'ambiguous'
                ? result.candidates.map((item) => item.id)
                : [];
        const ok = result !== null && JSON.stringify([...actual].sort((a, b) => a - b)) === JSON.stringify(expectedIds);
        if (!ok) failures.push(`[xưng hô] "${question}": mong ${JSON.stringify(expectedIds)}, nhận ${result ? JSON.stringify(actual) : 'không nhận ra cụm xưng hô'}`);
    }

    for (const [question, expectedIntent, expectedMetric] of INTENT_CASES) {
        const parsed = intentParser.parse(question);
        // Câu bộ luật không hiểu nhưng là cụm xưng hô sẽ được planner chuyển sang relationship_expression.
        const intent = parsed.intent === 'unknown' && !parseRelationshipExpression(question).needsClarification
            ? 'relationship_expression'
            : parsed.intent;
        if (intent !== expectedIntent || (expectedMetric && parsed.entities?.metric !== expectedMetric)) {
            failures.push(`[intent] "${question}": mong ${expectedIntent}${expectedMetric ? `/${expectedMetric}` : ''}, nhận ${intent}${parsed.entities?.metric ? `/${parsed.entities.metric}` : ''}`);
        }
    }

    const total = KINSHIP_CASES.length + INTENT_CASES.length;
    console.log(`chatbot eval: ${total - failures.length}/${total} câu đúng`);
    failures.forEach((failure) => console.log('  ✗', failure));
    assert.strictEqual(failures.length, 0, `${failures.length} câu trả lời sai`);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
