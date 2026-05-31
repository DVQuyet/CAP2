const assert = require('assert');
const {
    computeFamilyStats,
    generateFamilySummary,
} = require('../src/modules/chatbot/familySummaryService');

const graph = {
    clanId: 10,
    people: new Map([
        [1, { id: 1, clan_id: 10, display_name: 'Ông A', generation: 1, birth_date: '1930-01-01', death_date: '1990-01-01' }],
        [2, { id: 2, clan_id: 10, display_name: 'Bà B', generation: 1, birth_date: '1935-01-01' }],
        [3, { id: 3, clan_id: 10, display_name: 'Cha C', generation: 2 }],
        [4, { id: 4, clan_id: 10, display_name: 'Con D', generation: 3, birth_date: '1990-01-01' }],
        [5, { id: 5, clan_id: 10, display_name: 'Nhánh rời E', generation: 1 }],
    ]),
    adjacency: new Map([
        [1, [{ to: 2, type: 'spouse' }, { to: 3, type: 'son' }]],
        [2, [{ to: 1, type: 'spouse' }]],
        [3, [{ to: 1, type: 'father' }, { to: 4, type: 'daughter' }]],
        [4, [{ to: 3, type: 'father' }]],
    ]),
};

const stats = computeFamilyStats(graph);
assert.strictEqual(stats.totalMembers, 5);
assert.strictEqual(stats.generations, 3);
assert.strictEqual(stats.disconnectedBranches, 2);
assert.strictEqual(stats.largestBranch.size, 4);
assert.strictEqual(stats.oldestAncestor.id, 1);

const summary = generateFamilySummary({ clanId: 10, graph });
assert.strictEqual(summary.stats.totalMembers, 5);
assert(summary.summary.includes('5 thành viên'));
assert(summary.summary.includes('2 nhánh rời'));

console.log('chatbot.familySummary.test.js passed');
