const assert = require('assert');
const path = require('path');

// Đồ thị mẫu:
// 1 (tôi) -- father --> 2, mother --> 3
// 2 có em trai 4 (chú), chị gái 5 (cô/bác gái)
// 3 có anh trai 6 và em trai 7 (đều là cậu), em gái 8 (dì)
// 4 có con trai 9 (anh/em họ)
const people = new Map([1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => [id, { id, display_name: `P${id}` }]));
const adjacency = new Map([
    [1, [{ to: 2, type: 'father' }, { to: 3, type: 'mother' }]],
    [2, [{ to: 4, type: 'younger_brother' }, { to: 5, type: 'older_sister' }]],
    [3, [{ to: 6, type: 'older_brother' }, { to: 7, type: 'younger_brother' }, { to: 8, type: 'younger_sister' }]],
    [4, [{ to: 9, type: 'son' }]],
]);

const enginePath = path.join(__dirname, '../src/modules/chatbot/relationshipEngine.js');
require.cache[require.resolve(enginePath)] = {
    id: enginePath,
    filename: enginePath,
    loaded: true,
    exports: { loadClanGraph: async () => ({ people, adjacency }) },
};

const { resolveKinshipReference } = require('../src/modules/chatbot/kinshipReferenceService');
const { edgeMatches } = require('../src/modules/chatbot/relationshipExpressionResolver');
const intentParser = require('../src/modules/chatbot/intentParserService');

// Khớp cạnh phải phân biệt giới tính và thứ bậc.
assert.strictEqual(edgeMatches('older_brother', 'older_brother'), true);
assert.strictEqual(edgeMatches('younger_sister', 'older_brother'), false);
assert.strictEqual(edgeMatches('daughter', 'son'), false);
assert.strictEqual(edgeMatches('older_brother', 'brother'), true);
assert.strictEqual(edgeMatches('younger_brother', 'brother'), true);
assert.strictEqual(edgeMatches('older_sister', 'brother'), false);
assert.strictEqual(edgeMatches('child', 'son'), true, 'chưa rõ giới tính vẫn khớp');

(async () => {
    const ask = (names) => resolveKinshipReference({ clanId: 1, currentMemberId: 1, names });

    const chu = await ask(['Chú tôi']);
    assert.strictEqual(chu.status, 'resolved');
    assert.strictEqual(chu.person.id, 4);

    const cau = await ask(['của tôi', 'Cậu của tôi']);
    assert.strictEqual(cau.status, 'ambiguous', 'cậu gồm cả anh và em trai của mẹ');
    assert.deepStrictEqual(cau.candidates.map((person) => person.id).sort(), [6, 7]);

    const di = await ask(['Dì tôi']);
    assert.strictEqual(di.status, 'resolved');
    assert.strictEqual(di.person.id, 8);

    const anhHo = await ask(['Anh họ tôi']);
    assert.strictEqual(anhHo.status, 'resolved');
    assert.strictEqual(anhHo.person.id, 9);

    const ongNoi = await ask(['Ông nội tôi']);
    assert.strictEqual(ongNoi.status, 'not_found');
    assert.strictEqual(ongNoi.label, 'ong noi');

    const plainName = await ask(['Nguyễn Văn Bình']);
    assert.strictEqual(plainName, null, 'tên người thường để bước tìm theo tên xử lý');

    const noSource = await resolveKinshipReference({ clanId: 1, currentMemberId: null, names: ['Chú tôi'] });
    assert.strictEqual(noSource, null);

    const statsCases = [
        ['Có bao nhiêu nam và nữ?', 'gender_count'],
        ['Dòng họ có bao nhiêu người đã mất?', 'deceased_count'],
        ['Bao nhiêu người còn sống?', 'living_count'],
        ['Ai lớn tuổi nhất họ?', 'oldest_living'],
        ['Ai trẻ nhất?', 'youngest_living'],
        ['Gia phả có bao nhiêu người?', 'member_count'],
    ];
    for (const [question, metric] of statsCases) {
        const parsed = intentParser.parse(question);
        assert.strictEqual(parsed.intent, 'stats_count', question);
        assert.strictEqual(parsed.entities.metric, metric, question);
    }

    console.log('chatbot.kinshipReference.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
